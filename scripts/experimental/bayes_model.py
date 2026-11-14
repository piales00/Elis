import json
import sys
from datetime import date
from pathlib import Path
from time import perf_counter

import numpyro

numpyro.set_host_device_count(4)

import jax
import jax.numpy as jnp
import numpy as np
import numpyro.distributions as dist
import pandas as pd
from jax.scipy.special import logsumexp
from numpyro.diagnostics import summary
from numpyro.infer import MCMC, NUTS

sys.path.insert(0, str(Path(__file__).resolve().parent))

import three_lists as tl
from three_lists import config

jax.config.update("jax_enable_x64", True)

CHAINS = 4
WARMUP = 1000
SAMPLES = 1000
SYNTHETIC_WARMUP = 500
SYNTHETIC_SAMPLES = 500
TARGET_ACCEPT = 0.9
HOLDOUT_YEARS = (2021, 2022)
RHAT_MAX = 1.01
DRY_MONTHS = (7, 8, 9, 10, 11)
SYNTHETIC_BASE = np.array([-2.6, -0.85, -0.8])
SYNTHETIC_BASE_DEPENDENT = np.array([-3.2, -1.1, -1.05])
SYNTHETIC_INTERACTIONS = np.array([1.4, 1.35, 0.55])
H8 = np.array([(0, 0, 0), *tl.HISTORIES], dtype=float)
PAIR8 = np.column_stack([H8[:, i] * H8[:, j] for i, j in tl.PAIRS])
COLLAPSE_AN = np.array([[0, 1, 0, 0, 1, 0, 0, 0],
                        [0, 0, 0, 1, 0, 0, 1, 0],
                        [0, 0, 0, 0, 0, 1, 0, 1]], dtype=float)
TAILS = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)


def log_probabilities(a, b):
    eta = a @ H8.T + b @ PAIR8.T
    return eta - logsumexp(eta, axis=-1, keepdims=True)


def model(x, region, month, holdout, n_regions, pairs=True, b_group=None, n_b_groups=None):
    n_strata = x.shape[0]
    mu = numpyro.sample("mu", dist.Normal(0.0, 3.0).expand([n_regions, 3]).to_event(2))
    sigma_month = numpyro.sample("sigma_month", dist.HalfNormal(1.5).expand([3]).to_event(1))
    z_month = numpyro.sample("z_month", dist.Normal(0, 1).expand([n_regions, 12, 3]).to_event(3))
    alpha = mu[:, None, :] + sigma_month * z_month
    tau = numpyro.sample("tau", dist.HalfNormal(1.0).expand([3]).to_event(1))
    z_year = numpyro.sample("z_year", dist.Normal(0, 1).expand([n_strata, 3]).to_event(2))
    a = alpha[region, month] + tau * z_year
    if pairs:
        beta = numpyro.sample("beta", dist.Normal(0.0, 2.0).expand([3]).to_event(1))
        sigma_b = numpyro.sample("sigma_b", dist.HalfNormal(0.5))
        groups = region if b_group is None else b_group
        n_groups = n_regions if n_b_groups is None else n_b_groups
        z_b = numpyro.sample("z_b", dist.Normal(0, 1).expand([n_groups, 3]).to_event(2))
        b_region = numpyro.deterministic("b_region", beta + sigma_b * z_b)
        b = b_region[groups]
    else:
        b = jnp.zeros((n_strata, 3))
    x_an = jnp.asarray(x) @ COLLAPSE_AN[:, 1:].T
    observed = jnp.where(holdout, x_an.sum(axis=1), jnp.asarray(x).sum(axis=1))
    log_n = numpyro.sample("log_n", dist.Normal(jnp.log(observed + 1.0) + 1.0, 3.0).to_event(1))
    log_p = log_probabilities(a, b)
    rates_full = jnp.exp(log_n[:, None] + log_p[:, 1:])
    rates_an = jnp.exp(log_n[:, None]) * (jnp.exp(log_p) @ COLLAPSE_AN.T)
    ll_full = dist.Poisson(rates_full).log_prob(jnp.asarray(x)).sum(axis=1)
    ll_an = dist.Poisson(rates_an).log_prob(x_an).sum(axis=1)
    numpyro.factor("likelihood", jnp.where(holdout, ll_an, ll_full).sum())
    numpyro.deterministic("p_detect", jnp.exp(log_p) @ H8)


def fit(x, region, month, holdout=None, pairs=True, warmup=WARMUP, samples=SAMPLES, seed=config.SEED,
        b_group=None):
    x = np.asarray(x, dtype=float)
    holdout = np.zeros(len(x), dtype=bool) if holdout is None else np.asarray(holdout)
    kernel = NUTS(model, target_accept_prob=TARGET_ACCEPT)
    mcmc = MCMC(kernel, num_warmup=warmup, num_samples=samples, num_chains=CHAINS,
                chain_method="parallel", progress_bar=False)
    started = perf_counter()
    mcmc.run(jax.random.PRNGKey(seed), x=x, region=np.asarray(region), month=np.asarray(month),
             holdout=holdout, n_regions=int(np.max(region)) + 1, pairs=pairs,
             b_group=None if b_group is None else np.asarray(b_group),
             n_b_groups=None if b_group is None else int(np.max(b_group)) + 1,
             extra_fields=("diverging",))
    elapsed = perf_counter() - started
    grouped = mcmc.get_samples(group_by_chain=True)
    names = ["mu", "sigma_month", "tau", "log_n"] + (["beta", "sigma_b", "b_region"] if pairs else [])
    stats = summary({k: np.asarray(grouped[k]) for k in names}, group_by_chain=True)
    rhat = {k: float(np.nanmax(v["r_hat"])) for k, v in stats.items()}
    ess = {k: float(np.nanmin(v["n_eff"])) for k, v in stats.items()}
    divergences = int(np.asarray(mcmc.get_extra_fields()["diverging"]).sum())
    flat = {k: np.asarray(v) for k, v in mcmc.get_samples().items()}
    n_draws = np.exp(flat["log_n"])
    return dict(draws=flat, N=n_draws, rhat=rhat, ess=ess, divergences=divergences,
                seconds=elapsed, pairs=pairs, b_group=b_group)


def interval(values, axis=0):
    low, high = np.quantile(values, TAILS, axis=axis)
    return np.median(values, axis=axis), low, high


def simulate(rng, region, month, kind, n_mean=4000.0):
    n_strata = len(region)
    season = 1 + 2.5 * np.exp(-0.5 * ((month - 8) / 1.5) ** 2)
    N = rng.poisson(n_mean * season * rng.lognormal(0, 0.4, n_strata) / (1 + region))
    base = SYNTHETIC_BASE_DEPENDENT if kind == "dependent" else SYNTHETIC_BASE
    a = base + 0.3 * np.sin(2 * np.pi * month[:, None] / 12) + rng.normal(0, 0.15, (n_strata, 3))
    if kind == "heterogeneity":
        x = np.zeros((n_strata, 7))
        for s in range(n_strata):
            big = rng.binomial(N[s], 0.3)
            for count, shift in ((big, 1.5), (N[s] - big, -0.6)):
                p = 1 / (1 + np.exp(-(a[s] + shift)))
                seen = rng.random((count, 3)) < p
                codes = seen @ np.array([4, 2, 1])
                for k, h in enumerate(tl.HISTORIES):
                    x[s, k] += np.sum(codes == h[0] * 4 + h[1] * 2 + h[2])
        return x.astype(np.int64), N
    b = np.zeros(3) if kind == "independent" else SYNTHETIC_INTERACTIONS
    eta = a @ H8.T + np.tile(b, (n_strata, 1)) @ PAIR8.T
    p = np.exp(eta - np.log(np.exp(eta).sum(axis=1, keepdims=True)))
    full = np.array([rng.multinomial(N[s], p[s]) for s in range(n_strata)])
    return full[:, 1:], N


def synthetic_validation(region, month, rng):
    results = []
    for kind in ("independent", "dependent", "heterogeneity"):
        x, N = simulate(rng, region, month, kind)
        truth = float(N.sum())
        for pairs in (False, True):
            result = fit(x, region, month, pairs=pairs, warmup=SYNTHETIC_WARMUP, samples=SYNTHETIC_SAMPLES)
            total = result["N"].sum(axis=1)
            mid, low, high = interval(total)
            _, s_low, s_high = interval(result["N"])
            coverage = float(np.mean((N >= s_low) & (N <= s_high)))
            row = dict(scenario=kind, model="pairwise" if pairs else "independence", true_total=truth,
                       estimate=float(mid), low=float(low), high=float(high),
                       relative_error=float(mid / truth - 1), covers_truth=bool(low <= truth <= high),
                       stratum_coverage=coverage, max_rhat=max(result["rhat"].values()),
                       min_ess=min(result["ess"].values()), divergences=result["divergences"],
                       observed_share=float(x.sum() / truth))
            if pairs:
                row["interactions"] = np.median(result["draws"]["beta"], axis=0).tolist()
            results.append(row)
            print(f"Synthetic {kind:13s} {row['model']:12s} truth={truth:,.0f} est={mid:,.0f} "
                  f"[{low:,.0f}, {high:,.0f}] err={row['relative_error']:+.3f} rhat={row['max_rhat']:.3f} "
                  f"div={row['divergences']}")
    return results


def ppc(result, x, region, month, rng):
    d = result["draws"]
    n_strata = len(x)
    mu, sigma_month, z_month = d["mu"], d["sigma_month"], d["z_month"]
    alpha = mu[:, :, None, :] + sigma_month[:, None, None, :] * z_month
    a = alpha[:, region, month] + d["tau"][:, None, :] * d["z_year"]
    groups = region if result.get("b_group") is None else result["b_group"]
    b = d["b_region"][:, groups] if result["pairs"] else np.zeros((len(a), n_strata, 3))
    eta = a @ H8.T + b @ PAIR8.T
    p = np.exp(eta - np.log(np.exp(eta).sum(axis=-1, keepdims=True)))
    rates = np.exp(d["log_n"])[:, :, None] * p[:, :, 1:]
    replicated = rng.poisson(rates)
    h = np.array(tl.HISTORIES)
    obs_marg = x @ h
    rep_marg = replicated @ h
    low, high = np.quantile(rep_marg, TAILS, axis=0)
    marg_cover = np.mean((obs_marg >= low) & (obs_marg <= high), axis=0)
    hl, hh = np.quantile(replicated, TAILS, axis=0)
    hist_cover = float(np.mean((x >= hl) & (x <= hh)))

    def freeman_tukey(values, expected):
        return ((np.sqrt(values) - np.sqrt(expected)) ** 2).sum(axis=(-1, -2))

    discrepancy_obs = freeman_tukey(x[None], rates)
    discrepancy_rep = freeman_tukey(replicated, rates)
    totals = dict(observed=obs_marg.sum(axis=0).tolist(),
                  replicated_median=np.median(rep_marg.sum(axis=1), axis=0).tolist())
    return dict(marginal_coverage_90={s: float(c) for s, c in zip(tl.SENSORS, marg_cover)},
                history_coverage_90=hist_cover,
                freeman_tukey_p_value=float(np.mean(discrepancy_rep >= discrepancy_obs)),
                national_marginals=totals)


def holdout_check(result, x, region, month, holdout, index):
    d = result["draws"]
    p_snpp = d["p_detect"][:, :, 1]
    predicted = np.exp(d["log_n"]) * p_snpp
    rng = np.random.default_rng(config.SEED)
    predicted = rng.poisson(predicted)
    actual = x @ np.array(tl.HISTORIES)[:, 1]
    rows = []
    for s in np.where(holdout)[0]:
        mid, low, high = interval(predicted[:, s])
        rows.append(dict(region=index[s][0], year=int(index[s][1]), month=int(index[s][2]),
                         snpp_observed=int(actual[s]), snpp_predicted=float(mid),
                         low=float(low), high=float(high), covered=bool(low <= actual[s] <= high)))
    frame = pd.DataFrame(rows)
    annual = []
    for (r, y), g in frame.groupby(["region", "year"]):
        ids = [s for s in np.where(holdout)[0] if index[s][0] == r and index[s][1] == y]
        total = predicted[:, ids].sum(axis=1)
        mid, low, high = interval(total)
        obs = int(actual[ids].sum())
        annual.append(dict(region=r, year=int(y), snpp_observed=obs, snpp_predicted=float(mid),
                           low=float(low), high=float(high), relative_error=float(mid / obs - 1),
                           covered=bool(low <= obs <= high)))
    return dict(monthly_coverage_90=float(frame["covered"].mean()),
                monthly_median_abs_rel_error=float(np.median(np.abs(frame["snpp_predicted"] / frame["snpp_observed"] - 1))),
                annual=annual)


def main_comparison(counts, index):
    probs = pd.read_parquet(config.INTERIM_DIR / "detection_probs.parquet").set_index(["region", "month"])
    main = pd.read_parquet(config.INTERIM_DIR / "estimates.parquet").set_index(["region", "year", "month"])
    marg = tl.marginals(counts)
    m_as = tl.pair_overlap(counts, 0, 1)
    rows = []
    for k, (r, y, mo) in enumerate(index):
        rows.append(dict(
            n_aqua=int(marg["aqua"][k]), n_snpp=int(marg["snpp"][k]), n_noaa20=int(marg["noaa20"][k]),
            observed_union=int(counts[k].sum()),
            chapman_aqua_snpp=float(tl.chapman(marg["aqua"][k], marg["snpp"][k], m_as[k])),
            main_equivalent=float(marg["snpp"][k] / probs.loc[(r, mo), "p2"]),
            main_estimated=float(main.loc[(r, y, mo), "estimated"]),
            main_low=float(main.loc[(r, y, mo), "est_low"]), main_high=float(main.loc[(r, y, mo), "est_high"])))
    return pd.DataFrame(rows)


def main():
    started = perf_counter()
    rng = np.random.default_rng(config.SEED)
    con = tl.connect()
    days = tl.availability(con, tl.MAIN_START, tl.MAIN_END)
    tl.register_days(con, days)
    tl.build_units(con)
    wide = tl.history_counts(con, where=f"date <= DATE '{tl.MAIN_END}'")
    index = list(wide.index)
    counts = wide.to_numpy()
    region = np.array([config.REGIONS.index(r) for r, _, _ in index])
    month = np.array([m - 1 for _, _, m in index])
    year = np.array([y for _, y, _ in index])
    print(f"Strata: {len(index)}; observed cell-days: {counts.sum():,}; days excluded: "
          f"{int((~days['all_available']).sum())}")

    synthetic = synthetic_validation(region, month, rng)

    results = {}
    for name, pairs in (("pairwise", True), ("independence", False)):
        results[name] = fit(counts, region, month, pairs=pairs)
        r = results[name]
        print(f"Fit {name}: {r['seconds']:.0f} s, max rhat {max(r['rhat'].values()):.4f}, "
              f"min ess {min(r['ess'].values()):.0f}, divergences {r['divergences']}")
    season_group = region * 2 + np.isin(month + 1, DRY_MONTHS)
    results["pairwise_season"] = fit(counts, region, month, pairs=True, b_group=season_group)
    r = results["pairwise_season"]
    print(f"Fit pairwise_season: max rhat {max(r['rhat'].values()):.4f}, divergences {r['divergences']}, "
          f"total {np.median(r['N'].sum(axis=1)):,.0f}")
    holdout = np.isin(year, HOLDOUT_YEARS)
    results["holdout"] = fit(counts, region, month, holdout=holdout, pairs=True)
    holdout_report = holdout_check(results["holdout"], counts, region, month, holdout, index)
    print(f"Hold-out S-NPP {HOLDOUT_YEARS}: monthly 90% coverage {holdout_report['monthly_coverage_90']:.2f}")

    comparison = main_comparison(counts, index)
    rows = []
    for k, (r, y, mo) in enumerate(index):
        pm, pl, ph = interval(results["pairwise"]["N"][:, k])
        im, il, ih = interval(results["independence"]["N"][:, k])
        rows.append(dict(region=r, year=int(y), month=int(mo), bayes_estimated=float(pm), bayes_low=float(pl),
                         bayes_high=float(ph), bayes_independence=float(im), independence_low=float(il),
                         independence_high=float(ih), **comparison.iloc[k].to_dict()))
    for (y, mo) in sorted({(y, mo) for _, y, mo in index}):
        ids = [k for k, (_, yy, mm) in enumerate(index) if (yy, mm) == (y, mo)]
        pm, pl, ph = interval(results["pairwise"]["N"][:, ids].sum(axis=1))
        im, il, ih = interval(results["independence"]["N"][:, ids].sum(axis=1))
        sums = comparison.iloc[ids].sum()
        rows.append(dict(region=config.NATIONAL, year=int(y), month=int(mo), bayes_estimated=float(pm),
                         bayes_low=float(pl), bayes_high=float(ph), bayes_independence=float(im),
                         independence_low=float(il), independence_high=float(ih),
                         **{c: (int(sums[c]) if c.startswith("n_") or c == "observed_union" else float(sums[c]))
                            for c in comparison.columns}))
    estimates = pd.DataFrame(rows)
    used = days[days["all_available"]].assign(year=lambda f: pd.to_datetime(f["date"]).dt.year,
                                              month=lambda f: pd.to_datetime(f["date"]).dt.month)
    used_days = used.groupby(["year", "month"]).size().rename("days_used").reset_index()
    estimates = estimates.merge(used_days, on=["year", "month"], how="left")
    estimates.to_parquet(config.INTERIM_DIR / "bayes_estimates.parquet", index=False)
    wide.reset_index().to_parquet(config.INTERIM_DIR / "bayes_histories.parquet", index=False)

    annual = []
    for r in (*config.REGIONS, config.NATIONAL):
        for y in sorted(set(year)):
            ids = [k for k, (rr, yy, _) in enumerate(index) if yy == y and (r == config.NATIONAL or rr == r)]
            entry = dict(region=r, year=int(y))
            for name in ("pairwise", "independence"):
                mid, low, high = interval(results[name]["N"][:, ids].sum(axis=1))
                entry.update({name: float(mid), f"{name}_low": float(low), f"{name}_high": float(high)})
            sums = comparison.iloc[ids].sum()
            entry.update({c: float(sums[c]) for c in ("n_aqua", "n_snpp", "n_noaa20", "observed_union",
                                                      "chapman_aqua_snpp", "main_equivalent", "main_estimated")})
            annual.append(entry)
    period = []
    for r in (*config.REGIONS, config.NATIONAL):
        ids = [k for k, (rr, _, _) in enumerate(index) if r == config.NATIONAL or rr == r]
        entry = dict(region=r)
        for name in ("pairwise", "independence", "pairwise_season"):
            total = results[name]["N"][:, ids].sum(axis=1)
            mid, low, high = interval(total)
            ratio = total / comparison.iloc[ids]["main_equivalent"].sum()
            rm, rl, rh = interval(ratio)
            entry.update({name: float(mid), f"{name}_low": float(low), f"{name}_high": float(high),
                          f"{name}_over_main": float(rm), f"{name}_over_main_low": float(rl),
                          f"{name}_over_main_high": float(rh)})
        sums = comparison.iloc[ids].sum()
        entry.update({c: float(sums[c]) for c in comparison.columns if c not in ("main_low", "main_high")})
        period.append(entry)

    def interactions(result):
        b = result["draws"]["b_region"]
        out = {}
        for ri, r in enumerate(config.REGIONS):
            out[r] = {}
            for pi, pair in enumerate(tl.PAIR_NAMES):
                mid, low, high = interval(b[:, ri, pi])
                out[r][pair] = dict(median=float(mid), low=float(low), high=float(high),
                                    odds_ratio=float(np.exp(mid)))
        beta = result["draws"]["beta"]
        out["shared_mean"] = {pair: dict(zip(("median", "low", "high"), map(float, interval(beta[:, pi]))))
                              for pi, pair in enumerate(tl.PAIR_NAMES)}
        return out

    def detection(result):
        p = result["draws"]["p_detect"]
        out = {}
        for ri, r in enumerate(config.REGIONS):
            ids = np.where(region == ri)[0]
            weights = counts[ids].sum(axis=1)
            avg = (p[:, ids, :] * weights[None, :, None]).sum(axis=1) / weights.sum()
            out[r] = {s: dict(zip(("median", "low", "high"), map(float, interval(avg[:, i]))))
                      for i, s in enumerate(tl.SENSORS)}
        return out

    diagnostics = dict(
        inference="NumPyro NUTS", numpyro=numpyro.__version__, jax=jax.__version__,
        chains=CHAINS, warmup=WARMUP, samples=SAMPLES, target_accept=TARGET_ACCEPT, seed=config.SEED,
        period=[str(tl.MAIN_START), str(tl.MAIN_END)], strata=len(index),
        excluded_days=days.loc[~days["all_available"], ["date", "reasons"]].astype(str).to_dict("records"),
        fits={name: dict(seconds=r["seconds"], rhat=r["rhat"], ess=r["ess"], divergences=r["divergences"],
                         max_rhat=max(r["rhat"].values()), min_ess=min(r["ess"].values()))
              for name, r in results.items()},
        interactions=interactions(results["pairwise"]),
        detection_probability=dict(pairwise=detection(results["pairwise"]),
                                   independence=detection(results["independence"])),
        posterior_predictive={name: ppc(results[name], counts, region, month, rng)
                              for name in ("pairwise", "independence", "pairwise_season")},
        season_interactions={f"{config.REGIONS[g // 2]}_{'dry' if g % 2 else 'wet'}": {
            pair: dict(zip(("median", "low", "high"), map(float, interval(results["pairwise_season"]["draws"]["b_region"][:, g, pi]))))
            for pi, pair in enumerate(tl.PAIR_NAMES)} for g in range(6)},
        holdout_snpp=dict(years=HOLDOUT_YEARS, **holdout_report),
        synthetic=synthetic, annual=annual, period_totals=period,
        acceptance=dict(rhat_below_1_01=all(max(r["rhat"].values()) < RHAT_MAX for r in results.values()),
                        divergences=sum(r["divergences"] for r in results.values())),
        total_seconds=perf_counter() - started)
    (config.INTERIM_DIR / "bayes_diagnostics.json").write_text(json.dumps(diagnostics, indent=2, default=str) + "\n")
    for row in period:
        print(f"{row['region']:9s} pairwise {row['pairwise']:,.0f} [{row['pairwise_low']:,.0f}, {row['pairwise_high']:,.0f}] "
              f"indep {row['independence']:,.0f} chapmanAS {row['chapman_aqua_snpp']:,.0f} "
              f"main_eq {row['main_equivalent']:,.0f} main {row['main_estimated']:,.0f} nS {row['n_snpp']:,.0f}")
    print(f"Created: bayes_estimates.parquet, bayes_histories.parquet, bayes_diagnostics.json "
          f"({perf_counter() - started:.0f} s)")


if __name__ == "__main__":
    main()
