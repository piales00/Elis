import json
import sys
from pathlib import Path
from time import perf_counter

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import three_lists as tl
from three_lists import config

BOOTSTRAP = 2000
INDEPENDENCE_BOOTSTRAP = 200
MIN_FINITE_SHARE = 0.99
GAP_BINS = (0, 20, 40, 60, 90)
FREQUENCY_CLASSES = ((0, 0), (1, 5), (6, 25), (26, 10**9))
SYNTHETIC_REPLICATES = 200
TAILS = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)


def gap_case(column):
    edges = list(GAP_BINS)
    parts = [f"WHEN {column} < {hi} THEN '{lo}-{hi}'" for lo, hi in zip(edges[:-1], edges[1:])]
    return f"CASE {' '.join(parts)} WHEN {column} IS NOT NULL THEN '{edges[-1]}+' END"


def frp_case(column):
    edges = config.FRP_CLASSES
    parts = [f"WHEN {column} < {hi} THEN '{lo}-{hi}'" for lo, hi in zip(edges[:-2], edges[1:-1])]
    return f"CASE {' '.join(parts)} ELSE '{edges[-2]}+' END"


def frequency_case(column):
    parts = [f"WHEN coalesce({column}, 0) BETWEEN {lo} AND {hi} THEN '{lo}-{hi if hi < 10**9 else 'max'}'"
             for lo, hi in FREQUENCY_CLASSES]
    return f"CASE {' '.join(parts)} END"


def prepare(con):
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE overpass AS
        WITH times AS (
            SELECT region, date,
                median(day_lst_min) FILTER (WHERE sensor = 'aqua') AS ta,
                median(day_lst_min) FILTER (WHERE sensor = 'snpp') AS ts,
                median(day_lst_min) FILTER (WHERE sensor = 'noaa20') AS tn
            FROM three WHERE has_day GROUP BY ALL
        )
        SELECT *, abs(ta - ts) AS gap_as, abs(ta - tn) AS gap_an, abs(ts - tn) AS gap_sn,
            abs(ta - ts) < {config.SIMULTANEOUS_MAX_MINUTES} AS simultaneous_as
        FROM times
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE weights AS
        SELECT region, month, 1 / p2 AS w FROM read_parquet('{config.INTERIM_DIR / "detection_probs.parquet"}')
    """)
    con.execute("""
        CREATE OR REPLACE TEMP TABLE units_x AS
        SELECT u.*, o.simultaneous_as, f.snpp_days, w.w
        FROM units u LEFT JOIN overpass o USING (region, date)
        LEFT JOIN cell_frequency f USING (cell_y, cell_x)
        JOIN weights w USING (region, month)
    """)


def stratified(con, keys, where, rng):
    group = ", ".join(keys)
    rows = con.execute(f"""
        SELECT {group}, a, s, n, count(*), sum(s * w) FROM units_x WHERE {where} GROUP BY ALL
    """).fetchall()
    strata, main_eq = {}, {}
    for row in rows:
        key = row[:len(keys)]
        a, s, n, k, weight = row[len(keys):]
        strata.setdefault(key, np.zeros(7))[tl.HISTORIES.index((a, s, n))] += k
        main_eq[key] = main_eq.get(key, 0.0) + (weight or 0.0)
    totals = np.zeros((BOOTSTRAP, 1))
    ind_totals = np.zeros(INDEPENDENCE_BOOTSTRAP)
    point = np.zeros(2)
    summary = dict(observed=0.0, n_aqua=0.0, n_snpp=0.0, n_noaa20=0.0, m_as=0.0, main_equivalent=0.0,
                   strata=len(strata), nonidentifiable=0, nonidentifiable_observed=0.0, chapman_strata=0.0)
    for key, x in strata.items():
        marg = tl.marginals(x)
        if np.any(x[3:7] == 0) or np.any(x[:3] == 0):
            summary["nonidentifiable"] += 1
            summary["nonidentifiable_observed"] += float(x.sum())
            continue
        fit_ind = tl.fit_mle(x, False)
        rep = rng.poisson(x, size=(BOOTSTRAP, 7))
        sat = rep.sum(axis=1) + tl.saturated_unseen(rep)
        finite = np.isfinite(sat)
        if finite.mean() < MIN_FINITE_SHARE:
            summary["nonidentifiable"] += 1
            summary["nonidentifiable_observed"] += float(x.sum())
            continue
        sat = np.where(finite, sat, np.median(sat[finite]))
        rep_ind = rng.poisson(fit_ind["mu"], size=(INDEPENDENCE_BOOTSTRAP, 7))
        ind = np.array([tl.fit_mle(r, False)["N"] for r in rep_ind])
        totals[:, 0] += sat
        ind_totals += ind
        point += [x.sum() + tl.saturated_unseen(x), fit_ind["N"]]
        summary["observed"] += float(x.sum())
        summary["n_aqua"] += float(marg["aqua"])
        summary["n_snpp"] += float(marg["snpp"])
        summary["n_noaa20"] += float(marg["noaa20"])
        m_as = float(tl.pair_overlap(x, 0, 1))
        summary["m_as"] += m_as
        summary["chapman_strata"] += float(tl.chapman(marg["aqua"], marg["snpp"], m_as))
        summary["main_equivalent"] += main_eq[key]
    pair_low, pair_high = np.nanquantile(totals[:, 0], TAILS)
    ind_low, ind_high = np.quantile(ind_totals, TAILS)
    summary.update(
        pairwise=float(point[0]), pairwise_low=float(pair_low), pairwise_high=float(pair_high),
        independence=float(point[1]), independence_low=float(ind_low), independence_high=float(ind_high),
        chapman_aqua_snpp_pooled=float(tl.chapman(summary["n_aqua"], summary["n_snpp"], summary["m_as"])))
    if summary["main_equivalent"]:
        for name in ("pairwise", "pairwise_low", "pairwise_high", "independence", "chapman_strata"):
            summary[f"{name}_over_main"] = summary[name] / summary["main_equivalent"]
    summary["pairwise_over_snpp"] = summary["pairwise"] / summary["n_snpp"] if summary["n_snpp"] else None
    return summary


def interactions_by(con, keys, where, rng):
    aliased = ", ".join(f"{k} AS key{i}" for i, k in enumerate(keys))
    group = ", ".join(f"key{i}" for i in range(len(keys)))
    out = {}
    for row in con.execute(f"""
        SELECT {group}, list(h ORDER BY h), list(k ORDER BY h) FROM (
            SELECT {aliased}, a::VARCHAR || s::VARCHAR || n::VARCHAR AS h, count(*) AS k
            FROM units_x WHERE {where} GROUP BY ALL
        ) GROUP BY ALL ORDER BY ALL
    """).fetchall():
        key = "/".join(str(v) for v in row[:len(keys)])
        hist = dict(zip(row[-2], row[-1]))
        x = np.array([hist.get(h, 0) for h in tl.HISTORY_NAMES], dtype=float)
        if np.any(x == 0):
            out[key] = dict(counts=x.astype(int).tolist(), identifiable=False)
            continue
        fit = tl.bootstrap_mle(x, True, BOOTSTRAP, rng)
        out[key] = dict(counts=x.astype(int).tolist(), identifiable=True, N=fit["N"], low=fit["low"],
                        high=fit["high"], N_over_snpp=fit["N"] / tl.marginals(x)["snpp"],
                        interactions={p: dict(value=float(v), low=float(lo), high=float(hi))
                                      for p, v, lo, hi in zip(tl.PAIR_NAMES, fit["interactions"],
                                                              fit["interactions_low"], fit["interactions_high"])})
    return out


def persistence(con):
    con.execute("""
        CREATE OR REPLACE TEMP TABLE passes AS
        SELECT t.region, t.date, t.year, t.cell_y, t.cell_x,
            bool_or(sensor = 'aqua' AND has_day) AS a_day, bool_or(sensor = 'snpp' AND has_day) AS s_day,
            bool_or(sensor = 'noaa20' AND has_day) AS n_day,
            bool_or(sensor = 'snpp' AND has_night) AS s_night, bool_or(sensor = 'noaa20' AND has_night) AS n_night,
            max(frp_max) FILTER (WHERE sensor = 'snpp') AS s_frp, max(frp_max) FILTER (WHERE sensor = 'noaa20') AS n_frp
        FROM three t JOIN days d USING (date) WHERE d.all_available AND t.year <= 2022
        GROUP BY ALL
    """)

    def coincidence(x, y, where="TRUE", extra=""):
        rows = con.execute(f"""
            SELECT {extra + ', ' if extra else ''}count(*) FILTER (WHERE {x}), count(*) FILTER (WHERE {y}),
                count(*) FILTER (WHERE {x} AND {y})
            FROM passes p LEFT JOIN overpass o USING (region, date) WHERE {where}
            {'GROUP BY ALL ORDER BY ALL' if extra else ''}
        """).fetchall()
        result = []
        for row in rows:
            *label, nx, ny, m = row
            result.append(dict(group=label[0] if label else "all", n_first=nx, n_second=ny, both=m,
                               p_second_given_first=m / nx if nx else None,
                               p_first_given_second=m / ny if ny else None,
                               sorensen=2 * m / (nx + ny) if nx + ny else None))
        return result

    return dict(
        snpp_noaa20_day=coincidence("s_day", "n_day"),
        snpp_noaa20_night=coincidence("s_night", "n_night"),
        snpp_noaa20_day_by_gap=coincidence("s_day", "n_day", extra=gap_case("o.gap_sn")),
        snpp_noaa20_day_by_snpp_frp=coincidence("s_day", "n_day", "s_frp IS NOT NULL", frp_case("s_frp")),
        aqua_to_snpp_by_gap=coincidence("a_day", "s_day", "o.gap_as IS NOT NULL", gap_case("o.gap_as")),
        aqua_to_noaa20_by_gap=coincidence("a_day", "n_day", "o.gap_an IS NOT NULL", gap_case("o.gap_an")),
        snpp_noaa20_by_year=coincidence("s_day", "n_day", extra="p.year"),
    )


def turnover_synthetic(rng):
    rows = []
    for persistence_share in (1.0, 0.8, 0.6):
        errors = []
        for _ in range(SYNTHETIC_REPLICATES):
            n = 20000
            present_first = rng.random(n) < 0.8
            stays = rng.random(n) < persistence_share
            present_second = np.where(present_first, stays, rng.random(n) < min(1.0, 4 * (1 - persistence_share)))
            size = rng.lognormal(0, 1, n)
            p_a, p_s, p_n = (1 - np.exp(-k * size) for k in (0.15, 1.2, 1.2))
            seen = np.column_stack([present_first & (rng.random(n) < p_a), present_first & (rng.random(n) < p_s),
                                    present_second & (rng.random(n) < p_n)])
            codes = seen @ np.array([4, 2, 1])
            x = np.array([np.sum(codes == h[0] * 4 + h[1] * 2 + h[2]) for h in tl.HISTORIES], dtype=float)
            union = float(np.sum(present_first | present_second))
            first = float(np.sum(present_first))
            sat = x.sum() + tl.saturated_unseen(x)
            marg = tl.marginals(x)
            chap = tl.chapman(marg["aqua"], marg["snpp"], tl.pair_overlap(x, 0, 1))
            errors.append((sat / union - 1, sat / first - 1, chap / first - 1, tl.fit_mle(x, False)["N"] / union - 1))
        e = np.array(errors)
        rows.append(dict(persistence=persistence_share, pairwise_vs_union=float(np.median(e[:, 0])),
                         pairwise_vs_first_time=float(np.median(e[:, 1])),
                         chapman_as_vs_first_time=float(np.median(e[:, 2])),
                         independence_vs_union=float(np.median(e[:, 3]))))
    return rows


def main():
    started = perf_counter()
    rng = np.random.default_rng(config.SEED)
    con = tl.connect()
    days = tl.availability(con, tl.MAIN_START, tl.EXTENDED_END)
    tl.register_days(con, days)
    tl.build_units(con)
    prepare(con)
    main_period = f"date <= DATE '{tl.MAIN_END}'"
    output = {}
    output["persistence"] = persistence(con)
    output["stratified_totals"] = {
        "region_year_month": stratified(con, ["region", "year", "month"], main_period, rng),
        "region_month_pooled_years": stratified(con, ["region", "month"], main_period, rng),
        "region_pooled": stratified(con, ["region"], main_period, rng),
        "region_frp_class": stratified(con, ["region", frp_case("frp")], main_period, rng),
        "region_month_frp_class": stratified(con, ["region", "month", frp_case("frp")], main_period, rng),
        "region_cell_frequency": stratified(con, ["region", frequency_case("snpp_days")], main_period, rng),
        "region_month_cell_frequency": stratified(con, ["region", "month", frequency_case("snpp_days")], main_period, rng),
        "simultaneous_aqua_snpp_days": stratified(con, ["region", "month"], f"{main_period} AND simultaneous_as", rng),
        "nonsimultaneous_aqua_snpp_days": stratified(con, ["region", "month"], f"{main_period} AND NOT simultaneous_as", rng),
        "drift_2023_2025": stratified(con, ["region", "year", "month"], f"date > DATE '{tl.MAIN_END}'", rng),
        "all_2018_2025": stratified(con, ["region", "year", "month"], "TRUE", rng),
    }
    output["interactions"] = {
        "region": interactions_by(con, ["region"], main_period, rng),
        "region_frp_class": interactions_by(con, ["region", frp_case("frp")], main_period, rng),
        "region_cell_frequency": interactions_by(con, ["region", frequency_case("snpp_days")], main_period, rng),
        "simultaneous_aqua_snpp_by_region": interactions_by(con, ["region"], f"{main_period} AND simultaneous_as", rng),
        "year": interactions_by(con, ["year"], "TRUE", rng),
        "season": interactions_by(con, ["CASE WHEN month BETWEEN 7 AND 11 THEN 'dry_jul_nov' ELSE 'wet_dec_jun' END"],
                                  main_period, rng),
    }
    con.execute("DROP TABLE units_x")
    tl.build_units(con, day_only=True)
    prepare(con)
    output["stratified_totals"]["day_only_region_year_month"] = stratified(con, ["region", "year", "month"], main_period, rng)
    output["interactions"]["day_only_region"] = interactions_by(con, ["region"], main_period, rng)
    output["turnover_synthetic"] = turnover_synthetic(rng)
    output["settings"] = dict(bootstrap=BOOTSTRAP, gap_bins=GAP_BINS, frp_classes=[str(v) for v in config.FRP_CLASSES],
                              frequency_classes=FREQUENCY_CLASSES, frequency_years=tl.FREQUENCY_YEARS,
                              simultaneous_max_minutes=config.SIMULTANEOUS_MAX_MINUTES,
                              method="Saturated pairwise log-linear MLE (closed form) and independence Poisson MLE; "
                                     "parametric bootstrap.", seconds=perf_counter() - started)
    (config.INTERIM_DIR / "bayes_sensitivity.json").write_text(json.dumps(output, indent=2, default=str) + "\n")
    for name, s in output["stratified_totals"].items():
        print(f"{name:32s} pairs/main={s.get('pairwise_over_main', float('nan')):.2f} "
              f"[{s.get('pairwise_low_over_main', float('nan')):.2f}, {s.get('pairwise_high_over_main', float('nan')):.2f}] "
              f"indep/main={s.get('independence_over_main', float('nan')):.2f} chapman/main={s.get('chapman_strata_over_main', float('nan')):.2f} "
              f"nonident={s['nonidentifiable']}/{s['strata']} ({s['nonidentifiable_observed']:.0f} cd)")
    print(f"Created: bayes_sensitivity.json ({perf_counter() - started:.0f} s)")


if __name__ == "__main__":
    main()
