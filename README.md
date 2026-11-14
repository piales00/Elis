# FireChronos Perú

Calendario histórico comparable del fuego en Perú (2000–2026), construido a partir de las detecciones de MODIS y VIIRS de NASA FIRMS.

Proyecto del equipo Log N + 1 para NASA Space Apps 2026, reto *Harmonization of MODIS and VIIRS Hot Spots*.

## Idea

Los dos satélites ven el fuego de forma distinta: VIIRS, desde 2012, detecta fuegos mucho más pequeños que MODIS. Si se juntan sin corregir, aparece un salto falso. Estimamos el fuego total con **captura y recaptura**, el método que usan los biólogos para contar peces, y lo verificamos con un **equivalente MODIS**.

Detalle completo en [PROYECTO.md](PROYECTO.md). Antecedentes y fuentes en [docs/benchmarking.md](docs/benchmarking.md).

## Datos

Los CSV anuales de FIRMS para Perú se guardan en `data/raw/`, que no se sube al repositorio. Para descargarlos:

```bash
mkdir -p data/raw && cd data/raw
for y in $(seq 2000 2025); do curl -sO https://firms.modaps.eosdis.nasa.gov/data/country/modis/$y/modis_${y}_Peru.csv; done
for y in $(seq 2012 2025); do curl -sO https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/$y/viirs-snpp_${y}_Peru.csv; done
```

## Exploración

```bash
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/explore.py data/raw
```

`scripts/recaptura.py` es un borrador de la estimación por captura y recaptura; todavía no se ha ejecutado ni validado.

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
