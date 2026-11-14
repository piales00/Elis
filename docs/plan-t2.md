# Plan de T2 — Metodología

Rama: `feat/metodo`. Responsable: A. El código lo escribe Codex por olas y A lo revisa.

**Entregables finales:** `data/processed/series.json` y `data/processed/methodology.json`, con las columnas exactas de [`contrato-datos.md`](contrato-datos.md).

## Reglas para todas las tareas

- Python 3 con `.venv/bin/python`, DuckDB para todo lo que sea SQL y scikit-learn solo para el emulador.
- Nombres de archivos, funciones, variables y columnas internas en **inglés**. Los valores que fija el contrato no cambian (`region`, `source`, `anomaly_class`).
- **Ningún parámetro científico escrito a mano** fuera de `scripts/config.py`: filtros, años, umbrales, niveles de confianza e hiperparámetros. Si falta uno, la tarea se detiene y lo reporta. Los detalles de implementación (tamaños de muestra para diagnósticos, `n_jobs`, redondeo, nombres de archivos intermedios) pueden ir como constantes al inicio del script, listadas en el informe.
- Sin comentarios en el código salvo que sean imprescindibles.
- Cada script se ejecuta como `.venv/bin/python scripts/<nombre>.py` desde la raíz del repo, sin argumentos.
- `data/interim/` no se sube: es el resultado intermedio, que siempre se puede regenerar.
- Nadie hace commits: los hace A después de revisar.
- Una tarea solo toca los archivos que tiene asignados.

## Hechos de los datos (revisados el 2026-11-14)

| Dato | Valor |
|---|---|
| Terra | 2000-11-01 a 2025-12-31 |
| Aqua | 2002-07-04 a 2025-12-31 |
| VIIRS S-NPP | 2012-01-20 a 2025-12-31 |
| `version` de MODIS | `6.2` (2000–2017), `6.03` (2018–2022), `61.03` (2023–2025). **Todo es SP**: son revisiones del producto, no NRT. Se pueden mezclar según la guía MODIS C6/C6.1 |
| `version` de VIIRS | `2`, SP de la colección 2, en todos los años |
| `type` | Toma los valores 0 a 3. Solo se usa 0. **Cuidado:** desde la revisión `6.03` (2018) el 3,6 % no es `type=0`, frente al 0,2 % antes. Es una reclasificación, no un cambio físico |
| Celdas-día S-NPP en 2013–2020 | 262 280 |
| 2025 | Año bajo real (S-NPP −30 %). Coincide con la publicación de FIRMS byte a byte y no faltan meses |
| Interrupciones | Están en `config.OUTAGES`. Aqua: 2022-04-01 a 04-16. S-NPP: 2022-07-27 a 08-10, 2024-05-30 a 06-03 y 2024-07-10 a 07-15. Aqua tuvo cobertura degradada del 2020-08-16 al 09-02 (`config.DEGRADED`) |
| Deriva de órbita | Mediana de la hora local de paso de Aqua: 13:38 en 2019, 13:52 en 2023, 14:17 en 2024 y 14:51 en 2025. S-NPP se mantiene cerca de las 13:30. Terra adelanta su paso de 10:31 a 09:18. Los dos MODIS terminan su ciencia en 2027 (proyección de NASA) |

Fuente: auditoría de Codex del 2026-11-14, con citas a FIRMS, a la guía MODIS C6/C6.1 y a MODAPS.

## Ajustes al método por la auditoría

1. **Máscara de disponibilidad.** Para comparar Aqua con S-NPP (calibración, Chapman directo y emulador) se excluyen los días incluidos en `OUTAGES` de cualquiera de los dos sensores y en `DEGRADED`. En la serie, los meses con días excluidos llevan una marca interna y su estimación usa el sensor disponible con su `p`. Nunca se rellenan con ceros.
2. **Validación separada por deriva.** Todas las métricas de prueba se reportan para 2021–2024 y también por separado para 2021–2022 y 2023–2024 (`TEST_SPLIT_DRIFT`).
3. **Sensibilidad a `type`.** La calibración de la pieza 1 se repite sin el filtro `type=0` y la diferencia se reporta en `sensitivity.json`. Requiere una variante de `cells` sin el filtro: `cells.py --all-types` escribe `cells_alltypes.parquet`.
4. **2025** se trata como un año observado normal. Se declara que MODIS lo ve con la órbita desviada.

## Decisiones tomadas

1. **Celda-día** = (celda de 0,1°, `acq_date`). `daynight` **no** forma parte de la clave; se guarda como variable.
2. **Calibración** con 2013–2020 y **prueba** con 2021–2024, como dice el contrato.
3. **`modis_equiv`** = celdas-día de Aqua reales cuando hay Aqua. Antes de Aqua se usa Terra llevada a escala Aqua, y sin MODIS se usa el emulador (pieza 2). Ya está en el contrato.
4. En `methodology.json` se usan los nombres del contrato: `n_modis`, `p_modis` y `n_both`, aunque en el código interno se llamen `aqua`.
5. **Regiones provisionales** mientras T1 no entregue `regions.geojson`. El cambio a las reales es automático.

## Parámetros de `scripts/config.py`

```
COUNTRY = "Peru"
RAW_DIR = data/raw, INTERIM_DIR = data/interim, PROCESSED_DIR = data/processed
GRID_DEG = 0.1
FIRE_TYPE = 0
MODIS_MIN_CONFIDENCE = 30
VIIRS_CONFIDENCE = ("n", "h")
CALIBRATION_YEARS = (2013, 2020)
TEST_YEARS = (2021, 2024)
HISTORY_YEARS = (2003, 2025)
FIRST_YEAR, LAST_YEAR = 2000, 2026
AQUA_START = 2002-07-04
VIIRS_START = 2012-01-20
REGIONS = ("amazonia", "sierra", "costa")
NATIONAL = "peru"
MIN_RECAPTURES = 5
CI_LEVEL = 0.90
BOOTSTRAP_N = 500
SEED = 42
ANOMALY_PERCENTILES = (25, 75, 90)
FRP_CLASSES = (0, 5, 20, inf)
EMULATOR_PARAMS = HistGradientBoosting: max_iter=300, learning_rate=0.05, max_leaf_nodes=31, early_stopping con 10 % de validación
```

Clases de anomalía: por debajo del percentil 25 es `bajo`, de 25 a 75 es `normal`, de 75 a 90 es `alto` y por encima de 90 es `muy_alto`. Se compara con el mismo mes de 2003–2025.

## Ola 0 — Preparación (A + Claude) ✅

- Rama `feat/metodo`, este plan y las dependencias en `.venv`: duckdb, scikit-learn, pyarrow, pandas, joblib y pytest.
- Auditoría de datos con Codex en curso: versiones de MODIS y VIIRS, y huecos de 2025.

## Ola 1 — Datos base · `gpt-6.1-sol`

**Archivos:** `scripts/config.py`, `scripts/regions.py`, `scripts/cells.py`, `requirements.txt` y `.gitignore` (agregar `data/interim/`). Se borran `scripts/recaptura.py` y `scripts/explore.py`.

### 1a. `regions.py`
- Función `assign_regions(con, table)`. Agrega a una tabla de DuckDB que tenga `lat` y `lon` la columna `region` (`amazonia`, `sierra`, `costa` o NULL si cae fuera de Perú).
- Si existe `data/processed/regions.geojson`, usa sus polígonos de nivel `macro` con la extensión `spatial` de DuckDB.
- Si no existe, usa polígonos provisionales aproximados de las tres macrorregiones, definidos como constantes en `regions.py`. Costa: franja occidental bajo unos 1 000 m. Sierra: los Andes. Amazonía: al este de la vertiente oriental. Con 6 a 12 vértices por polígono basta, y se declaran como aproximación.
- Se registra con `print` qué fuente de regiones se usó.

### 1b. `cells.py`
1. Lee `modis_*_Peru.csv` y `viirs-snpp_*_Peru.csv` con `all_varchar=true, union_by_name=true`.
2. Aplica los filtros de `config` (`type`, confianza) y las fechas por sensor.
3. Genera `data/interim/cells.parquet` con una fila por sensor y celda-día:

| Columna | Tipo | Qué es |
|---|---|---|
| `sensor` | texto | `aqua`, `terra` o `snpp` |
| `cell_y`, `cell_x` | entero | `floor(lat / GRID_DEG)` y `floor(lon / GRID_DEG)` |
| `lat`, `lon` | número | Centro de la celda |
| `date`, `year`, `month` | — | Desde `acq_date` |
| `region` | texto | Según `regions.py`; se descartan las filas con NULL |
| `n_points` | entero | Detecciones en esa celda-día |
| `frp_sum`, `frp_max` | número | — |
| `bright_max` | número | `brightness` (MODIS) o `bright_ti4` (VIIRS) |
| `scan_mean`, `track_mean` | número | — |
| `has_day`, `has_night` | booleano | Desde `daynight` |
| `version` | texto | La versión del producto que más se repite en la celda-día |

4. Genera `data/interim/detections_monthly.parquet` con `region, year, month, sensor, n_detections`, que es el conteo de filas filtradas. De ahí sale `raw_detections`.
5. Imprime un resumen: celdas-día por sensor y año, y el porcentaje que cayó fuera de Perú.

**Criterios de aceptación**
- Todos los parámetros vienen de `config.py`.
- El script corre en menos de 2 minutos.
- La clave (`sensor`, `cell_y`, `cell_x`, `date`) es única.
- Celdas-día de S-NPP en 2013–2020: unas 264 000, con un margen de ±2 %.
- No hay filas Aqua antes de `AQUA_START`.

## Ola 2 — Método · en paralelo

Todas leen `data/interim/cells.parquet`. Ninguna modifica `config.py` ni los archivos de la Ola 1.

### 2a. Pieza 1: captura y recaptura · `gpt-6-astra` · `scripts/capture_recapture.py`

**Funciones puras**, para que sean fáciles de probar:
- `chapman(n1, n2, m) -> N`, con N = (n1+1)(n2+1)/(m+1) − 1.
- `chapman_var(n1, n2, m)`, la varianza de Seber: (n1+1)(n2+1)(n1−m)(n2−m) / ((m+1)²(m+2)).
- `chapman_ci(n1, n2, m, level)`: intervalo log-normal de Chao. El límite inferior nunca baja de n1 + n2 − m.

**Calibración (2013–2020)**
- Se agrupan los años por región × mes. Lista 1 = Aqua y lista 2 = S-NPP.
- Se calcula `p_aqua = n1/N`, `p_viirs = n2/N` y `p_terra` (Terra contra S-NPP, en su propio Chapman).
- Si un estrato tiene `m < MIN_RECAPTURES`, se juntan los meses vecinos (±1) de la misma región. Si sigue sin alcanzar, se usa la región entera. Se registra cuándo se juntaron.

**Incertidumbre de `p`**
- *Bootstrap* por años de calibración: se remuestrean los 8 años con reemplazo, `BOOTSTRAP_N` veces, con `SEED`.
- Salida: `data/interim/detection_probs.parquet` con `region, month, sensor_pair, n1, n2, m, N, p1, p2`, los percentiles del *bootstrap* de `p1` y la columna `pooled`.

**Estimación por región × año × mes**
- Hay Aqua y S-NPP (desde 2012): Chapman directo de ese mes, con `chapman_ci`. `source = both`.
- Solo hay MODIS: N = n_aqua / p_aqua, o n_terra / p_terra antes de `AQUA_START`. El rango sale de la distribución *bootstrap* de `p`. `source = modis_only`.
- Solo hay VIIRS: N = n_snpp / p_viirs. `source = viirs_only`.
- La fila `peru` es la suma de las regiones. Su rango se calcula sumando las réplicas del *bootstrap*, no los límites.
- Salida: `data/interim/estimates.parquet`.

**Sensibilidad a la heterogeneidad**
- Se repite la calibración por clase de FRP (`FRP_CLASSES`), usando el `frp_max` de cualquiera de los dos sensores.
- Se compara N estratificado contra N sin estratificar.
- Salida: `data/interim/sensitivity.json`.

**Criterios de aceptación**
- Nunca hay división por cero; los estratos con m = 0 se manejan.
- `est_low ≤ estimated ≤ est_high`, y `estimated ≥ n1 + n2 − m` cuando hay ambos sensores.
- Imprime el porcentaje que ve cada sensor por región, para comparar con el diagnóstico de PROYECTO.md.

### 2b. Pieza 2: emulador MODIS · `gpt-6-astra` · `scripts/modis_emulator.py`

**Datos**
- Una fila por celda-día de S-NPP.
- Etiqueta = 1 si Aqua detectó la misma celda la misma fecha.

**Variables**
- `n_points`, `frp_sum`, `frp_max`, `bright_max`, `scan_mean`, `track_mean`, `has_day`, `has_night`.
- `region` como variable categórica, y `month` como seno y coseno.

**Entrenamiento y modelos**
- Se entrena con `CALIBRATION_YEARS` y se prueba con `TEST_YEARS`. Los años de prueba nunca se usan para ajustar nada.
- Modelos: `LogisticRegression` como línea base y `HistGradientBoostingClassifier` como modelo principal, con `EMULATOR_PARAMS`.
- Se revisa la calibración de las probabilidades (curva de confiabilidad). Si hace falta, se aplica `CalibratedClassifierCV` isotónico dentro del entrenamiento.

**Celdas que solo ve MODIS**
- Por región × mes en calibración, la tasa r = (celdas-día de Aqua sin S-NPP) / (celdas-día de S-NPP).

**Equivalente MODIS mensual**
- `modis_equiv_emulated = Σ p_i + r · n_snpp`, por región × año × mes.

**Métricas en los años de prueba**
- AUC y Brier de los dos modelos.
- Error porcentual medio absoluto del total mensual y anual frente al Aqua real.
- Línea base de factor fijo: Aqua/S-NPP por región × mes en calibración, multiplicado por S-NPP.

**Salidas**
- `data/interim/emulator.joblib`.
- `data/interim/emulator_metrics.json`.
- `data/interim/modis_equiv_emulated.parquet` (2012–2025).

**Criterios de aceptación**
- El modelo principal le gana al factor fijo en el error mensual de los años de prueba. Si no gana, se reporta tal cual, sin ajustarlo a la fuerza.
- Se imprime la tabla de métricas.

### 2c. Pruebas · `gpt-6.1-sol` · `tests/test_capture_recapture.py`

**Prueba de recuperación**
- Población sintética con N conocido y dos sensores independientes, con p1 y p2 entre 0,2 y 0,9.
- Chapman recupera N sin sesgo grande.
- El intervalo cubre N en al menos el 85 % de 1 000 réplicas, con `CI_LEVEL` = 0,90.

**Casos límite**
- m = 0, n1 = 0 y m = n1 = n2.

**Prueba de sesgo esperado**
- Con detección correlacionada (los fuegos grandes los ven los dos), Chapman **subestima**. Esto documenta el sesgo conocido.

**Ejecución:** las pruebas importan las funciones puras de `capture_recapture.py` y se corren con `.venv/bin/pytest -q`.

## Ola 3 — Integración · `gpt-6-astra`

### 3a. `scripts/build_series.py` → `data/processed/series.json`
- Se genera una fila por región (`peru`, `amazonia`, `sierra`, `costa`) × año × mes, desde 2000-11 hasta el último mes con datos.
- Origen de cada columna:
  - `raw_modis`: unión de celdas-día de Terra y Aqua.
  - `raw_viirs`: celdas-día de S-NPP, o `null` antes de 2012.
  - `raw_detections`: suma de `n_detections` de todos los sensores.
  - `estimated`, `est_low`, `est_high` y `source`: de la pieza 1.
  - `modis_equiv`: según la decisión 3.
- `hist_median` y `anomaly_class` se calculan contra el mismo mes en `HISTORY_YEARS`, usando `estimated`.
- `is_forecast = false`.
- Los números se redondean a 1 decimal. Los meses sin datos no se inventan.

### 3b. `scripts/validate.py` → `data/processed/methodology.json`
- `params`, desde `config`.
- `detection`, desde `detection_probs.parquet`.
- `validation` por región, en los años de prueba:
  - `error_pct_method`: error de estimar solo con Aqua (n_aqua / p_aqua calibrado) frente al Chapman directo de ese año.
  - `error_pct_naive`: el mismo error para la suma ingenua de Aqua y S-NPP.
  - `mapbiomas_corr`: `null` hasta la Ola 4.
- `emulator`: con el esquema exacto del contrato.

**Criterios de aceptación**
- Los JSON pasan una validación del esquema del contrato. Se agrega `tests/test_outputs.py` con los nombres de columnas, los tipos, los valores permitidos y `est_low ≤ estimated ≤ est_high`.

## Ola 4 — Cierre

| # | Tarea | Modelo | Depende de |
|---|---|---|---|
| 4a | MapBiomas Fuego Perú: área quemada anual por región y `mapbiomas_corr` | `gpt-6-astra` | Descarga externa |
| 4b | Cambio a `regions.geojson` real y regeneración de todo | `gpt-6.1-sol` | Entrega de T1 |
| 4c | 2026 con VIIRS NOAA-20/21: calibrar NOAA-20 contra S-NPP y agregar el sensor a `cells.py` | `gpt-6-astra` | Entrega de T1 |
| 4d | `estimated` por celda para `map.parquet`, entregado a T1 o T3 | `gpt-6.1-sol` | Ola 3 |
| 4e | ~~Volver a descargar MODIS~~ Descartado: la auditoría confirmó que todo es SP | — | — |
| 4f | Segunda validación externa: área quemada MCD64A1 (MODIS, 500 m) desde Microsoft Planetary Computer (colección `modis-64A1-061`, sin cuenta). Suma mensual por región y correlación con nuestra serie. No es del todo independiente, porque sale de MODIS | `gpt-6.1-sol` | Ola 3 |

## Puntos de control

| Hora | Qué debe estar |
|---|---|
| H6 | Olas 1 y 2: primera captura y recaptura real y emulador entrenado |
| H12 | Ola 3: `series.json` y `methodology.json` reales en `data/processed/` |
| H20 | Ola 4, según las entregas de T1 |

## Ola 2.5 — Corrección por hora de paso · `gpt-6-astra`

**Hallazgo (2026-11-14):** en 2013–2020, los días en que Aqua y S-NPP pasan con menos de 20 minutos de diferencia, el 79 % de las celdas-día de Aqua también están en S-NPP, y Chapman da N ≈ 1,26 × S-NPP. Con 20 a 60 minutos de diferencia, coincide el 57 % y N ≈ 1,75 × S-NPP. El fuego cambia entre pasadas y Chapman lo cuenta como fuego no visto. Eso infla la estimación con la deriva de Aqua (2023 en adelante) y con Terra, que pasa 3 horas antes.

**Definición nueva de lo que se estima:** celdas-día con fuego activo a la hora de la pasada de la tarde (cerca de las 13:30, hora solar local) y de su pasada nocturna.

### 2.5a. Hora de paso en `cells.py`
- Agregar a `cells.parquet` las columnas `day_lst_min` y `night_lst_min`: la mediana de la hora solar local de las detecciones de la celda-día, en minutos, calculada como `acq_time` UTC + longitud × 4.
- Generar `data/interim/overpass.parquet` con `sensor, date, region, day_lst_min, n_cells`: la mediana por sensor, fecha y región.
- La salida anterior no cambia en lo demás.

### 2.5b. Calibración con pasadas simultáneas en `capture_recapture.py`
- Un día es **simultáneo** para una región si la diferencia absoluta entre la hora de paso diurna de Aqua y la de S-NPP es menor que `SIMULTANEOUS_MAX_MINUTES`. Los días en que falta la hora de alguno de los dos no son simultáneos.
- `p_aqua` y `p_viirs` se calibran por región × mes solo con días simultáneos de `CALIBRATION_YEARS`. Siguen valiendo la agrupación por `MIN_RECAPTURES`, el *bootstrap* por años y la máscara de interrupciones.
- Diagnóstico obligatorio en `sensitivity.json`:
  - Tabla de coincidencia y de N/S-NPP por tramo de diferencia de hora (0–20, 20–40, 40–60, más de 60 minutos) y por período (calibración, 2021–2022, y 2023, 2024 y 2025 por separado).
  - La misma tabla controlando el ángulo de visión, con `scan_mean` de S-NPP en terciles, para descartar que el efecto sea del ángulo y no del tiempo.
  - La calibración anterior, con todos los días, para comparar.

### 2.5c. Regla de estimación nueva
| Período | `estimated` | `source` |
|---|---|---|
| Con S-NPP disponible (2012 en adelante) | `n_snpp / p_viirs` | `both` hasta 2022 si Aqua también está disponible; `viirs_only` desde `DRIFT_START_YEAR` o si Aqua está en interrupción |
| Aqua sin S-NPP (2002-07 a 2012-01, o interrupciones de S-NPP) | `n_aqua / p_aqua` | `modis_only` |
| Solo Terra (2000-11 a 2002-06) | `n_terra × r(región, mes) / p_aqua`, con r = Aqua/Terra | `modis_only` |

- El rango sale de las réplicas *bootstrap* de `p`, y en el período Terra también de `r`.
- El Chapman directo mensual se conserva en `estimates.parquet` como columna de diagnóstico (`chapman_direct`), no como cifra principal.
- En 2012–2022 se guarda además `estimated_from_aqua = n_aqua / p_aqua`: dos sensores independientes estimando lo mismo.

### 2.5d. Puente Terra → Aqua
- `r(región, mes)` = celdas-día de Aqua / celdas-día de Terra en `TERRA_BRIDGE_YEARS`, con *bootstrap* por años.
- **Prueba hacia atrás:** se calcula `r` solo con `TERRA_BACKCAST_TRAIN_YEARS`, se reconstruye Aqua en `TERRA_BACKCAST_TEST_YEARS` usando solo Terra y se compara con el Aqua real. Se reporta el error mensual y anual por región en `sensitivity.json` (`terra_backcast`).
- Se elimina la calibración Terra–S-NPP por Chapman.

### 2.5e. Validación en años de prueba
- Para `TEST_YEARS`, y por separado para cada tramo de `TEST_SPLIT_DRIFT`: error de `n_aqua / p_aqua` frente a `n_snpp / p_viirs`, por región, mensual y anual. Es la prueba de que la reconstrucción con solo MODIS (antes de 2012) da lo mismo que VIIRS.

**Criterios de aceptación**
- La serie nacional no tiene un salto entre 2002 y 2003 ni entre 2022 y 2023 mayor que la variación entre años normales; se reporta la razón `estimated / n_snpp` por año (debe ser estable) y `estimated / n_aqua` en 2003–2022.
- 2025 queda por debajo de 2024.
- Las 13 pruebas siguen pasando; se agregan pruebas del puente y de la clasificación de días simultáneos.

## Ola 3 — Integración (versión final tras la Ola 2.5) · `gpt-6-astra`

Reemplaza a la Ola 3 de arriba donde se contradigan.

### Rangos con error estructural
Los rangos de la Ola 2.5 (1–3 %) solo miden la incertidumbre de calibración. El rango final suma el error medido entre sensores:

| Período | Error estructural que se agrega |
|---|---|
| Solo VIIRS o ambos (2012 en adelante) | Ninguno: es la escala de referencia. El rango es el *bootstrap* |
| Solo Aqua (2002-07 a 2011) | Residuos de log(estimado con Aqua / estimado con VIIRS) en `TEST_YEARS`, por región × mes |
| Solo Terra (2000-11 a 2002-06) | Residuos de la prueba hacia atrás de Terra (`terra_backcast`), por región × mes |

- Cada réplica *bootstrap* se multiplica por exp(un residuo sorteado de su región), con `SEED`. Los percentiles de `CI_LEVEL` salen de esas réplicas combinadas.
- La fila `peru` suma las réplicas regionales, usando el mismo año de residuo para las tres regiones, para conservar la correlación.
- Las réplicas finales se guardan en `data/interim/series_replicates.parquet`.

### 3a. `scripts/build_series.py` → `data/processed/series.json`
- Las columnas son exactamente las de `series.json` en el contrato, en ese orden.
- `estimated` sale de `estimates.parquet` (Ola 2.5), y `est_low`/`est_high` del rango con error estructural.
- `raw_modis` es la unión de celdas-día de Terra y Aqua. `raw_viirs` son las de S-NPP, o `null` antes de 2012-01. `raw_detections` es la suma de `n_detections` de todos los sensores.
- `modis_equiv` sigue la regla del contrato: Aqua real; Terra × r antes de `AQUA_START`; emulador si no hay MODIS.
- `hist_median` y `anomaly_class` se calculan con `estimated` en `HISTORY_YEARS`, usando `ANOMALY_PERCENTILES`.
- `is_forecast = false`.
- Los números se redondean a 1 decimal. Los meses anteriores a 2000-11 no existen; los meses sin datos no se inventan.

### 3b. `scripts/validate.py` → `data/processed/methodology.json`
- `params`: `grid_deg`, `calibration_years`, `test_years`, `simultaneous_max_minutes` y `ci_level`.
- `detection`: una fila por región × mes con los nombres del contrato (`n_modis` = Aqua, `n_viirs`, `n_both`, `p_modis`, `p_viirs`), sacados de la calibración con pasadas simultáneas.
- `validation`: una fila por región y otra para `peru`.
  - `error_pct_method`: MAPE anual del estimado solo con Aqua frente al estimado con VIIRS, en `TEST_YEARS`.
  - `error_pct_naive`: MAPE anual de la suma ingenua (`raw_detections`) frente a `estimated`, en `TEST_YEARS`. Muestra cuánto se equivoca quien suma sin corregir.
  - `mapbiomas_corr`: correlación de Pearson anual 2001–2025 entre `estimated` y el área quemada de MapBiomas (`data/interim/mapbiomas.parquet`), si el archivo existe; si no, `null`.
- `emulator`: con el esquema del contrato, desde `emulator_metrics.json`.
- `periods`: la lista de períodos con su fuente y su confianza:
  `[{"from": "2000-11", "to": "2002-06", "source": "terra_bridge", "confidence": "low"}, ...]`. Se marca `low` hasta `LOW_CONFIDENCE_UNTIL`.
- `findings`: los números que usará "How we calculate it", con nombres en inglés:
  - la coincidencia y N/S-NPP por tramo de diferencia de hora en calibración;
  - el sesgo de Chapman ante dependencia, sacado de las pruebas (unos −29 %);
  - el error de 2025 del emulador frente a Aqua real (deriva);
  - la hora local mediana de paso de Aqua por año (2013–2025).

### 3c. `tests/test_outputs.py`
- Valida que los dos JSON cumplen el contrato: nombres, tipos, valores permitidos de `source` y `anomaly_class`, `est_low ≤ estimated ≤ est_high`, una sola fila por región × año × mes, y que `peru` es la suma de las regiones en `raw_*`.

**Criterios de aceptación**
- `.venv/bin/pytest -q` pasa completo.
- El rango anual de 2003–2011 es más ancho que el de 2013–2022, y el de 2000–2002 más ancho todavía.
- El informe incluye la serie anual nacional (estimated, rango y source) y la tabla `validation`.

## Tarea 4d — Estimado por celda para el mapa (versión final)

**Entrega:** `data/processed/map.parquet`, con las columnas exactas del contrato, y `data/processed/map-sample-2024-09.json` para que la web pruebe sin la API. Lo genera T2 porque la columna `estimated` necesita la calibración; T1 y T3 solo lo leen.

### Idea
La estimación se calcula por región y mes (`series.json`). El mapa **reparte** esa cifra entre las celdas de la región según dónde vio fuego el sensor que se usó ese mes. No es una estimación independiente por celda.

### `scripts/build_map.py`
1. Lee `data/interim/cells.parquet` y `data/processed/series.json`.
2. Una fila por celda × año × mes con al menos una celda-día de cualquier sensor:
   - `lat`, `lon`: centro de la celda. `region`: la macrorregión de la celda.
   - `raw_modis`: días del mes con detección de Terra o Aqua (unión de fechas).
   - `raw_viirs`: días del mes con detección de S-NPP; `null` en los meses anteriores a `VIIRS_START`.
3. `estimated` por celda:
   - Peso de la celda = sus días del sensor de referencia del mes. Si el `source` del mes en `series.json` es `both` o `viirs_only`, el sensor de referencia es S-NPP; si es `modis_only`, es MODIS (`raw_modis`).
   - `estimated` = `estimated` de la región y mes en `series.json` × peso de la celda / suma de pesos de la región.
   - Si la suma de pesos de la región es cero y `estimated` regional es mayor que cero, se usa como peso la unión de días de todos los sensores y se registra el caso.
   - Las celdas con peso cero quedan con `estimated = 0` (el otro sensor vio fuego, el de referencia no).
4. `size_ratio`: `null` en todas las filas (pieza 3, se hace después).
5. Redondeo: `estimated` a 2 decimales, `lat` y `lon` a 2 decimales.
6. Orden: `year, month, region, lat, lon`. Compresión zstd.
7. `map-sample-2024-09.json`: lista de objetos con `lat, lon, raw_modis, raw_viirs, estimated` para septiembre de 2024, igual que la respuesta de `GET /map`.
8. Imprime: filas totales, tamaño del archivo, filas por año, y la diferencia máxima entre la suma de celdas y `series.json` por región y mes.

### `tests/test_map.py`
- Columnas, tipos y orden del contrato; `region` solo toma las tres macrorregiones.
- Clave única (`lat`, `lon`, `year`, `month`).
- Los centros caen en la cuadrícula de `GRID_DEG`.
- `estimated ≥ 0`; `raw_modis` y `raw_viirs` entre 0 y los días del mes; `raw_viirs` es `null` antes de `VIIRS_START` y nunca después.
- Para cada región y mes, la suma de `estimated` de las celdas coincide con `series.json` con una tolerancia de 0,5 % o 1 unidad.
- La suma de `raw_viirs` y de la unión MODIS por región y mes coincide con `raw_viirs` y `raw_modis` de `series.json`.

### Criterios de aceptación
- `.venv/bin/pytest -q` pasa completo (las 34 pruebas anteriores más las nuevas).
- `map.parquet` pesa menos de 10 MB.
- No se modifica ningún archivo existente fuera de los dos nuevos.

### Límite que se declara
Antes de 2012 el mapa solo puede poner fuego donde MODIS lo vio. Los fuegos pequeños que MODIS no ve están en el total de la región, pero el mapa los reparte entre las celdas con fuegos grandes. El mapa anterior a 2012 muestra bien **cuánto** y aproximadamente **dónde**.

## Tarea 4g — `regions.geojson` provisional

**Entrega:** `data/processed/regions.geojson`, con el formato del contrato, para que `/regions` y el mapa funcionen hoy. Se reemplaza cuando T1 entregue el definitivo.

- `scripts/export_regions.py` exporta los polígonos provisionales que ya usa `scripts/regions.py` (no los redefine: los importa).
- Una `Feature` por macrorregión (`level = "macro"`, `id` = `amazonia`, `sierra` o `costa`, `name` = `Amazon`, `Andes` o `Coast`) y una para el país (`id = "peru"`, `name = "Peru"`, `level = "pais"`), que es la unión de las tres.
- Propiedad extra `provisional: true` en todas las `Feature`.
- Coordenadas en grados con a lo más 4 decimales; GeoJSON válido (anillos cerrados, orden antihorario en el exterior).
- **Cuidado:** `regions.py` usa `data/processed/regions.geojson` si existe. Al exportarlo, `cells.py` pasaría a leerlo. Por eso `regions.py` solo debe usar el archivo cuando sus `Feature` **no** tienen `provisional: true`; si lo tienen, sigue con sus polígonos internos. Es el único cambio permitido en `regions.py`, y los resultados de `cells.py` no deben cambiar.

## Tarea 4h — Mapa antes de 2012: lo visto y lo no visto

**Problema:** antes de 2012, `estimated` de la región se reparte solo entre las celdas donde MODIS vio fuego. Como Aqua ve cerca del 14 %, cada día visto recibe unas 7 veces su valor y el 2,7 % de las celdas supera 31 (máximo 159).

**Regla nueva** para los meses con `source = modis_only`, por región y mes:
- **Parte vista:** cada celda recibe sus propios días MODIS del mes (`raw_modis_celda`), sin escalar.
- **Parte no vista:** `unseen = estimated_region − Σ raw_modis_celda`, repartida según la **climatología VIIRS** de esa región y mes del año: la fracción de las celdas-día de S-NPP de `CALIBRATION_YEARS` y `TEST_YEARS` (2013–2024) que cayó en cada celda.
- `estimated_celda = raw_modis_celda + unseen × clim_celda`. Las celdas sin fuego MODIS ese mes pero con climatología positiva **también entran al mapa** (con `raw_modis = 0` y `raw_viirs = null`).
- Si `unseen < 0` (raro), se usa la regla actual para ese mes y se registra.
- Para `both` y `viirs_only` no cambia nada.

**Validación (obligatoria):** en 2013–2020 se arma el mapa con la regla nueva usando solo Aqua (como si no hubiera VIIRS) y se compara con el mapa real basado en S-NPP de esos mismos meses:
- correlación espacial de Spearman por región y mes (mediana y percentiles 25–75);
- la misma métrica para la regla actual (todo a celdas MODIS), para comparar;
- porcentaje de celdas por encima de 31 con cada regla.
Resultados en `data/interim/map_validation.json`.

**Criterios de aceptación**
- La suma por región y mes sigue coincidiendo con `series.json` (las pruebas de `tests/test_map.py` se adaptan solo donde la regla nueva lo exige, por ejemplo `raw_modis = 0` en celdas nuevas).
- La regla nueva supera a la actual en la correlación de la validación; si no, se informa y no se aplica.
- Menos del 0,1 % de las celdas supera 31.
- `map.parquet` sigue pesando menos de 10 MB.

## Tarea 4i — Regiones reales por departamentos (reemplaza la entrega de T1)

**Entrega:** `data/processed/regions.geojson` definitivo, sin `provisional`, y todo el flujo regenerado con esas regiones.

### Fuente de los límites
- Departamentos (ADM1) de Perú desde **geoBoundaries** (licencia abierta, CC BY 4.0), versión gbOpen. Se descarga con `scripts/fetch_departments.py` a `data/external/boundaries/` (no se sube).
- Si geoBoundaries no responde, se usa GADM nivel 1 y se declara.
- Se simplifica la geometría para que el archivo final pese menos de 2 MB, sin dejar huecos ni solapes entre departamentos vecinos (simplificación topológica).

### Departamentos → macrorregiones
- El contrato pide agrupar departamentos completos.
- La asignación no se elige a mano: cada departamento va a la macrorregión con la que comparte **más área** según los polígonos provisionales de `regions.py`. Se publica la tabla con el porcentaje de cada departamento en cada macrorregión.
- Callao se une a Lima para la asignación, pero conserva su propia `Feature`.

### `scripts/export_regions.py` (se reemplaza la versión provisional)
- Una `Feature` por departamento: `id` en minúsculas y sin tildes (`madre_de_dios`), `name` con tildes (`Madre de Dios`), `level = "departamento"` y propiedad extra `macro`.
- Una `Feature` por macrorregión (`level = "macro"`, `id` = `amazonia`, `sierra` o `costa`), unión de sus departamentos.
- Una `Feature` para el país (`id = "peru"`, `level = "pais"`).

### Regenerar todo
En este orden: `cells.py` (con `--all-types` también), `capture_recapture.py`, `modis_emulator.py`, `build_series.py`, `validate.py`, `build_map.py`, `pytest`.

### Informe obligatorio
- Tabla de asignación departamento → macro con los porcentajes de área.
- Cambio en celdas-día por región y sensor frente a las regiones provisionales.
- Cambio en `p_aqua` y `p_viirs` por región, en la serie anual por región y en la tabla `validation`.
- Si algún resultado empeora mucho (por ejemplo, el error de una región sube más de 5 puntos), se informa, sin ajustar nada para esconderlo.

### Límite que se declara
Los departamentos no siguen las regiones naturales: Cusco, Puno, Junín o Ayacucho tienen partes de selva y de sierra. Agrupar departamentos completos mezcla regímenes de fuego dentro de una macrorregión.
