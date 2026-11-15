# 08 · Elis: Data assistant and guided demonstration

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose and scope

Ask Elis helps readers explore the processed harmonized record through questions, charts and a guided presentation. Figures are verified against the processed data through numerical checks on tool results. This does not guarantee correct interpretation or the absence of unsupported prose. The prototype has not been evaluated for emergency deployment, site-level fire risk or national emissions accounting.

The unit is **fire cell-days**: a 0.1° cell (approximately 11 km) with at least one detection on a date. Reconstructed activity is presented with 90% ranges; forecasts are separate from observations. The map does not delineate individual fires or measure burned area.

## Architecture and numerical verification

`POST /chat` streams Server-Sent Events. `api/chat.py` selects a provider using `CHAT_PROVIDER` and available credentials. The deployment template selects Google Gemini; the default Gemini model is `gemini-3.1-flash-lite`. Anthropic is another configurable provider, not a demonstrated automatic hot-standby path from Gemini.

The model calls tools in `api/chat_tools.py`, including series retrieval, period comparison, year ranking, chart construction and methodology retrieval. These read precomputed data rather than recomputing the scientific method. The stream includes text, tool, chart, notice and completion events.

`api/chat_guard.py::verify_figures` extracts numerical tokens and compares them with tool-result values within its matching rules. It exempts dates, years, satellite identifiers and a set of allowed constants. Unsupported values can generate a notice; the completion payload reports the verification result. A successful numerical check cannot establish that a number has been assigned to the right region, period or causal claim, nor that all relevant uncertainty has been explained.

## Usage and budget controls

The implemented per-IP limits in `api/chat_guard.py` are **5 questions per rolling 10 minutes** and **20 per rolling 24 hours**. `render.yaml` configures `CHAT_DAILY_BUDGET_USD="0.5"`, a **USD 0.50 daily budget threshold**. The Python fallback remains USD 5.00 if that environment setting is absent or invalid; the deployment value must therefore be retained.

The budget guard checks recorded spend before a request. Accounting is in process memory, and a request already in progress may exceed the threshold; this is not a durable billing hard cap across workers or restarts. The deployment template also leaves `CHAT_ENABLED=0`; actual availability depends on runtime configuration and credentials.

## Guided demonstration

`web/src/components/chat/ElisSpotlight.jsx` sets `AUTOPILOT_SECONDS = 40` and divides this duration among four missions (10 seconds each). The tour completes after the final mission, subject to browser scheduling. The timer calls `onSelectMission(..., true)` and `web/src/App.jsx` preserves the autoplay flag. Manual mission selection pauses autoplay. The step indicator, formatted text, map navigation and chart shortcuts support a presentation; their labels are not evidence of operational effectiveness.

Appropriate demonstration questions are:

| Topic | Supported interpretation |
|---|---|
| Sensor transition | Why adding available sensor detections changes the measurement scale |
| Regional history | How reconstructed activity varies among macroregions, with ranges |
| Sensor disagreement | How sampling and sensitivity may affect differences; no confirmed classification of individual burns |
| Seasonal outlook | Where backtest skill supports a model and where climatology is used |

## Evidence and corrections

`series.json` gives 10,375 raw detections in 2011 and 92,807 in 2012, a factor of 8.95. The **333.90%** statistic in `methodology.json → validation` is instead the mean annual naive-detection discrepancy relative to estimated fire cell-days in **2021–2024**. It is a cross-unit diagnostic, not the percentage increase in 2012. The national **3.77%** method discrepancy compares Aqua-only and VIIRS-only reconstructions on held-out years; it does not measure absolute truth or prove complete removal of bias.

`forecast.json → raw_vs_corrected` records a national seasonal median observed/predicted ratio of **4.49** for the naive series and **1.02** for the harmonized series (training 2003–2011, testing 2013–2025). The naive model **underpredicts** after the sensor transition. The earlier claim of inflated future risk is unsupported. The 2026 evaluation is a retrospective out-of-sample test, not a near-perfect hit-rate claim or proof of prospective issuance. See [05](05-seasonal-forecast.md) and the [article](../report/firechronos-technical-report.html) for forecast ranges.

The raw and harmonized fitted slopes in `methodology.json` are descriptive measurement-series results. They do not establish effects on Peru's greenhouse-gas inventories. Neither the JSON nor these tests demonstrates benefits for aircraft deployment, firebreak placement, law enforcement or site-specific protection.

## MapBiomas validation actually used

The broad source archive and the analysis window are different. `scripts/mapbiomas.py` retains annual input years **2000–2025** using `FIRST_YEAR` and `HISTORY_YEARS`; `scripts/validate.py` compares shared years **2001–2025**, excluding the incomplete first year. MapBiomas is used for external consistency, not model calibration. VIIRS does not cover the entire validation window.

`methodology.json → validation` gives Peru's annual Pearson correlation **r = 0.748**. The comparator is burned area, a different quantity from fire cell-days. Its own sensor changes and use of FIRMS filtering in the Andes limit independence. The within-era correlation quoted in note 06 is not stored in processed JSON and is not repeated here as a newly verified result. No claim of validation against all 36 years of the wider archive is made.

## Reproduce

```bash
python -m pytest -q
python scripts/check_report_figures.py
```

A passing test suite establishes only the behavior covered by those tests. It is not a scientific accuracy score, a deployment-status assertion or a certification of generated prose. The HTML article records numerical provenance; the data contract remains unchanged.
