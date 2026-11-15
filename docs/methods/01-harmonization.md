# 01 · Harmonization: capture–recapture on simultaneous overpasses

Elis · Team Log N + 1 · NASA Space Apps 2026, *Harmonization of MODIS and VIIRS Hot Spots*

## Purpose

MODIS (1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) see fire differently. Adding their detections creates a false jump: Peru goes from **10,375 detections in 2011 to 92,807 in 2012 (×8.9)** in the naive sum. The fire did not change. The instrument did. This note builds one comparable record for 2000–2026 and states its uncertainty.

## Data

| Item | Value |
|---|---|
| Source | NASA FIRMS standard processing (SP) CSVs for Peru: MODIS C6.1 Terra (from 2000-11-01), Aqua (from 2002-07-04), VIIRS S-NPP 375 m (from 2012-01-20), NOAA-20 and NOAA-21. Near-real-time (NRT) files from 2026-08 to 2026-11-13 |
| Filters | `type = 0` (vegetation fire); MODIS confidence ≥ 30; VIIRS confidence `n` or `h` |
| Regions | INEI department boundaries grouped into three macroregions: Amazon (5 departments), Andes (11), Coast (9). Peru = sum of the three |
| Outages | Days with an Aqua or S-NPP outage or degraded coverage are masked (`scripts/config.py` → `OUTAGES`, `DEGRADED`) |

### The unit: fire cell-days

A **fire cell-day** is one 0.1° cell (about 11 km) on one date with at least one detection. All our numbers are fire cell-days. They are not fires and not hectares. The target quantity is *fire cell-days active at the afternoon overpass* (about 13:30 local solar time) and its night overpass.

## Method

1. **Two lists.** For each region and calendar month, list 1 = Aqua cell-days, list 2 = S-NPP cell-days, *m* = cell-days in both.
2. **Chapman estimator.** N = (n₁+1)(n₂+1)/(m+1) − 1, with Seber variance and a Chao log-normal interval (lower limit never below n₁ + n₂ − m).
3. **Calibrate only on simultaneous overpasses.** We use only 2013–2020 days on which Aqua and S-NPP passed less than 20 minutes apart in that region. From N we get the share of fire each sensor sees: p_aqua = n₁/N and p_viirs = n₂/N, per region × month. If m < 5, neighbouring months are pooled, then the full region. Uncertainty comes from a 500-replicate bootstrap over calibration years (seed 42).
4. **Estimate by period** with the sensor that is available and stable:

| Period | Estimate | Confidence |
|---|---|---|
| 2000-11 to 2002-06 | Terra bridged to Aqua scale: n_terra × r(region, month) / p_aqua × c(region, month), with r = Aqua/Terra from 2003–2011 | low |
| 2002-07 to 2002-12 | n_aqua / p_aqua × c(region, month) | low |
| 2003-01 to 2011-12 | n_aqua / p_aqua × c(region, month) | normal |
| 2012-01 to 2026-07 | n_snpp / p_viirs (Aqua fills S-NPP outage days) | normal |
| 2026-08 to 2026-10 | n_snpp / p_viirs from NRT detections; static sources removed with a mask | provisional |
| 2026-11 (through 11-13) | NOAA-20 scaled to S-NPP after S-NPP ends on 2026-11-01; partial month, not extrapolated | provisional |

5. **Aqua-era bias correction, c(region, month).** See the next section. c = 1 from 2012 on.
6. **Ranges.** Before 2012 each replicate is multiplied by a structural error factor resampled in whole-year blocks. Aqua era: Aqua–VIIRS residuals from the calibration years 2013–2020 after the bias correction, rescaled so that each region's residual totals match (the held-out years 2021–2024 are not used). Terra era: Terra backcast residuals. Annual ranges are quantiles of summed aligned replicates. They are never sums of monthly endpoints. All ranges are 90 %.

### Aqua-era bias correction

Before 2012 the estimate uses Aqua (n_aqua / p_aqua); since 2012 it uses S-NPP (n_snpp / p_viirs). Both probabilities come from the same calibration on simultaneous days, but on all days the two rules do not give the same number. We measure the gap on the **calibration years 2013–2020 only**, where both rules run on identical available days (outage and degraded days masked): bias = log(Σ Aqua-based / Σ VIIRS-based) by region, with a 90 % interval from 500 bootstrap resamples of whole years (seed 42). High season is July–November (`config.AQUA_BIAS_HIGH_SEASON`).

| Region | Bias, all months | High season | Low season | Applied correction |
|---|---|---|---|---|
| Amazon | **+11.9 %** [+8.6, +15.0] | +18.0 % [+14.1, +21.7] | −12.7 % [−17.2, −9.6] | ×0.85 high season, ×1.14 low season |
| Andes | +0.3 % [−3.0, +3.4] | +7.1 % [+3.3, +10.7] | −31.7 % [−35.9, −27.5] | none |
| Coast | **−31.5 %** [−38.1, −24.8] | −23.3 % [−32.3, −15.0] | −40.6 % [−44.5, −35.3] | ×1.30 high season, ×1.68 low season |

Values are exp(bias) − 1 (`sensitivity.json → aqua_bias`). Rules, set before looking at 2021–2024: correct only if the all-month interval excludes zero; use separate high- and low-season factors only if the two season intervals do not overlap; nothing finer (no monthly factors). The correction is c = exp(−bias). The Amazon and the Coast are corrected by season. The Andes is not corrected: its all-month bias is not significant, because an Aqua excess in the high season cancels a large Aqua deficit from December to June (Aqua below VIIRS in all 8 calibration years in each of those months).

Terra inherits the same correction: the Terra era is bridged to Aqua counts and divided by p_aqua, so it carries the same p_aqua gap. The Terra→Aqua bridge itself is checked separately by the Terra backcast (see Limitations).

On the held-out years 2021–2024, never used above, the correction reduces the Aqua-vs-VIIRS annual error from 11.3 % to 2.3 % in the Amazon and from 32.0 % to 9.0 % on the Coast; the Andes is unchanged (7.0 %). See [06 · Validation](06-validation.md).

We also tried a seasonal correction for the Andes (each season's interval excludes zero). On 2021–2024 it lowered the Andes monthly error from 35.3 % to 27.0 % but raised its annual error from 6.98 % to 7.01 %, so it is not applied.

### The overpass-time finding

Small fires flicker on a timescale shorter than one hour. When the two satellites pass at different times, fire that starts or stops in between looks like fire "missed" by one sensor, and Chapman inflates N. Calibration years 2013–2020, Peru (`methodology.json → findings.calibration_overpass_gaps`):

| Aqua – S-NPP overpass gap | Share of Aqua cell-days also seen by S-NPP | Chapman N / S-NPP |
|---|---|---|
| 0–20 min | **80.0 %** | 1.25 |
| 20–40 min | 57.6 % | 1.74 |
| 40–60 min | 54.8 % | 1.82 |
| > 60 min | 65.7 % | 1.52 |

This is why we calibrate only on simultaneous days. It also rules out Chapman with Terra (about 3 hours earlier) and with the drifting Aqua orbit after 2022.

### Static-source mask (NRT)

NRT files have no `type` field, so industrial and other static hot spots cannot be dropped by type. We flag a cell as static when, in 2012–2025, at least 50 % of its detections (and at least 5) are non-vegetation. Tested on standard data (`findings.static_source_mask`):

| Sensor, 2024–2025 | Static detections removed | Vegetation detections removed |
|---|---|---|
| VIIRS S-NPP | 92.0 % | 0.18 % |
| VIIRS NOAA-20 | 91.7 % | 0.20 % |
| MODIS Aqua | 32.3 % | 0.13 % |

The 2024–2025 test overlaps the mask years, so it is in-sample. In the 2026 NRT files the mask removed 357 of 40,334 S-NPP detections.

### NOAA-20 for November 2026

S-NPP data end on 2026-11-01. After that we scale NOAA-20 cell-days to the S-NPP scale with the regional S-NPP/NOAA-20 ratio measured on S-NPP-available days of 2026 (January–October):

| Region | S-NPP / NOAA-20 ratio | 90 % range | Monthly CV |
|---|---|---|---|
| Amazon | 0.982 | 0.932–1.021 | 0.13 |
| Andes | 0.975 | 0.944–1.001 | 0.09 |
| Coast | 0.973 | 0.928–1.013 | 0.07 |

## Results

**Detection probability** (Peru, 2013–2020, simultaneous days; `methodology.json → detection`). Over the year, Aqua sees **16.4 %** and S-NPP sees **78.9 %** of the estimated afternoon fire cell-days. VIIRS sees 4.8 times as many cell-days as MODIS (Amazon 4.8, Andes 4.7, Coast 5.3).

| Month | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| p_aqua | 0.12 | 0.15 | 0.10 | 0.12 | 0.11 | 0.13 | 0.13 | 0.18 | 0.21 | 0.15 | 0.12 | 0.14 |
| p_viirs | 0.66 | 0.69 | 0.56 | 0.68 | 0.68 | 0.71 | 0.79 | 0.83 | 0.84 | 0.79 | 0.73 | 0.73 |

Both sensors see a larger share in the dry-season peak (August–September), when fires are larger.

**Harmonized annual record, Peru** (fire cell-days; point estimate from `series.json`; 90 % range from the aligned replicates in `data/interim/series_replicates.parquet`):

| Year | Naive sum of detections | Harmonized estimate | 90 % range | Source |
|---|---|---|---|---|
| 2003 | 14,125 | 44,608 | 41,542–47,796 | Aqua, corrected |
| 2005 | 21,016 | 62,776 | 57,226–69,544 | Aqua, corrected |
| 2010 | 18,588 | 54,139 | 49,982–59,306 | Aqua, corrected |
| 2011 | 10,375 | 32,397 | 30,028–34,848 | Aqua, corrected |
| 2012 | 92,807 | 45,117 | 44,851–45,763 | VIIRS |
| 2016 | 102,178 | 52,342 | 52,027–53,224 | VIIRS |
| 2020 | 198,258 | 57,573 | 57,106–58,830 | VIIRS |
| 2022 | 180,188 | 52,063 | 51,815–52,831 | VIIRS |
| 2024 | 299,657 | 53,743 | 53,480–54,589 | VIIRS |
| 2025 | 153,749 | 33,493 | 33,241–34,133 | VIIRS |
| 2026 (to 11-13) | 156,539 | 33,890 | 33,759–34,366 | VIIRS, provisional from August |

Every Aqua-era annual range now contains its point estimate. Before the correction the range sat above the estimate in most Aqua-era years, because the structural residuals came from the held-out years and were not centred.

- The false ×8.9 jump of 2011→2012 becomes a change from 32,397 to 45,117 fire cell-days (×1.39; ×1.36 before the Aqua-era correction). This is below the largest change between other adjacent years (77.6 %), but above their 75th percentile (37.3 %). Two checks that do not depend on how much fire a year had: from 2011 to 2012, the change in `estimated / n_aqua` shrinks from −13.8 % to −11.5 %, and the change in `estimated` / MapBiomas burned area from −10.5 % to −8.1 %. By region, the step grows in the Amazon (+21 % → +36 %) and shrinks on the Coast (+83 % → +24 %).
- **Months on the edge of their range.** Before the correction, 189 of 1,252 months had the estimate on one end of its own 90 % range. Now 70 do, all explained: 54 Andes low-season months of 2003–2011 (the uncorrected Andes seasonal gap makes those ranges truly asymmetric), 12 months of the low-confidence Terra era 2000–2002 (uncentred Terra backcast residuals), 3 national months that follow those Andes months, and one month with zero fire.
- The naive sum grows again in 2018 (NOAA-20) and 2023 (NOAA-21). The harmonized series does not.
- **Highest months** in the harmonized record (excluding the low-confidence Terra bridge): August 2005, **20,063** [16,689–25,924], and August 2010, **19,028** [15,936–24,665], both drought years. September 2024, the record in the naive sum (115,433 detections), is **15,520** [15,219–15,940] fire cell-days: high, but below 2005, 2010 and August 2020.
- From 2012 on, `estimated / n_snpp` stays between 1.27 and 1.35 every year (`sensitivity.json → national_annual`).

## Validation

Summary here; details in [06 · Validation](06-validation.md). On the held-out years 2021–2024, the bias-corrected Aqua-only reconstruction (the rule we use before 2012) and the VIIRS reconstruction differ by **3.8 %** per year for Peru (Amazon 2.3 %, Andes 7.0 %, Coast 9.0 %; before the correction: Peru 3.5 %, Amazon 11.3 %, Andes 7.0 %, Coast 32.0 %). For Peru the annual error rises slightly because, before the correction, the Amazon excess and the Coast deficit cancelled out; the Peru monthly error falls from 28.2 % to 19.3 %. The naive sum differs by **334 %**.

## Limitations

- **Lower bound.** Chapman assumes the two sensors are independent. They are not: a fire one misses tends to be missed by the other too. The estimate is a minimum. See [03](03-bayesian-three-satellites.md) and [04](04-underestimation.md).
- Clouds and smoke can hide fire from both sensors at once. Capture–recapture cannot see that fire.
- **2000-11 to 2002-12 is low confidence.** The Terra backcast (2003–2006, trained on 2007–2011) has annual errors of 16–28 % by region. November 2000, the first Terra month, gives 20,862 [9,484–26,182], an implausibly high value we do not interpret.
- Ranges after 2012 reflect calibration uncertainty only (about ±1–2 % per year). They do not include structural bias.
- Two descriptive checks did not pass: the 2002→2003 change (+78.6 %) is slightly above the largest normal year-to-year change (77.6 %), and `estimated / n_snpp` is outside its 2013–2020 range in 2022, 2024 and 2025.
- **Andes Aqua era not corrected.** Its seasonal Aqua–VIIRS gap is real but cancels over the year (see above); single Andes months of 2003–2011 have asymmetric ranges.
- S-NPP outage days after 2012 that are filled with Aqua keep the uncorrected Aqua rule, so that the record from 2012 on is unchanged.
- Macroregions follow whole departments. That is how Peru is governed, but it mixes ecosystems at the Amazon–Andes edge.
- August–November 2026 uses NRT data and is provisional until FIRMS replaces it with standard data.

## Reproduce

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/download_peru_sources.py
.venv/bin/python scripts/cells.py && .venv/bin/python scripts/cells.py --all-types
.venv/bin/python scripts/capture_recapture.py
.venv/bin/python scripts/build_series.py
.venv/bin/python scripts/validate.py
```

Outputs: `data/processed/series.json`, `data/processed/methodology.json` (`params`, `detection`, `periods`, `findings`). Parameters live only in `scripts/config.py`. Raw FIRMS files go in `data/raw/` and are not versioned.
