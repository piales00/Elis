import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
from scipy.special import ndtr

sys.path.insert(0, str(Path(__file__).resolve().parent))

import underestimation as u
import underestimation_sim as us


def main():
    con = u._connect()
    start, end = u.config.CALIBRATION_YEARS
    frame = u.load_units(con, date(start, 1, 1), date(end, 12, 31))
    gap = frame.gap.abs()
    threshold = u.config.SIMULTANEOUS_MAX_MINUTES
    middle = frame[(gap >= threshold) & (gap < 3 * threshold)]
    na, _, matches = u.counts(middle)
    all_units = u.load_units(con, date(start, 1, 1), date(end, 12, 31), day_only=False)
    simultaneous = u.two_list_simultaneous(all_units)
    probabilities = con.execute(
        "SELECT region, month, p2 FROM read_parquet(?)",
        [str(u.config.INTERIM_DIR / "detection_probs.parquet")],
    ).df()
    paired = simultaneous.merge(probabilities, on=["region", "month"], validate="many_to_one")
    principal = float((paired.s / paired.p2).sum())
    reference = u.chapman(*u.counts(simultaneous))
    overpass = u.overpass_distribution(con)
    cache = json.loads(us.SCENARIO_CACHE.read_text())
    fit = cache["scenarios"]["best_fit"]["fit"]
    params = fit["params"]
    sample = us.fit_sample(np.random.default_rng(u.config.SEED), overpass)
    x = params["mu"] + params["sigma"] * sample["z"]
    ma = x + params["delta_a"] + params["tau_a"] * sample["za"]
    ms = x + params["tau_s"] * sample["zs"]
    da = params["pmax_a"] * ndtr(params["a_a"] + params["b_a"] * ma)
    ds = params["pmax_s"] * ndtr(params["a_s"] + params["b_s"] * ms)
    joint = da * ds * np.exp(-np.abs(sample["cell_gap"]) / us.lifetime(params, x))
    mask = (np.abs(sample["day_gap"]) >= threshold) & (np.abs(sample["day_gap"]) < 3 * threshold)
    result = dict(
        coincidence_20_60=dict(observed=matches / na, simulated=float(joint[mask].sum() / da[mask].sum())),
        chapman_over_published_equivalent=dict(
            observed=reference / principal, N_chapman=reference, N_main=principal,
            support=f"{start}-{end}, simultaneous region-days, day and night cell-day union, paired availability",
        ),
        best_fit=fit,
    )
    (u.config.INTERIM_DIR / "underestimation_calibration_audit.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "best_fit"}, indent=2))
    con.close()


if __name__ == "__main__":
    main()
