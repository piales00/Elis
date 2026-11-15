<div align="center">

<img src="web/public/elis-logo.png" alt="Elis logo" width="160">

# Elis

**A harmonized MODIS–VIIRS fire record for Peru, 2000–2026, with its uncertainty stated.**

Team **Log N + 1** · NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots*

[![NASA Space Apps 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)
[![Python](https://img.shields.io/badge/Python-DuckDB%20%2B%20FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white)](./scripts)
[![React](https://img.shields.io/badge/React-Vite%20%2B%20Tailwind-2563EB?style=for-the-badge&logo=react&logoColor=white)](./web)

[![Live app](https://img.shields.io/badge/app-elis--blond.vercel.app-000000?style=flat-square&logo=vercel&logoColor=white)](https://elis-blond.vercel.app/?view=ask&region=peru&y=2012&m=9)
[![Data](https://img.shields.io/badge/data-NASA%20FIRMS-DC2626?style=flat-square)](#data-sources)
[![Record](https://img.shields.io/badge/record-2000%E2%80%932026-16A34A?style=flat-square)](#what-elis-does)

</div>

---

## The problem

Peru burns every dry season, and satellites are how we know how much. But the satellites changed over time, and the record changed with them.

MODIS (1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) detect fire differently. Raw counts jump in 2012, 2018 and 2023 as satellites join the record (VIIRS S-NPP, NOAA-20, NOAA-21). In Peru the naive sum goes from **10,375 detections in 2011 to 92,807 in 2012**: a false ×8.9 jump. The fire did not change; the instrument did.

Anyone who compares fire years across 2012, or builds a trend on the raw sum, is measuring the satellites, not the fires.

## What Elis does

Elis builds one comparable record from all five FIRMS sensors and states how uncertain it is.

**The unit** is the **fire cell-day**: a 0.1° cell (about 11 km) on a date with at least one detection. It is not a count of fires and not hectares burned.

| Component | What it does | Key result |
|---|---|---|
| **Capture–recapture harmonization** | The Chapman estimator, calibrated only on days when Aqua MODIS and S-NPP VIIRS pass less than 20 minutes apart, estimates total fire including fire neither sensor saw. Aqua-era estimates are corrected for the Aqua-vs-VIIRS gap measured on 2013–2020. | On near-simultaneous passes the sensors agree on 80 % of Aqua cell-days, against 55–58 % at 20–60 minutes. The false ×8.9 jump becomes **×1.39**. |
| **Validation** | Held-out years 2021–2024: bias-corrected Aqua-only vs VIIRS-only reconstructions. Independent check against MapBiomas burned area. | 3.8 % yearly difference for Peru (Amazon 2.3 %, Andes 7.0 %, Coast 9.0 %) against 334 % for the naive sum. Correlation with MapBiomas 0.75 (0.85–0.98 within each Landsat era). |
| **MODIS emulator** | Gradient-boosting model (AUC 0.76) that checks the record and quantifies orbit drift. | The drifting Aqua orbit sees 29 % fewer fire cell-days than an on-time Aqua in 2026. |
| **Honest uncertainty** | A three-satellite model and a simulator show the sensors are positively dependent. | The record is a **lower bound, roughly 10–15 % low**. No correction passed our tests, so none is applied. Every number carries a 90 % range. |
| **Seasonal outlook** | A forecast built on the record, labelled and kept apart from observations. | Beats climatology in a leave-one-year-out backtest. |

### Observations, estimates and forecasts

Elis never mixes these three. The app, the API and the report label each one.

| Kind | What it is | Range |
|---|---|---|
| **Observation** | Detections reported by FIRMS, as received (near-real-time data are provisional). | None |
| **Estimate** | The harmonized record: capture–recapture, corrected for the Aqua-vs-VIIRS gap. | 90 % range |
| **Forecast** | The seasonal outlook, including the 2027 departmental outlooks. | Backtested, always labelled |

## Try it

**Live app:** [elis-blond.vercel.app](https://elis-blond.vercel.app/?view=ask&region=peru&y=2012&m=9)

The interactive **Ask Elis** scientific copilot (60 s Autopilot, floating Mission HUD, 2027 departmental outlooks, 3D satellite relief navigation) answers questions about the record. It runs when `CHAT_ENABLED=1` and `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) are set in `.env`.

## Documentation

| File | What it has |
|---|---|
| [`docs/contrato-datos.md`](docs/contrato-datos.md) | **Source of truth** for paths, fields, coverage and parameters |
| [`docs/methods/README.md`](docs/methods/README.md) | Seven technical notes: harmonization, MODIS emulator, three satellites, underestimation, seasonal outlook, validation, continuity after MODIS |
| [`docs/report/firechronos-technical-report.pdf`](docs/report/firechronos-technical-report.pdf) | Technical report ([HTML source](docs/report/firechronos-technical-report.html)) |
| [`scripts/config.py`](scripts/config.py) | Pipeline parameters |

## Data sources

- **NASA FIRMS:** MODIS Terra and Aqua, VIIRS S-NPP, NOAA-20, NOAA-21
- **NASA GIBS** (satellite imagery) and **NASA POWER** (precipitation and temperature)
- **NOAA CPC ONI** and **ENFEN ICEN** (ENSO indices)
- **MapBiomas Fuego Peru** (burned area, used for validation only)
- **INEI** (department boundaries)

The raw FIRMS CSV files are not in the repository. Annual MODIS and VIIRS S-NPP files go in `data/raw/`; the 2026 NOAA-20/21, MODIS and S-NPP files go in `data/raw/2026/`. Small aggregates in `data/processed/` are committed. Never commit FIRMS source files, credentials, `.env` or `.venv`.

## Run it

### 1. Requirements

- Python 3 and Node.js
- FIRMS access credentials (only to download source data)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The commands below use the Linux/macOS path; on Windows use `.\.venv\Scripts\python.exe`.

### 2. Download the data

```bash
.venv/bin/python scripts/download_peru_sources.py
```

### 3. Process the data

Run in this order. Parameters live in `scripts/config.py`.

```bash
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

`export_static.py` runs last. It copies a snapshot of the published files to `web/public/data/` (about 11 MB, one compact map file per month), so regenerate it whenever `data/processed/` changes.

### 4. Run the API

The API serves the precomputed files in `data/processed/`; it does not run the pipeline per request.

```bash
.venv/bin/python -m uvicorn api.main:app --reload
```

Interactive docs: http://127.0.0.1:8000/docs. Endpoints: `GET /regions`, `GET /series`, `GET /map`, `GET /methodology`.

### 5. Run the web app

```bash
cd web
npm install
npm run dev
```

| Variable | Default | Meaning |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` | `mock` uses the sample data in `web/mock/`; `api` uses the API |
| `VITE_API_BASE` | `http://localhost:8000` | API address |
| `VITE_LIVE_FEED_URL` | public elis-live repo | Overrides the base URL of the daily sealed predictions |

```bash
VITE_DATA_SOURCE=api VITE_API_BASE=http://localhost:8000 npm run dev
```

With `VITE_DATA_SOURCE=api`, the live check reads the daily sealed predictions from the public [elis-live](https://github.com/piales00/elis-live) repository first, then the API, then the static snapshot. If the API does not answer within 7 s, the app keeps working from `web/public/data/`, shows an "Archived data snapshot" badge, and retries the API every 60 s.

## Repository structure

```
data/raw/          FIRMS CSV files (not committed)
data/processed/    Small aggregates that are committed (series.json, methodology.json, ...)
scripts/           ETL and method in Python with DuckDB
api/               FastAPI app that serves the precomputed files
web/               React + Vite + Tailwind front end (web/mock/ has sample data)
docs/methods/      Technical notes
docs/report/       Technical report (HTML and PDF)
```

## Known limitations

We state them on purpose: a record that hides its limits is not more solid, only less honest.

- **The record is a lower bound.** The sensors are positively dependent, so fire missed by both (cloud, smoke, small or short fires) stays missed. We estimate it is roughly 10–15 % low. No correction passed our tests, so none is applied.
- **The unit is not fires or hectares.** Fire cell-days measure where and when fire was detected, in 0.1° cells.
- **Estimates carry a 90 % range.** Read the range, not only the central value.
- **NRT data are provisional** until FIRMS replaces them with standard data.
- **The Aqua orbit is drifting**, so it sees 29 % fewer fire cell-days than an on-time Aqua in 2026. Elis corrects for this, but the correction has its own uncertainty.
- **Forecasts are not observations.** They beat climatology in backtests, which does not guarantee any single season.
- **Regional accuracy varies.** The held-out gap is 2.3 % in the Amazon, 7.0 % in the Andes and 9.0 % on the Coast.

## Team

**Log N + 1**, NASA Space Apps Challenge 2026.

| Member | Role | Area | What they built |
|---|---|---|---|
| **Piero** | ![CEO](https://img.shields.io/badge/CEO%20%C2%B7%20CSO-1D4ED8?style=flat-square) | Data science | Model training, methodology, harmonization and validation of the record |
| **Jossep** | ![CTO](https://img.shields.io/badge/CTO-15803D?style=flat-square) | Data engineering | FIRMS download and processing, FastAPI endpoints, published files in `data/processed/` |
| **Samuel** | ![CDO](https://img.shields.io/badge/CDO-7E22CE?style=flat-square) | Design and frontend | Design of the whole project: interface, maps, charts and user experience |
| **Valentino** | ![CAIO](https://img.shields.io/badge/CAIO-C2410C?style=flat-square) | Conversational AI | Ask Elis chatbot: scientific copilot that answers questions about the record |

<sub>CEO: Chief Executive Officer · CSO: Chief Science Officer · CTO: Chief Technology Officer · CDO: Chief Design Officer · CAIO: Chief AI Officer</sub>

## AI use

The team used AI coding assistants (Anthropic Claude, OpenAI Codex) to help write code and documentation under the team's direction. All methods, data choices and results were defined, checked and validated by the team.

<div align="center">

**NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots**

</div>
