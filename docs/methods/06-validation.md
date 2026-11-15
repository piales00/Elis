# 06 · Validation

FireChronos Peru · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Show that the harmonized record is right where we can check it, and say where we cannot. The validation must not be circular: the test years are never used to fit anything, and we compare with an external reference built from a different satellite family.

## Data

- **Held-out years 2021–2024.** Calibration uses 2013–2020 only (`methodology.json → params`).
- **MapBiomas Fuego Peru, Collection 2**: annual burned area from Landsat at 30 m, 1990–2025, by department. Burned area (hectares) and active-fire cell-days are different quantities, so we compare year-to-year patterns (correlation), not levels.

## Method

1. **Two sensors, one answer.** In the test years both Aqua and S-NPP exist. We reconstruct each year twice, on identical jointly available days: with Aqua only (n_aqua / p_aqua, the rule used before 2012) and with VIIRS only (n_snpp / p_viirs, the rule used since 2012). If the method works, both agree.
2. **Naive baseline.** The raw sum of all detections compared with the same VIIRS-based estimate. This is not a same-unit accuracy metric; it shows how wrong the uncorrected record is.
3. **External check.** Pearson correlation of annual harmonized fire cell-days with annual MapBiomas burned area, on shared years, excluding the incomplete first year.

## Results

**Annual error in the held-out years 2021–2024** (`methodology.json → validation`):

| Region | Our method (Aqua vs VIIRS) | Naive sum of detections |
|---|---|---|
| **Peru** | **3.5 %** | **334 %** |
| Amazon | 11.3 % | 361 % |
| Andes | 7.0 % | 337 % |
| Coast | 32.0 % | 199 % |

Split by Aqua drift (`sensitivity.json → test_diagnostics`), annual error 2021–2022 / 2023–2024: Amazon 13.3 % / 9.4 %, Andes 9.2 % / 4.8 %, Coast 38.3 % / 25.8 %. Monthly errors are larger (Amazon 24 %, Andes 35 %, Coast 38 %): use the record for seasons and years, with care for single months.

**Correlation with MapBiomas** (annual, 2001–2025):

| Region | Correlation |
|---|---|
| Peru | 0.72 |
| Amazon | 0.54 |
| Andes | 0.72 |
| Coast | 0.66 |

### Landsat-era steps in MapBiomas

The MapBiomas series has steps when its input satellites change: around 2013 (Landsat 8) and 2021–2022 (Landsat 9). Its Peru total jumps from 220,139 ha in 2021 to 445,776 ha in 2022. Computed within each Landsat era (our recalculation from `series.json` and the MapBiomas annual totals; not stored in `methodology.json`), the Peru correlation is higher: **0.85** for 2001–2012, **0.98** for 2013–2020 and **0.92** for 2021–2025. Part of the national 0.72 is the reference's own sensor change, not our error.

Caveat: in the Andes, MapBiomas uses FIRMS hot spots to filter burn scars. There it is not fully independent of our input.

### Real changes are kept

The harmonized record keeps 2005 (64,464 fire cell-days) and 2010 (55,854) as the high years of the MODIS era, the two known drought years. MapBiomas also has high values in those years (315,048 ha and 247,307 ha). Harmonization removed the sensor jump without erasing real variation.

## Limitations

- **Coast: 32 % annual error.** Few fire cell-days, many small agricultural fires, and the lowest detection probabilities (Aqua sees 13 %). Treat Coast numbers as indicative.
- **Amazon: 11 %.**
- **Unit mismatch.** We count places and days with active fire, not area. In years of large fires (2022–2024) MapBiomas burned area grows more than our fire cell-days.
- Only one external reference is available for Peru for the full period, and it has its own sensor changes.
- The test years 2023–2024 already include part of the Aqua drift (see [02](02-modis-emulator.md)).

## Reproduce

```bash
.venv/bin/python scripts/mapbiomas.py
.venv/bin/python scripts/validate.py
```

Outputs: `data/processed/methodology.json → validation`, `data/interim/sensitivity.json → test_diagnostics`, `data/interim/mapbiomas.parquet`. The within-era correlations are a quick check: annual sums of `estimated` for `peru` in `series.json`, correlated with the `peru` annual rows of `mapbiomas.parquet` in each era.
