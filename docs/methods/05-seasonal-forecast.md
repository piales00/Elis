# 05 · Seasonal fire outlook

Elis · Team Log N + 1 · NASA Space Apps 2026

**Everything in this note is a forecast, not an observation**, except the rows marked *observed*.

## Purpose

Answer *"how will the August–October fire season look?"* for Peru, its three macroregions and its departments, in fire cell-days of the harmonized record. The output is a probability for each class (low, normal, high, very high) and a 90 % range, never a single exact number. We publish a model only where it beats climatology in a backtest; otherwise we publish climatology and say so.

## Data

| Input | Source |
|---|---|
| Fire | Harmonized `estimated` ([01](01-harmonization.md)); season = sum of August, September, October. Departments from `map.parquet` |
| ENSO | ONI (NOAA CPC, through 2026-09) and ICEN (ENFEN/IGP, through 2026-09), 3-month window ending one month before the origin |
| Drought | SPI-3, SPI-6, SPI-12 from NASA POWER monthly precipitation (`PRECTOTCORR`), averaged over 1.5° grid points of each macroregion (Amazon 22, Andes 16, Coast 8); departments use their macroregion |
| History | 2003–2025 (23 seasons) |

## Method

- Ridge regression on log anomalies (log of the season minus the training median). Candidate predictor sets: fire alone, or fire plus ONI or ICEN, plus SPI-3, SPI-6 or SPI-12 (12 candidates).
- Leads of 1, 4, 7 and 10 months (origins July, April, January and the previous October).
- **Leave-one-year-out backtest, 2003–2025.** The predictor set, ridge alpha and spread are chosen *inside* each training fold.
- Probabilities: a normal distribution in log space, centred on the forecast, with the spread of the cross-validation residuals. Class thresholds = 25th, 75th and 90th percentiles of 2003–2025, so climatology is 25 / 50 / 15 / 10 %.
- **Skill scores** against climatology: RPSS (ranked probability skill score) and MAE skill (1 − MAE_model / MAE_climatology, in log units).
- **Publication rule:** a unit and lead uses the model only if RPSS ≥ 0.05 and MAE skill > 0. Departments with median season activity below 100 fire cell-days get no forecast.

Variant choice (mean over the three macroregions and all leads):

| Variant | Mean RPSS | Mean MAE skill |
|---|---|---|
| Fire only | 0.150 | 0.093 |
| Fire + ENSO | 0.231 | 0.146 |
| Fire + drought | 0.175 | 0.100 |
| Fire + ENSO + drought (fixed) | 0.265 | 0.167 |
| **Selection inside cross-validation (used)** | **0.257** | **0.166** |

The fixed "fire + ENSO + drought" set scores slightly higher, but choosing it after seeing the backtest would be selection on the test. We use the variant whose selection happens inside the folds.

## Results

### Skill by lead (backtest 2003–2025)

| Lead | Macroregions with skill | Mean RPSS | Mean MAE skill | Departments with skill | Dept. mean RPSS |
|---|---|---|---|---|---|
| 1 month (origin July) | 3 of 3 | 0.306 | 0.261 | 15 of 20 | 0.146 |
| 4 months (April) | 2 of 3 | 0.193 | 0.147 | 6 of 20 | 0.023 |
| 7 months (January) | 2 of 3 | 0.203 | 0.145 | 9 of 20 | 0.051 |
| 10 months (October) | 2 of 3 | 0.142 | 0.100 | 6 of 20 | 0.024 |

Peru as a whole: RPSS 0.426 at lead 1, 0.175 at lead 4, 0.079 at lead 7 and −0.084 at lead 10. The national outlook therefore uses the model at leads 1, 4 and 7 and climatology at lead 10. The Coast has the most skill (RPSS 0.31–0.52 at every lead); the Amazon has skill only at lead 1.

These numbers use the record with the Aqua-era bias correction ([01](01-harmonization.md#aqua-era-bias-correction)). Before that correction, mean lead-1 RPSS was 0.347 for the macroregions and 0.352 for Peru.

### 2026 season, out of sample

Models fitted on 2003–2025 only. The 2026 observations are near-real-time and provisional.

| Region | Lead | Forecast median [90 % range] | Most likely class | Observed 2026 | Observed class | Inside |
|---|---|---|---|---|---|---|
| Peru | 1 (model) | 24,392 [18,848–31,568] | normal | 22,955 | normal | yes |
| Peru | 4 (model) | 24,060 [17,610–32,872] | normal | 22,955 | normal | yes |
| Amazon | 1 (model) | 13,456 [10,284–17,606] | normal | 11,618 | normal | yes |
| Andes | 1 (model) | 9,337 [6,897–12,641] | normal | 9,742 | normal | yes |
| Coast | 1 (model) | 1,976 [1,430–2,732] | very high | 1,596 | normal | yes |

All four observations fall inside the 90 % range. The most likely class was right for Peru, the Amazon and the Andes, and wrong for the Coast (forecast very high, observed normal). One season is not a skill estimate; the backtest is.

### 2027 outlook (origin 2026-10, lead 10 months)

| Region | Method | Median [90 % range] | Most likely class (probability) |
|---|---|---|---|
| Peru | climatology (no skill at this lead) | 27,301 [18,224–35,565] | normal (50 %) |
| Amazon | climatology | 13,624 [10,292–17,539] | normal (50 %) |
| Andes | model | 14,426 [10,153–20,499] | very high (52 %) |
| Coast | model | 1,895 [1,328–2,703] | very high (36 %) |

Departments: 20 of 25 get an outlook (6 model, 14 climatology); 5 are below the activity threshold (Callao, Ica, Moquegua, Tacna, Tumbes). Model departments: Áncash, Cusco, Junín, La Libertad, Lima, Pasco. The strongest signal is Pasco: very high with 89 % probability, 1,827 [1,345–2,481] fire cell-days.

### Demo: "Without harmonization, even AI gets it wrong"

Same model, trained on 2003–2011, tested on 2013–2025 seasons (lead 1, `forecast.json → raw_vs_corrected`):

| Training series | Median observed / predicted, Peru | MAE (log), Peru |
|---|---|---|
| Naive sum of detections | **4.49** | 1.51 |
| Harmonized record | **1.02** | 0.11 |

Trained on raw detections, the model under-predicts every post-2012 season by about ×4.5, because it never saw the 2012 sensor jump. On the Coast it fails completely (ratio 0.002). Trend fitted on 2003–2025 (`methodology.json → forecast.raw_vs_corrected.trend`, Peru): **+16.8 % per year** on the raw series (×30 over the period) and **+0.2 % per year** on the harmonized record (flat; −0.3 % per year before the Aqua-era correction). Trained on the harmonized record before that correction, the Peru ratio was 0.94, the Amazon 0.89 and the Coast 0.22; now 1.02, 1.04 and 1.12.

### Monthly forecast

A separate monthly model (ridge on the last 3 months of fire; adding NASA POWER precipitation and temperature did not improve it, so the fire-only variant is used) barely beats climatology: Peru skill 0.022 at lead 1 month. Its season version beats climatology (0.363). The app shows one published monthly row (December 2026, Peru, 1,440 [753–3,241] fire cell-days), drawn as a dashed line and labelled *forecast*.

## Validation

- Every skill number comes from leave-one-year-out cross-validation with all choices made inside the fold.
- 2026 is a true out-of-sample year (fitted on 2003–2025 only).
- Department totals rebuilt from `map.parquet` match the macroregion series exactly (8,229 cells, maximum difference 0).

## Limitations

- 23 seasons. Ranges are wide and skill estimates are noisy.
- Selecting departments by backtest skill favours some lucky units.
- Before 2012, department series spread unseen fire with the VIIRS 2013–2024 climatology.
- It forecasts the harmonized record, which is itself a lower bound ([04](04-underestimation.md)).
- It is a season outlook by region, not a prediction of where a fire will start.

## Reproduce

```bash
.venv/bin/python scripts/fetch_power.py
.venv/bin/python scripts/forecast.py
.venv/bin/python scripts/forecast_v2.py
```

Outputs: `data/processed/forecast.json` (season outlook), `data/processed/methodology.json → forecast` (monthly model, raw-vs-corrected trend, `season_outlook` summary), forecast rows of `series.json` (`is_forecast: true`).
