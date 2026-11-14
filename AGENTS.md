# AGENTS.md — Contexto para agentes (Claude Code y Codex)

Lee este archivo antes de cualquier tarea en este repositorio.

## Proyecto

**FireChronos Perú**, del equipo Log N + 1, para NASA Space Apps 2026, reto *Harmonization of MODIS and VIIRS Hot Spots*. Hay 36 horas de trabajo y tres personas.

**Problema:** MODIS (desde 2000, píxel de 1 km) y VIIRS (desde 2012, píxel de 375 m) detectan el fuego de forma distinta. Si se suman sin corregir, el fuego en Perú parece multiplicarse por 9 en 2012.

**Solución:** una historia comparable del fuego en Perú entre 2000 y 2026.
1. **Captura y recaptura** (estimador de Chapman), por región y mes, para estimar el fuego total. Es la cifra principal y siempre va con un rango.
2. **Equivalente MODIS**, para comprobar el resultado y como plan B.
3. **El desacuerdo como sensor**: un mapa del tamaño típico del fuego. Es experimental.
4. **Pronóstico de temporada**: solo si alcanza el tiempo.

## Documentos que mandan

| Archivo | Contenido |
|---|---|
| `PROYECTO.md` | Definición completa, evidencia y respuestas para el jurado |
| `docs/contrato-datos.md` | **Parámetros, archivos y API. No cambies columnas ni rutas sin actualizarlo** |
| `docs/equipo.md` | Reparto de tareas, ramas y puntos de control |
| `docs/benchmarking.md` | Antecedentes científicos y riesgos |
| `GIT.md` | Reglas de commits y ramas |

## Estructura

```
data/raw/          CSV de FIRMS (no se suben; ver README)
data/processed/    Agregados pequeños que sí se suben (series.json, etc.)
scripts/           ETL y método en Python con DuckDB
api/               FastAPI
web/               Frontend (web/mock/ con datos de prueba)
docs/              Documentación
.claude/skills/    Skills del proyecto (fastapi, query, maplibre-cartography, emil-design-eng, ...)
```

## Stack

- **Datos y método:** Python 3 y DuckDB. Usar el entorno `.venv` (`python3 -m venv .venv && .venv/bin/pip install duckdb`).
- **API:** FastAPI que sirve archivos ya calculados. No calcula nada pesado al recibir una petición.
- **Web:** mapa con MapLibre y gráficos. Toda la interfaz en **inglés**.

## Reglas

1. **Respeta el contrato de datos.** Si necesitas cambiarlo, edita primero `docs/contrato-datos.md` y avisa en el resumen.
2. **Parámetros en un solo lugar:** `scripts/config.py`. No escribas umbrales a mano en otros archivos.
3. **Honestidad científica:** la unidad es *celdas-día con fuego*, no "incendios" ni "hectáreas". Toda estimación lleva su rango. Los pronósticos se separan de lo observado. Nunca digas "primeros del mundo".
4. **Git:** Conventional Commits en español (`feat(api): ...`, `fix(web): ...`), una rama por tarea y Pull Requests pequeños. Detalle en `GIT.md`. No subas `data/raw/`, `.venv/` ni `.env`.
5. **Sin comentarios en el código** salvo que sean imprescindibles.
6. **Prioridad:** a la hora 20 todo debe estar conectado con datos reales, aunque se vea feo. Los extras van después.
7. **Idioma — el resultado final va en inglés, porque lo evalúa la NASA:**
   - **En inglés:** todos los textos de la app (interfaz, etiquetas, leyendas, tooltips, pantalla de metodología), la API (rutas, campos, mensajes de error), los nombres en el código, el `README.md`, el pitch, las diapositivas, el video y el formulario de envío de Space Apps.
   - **En español:** solo los documentos internos del equipo (`PROYECTO.md`, `docs/equipo.md`, `docs/contrato-datos.md`, `docs/benchmarking.md`, `GIT.md`) y los mensajes de commit.
   - Antes del envío, `README.md` se reescribe completo en inglés.
