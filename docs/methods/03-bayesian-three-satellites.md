# 03 · Three satellites: dependence, flicker and why we do not use ×3

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Two-list capture–recapture (Chapman) cannot detect dependence between the lists. A third list can. We add VIIRS NOAA-20 to Aqua and S-NPP and ask two questions: *are the sensors independent?* and *how much fire does the headline number miss?* This is a robustness analysis. It does not change the published record.

## Data

- Aqua (A), S-NPP (S) and NOAA-20 (N) fire cell-days, built with the same filters, grid and regions as the main record. On the shared 2026 S-NPP period the rebuilt cells match the main cells row by row (7,295 cell-days, zero differences).
- Period 2018-04-01 to 2022-12-31. 72 days with an outage of any satellite are excluded.
- Seven capture histories per region (seen by A only, S only, N only, A+S, A+N, S+N, A+S+N):

| Region | A | S | N | A+S | A+N | S+N | A+S+N | Observed |
|---|---|---|---|---|---|---|---|---|
| Amazon | 3,069 | 43,850 | 46,175 | 3,631 | 3,697 | 25,782 | 9,553 | 135,757 |
| Andes | 2,152 | 36,399 | 37,915 | 2,727 | 2,802 | 20,506 | 7,094 | 109,595 |
| Coast | 538 | 12,356 | 13,154 | 515 | 447 | 3,992 | 655 | 31,657 |

## Method

- Bayesian log-linear model (NumPyro NUTS, 4 chains × 1,000 iterations after 1,000 warm-up, seed 42). Each history count is Poisson with mean N × P(history).
- Main effects per satellite are hierarchical (region × calendar month plus a yearly deviation). Pairwise dependence terms are hierarchical by region; a variant lets them differ between the dry season (July–November) and the wet season.
- No three-way interaction. That is the assumption that identifies N.
- Comparators on the same days: direct Chapman A/S; the "main-equivalent" n_snpp / p_viirs (the rule of the published record); and the published `estimated` in the same months.

## Results

**Totals, Peru, 2018-04 to 2022-12** (fire cell-days, 90 % intervals):

| Estimator | Fire cell-days | × main-equivalent |
|---|---|---|
| Seen by S-NPP | 167,060 | 0.78 |
| Main-equivalent (n_snpp / p_viirs) | 214,445 | 1 |
| Published `estimated`, same months | 226,018 | 1.05 |
| Chapman Aqua/S-NPP, all days | 270,331 | 1.26 |
| Three lists, independence | 428,979 [426,000–431,000] | 2.00 [1.99–2.01] |
| Three lists, with dependence | 661,947 [647,216–677,665] | **3.09 [3.02–3.16]** |
| Three lists, seasonal dependence | 638,941 | 2.98 [2.91–3.05] |

**Pairwise dependence** (log odds ratio, 90 % interval). All are positive and far from zero:

| Region | Aqua–S-NPP | Aqua–NOAA-20 | S-NPP–NOAA-20 |
|---|---|---|---|
| Amazon | 1.40 [1.37–1.44] | 1.36 [1.32–1.39] | 0.63 [0.58–0.68] |
| Andes | 1.44 [1.40–1.48] | 1.41 [1.37–1.45] | 0.57 [0.51–0.63] |
| Coast | 1.54 [1.46–1.63] | 1.36 [1.28–1.44] | 0.46 [0.34–0.56] |

A log odds ratio near 1.4 means an odds ratio of about 4: when VIIRS sees a cell-day, MODIS is about four times more likely (in odds) to see it too. Methods that assume independence therefore undercount.

### Persistence (flicker) by fire radiative power

S-NPP and NOAA-20 carry the same instrument and pass about 50 minutes apart. Daytime overpasses, 2018–2022:

| S-NPP fire radiative power | Share also seen by NOAA-20 ~50 min later |
|---|---|
| < 5 MW | 26 % |
| 5–20 MW | 44 % |
| > 20 MW | 64 % |
| All | 39.6 % (reverse 38.5 %; stable 38–41 % by year) |

At equal overpass gap, S-NPP and NOAA-20 agree with Aqua equally well (S-NPP: 0.77 at < 20 min, 0.58 at 20–40, 0.53 at 40–60; NOAA-20: 0.72, 0.60, 0.53). **The overpass time matters, not the satellite.** Most small VIIRS fire cell-days are not seen in the next overpass. This confirms the overpass-time finding of [01](01-harmonization.md).

## Why the ×3 is not used

NOAA-20 passes about 50 minutes after S-NPP. In 2018–2022 there is no day on which they pass less than 20 minutes apart. Fire that starts or stops in that gap appears as "seen by one only", and the model counts it as fire that could have been missed. So the three-list total estimates fire cell-days active *at some point in a one-hour window*, not the snapshot at the overpass that defines our headline number.

- Restricted to days when Aqua and S-NPP pass together (< 20 min), Chapman gives **1.03×** the main-equivalent. It agrees with the published method. The three-list model stays at 3.0×; the only asynchronous list on those days is NOAA-20.
- In a simulation with fire turnover between overpasses, the pairwise model overestimates the first-hour population by +10 % with full persistence, +39 % with persistence 0.8 and +58 % with 0.6. In the same simulation, two-list Chapman on simultaneous passes underestimates by −21 %.

## What it proves

1. **The direction is real.** All pairwise dependences are positive. Independence is rejected (posterior predictive coverage of histories: 57 % for independence vs 93 % with pairwise terms). Our headline number is a **lower bound**.
2. **The magnitude is not identified** with these data. ×3 is an inflated upper reference, driven by the NOAA-20 time gap.
3. Small fire flickers on a one-hour timescale. That is why we compare satellites only when they pass at the same time.

## Validation

| Check | Result |
|---|---|
| R-hat < 1.01 | Pass (max 1.008; min effective sample size 536; 0 divergences) |
| Posterior predictive | Partial: 100 % of per-satellite counts and 93–94 % of histories inside 90 %; global Freeman–Tukey test p ≈ 0 (fine misfit at counts of tens of thousands) |
| Held-out test (S-NPP hidden in 2021–2022) | Pass: 100 % of months inside 90 %; 5 of 6 region-years covered |
| Synthetic recovery | Independence data: both models recover N (−0.3 %, −1.1 %). Log-linear dependence: pairwise model +0.2 %, independence −34 %. Two-class heterogeneity: pairwise −7.8 %, independence −31 % |

## Limitations

- No three-way interaction: an assumption that three lists cannot test.
- NOAA-20 asynchrony is confounded with dependence and detection. A list simultaneous with S-NPP (NOAA-21 since 2023, or GOES) would help.
- In 2023–2025 Aqua drifts and the S-NPP–NOAA-20 dependence jumps without a clear cause, so the core analysis stays in 2018–2022.
- Not extended to 2000–2025: with the magnitude unresolved, extending it would only spread an unvalidated number.

## Reproduce

```bash
.venv/bin/python scripts/experimental/cells_three.py
.venv/bin/python scripts/experimental/bayes_model.py
.venv/bin/python scripts/experimental/bayes_sensitivity.py
```

Outputs (not versioned): `data/interim/bayes_estimates.parquet`, `bayes_histories.parquet`, `bayes_diagnostics.json`, `bayes_sensitivity.json`. Numbers in this note come from those files as summarized in the team results log.
