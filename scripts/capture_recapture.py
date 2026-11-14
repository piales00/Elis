def chapman(n1, n2, m):
    from math import isfinite

    if not all(isfinite(x) and x >= 0 for x in (n1, n2, m)) or m > min(n1, n2):
        raise ValueError("Counts must be finite and nonnegative, with m <= min(n1, n2).")
    return (n1 + 1) * (n2 + 1) / (m + 1) - 1


def chapman_var(n1, n2, m):
    chapman(n1, n2, m)
    return (n1 + 1) * (n2 + 1) * (n1 - m) * (n2 - m) / ((m + 1) ** 2 * (m + 2))


def chapman_ci(n1, n2, m, level):
    from math import exp, log1p, sqrt
    from statistics import NormalDist

    if not 0 < level < 1:
        raise ValueError("The confidence level must be between zero and one.")
    estimate = chapman(n1, n2, m)
    observed = n1 + n2 - m
    unseen = estimate - observed
    variance = chapman_var(n1, n2, m)
    if unseen == 0:
        return float(observed), float(observed)
    factor = exp(NormalDist().inv_cdf((1 + level) / 2) * sqrt(log1p(variance / unseen**2)))
    return observed + unseen / factor, observed + unseen * factor


def simultaneous(day_aqua, day_snpp):
    from math import isfinite
    import config

    return (day_aqua is not None and day_snpp is not None
            and isfinite(day_aqua) and isfinite(day_snpp)
            and abs(day_aqua - day_snpp) < config.SIMULTANEOUS_MAX_MINUTES)


def bridge_ratio(aqua, terra):
    from math import isfinite

    if not isfinite(aqua) or not isfinite(terra) or aqua < 0 or terra <= 0:
        raise ValueError("Bridge requires finite nonnegative Aqua and positive Terra counts.")
    return aqua / terra


if __name__ == "__main__":
    import calendar
    import json
    from datetime import timedelta
    from math import isfinite
    from time import perf_counter

    import duckdb
    import numpy as np
    import pyarrow as pa

    import config

    started = perf_counter()
    rng = np.random.default_rng(config.SEED)
    years = list(range(config.CALIBRATION_YEARS[0], config.CALIBRATION_YEARS[1] + 1))
    months = list(range(1, len(calendar.month_name)))
    tails = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
    sampled_years = rng.integers(len(years), size=(config.BOOTSTRAP_N, len(years)))
    con = duckdb.connect(config={
        "autoinstall_known_extensions": "false",
        "autoload_known_extensions": "false",
    })

    def write_table(name, rows):
        table = pa.Table.from_pylist(rows)
        con.register("output_rows", table)
        con.execute("COPY output_rows TO ? (FORMAT PARQUET)", [str(config.INTERIM_DIR / name)])
        con.unregister("output_rows")

    def excluded(sensor, day):
        return any(
            start <= day <= end
            for intervals in (config.OUTAGES, config.DEGRADED)
            for start, end in intervals.get(sensor, ())
        )

    def pivot(path, name):
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {name} AS
            SELECT region, date, year, month, cell_y, cell_x,
                bool_or(sensor = 'aqua') AS aqua,
                bool_or(sensor = 'terra') AS terra,
                bool_or(sensor = 'snpp') AS snpp,
                bool_or(sensor = 'noaa20') AS noaa20,
                max(frp_max) FILTER (WHERE sensor = 'aqua') AS aqua_frp,
                max(frp_max) FILTER (WHERE sensor = 'terra') AS terra_frp,
                max(frp_max) FILTER (WHERE sensor = 'snpp') AS snpp_frp
            FROM read_parquet(?)
            GROUP BY region, date, year, month, cell_y, cell_x
        """, [str(path)])

    def pair_counts(table, sensor, simultaneous_only):
        return con.execute(f"""
            SELECT c.region, c.year, c.month,
                count(*) FILTER (WHERE c.{sensor}),
                count(*) FILTER (WHERE c.snpp),
                count(*) FILTER (WHERE c.{sensor} AND c.snpp)
            FROM {table} c JOIN availability a USING (date)
            JOIN paired_overpasses o USING (region, date)
            WHERE (NOT ? OR o.simultaneous) AND a.{sensor}_available AND a.snpp_available
                AND c.year BETWEEN ? AND ?
            GROUP BY c.region, c.year, c.month
        """, [simultaneous_only, *config.CALIBRATION_YEARS]).fetchall()

    def calibrate(table, simultaneous_only=True):
        records, distributions = [], {}
        for sensor in ("aqua",):
            counts = {(r, y, mo): (n1, n2, m) for r, y, mo, n1, n2, m in pair_counts(table, sensor, simultaneous_only)}
            for region in config.REGIONS:
                for month in months:
                    support = [month]
                    pooled = "none"
                    for candidate, label in (
                        ([month], "none"),
                        (sorted({(month - 2) % len(months) + 1, month, month % len(months) + 1}), "neighbors"),
                        (months, "region"),
                    ):
                        support, pooled = candidate, label
                        annual = np.array([
                            np.sum([counts.get((region, year, mo), (0, 0, 0)) for mo in support], axis=0)
                            for year in years
                        ], dtype=np.int64)
                        n1, n2, m = map(int, annual.sum(axis=0))
                        if m >= config.MIN_RECAPTURES:
                            break
                    estimate = chapman(n1, n2, m)
                    if estimate == 0 or n1 == 0 or n2 == 0:
                        raise ValueError(f"Unidentifiable calibration: {region}/{month}/{sensor}.")
                    draws = annual[sampled_years].sum(axis=1)
                    totals = (draws[:, 0] + 1) * (draws[:, 1] + 1) / (draws[:, 2] + 1) - 1
                    if np.any(totals == 0) or np.any(draws[:, :2] == 0):
                        raise ValueError(f"Zero-probability bootstrap: {region}/{month}/{sensor}; no arbitrary floor applied.")
                    p1, p2 = draws[:, 0] / totals, draws[:, 1] / totals
                    low1, high1 = np.quantile(p1, tails)
                    low2, high2 = np.quantile(p2, tails)
                    records.append(dict(
                        region=region, month=month, sensor_pair=f"{sensor}_snpp",
                        n1=n1, n2=n2, m=m, N=estimate, p1=n1 / estimate, p2=n2 / estimate,
                        p1_low=float(low1), p1_high=float(high1),
                        p2_low=float(low2), p2_high=float(high2), pooled=pooled,
                        pooled_months=support, low_recaptures=m < config.MIN_RECAPTURES,
                    ))
                    distributions[(region, month, sensor)] = (p1, p2)
        return records, distributions

    cells_path = config.INTERIM_DIR / "cells.parquet"
    alltypes_path = config.INTERIM_DIR / "cells_alltypes.parquet"
    if not alltypes_path.exists():
        raise FileNotFoundError("Run .venv/bin/python scripts/cells.py --all-types first.")
    pivot(cells_path, "cells")
    bounds = dict((sensor, (start, min(end, config.LAST_DATA_DATE))) for sensor, start, end in con.execute(
        "SELECT sensor, min(date), max(date) FROM read_parquet(?) WHERE sensor IN ('aqua','terra','snpp','noaa20') GROUP BY sensor",
        [str(cells_path)]
    ).fetchall())
    bounds["aqua"] = (config.AQUA_START, bounds["aqua"][1])
    bounds["snpp"] = (config.VIIRS_START, min(bounds["snpp"][1], config.SNPP_END))
    if "noaa20" in bounds:
        bounds["noaa20"] = (config.SNPP_END + timedelta(days=1), bounds["noaa20"][1])
    availability = []
    day = min(start for start, _ in bounds.values())
    last_day = max(end for _, end in bounds.values())
    while day <= last_day:
        flags = {
            sensor: start <= day <= end and not excluded(sensor, day)
            for sensor, (start, end) in bounds.items()
        }
        flags.setdefault("noaa20", False)
        mode = (
            "both" if flags["aqua"] and flags["snpp"] else
            "snpp" if flags["snpp"] else "noaa20" if flags["noaa20"] else
            "aqua" if flags["aqua"] else
            "terra" if flags["terra"] else "unavailable"
        )
        availability.append(dict(
            date=day, year=day.year, month=day.month, mode=mode,
            excluded=excluded("aqua", day) or excluded("snpp", day),
            **{f"{sensor}_available": flag for sensor, flag in flags.items()},
        ))
        day += timedelta(days=1)
    con.register("availability", pa.Table.from_pylist(availability))
    con.create_function("is_simultaneous", simultaneous, ["DOUBLE", "DOUBLE"], "BOOLEAN", null_handling="special")
    con.execute("""
        CREATE TEMP TABLE paired_overpasses AS
        WITH times AS (
            SELECT region, date,
                max(day_lst_min) FILTER (WHERE sensor = 'aqua') AS aqua_time,
                max(day_lst_min) FILTER (WHERE sensor = 'snpp') AS snpp_time
            FROM read_parquet(?) GROUP BY region, date
        ), scans AS (
            SELECT region, date, median(scan_mean) AS snpp_scan
            FROM read_parquet(?) WHERE sensor = 'snpp' AND has_day
            GROUP BY region, date
        )
        SELECT *, abs(aqua_time - snpp_time) AS gap_minutes,
            is_simultaneous(aqua_time, snpp_time) AS simultaneous
        FROM times LEFT JOIN scans USING (region, date)
    """, [str(config.INTERIM_DIR / "overpass.parquet"), str(cells_path)])
    previous_records, _ = calibrate("cells", simultaneous_only=False)
    records, distributions = calibrate("cells")
    record_index = {(r["region"], r["month"], r["sensor_pair"]): r for r in records}
    write_table("detection_probs.parquet", records)
    probability_draws = [
        dict(region=region, month=month, sensor_pair=f"{sensor}_snpp", replicate=i,
             p1=float(p1[i]), p2=float(p2[i]))
        for (region, month, sensor), (p1, p2) in distributions.items()
        for i in range(config.BOOTSTRAP_N)
    ]
    write_table("detection_probability_replicates.parquet", probability_draws)
    def segment_counts(window=None):
        month_filter, day_limit = window or (0, 0)
        return con.execute("""
            WITH days AS (
                SELECT * FROM availability WHERE (? = 0 OR (month = ? AND day(date) <= ?))
            ), counts AS (
                SELECT c.region, c.year, c.month, a.mode,
                    count(*) FILTER (WHERE c.aqua AND a.aqua_available)::BIGINT AS n_aqua,
                    count(*) FILTER (WHERE c.snpp AND a.snpp_available)::BIGINT AS n_snpp,
                    count(*) FILTER (WHERE c.terra AND a.terra_available)::BIGINT AS n_terra,
                    count(*) FILTER (WHERE c.aqua AND c.snpp
                        AND a.aqua_available AND a.snpp_available)::BIGINT AS m,
                    count(*) FILTER (WHERE c.noaa20 AND a.noaa20_available)::BIGINT AS n_noaa20
                FROM cells c JOIN days a USING (date)
                GROUP BY c.region, c.year, c.month, a.mode
            ), segments AS (
                SELECT year, month, mode, count(*) AS days,
                    count(*) FILTER (WHERE excluded) AS excluded_days
                FROM days GROUP BY year, month, mode
            )
            SELECT r.region, s.*, coalesce(c.n_aqua, 0) AS n_aqua,
                coalesce(c.n_snpp, 0) AS n_snpp, coalesce(c.n_terra, 0) AS n_terra,
                coalesce(c.m, 0) AS m, coalesce(c.n_noaa20, 0) AS n_noaa20
            FROM segments s CROSS JOIN (SELECT unnest(?) AS region) r
            LEFT JOIN counts c USING (region, year, month, mode)
            ORDER BY region, year, month, mode
        """, [month_filter, month_filter, day_limit, list(config.REGIONS)]).fetchall()

    def fit_bridge(interval, with_bootstrap=True):
        bridge_years = list(range(interval[0], interval[1] + 1))
        sample = rng.integers(len(bridge_years), size=(config.BOOTSTRAP_N, len(bridge_years)))
        counts = {(r, y, mo): (na, nt) for r, y, mo, na, nt in con.execute("""
            SELECT c.region, c.year, c.month,
                count(*) FILTER (WHERE c.aqua), count(*) FILTER (WHERE c.terra)
            FROM cells c JOIN availability a USING (date)
            WHERE a.aqua_available AND a.terra_available AND c.year BETWEEN ? AND ?
            GROUP BY c.region, c.year, c.month
        """, list(interval)).fetchall()}
        result, draws = {}, {}
        for region in config.REGIONS:
            for month in months:
                annual = np.array([counts.get((region, y, month), (0, 0)) for y in bridge_years])
                na, nt = annual.sum(axis=0)
                ratio = bridge_ratio(float(na), float(nt))
                boot = annual[sample].sum(axis=1) if with_bootstrap else np.tile([na, nt], (config.BOOTSTRAP_N, 1))
                if np.any(boot[:, 1] == 0):
                    raise ValueError(f"Unidentifiable Terra bridge bootstrap: {region}/{month}")
                draws[(region, month)] = boot[:, 0] / boot[:, 1]
                lo, hi = np.quantile(draws[(region, month)], tails)
                result[(region, month)] = dict(region=region, month=month, ratio=ratio,
                    ratio_low=float(lo), ratio_high=float(hi), n_aqua=int(na), n_terra=int(nt))
        return result, draws

    bridge, bridge_draws = fit_bridge(config.TERRA_BRIDGE_YEARS)
    backcast_bridge, _ = fit_bridge(config.TERRA_BACKCAST_TRAIN_YEARS, with_bootstrap=False)
    write_table("terra_bridge.parquet", list(bridge.values()))
    write_table("terra_bridge_replicates.parquet", [
        dict(region=r, month=m, replicate=i, ratio=float(value))
        for (r, m), values in bridge_draws.items() for i, value in enumerate(values)
    ])

    ratio_year, ratio_months = config.SNPP_END.year, list(range(1, config.SNPP_END.month))
    ratio_counts = {(r, mo): (nv, nn) for r, mo, nv, nn in con.execute("""
        SELECT c.region, c.month, count(*) FILTER (WHERE c.snpp), count(*) FILTER (WHERE c.noaa20)
        FROM cells c JOIN availability a USING (date)
        WHERE a.snpp_available AND c.year = ? AND c.month IN (SELECT unnest(?))
        GROUP BY c.region, c.month
    """, [ratio_year, ratio_months]).fetchall()}
    month_sample = rng.integers(len(ratio_months), size=(config.BOOTSTRAP_N, len(ratio_months)))
    noaa20_ratio, noaa20_draws = [], {}
    for region in config.REGIONS:
        monthly = np.array([ratio_counts.get((region, mo), (0, 0)) for mo in ratio_months], dtype=float)
        if np.any(monthly[:, 1] == 0):
            raise ValueError(f"NOAA-20 ratio month without NOAA-20 cell-days: {region}")
        ratios = monthly[:, 0] / monthly[:, 1]
        boot = monthly[month_sample].sum(axis=1)
        noaa20_draws[region] = boot[:, 0] / boot[:, 1]
        lo, hi = np.quantile(noaa20_draws[region], tails)
        noaa20_ratio.append(dict(region=region, year=ratio_year, months=ratio_months,
            n_snpp=int(monthly[:, 0].sum()), n_noaa20=int(monthly[:, 1].sum()),
            ratio=float(monthly[:, 0].sum() / monthly[:, 1].sum()), ratio_low=float(lo), ratio_high=float(hi),
            monthly_ratio=[float(v) for v in ratios], cv=float(ratios.std(ddof=1) / ratios.mean())))
    noaa20_stable = all(r["cv"] <= config.N20_RATIO_MAX_CV for r in noaa20_ratio)
    noaa20_index = {r["region"]: r for r in noaa20_ratio}
    write_table("noaa20_ratio.parquet", noaa20_ratio)

    def project(region, year, month, mode, na, nv, nt, nn):
        probability = record_index[(region, month, "aqua_snpp")]
        p1, p2 = distributions[(region, month, "aqua")]
        if mode in ("both", "snpp"):
            source = "both" if mode == "both" and year < config.DRIFT_START_YEAR else "viirs_only"
            return nv / probability["p2"], nv / p2, source
        if mode == "noaa20":
            return nn * noaa20_index[region]["ratio"] / probability["p2"], nn * noaa20_draws[region] / p2, "viirs_only"
        if mode == "aqua":
            return na / probability["p1"], na / p1, "modis_only"
        return (nt * bridge[(region, month)]["ratio"] / probability["p1"],
                nt * bridge_draws[(region, month)] / p1, "modis_only")

    following = config.LAST_DATA_DATE + timedelta(days=1)
    partial = config.LAST_DATA_DATE if following.month == config.LAST_DATA_DATE.month else None
    segment_rows = segment_counts()
    dropped_months = set() if noaa20_stable else {(y, mo) for _, y, mo, mode, *_ in segment_rows if mode == "noaa20"}
    estimates, replicas, segments = {}, {}, []
    for region, year, month, mode, days, excluded_days, na, nv, nt, m, nn in segment_rows:
        if mode == "unavailable":
            raise ValueError(f"No available sensor for {year}-{month}; missing days cannot be zero-filled.")
        if (year, month) in dropped_months:
            continue
        key = (region, year, month)
        probability = record_index[(region, month, "aqua_snpp")]
        n1, n2 = na, nv
        direct = chapman(na, nv, m) if mode == "both" else None
        from_aqua = na / probability["p1"] if mode == "both" else None
        estimate, draws, source = project(region, year, month, mode, na, nv, nt, nn)
        low, high = np.quantile(draws, tails)
        low, high = min(float(low), estimate), max(float(high), estimate)
        observed = na + nv - m if mode == "both" else {"aqua": na, "snpp": nv, "terra": nt, "noaa20": nn}[mode]
        segments.append(dict(region=region, year=year, month=month, mode=mode,
                             days=days, excluded_days=excluded_days, n1=n1, n2=n2, m=m,
                             n_terra=nt, n_noaa20=nn, source=source, chapman_direct=direct, estimated_from_aqua=from_aqua,
                             observed_union=observed, estimated=estimate, est_low=float(low), est_high=float(high)))
        if key not in estimates:
            estimates[key] = dict(region=region, year=year, month=month, estimated=0.0,
                                  est_low=0.0, est_high=0.0, source=source,
                                  n1=0, n2=0, m=0, observed_union=0, excluded_days=0,
                                  availability_adjusted=False, mixed_availability=False,
                                  orbit_drift=year >= config.DRIFT_START_YEAR, segment_count=0,
                                  chapman_direct=None, estimated_from_aqua=None, n_noaa20=0,
                                  noaa20_bridge=False,
                                  partial_through=partial if partial and (year, month) == (partial.year, partial.month) else None)
            replicas[key] = np.zeros(config.BOOTSTRAP_N)
        row = estimates[key]
        for field, value in (("estimated", estimate), ("est_low", low), ("est_high", high),
                             ("n1", n1), ("n2", n2), ("m", m), ("observed_union", observed),
                             ("excluded_days", excluded_days), ("n_noaa20", nn)):
            row[field] += value
        for field, value in (("chapman_direct", direct), ("estimated_from_aqua", from_aqua)):
            if value is not None:
                row[field] = (row[field] or 0) + value
        row["segment_count"] += 1
        row["availability_adjusted"] |= excluded_days > 0
        row["mixed_availability"] = row["segment_count"] > 1
        row["noaa20_bridge"] |= mode == "noaa20"
        if source != row["source"]:
            row["source"] = "viirs_only" if year >= config.DRIFT_START_YEAR else "both"
        replicas[key] += draws
    for (region, year, month), row in estimates.items():
        if row["mixed_availability"]:
            low, high = np.quantile(replicas[(region, year, month)], tails)
            row["est_low"] = min(float(low), row["estimated"])
            row["est_high"] = max(float(high), row["estimated"])
    for year, month in sorted({(y, m) for _, y, m in estimates}):
        regional = [estimates[(region, year, month)] for region in config.REGIONS]
        draws = np.sum([replicas[(region, year, month)] for region in config.REGIONS], axis=0)
        row = dict(regional[0], region=config.NATIONAL)
        for field in ("estimated", "n1", "n2", "m", "observed_union"):
            row[field] = sum(r[field] for r in regional)
        for field in ("chapman_direct", "estimated_from_aqua"):
            values = [r[field] for r in regional if r[field] is not None]
            row[field] = sum(values) if values else None
        low, high = np.quantile(draws, tails)
        row["est_low"] = min(float(low), row["estimated"])
        row["est_high"] = max(float(high), row["estimated"])
        estimates[(config.NATIONAL, year, month)] = row
        replicas[(config.NATIONAL, year, month)] = draws
    write_table("estimates.parquet", list(estimates.values()))
    write_table("capture_segments.parquet", segments)
    write_table("estimate_replicates.parquet", [
        dict(region=region, year=year, month=month, replicate=i, estimated=float(value))
        for (region, year, month), draws in replicas.items()
        for i, value in enumerate(draws)
    ])
    window_rows = []
    if partial is not None:
        window = {}
        for region, year, month, mode, days, excluded_days, na, nv, nt, m, nn in segment_counts((partial.month, partial.day)):
            if (year, month) in dropped_months:
                continue
            window[(region, year)] = window.get((region, year), 0.0) + project(region, year, month, mode, na, nv, nt, nn)[0]
        for year in sorted({y for _, y in window}):
            window[(config.NATIONAL, year)] = sum(window[(r, year)] for r in config.REGIONS)
        window_rows = [dict(region=r, year=y, month=partial.month, through_day=partial.day, estimated=v)
                       for (r, y), v in sorted(window.items())]
        write_table("partial_window_estimates.parquet", window_rows)

    pivot(alltypes_path, "cells_alltypes")
    alltype_records, _ = calibrate("cells_alltypes")
    type_comparison = []
    for other in alltype_records:
        base = record_index[(other["region"], other["month"], other["sensor_pair"])]
        sensor = other["sensor_pair"].split("_")[0]
        n1, n2, m = con.execute(f"""
            SELECT count(*) FILTER (WHERE c.{sensor}),
                count(*) FILTER (WHERE c.snpp),
                count(*) FILTER (WHERE c.{sensor} AND c.snpp)
            FROM cells_alltypes c JOIN availability a USING (date)
            JOIN paired_overpasses o USING (region, date)
            WHERE o.simultaneous AND a.{sensor}_available AND a.snpp_available
                AND c.region = ? AND c.year BETWEEN ? AND ?
                AND c.month IN (SELECT unnest(?))
        """, [base["region"], *config.CALIBRATION_YEARS, base["pooled_months"]]).fetchone()
        comparable = chapman(n1, n2, m)
        type_comparison.append(dict(
            region=other["region"], month=other["month"], sensor_pair=other["sensor_pair"],
            N_type0=base["N"], N_alltypes=comparable, N_change_pct=100 * (comparable / base["N"] - 1),
            p1_type0=base["p1"], p1_alltypes=n1 / comparable,
            p2_type0=base["p2"], p2_alltypes=n2 / comparable,
            n1_alltypes=n1, n2_alltypes=n2, m_alltypes=m,
            independently_pooled_alltypes=other,
            pooled_type0=base["pooled"], pooled_alltypes=other["pooled"],
            months_type0=base["pooled_months"], months_alltypes=other["pooled_months"],
        ))
    frp_results = []
    for sensor in ("aqua",):
        for region in config.REGIONS:
            for month in months:
                for support, pooled in (
                    ([month], "none"),
                    (sorted({(month - 2) % len(months) + 1, month, month % len(months) + 1}), "neighbors"),
                    (months, "region"),
                ):
                    classes = []
                    for lower, upper in zip(config.FRP_CLASSES, config.FRP_CLASSES[1:]):
                        n1, n2, m = con.execute(f"""
                            SELECT count(*) FILTER (WHERE c.{sensor}),
                                count(*) FILTER (WHERE c.snpp),
                                count(*) FILTER (WHERE c.{sensor} AND c.snpp)
                            FROM cells c JOIN availability a USING (date)
                            JOIN paired_overpasses o USING (region, date)
                            WHERE o.simultaneous AND a.{sensor}_available AND a.snpp_available
                                AND c.region = ? AND c.year BETWEEN ? AND ?
                                AND c.month IN (SELECT unnest(?))
                                AND greatest(c.{sensor}_frp, c.snpp_frp) >= ?
                                AND greatest(c.{sensor}_frp, c.snpp_frp) < ?
                        """, [region, *config.CALIBRATION_YEARS, support, lower, upper]).fetchone()
                        classes.append(dict(lower=lower, upper=upper if isfinite(upper) else None,
                                            n1=n1, n2=n2, m=m, N=chapman(n1, n2, m),
                                            low_recaptures=m < config.MIN_RECAPTURES))
                    if all(c["m"] >= config.MIN_RECAPTURES or c["n1"] + c["n2"] == 0 for c in classes):
                        break
                counts = con.execute(f"""
                    SELECT count(*) FILTER (WHERE c.{sensor}),
                        count(*) FILTER (WHERE c.snpp),
                        count(*) FILTER (WHERE c.{sensor} AND c.snpp)
                    FROM cells c JOIN availability a USING (date)
                    JOIN paired_overpasses o USING (region, date)
                    WHERE o.simultaneous AND a.{sensor}_available AND a.snpp_available
                        AND c.region = ? AND c.year BETWEEN ? AND ?
                        AND c.month IN (SELECT unnest(?))
                """, [region, *config.CALIBRATION_YEARS, support]).fetchone()
                if tuple(sum(c[field] for c in classes) for field in ("n1", "n2", "m")) != counts:
                    raise ValueError("FRP classes do not partition the calibration records.")
                unstratified = chapman(*counts)
                stratified = sum(c["N"] for c in classes)
                frp_results.append(dict(region=region, month=month, sensor_pair=f"{sensor}_snpp",
                                        pooled=pooled, pooled_months=support, classes=classes,
                                        N_unstratified=unstratified, N_stratified=stratified,
                                        change_pct=100 * (stratified / unstratified - 1)))
    def error_summary(rows):
        valid = [r for r in rows if r["actual"] > 0]
        annual = {}
        for row in rows:
            totals = annual.setdefault(row["year"], [0.0, 0.0])
            totals[0] += row["predicted"]
            totals[1] += row["actual"]
        year_rows = [dict(year=y, predicted=p, actual=a,
                          error_pct=100 * (p / a - 1) if a else None)
                     for y, (p, a) in sorted(annual.items())]
        return dict(months=len(rows), zero_actual_months=len(rows) - len(valid),
                    monthly_mape=float(np.mean([abs(r["predicted"] / r["actual"] - 1) * 100 for r in valid])) if valid else None,
                    annual_mape=float(np.mean([abs(r["error_pct"]) for r in year_rows if r["error_pct"] is not None])) if any(r["error_pct"] is not None for r in year_rows) else None,
                    annual=year_rows, monthly=rows)

    backcast = []
    for region in config.REGIONS:
        rows = [dict(year=y, month=mo, actual=float(na), predicted=nt * backcast_bridge[(region, mo)]["ratio"])
                for y, mo, na, nt in con.execute("""
                    SELECT c.year, c.month, count(*) FILTER (WHERE c.aqua), count(*) FILTER (WHERE c.terra)
                    FROM cells c JOIN availability a USING (date)
                    WHERE a.aqua_available AND a.terra_available AND c.region = ? AND c.year BETWEEN ? AND ?
                    GROUP BY c.year, c.month ORDER BY c.year, c.month
                """, [region, *config.TERRA_BACKCAST_TEST_YEARS]).fetchall()]
        backcast.append(dict(region=region, **error_summary(rows)))
    diagnostics = []
    for start, end in (config.TEST_YEARS, *config.TEST_SPLIT_DRIFT):
        for region in config.REGIONS:
            rows = []
            for row in segments:
                if row["region"] == region and start <= row["year"] <= end and row["mode"] == "both":
                    rows.append(dict(year=row["year"], month=row["month"],
                                     predicted=row["estimated_from_aqua"], actual=row["estimated"]))
            diagnostics.append(dict(region=region, start_year=start, end_year=end, **error_summary(rows)))

    periods = [("calibration", *config.CALIBRATION_YEARS),
               ("early_test", *config.TEST_SPLIT_DRIFT[0])]
    periods += [(str(y), y, y) for y in range(config.DRIFT_START_YEAR, last_day.year + 1)]
    cutpoints = con.execute("""
        SELECT quantile_cont(snpp_scan, [1.0/3, 2.0/3]) FROM paired_overpasses o
        JOIN availability a USING (date)
        WHERE a.aqua_available AND a.snpp_available AND year(date) BETWEEN ? AND ?
            AND gap_minutes IS NOT NULL
    """, list(config.CALIBRATION_YEARS)).fetchone()[0]
    con.execute("""
        CREATE TEMP TABLE diagnostic_counts AS
        SELECT c.region, c.date, c.year, o.gap_minutes,
            CASE WHEN snpp_scan <= ? THEN 1 WHEN snpp_scan <= ? THEN 2
                 WHEN snpp_scan IS NOT NULL THEN 3 END AS scan_tercile,
            count(*) FILTER (WHERE c.aqua) AS n1,
            count(*) FILTER (WHERE c.snpp) AS n2,
            count(*) FILTER (WHERE c.aqua AND c.snpp) AS m
        FROM cells c JOIN availability a USING (date)
        JOIN paired_overpasses o USING (region, date)
        WHERE a.aqua_available AND a.snpp_available
        GROUP BY c.region, c.date, c.year, o.gap_minutes, scan_tercile
    """, cutpoints)
    overpass_diagnostics = []
    for label, start, end in periods:
        for tercile in (None, 1, 2, 3):
            for band in range(4):
                lower = band * config.SIMULTANEOUS_MAX_MINUTES
                upper = (band + 1) * config.SIMULTANEOUS_MAX_MINUTES if band < 3 else float("inf")
                days, n1, n2, m = con.execute("""
                    SELECT count(*), coalesce(sum(n1), 0), coalesce(sum(n2), 0), coalesce(sum(m), 0)
                    FROM diagnostic_counts WHERE year BETWEEN ? AND ? AND gap_minutes >= ? AND gap_minutes < ?
                        AND (? IS NULL OR scan_tercile = ?)
                """, [start, end, lower, upper, tercile, tercile]).fetchone()
                n1, n2, m = int(n1), int(n2), int(m)
                overpass_diagnostics.append(dict(period=label, start_year=start, end_year=end,
                    scan_tercile=tercile, gap_lower=lower, gap_upper=upper if isfinite(upper) else None,
                    region_days=days, n1=n1, n2=n2, m=m,
                    coincidence=m / n1 if n1 else None, N_over_snpp=chapman(n1, n2, m) / n2 if n2 else None))
    missing_time = con.execute("""
        SELECT year, count(*), sum(n1), sum(n2) FROM diagnostic_counts
        WHERE gap_minutes IS NULL GROUP BY year ORDER BY year
    """).fetchall()
    national_annual = []
    for year in sorted({y for r, y, mo in estimates}):
        selected = [row for (r, y, mo), row in estimates.items() if r == config.NATIONAL and y == year]
        draws = np.sum([v for (r, y, mo), v in replicas.items() if r == config.NATIONAL and y == year], axis=0)
        estimate = sum(r["estimated"] for r in selected)
        lo, hi = np.quantile(draws, tails)
        na, nv = con.execute("""
            SELECT count(*) FILTER (WHERE sensor = 'aqua'), count(*) FILTER (WHERE sensor = 'snpp')
            FROM read_parquet(?) WHERE year = ?
        """, [str(cells_path), year]).fetchone()
        national_annual.append(dict(year=year, estimated=estimate, est_low=min(float(lo), estimate),
            est_high=max(float(hi), estimate), source=sorted({r["source"] for r in selected}),
            n_aqua=na, n_snpp=nv, estimated_over_snpp=estimate / nv if nv else None,
            estimated_over_aqua=estimate / na if na else None,
            partial_through=str(partial) if partial and year == partial.year else None))
    comparable_months = list(range(1, config.SNPP_END.month))
    year_to_date = []
    for year in range(config.VIIRS_START.year, config.SNPP_END.year + 1):
        estimate = sum(row["estimated"] for (r, y, mo), row in estimates.items()
                       if r == config.NATIONAL and y == year and mo in comparable_months)
        draws = np.sum([v for (r, y, mo), v in replicas.items()
                        if r == config.NATIONAL and y == year and mo in comparable_months], axis=0)
        lo, hi = np.quantile(draws, tails)
        nv = con.execute("SELECT count(*) FROM read_parquet(?) WHERE sensor = 'snpp' AND year = ? AND month IN (SELECT unnest(?))",
                         [str(cells_path), year, comparable_months]).fetchone()[0]
        year_to_date.append(dict(year=year, months=[comparable_months[0], comparable_months[-1]], estimated=estimate,
                                 est_low=min(float(lo), estimate), est_high=max(float(hi), estimate),
                                 n_snpp=nv, estimated_over_snpp=estimate / nv if nv else None))
    sensitivity = dict(
        calibration_years=config.CALIBRATION_YEARS, ci_level=config.CI_LEVEL,
        bootstrap_n=config.BOOTSTRAP_N, seed=config.SEED,
        unit="fire-active cell-days at the afternoon and corresponding nighttime overpasses",
        methods={
            "calibration": "Simultaneous regional daytime overpasses and paired availability; adjacent months then full region for sparse recaptures. Shared year bootstrap across regions and months.",
            "availability": "Daily segments select S-NPP, otherwise NOAA-20 scaled to S-NPP after the end of S-NPP, otherwise Aqua, otherwise bridged Terra. Mixed months retain source viirs_only after drift onset, with segment sources recording exceptions.",
            "noaa20_bridge": "After SNPP_END, NOAA-20 cell-days are scaled by the regional S-NPP/NOAA-20 ratio of cell-days on S-NPP-available days of the comparable months, bootstrapped by month, then divided by p_viirs. Used only if every regional monthly-ratio CV is at most N20_RATIO_MAX_CV.",
            "partial_month": "The last month ends at LAST_DATA_DATE; it is never extrapolated. partial_window_estimates.parquet applies the same daily rules to the same day window in every year for like-for-like comparison.",
            "intervals": "Quantiles of summed aligned projection replicates. Terra bridge year resamples are independent of detection calibration years. Ranges quantify calibration uncertainty, not structural bias or count noise. No observed-union bound: afternoon activity is a different estimand.",
            "angle_control": "Calibration-frozen terciles of regional daily median S-NPP scan_mean among daytime cell-days. Same regional exposure assigned to all capture histories, retaining Aqua-only cells. Proxy control, not exact local viewing angle; observational comparisons cannot establish causality.",
            "diagnostic_bins": "Multiples of SIMULTANEOUS_MAX_MINUTES; left closed, right open, final bin includes 60 minutes. Empty bins are null. Coincidence=m/n_aqua; Chapman pooled nationally within bin.",
            "type": "Same type=0 overpass day selection for both datasets; same pooled-month supports for reported comparison.",
            "frp": "Simultaneous days only; disjoint maximum paired FRP classes with shared month pooling.",
            "validation": "Aqua versus S-NPP projections on identical available days, all overpass gaps, never used to fit probabilities. Annual errors aggregate matching monthly supports. Zero-reference months excluded from MAPE and counted explicitly.",
            "terra_bridge": "Ratio of summed paired-available Aqua/Terra cell-days by region and calendar month; shared year resamples; no Terra-S-NPP Chapman calibration.",
            "annual_ratios": "Denominators are all observed sensor cell-days, including outage dates with residual detections; estimates apply availability masks. 2000 and 2012 have partial sensor coverage.",
        },
        previous_calibration=previous_records,
        overpass_diagnostics=overpass_diagnostics, scan_tercile_cutpoints=cutpoints,
        missing_overpass_time=[dict(year=y, region_days=n, n_aqua=int(na), n_snpp=int(nv)) for y,n,na,nv in missing_time],
        terra_bridge=list(bridge.values()), terra_bridge_years=config.TERRA_BRIDGE_YEARS,
        terra_backcast=backcast, terra_backcast_train_years=config.TERRA_BACKCAST_TRAIN_YEARS,
        terra_backcast_test_years=config.TERRA_BACKCAST_TEST_YEARS,
        pooling=[r for r in records if r["pooled"] != "none"],
        frp=frp_results, type_sensitivity=type_comparison, test_diagnostics=diagnostics,
        national_annual=national_annual, year_to_date=year_to_date,
        noaa20_ratio=noaa20_ratio, noaa20_ratio_max_cv=config.N20_RATIO_MAX_CV, noaa20_included=noaa20_stable,
        partial_through=str(partial) if partial else None, partial_window=window_rows,
    )
    annual_index = {r["year"]: r for r in national_annual}
    transition_years = (config.AQUA_START.year + 1, config.DRIFT_START_YEAR)
    reference_changes = [
        abs(annual_index[y]["estimated"] / annual_index[y - 1]["estimated"] - 1)
        for y in range(config.HISTORY_YEARS[0] + 1, min(last_day.year, config.HISTORY_YEARS[1]) + 1)
        if y not in transition_years
    ]
    reference_max = max(reference_changes)
    acceptance = []
    for y in transition_years:
        change = annual_index[y]["estimated"] / annual_index[y - 1]["estimated"] - 1
        acceptance.append(dict(criterion=f"transition_{y-1}_{y}", passed=abs(change) <= reference_max,
                               change_pct=100 * change, reference_max_abs_pct=100 * reference_max))
    reference_ratios = [r["estimated_over_snpp"] for r in national_annual
                        if config.CALIBRATION_YEARS[0] <= r["year"] <= config.CALIBRATION_YEARS[1]]
    ratio_min, ratio_max = min(reference_ratios), max(reference_ratios)
    outside = [r["year"] for r in national_annual if r["estimated_over_snpp"] is not None
               and r["year"] <= config.HISTORY_YEARS[1] and not ratio_min <= r["estimated_over_snpp"] <= ratio_max]
    acceptance.append(dict(criterion="annual_snpp_ratio_within_calibration_range", passed=not outside,
                           reference_min=ratio_min, reference_max=ratio_max, outside_years=outside))
    y = config.HISTORY_YEARS[1]
    acceptance.append(dict(criterion=f"{y}_below_{y-1}",
        passed=annual_index[y]["estimated"] < annual_index[y-1]["estimated"],
        change_pct=100 * (annual_index[y]["estimated"] / annual_index[y-1]["estimated"] - 1)))
    ytd_reference = [r["estimated_over_snpp"] for r in year_to_date
                     if config.CALIBRATION_YEARS[0] <= r["year"] <= config.HISTORY_YEARS[1]]
    ytd_last = year_to_date[-1]
    acceptance.append(dict(criterion=f"{ytd_last['year']}_year_to_date_snpp_ratio_within_reference_range",
        passed=min(ytd_reference) <= ytd_last["estimated_over_snpp"] <= max(ytd_reference),
        value=ytd_last["estimated_over_snpp"], reference_min=min(ytd_reference), reference_max=max(ytd_reference),
        reference_years=[config.CALIBRATION_YEARS[0], config.HISTORY_YEARS[1]], months=ytd_last["months"]))
    sensitivity["acceptance"] = acceptance
    sensitivity["methods"]["acceptance"] = (
        "No numerical normal-variation or stability tolerances were specified. Descriptive empirical checks: "
        "transitions compared with the maximum absolute adjacent-year change in HISTORY_YEARS, "
        "excluding the named transitions; ratio stability requires staying within the calibration annual range. "
        "These are audit conventions, not fitted scientific thresholds or proof of sensor continuity."
    )
    (config.INTERIM_DIR / "sensitivity.json").write_text(json.dumps(sensitivity, indent=2, allow_nan=False) + "\n")
    print("Mean detection probabilities across calendar months (%):")
    print("region\tp_aqua_before\tp_aqua_after\tp_viirs_before\tp_viirs_after")
    for region in config.REGIONS:
        before = [r for r in previous_records if r["region"] == region]
        after = [r for r in records if r["region"] == region]
        values = [100 * np.mean([r[p] for r in rows]) for p in ("p1", "p2") for rows in (before, after)]
        print(region, *[round(v, 3) for v in values], sep="\t")
    print(f"Calibration strata: {len(records)}; pooled: {len(sensitivity['pooling'])}")
    for row in noaa20_ratio:
        print(f"NOAA-20 ratio {row['region']}: {row['ratio']:.4f} [{row['ratio_low']:.4f}, {row['ratio_high']:.4f}] CV {row['cv']:.4f}")
    print(f"NOAA-20 bridge included: {noaa20_stable}; partial through: {partial}")
    print(f"Estimates: {len(estimates)}; elapsed: {perf_counter() - started:.3f} seconds")
    con.close()
