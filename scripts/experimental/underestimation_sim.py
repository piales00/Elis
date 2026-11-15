import json
import multiprocessing as mp
import os
import sys
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
from scipy import optimize
from scipy.special import expit, logit, ndtr

sys.path.insert(0, str(Path(__file__).resolve().parent))

from three_lists import config

PARAMS = ("mu", "sigma", "delta_a", "tau_a", "tau_s", "a_a", "b_a", "pmax_a", "a_s", "b_s", "pmax_s", "t0", "kappa")
POSITIVE = ("sigma", "tau_a", "tau_s", "b_a", "b_s", "t0")
UNIT = ("pmax_a", "pmax_s")
TAU_S = config.UNDER_SIM["TAU_S"]
START = config.UNDER_SIM["START"]
LOG_FRP_REF = config.UNDER_SIM["LOG_FRP_REF"]
NOAA20_LAG = config.UNDER_SIM["NOAA20_LAG"]
NOAA20_JITTER = config.UNDER_SIM["NOAA20_JITTER"]
OBSCURATION_SHARED_MINUTES = config.UNDER_SIM["OBSCURATION_SHARED_MINUTES"]
FIT_SAMPLE = config.UNDER_SIM["FIT_SAMPLE"]
SMOOTH_WIDTH = config.UNDER_SIM["SMOOTH_WIDTH"]
REPLICATE_ACTIVE = config.UNDER_SIM["REPLICATE_ACTIVE"]
REPLICATE_DAYS = config.UNDER_SIM["REPLICATE_DAYS"]
REPLICATE_YEARS = config.UNDER_SIM["REPLICATE_YEARS"]
REPLICATES = config.UNDER_SIM["REPLICATES"]
SLOW_REPLICATES = config.UNDER_SIM["SLOW_REPLICATES"]
WORKERS = config.N_JOBS
CALIBRATION_STARTS = config.UNDER_SIM["CALIBRATION_STARTS"]
SIGMA_GRID = config.UNDER_SIM["SIGMA_GRID"]
LIFETIME_MULTIPLIERS = config.UNDER_SIM["LIFETIME_MULTIPLIERS"]
MIXTURE = config.UNDER_SIM["MIXTURE"]
OBSCURATION = config.UNDER_SIM["OBSCURATION"]
ACCEPTABLE_LOSS_RATIO = config.UNDER_SIM["ACCEPTABLE_LOSS_RATIO"]
PASS_BIAS = config.UNDER_SIM["PASS_BIAS"]
PASS_COVERAGE = config.UNDER_SIM["PASS_COVERAGE"]
SCALES = config.UNDER_SIM["SCALES"]
DEFAULT_GAP = config.UNDER_SIM["DEFAULT_GAP"]
EXAM_PATH = config.INTERIM_DIR / "underestimation_exam.json"
SCENARIO_CACHE = config.INTERIM_DIR / "underestimation_scenarios.json"


def to_vector(params, free):
    out = []
    for k in free:
        v = params[k]
        out.append(np.log(v) if k in POSITIVE else logit(v) if k in UNIT else v)
    return np.array(out, dtype=float)


def from_vector(vector, free, fixed):
    params = dict(fixed)
    for k, v in zip(free, vector):
        params[k] = float(np.exp(v) if k in POSITIVE else expit(v) if k in UNIT else v)
    return params


def default_overpass(rng, size=200_000):
    gap = np.clip(rng.normal(DEFAULT_GAP["mean"], DEFAULT_GAP["sd"], size), -DEFAULT_GAP["limit"], DEFAULT_GAP["limit"])
    residual = rng.normal(0, DEFAULT_GAP["residual_sd"], size)
    return dict(gap=gap, residual_sim=residual, residual_other=residual)


def draw_cell_gap(day_gap, overpass, rng):
    sim = np.abs(day_gap) < config.SIMULTANEOUS_MAX_MINUTES
    residual = np.where(sim, rng.choice(overpass["residual_sim"], len(day_gap)),
                        rng.choice(overpass["residual_other"], len(day_gap)))
    return day_gap + residual


def lifetime(params, x):
    return params["t0"] * np.exp(params["kappa"] * (x - LOG_FRP_REF))


def sample_active(params, rng, size, scenario):
    x = params["mu"] + params["sigma"] * rng.standard_normal(size)
    mixture = scenario.get("mixture")
    if mixture:
        faint = rng.random(size) < mixture["weight"]
        x = np.where(faint, params["mu"] + mixture["shift"] * params["sigma"]
                     + mixture["scale"] * params["sigma"] * rng.standard_normal(size), x)
    return x


def sample_births(params, rng, size, scenario):
    pool = sample_active(params, rng, 4 * size + 1000, scenario)
    weight = 1 / lifetime(params, pool)
    return rng.choice(pool, size=size, p=weight / weight.sum())


def detect(params, sensor, x, rng):
    delta = params["delta_a"] if sensor == "a" else 0.0
    tau = params[f"tau_{'a' if sensor == 'a' else 's'}"]
    m = x + delta + tau * rng.standard_normal(len(x))
    key = "a" if sensor == "a" else "s"
    p = params[f"pmax_{key}"] * ndtr(params[f"a_{key}"] + params[f"b_{key}"] * m)
    return rng.random(len(x)) < p, m


def simulate(params, rng, overpass, scenario=None, active=REPLICATE_ACTIVE, days=REPLICATE_DAYS,
             years=REPLICATE_YEARS):
    scenario = scenario or {}
    day_gap = rng.choice(overpass["gap"], days)
    window = max(np.abs(day_gap).max() + 30, NOAA20_LAG + 10)
    n_active = rng.poisson(active)
    x0 = sample_active(params, rng, n_active, scenario)
    life0 = lifetime(params, x0)
    rate = active * np.mean(1 / lifetime(params, sample_active(params, rng, 200_000, scenario)))
    groups = []
    day0 = rng.integers(days, size=n_active)
    gap0 = draw_cell_gap(day_gap[day0], overpass, rng)
    forward, backward = rng.exponential(life0), rng.exponential(life0)
    tn0 = NOAA20_LAG + NOAA20_JITTER * rng.standard_normal(n_active)
    alive_a = np.where(gap0 >= 0, forward > gap0, backward > -gap0)
    groups.append(dict(x=x0, day=day0, gap=gap0, alive_s=np.ones(n_active, bool), alive_a=alive_a,
                       alive_n=forward > tn0, active=np.ones(n_active, bool)))
    for direction in ("after", "before"):
        n_births = rng.poisson(rate * window)
        xb = sample_births(params, rng, n_births, scenario)
        start = rng.uniform(0, window, n_births)
        end = start + rng.exponential(lifetime(params, xb))
        dayb = rng.integers(days, size=n_births)
        gapb = draw_cell_gap(day_gap[dayb], overpass, rng)
        tnb = NOAA20_LAG + NOAA20_JITTER * rng.standard_normal(n_births)
        if direction == "after":
            alive_a = (gapb > 0) & (start <= gapb) & (end > gapb)
            alive_n = (start <= tnb) & (end > tnb)
        else:
            alive_a = (gapb < 0) & (start <= -gapb) & (end > -gapb)
            alive_n = np.zeros(n_births, bool)
        keep = alive_a | alive_n
        groups.append(dict(x=xb[keep], day=dayb[keep], gap=gapb[keep], alive_s=np.zeros(keep.sum(), bool),
                           alive_a=alive_a[keep], alive_n=alive_n[keep], active=np.zeros(keep.sum(), bool)))
    units = {k: np.concatenate([g[k] for g in groups]) for k in groups[0]}
    size = len(units["x"])
    seen_a, la = detect(params, "a", units["x"], rng)
    seen_s, ls = detect(params, "s", units["x"], rng)
    seen_n, ln = detect(params, "n", units["x"], rng)
    c = scenario.get("obscuration", 0.0)
    if c:
        cloud_s = rng.random(size) < c
        shared = np.abs(units["gap"]) < OBSCURATION_SHARED_MINUTES
        cloud_a = np.where(shared, cloud_s, rng.random(size) < c)
        cloud_n = rng.random(size) < c
        seen_s &= ~cloud_s
        seen_a &= ~cloud_a
        seen_n &= ~cloud_n
    a = units["alive_a"] & seen_a
    s = units["alive_s"] & seen_s
    n = units["alive_n"] & seen_n
    observed = a | s | n
    sim_day = np.abs(day_gap) < config.SIMULTANEOUS_MAX_MINUTES
    day = units["day"][observed]
    frame = pd.DataFrame(dict(
        day=day, year=day * years // days, month=1 + (day * years * 12 // days) % 12, region="sim", gap=day_gap[day],
        a=a[observed].astype(np.int64), s=s[observed].astype(np.int64), n=n[observed].astype(np.int64),
        la=np.where(a, la, np.nan)[observed], ls=np.where(s, ls, np.nan)[observed],
        ln=np.where(n, ln, np.nan)[observed]))
    truth = dict(N_all=int(units["active"].sum()), N_sim=int((units["active"] & sim_day[units["day"]]).sum()))
    return frame, truth


def fit_sample(rng, overpass, size=FIT_SAMPLE):
    day_gap = rng.choice(overpass["gap"], size)
    return dict(z=rng.standard_normal(size), za=rng.standard_normal(size), zs=rng.standard_normal(size),
                zn=rng.standard_normal(size), zf=rng.standard_normal(size), u=rng.random(size),
                day_gap=day_gap, cell_gap=draw_cell_gap(day_gap, overpass, rng))


def _backend(use_jax):
    if use_jax:
        import jax.numpy as jnp
        from jax.scipy.special import expit as jexpit, ndtr as jndtr
        return jnp, jexpit, jndtr
    return np, expit, ndtr


def expected_facts(params, sample, scenario=None, targets=None, use_jax=False):
    xp, sig, phi = _backend(use_jax)
    scenario = scenario or {}
    soft = lambda values, threshold: sig((threshold - values) / SMOOTH_WIDTH)
    x = params["mu"] + params["sigma"] * sample["z"]
    mixture = scenario.get("mixture")
    if mixture:
        x = xp.where(sample["u"] < mixture["weight"],
                     params["mu"] + params["sigma"] * (mixture["shift"] + mixture["scale"] * sample["zf"]), x)
    ma = x + params["delta_a"] + params["tau_a"] * sample["za"]
    ms = x + params["tau_s"] * sample["zs"]
    mn = x + params["tau_s"] * sample["zn"]
    c = scenario.get("obscuration", 0.0)
    da = params["pmax_a"] * phi(params["a_a"] + params["b_a"] * ma) * (1 - c)
    ds = params["pmax_s"] * phi(params["a_s"] + params["b_s"] * ms) * (1 - c)
    dn = params["pmax_s"] * phi(params["a_s"] + params["b_s"] * mn) * (1 - c)
    life = params["t0"] * xp.exp(params["kappa"] * (x - LOG_FRP_REF))
    surv_a = xp.exp(-np.abs(sample["cell_gap"]) / life)
    surv_n = xp.exp(-NOAA20_LAG / life)
    shared = np.abs(sample["cell_gap"]) < OBSCURATION_SHARED_MINUTES
    joint = ds * da * surv_a * (np.where(shared, 1 / (1 - c), 1.0) if c else 1.0)
    gap = np.abs(sample["day_gap"])
    sim = (gap < config.SIMULTANEOUS_MAX_MINUTES).astype(float)
    total = lambda values, mask=None: (values if mask is None else values * mask).sum()
    out = {}
    edges = (0.0, 20.0, 40.0, 60.0, np.inf)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = ((gap >= lo) & (gap < hi)).astype(float)
        key = f"{int(lo)}-{int(hi) if np.isfinite(hi) else 'inf'}"
        out[f"coincidence_s_given_a_{key}"] = total(joint, mask) / total(da, mask)
        out[f"chapman_over_s_{key}"] = total(da, mask) / total(joint, mask)
    out["a_given_s_sim"] = total(joint, sim) / total(ds, sim)
    out["n_a_over_n_s_sim"] = total(da, sim) / total(ds, sim)
    for name, values, weight, edges_ in (("a_given_s_frp_s", ms, ds, (5.0, 20.0)),
                                         ("s_given_a_frp_a", ma, da, (10.0, 30.0))):
        below = [soft(values, cut) for cut in np.log(edges_)]
        for k, w in enumerate([below[0], below[1] - below[0], 1 - below[1]]):
            out[f"{name}_class{k}"] = total(joint * w, sim) / total(weight * w, sim)
    if targets is not None:
        for name, values, weight in (("log_frp_s", ms, ds), ("log_frp_a", ma, da)):
            for p in (10, 25, 50, 75, 90):
                out[f"{name}_cdf{p}"] = total(weight * soft(values, targets[f"{name}_q{p}"]), sim) / total(weight, sim)
    both = joint * sim
    weight = both / both.sum()
    mean_a, mean_s = (weight * ma).sum(), (weight * ms).sum()
    var_a, var_s = (weight * (ma - mean_a) ** 2).sum(), (weight * (ms - mean_s) ** 2).sum()
    cov = (weight * (ma - mean_a) * (ms - mean_s)).sum()
    out["doubles_log_frp_corr"] = cov / xp.sqrt(var_a * var_s)
    out["doubles_log_frp_diff_mean"] = mean_a - mean_s
    out["doubles_log_frp_diff_sd"] = xp.sqrt(xp.maximum(var_a + var_s - 2 * cov, 1e-12))
    below = [soft(ms, cut) for cut in np.log((5.0, 20.0))]
    pers = ds * dn * surv_n
    for k, w in enumerate([below[0], below[1] - below[0], 1 - below[1]]):
        out[f"persistence_n_given_s_class{k}"] = total(pers * w) / total(ds * w)
    out["persistence_n_given_s"] = total(pers) / total(ds)
    out["true_factor_sim"] = total(joint, sim) * sim.sum() / (total(ds, sim) * total(da, sim))
    out["true_p_s"] = ds.mean()
    out["true_p_a"] = da.mean()
    return out


def fact_targets(observed):
    targets = {k: v for k, v in observed.items() if not k.startswith("log_frp") and not k.startswith("chapman")
               and "60-inf" not in k}
    for name in ("log_frp_s", "log_frp_a"):
        for p in (10, 25, 50, 75, 90):
            targets[f"{name}_cdf{p}"] = p / 100
    return targets


def scale_of(key):
    if "cdf" in key:
        return SCALES["cdf"]
    if key.endswith("corr"):
        return SCALES["corr"]
    if "diff" in key:
        return SCALES["diff"]
    if key in ("n_a_over_n_s_sim", "a_given_s_sim"):
        return SCALES["ratio"]
    return SCALES["probability"]


def loss(params, sample, observed, scenario=None):
    targets = fact_targets(observed)
    model = expected_facts(params, sample, scenario, observed)
    return float(sum(((model[k] - v) / scale_of(k)) ** 2 for k, v in targets.items()))


def _jax_params(vector, free, fixed):
    import jax.numpy as jnp
    from jax.scipy.special import expit as jexpit

    params = {k: float(v) for k, v in fixed.items()}
    for i, k in enumerate(free):
        v = vector[i]
        params[k] = jnp.exp(v) if k in POSITIVE else jexpit(v) if k in UNIT else v
    return params


def vector_bounds(free):
    low = {k: v[0] for k, v in config.UNDER_SIM_BOUNDS.items()}
    high = {k: v[1] for k, v in config.UNDER_SIM_BOUNDS.items()}
    return np.column_stack((to_vector(low, free), to_vector(high, free)))


def calibrate(observed, sample, fixed=None, scenario=None, start=None):
    import jax
    import jax.numpy as jnp

    jax.config.update("jax_enable_x64", True)
    fixed = dict(dict(tau_s=TAU_S), **(fixed or {}))
    start = dict(START, **(start or {}))
    free = [k for k in PARAMS if k not in fixed]
    targets = fact_targets(observed)
    keys = list(targets)
    goal = jnp.array([targets[k] for k in keys])
    scale = jnp.array([scale_of(k) for k in keys])
    jsample = {k: jnp.asarray(v) if k in ("z", "za", "zs", "zn", "zf") else v for k, v in sample.items()}

    def objective(vector):
        model = expected_facts(_jax_params(vector, free, fixed), jsample, scenario, observed, use_jax=True)
        values = jnp.stack([model[k] for k in keys])
        return jnp.sum(((values - goal) / scale) ** 2)

    value_grad = jax.jit(jax.value_and_grad(objective))

    def wrapped(vector):
        value, grad = value_grad(jnp.asarray(vector))
        value, grad = float(value), np.asarray(grad, dtype=float)
        if not np.isfinite(value) or not np.all(np.isfinite(grad)):
            return 1e12, np.zeros_like(grad)
        return value, grad

    best = None
    for jitter in CALIBRATION_STARTS:
        vector = to_vector({**start, **fixed}, free)
        if jitter:
            vector = vector + jitter * np.random.default_rng(config.SEED + int(1e3 * jitter)).normal(size=len(vector))
        bounds = vector_bounds(free)
        vector = np.clip(vector, bounds[:, 0], bounds[:, 1])
        result = optimize.minimize(wrapped, vector, jac=True, method="L-BFGS-B", bounds=bounds,
                                   options=dict(maxiter=config.UNDER_FIT_MAXITER, ftol=1e-9, gtol=1e-6))
        if best is None or result.fun < best.fun:
            best = result
    params = from_vector(best.x, free, fixed)
    model = expected_facts(params, sample, scenario, observed)
    return dict(params=params, loss=float(best.fun), converged=bool(best.success), message=str(best.message), fixed=sorted(fixed),
                facts={k: dict(observed=targets[k], simulated=float(model[k])) for k in targets},
                true_factor_sim=float(model["true_factor_sim"]), true_p_s=float(model["true_p_s"]),
                true_p_a=float(model["true_p_a"]),
                chapman_over_s_sim=float(model["chapman_over_s_0-20"]))


def _worker_init(counter):
    with counter.get_lock():
        cores = sorted(os.sched_getaffinity(0))
        core = cores[counter.value % len(cores)]
        counter.value += 1
    os.sched_setaffinity(0, {core})
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[name] = "1"
    os.environ["XLA_FLAGS"] = "--xla_force_host_platform_device_count=1 --xla_cpu_multi_thread_eigen=false"


def run_replicate(job):
    import underestimation as u

    name, params, scenario, overpass, seed, estimators = job
    rng = np.random.default_rng(seed)
    frame, truth = simulate(params, rng, overpass, scenario)
    simulated_facts = u.facts(frame)
    out = dict(scenario=name, seed=seed, truth=truth, facts=simulated_facts, results={})
    estimators = list(estimators)
    if "main" in estimators and "Chapman_simultaneous" not in estimators:
        estimators.append("Chapman_simultaneous")
    for estimator in estimators:
        function = u.ESTIMATORS[estimator]
        started = perf_counter()
        try:
            result = function(frame, rng)
        except Exception as error:
            out["results"][estimator] = dict(error=repr(error))
            continue
        target = truth["N_all"] if estimator == "B_detection_persistence" else truth["N_sim"]
        out["results"][estimator] = dict(N=float(result["N"]), low=float(result["low"]), high=float(result["high"]),
                                         target=target, converged=result.get("converged"),
                                         hessian_positive=result.get("hessian_positive"),
                                         seconds=perf_counter() - started)
        if estimator == "main":
            out["results"]["main_all_days"] = dict(N=float(result["N_all"]), low=float(result["low_all"]),
                                                   high=float(result["high_all"]), target=truth["N_all"])
    with (config.INTERIM_DIR / "underestimation_replicates.jsonl").open("a") as stream:
        stream.write(json.dumps(out, default=float) + "\n")
    return out


def summarize(replicates):
    rows = {}
    for rep in replicates:
        for estimator, r in rep["results"].items():
            rows.setdefault(estimator, []).append(r)
    summary = {}
    for estimator, rs in rows.items():
        ok = [r for r in rs if "error" not in r and np.all(np.isfinite([r["N"], r["low"], r["high"]]))
              and r["low"] <= r["N"] <= r["high"]]
        if not ok:
            summary[estimator] = dict(replicates=len(rs), failures=len(rs))
            continue
        rel = np.array([r["N"] / r["target"] - 1 for r in ok])
        cover = np.array([r in ok and r["low"] <= r["target"] <= r["high"] for r in rs])
        width = np.array([(r["high"] - r["low"]) / r["target"] for r in ok])
        summary[estimator] = dict(replicates=len(rs), failures=len(rs) - len(ok), bias=float(rel.mean()),
                                  bias_mc_se=float(rel.std(ddof=1) / np.sqrt(len(rel))) if len(rel) > 1 else None,
                                  coverage_mc_se=float(np.sqrt(cover.mean() * (1 - cover.mean()) / len(rs))),
                                  bias_median=float(np.median(rel)), rmse=float(np.sqrt(np.mean(rel ** 2))),
                                  coverage=float(cover.mean()), mean_relative_width=float(width.mean()),
                                  nonconverged=int(sum(1 for r in ok if r.get("converged") is False)))
    return summary


def build_scenarios(observed, sample):
    best = calibrate(observed, sample)
    profile = []
    for sigma in SIGMA_GRID:
        fit = calibrate(observed, sample, fixed=dict(sigma=sigma), start=best["params"])
        profile.append(dict(sigma=sigma, loss=fit["loss"], true_factor_sim=fit["true_factor_sim"],
                            true_p_s=fit["true_p_s"], fit=fit))
        print(f"sigma={sigma:.2f} loss={fit['loss']:.1f} true_factor={fit['true_factor_sim']:.3f}", flush=True)
    limit = ACCEPTABLE_LOSS_RATIO * min(best["loss"], min(p["loss"] for p in profile))
    acceptable = [p for p in profile if p["loss"] <= limit]
    low = min(acceptable, key=lambda p: p["sigma"])
    high = max(acceptable, key=lambda p: p["sigma"])
    scenarios = {"best_fit": dict(fit=best, scenario={}, reasonable=True),
                 "heterogeneity_low": dict(fit=low["fit"], scenario={}, reasonable=True),
                 "heterogeneity_high": dict(fit=high["fit"], scenario={}, reasonable=True)}
    scenarios = {"best_fit": scenarios["best_fit"]}
    for heterogeneity, selected in (("low", low), ("high", high)):
        for flicker, multiplier in zip(("high", "low"), LIFETIME_MULTIPLIERS):
            params = dict(selected["fit"]["params"])
            params["t0"] *= multiplier
            model = expected_facts(params, sample, targets=observed)
            fit = dict(selected["fit"], params=params, loss=loss(params, sample, observed),
                       facts={k: dict(observed=v, simulated=float(model[k])) for k, v in fact_targets(observed).items()},
                       true_factor_sim=float(model["true_factor_sim"]), true_p_s=float(model["true_p_s"]),
                       true_p_a=float(model["true_p_a"]))
            scenarios[f"heterogeneity_{heterogeneity}_flicker_{flicker}"] = dict(
                fit=fit, scenario={}, reasonable=fit["loss"] <= limit)
    return scenarios, profile, limit


def finalize_exam(output, replicates):
    import underestimation as u
    from scipy.stats import beta

    for name, row in output["scenarios"].items():
        selected = [r for r in replicates if r["scenario"] == name]
        row["summary"] = summarize(selected)
        for estimator in list(u.ESTIMATORS) + ["main_all_days"]:
            summary = row["summary"].setdefault(estimator, dict(replicates=0, failures=0))
            summary["complete"] = summary["replicates"] >= REPLICATES
            if "coverage" in summary:
                n = summary["replicates"]
                covered = round(n * summary["coverage"])
                tail = (1 - config.CI_LEVEL) / 2
                summary["coverage_mc_interval"] = [float(beta.ppf(tail, covered, n - covered + 1)) if covered else 0.0,
                    float(beta.ppf(1 - tail, covered + 1, n - covered)) if covered < n else 1.0]
    output["verdict"] = {}
    for estimator in list(u.ESTIMATORS) + ["main_all_days"]:
        rows = [r["summary"][estimator] for r in output["scenarios"].values()]
        output["verdict"][estimator] = dict(
            passes=all(r["complete"] and "bias" in r and abs(r["bias"]) < PASS_BIAS
                       and r["coverage"] >= PASS_COVERAGE for r in rows),
            worst_abs_bias=max((abs(r["bias"]) for r in rows if "bias" in r), default=None),
            worst_coverage=min((r["coverage"] for r in rows if "coverage" in r), default=None))
    output["rules"].update(min_replicates=REPLICATES, finite_intervals_required=True)
    audit = config.INTERIM_DIR / "underestimation_calibration_audit.json"
    if audit.exists():
        output["calibration_audit"] = json.loads(audit.read_text())
    best = [r for r in replicates if r["scenario"] == "best_fit" and "main" in r["results"]]
    ratios = [r["results"]["Chapman_simultaneous"]["N"] / r["results"]["main"]["N"]
              for r in best if "N" in r["results"]["main"] and "Chapman_simultaneous" in r["results"]]
    output["chapman_over_main_simulated"] = float(np.mean(ratios)) if ratios else None
    output["workers"] = config.N_JOBS
    return output


def main():
    import underestimation as u

    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--elapsed-seconds", type=float, default=0.0)
    args = parser.parse_args()
    started = perf_counter() - args.elapsed_seconds
    print("Loading observed facts and calibrating bounded simulator", flush=True)
    rng = np.random.default_rng(config.SEED)
    con = u._connect()
    observed = u.observed_facts(con)
    overpass = u.overpass_distribution(con)
    con.close()
    sample = fit_sample(rng, overpass)
    if SCENARIO_CACHE.exists() and json.loads(SCENARIO_CACHE.read_text()).get("version") == config.UNDER_CACHE_VERSION:
        cached = json.loads(SCENARIO_CACHE.read_text())
        scenarios, profile, limit = cached["scenarios"], cached["profile"], cached["limit"]
    else:
        scenarios, profile, limit = build_scenarios(observed, sample)
        SCENARIO_CACHE.write_text(json.dumps(dict(version=config.UNDER_CACHE_VERSION, scenarios=scenarios, profile=profile, limit=limit), default=float))
    journal = config.INTERIM_DIR / "underestimation_replicates.jsonl"
    saved = [json.loads(line) for line in journal.read_text().splitlines()] if args.resume and journal.exists() else []
    if not args.resume:
        journal.write_text("")
    import underestimation_audit

    underestimation_audit.main()
    jobs = []
    seeds = np.random.SeedSequence(config.SEED).spawn(len(scenarios) * config.UNDER_SEED_BLOCK)
    fast = [k for k in u.ESTIMATORS if k not in u.SLOW_ESTIMATORS]
    for i, (name, spec) in enumerate(scenarios.items()):
        for r in range(REPLICATES + SLOW_REPLICATES):
            offset = r if r < REPLICATES else config.UNDER_SLOW_SEED_OFFSET + r - REPLICATES
            seed = int(seeds[i * config.UNDER_SEED_BLOCK + offset].generate_state(1)[0])
            chosen = list(u.SLOW_ESTIMATORS) if r >= REPLICATES else fast
            jobs.append((name, spec["fit"]["params"], spec["scenario"], overpass, seed, chosen))
    expected = {(j[0], j[4]) for j in jobs}
    replicates = [r for r in saved if (r["scenario"], r["seed"]) in expected]
    complete = {(r["scenario"], r["seed"]) for r in replicates}
    jobs = [j for j in jobs if (j[0], j[4]) not in complete]
    jobs.sort(key=lambda job: job[-1] != list(u.SLOW_ESTIMATORS))
    print(f"Running {len(jobs)} replicates on {WORKERS} workers", flush=True)
    ctx = mp.get_context("spawn")
    counter = ctx.Value("i", 1)
    with ctx.Pool(WORKERS, initializer=_worker_init, initargs=(counter,)) as pool:
        pending = pool.imap_unordered(run_replicate, jobs)
        for k in range(len(jobs)):
            remaining = config.UNDER_TIME_LIMIT_SECONDS - (perf_counter() - started)
            try:
                if remaining <= 0:
                    raise mp.TimeoutError()
                rep = pending.next(timeout=remaining)
            except mp.TimeoutError:
                print("Compute budget exhausted; incomplete estimators cannot pass.", flush=True)
                pool.terminate()
                break
            replicates.append(rep)
            if (k + 1) % 5 == 0:
                print(f"  {k + 1}/{len(jobs)} ({perf_counter() - started:.0f} s)", flush=True)
    results = {}
    for name, spec in scenarios.items():
        reps = [r for r in replicates if r["scenario"] == name]
        sim_facts = {k: float(np.mean([r["facts"][k] for r in reps])) for k in (reps[0]["facts"] if reps else {})}
        results[name] = dict(reasonable=spec["reasonable"], scenario=spec["scenario"], params=spec["fit"]["params"],
                             fit_loss=spec["fit"]["loss"], expected_true_factor_sim=spec["fit"]["true_factor_sim"],
                             true_p_s=spec["fit"]["true_p_s"], true_p_a=spec["fit"]["true_p_a"],
                             facts_expected=spec["fit"]["facts"], facts_replicates_mean=sim_facts,
                             truth_mean=dict(N_sim=(float(np.mean([r["truth"]["N_sim"] for r in reps])) if reps else None),
                                             N_all=(float(np.mean([r["truth"]["N_all"] for r in reps])) if reps else None)),
                             summary=summarize([r for r in replicates if r["scenario"] == name]))
    output = dict(
        observed_facts=observed,
        overpass=dict(gap_quantiles=np.quantile(overpass["gap"], (0.05, 0.25, 0.5, 0.75, 0.95)).tolist(),
                      simultaneous_share=float(np.mean(np.abs(overpass["gap"]) < config.SIMULTANEOUS_MAX_MINUTES))),
        sigma_profile=[{k: v for k, v in p.items() if k != "fit"} | dict(params=p["fit"]["params"]) for p in profile],
        acceptable_loss=limit, scenarios=results, verdict={},
        rules=dict(pass_abs_bias=PASS_BIAS, pass_coverage=PASS_COVERAGE, only_reasonable_scenarios=False),
        constants=dict(fit_sample=FIT_SAMPLE, smooth_width=SMOOTH_WIDTH, replicate_active=REPLICATE_ACTIVE,
                       replicate_days=REPLICATE_DAYS, replicate_years=REPLICATE_YEARS, replicates=REPLICATES, slow_replicates=SLOW_REPLICATES,
                       sigma_grid=SIGMA_GRID, lifetime_multipliers=LIFETIME_MULTIPLIERS, mixture=MIXTURE,
                       tau_s=TAU_S, obscuration=OBSCURATION, obscuration_shared_minutes=OBSCURATION_SHARED_MINUTES,
                       acceptable_loss_ratio=ACCEPTABLE_LOSS_RATIO, noaa20_lag=NOAA20_LAG,
                       noaa20_jitter=NOAA20_JITTER, scales=SCALES, seed=config.SEED, log_frp_ref=float(LOG_FRP_REF)),
        seconds=perf_counter() - started,
    )
    output = finalize_exam(output, replicates)
    EXAM_PATH.write_text(json.dumps(output, indent=2, default=float) + "\n")
    for name, res in results.items():
        print(f"\n{name} (reasonable={res['reasonable']}, true factor {res['expected_true_factor_sim']:.3f})")
        for estimator, s in res["summary"].items():
            if "bias" in s:
                print(f"  {estimator:26s} bias={s['bias']:+.3f} coverage={s['coverage']:.2f} fail={s['failures']}")
    print("\nVerdict:", {k: v["passes"] for k, v in output["verdict"].items()})
    print(f"Created: {EXAM_PATH.name} ({perf_counter() - started:.0f} s)")


if __name__ == "__main__":
    main()
