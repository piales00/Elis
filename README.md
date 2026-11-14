# FireChronos Perú

Calendario histórico comparable del fuego en Perú (2000–2025), construido a partir de las detecciones de MODIS y VIIRS de NASA FIRMS.

Proyecto del equipo Log N + 1 para NASA Space Apps 2026, reto *Harmonization of MODIS and VIIRS Hot Spots*.

## Idea

Los dos satélites ven el fuego de forma distinta: VIIRS, desde 2012, detecta fuegos mucho más pequeños que MODIS. Si se juntan sin corregir, aparece un salto falso. Estimamos el fuego total con **captura y recaptura**, el método que usan los biólogos para contar peces, y lo verificamos con un **equivalente MODIS**.

Detalle completo en [PROYECTO.md](PROYECTO.md). Antecedentes y fuentes en [docs/benchmarking.md](docs/benchmarking.md).

## Datos

Los CSV anuales de FIRMS para Perú se guardan en `data/raw/`, que no se sube al repositorio. Descarga los límites referenciales del país y los archivos públicos de MODIS y VIIRS S-NPP:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/download_peru_sources.py
.\.venv\Scripts\python.exe scripts/build_peru_data.py
```

El generador publica `data/processed/regions.geojson` con Perú, las tres macrorregiones y las unidades departamentales, además de `map.parquet` para todo el país. El alcance actual llega hasta 2025. Si llegan a tiempo los CSV de NOAA-20/21 de 2026 solicitados a FIRMS, se podrán guardar en `data/raw/` como `viirs-noaa20_2026_Peru.csv` y `viirs-noaa21_2026_Peru.csv`, ampliar `MAX_YEAR` a 2026 en `scripts/config.py` y volver a ejecutar el generador. `estimated` se mantiene en `null` hasta recibir la estimación de T2.

## Exploración

```bash
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/explore.py data/raw
```

`scripts/recaptura.py` es un borrador de la estimación por captura y recaptura; todavía no se ha ejecutado ni validado.

## API

Instala las dependencias y ejecuta la API localmente:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn api.main:app --reload
```

La documentación interactiva está en `http://127.0.0.1:8000/docs`. La API sirve los archivos de `data/processed/`; `/regions`, `/series`, `/map` y `/methodology` indicarán que los datos aún no están disponibles mientras falten esos archivos.

## Cómo trabajamos con Git

Las reglas de commits, ramas y Pull Requests están en [GIT.md](GIT.md).

## Skills del proyecto

El repositorio incluye skills para Claude Code en `.claude/skills/`, como copias reales: se cargan solas al abrir el proyecto, sin instalar nada. `skills-lock.json` registra el origen de las que se instalaron con el CLI `skills`.

| Skill | Para qué sirve en este proyecto | Origen |
|---|---|---|
| `fastapi` | Construir la API que sirve el calendario del fuego | Instalada: `fastapi/fastapi` |
| `query` | Consultar los CSV de FIRMS con DuckDB | Instalada: `duckdb/duckdb-skills` |
| `duckdb-docs` | Consultar la documentación de DuckDB | Instalada: `duckdb/duckdb-skills` |
| `maplibre-cartography` | Diseñar el mapa de detecciones con MapLibre | Instalada: `maplibre/maplibre-agent-skills` |
| `maplibre-pmtiles-patterns` | Servir las teselas del mapa con PMTiles | Instalada: `maplibre/maplibre-agent-skills` |
| `mapbox-geospatial-operations` | Operaciones geoespaciales (distancias, áreas, uniones espaciales) | Instalada: `mapbox/mapbox-agent-skills` |
| `data-visualization` | Gráficos en Python (matplotlib, seaborn, plotly) para el análisis | Instalada: `anthropics/knowledge-work-plugins` |
| `video-report` | Skill interna de Remotion para reportar videos; uso limitado aquí | Instalada: `remotion-dev/remotion` |
| `hackathon-judging` | Entender la rúbrica y los criterios del jurado | Instalada: `samber/dev-event-organizer-skills` |
| `impeccable` | Revisar y pulir la interfaz web | Copiada de la configuración local |
| `design-taste-frontend` | Dirección de arte para la página pública | Copiada de la configuración local |
| `animate` | Animaciones de la interfaz (reloj del fuego, transiciones) | Copiada de la configuración local |
| `emil-design-eng` | Detalles de pulido de UI según Emil Kowalski | Copiada de la configuración local |
| `video-use` | Editar el video del pitch | Copiada de la configuración local (sin `.venv`) |
| `pptx` | Crear o editar la presentación en PowerPoint | Copiada de la configuración local (Anthropic) |
| `code-review` | Revisión de código antes de mezclar un PR | Copiada de la configuración local |

## Equipo y datos

- [Reparto del equipo y puntos de control](docs/equipo.md)
- [Contrato de datos](docs/contrato-datos.md): parámetros del método, archivos y API
