import sys
from datetime import date, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pyarrow as pa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config


SENSORS = ("aqua", "snpp", "noaa20")
LABELS = {"aqua": "A", "snpp": "S", "noaa20": "N"}
HISTORIES = ((1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0), (1, 0, 1), (0, 1, 1), (1, 1, 1))
HISTORY_NAMES = tuple("".join(str(b) for b in h) for h in HISTORIES)
PAIRS = ((0, 1), (0, 2), (1, 2))
PAIR_NAMES = ("aqua_snpp", "aqua_noaa20", "snpp_noaa20")
MAIN_START, MAIN_END = date(2018, 4, 1), date(2022, 12, 31)
EXTENDED_END = date(2025, 12, 31)
VIIRS_GAP_MIN_OTHER = 5
VIIRS_GAP_PARTIAL_MIN_OTHER = 20
VIIRS_GAP_PARTIAL_RATIO = 0.2
CELLS = config.INTERIM_DIR / "cells.parquet"
CELLS_THREE = config.INTERIM_DIR / "cells_three.parquet"
FREQUENCY_YEARS = (2013, 2017)


def connect():
    con = duckdb.connect(config={"autoinstall_known_extensions": "false",
                                 "autoload_known_extensions": "false"})
    con.execute(f"""
        CREATE TEMP VIEW three AS
        SELECT sensor, cell_y, cell_x, date, year, month, region, frp_max, scan_mean,
            has_day, has_night, day_lst_min
        FROM read_parquet('{CELLS}') WHERE sensor IN ('aqua', 'snpp')
        UNION ALL
        SELECT sensor, cell_y, cell_x, date, year, month, region, frp_max, scan_mean,
            has_day, has_night, day_lst_min
        FROM read_parquet('{CELLS_THREE}')
    """)
    return con


def configured_exclusion(sensor, day):
    return any(start <= day <= end
               for intervals in (config.OUTAGES, config.DEGRADED)
               for start, end in intervals.get(sensor, ()))


def availability(con, start=MAIN_START, end=EXTENDED_END):
    daily = {(d, s): n for d, s, n in con.execute(
        "SELECT date, sensor, count(*) FROM three WHERE date BETWEEN ? AND ? GROUP BY ALL", [start, end]).fetchall()}
    rows, day = [], start
    while day <= end:
        counts = {s: daily.get((day, s), 0) for s in SENSORS}
        flags, reasons = {}, []
        for sensor in SENSORS:
            ok = not configured_exclusion(sensor, day)
            if not ok:
                reasons.append(f"{sensor}:config")
            if ok and sensor != "aqua":
                other = counts["noaa20" if sensor == "snpp" else "snpp"]
                own = counts[sensor]
                if (own == 0 and other >= VIIRS_GAP_MIN_OTHER) or (
                        other >= VIIRS_GAP_PARTIAL_MIN_OTHER and own < VIIRS_GAP_PARTIAL_RATIO * other):
                    ok = False
                    reasons.append(f"{sensor}:detected_gap")
            flags[sensor] = ok
        rows.append(dict(date=day, all_available=all(flags.values()), reasons=";".join(reasons),
                         **{f"{s}_available": flags[s] for s in SENSORS}))
        day += timedelta(days=1)
    return pd.DataFrame(rows)


def register_days(con, days):
    con.register("days_arrow", pa.Table.from_pandas(days[["date", "all_available"]], preserve_index=False))
    con.execute("CREATE OR REPLACE TEMP TABLE days AS SELECT * FROM days_arrow")
    con.unregister("days_arrow")


def build_units(con, day_only=False):
    flag = " AND has_day" if day_only else ""
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE units AS
        SELECT t.region, t.date, t.year, t.month, t.cell_y, t.cell_x,
            bool_or(sensor = 'aqua'{flag})::INTEGER AS a,
            bool_or(sensor = 'snpp'{flag})::INTEGER AS s,
            bool_or(sensor = 'noaa20'{flag})::INTEGER AS n,
            coalesce(max(frp_max) FILTER (WHERE sensor <> 'aqua'{flag}),
                     max(frp_max) FILTER (WHERE sensor = 'aqua'{flag})) AS frp
        FROM three t JOIN days d USING (date)
        WHERE d.all_available
        GROUP BY ALL
        HAVING a + s + n > 0
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE cell_frequency AS
        SELECT cell_y, cell_x, count(*) AS snpp_days
        FROM read_parquet('{CELLS}')
        WHERE sensor = 'snpp' AND year BETWEEN ? AND ?
        GROUP BY ALL
    """, list(FREQUENCY_YEARS))


def history_counts(con, by=("region", "year", "month"), where="TRUE"):
    keys = ", ".join(by)
    table = con.execute(f"""
        SELECT {keys}, a, s, n, count(*) AS k FROM units u
        LEFT JOIN cell_frequency f USING (cell_y, cell_x)
        WHERE {where} GROUP BY ALL
    """).df()
    table["history"] = table["a"].astype(str) + table["s"].astype(str) + table["n"].astype(str)
    wide = table.pivot_table(index=list(by), columns="history", values="k", aggfunc="sum", fill_value=0)
    for name in HISTORY_NAMES:
        if name not in wide.columns:
            wide[name] = 0
    return wide[list(HISTORY_NAMES)].astype(np.int64)


def marginals(x):
    x = np.asarray(x, dtype=float)
    h = np.array(HISTORIES)
    return {s: x @ h[:, i] for i, s in enumerate(SENSORS)}


def chapman(n1, n2, m):
    return (n1 + 1) * (n2 + 1) / (m + 1) - 1


def pair_overlap(x, i, j):
    h = np.array(HISTORIES)
    return np.asarray(x, dtype=float) @ (h[:, i] * h[:, j])


def design(pairs=True):
    h = np.array(HISTORIES, dtype=float)
    columns = [h[:, 0], h[:, 1], h[:, 2]]
    if pairs:
        columns += [h[:, i] * h[:, j] for i, j in PAIRS]
    return np.column_stack(columns)


def saturated_unseen(x):
    x = np.asarray(x, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        return x[..., 0] * x[..., 1] * x[..., 2] * x[..., 6] / (x[..., 3] * x[..., 4] * x[..., 5])


def fit_mle(x, pairs=True):
    from scipy.optimize import minimize

    x = np.asarray(x, dtype=float)
    X = design(pairs)
    start = np.r_[np.log(max(x.mean(), 1.0)), np.zeros(X.shape[1])]

    def objective(beta):
        eta = beta[0] + X @ beta[1:]
        mu = np.exp(eta)
        return mu.sum() - x @ eta, np.r_[(mu - x).sum(), X.T @ (mu - x)]

    result = minimize(objective, start, jac=True, method="L-BFGS-B")
    beta = result.x
    return dict(unseen=float(np.exp(beta[0])), N=float(x.sum() + np.exp(beta[0])),
                beta=beta, mu=np.exp(beta[0] + X @ beta[1:]), converged=bool(result.success))


def saturated_interactions(x):
    x = np.asarray(x, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        log_unseen = np.log(saturated_unseen(x))
        single = np.log(x[..., :3])
        double = np.log(x[..., 3:6])
        return np.stack([double[..., k] + log_unseen - single[..., i] - single[..., j]
                         for k, (i, j) in enumerate(PAIRS)], axis=-1)


def bootstrap_mle(x, pairs, draws, rng, level=config.CI_LEVEL):
    fit = fit_mle(x, pairs)
    tails = ((1 - level) / 2, (1 + level) / 2)
    replicates = rng.poisson(fit["mu"], size=(draws, len(HISTORIES)))
    if pairs:
        values = replicates.sum(axis=1) + saturated_unseen(replicates)
        inter = saturated_interactions(replicates)
    else:
        values = np.array([fit_mle(r, False)["N"] for r in replicates])
        inter = np.zeros((draws, 3))
    ok = np.isfinite(values) & np.all(np.isfinite(inter), axis=1)
    low, high = np.quantile(values[ok], tails)
    inter_low, inter_high = np.quantile(inter[ok], tails, axis=0)
    interactions = saturated_interactions(x) if pairs else np.zeros(3)
    return dict(N=fit["N"], low=float(low), high=float(high), interactions=interactions,
                interactions_low=inter_low, interactions_high=inter_high, valid_draws=int(ok.sum()))
