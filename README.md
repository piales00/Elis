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
