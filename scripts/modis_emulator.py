import json
from time import perf_counter

import duckdb
import joblib
import numpy as np
import pandas as pd
from joblib import parallel_backend
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from threadpoolctl import threadpool_limits

import config


INPUT_NAME = "cells.parquet"
MODEL_NAME = "emulator.joblib"
METRICS_NAME = "emulator_metrics.json"
MONTHLY_NAME = "modis_equiv_emulated.parquet"
NUMERIC = ["n_points", "frp_sum", "frp_max", "bright_max", "scan_mean",
           "track_mean", "has_day", "has_night", "month_sin", "month_cos"]
FEATURES = NUMERIC + ["region"]
MODELS = ("logistic", "boosting", "fixed_ratio")


def reliability(y, probability):
    edges = np.linspace(0, 1, config.RELIABILITY_BINS + 1)
    bins = np.minimum(np.searchsorted(edges, probability, side="right") - 1,
                      config.RELIABILITY_BINS - 1)
    rows = []
    for index in range(config.RELIABILITY_BINS):
        mask = bins == index
        rows.append({"lower": float(edges[index]), "upper": float(edges[index + 1]),
                     "n": int(mask.sum()),
                     "mean_probability": float(probability[mask].mean()) if mask.any() else None,
                     "observed_fraction": float(np.asarray(y)[mask].mean()) if mask.any() else None})
    ece = sum(row["n"] * abs(row["mean_probability"] - row["observed_fraction"])
              for row in rows if row["n"]) / len(y)
    return {"ece": ece, "bins": rows}


def boosting():
    return HistGradientBoostingClassifier(**config.EMULATOR_PARAMS)


def prepare(con):
    con.execute("CREATE TABLE cells AS SELECT * FROM read_parquet(?)",
                [str(config.INTERIM_DIR / INPUT_NAME)])
    assert con.execute("SELECT count(*) = count(DISTINCT (sensor, cell_y, cell_x, date)) FROM cells").fetchone()[0]
    con.execute("CREATE TABLE excluded (start_date DATE, end_date DATE)")
    intervals = [interval for source in (config.OUTAGES, config.DEGRADED)
                 for sensor in ("aqua", "snpp") for interval in source.get(sensor, [])]
    if intervals:
        con.executemany("INSERT INTO excluded VALUES (?, ?)", intervals)
    con.execute("""
        CREATE TABLE available AS SELECT * FROM cells c
        WHERE sensor IN ('aqua', 'snpp') AND NOT EXISTS (
            SELECT 1 FROM excluded e WHERE c.date BETWEEN e.start_date AND e.end_date)
    """)
    con.execute("""
        CREATE TABLE labeled AS SELECT s.*, (a.sensor IS NOT NULL)::INTEGER AS label
        FROM available s LEFT JOIN available a
        ON a.sensor = 'aqua' AND s.cell_y = a.cell_y AND s.cell_x = a.cell_x AND s.date = a.date
        WHERE s.sensor = 'snpp'
    """)
    con.execute("""
        CREATE TABLE rates AS
        WITH snpp AS (
            SELECT region, month, count(*) AS n_snpp, sum(label) AS n_both
            FROM labeled WHERE year BETWEEN ? AND ? GROUP BY region, month
        ), aqua AS (
            SELECT region, month, count(*) AS n_aqua FROM available
            WHERE sensor = 'aqua' AND year BETWEEN ? AND ? GROUP BY region, month
        )
        SELECT s.*, coalesce(a.n_aqua, 0) AS n_aqua,
            (coalesce(a.n_aqua, 0) - n_both)::DOUBLE / n_snpp AS r,
            coalesce(a.n_aqua, 0)::DOUBLE / n_snpp AS fixed_ratio,
            n_both::DOUBLE / n_snpp AS fixed_probability
        FROM snpp s LEFT JOIN aqua a USING (region, month)
    """, [*config.CALIBRATION_YEARS, *config.CALIBRATION_YEARS])
    frame = con.execute("""
        SELECT l.*, r.r, r.fixed_ratio, r.fixed_probability FROM labeled l
        LEFT JOIN rates r USING (region, month) ORDER BY date, cell_y, cell_x
    """).df()
    assert frame[["r", "fixed_ratio", "fixed_probability"]].notna().all().all()
    frame["month_sin"] = np.sin(2 * np.pi * frame.month / 12)
    frame["month_cos"] = np.cos(2 * np.pi * frame.month / 12)
    frame["region"] = pd.Categorical(frame.region, categories=config.REGIONS)
    assert frame[FEATURES].notna().all().all()
    return frame


def monthly_totals(con, frame):
    predictions = frame[["region", "year", "month", *MODELS]].copy()
    con.register("predictions", predictions)
    con.execute("""
        CREATE TABLE monthly_macro AS
        WITH predicted AS (
            SELECT region, year, month, count(*) AS n_snpp,
                sum(logistic) AS logistic, sum(boosting) AS boosting,
                sum(fixed_ratio) AS fixed_ratio
            FROM predictions GROUP BY region, year, month
        ), actual AS (
            SELECT region, year, month, count(*) AS n_aqua FROM available
            WHERE sensor = 'aqua' GROUP BY region, year, month
        ), calendar AS (
            SELECT date::DATE AS date, year(date) AS year, month(date) AS month,
                EXISTS (SELECT 1 FROM excluded e WHERE date BETWEEN e.start_date AND e.end_date) AS excluded
            FROM generate_series(make_date(?, 1, 1), make_date(?, 12, 31), INTERVAL 1 DAY) t(date)
        ), coverage AS (
            SELECT year, month, count(*) FILTER (WHERE excluded) AS excluded_days
            FROM calendar GROUP BY year, month
        )
        SELECT p.region, p.year, p.month, p.n_snpp, coalesce(a.n_aqua, 0) AS n_aqua,
            p.logistic + r.r * p.n_snpp AS logistic,
            p.boosting + r.r * p.n_snpp AS boosting, p.fixed_ratio,
            c.excluded_days, c.excluded_days > 0 AS partial_coverage
        FROM predicted p LEFT JOIN actual a USING (region, year, month)
        JOIN rates r USING (region, month) JOIN coverage c USING (year, month)
    """, [config.VIIRS_START.year, int(frame.year.max())])
    con.execute("""
        CREATE TABLE monthly AS SELECT * FROM monthly_macro UNION ALL
        SELECT ?, year, month, sum(n_snpp), sum(n_aqua), sum(logistic), sum(boosting),
            sum(fixed_ratio), max(excluded_days), bool_or(partial_coverage)
        FROM monthly_macro GROUP BY year, month
    """, [config.NATIONAL])
    con.execute("""
        COPY (SELECT region, year, month, boosting AS modis_equiv_emulated,
            logistic AS modis_equiv_logistic, fixed_ratio AS modis_equiv_fixed_ratio,
            n_snpp, n_aqua, excluded_days, partial_coverage
            FROM monthly ORDER BY region, year, month) TO ? (FORMAT PARQUET)
    """, [str(config.INTERIM_DIR / MONTHLY_NAME)])


def evaluate(con, frame, probabilities):
    results = {}
    for years in (config.TEST_YEARS, *config.TEST_SPLIT_DRIFT):
        period = f"{years[0]}-{years[1]}"
        rows = []
        for region in (config.NATIONAL, *config.REGIONS):
            mask = frame.year.between(*years)
            if region != config.NATIONAL:
                mask &= frame.region == region
            y = frame.loc[mask, "label"].to_numpy()
            for name in MODELS:
                probability = probabilities[name][mask]
                monthly = con.execute(f"""
                    SELECT avg(abs({name} - n_aqua) / nullif(n_aqua, 0)) * 100,
                        count(*) FILTER (WHERE n_aqua = 0)
                    FROM monthly WHERE region = ? AND year BETWEEN ? AND ?
                """, [region, *years]).fetchone()
                annual = con.execute(f"""
                    SELECT avg(abs(predicted - actual) / nullif(actual, 0)) * 100
                    FROM (SELECT year, sum({name}) AS predicted, sum(n_aqua) AS actual
                          FROM monthly WHERE region = ? AND year BETWEEN ? AND ? GROUP BY year)
                """, [region, *years]).fetchone()[0]
                rows.append({"region": region, "model": name, "n": len(y),
                             "auc": float(roc_auc_score(y, probability)) if len(np.unique(y)) > 1 else None,
                             "brier": float(brier_score_loss(y, probability)),
                             "monthly_error_pct": monthly[0], "annual_error_pct": annual,
                             "zero_actual_months_excluded_from_mape": monthly[1],
                             "reliability": reliability(y, probability)})
        results[period] = rows
    return results


def main():
    started = perf_counter()
    with threadpool_limits(limits=config.N_JOBS), duckdb.connect(config={
        "threads": config.N_JOBS, "autoinstall_known_extensions": "false",
        "autoload_known_extensions": "false",
    }) as con:
        frame = prepare(con)
        train = frame.year.between(*config.CALIBRATION_YEARS)
        calibration = frame.year.between(*config.EMULATOR_CALIBRATION_YEARS)
        core = train & (frame.year < config.EMULATOR_CALIBRATION_YEARS[0])
        test = frame.year.between(*config.TEST_YEARS)
        assert not (train & test).any() and (calibration <= train).all()
        x, y = frame[FEATURES], frame.label
        print(f"Training rows: {train.sum()}; calibration rows: {calibration.sum()}; test rows: {test.sum()}", flush=True)
        training_started = perf_counter()
        logistic = make_pipeline(ColumnTransformer([
            ("numeric", StandardScaler(), NUMERIC),
            ("region", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["region"]),
        ]), LogisticRegression(**config.EMULATOR_LOGIT_PARAMS))
        logistic.fit(x.loc[train], y.loc[train])
        pilot = boosting().fit(x.loc[core], y.loc[core])
        calibration_report = reliability(y.loc[calibration], pilot.predict_proba(x.loc[calibration])[:, 1])
        use_isotonic = calibration_report["ece"] > config.EMULATOR_CALIBRATION["max_ece"]
        if use_isotonic:
            principal = CalibratedClassifierCV(FrozenEstimator(pilot),
                method=config.EMULATOR_CALIBRATION["method"], n_jobs=config.N_JOBS)
            principal.fit(x.loc[calibration], y.loc[calibration])
        else:
            principal = boosting().fit(x.loc[train], y.loc[train])
        training_seconds = perf_counter() - training_started
        print(f"Training: {training_seconds:.2f}s; held-out ECE: {calibration_report['ece']:.6f}; isotonic: {use_isotonic}", flush=True)
        probabilities = {"logistic": logistic.predict_proba(x)[:, 1],
                         "boosting": principal.predict_proba(x)[:, 1],
                         "fixed_ratio": frame.fixed_probability.to_numpy()}
        for name in ("logistic", "boosting"):
            frame[name] = probabilities[name]
        monthly_totals(con, frame)
        results = evaluate(con, frame, probabilities)
        sample = frame.loc[test].sample(n=min(config.EMULATOR_PERMUTATION_SAMPLE, int(test.sum())), random_state=config.SEED)
        print("Computing test-only permutation importance (negative Brier score).", flush=True)
        with parallel_backend("threading", n_jobs=config.N_JOBS), threadpool_limits(limits=1):
            importance = permutation_importance(principal, sample[FEATURES], sample.label,
                scoring="neg_brier_score", n_repeats=config.EMULATOR_PERMUTATION_REPEATS,
                random_state=config.SEED, n_jobs=config.N_JOBS)
        importances = sorted([{"feature": feature, "brier_increase_mean": float(mean),
                               "brier_increase_std": float(std)}
                              for feature, mean, std in zip(FEATURES, importance.importances_mean, importance.importances_std)],
                             key=lambda row: row["brier_increase_mean"], reverse=True)
        full = results[f"{config.TEST_YEARS[0]}-{config.TEST_YEARS[1]}"]
        national = {row["model"]: row for row in full if row["region"] == config.NATIONAL}
        beats_fixed = national["boosting"]["monthly_error_pct"] < national["fixed_ratio"]["monthly_error_pct"]
        report = {
            "train_years": config.CALIBRATION_YEARS, "test_years": config.TEST_YEARS,
            "auc": national["boosting"]["auc"], "brier": national["boosting"]["brier"],
            "monthly_error_pct": national["boosting"]["monthly_error_pct"],
            "monthly_error_pct_fixed_ratio": national["fixed_ratio"]["monthly_error_pct"],
            "by_region": [{key: row[key] for key in ("region", "monthly_error_pct", "annual_error_pct")}
                          for row in full if row["model"] == "boosting" and row["region"] != config.NATIONAL],
            "metrics": results, "calibration": {"used": "isotonic" if use_isotonic else "uncalibrated",
                "diagnostic_training_years": [config.CALIBRATION_YEARS[0], config.EMULATOR_CALIBRATION_YEARS[0] - 1],
                "diagnostic_years": config.EMULATOR_CALIBRATION_YEARS, "held_out": calibration_report},
            "training_seconds": training_seconds, "permutation_importance": importances,
            "permutation_sample": len(sample), "permutation_repeats": config.EMULATOR_PERMUTATION_REPEATS,
            "criteria": {"boosting_beats_fixed_monthly_national": beats_fixed,
                         "training_under_five_minutes": training_seconds < 5 * 60,
                         "test_years_excluded_from_all_fitting": True,
                         "availability_mask_applied": True, "drift_splits_reported": True},
            "definitions": {
                "unit": "fire cell-days",
                "monthly_error": "Unweighted mean absolute percentage error over months with positive observed Aqua totals; annual error applies the same definition after summing months.",
                "coverage": "All totals use jointly available days only. Partial months are flagged, never extrapolated or filled with outage zeros. Output is not the final integrated series.",
                "fixed_classification": "AUC/Brier use calibration n_both/n_snpp by region/month. Aggregate baseline uses n_aqua/n_snpp, not a classification probability.",
                "calibration_decision": "ECE on held-out calibration years from the core-year model; if below threshold, refit on all calibration years. Test diagnostics never select a model.",
                "defaults": "Unspecified scikit-learn defaults; native categorical region in HistGradientBoosting; equal-width reliability bins; permutation importance uses negative Brier score.",
                "uncertainty": "Point predictions for emulator validation; reliability bins and permutation standard deviations are diagnostics, not confidence intervals for totals.",
                "regions": "Inherited from cells.parquet; provisional if generated without official polygons.",
            },
            "rates": con.execute("SELECT * FROM rates ORDER BY region, month").df().to_dict(orient="records"),
        }
        joblib.dump({"model": principal, "logistic": logistic, "features": FEATURES,
                     "region_categories": config.REGIONS, "rates": report["rates"],
                     "calibration": report["calibration"], "train_years": config.CALIBRATION_YEARS},
                    config.INTERIM_DIR / MODEL_NAME)
        report["elapsed_seconds"] = perf_counter() - started
        (config.INTERIM_DIR / METRICS_NAME).write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
        for period, rows in results.items():
            print(f"\n{period}\nregion model AUC Brier monthly_MAPE_pct annual_MAPE_pct")
            for row in rows:
                print(f"{row['region']} {row['model']} {row['auc']:.4f} {row['brier']:.4f} {row['monthly_error_pct']:.2f} {row['annual_error_pct']:.2f}")
        print("\nBoosting beats fixed monthly national:", beats_fixed)
        print(f"Elapsed: {report['elapsed_seconds']:.2f}s")


if __name__ == "__main__":
    main()
