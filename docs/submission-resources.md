# NASA Space Apps 2026 — Project Submission Resources

**Project:** FireChronos Perú (Team Log N + 1)  
**Challenge:** Harmonization of MODIS and VIIRS Hot Spots  

---

## 1. Space Agency Partner & Other Data
*(Copy and paste each pair directly into the Space Apps submission portal)*

| # | Link Text | Link Url |
|---|---|---|
| 1 | `NOAA JPSS — VIIRS 375m Active Fire Hotspots (NOAA-20 & NOAA-21)` | `https://www.star.nesdis.noaa.gov/jpss/viirs.php` |
| 2 | `NOAA CPC — Oceanic Niño Index (ONI) SST Anomalies` | `https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/oni.shtml` |
| 3 | `MapBiomas Perú — 36 Years of Burned Area Maps (1990–2025)` | `https://peru.mapbiomas.org/` |
| 4 | `INEI Perú — Geospatial Departmental & National Administrative Boundaries` | `https://idep.geoidep.gob.pe/` |
| 5 | `MapLibre GL JS — Open Source WebGL/WebGPU 3D Map Engine` | `https://maplibre.org/` |
| 6 | `CARTO & OpenStreetMap — Geographic Basemap Tiles` | `https://carto.com/basemaps/` |
| 7 | `DuckDB — High-Performance In-Process Analytical SQL Engine` | `https://duckdb.org/` |
| 8 | `FastAPI — Python Asynchronous Web & SSE Streaming Framework` | `https://fastapi.tiangolo.com/` |
| 9 | `Google Gemini API — Grounded Conversational AI for Data Analytics` | `https://ai.google.dev/` |
| 10 | `Vite & Tailwind CSS — Frontend Reactive Build Tooling` | `https://vite.dev/` |

---

### Descriptions & Technical Justification

1. **NOAA JPSS (Joint Polar Satellite System)**
   - *Description:* Active fire hotspot detections from VIIRS 375 m aboard NOAA-20 (JPSS-1) and NOAA-21 (JPSS-2).
   - *Project Role:* Multi-satellite intercomparison, post-MODIS continuity testing, and cross-platform validation.
   - *URL:* `https://www.star.nesdis.noaa.gov/jpss/viirs.php`

2. **NOAA CPC (Oceanic Niño Index - ONI)**
   - *Description:* Historical El Niño / La Niña sea-surface temperature anomalies in the Niño 3.4 region.
   - *Project Role:* Climate covariate used in the seasonal fire forecasting model for 2027 regional fire outlooks.
   - *URL:* `https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/oni.shtml`

3. **MapBiomas Perú (Collection 1.0)**
   - *Description:* 36-year independent Landsat-derived (30 m resolution) annual burned area dataset across Peru (1990–2025).
   - *Project Role:* Independent ground-truth validation used to corroborate the Chapman capture-recapture time series.
   - *URL:* `https://peru.mapbiomas.org/`

4. **INEI Perú (Instituto Nacional de Estadística e Informática)**
   - *Description:* Official geospatial cartographic vector boundaries for Peru's 25 departments and 3 macro-regions.
   - *Project Role:* Vector boundary overlays and regional aggregation geometries (`regions.geojson`).
   - *URL:* `https://idep.geoidep.gob.pe/`

5. **MapLibre GL JS**
   - *Description:* Open-source WebGL/WebGPU interactive mapping library.
   - *Project Role:* Client-side rendering of choropleths, active hotspot clusters, and digital elevation model (DEM) 3D flyovers.
   - *URL:* `https://maplibre.org/`

6. **CARTO & OpenStreetMap**
   - *Description:* Open cartographic base tiles (Dark Matter / Positron) under ODbL.
   - *Project Role:* High-contrast basemap styling optimized for satellite fire radiance visualization.
   - *URL:* `https://carto.com/basemaps/`

7. **DuckDB**
   - *Description:* Fast analytical in-process SQL database engine.
   - *Project Role:* Core ETL pipeline executing spatial binning into 0.1° cells and Chapman mark-recapture estimations in seconds.
   - *URL:* `https://duckdb.org/`

8. **FastAPI**
   - *Description:* Modern, high-performance asynchronous Python web framework.
   - *Project Role:* Serving precomputed harmonized time series, regional summaries, and SSE real-time chat streaming.
   - *URL:* `https://fastapi.tiangolo.com/`

9. **Google Gemini API**
   - *Description:* Multimodal large language model foundation (`gemini-2.5-flash`).
   - *Project Role:* Grounded conversational data agent (Elis) operating with strict tool calling over precomputed datasets.
   - *URL:* `https://ai.google.dev/`

10. **Vite & Tailwind CSS**
    - *Description:* High-speed frontend build tool and utility-first CSS design system.
    - *Project Role:* User interface architecture, high-density HUD overlays, and responsive cross-browser presentation.
    - *URL:* `https://vite.dev/`

---

## 2. NASA Space Science Data
*(In case you also need the specific NASA data section)*

| # | Link Text | Link Url |
|---|---|---|
| 1 | `NASA FIRMS — MODIS (Terra & Aqua) Active Fire Product (MCD14DL)` | `https://firms.modaps.eosdis.nasa.gov/` |
| 2 | `NASA FIRMS — VIIRS 375m (Suomi-NPP) Active Fire Product (VNP14IMGTDL)` | `https://firms.modaps.eosdis.nasa.gov/` |
| 3 | `NASA POWER API — Monthly Agroclimatology & Precipitation Data` | `https://power.larc.nasa.gov/` |
| 4 | `NASA / USGS SRTM — Shuttle Radar Topography Mission 30m Global DEM` | `https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1-arc` |
