# Encargo experimental — Modelo bayesiano de todos los satélites

Este documento es para quien se suma a ayudar en T2 (metodología) y para su asistente de IA. Léelo completo junto con `AGENTS.md`, `docs/contrato-datos.md` y `docs/plan-t2.md`.

**Rama:** `feat/metodo-experimental`, creada desde `feat/metodo`.
**Límite de tiempo:** 6 horas. Si a esa hora el modelo no converge, se entrega lo que haya con sus diagnósticos y se documenta por qué.
**Qué pasa si no sale:** nada. La cifra principal del proyecto sale de `scripts/capture_recapture.py`. Este modelo es un análisis de robustez: si coincide con la cifra principal, la refuerza ante el jurado.

## El problema en una página

MODIS y VIIRS son dos **instrumentos**, y cada uno vuela en varios satélites:

| Instrumento | Satélite | Datos en Perú | Hora de paso (día) |
|---|---|---|---|
| MODIS | Terra | 2000-11 a 2025 | 10:30, se adelanta desde 2022 |
| MODIS | Aqua | 2002-07 a 2025 | 13:30, se atrasa desde 2023 (14:51 en 2025) |
| VIIRS | S-NPP | 2012-01 a 2025 | 13:30, estable |
| VIIRS | NOAA-20 | 2018 a 2025 | 13:30, 50 minutos después de S-NPP |

Cada satélite ve solo una parte del fuego. Queremos el fuego total por región y mes entre 2000 y 2025, en **celdas-día**: una celda de 0,1° con al menos una detección en una fecha.

Hoy lo estimamos por pasos, con captura y recaptura (estimador de Chapman) entre Aqua y S-NPP. Encontramos tres límites:

1. **La hora de paso importa.** Cuando Aqua y S-NPP pasan con menos de 20 minutos de diferencia, el 79 % de lo que ve Aqua también lo ve S-NPP. Con 20 a 60 minutos, baja al 57 %. El fuego cambia entre pasadas y Chapman lo cuenta como fuego que nadie vio.
2. **La deriva de Aqua** (desde 2023) y la hora de Terra rompen la comparación directa.
3. **Los satélites no son independientes:** los fuegos grandes los ven todos. Chapman subestima; en una simulación, un 29 %.

El modelo bayesiano plantea todo junto en vez de por pasos, y debería manejar los tres límites sin reglas especiales.

## Preparación

```bash
git switch feat/metodo && git pull
git switch -c feat/metodo-experimental
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/cells.py
```

Los CSV de FIRMS van en `data/raw/` (ver `README.md`; no se suben al repo). Las librerías extra (PyMC o NumPyro) se anotan en un archivo nuevo, `requirements-experimental.txt`.

## Datos de entrada

`data/interim/cells.parquet`, una fila por sensor y celda-día:

| Columna | Qué es |
|---|---|
| `sensor` | `aqua`, `terra` o `snpp` |
| `cell_y`, `cell_x`, `date`, `year`, `month` | Clave de la celda-día |
| `region` | `amazonia`, `sierra` o `costa` (provisionales) |
| `n_points`, `frp_sum`, `frp_max`, `bright_max`, `scan_mean`, `track_mean` | Tamaño, potencia y geometría de la detección |
| `has_day`, `has_night` | Si hubo detección de día o de noche |
| `day_lst_min`, `night_lst_min` | Hora solar local de la detección, en minutos |

`data/interim/overpass.parquet`: hora de paso por sensor, fecha y región.

Parámetros en `scripts/config.py`. Los más importantes: `CALIBRATION_YEARS` (2013–2020), `TEST_YEARS` (2021–2024), `OUTAGES` y `DEGRADED` (días sin datos de un satélite, que **no** son días sin fuego), `CI_LEVEL` (0,90) y `SEED`.

Para comparar: `data/interim/estimates.parquet`, que genera `scripts/capture_recapture.py`.

## Tarea 1 (opcional, pero mejora mucho el modelo): NOAA-20

Es el tercer satélite con datos independientes en la misma hora, y entra en el reto porque lleva VIIRS. FIRMS no lo publica en los archivos anuales por país, así que hay dos caminos:

- **Archive Download** (https://firms.modaps.eosdis.nasa.gov/download/): pedir *VIIRS NOAA-20 375 m*, país Perú, 2018-01-01 a 2025-12-31, formato CSV. El enlace llega por correo.
- **API de FIRMS** con una `MAP_KEY` gratuita, fuente `VIIRS_NOAA20_SP`. La clave va en `.env`, nunca en el código ni en un commit.

Los archivos se guardan como `data/raw/viirs-noaa20_{año}_Peru.csv`, con las mismas columnas que S-NPP. Se agrega el sensor `noaa20` a una **copia** del flujo de celdas (`scripts/experimental/cells_noaa20.py`), sin tocar `scripts/cells.py`.

## Tarea 2: el modelo

### Estructura mínima

- **Unidad:** región × año × mes. Opcional: dividir cada mes en tramos según la diferencia de hora entre pasadas, para aprovechar esa variación.
- **Fuego real (no observado):** `N[región, mes]`, positivo. Se le da una estacionalidad por región y una variación suave entre años.
- **Historias de captura:** para cada unidad se cuentan las celdas-día según qué satélites las vieron. Con Aqua y S-NPP son tres historias observadas (solo Aqua, solo S-NPP, ambos) y una no observada (ninguno). Con NOAA-20 son siete observadas.
- **Verosimilitud:** cada conteo sigue una Poisson con media `N × probabilidad de esa historia`. Es la forma estándar de escribir captura y recaptura cuando N es desconocido.
- **Probabilidad de detección por satélite:** depende de la región y del mes del año, con una estructura jerárquica para que los estratos con pocos datos tomen información de los demás.
- **Efecto de la hora:** la probabilidad de que dos satélites coincidan baja con la diferencia de hora entre sus pasadas. Esa curva se estima; es la persistencia del fuego.
- **Dependencia entre satélites:** un término de interacción. Con dos listas no se puede estimar y se fija en cero (modelo base). Con NOAA-20 sí se puede estimar, y ese es el resultado más valioso.
- **Años sin VIIRS (2000–2011):** solo hay conteos de MODIS. El fuego se infiere con las probabilidades aprendidas en los años con VIIRS, y por eso el rango debe ensancharse hacia atrás.
- **Días en `OUTAGES` y `DEGRADED`:** se excluyen del conteo de ese satélite. Nunca se tratan como cero.

Se puede simplificar o cambiar la estructura si hay una razón. Lo que no se puede: usar los años de prueba para ajustar decisiones del modelo, ni ocultar un diagnóstico malo.

### Orden sugerido

1. Modelo base con Aqua y S-NPP, solo 2013–2020, una región. Comprobar que recupera algo cercano a Chapman con pasadas simultáneas.
2. Extender a las tres regiones y a todos los años.
3. Agregar el efecto de la hora y Terra.
4. Agregar NOAA-20 y el término de dependencia.

## Entregables

Todo dentro de `scripts/experimental/` y `data/interim/`:

| Archivo | Contenido |
|---|---|
| `scripts/experimental/bayes_model.py` | El modelo. Se ejecuta sin argumentos desde la raíz del repo |
| `data/interim/bayes_estimates.parquet` | `region, year, month, bayes_estimated, bayes_low, bayes_high` (intervalo al 90 %), más la fila `peru` |
| `data/interim/bayes_diagnostics.json` | R-hat, tamaño efectivo de muestra, divergencias, tiempo de ajuste y los parámetros estimados (probabilidades, curva de persistencia, dependencia) |
| `docs/resultados-bayes.md` | Una página: qué se ajustó, tabla comparativa anual contra `estimates.parquet`, qué dice el término de dependencia y los límites |

## Criterios de aceptación

- R-hat menor que 1,01 en los parámetros principales y ninguna divergencia sin explicar.
- Comprobación predictiva: el modelo reproduce los conteos observados por satélite.
- Prueba con años reservados: se ajusta sin S-NPP en 2021–2022 y se compara lo que predice con lo que S-NPP vio.
- El rango de 2000–2011 es más ancho que el de 2013–2020.
- La comparación con `estimates.parquet` se reporta tal cual, coincida o no.

## Reglas

- No se modifica ningún archivo existente de `scripts/`, `tests/` ni `docs/`. Solo se crean archivos nuevos.
- Código y nombres en inglés; este tipo de documento interno, en español.
- La unidad es *celdas-día con fuego*, nunca "incendios" ni "hectáreas". Toda cifra lleva su rango.
- Commits en español con Conventional Commits (`feat(metodo): ...`); ver `GIT.md`. No se suben `data/raw/`, `data/interim/`, `.venv/` ni `.env`.
- Semilla fija (`config.SEED`) para que el resultado se pueda repetir.
