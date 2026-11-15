# 08 · Elis: Data Intelligence Assistant & 40s Mission Control HUD

Elis · Team Log N + 1 · NASA Space Apps 2026

## Purpose

Deliver an interactive, zero-hallucination conversational interface and an autonomous 40-second executive heads-up display (HUD) that translates the harmonized fire record into immediate, actionable operational decisions for Peruvian public agencies (MINAM, INDECI, SERNANP, FEMA).

## The Decision-Maker Problem

When public officials or automated AI systems ingest raw FIRMS detections without harmonization:
1. **False Trends in Carbon Accounting:** The uncorrected +333.9% jump in 2012 creates a synthetic +16.8%/year fire surge, corrupting Peru's national greenhouse gas inventories submitted under the Paris Agreement.
2. **Forecast Inflation:** Machine learning models trained on raw detections over-predict future fire risk by **6.6×**, prompting misallocated aerial firefighting resources.
3. **Cognitive Overload:** In high-stakes command centers (COEN / INDECI), operators cannot spend minutes interpreting complex multi-sensor satellite tables. They require verified executive memos, 3D spatial confirmation, and clear decision pathways in seconds.

## System Architecture

Elis connects frontend clients to the harmonized backend via Server-Sent Events (`POST /chat`) using a dual-engine tool-augmented generation (RAG) architecture:

```
[Operator / Web HUD]
       │  POST /chat (SSE stream)
       ▼
[Rate Limiting & Safety Guard (10 req/min per IP)]
       │
       ▼
[Gemini 3.1 Flash Lite] ──(Intent Recognition)──► [Strict Function Calling]
       │                                                      │
       │                                            Queries local data in-memory:
       │                                            • get_series (series.json)
       │                                            • compare_periods
       │                                            • rank_years
       │                                            • show_chart
       │                                            • get_methodology
       │                                                      │
       ◄──────── [Deterministic Numerical Payload] ───────────┘
       │
       ▼
[Rigor Guard: verify_figures]
       │ Asserts every numeric token matches tool outputs within tolerance
       ▼
[SSE Streaming to Frontend]
  • event: tool    (Audit trail of tool executions)
  • event: chart   (Interactive SVG visualization with 90% CI)
  • event: text    (Formatted executive memo)
  • event: done    (Verification flag: verified=true)
```

- **Inference Engines:** Google Gemini API (`gemini-3.1-flash-lite`, `google-genai` SDK) primary with zero-cost thinking budget (`thinking_budget=0`), backed by Anthropic Claude (`claude-opus-5-5` / `claude-3-5-sonnet`) as a hot-standby fallback.
- **Deterministic Number Guard:** `verify_figures` inspects generated text and matches all quantities against tool results. Any unsubstantiated number triggers a structured notice, eliminating hallucination.

## 40-Second Autonomous HUD (Mission Control)

To convey maximum technical and operational impact to NASA judges and emergency commanders within strict time constraints, Elis provides a calibrated **40-Second Autopilot Tour** ($4 \text{ missions} \times 10 \text{ seconds} = 40\,\text{s}$ total):

### Continuity Timer Engine
In `web/src/App.jsx` and `web/src/components/chat/ElisSpotlight.jsx`, the autopilot cycle executes seamlessly:
- The timer advances each mission after `AUTOPILOT_MS = 10000` via `advanceRef.current`.
- The callback passes `fromAutopilot = true` to `applyElisMission`, ensuring `autopilot: true` is preserved across transitions ($1 \to 2 \to 3 \to 4 \to 1$).
- Manual clicks on mission buttons or decision chips gracefully pause the timer (`autopilot: false`), returning full interactive agency to the user.

### UI/UX Components
1. **Step Indicator:** Header counter `[ 1 / 4 ]`, `[ 2 / 4 ]`, `[ 3 / 4 ]`, `[ 4 / 4 ]` providing predictable progression.
2. **Operator Query Badge:** Prominently highlights the authentic user inquiry addressed by Elis.
3. **Executive Typography:** Formatted via `FormattedMessage.jsx`, stripping raw asterisks (`**`) and standardizing key findings, alert pills, and quantitative metrics.
4. **Interactive Decision Chips:** Contextual operational actions (`[📊 Compare Raw vs Chapman]`, `[🛰️ 3D Terrain Relief]`, `[🛡️ INDECI T-60d Action Plan]`, `[🔮 2027 Season Outlook]`, `[💬 Ask Elis]`) that instantly sync the main map view, trigger camera flights, or open relevant analytical panels.

## Operational Mission Matrix

| Mission | Operator Query | Agency & Mandate | Verified Finding | Operational Decision |
|---|---|---|---|---|
| **01. Sensor Jump** | *"Why did fire detections explode 9× in 2012?"* | **MINAM** · Paris Agreement NDC | +333.9% raw jump resolved; Chapman residual error is 3.77%. | Replaces +16.8%/yr artificial trend with +0.18%/yr real baseline in national emissions registry. |
| **02. Amazon Regime** | *"Are Amazon fires continuous fronts or small burns?"* | **SERNANP & FEMA** · Forest Crimes | VIIRS captures 84.9% of active cell-days; 2005 and 2010 megadroughts remain historical records. | Directs airborne interdiction to persistent canopy corridors in Madre de Dios and Ucayali. |
| **03. Andes Regimes** | *"What is the fire regime in Machu Picchu?"* | **SERNANP Machu Picchu & GORE Cusco** | Fragmented pasture burns have only 7% MODIS recall. Cusco projected at High Alert for 2027 (1,788 cell-days). | Establishes community controlled burn calendars and perimeter firebreaks in Urubamba. |
| **04. INDECI 2027** | *"Where should INDECI pre-position aerial resources?"* | **INDECI & COEN** · National Defense | Unaligned AI over-predicts by 6.6×. Chapman forecast achieved 99.9% 2026 backtest hit. Sierra Very High in 2027. | Guides 60-day pre-positioning (T-60d) of aerial tankers and ground brigades in 25 departments. |

## Verification and Test Coverage

- **Backend Test Suite:** 69 passing unit and integration tests across `test_api.py`, `test_chat_api.py`, `test_chat_tools.py`, and `test_chat_guard.py` (`69 passed in 5.69s`).
- **Frontend Production Build:** Compiles cleanly via Vite (`✓ built in 2.27s`, 97 modules).
- **External Consistency:** Anchored to the 36-year MapBiomas Collection 2 dataset (1990–2025) with $r = 0.75$ global agreement and $r = 0.98$ in the Landsat 8 era (2013–2020).

## Reproduce

```bash
# Backend test suite
.venv/bin/pytest tests/test_api.py tests/test_chat_api.py tests/test_chat_tools.py tests/test_chat_guard.py -q

# Production web build
cd web && npm run build
```
