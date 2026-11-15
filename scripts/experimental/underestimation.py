import json
import os
import sys
from datetime import date
from pathlib import Path
from time import perf_counter
from statistics import NormalDist

os.environ.setdefault("XLA_FLAGS", "--xla_force_host_platform_device_count=1")

import jax
import jax.numpy as jnp
import numpy as np
import pandas as pd
from jax.scipy.special import expit, log_ndtr, ndtr
from scipy import optimize
from scipy.special import expit as scipy_expit

sys.path.insert(0, str(Path(__file__).resolve().parent))

import three_lists as tl
from three_lists import config

jax.config.update("jax_enable_x64", True)

TWO_LIST_YEARS = config.CALIBRATION_YEARS
THREE_LIST_START, THREE_LIST_END = tl.MAIN_START, tl.MAIN_END
STABILITY_YEARS = config.UNDER_ESTIMATOR["STABILITY_YEARS"]
NOAA20_LAG = config.UNDER_ESTIMATOR["NOAA20_LAG"]
LOG_BIN = config.UNDER_ESTIMATOR["LOG_BIN"]
LOG_BIN_THREE = config.UNDER_ESTIMATOR["LOG_BIN_THREE"]
GAP_BIN = config.UNDER_ESTIMATOR["GAP_BIN"]
GH_NODES = config.UNDER_ESTIMATOR["GH_NODES"]
HESSIAN_STEP = config.UNDER_ESTIMATOR["HESSIAN_STEP"]
FRP_FLOOR = config.UNDER_ESTIMATOR["FRP_FLOOR"]
S_CLASS_EDGES = config.UNDER_ESTIMATOR["S_CLASS_EDGES"]
A_CLASS_EDGES = config.UNDER_ESTIMATOR["A_CLASS_EDGES"]
COINCIDENCE_GAP_EDGES = config.UNDER_ESTIMATOR["COINCIDENCE_GAP_EDGES"]
FRP_QUANTILES = config.UNDER_ESTIMATOR["FRP_QUANTILES"]
DRY_MONTHS = config.UNDER_ESTIMATOR["DRY_MONTHS"]
BOOTSTRAP = config.UNDER_ESTIMATOR["BOOTSTRAP"]
LATENT_CLASS_STARTS = config.UNDER_ESTIMATOR["LATENT_CLASS_STARTS"]
LATENT_CLASS_DRAWS = config.UNDER_ESTIMATOR["LATENT_CLASS_DRAWS"]
MAX_UNSEEN_SHARE = config.UNDER_ESTIMATOR["MAX_UNSEEN_SHARE"]
PAD = config.UNDER_ESTIMATOR["PAD"]
Z = NormalDist().inv_cdf((1 + config.CI_LEVEL) / 2)
EXAM_PATH = config.INTERIM_DIR / "underestimation_exam.json"
FACTOR_PATH = config.INTERIM_DIR / "underestimation_factor.json"
GH_T, GH_W = np.polynomial.hermite.hermgauss(GH_NODES)
GH_X = jnp.asarray(np.sqrt(2.0) * GH_T)
GH_P = jnp.asarray(GH_W / np.sqrt(np.pi))
A2_NAMES = ("mu", "log_sigma", "delta_a", "log_tau_a", "log_tau_s", "a_a", "log_b_a", "logit_pmax_a",
            "a_s", "log_b_s", "logit_pmax_s")
B_NAMES = A2_NAMES + ("log_t0", "kappa")
A2_START = np.array(config.UNDER_ESTIMATOR["A2_START"])
B_START = np.r_[A2_START, np.log(80.0), 0.5]
LOG_FRP_REF = config.UNDER_ESTIMATOR["LOG_FRP_REF"]


def simultaneous(gap):
    return np.abs(gap) < config.SIMULTANEOUS_MAX_MINUTES


def two_list_simultaneous(frame):
    keep = simultaneous(frame["gap"].to_numpy()) & ((frame["a"].to_numpy() + frame["s"].to_numpy()) > 0)
    return frame[keep].reset_index(drop=True)


def chapman(n1, n2, m):
    return (n1 + 1) * (n2 + 1) / (m + 1) - 1


def lognormal_interval(estimate, se, floor=0.0):
    excess = max(estimate - floor, 1e-9)
    spread = np.exp(Z * se / excess)
    return floor + excess / spread, floor + excess * spread


def block_draws(frame, rng, draws=BOOTSTRAP):
    years = np.unique(frame["year"])
    index = {y: np.flatnonzero(frame["year"].to_numpy() == y) for y in years}
    for _ in range(draws):
        pick = rng.choice(years, size=len(years), replace=True)
        yield np.concatenate([index[y] for y in pick])


def counts(frame):
    a, s = frame["a"].to_numpy(), frame["s"].to_numpy()
    return int(a.sum()), int(s.sum()), int((a * s).sum())


def pooled_estimate(frame, rng, draws=BOOTSTRAP):
    sim = frame[simultaneous(frame["gap"].to_numpy())]
    n_a, n_s, m = counts(sim)
    point = chapman(n_a, n_s, m)
    replicates = []
    for idx in block_draws(sim, rng, draws):
        part = sim.iloc[idx]
        ra, rs, rm = counts(part)
        replicates.append(n_s * chapman(ra, rs, rm) / rs)
    low, high = np.quantile(replicates, ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2))
    scale = frame["s"].sum() / n_s
    return dict(N=point, low=min(low, point), high=max(high, point), n_a=n_a, n_s=n_s, m=m,
                N_all=point * scale, low_all=min(low, point) * scale, high_all=max(high, point) * scale)


def chapman_simultaneous(frame, rng):
    from capture_recapture import chapman_ci

    sim = two_list_simultaneous(frame)
    na, ns, m = counts(sim)
    low, high = chapman_ci(na, ns, m, config.CI_LEVEL)
    return dict(N=chapman(na, ns, m), low=low, high=high)


def main_estimate(frame, rng, draws=BOOTSTRAP):
    years = np.sort(frame["year"].unique())
    sampled = rng.integers(len(years), size=(draws, len(years)))
    point = total = 0.0
    sim_draws, all_draws = np.zeros(draws), np.zeros(draws)
    for _, region in frame.groupby("region"):
        sim = region[simultaneous(region["gap"].to_numpy())].copy()
        sim["both"] = sim["a"] * sim["s"]
        annual = sim.groupby(["year", "month"])[["a", "s", "both"]].sum()
        for month in range(1, 13):
            ns = sim.loc[sim.month == month, "s"].sum()
            ns_all = region.loc[region.month == month, "s"].sum()
            if not ns_all:
                continue
            for support in ([month], sorted({(month - 2) % 12 + 1, month, month % 12 + 1}), list(range(1, 13))):
                values = np.array([annual.reindex(pd.MultiIndex.from_product([[y], support]), fill_value=0).sum().to_numpy()
                                   for y in years])
                na, sn, m = values.sum(axis=0)
                if m >= config.MIN_RECAPTURES:
                    break
            if not sn:
                raise ValueError("No S-NPP calibration detections")
            ratio = chapman(na, sn, m) / sn
            ra, rs, rm = values[sampled].sum(axis=1).T
            if np.any(rs == 0):
                raise ValueError("Zero S-NPP bootstrap count")
            ratios = chapman(ra, rs, rm) / rs
            point += ns * ratio
            total += ns_all * ratio
            sim_draws += ns * ratios
            all_draws += ns_all * ratios
    tails = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
    low, high = np.quantile(sim_draws, tails)
    low_all, high_all = np.quantile(all_draws, tails)
    return dict(N=point, low=min(low, point), high=max(high, point),
                N_all=total, low_all=min(low_all, total), high_all=max(high_all, total))


def _logistic_fit(x, y):
    design = np.column_stack([np.ones_like(x), x])
    beta = np.zeros(2)
    for _ in range(50):
        p = 1 / (1 + np.exp(-design @ beta))
        w = np.clip(p * (1 - p), 1e-9, None)
        step = np.linalg.solve(design.T @ (design * w[:, None]) + 1e-9 * np.eye(2), design.T @ (y - p))
        beta += step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def _huggins_ht(frame):
    a, s = frame["a"].to_numpy(), frame["s"].to_numpy()
    la, ls = frame["la"].to_numpy(), frame["ls"].to_numpy()
    both = (a == 1) & (s == 1)
    sa = np.polyfit(la[both], ls[both], 1)
    as_ = np.polyfit(ls[both], la[both], 1)
    beta_a = _logistic_fit(ls[s == 1], a[s == 1].astype(float))
    beta_s = _logistic_fit(la[a == 1], s[a == 1].astype(float))
    zs = np.where(s == 1, ls, np.polyval(sa, la))
    za = np.where(a == 1, la, np.polyval(as_, ls))
    p_a = 1 / (1 + np.exp(-(beta_a[0] + beta_a[1] * zs)))
    p_s = 1 / (1 + np.exp(-(beta_s[0] + beta_s[1] * za)))
    pi = 1 - (1 - p_a) * (1 - p_s)
    return float(np.sum(1 / pi))


def huggins_imputed(frame, rng, draws=BOOTSTRAP):
    sim = two_list_simultaneous(frame)
    point = _huggins_ht(sim)
    replicates = [_huggins_ht(sim.iloc[idx]) * sim["s"].sum() / sim["s"].to_numpy()[idx].sum()
                  for idx in block_draws(sim, rng, draws)]
    low, high = np.quantile(replicates, ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2))
    return dict(N=point, low=min(low, point), high=max(high, point))


def _binned(values, width):
    return np.where(np.isfinite(values), np.round(values / width) * width, 0.0)


def _pad(arrays, counts_):
    size = int(np.ceil(len(counts_) / PAD) * PAD)
    extra = size - len(counts_)
    return [np.r_[v, np.zeros(extra, dtype=v.dtype)] for v in arrays], np.r_[counts_, np.zeros(extra)]


def two_list_groups(frame):
    table = pd.DataFrame(dict(a=frame["a"].to_numpy(), s=frame["s"].to_numpy(),
                              ma=_binned(frame["la"].to_numpy(), LOG_BIN),
                              ms=_binned(frame["ls"].to_numpy(), LOG_BIN)))
    grouped = table.groupby(["a", "s", "ma", "ms"], sort=False).size().reset_index(name="c")
    arrays, c = _pad([grouped[k].to_numpy() for k in ("a", "s", "ma", "ms")], grouped["c"].to_numpy(float))
    return tuple(jnp.asarray(v) for v in arrays) + (jnp.asarray(c),)


def three_list_groups(frame):
    gap = frame["gap"].to_numpy()
    table = pd.DataFrame(dict(a=frame["a"].to_numpy(), s=frame["s"].to_numpy(), n=frame["n"].to_numpy(),
                              ma=_binned(frame["la"].to_numpy(), LOG_BIN_THREE),
                              ms=_binned(frame["ls"].to_numpy(), LOG_BIN_THREE),
                              mn=_binned(frame["ln"].to_numpy(), LOG_BIN_THREE),
                              gap=np.round(gap / GAP_BIN) * GAP_BIN))
    grouped = table.groupby(["a", "s", "n", "ma", "ms", "mn", "gap"], sort=False).size().reset_index(name="c")
    arrays, c = _pad([grouped[k].to_numpy() for k in ("a", "s", "n", "ma", "ms", "mn", "gap")],
                     grouped["c"].to_numpy(float))
    return tuple(jnp.asarray(v) for v in arrays) + (jnp.asarray(c),)


def _sensor(theta_part, delta):
    a0, log_b, logit_pmax, log_tau = theta_part
    b, pmax, tau = jnp.exp(log_b), expit(logit_pmax), jnp.exp(log_tau)
    return a0, b, pmax, tau, delta


def _marginal(sensor, x):
    a0, b, pmax, tau, delta = sensor
    return pmax * ndtr((a0 + b * (x + delta)) / jnp.sqrt(1 + (b * tau) ** 2))


def _log_detection(sensor, m):
    a0, b, pmax, tau, delta = sensor
    return jnp.log(pmax) + log_ndtr(a0 + b * m)


def _unpack(theta):
    mu, log_sigma = theta[0], theta[1]
    x = mu + jnp.exp(log_sigma) * GH_X
    sensor_a = _sensor((theta[5], theta[6], theta[7], theta[3]), theta[2])
    sensor_s = _sensor((theta[8], theta[9], theta[10], theta[4]), 0.0)
    return x, sensor_a, sensor_s


def _posterior(theta, measurements):
    mu, sigma = theta[0], jnp.exp(theta[1])
    precision = 1 / sigma ** 2
    linear = mu / sigma ** 2
    quadratic = mu ** 2 / sigma ** 2
    log_norm = -jnp.log(sigma) - 0.5 * jnp.log(2 * np.pi)
    for detected, m, sensor in measurements:
        _, _, _, tau, delta = sensor
        y = m - delta
        d = detected.astype(float)
        precision = precision + d / tau ** 2
        linear = linear + d * y / tau ** 2
        quadratic = quadratic + d * y ** 2 / tau ** 2
        log_norm = log_norm - d * (jnp.log(tau) + 0.5 * jnp.log(2 * np.pi))
    log_z = log_norm - 0.5 * (quadratic - linear ** 2 / precision) + 0.5 * jnp.log(2 * np.pi / precision)
    nodes = (linear / precision)[:, None] + GH_X[None, :] / jnp.sqrt(precision)[:, None]
    detection = sum(jnp.where(detected == 1, _log_detection(sensor, m), 0.0) for detected, m, sensor in measurements)
    return nodes, log_z + detection


@jax.jit
def _two_list_terms(theta, a, s, ma, ms):
    x, sensor_a, sensor_s = _unpack(theta)
    nodes, log_base = _posterior(theta, ((a, ma, sensor_a), (s, ms, sensor_s)))
    miss_a = jnp.where(a[:, None] == 1, 1.0, 1 - _marginal(sensor_a, nodes))
    miss_s = jnp.where(s[:, None] == 1, 1.0, 1 - _marginal(sensor_s, nodes))
    log_likelihood = log_base + jnp.log(jnp.maximum((miss_a * miss_s) @ GH_P, 1e-300))
    unseen = jnp.sum(GH_P * (1 - _marginal(sensor_a, x)) * (1 - _marginal(sensor_s, x)))
    return log_likelihood, unseen


def _two_list_nll(theta, a, s, ma, ms, c):
    log_likelihood, unseen = _two_list_terms(theta, a, s, ma, ms)
    return -(jnp.sum(c * log_likelihood) - jnp.sum(c) * jnp.log1p(-unseen))


_two_list_value_grad = jax.jit(jax.value_and_grad(_two_list_nll))


def _unseen_two(theta):
    x, sensor_a, sensor_s = _unpack(theta)
    return jnp.sum(GH_P * (1 - _marginal(sensor_a, x)) * (1 - _marginal(sensor_s, x)))


def _two_list_n(theta, c):
    return jnp.sum(c) / (1 - _unseen_two(theta))


_two_list_n_grad = jax.jit(jax.grad(_two_list_n))


def _fit(value_grad, start, args):
    best = None
    for jitter in (0.0, 0.3):
        x0 = np.asarray(start) + jitter * np.random.default_rng(config.SEED).normal(size=len(start))
        result = optimize.minimize(lambda t: tuple(np.asarray(v, dtype=float) for v in value_grad(jnp.asarray(t), *args)),
                                   x0, jac=True, method="L-BFGS-B", options=dict(maxiter=2000))
        if best is None or result.fun < best.fun:
            best = result
        if best.success:
            break
    return best


def _hessian(value_grad, theta, args, step=HESSIAN_STEP):
    theta = np.asarray(theta, dtype=float)
    columns = []
    for i in range(len(theta)):
        shift = np.zeros_like(theta)
        shift[i] = step
        plus = np.asarray(value_grad(jnp.asarray(theta + shift), *args)[1])
        minus = np.asarray(value_grad(jnp.asarray(theta - shift), *args)[1])
        columns.append((plus - minus) / (2 * step))
    hessian = np.column_stack(columns)
    return (hessian + hessian.T) / 2


def _delta_se(hessian, gradient, sampling_var):
    hessian = np.asarray(hessian)
    gradient = np.asarray(gradient)
    try:
        cov = np.linalg.pinv(hessian)
        var = float(gradient @ cov @ gradient)
    except np.linalg.LinAlgError:
        var = np.nan
    return float(np.sqrt(max(var, 0.0) + sampling_var)), bool(np.all(np.linalg.eigvalsh((hessian + hessian.T) / 2) > 0))


def latent_two_list(frame, start=A2_START, interval=True):
    sim = two_list_simultaneous(frame)
    groups = two_list_groups(sim)
    result = _fit(_two_list_value_grad, start, groups)
    theta = jnp.asarray(result.x)
    c = groups[-1]
    unseen = float(_unseen_two(theta))
    n = float(jnp.sum(c))
    estimate = n / (1 - unseen)
    se, positive = (_delta_se(_hessian(_two_list_value_grad, theta, groups), _two_list_n_grad(theta, c),
                              n * unseen / (1 - unseen) ** 2) if interval else (np.nan, None))
    low, high = lognormal_interval(estimate, se, n)
    _, sensor_a, sensor_s = _unpack(theta)
    x = _unpack(theta)[0]
    return dict(N=estimate, low=low, high=high, se=se, converged=bool(result.success), hessian_positive=positive,
                theta=dict(zip(A2_NAMES, map(float, result.x))), unseen_share=unseen,
                p_s_mean=float(jnp.sum(GH_P * _marginal(sensor_s, x))),
                p_a_mean=float(jnp.sum(GH_P * _marginal(sensor_a, x))), nll=float(result.fun))


def _lifetime(theta, x):
    return jnp.exp(theta[11] + theta[12] * (x - LOG_FRP_REF))


def _patterns(gap, life):
    g = gap[:, None]
    d = jnp.abs(g)
    life = life if life.ndim == 2 else life[None, :]
    surv = lambda t: jnp.exp(-t / life)
    lag = NOAA20_LAG
    s_d, s_n = surv(d), surv(lag)
    hi, lo = jnp.maximum(d, lag), jnp.minimum(d, lag)
    s_hi, s_lo, s_gap = surv(hi), surv(lo), surv(hi - lo)
    after = g > 0
    early = d < lag
    w = {}
    w[(1, 1, 1)] = jnp.where(after, s_hi, s_d * s_n)
    w[(1, 1, 0)] = jnp.where(after, jnp.where(early, s_d - s_n, 0.0), s_d * (1 - s_n))
    w[(1, 0, 1)] = jnp.where(after, jnp.where(early, 0.0, s_n - s_d), (1 - s_d) * s_n)
    w[(1, 0, 0)] = jnp.where(after, 1 - s_lo, (1 - s_d) * (1 - s_n))
    w[(0, 1, 1)] = jnp.where(after, s_gap - s_hi, 0.0)
    w[(0, 1, 0)] = jnp.where(after, jnp.where(early, (1 - s_d) - (s_gap - s_n), 1 - s_gap), 1 - s_d)
    w[(0, 0, 1)] = jnp.where(after, jnp.where(early, 1 - s_gap, (1 - s_n) - (s_gap - s_d)), 1 - s_n)
    return w


def _alive_term(detected, marginal, alive):
    if not alive:
        return jnp.where(detected[:, None] == 1, 0.0, 1.0)
    return jnp.where(detected[:, None] == 1, 1.0, 1 - marginal)


@jax.jit
def _three_list_terms(theta, a, s, n, ma, ms, mn, gap):
    x, sensor_a, sensor_s = _unpack(theta)
    nodes, log_base = _posterior(theta, ((a, ma, sensor_a), (s, ms, sensor_s), (n, mn, sensor_s)))
    pa_g, ps_g = _marginal(sensor_a, nodes), _marginal(sensor_s, nodes)
    w_g = _patterns(gap, _lifetime(theta, nodes))
    mixture = 0.0
    for (zs, za, zn), weight in w_g.items():
        mixture = mixture + weight * (_alive_term(s, ps_g, zs) * _alive_term(a, pa_g, za) * _alive_term(n, ps_g, zn))
    log_likelihood = log_base + jnp.log(jnp.maximum(mixture @ GH_P, 1e-300))
    pa, ps = _marginal(sensor_a, x)[None, :], _marginal(sensor_s, x)[None, :]
    seen = 0.0
    for (zs, za, zn), weight in _patterns(gap, _lifetime(theta, x)).items():
        missed = (1 - ps if zs else 1.0) * (1 - pa if za else 1.0) * (1 - ps if zn else 1.0)
        seen = seen + weight * (1 - missed)
    return log_likelihood, seen @ GH_P


def _three_list_nll(theta, a, s, n, ma, ms, mn, gap, c):
    log_likelihood, seen = _three_list_terms(theta, a, s, n, ma, ms, mn, gap)
    return -jnp.sum(c * (log_likelihood - jnp.log(seen)))


def _three_list_n(theta, a, s, n, ma, ms, mn, gap, c):
    return jnp.sum(c / _three_list_terms(theta, a, s, n, ma, ms, mn, gap)[1])


_three_list_value_grad = jax.jit(jax.value_and_grad(_three_list_nll))
_three_list_n_grad = jax.jit(jax.grad(_three_list_n))


def latent_persistence(frame, start=B_START, interval=True):
    data = frame[np.isfinite(frame["gap"].to_numpy())]
    groups = three_list_groups(data)
    result = _fit(_three_list_value_grad, start, groups)
    theta = jnp.asarray(result.x)
    estimate = float(_three_list_n(theta, *groups))
    seen = np.asarray(_three_list_terms(theta, *groups[:-1])[1])
    c = np.asarray(groups[-1])
    sampling = float(np.sum(c / seen * np.clip(1 / seen - 1, 0, None)))
    se, positive = (_delta_se(_hessian(_three_list_value_grad, theta, groups), _three_list_n_grad(theta, *groups), sampling)
                    if interval else (np.nan, None))
    low, high = lognormal_interval(estimate, se)
    x, sensor_a, sensor_s = _unpack(theta)
    persistence = jnp.exp(-NOAA20_LAG / _lifetime(theta, x))
    return dict(N=estimate, low=low, high=high, se=se, converged=bool(result.success), hessian_positive=positive,
                theta=dict(zip(B_NAMES, map(float, result.x))),
                p_s_mean=float(jnp.sum(GH_P * _marginal(sensor_s, x))),
                persistence_50_mean=float(jnp.sum(GH_P * persistence)), nll=float(result.fun))


def _history_counts(frame):
    codes = frame["a"].to_numpy() * 4 + frame["s"].to_numpy() * 2 + frame["n"].to_numpy()
    return np.array([np.sum(codes == h[0] * 4 + h[1] * 2 + h[2]) for h in tl.HISTORIES], dtype=float)


def _latent_class_probs(theta):
    weight = scipy_expit(theta[0])
    pa = scipy_expit(theta[1:3])
    ps = scipy_expit(theta[3:5])
    h = np.array([(0, 0, 0), *tl.HISTORIES], dtype=float)
    out = np.zeros(8)
    for k, share in enumerate((weight, 1 - weight)):
        out += share * (pa[k] ** h[:, 0] * (1 - pa[k]) ** (1 - h[:, 0]) * ps[k] ** h[:, 1]
                        * (1 - ps[k]) ** (1 - h[:, 1]) * ps[k] ** h[:, 2] * (1 - ps[k]) ** (1 - h[:, 2]))
    return out


def _latent_class_fit(x, rng):
    def nll(theta):
        p = _latent_class_probs(theta)
        return -float(x @ np.log(np.maximum(p[1:], 1e-300)) - x.sum() * np.log1p(-min(p[0], 1 - 1e-12)))

    best = None
    for _ in range(LATENT_CLASS_STARTS):
        result = optimize.minimize(nll, rng.normal(0, 1.5, 5), method="Nelder-Mead",
                                   options=dict(maxiter=4000, xatol=1e-7, fatol=1e-9))
        if best is None or result.fun < best.fun:
            best = result
    p0 = _latent_class_probs(best.x)[0]
    return x.sum() / (1 - p0), best


def latent_class(frame, rng, draws=LATENT_CLASS_DRAWS):
    sim = frame[simultaneous(frame["gap"].to_numpy())]
    x = _history_counts(sim)
    estimate, fit = _latent_class_fit(x, rng)
    p = _latent_class_probs(fit.x)
    if p[0] > MAX_UNSEEN_SHARE:
        return dict(N=np.nan, low=np.nan, high=np.nan, identifiable=False)
    expected = x.sum() * p[1:] / (1 - p[0])
    replicates = [_latent_class_fit(rng.poisson(expected).astype(float), rng)[0] for _ in range(draws)]
    replicates = np.where(np.isfinite(replicates), replicates, np.inf)
    low, high = np.quantile(replicates, ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2))
    return dict(N=float(estimate), low=float(min(low, estimate)), high=float(max(high, estimate)),
                class_share=float(scipy_expit(fit.x[0])),
                p_a=scipy_expit(fit.x[1:3]).tolist(), p_s=scipy_expit(fit.x[3:5]).tolist())


def pairwise_loglinear(frame, rng, draws=BOOTSTRAP):
    sim = frame[simultaneous(frame["gap"].to_numpy())]
    x = _history_counts(sim)
    if np.any(x == 0):
        return dict(N=np.nan, low=np.nan, high=np.nan)
    fit = tl.bootstrap_mle(x, True, draws, rng)
    return dict(N=fit["N"], low=fit["low"], high=fit["high"])


def facts(frame):
    a, s, n = (frame[k].to_numpy() for k in ("a", "s", "n"))
    la, ls = frame["la"].to_numpy(), frame["ls"].to_numpy()
    gap = np.abs(frame["gap"].to_numpy())
    sim = gap < config.SIMULTANEOUS_MAX_MINUTES
    out = {}
    for lo, hi in zip(COINCIDENCE_GAP_EDGES[:-1], COINCIDENCE_GAP_EDGES[1:]):
        mask = (gap >= lo) & (gap < hi)
        na, ns, m = a[mask].sum(), s[mask].sum(), (a * s)[mask].sum()
        key = f"{int(lo)}-{int(hi) if np.isfinite(hi) else 'inf'}"
        out[f"coincidence_s_given_a_{key}"] = m / na if na else np.nan
        out[f"chapman_over_s_{key}"] = chapman(na, ns, m) / ns if ns else np.nan
    na, ns, m = a[sim].sum(), s[sim].sum(), (a * s)[sim].sum()
    out["a_given_s_sim"] = m / ns
    out["n_a_over_n_s_sim"] = na / ns
    for name, values, other, edges, given in (("a_given_s_frp_s", ls, a, S_CLASS_EDGES, s),
                                              ("s_given_a_frp_a", la, s, A_CLASS_EDGES, a)):
        cuts = np.log(edges)
        for k, (lo, hi) in enumerate(zip((-np.inf, *cuts), (*cuts, np.inf))):
            mask = sim & (given == 1) & (values >= lo) & (values < hi)
            out[f"{name}_class{k}"] = other[mask].mean() if mask.any() else np.nan
    for name, values, given in (("log_frp_s", ls, s), ("log_frp_a", la, a)):
        q = np.quantile(values[sim & (given == 1)], FRP_QUANTILES)
        for p, v in zip(FRP_QUANTILES, q):
            out[f"{name}_q{int(p * 100)}"] = float(v)
    both = sim & (a == 1) & (s == 1)
    out["doubles_log_frp_corr"] = float(np.corrcoef(la[both], ls[both])[0, 1])
    out["doubles_log_frp_diff_mean"] = float(np.mean(la[both] - ls[both]))
    out["doubles_log_frp_diff_sd"] = float(np.std(la[both] - ls[both]))
    if n.sum():
        cuts = np.log(S_CLASS_EDGES)
        for k, (lo, hi) in enumerate(zip((-np.inf, *cuts), (*cuts, np.inf))):
            mask = (s == 1) & (ls >= lo) & (ls < hi)
            out[f"persistence_n_given_s_class{k}"] = n[mask].mean()
        out["persistence_n_given_s"] = n[s == 1].mean()
    return {k: float(v) for k, v in out.items()}


def _connect():
    con = tl.connect()
    con.execute(f"SET threads={config.N_JOBS}")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE region_gap AS
        SELECT region, date, max(day_lst_min) FILTER (WHERE sensor = 'aqua')
            - max(day_lst_min) FILTER (WHERE sensor = 'snpp') AS gap
        FROM read_parquet('{config.INTERIM_DIR / "overpass.parquet"}') GROUP BY ALL
    """)
    return con


def load_units(con, start, end, three=False, day_only=True):
    days = tl.availability(con, start, end)
    flag = "aqua_available AND snpp_available" + (" AND noaa20_available" if three else "")
    con.register("units_days", days[days.eval(flag.replace("AND", "&"))][["date"]])
    sensors = "('aqua', 'snpp', 'noaa20')" if three else "('aqua', 'snpp')"
    day = " AND has_day" if day_only else ""
    frame = con.execute(f"""
        SELECT t.region, t.date, t.year, t.month, t.cell_y, t.cell_x, any_value(g.gap) AS gap,
            bool_or(sensor = 'aqua'{day})::INTEGER AS a, bool_or(sensor = 'snpp'{day})::INTEGER AS s,
            bool_or(sensor = 'noaa20'{day})::INTEGER AS n,
            ln(greatest(max(frp_max) FILTER (WHERE sensor = 'aqua'{day}), {FRP_FLOOR})) AS la,
            ln(greatest(max(frp_max) FILTER (WHERE sensor = 'snpp'{day}), {FRP_FLOOR})) AS ls,
            ln(greatest(max(frp_max) FILTER (WHERE sensor = 'noaa20'{day}), {FRP_FLOOR})) AS ln
        FROM three t JOIN units_days USING (date) LEFT JOIN region_gap g USING (region, date)
        WHERE t.date BETWEEN ? AND ? AND sensor IN {sensors}
        GROUP BY t.region, t.date, t.year, t.month, t.cell_y, t.cell_x
        HAVING a + s + n > 0
    """, [start, end]).df()
    con.unregister("units_days")
    for k in ("a", "s", "n"):
        frame[k] = frame[k].astype(np.int64)
    for k in ("la", "ls", "ln"):
        frame[k] = frame[k].astype(float)
    frame["gap"] = frame["gap"].astype(float)
    return frame


def overpass_distribution(con):
    gaps = con.execute("""
        SELECT g.gap FROM three t JOIN region_gap g USING (region, date)
        WHERE t.sensor = 'snpp' AND t.has_day AND t.year BETWEEN ? AND ? AND g.gap IS NOT NULL
    """, list(TWO_LIST_YEARS)).fetchnumpy()["gap"]
    residual = con.execute("""
        WITH c AS (
            SELECT region, date, cell_y, cell_x,
                max(day_lst_min) FILTER (WHERE sensor = 'aqua') - max(day_lst_min) FILTER (WHERE sensor = 'snpp') AS cell_gap
            FROM three WHERE has_day AND year BETWEEN ? AND ? GROUP BY ALL
        )
        SELECT abs(g.gap) < ? AS sim, c.cell_gap - g.gap AS residual
        FROM c JOIN region_gap g USING (region, date) WHERE c.cell_gap IS NOT NULL AND g.gap IS NOT NULL
    """, [*TWO_LIST_YEARS, config.SIMULTANEOUS_MAX_MINUTES]).df()
    return dict(gap=np.asarray(gaps, dtype=float),
                residual_sim=residual.loc[residual.sim, "residual"].to_numpy(float),
                residual_other=residual.loc[~residual.sim, "residual"].to_numpy(float))


def observed_facts(con=None):
    con = con or _connect()
    two = load_units(con, date(TWO_LIST_YEARS[0], 1, 1), date(TWO_LIST_YEARS[1], 12, 31))
    three = load_units(con, THREE_LIST_START, THREE_LIST_END, three=True)
    out = facts(two)
    out.update({k: v for k, v in facts(three).items() if k.startswith("persistence")})
    return out


ESTIMATORS = {
    "main": lambda frame, rng: main_estimate(frame, rng),
    "Chapman_simultaneous": chapman_simultaneous,
    "A1_huggins_imputed": lambda frame, rng: huggins_imputed(frame, rng),
    "A2_latent_intensity": lambda frame, rng: latent_two_list(frame),
    "B_detection_persistence": lambda frame, rng: latent_persistence(frame),
    "B_simultaneous_days": lambda frame, rng: latent_persistence(frame[simultaneous(frame["gap"].to_numpy())]),
    "C_latent_class": lambda frame, rng: latent_class(frame, rng),
    "LL3_pairwise_loglinear": lambda frame, rng: pairwise_loglinear(frame, rng),
}
TWO_LIST_ESTIMATORS = ("main", "A1_huggins_imputed", "A2_latent_intensity")
THREE_LIST_ESTIMATORS = ("B_detection_persistence", "B_simultaneous_days", "C_latent_class", "LL3_pairwise_loglinear")
SLOW_ESTIMATORS = ("B_detection_persistence",)


def factor_row(frame, name, rng):
    main = pooled_estimate(frame, rng)
    result = ESTIMATORS[name](frame, rng)
    if name == "B_detection_persistence":
        valid = frame[np.isfinite(frame["gap"].to_numpy())]
        reference = main["N"] * valid["s"].sum() / main["n_s"]
    else:
        reference = main["N"]
    return dict(estimator=name, N=result["N"], low=result["low"], high=result["high"], N_main=reference,
                factor=result["N"] / reference, factor_low=result["low"] / reference,
                factor_high=result["high"] / reference, n_s_simultaneous=main["n_s"], m=main["m"],
                n_a_simultaneous=main["n_a"], converged=result.get("converged"),
                hessian_positive=result.get("hessian_positive"),
                p_s_mean=result.get("p_s_mean"), p_s_main=main["n_s"] / main["N"],
                persistence_50_mean=result.get("persistence_50_mean"), theta=result.get("theta"))


def subsets(frame, label):
    yield label, config.NATIONAL, frame
    for region in config.REGIONS:
        yield label, region, frame[frame["region"] == region]


def main():
    started = perf_counter()
    rng = np.random.default_rng(config.SEED)
    exam = json.loads(EXAM_PATH.read_text())
    passed = [name for name, row in exam["verdict"].items()
              if row["passes"] and name in ESTIMATORS and name not in ("main", "Chapman_simultaneous")]
    if not passed:
        output = dict(passed_exam=[], status="no_estimator_passed", rows=[],
                      regions=[config.NATIONAL, *config.REGIONS], periods=["2013-2020", "2018-2022"],
                      stability="not_identified", ci_level=config.CI_LEVEL,
                      note="No correction factor or stability estimate: every candidate failed the synthetic exam.")
        FACTOR_PATH.write_text(json.dumps(output, indent=2) + "\n")
        print("No estimator passed; no real-data correction factors computed.")
        return
    con = _connect()
    two = load_units(con, date(TWO_LIST_YEARS[0], 1, 1), date(TWO_LIST_YEARS[1], 12, 31))
    two_all = load_units(con, date(TWO_LIST_YEARS[0], 1, 1), date(TWO_LIST_YEARS[1], 12, 31), day_only=False)
    window = load_units(con, date(STABILITY_YEARS[0], 1, 1), date(STABILITY_YEARS[1], 12, 31))
    three = load_units(con, THREE_LIST_START, THREE_LIST_END, three=True)
    names = passed
    rows = []
    for name in names:
        datasets = ([("2013-2020_day", two), ("2013-2020_day_and_night", two_all), ("2018-2022_day", window)]
                    if name in TWO_LIST_ESTIMATORS else [("2018-04_2022-12_day", three)])
        for period, data in datasets:
            for label, region, part in subsets(data, period):
                row = factor_row(part, name, rng)
                row.update(period=label, region=region, split="pooled", passed_exam=name in passed)
                rows.append(row)
                print(f"{name:26s} {label:24s} {region:9s} factor={row['factor']:.3f} "
                      f"[{row['factor_low']:.3f}, {row['factor_high']:.3f}] conv={row['converged']}", flush=True)
        stability_data = two if name in TWO_LIST_ESTIMATORS else three
        period = "2013-2020_day" if name in TWO_LIST_ESTIMATORS else "2018-04_2022-12_day"
        for region in (None, *config.REGIONS):
            base = stability_data if region is None else stability_data[stability_data["region"] == region]
            for year in sorted(base["year"].unique()):
                part = base[base["year"] == year]
                if part["a"].sum() < 200:
                    continue
                row = factor_row(part, name, rng)
                row.update(period=period, region=region or config.NATIONAL, split=f"year_{year}", passed_exam=name in passed)
                rows.append(row)
            for season, months in (("dry_jul_nov", DRY_MONTHS), ("wet_dec_jun", tuple(m for m in range(1, 13) if m not in DRY_MONTHS))):
                part = base[base["month"].isin(months)]
                row = factor_row(part, name, rng)
                row.update(period=period, region=region or config.NATIONAL, split=season, passed_exam=name in passed)
                rows.append(row)
                print(f"{name:26s} {period:24s} {region or 'all':9s} {season} factor={row['factor']:.3f} "
                      f"[{row['factor_low']:.3f}, {row['factor_high']:.3f}]", flush=True)
    output = dict(
        passed_exam=passed,
        note=("Factor = corrected N / main-method N on the same units. Main-method N is the simultaneous-day "
              "Chapman estimate (n_snpp / p_viirs) pooled over months for the subset. Estimators that did not "
              "pass the exam are never fitted to real data."),
        rows=rows,
        constants=dict(two_list_years=TWO_LIST_YEARS, three_list=[str(THREE_LIST_START), str(THREE_LIST_END)],
                       stability_years=STABILITY_YEARS, noaa20_lag=NOAA20_LAG, log_bin=LOG_BIN,
                       log_bin_three=LOG_BIN_THREE, gap_bin=GAP_BIN, gh_nodes=GH_NODES, frp_floor=FRP_FLOOR,
                       dry_months=DRY_MONTHS, bootstrap=BOOTSTRAP, seed=config.SEED, ci_level=config.CI_LEVEL),
        seconds=perf_counter() - started,
    )
    FACTOR_PATH.write_text(json.dumps(output, indent=2, default=lambda v: v.item() if hasattr(v, "item") else str(v)) + "\n")
    print(f"Created: {FACTOR_PATH.name} ({perf_counter() - started:.0f} s)")


if __name__ == "__main__":
    main()
