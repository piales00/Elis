# 02 · The MODIS emulator ("artificial MODIS")

FireChronos Peru · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Answer the question *"what would Aqua MODIS have seen?"* using only VIIRS. The emulator has three jobs:

1. **Check** the capture–recapture record ([01](01-harmonization.md)) with an independent method.
2. **Plan B:** a MODIS-scale series if capture–recapture failed.
3. **Continuity:** a MODIS-scale series after MODIS ends ([07](07-continuity-and-live.md)), and a way to measure Aqua's orbital drift.

It is a statistical emulator of FIRMS detections, not a physical simulation of the MODIS sensor. A close published precedent aggregates VIIRS inside real MODIS footprints (Zheng et al., *Remote Sensing* 18, 1650, 2026).

## Data

- One row per S-NPP fire cell-day. Label = 1 if Aqua detected the same cell on the same date.
- Features: `n_points`, `frp_sum`, `frp_max`, `bright_max`, `scan_mean`, `track_mean`, `has_day`, `has_night`, region (categorical), month (sine and cosine).
- Training years 2013–2020. Test years 2021–2024, never used for fitting. Outage days masked.

## Method

- Main model: `HistGradientBoostingClassifier` (300 iterations, learning rate 0.05, 31 leaves, early stopping, seed 42). Baselines: logistic regression and a fixed ratio (Aqua/S-NPP by region × month in the calibration years).
- Probability calibration was checked on held-out calibration years (expected calibration error 0.009, below the 0.02 threshold), so no recalibration was applied.
- **Monthly MODIS equivalent** = Σ pᵢ + r · n_snpp, where pᵢ is the probability for each S-NPP cell-day and r is the calibration rate of Aqua-only cell-days per S-NPP cell-day (region × month).
- 90 % monthly range (`continuity.json`): 500 replicates of the Bernoulli sum and a Poisson residual, times a structural factor resampled from monthly log(observed/emulated) of the same region in 2013–2022, leaving out the month's own year.

## Results

**Cell-day classification, Peru, test years 2021–2024** (`data/interim/emulator_metrics.json`; boosting values also in `methodology.json → emulator`):

| Model | AUC | Brier | Monthly total error | Annual total error |
|---|---|---|---|---|
| Gradient boosting (main) | **0.756** | **0.104** | 16.8 % | 4.3 % |
| Logistic regression | 0.744 | 0.105 | 15.8 % | 4.2 % |
| Fixed ratio | 0.614 | 0.115 | 17.5 % | 4.3 % |

Boosting is the best classifier. It beats the fixed ratio on monthly totals (16.8 % vs 17.5 %). On totals, the logistic baseline is slightly better (15.8 %); we report this as is. The most important feature is total fire radiative power (`frp_sum`): bigger fires are more likely to be seen by MODIS.

By region (boosting, 2021–2024):

| Region | Monthly error | Annual error |
|---|---|---|
| Amazon | 20.4 % | 4.0 % |
| Andes | 35.6 % | 5.7 % |
| Coast | 29.0 % | 5.7 % |

**Emulated vs real Aqua over time, Peru** (`continuity.json → metrics.summary`):

| Period | Months | Monthly error | Annual error | Bias | Months inside 90 % range |
|---|---|---|---|---|---|
| 2013–2022 (stable orbit) | 120 | 12.5 % | 3.2 % | +0.4 % | 92.5 % |
| 2023–2026 (drifting orbit) | 47 | 19.4 % | 17.2 % | +12.7 % | 78.7 % |

### The Aqua orbital-drift gap, 2023–2026

From 2023 the Aqua orbit drifts to a later overpass. Afternoon fire changes over a few hours, so Aqua sees less than an on-time Aqua would. The emulator measures this gap. Median Aqua overpass (local solar time of daytime cell-days, `findings.aqua_overpass_by_year`) and the gap (real Aqua minus emulated, divided by emulated; `continuity.json → metrics.emulator_by_year`):

| Year | Aqua overpass | Real Aqua | Emulated Aqua | Real vs emulated |
|---|---|---|---|---|
| 2019 | 13:38 | 7,998 | 7,612 | +5.1 % |
| 2022 | 13:40 | 8,540 | 8,445 | +1.1 % |
| 2023 | 13:52 | 7,543 | 8,155 | −7.5 % |
| 2024 | 14:17 | 9,235 | 9,436 | −2.1 % |
| 2025 | 14:51 | 4,441 | 5,244 | −15.3 % |
| 2026 (11 months) | 15:39 | 3,885 | 5,453 | **−28.8 %** |

In 2026 Aqua sees about **29 % fewer** fire cell-days than an on-time Aqua would. Said the other way, the emulator expects 40 % more than Aqua delivers (`findings.emulator_drift_latest`, months 1–10: 5,445 emulated vs 3,877 real). The harmonized record is not affected, because it uses VIIRS since 2012. A naive MODIS-only trend would show a false decline.

## Validation

- Test years 2021–2024 were never used to fit or select the model.
- Metrics are reported separately for 2021–2022 and 2023–2024 to isolate the drift: boosting AUC 0.771 and 0.742.
- The capture–recapture record and the emulator agree in the stable-orbit years (annual error 3.2 %). Two different methods tell the same story.

## Limitations

- Statistical, not physical. It does not use radiances, background temperature or the MODIS algorithm.
- Monthly errors of 12–36 % by region. The emulator is reliable for annual totals, less so for single months, especially in the Andes.
- It was trained on stable-orbit years. After 2022 the real Aqua drifts away from it. That is a finding, not a model error, but it means real Aqua after 2022 cannot validate the emulator.
- The emulator gives the MODIS scale (about 16 % of afternoon fire). It is not the total-fire estimate.

## Reproduce

```bash
.venv/bin/python scripts/modis_emulator.py
.venv/bin/python scripts/validate.py
.venv/bin/python scripts/continuity.py
```

Outputs: `data/interim/emulator.joblib`, `data/interim/emulator_metrics.json`, `data/processed/methodology.json → emulator`, `data/processed/continuity.json`.
