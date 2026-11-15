<p align="center">
  <img src="web/public/elis-logo.png" alt="Elis logo" width="140">
</p>

# Elis

**Elis — a harmonized MODIS–VIIRS fire record for Peru, 2000–2026, with its uncertainty stated.**

Team **Log N + 1** · NASA Space Apps Challenge 2026 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots*

## The problem

MODIS (1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) detect fire differently. Raw counts jump in 2012, 2018 and 2023 as satellites are added to the record (VIIRS S-NPP, NOAA-20, NOAA-21). In Peru the naive sum goes from 10,375 detections in 2011 to 92,807 in 2012, a false ×8.9 jump. The fire did not change; the instrument did.

## What Elis does

The unit is the **fire cell-day**: a 0.1° cell (about 11 km) on a date with at least one detection. It is not a count of fires and not hectares.

- **Capture–recapture harmonization.** The Chapman estimator, calibrated only on days when Aqua MODIS and S-NPP VIIRS pass less than 20 minutes apart, estimates total fire including fire neither sensor saw. On those days the sensors agree on 80 % of Aqua cell-days, against 55–58 % when they pass 20–60 minutes apart. Aqua-era estimates are corrected for the Aqua-vs-VIIRS gap measured on 2013–2020. The false ×8.9 jump becomes ×1.39.
- **Validation.** On the held-out years 2021–2024 the bias-corrected Aqua-only and the VIIRS-only reconstructions of Peru differ by 3.8 % per year (Amazon 2.3 %, Andes 7.0 %, Coast 9.0 %), against 334 % for the naive sum. The record correlates with MapBiomas burned area at 0.75 (0.85–0.98 within each Landsat era).
- **MODIS emulator.** A gradient-boosting model (AUC 0.76) checks the record and shows that the drifting Aqua orbit sees 29 % fewer fire cell-days than an on-time Aqua in 2026.
- **Honest uncertainty.** A three-satellite model and a simulator show the sensors are positively dependent, so the record is a lower bound, roughly 10–15 % low. No correction passed our tests, so none is applied. Every number has a 90 % range.
- **Seasonal outlook.** A forecast built on the record beats climatology in a leave-one-year-out backtest. Forecasts are always labelled and kept apart from observations.

## Documentation

- [Technical notes and results](docs/methods/README.md) (seven notes: harmonization, MODIS emulator, three satellites, underestimation, seasonal outlook, validation, continuity after MODIS)
- [Technical report (PDF)](docs/report/firechronos-technical-report.pdf), with its [HTML source](docs/report/firechronos-technical-report.html)

## Data

- NASA FIRMS: MODIS Terra and Aqua, VIIRS S-NPP, NOAA-20, NOAA-21
- NASA GIBS (satellite imagery) and NASA POWER (precipitation and temperature)
- NOAA CPC ONI and ENFEN ICEN (ENSO indices)
- MapBiomas Fuego Peru (burned area, used for validation)
- INEI (department boundaries)

The raw FIRMS CSV files are not in the repository. Annual MODIS and VIIRS S-NPP files go in `data/raw/`; the 2026 NOAA-20/21, MODIS and S-NPP files go in `data/raw/2026/`. Small aggregates in `data/processed/` are committed.

## Run it

Python 3 and Node.js are required.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Build the data, in this order (parameters live in `scripts/config.py`):

```bash
.venv/bin/python scripts/download_peru_sources.py
.venv/bin/python scripts/cells.py
.venv/bin/python scripts/cells.py --all-types
.venv/bin/python scripts/capture_recapture.py
.venv/bin/python scripts/modis_emulator.py
.venv/bin/python scripts/build_series.py
.venv/bin/python scripts/validate.py
.venv/bin/python scripts/build_map.py
.venv/bin/python scripts/fetch_power.py
.venv/bin/python scripts/forecast.py
.venv/bin/python scripts/forecast_v2.py
.venv/bin/python scripts/continuity.py
.venv/bin/python scripts/export_static.py
```

`export_static.py` runs last: it copies a snapshot of the published files to `web/public/data/` (about 11 MB, one compact map file per month). The web app reads the API first and switches to this snapshot automatically if the API does not answer within 7 s, so regenerate it whenever `data/processed/` changes.

Start the API (it serves the precomputed files in `data/processed/`; interactive docs at `http://127.0.0.1:8000/docs`):

```bash
.venv/bin/python -m uvicorn api.main:app --reload
```

Start the web app:

```bash
cd web
npm install
npm run dev
```

The web app reads `VITE_DATA_SOURCE` (`mock`, the default, uses the sample data in `web/mock/`; `api` uses the API) and `VITE_API_BASE` (default `http://localhost:8000`). For example:

```bash
VITE_DATA_SOURCE=api VITE_API_BASE=http://localhost:8000 npm run dev
```

With `VITE_DATA_SOURCE=api`, if the API is down or asleep the app keeps working from the static snapshot in `web/public/data/`, shows an "Archived data snapshot" badge, and retries the API every 60 s. The live check reads the daily sealed predictions from the public [elis-live](https://github.com/piales00/elis-live) repository first (`VITE_LIVE_FEED_URL` overrides its base URL), then the API, then the snapshot.

The interactive **Ask Elis** scientific copilot (with 60s Autopilot, floating Mission HUD, 2027 departmental outlooks, and 3D satellite relief navigation) runs when `CHAT_ENABLED=1` and `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) are set in `.env`.

## Repository structure

```
data/raw/          FIRMS CSV files (not committed)
data/processed/    Small aggregates that are committed (series.json, methodology.json, ...)
scripts/           ETL and method in Python with DuckDB
api/               FastAPI app that serves the precomputed files
web/               React + Vite + Tailwind front end (web/mock/ has sample data)
docs/methods/      Technical notes (English)
docs/report/       Technical report (HTML and PDF)
```

## Team

Log N + 1, NASA Space Apps Challenge 2026.

## AI use

AI use: the team used AI coding assistants (Anthropic Claude, OpenAI Codex) to help write code and documentation under the team's direction; all methods, data choices and results were defined, checked and validated by the team.
