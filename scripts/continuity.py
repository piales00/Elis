import json

import duckdb
import joblib
import numpy as np
import pandas as pd

import config
import modis_emulator


OUTPUT_NAME = "continuity.json"
ALL_REGIONS = (config.NATIONAL, *config.REGIONS)
TAILS = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
VIIRS_MODES = ("both", "snpp", "noaa20")
MODIS_MODES = ("aqua", "terra")


def connect():
    return duckdb.connect(config={"threads": config.N_JOBS, "autoinstall_known_extensions": "false",
                                  "autoload_known_extensions": "false"})


def month_key(year, month):
    return f"{year:04d}-{month:02d}"


def emulated_months(con):
    frame = modis_emulator.prepare(con)
    bundle = joblib.load(config.INTERIM_DIR / modis_emulator.MODEL_NAME)
    frame["p"] = bundle["model"].predict_proba(frame[modis_emulator.FEATURES])[:, 1]
    frame["var"] = frame.p * (1 - frame.p)
    frame["region"] = frame.region.astype(str)
    monthly = frame.groupby(["region", "year", "month"]).agg(
        n_snpp=("p", "size"), sum_p=("p", "sum"), var_p=("var", "sum"), r=("r", "first")).reset_index()
    monthly["aqua_emulated"] = monthly.sum_p + monthly.r * monthly.n_snpp
    reference = con.execute("SELECT * FROM read_parquet(?)",
                            [str(config.INTERIM_DIR / modis_emulator.MONTHLY_NAME)]).df()
    merged = reference.merge(monthly, on=["region", "year", "month", "n_snpp"], how="left")
    regional = merged[merged.region != config.NATIONAL]
    assert regional.aqua_emulated.notna().all()
    assert np.allclose(regional.aqua_emulated, regional.modis_equiv_emulated, rtol=1e-9, atol=1e-6)
    national = regional.groupby(["year", "month"])[["sum_p", "var_p", "aqua_emulated"]].sum()
    national["residual"] = regional.assign(res=regional.r * regional.n_snpp).groupby(["year", "month"]).res.sum()
    regional = regional.assign(residual=regional.r * regional.n_snpp)
    rows = {}
    for row in regional.itertuples():
        rows[(row.region, row.year, row.month)] = row._asdict()
    for row in merged[merged.region == config.NATIONAL].itertuples():
        values = national.loc[(row.year, row.month)]
        entry = row._asdict()
        entry.update(sum_p=values.sum_p, var_p=values.var_p, residual=values.residual, aqua_emulated=values.aqua_emulated)
        assert abs(entry["aqua_emulated"] - row.modis_equiv_emulated) < 1e-6
        rows[(config.NATIONAL, row.year, row.month)] = entry
    return rows


def residual_pool(rows):
    pool = {}
    for (region, year, month), row in rows.items():
        if (config.CONTINUITY_PRE_DRIFT_YEARS[0] <= year <= config.CONTINUITY_PRE_DRIFT_YEARS[1]
                and row["n_aqua"] >= config.CONTINUITY_MIN_AQUA and not row["partial_coverage"]):
            pool.setdefault(region, []).append((year, float(np.log(row["n_aqua"] / row["aqua_emulated"]))))
    return pool


def emulated_ranges(rows):
    pool = residual_pool(rows)
    rng = np.random.default_rng(config.SEED)
    ranges = {}
    for key in sorted(rows):
        region, year, _ = key
        row = rows[key]
        residuals = np.array([value for pool_year, value in pool[region] if pool_year != year])
        base = (rng.normal(row["sum_p"], np.sqrt(row["var_p"]), config.BOOTSTRAP_N)
                + rng.poisson(row["residual"], config.BOOTSTRAP_N))
        draws = np.maximum(base, 0) * np.exp(rng.choice(residuals, config.BOOTSTRAP_N))
        low, high = np.quantile(draws, TAILS)
        ranges[key] = (min(float(low), row["aqua_emulated"]), max(float(high), row["aqua_emulated"]))
    return ranges, {region: len(values) for region, values in pool.items()}


def harmonized(con):
    series = {(r["region"], r["year"], r["month"]): r
              for r in json.loads((config.PROCESSED_DIR / "series.json").read_text()) if not r["is_forecast"]}
    methodology = json.loads((config.PROCESSED_DIR / "methodology.json").read_text())
    p_viirs = {(r["region"], r["month"]): r["p_viirs"] for r in methodology["detection"]}
    segments = con.execute("SELECT * FROM read_parquet(?) WHERE year >= ?",
                           [str(config.INTERIM_DIR / "capture_segments.parquet"), config.VIIRS_START.year]).df()
    identity = segments[segments["mode"].isin(("both", "snpp"))]
    identity_error = float(np.max(np.abs(identity.n2 / [p_viirs[(r, m)] for r, m in zip(identity.region, identity.month)]
                                         / identity.estimated - 1)))
    result = {}
    for (region, year, month), group in segments.groupby(["region", "year", "month"]):
        viirs = group[group["mode"].isin(VIIRS_MODES)]
        modis = group[group["mode"].isin(MODIS_MODES)]
        result[(region, year, month)] = {
            "viirs_only": float(viirs.estimated.sum()), "viirs_low": float(viirs.est_low.sum()),
            "viirs_high": float(viirs.est_high.sum()), "modis_filled": float(modis.estimated.sum()),
            "modis_filled_days": int(modis.days.sum()), "n_viirs": int(viirs.n2.sum()),
        }
    for year, month in sorted({(y, m) for _, y, m in result}):
        parts = [result[(r, year, month)] for r in config.REGIONS]
        result[(config.NATIONAL, year, month)] = {
            "viirs_only": sum(p["viirs_only"] for p in parts), "viirs_low": sum(p["viirs_low"] for p in parts),
            "viirs_high": sum(p["viirs_high"] for p in parts), "modis_filled": sum(p["modis_filled"] for p in parts),
            "modis_filled_days": max(p["modis_filled_days"] for p in parts), "n_viirs": sum(p["n_viirs"] for p in parts)}
    for key, value in result.items():
        if value["modis_filled"] == 0:
            value["viirs_low"], value["viirs_high"] = series[key]["est_low"], series[key]["est_high"]
    return series, result, identity_error


def splice(rows, shutdown):
    for row in rows:
        after = row["month"] >= shutdown
        row["modis_scale"] = row["aqua_emulated"] if after else row["aqua_observed"]
        row["modis_scale_low"] = row["aqua_emulated_low"] if after else row["aqua_observed"]
        row["modis_scale_high"] = row["aqua_emulated_high"] if after else row["aqua_observed"]
        row["modis_scale_source"] = "aqua_emulated" if after else "aqua_observed"
    return rows


def pct(value, reference):
    return round(float(value / reference * 100), 2) if reference else None


def metrics(rows):
    frame = pd.DataFrame(rows)
    frame["year"] = frame.month.str[:4].astype(int)
    frame["inside"] = (frame.aqua_observed >= frame.aqua_emulated_low) & (frame.aqua_observed <= frame.aqua_emulated_high)
    by_year = []
    for (region, year), group in frame[frame.year >= config.CONTINUITY_PRE_DRIFT_YEARS[0]].groupby(["region", "year"]):
        observed, emulated = group.aqua_observed.sum(), group.aqua_emulated.sum()
        by_year.append({"region": region, "year": int(year), "months": len(group),
                        "aqua_observed": int(observed), "aqua_emulated": round(float(emulated), 1),
                        "error_pct": pct(emulated - observed, observed),
                        "aqua_vs_emulated_pct": pct(observed - emulated, emulated),
                        "range_coverage": round(float(group.inside.mean()), 3),
                        "period": "pre_drift" if year <= config.CONTINUITY_PRE_DRIFT_YEARS[1] else "drift"})
    summaries = []
    for name, years in (("pre_drift", config.CONTINUITY_PRE_DRIFT_YEARS), ("drift", config.CONTINUITY_DRIFT_YEARS)):
        for region in ALL_REGIONS:
            group = frame[(frame.region == region) & frame.year.between(*years)]
            positive = group[group.aqua_observed > 0]
            annual = group.groupby("year")[["aqua_observed", "aqua_emulated"]].sum()
            observed, emulated = group.aqua_observed.sum(), group.aqua_emulated.sum()
            summaries.append({
                "region": region, "period": name, "years": list(years), "months": len(group),
                "monthly_mape_pct": round(float((np.abs(positive.aqua_emulated - positive.aqua_observed) / positive.aqua_observed).mean() * 100), 2),
                "annual_mape_pct": round(float((np.abs(annual.aqua_emulated - annual.aqua_observed) / annual.aqua_observed).mean() * 100), 2),
                "bias_pct": pct(emulated - observed, observed),
                "aqua_vs_emulated_pct": pct(observed - emulated, emulated),
                "range_coverage": round(float(group.inside.mean()), 3)})
    return by_year, summaries


def main():
    with connect() as con:
        emulated = emulated_months(con)
        ranges, pool_sizes = emulated_ranges(emulated)
        series, viirs, identity_error = harmonized(con)
    rows, differences, filled = [], [], []
    for key in sorted(emulated, key=lambda k: (ALL_REGIONS.index(k[0]), k[1], k[2])):
        region, year, month = key
        source, estimate, split = emulated[key], series[key], viirs[key]
        low, high = ranges[key]
        rebuilt = split["viirs_only"] + split["modis_filled"]
        differences.append(abs(rebuilt - estimate["estimated"]))
        if split["modis_filled"] > 0:
            filled.append({"region": region, "month": month_key(year, month), "days": split["modis_filled_days"],
                           "modis_filled": round(split["modis_filled"], 1)})
        rows.append({
            "region": region, "month": month_key(year, month),
            "n_snpp": int(source["n_snpp"]), "excluded_days": int(source["excluded_days"]),
            "partial_coverage": bool(source["partial_coverage"]),
            "aqua_observed": int(source["n_aqua"]),
            "aqua_emulated": round(float(source["aqua_emulated"]), 1),
            "aqua_emulated_low": round(low, 1), "aqua_emulated_high": round(high, 1),
            "harmonized": estimate["estimated"], "harmonized_low": estimate["est_low"], "harmonized_high": estimate["est_high"],
            "harmonized_viirs_only": round(split["viirs_only"], 1),
            "harmonized_viirs_only_low": round(split["viirs_low"], 1),
            "harmonized_viirs_only_high": round(split["viirs_high"], 1),
            "modis_filled": round(split["modis_filled"], 1), "source": estimate["source"],
        })
    shutdown = month_key(config.CONTINUITY_SHUTDOWN.year, config.CONTINUITY_SHUTDOWN.month)
    splice(rows, shutdown)
    by_year, summaries = metrics(rows)
    output = {
        "unit": "fire cell-days", "ci_level": config.CI_LEVEL, "regions": list(ALL_REGIONS),
        "period": [rows[0]["month"], max(r["month"] for r in rows)],
        "scenario": {
            "shutdown": shutdown, "modis_science_end_year": config.MODIS_SCIENCE_END_YEAR,
            "description": "MODIS-scale series: real Aqua before the shutdown month, emulated Aqua from VIIRS S-NPP from it on. "
                           "The harmonized series does not change, because since 2012 it is n_viirs / p_viirs with p_viirs "
                           "calibrated once on 2013-2020; only S-NPP outage days filled with Aqua (modis_filled) depend on MODIS.",
        },
        "rows": rows,
        "metrics": {
            "emulator_by_year": by_year, "summary": summaries,
            "harmonized_check": {
                "months": len(differences), "max_abs_diff_rebuilt_vs_series": round(float(max(differences)), 2),
                "viirs_identity_max_rel_diff": identity_error,
                "months_with_modis_filled_days": filled,
            },
        },
        "method": {
            "aqua_observed": "Aqua MODIS cell-days on days when Aqua and S-NPP were both available (same days as the emulator), so it can differ from series.json modis_equiv in months with outages.",
            "aqua_emulated": "Sum over S-NPP cell-days of the gradient-boosting probability that Aqua also sees the cell-day, plus the calibration-period rate of Aqua-only cell-days per S-NPP cell-day (region x month). Trained on 2013-2020.",
            "aqua_emulated_range": f"{int(config.CI_LEVEL * 100)}% range from {config.BOOTSTRAP_N} replicates: normal approximation of the Bernoulli sum, Poisson residual count, times a structural factor resampled from the monthly log(observed/emulated) of the same region in {config.CONTINUITY_PRE_DRIFT_YEARS[0]}-{config.CONTINUITY_PRE_DRIFT_YEARS[1]} (months with at least {config.CONTINUITY_MIN_AQUA} Aqua cell-days and full coverage), leaving out the month's own year. Pool sizes: {pool_sizes}.",
            "harmonized": "estimated, est_low and est_high of series.json.",
            "harmonized_viirs_only": "Capture-recapture segments that use VIIRS only (n_snpp / p_viirs, and NOAA-20 scaled to S-NPP after the end of S-NPP). Its range equals the series range when no day is filled with MODIS; otherwise it is the sum of segment ranges.",
            "modis_filled": "Part of harmonized that comes from S-NPP outage days filled with Aqua; harmonized = harmonized_viirs_only + modis_filled.",
            "drift": f"From {config.DRIFT_START_YEAR} the Aqua orbit drifts to a later overpass, so Aqua sees less than the emulator expects; aqua_vs_emulated_pct measures that gap.",
        },
    }
    path = config.PROCESSED_DIR / OUTPUT_NAME
    path.write_text(json.dumps(output, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Continuity: {len(rows)} rows; max rebuilt difference {max(differences):.2f}; identity {identity_error:.2e}")
    for row in summaries:
        print(f"{row['period']} {row['region']}: monthly MAPE {row['monthly_mape_pct']}%, annual MAPE {row['annual_mape_pct']}%, "
              f"bias {row['bias_pct']}%, Aqua vs emulated {row['aqua_vs_emulated_pct']}%, coverage {row['range_coverage']}")


if __name__ == "__main__":
    main()
