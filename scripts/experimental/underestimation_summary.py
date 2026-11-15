import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scipy.stats import beta

import underestimation_sim as us
from underestimation_sim import config

SOURCE = config.INTERIM_DIR / "underestimation_replicates.jsonl"
SCENARIOS = config.INTERIM_DIR / "underestimation_scenarios.json"
OUTPUT = config.INTERIM_DIR / "underestimation_exam.json"


def main():
    replicates = [json.loads(line) for line in SOURCE.read_text().splitlines() if line.strip()]
    cache = json.loads(SCENARIOS.read_text())["scenarios"]
    names = list(cache)
    estimators = sorted({e for r in replicates for e in r["results"]})
    tail = (1 - config.CI_LEVEL) / 2
    scenarios = {}
    for name in names:
        selected = [r for r in replicates if r["scenario"] == name]
        summary = us.summarize(selected)
        for estimator in estimators:
            row = summary.setdefault(estimator, dict(replicates=0, failures=0))
            n = row["replicates"]
            row["complete"] = n >= us.REPLICATES
            if "coverage" in row:
                k = round(n * row["coverage"])
                row["coverage_mc_interval"] = [
                    float(beta.ppf(tail, k, n - k + 1)) if k else 0.0,
                    float(beta.ppf(1 - tail, k + 1, n - k)) if k < n else 1.0]
        scenarios[name] = dict(
            seeds=len({r["seed"] for r in selected}), reasonable=cache[name]["reasonable"],
            calibration_loss=cache[name]["fit"]["loss"],
            true_factor_sim=cache[name]["fit"]["true_factor_sim"], summary=summary)
    verdict = {}
    for estimator in estimators:
        rows = [s["summary"][estimator] for s in scenarios.values()]
        verdict[estimator] = dict(
            passes=all(r["complete"] and "bias" in r and abs(r["bias"]) < us.PASS_BIAS
                       and r["coverage"] >= us.PASS_COVERAGE for r in rows),
            worst_abs_bias=max((abs(r["bias"]) for r in rows if "bias" in r), default=None),
            worst_coverage=min((r["coverage"] for r in rows if "coverage" in r), default=None),
            incomplete_scenarios=[n for n, s in scenarios.items() if not s["summary"][estimator]["complete"]])
    output = dict(
        source=SOURCE.name, replicate_rows=len(replicates), min_replicates=us.REPLICATES,
        rules=dict(pass_abs_bias=us.PASS_BIAS, pass_coverage=us.PASS_COVERAGE),
        note=("Summary of the replicates journal. B_detection_persistence ran in a separate batch "
              "(25 per scenario, target N_all); the other estimators ran in a first batch that is "
              "incomplete in four scenarios. Incomplete scenarios never pass."),
        scenarios=scenarios, verdict=verdict)
    OUTPUT.write_text(json.dumps(output, indent=2, default=float) + "\n")
    for name, s in scenarios.items():
        print(name, "true_factor", round(s["true_factor_sim"], 3), "reasonable", s["reasonable"])
        for e in estimators:
            r = s["summary"][e]
            print(f"  {e:26s} n={r['replicates']:3d} fail={r['failures']:2d} nonconv={r.get('nonconverged','-')} "
                  f"bias={r.get('bias', float('nan')):+.3f} cov={r.get('coverage', float('nan')):.2f}")
    print({k: (v["passes"], v["incomplete_scenarios"]) for k, v in verdict.items()})


if __name__ == "__main__":
    main()
