# 07 · After MODIS: continuity and sealed daily predictions

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Terra and Aqua MODIS are expected to end their science missions in 2027. Two questions:

1. **Continuity.** Does the harmonized record survive the end of MODIS?
2. **Live test.** Can we show, every day and in the open, that the VIIRS-to-MODIS link still works, with predictions that cannot be edited after the fact?

## Part 1 · MODIS shutdown scenario

### Method

We pretend MODIS shut down in **January 2023** (`continuity.json → scenario`). From that month on, the MODIS-scale series uses the emulated Aqua ([02](02-modis-emulator.md)) with its 90 % range instead of the real Aqua. We then check what changes in the harmonized record.

### Results

- **The harmonized record does not change.** Since 2012 it is n_snpp / p_viirs, with p_viirs calibrated once on 2013–2020. Rebuilding it without MODIS reproduces `series.json` to within 0.05 fire cell-days in every one of 716 region-months; the VIIRS identity check differs by 0.
- **The only part that depends on MODIS** is S-NPP outage days filled with Aqua: 10 national months in 2012–2026, carrying **0.71 %** of Peru's harmonized total (4,570 of 643,143 fire cell-days). After S-NPP ends, NOAA-20 scaled to S-NPP fills those days instead ([01](01-harmonization.md)).
- **The MODIS-scale series continues** with emulated Aqua. In the stable-orbit years 2013–2022 the emulator matches real Aqua with a 3.2 % annual error and 92.5 % of months inside the range. Example: September 2024, real Aqua 3,722 vs emulated 3,593 [2,676–4,131].
- **The drifting Aqua is already a worse MODIS than the emulator.** In 2026 real Aqua sees 28.8 % fewer fire cell-days than the emulator expects from an on-time Aqua (September 2026: 1,026 real vs 1,788 [1,309–2,051] emulated).

## Part 2 · Sealed daily predictions

### How it works

Each day a scheduled job (`.github/workflows/live-predictions.yml`, 12:00 UTC) runs `scripts/live_predict.py`:

1. **Predict.** For yesterday (UTC), download VIIRS NRT detections from FIRMS (S-NPP, or NOAA-20 when FIRMS has no S-NPP), build fire cell-days with the same filters and static-source mask as the record, and predict **how many fire cell-days Aqua MODIS will report** for that day, per region, with a 90 % range.
2. **Seal.** The prediction file stores the SHA-256 of the FIRMS input, the model version (hash of `emulator.joblib`), the hash of the calibration, and a SHA-256 of its own canonical JSON. It is committed to the public `live-data` branch. A sealed file is never overwritten; the script refuses.
3. **Score.** A day later, the job downloads Aqua MODIS NRT for that date, checks the seal, counts the real Aqua fire cell-days and writes the result to `scoreboard.json`.

The predictive model: emulator probability summed over VIIRS cell-days, plus the Aqua-only rate, times a recent drift factor; the range comes from a Poisson-lognormal distribution. Drift factor and spread were fitted on the last 120 days with both sensors (2026-06-28 to 2026-11-01, `live/calibration.json`). Recent drift factors: Amazon 0.55, Andes 0.82, Coast 1.06 (NOAA-20 input: 0.57, 0.82, 1.05).

### Current scoreboard

`data/processed/live/scoreboard.json` (updated 2026-11-15 02:02 UTC). Unit: Aqua fire cell-days per day. Input: VIIRS NOAA-20.

| Date | Region | Predicted [90 % range] | Observed (Aqua) | Inside |
|---|---|---|---|---|
| 2026-11-12 | Peru | 17.5 [1–60] | 32 | yes |
| 2026-11-12 | Amazon | 12.5 [0–42] | 17 | yes |
| 2026-11-12 | Andes | 4.3 [0–14] | 13 | yes |
| 2026-11-12 | Coast | 0.7 [0–2] | 2 | yes |

On the `live-data` branch the predictions for 2026-11-13 (Peru 10.7 [0–33]; no Aqua data yet) and 2026-11-14 (Peru 5.1 [0–18]) are also sealed and waiting to be scored.

### Honest limits

- **One scored day.** Coverage 1 of 1 says nothing yet about calibration. The national error that day was 14.5 fire cell-days (45 %).
- **The first predictions were not blind.** The files for 2026-11-12 and 2026-11-13 were generated on 2026-11-15 at 02:01 UTC, when the system started, after both dates had ended; the 11-12 file was scored 26 seconds later. They test the pipeline. Only predictions committed to `live-data` before the Aqua NRT file is released count as a blind test; the daily schedule is designed for that.
- **What the seal proves.** The hash and the commit prove that a prediction was not changed after it was sealed. They do not prove, on their own, that the Aqua data were not available at sealing time. The commit time on `live-data` is the evidence.
- **What is predicted.** This predicts what Aqua will report from what VIIRS saw the same day. It checks the instrument link. It is not a forecast of future fire.
- **Wide ranges.** Daily counts are small and noisy; the log-scale spread is 0.55–1.45 by region.

## Reproduce

```bash
.venv/bin/python scripts/continuity.py
.venv/bin/python scripts/live_predict.py export
FIRMS_MAP_KEY=... .venv/bin/python scripts/live_predict.py predict --date 2026-11-14
FIRMS_MAP_KEY=... .venv/bin/python scripts/live_predict.py score --date 2026-11-14
```

Outputs: `data/processed/continuity.json`; `data/processed/live/` (`calibration.json`, `static_mask.json`, `cell_regions.json`, `emulator.joblib`, `predictions/`, `scoreboard.json`). Live files are published on the `live-data` branch.
