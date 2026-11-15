# 06 · Validation

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Show that the harmonized record is right where we can check it, and say where we cannot. The validation must not be circular: the test years are never used to fit anything, and we compare with an external reference built from a different satellite family.

## Data

- **Held-out years 2021–2024.** Calibration uses 2013–2020 only (`methodology.json → params`).
- **MapBiomas Fuego Peru, Collection 2**: annual burned area from Landsat at 30 m, 1990–2025, by department. Burned area (hectares) and active-fire cell-days are different quantities, so we compare year-to-year patterns (correlation), not levels.

## Method

1. **Two sensors, one answer.** In the test years both Aqua and S-NPP exist. We reconstruct each year twice, on identical jointly available days: with Aqua only (n_aqua / p_aqua × c, the bias-corrected rule used before 2012) and with VIIRS only (n_snpp / p_viirs, the rule used since 2012). If the method works, both agree. The Aqua-era correction c was measured on 2013–2020 only ([01](01-harmonization.md#aqua-era-bias-correction)), so 2021–2024 stay out of sample.
2. **Naive baseline.** The raw sum of all detections compared with the same VIIRS-based estimate. This is not a same-unit accuracy metric; it shows how wrong the uncorrected record is.
3. **External check.** Pearson correlation of annual harmonized fire cell-days with annual MapBiomas burned area, on shared years, excluding the incomplete first year.

## Results

**Annual error in the held-out years 2021–2024** (`methodology.json → validation`):

| Region | Our method (Aqua vs VIIRS) | Before the Aqua-era correction | Naive sum of detections |
|---|---|---|---|
| **Peru** | **3.8 %** | 3.5 % | **334 %** |
| Amazon | 2.3 % | 11.3 % | 361 % |
| Andes | 7.0 % | 7.0 % (not corrected) | 337 % |
| Coast | 9.0 % | 32.0 % | 199 % |

The correction lowers the error in the Amazon and on the Coast and leaves the Andes unchanged. For Peru the annual error rises by 0.2 points: before the correction, the Amazon excess and the Coast deficit cancelled in the national total. Signed annual Peru errors 2021–2024: −5.4 %, +3.2 %, −5.0 %, +1.4 % (before: −1.6 %, +5.5 %, −2.4 %, +4.6 %).

Split by Aqua drift (`sensitivity.json → test_diagnostics_corrected`; uncorrected values in `test_diagnostics`), annual error 2021–2022 / 2023–2024: Amazon 1.2 % / 3.4 %, Andes 9.2 % / 4.8 %, Coast 10.3 % / 7.7 %. Monthly errors are larger (Peru 19 %, Amazon 18 %, Andes 35 %, Coast 29 %; before the correction Peru 28 %, Amazon 24 %, Coast 38 %): use the record for seasons and years, with care for single months.

**Correlation with MapBiomas** (annual, 2001–2025):

| Region | Correlation |
|---|---|
| Peru | 0.75 (0.72 before the correction) |
| Amazon | 0.65 (0.54) |
| Andes | 0.72 (0.72) |
| Coast | 0.67 (0.66) |

### Landsat-era steps in MapBiomas

The MapBiomas series has steps when its input satellites change: around 2013 (Landsat 8) and 2021–2022 (Landsat 9). Its Peru total jumps from 220,139 ha in 2021 to 445,776 ha in 2022. Computed within each Landsat era (our recalculation from `series.json` and the MapBiomas annual totals; not stored in `methodology.json`), the Peru correlation is higher: **0.85** for 2001–2012, **0.98** for 2013–2020 and **0.92** for 2021–2025 (unchanged by the Aqua-era correction). Part of the national 0.75 is the reference's own sensor change, not our error. Across the 2011→2012 sensor change, the ratio of our estimate to MapBiomas burned area changes by −8.1 % (−10.5 % before the correction).

Caveat: in the Andes, MapBiomas uses FIRMS hot spots to filter burn scars. There it is not fully independent of our input.

### Real changes are kept

The harmonized record keeps 2005 (62,776 fire cell-days) and 2010 (54,139) as the high years of the MODIS era, the two known drought years. MapBiomas also has high values in those years (315,048 ha and 247,307 ha). Harmonization removed the sensor jump without erasing real variation.

## Limitations

- **Coast: 9 % annual error after the correction (32 % before).** Few fire cell-days, many small agricultural fires, and the lowest detection probabilities (Aqua sees 13 %). Treat Coast numbers as indicative.
- **Andes: 7 %, not corrected.** Its Aqua–VIIRS gap is seasonal and cancels over the year (see [01](01-harmonization.md#aqua-era-bias-correction)).
- **Unit mismatch.** We count places and days with active fire, not area. In years of large fires (2022–2024) MapBiomas burned area grows more than our fire cell-days.
- Only one external reference is available for Peru for the full period, and it has its own sensor changes.
- The test years 2023–2024 already include part of the Aqua drift (see [02](02-modis-emulator.md)).

## Reproduce

```bash
.venv/bin/python scripts/mapbiomas.py
.venv/bin/python scripts/validate.py
```

Outputs: `data/processed/methodology.json → validation`, `data/interim/sensitivity.json → aqua_bias, test_diagnostics, test_diagnostics_corrected`, `data/interim/mapbiomas.parquet`. The within-era correlations are a quick check: annual sums of `estimated` for `peru` in `series.json`, correlated with the `peru` annual rows of `mapbiomas.parquet` in each era.
