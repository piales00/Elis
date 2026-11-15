# FireChronos Peru · Methods and results

Team **Log N + 1** · NASA Space Apps 2026 · Challenge *Harmonization of MODIS and VIIRS Hot Spots*

## Abstract

MODIS (1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) detect fire differently. Adding their detections makes fire in Peru appear to multiply by 8.9 from 2011 (10,375 detections) to 2012 (92,807). We build one comparable record of fire in Peru for 2000–2026, counted in **fire cell-days** (a 0.1° cell, about 11 km, on a date with at least one detection; not fires, not hectares). We estimate the total with capture–recapture (Chapman), calibrated only on days when Aqua MODIS and S-NPP VIIRS pass less than 20 minutes apart. Calibrating this way matters: on those days the two sensors agree on 80 % of Aqua cell-days, against 55–58 % when they pass 20–60 minutes apart. Each period uses the sensor available (Terra bridge, Aqua, S-NPP, NOAA-20 in November 2026). On the held-out years 2021–2024 the Aqua-only and VIIRS-only reconstructions of Peru differ by 3.5 % per year, against 334 % for the naive sum. The record correlates with MapBiomas burned area at 0.72 (0.85–0.98 within each Landsat era). A gradient-boosting MODIS emulator (AUC 0.76) checks the record and shows that the drifting Aqua orbit already sees 29 % fewer fire cell-days than an on-time Aqua in 2026. A three-satellite model and a simulator show that the sensors are positively dependent, so the record is a **lower bound**, roughly 10–15 % low. No correction passed our tests, so none is applied. A seasonal outlook built on the record beats climatology in a leave-one-year-out backtest. Trained on raw detections, the same model under-predicts post-2012 seasons by ×4.5. Every number has a 90 % range, and forecasts are kept apart from observations.

## Technical notes

| # | Note | Main result |
|---|---|---|
| 01 | [Harmonization: capture–recapture on simultaneous overpasses](01-harmonization.md) | Aqua sees 16 % and S-NPP 79 % of afternoon fire cell-days; the false ×8.9 jump becomes ×1.36 |
| 02 | [The MODIS emulator](02-modis-emulator.md) | AUC 0.756 vs 0.614 for a fixed ratio; 3.2 % annual error 2013–2022; Aqua drift gap −28.8 % in 2026 |
| 03 | [Three satellites: dependence and flicker](03-bayesian-three-satellites.md) | All pairwise dependences positive; ×3 is inflated by a 50-minute gap; small fires flicker |
| 04 | [How much does the headline number undercount?](04-underestimation.md) | About −11 % in the best-fit simulated world; no estimator passed; reported as a lower bound |
| 05 | [Seasonal fire outlook](05-seasonal-forecast.md) | Lead-1 RPSS 0.35 (macroregions); 2026 inside the range; 2027 outlook |
| 06 | [Validation](06-validation.md) | 3.5 % vs 334 % on held-out years; MapBiomas 0.72 |
| 07 | [After MODIS: continuity and sealed daily predictions](07-continuity-and-live.md) | Record unchanged without MODIS; first sealed prediction scored |

Downloadable technical report: [`docs/report/firechronos-technical-report.pdf`](../report/firechronos-technical-report.pdf) (HTML source alongside).

## Conventions

- Unit: **fire cell-days**. Never "fires" or "hectares" for our numbers.
- Ranges: 90 % unless stated.
- Regions: Amazon, Andes and Coast macroregions, built from whole INEI departments.
- Every number in these notes comes from `data/processed/*.json` or from the intermediate files named in each note. Parameters are set only in `scripts/config.py`.
- Data contract and internal team notes (in Spanish) are in `docs/`.
