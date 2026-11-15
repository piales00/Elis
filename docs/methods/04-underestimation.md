# 04 · How much does the headline number undercount?

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose

The headline number is Chapman with Aqua and S-NPP on simultaneous overpasses. Chapman assumes the two sensors are independent. If fire that one sensor misses also tends to escape the other (small or weak fires), Chapman is too low. [03](03-bayesian-three-satellites.md) showed the direction. Here we try to measure the size, and test whether any method can correct it reliably.

The truth is never observed. So we built a simulator of fire cell-days, fitted it to real facts, and measured each estimator against the simulated truth.

## Data

Real Peru facts from the calibration years 2013–2020 (Aqua, S-NPP, NOAA-20 daytime overpasses), used only to fit the simulator.

## Method

**Simulator.** Each fire cell-day has a latent intensity. Each sensor detects with its own curve of that intensity, with sensor-specific scatter. Fire has a short lifetime and flickers between overpasses. One scatter parameter (τ_S = 0.4) is fixed, not estimated.

**Fit to observed facts** (best fit, loss 55):

| Observed fact | Real | Simulator |
|---|---|---|
| P(S-NPP sees \| Aqua sees), passes < 20 min apart | 0.796 | 0.795 |
| Same, 20–40 min | 0.569 | 0.614 |
| Same, 40–60 min | 0.538 | 0.513 |
| P(Aqua sees \| S-NPP sees) | 0.172 | 0.171 |
| S-NPP → NOAA-20 persistence, low / medium / high FRP | 26 / 44 / 64 % | 26 / 45 / 62 % |
| Simultaneous Chapman / S-NPP | 1.256 | 1.257 |

Four alternative worlds (low or high heterogeneity, low or high flicker) fit far worse (loss 970–1,540, 20–30 times higher). They are used only to see how results move if the world were different.

**Exam.** An estimator passes if |bias| < 10 % **and** interval coverage ≥ 80 % in every scenario, with at least 20 replicates per scenario. Bias = mean(N / truth) − 1.

## Results

Best-fit scenario, the only one that reproduces the facts (`data/interim/underestimation_exam.json`):

| Estimator | Replicates | Bias | Coverage |
|---|---|---|---|
| **Headline method (Chapman, simultaneous days)** | 25 | **−11.2 %** | 0 % |
| A1 Huggins | 25 | −9.2 % | 0 % |
| A2 latent intensity | 25 | +52.7 % | 0 % (3 not converged) |
| B detection + persistence | 25 | +3.6 % | 52 % |
| B, simultaneous days only | 25 | +1.2 % | 92 % |
| C latent class | 25 | +306 % | 0 % |
| LL3 three lists | 25 | +227 % | 0 % |

Worst case over the five scenarios:

| Estimator | Worst bias | Worst coverage | Passes |
|---|---|---|---|
| Headline method | −39 % | 0 % | no |
| A1 Huggins | −38 % | 0 % | no |
| B detection + persistence | +5.6 % | 8 % | no |
| B, simultaneous days only | +2.4 % | 68 % | no |
| A2, C, LL3 | +445,000 % (diverges), +715 %, +583 % | 0 % | no |

**How much.** In the simulated world that matches the facts, the headline number is about **11 % below** the truth (N / truth = 0.89; true factor 1.13, replicate range 1.10–1.18). Its own interval never covers the truth (0 of 25). In worlds that fit worse, the factor ranges from 0.91 to 1.65. It depends on heterogeneity and flicker, which the data do not pin down.

The three-list model (LL3) overestimates by +227 % in the best-fit world. This agrees with [03](03-bayesian-three-satellites.md): ×3 is inflated by flicker.

A separate, simpler synthetic test with correlated detection (`methodology.json → findings.chapman_correlated_bias_pct`) gives −28.8 %. It is a stress test, not a calibrated world, and not a correction for Peru.

## Why no correction is published

No alternative estimator passed the exam. The closest one (B on simultaneous days, bias ≤ 2.4 %) misses 80 % coverage in one scenario, is incomplete, and comes from a model not validated against real data. Applying a factor that failed the exam would publish a number without support.

**Decision: the harmonized record is reported as a lower bound, with its range, and no correction factor.** The simulated ~11 % is context, never an applied correction.

> Our simulator suggests the harmonized record undercounts active fire by roughly 10–15 %, but no method passed our tests well enough to publish a correction, so we report it as a lower bound.

## Effect on trends

If the factor were constant across years, trends and ratios between periods would not change, only the level. We could not test year-to-year stability, because the stability check runs only for estimators that pass. The alternative worlds suggest the factor depends on fire heterogeneity, which can vary by season and region. We do not claim it is constant.

## Validation and completeness

- The exam is **incomplete**. The journal has 215 rows. B detection + persistence ran separately with 25 replicates in every scenario. The other estimators have 25, 22, 20 and 19 replicates in four scenarios and only 4 in the fifth. Two scenarios are below the minimum of 20, so no estimator can formally pass. The conclusion does not change: the estimators also fail in complete scenarios.

## Limitations

- τ_S is fixed at 0.4; the facts do not identify it separately.
- Clouds and smoke that hide fire from both sensors are not modelled in depth; the simulated truth counts only fire detectable by some sensor.
- Daytime overpass only.
- The alternative worlds fit poorly and are not calibrated uncertainty.
- Unit: fire cell-days, not fires or hectares.

## Reproduce

```bash
.venv/bin/python scripts/experimental/underestimation_sim.py
.venv/bin/python scripts/experimental/underestimation.py
.venv/bin/python scripts/experimental/underestimation_summary.py
```

Outputs (not versioned): `data/interim/underestimation_scenarios.json`, `underestimation_replicates.jsonl`, `underestimation_exam.json`. Settings in `scripts/config.py` (`UNDER_SIM`, `UNDER_ESTIMATOR`).
