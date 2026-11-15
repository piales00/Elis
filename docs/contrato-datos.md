# Contrato de datos

Este documento fija qué datos se pasan entre las partes del proyecto. Si todos lo respetan, nadie espera a nadie: el frontend trabaja con datos de prueba con estas mismas columnas y luego solo se reemplazan los archivos.

**Regla:** cualquier cambio a este contrato se avisa al equipo y se sube con un commit `docs(data): ...` antes de cambiar el código.

## 1. Parámetros fijos del método

Todos calculan con estos mismos valores. Están pensados para cambiarse en un solo lugar (`scripts/config.py`).

| Parámetro | Valor | Por qué |
|---|---|---|
| País | `Peru` (parámetro del código) | El método es genérico; Perú es la demostración |
| Cuadrícula | celdas de 0,1° (unos 11 km) | Más grande que el píxel de ambos sensores, incluso en el borde de la imagen de MODIS |
| Unidad de actividad | **celda-día**: una celda con al menos una detección en una fecha. La pasada de día y la de noche cuentan como una sola (`daynight` no es parte de la clave) | Evita contar varias veces el mismo fuego |
| Nivel del rango | 90 % (`est_low`, `est_high`) | Lo bastante amplio para ser honesto sin volverse inútil |
| Fecha | `acq_date` en UTC | Es la que entrega FIRMS |
| Tipo de detección | solo `type = 0` (vegetación) | Quita volcanes, industria y minería |
| Confianza MODIS | `confidence >= 30` | Descarta la confianza baja |
| Confianza VIIRS | `confidence` en `n` o `h` | Equivalente: descarta la baja (`l`) |
| NRT 2026 | MODIS: `confidence >= 30`; VIIRS: confianza `n` o `h`. Sin `type`: se descartan las detecciones NRT en celdas de 0,1° donde, en datos SP 2012–2025 del mismo instrumento, al menos el 50 % de las detecciones tiene `type ≠ 0` y hay al menos 5 (máscara de fuentes estáticas) | Datos provisionales hasta que FIRMS los reemplace por estándar |
| Par de calibración | Aqua (MODIS) y S-NPP (VIIRS) | Pasan a una hora parecida, cerca de la 1:30 pm |
| Años de calibración | 2013–2020 | 2012 se excluye porque VIIRS empieza el 20 de enero |
| Años de prueba | 2021–2024 | El método nunca los ve al calibrar |
| Estratos | región × mes | La diferencia entre sensores cambia con ambos |
| Terra | se calibra aparte | Entre el 2000-11-01 y el 2002-07-03 solo hay Terra, que pasa a otra hora. Aqua empieza el 2002-07-04. 2000 solo tiene noviembre y diciembre |
| Historia base para "¿es normal?" | 2003–2025 | Años con Aqua completo |

## 2. Identificadores comunes

| Campo | Tipo | Valores |
|---|---|---|
| `region` | texto | `peru`, `amazonia`, `sierra`, `costa`. Los departamentos son opcionales, con el nombre en minúsculas y sin tildes (`ucayali`) |
| `year` | entero | 2000 a 2026 |
| `month` | entero | 1 a 12 |

Las macrorregiones se arman agrupando departamentos completos. Es una aproximación y se declara en "Cómo lo calculamos".

## 3. Archivos en `data/processed/`

Son pequeños y **sí se suben al repositorio**.

### `series.json` — el archivo principal

Una fila por región, año y mes. Alimenta el récord falso, el reloj del fuego y "¿este año es normal?".

| Campo | Tipo | Qué es |
|---|---|---|
| `region`, `year`, `month` | — | Identificadores |
| `raw_modis` | entero | Celdas-día vistas por MODIS (Terra y Aqua unidos) |
| `raw_viirs` | entero o `null` | Celdas-día vistas por VIIRS. `null` antes de 2012 |
| `raw_detections` | entero | Suma ingenua de detecciones de todos los sensores (Terra, Aqua, S-NPP, NOAA-20 desde 2018-04 y NOAA-21 desde 2023-03). Solo para mostrar el salto falso |
| `estimated` | número | Fuego total estimado por captura y recaptura. **La cifra principal** |
| `est_low`, `est_high` | número | Rango de incertidumbre de `estimated`, al 90 % |
| `modis_equiv` | número | Celdas-día en escala **MODIS Aqua** (pieza 2). Sirve de comprobación. Ver la regla de abajo |
| `source` | texto | `modis_only`, `both` o `viirs_only`: con qué datos se calculó. `forecast` en las filas pronosticadas |
| `hist_median` | número | Mediana de `estimated` de ese mes en 2003–2025 |
| `anomaly_class` | texto | `low`, `normal`, `high` o `very_high`, comparado con su propio mes |
| `is_forecast` | booleano | `true` solo para meses pronosticados (pieza 4) |

```json
{"region": "amazonia", "year": 2005, "month": 9, "raw_modis": 1000, "raw_viirs": null,
 "raw_detections": 2100, "estimated": 5000, "est_low": 4200, "est_high": 6100,
 "modis_equiv": 1000, "source": "modis_only", "hist_median": 3800,
 "anomaly_class": "high", "is_forecast": false}
```

Los números del ejemplo son inventados.

**2026:** la serie llega hasta el 2026-11-13. Desde agosto los datos son NRT y van marcados como `provisional` en `periods`. Del 2026-11-02 al 2026-11-13 no hay S-NPP: `estimated` usa NOAA-20 llevado a escala S-NPP (razón medida en enero–octubre de 2026); `raw_viirs` sigue siendo solo S-NPP. El último mes, si está incompleto, se compara con la misma ventana de días de 2003–2025 en `hist_median` y `anomaly_class`, y no se extrapola. `raw_detections` incluye NOAA-20 desde 2018-04 y NOAA-21 desde 2023-03, porque es la suma ingenua de todos los sensores: además del salto de 2012 tiene saltos falsos en 2018 y 2023, y por eso `error_pct_naive` y la demo `forecast.raw_vs_corrected` del crudo crecen frente a una suma solo con Terra, Aqua y S-NPP. `estimated`, `raw_viirs` y `modis_equiv` no cambian.

**Pronóstico (pieza 4):** las filas con `is_forecast: true` van después de las observadas y solo para meses posteriores al último observado. Tienen `source: "forecast"` y `raw_modis`, `raw_viirs`, `raw_detections` y `modis_equiv` en `null`. `estimated` es la mediana pronosticada y `est_low`/`est_high` su rango nominal del 90 %, que en el backtesting cubre cerca del 83 %. El origen es el último mes completo: un mes parcial nunca se usa como predictor. Si con esa anticipación el modelo no le gana a la climatología, la fila es la climatología, y `methodology.json` → `forecast.published[].method` lo dice. La fila `peru` se modela aparte y no es la suma de las regiones. El mapa no incluye meses pronosticados.

**Regla de `modis_equiv`:** cuando hay datos de Aqua, es el conteo real de Aqua. Entre noviembre de 2000 y junio de 2002, cuando solo hay Terra, se lleva Terra a la escala de Aqua con `p_aqua / p_terra`. Cuando no hay MODIS, se usa el emulador entrenado con VIIRS (ver `emulator` en `methodology.json`). Es independiente de `estimated`: no se calcula con captura y recaptura.

### `regions.geojson`

Un polígono por región. Propiedades: `id` (igual a `region`), `name` (para mostrar, en inglés: `Amazon`, `Andes`, `Coast`; los departamentos con su nombre oficial, por ejemplo `Ucayali`) y `level` (`country`, `macro` o `department`).

**Idioma:** todo valor que llegue a la pantalla va en inglés, porque la app la evalúa la NASA. Los identificadores (`region`) se mantienen como están.

The FeatureCollection includes the country (`peru`), the three macroregions (`amazonia`, `sierra`, `costa`), and 25 departmental units (24 departments and Callao). Department polygons include `macroregion`; macroregion polygons include `departments`. `metadata` records the source, retrieval date, and reference-boundary note.

The approximate department grouping is documented in `scripts/config.py`:

| Macroregion | Departments |
|---|---|
| Amazon | Amazonas, Loreto, Madre de Dios, San Martín, Ucayali |
| Andes | Áncash, Apurímac, Arequipa, Ayacucho, Cajamarca, Cusco, Huancavelica, Huánuco, Junín, Pasco, Puno |
| Coast | Callao, Ica, La Libertad, Lambayeque, Lima, Moquegua, Piura, Tacna, Tumbes |

### `methodology.json`

Alimenta "Cómo lo calculamos".

```json
{
  "params": {"grid_deg": 0.1, "calibration_years": [2013, 2020], "test_years": [2021, 2024]},
  "detection": [
    {"region": "amazonia", "month": 9, "n_modis": 0, "n_viirs": 0, "n_both": 0,
     "p_modis": 0.0, "p_viirs": 0.0}
  ],
  "validation": [
    {"region": "amazonia", "error_pct_method": 0.0, "error_pct_naive": 0.0,
     "mapbiomas_corr": 0.0}
  ],
  "emulator": {
    "train_years": [2013, 2020], "test_years": [2021, 2024],
    "auc": 0.0, "brier": 0.0,
    "monthly_error_pct": 0.0, "monthly_error_pct_fixed_ratio": 0.0,
    "by_region": [
      {"region": "amazonia", "monthly_error_pct": 0.0, "annual_error_pct": 0.0}
    ]
  }
}
```

- `p_modis`, `p_viirs`: fracción del fuego total que ve cada sensor (de 0 a 1).
- `error_pct_method`: error medio en los años de prueba. `error_pct_naive`: el mismo error sin corregir, para comparar.
- `mapbiomas_corr`: qué tan parecida es nuestra serie anual a la de área quemada de MapBiomas (de −1 a 1). Vale `null` mientras no se haga la comparación.
- `periods`: tramos de la serie con la fuente usada (`terra_bridge`, `aqua`, `viirs`) y su confianza (`low`, `normal` o `provisional` para datos NRT). Campos opcionales: `note` y `partial_through` (fecha del último dato de un mes parcial). 2000-11 a 2002-06 es de confianza baja.
- `detection` incluye filas `peru`: conteos sumados de las tres regiones y p = Σn / ΣN regional.
- `findings`: cifras para la pantalla "How we calculate it": efecto de la hora de paso, sesgo de Chapman, deriva de Aqua (`emulator_drift_latest`), máscara de fuentes estáticas (`static_source_mask`) y razón NOAA-20/S-NPP (`noaa20_ratio`). Su forma la fija `scripts/validate.py`.
- `forecast`: pieza 4. Modelo y predictores, backtesting 2003–2025 frente a climatología y persistencia (`backtest`), prueba fuera de muestra con 2026 (`out_of_sample`), la demo de crudo frente a corregido (`raw_vs_corrected`) y las filas publicadas con su método (`published`). Lo escribe `scripts/forecast.py`, que se ejecuta después de `validate.py`. `forecast.season_outlook` resume `forecast.json` (variante, origen, temporada objetivo, anticipación, filas publicadas de `peru` y macrorregiones y métricas); lo añade `scripts/forecast_v2.py`, que se ejecuta después de `forecast.py`.
- `emulator`: resultados del emulador MODIS (pieza 2) en los años de prueba. `auc` mide si distingue bien qué celdas ve MODIS y cuáles no (de 0,5 a 1). `brier` es el error de sus probabilidades (cuanto más bajo, mejor). `monthly_error_pct` es el error medio del total mensual frente al Aqua real, y `monthly_error_pct_fixed_ratio` es el mismo error con un factor fijo, para comparar.

### `forecast.json` — pronóstico de temporada (pieza 4)

Pronóstico probabilístico de la temporada agosto–octubre (suma de `estimated`, en celdas-día con fuego) para `peru`, las tres macrorregiones y los departamentos. Lo escribe `scripts/forecast_v2.py`. Un solo objeto JSON:

| Campo | Qué es |
|---|---|
| `unit`, `season_months` | Unidad y meses de la temporada (`[8, 9, 10]`) |
| `origin` | Último mes completo usado como predictor (`YYYY-MM`). El mes parcial (`excluded_partial_month`) nunca se usa |
| `target_year`, `lead` | Temporada pronosticada y anticipación en meses desde el origen hasta agosto |
| `classes`, `class_percentiles`, `climatology_probabilities` | `low`, `normal`, `high`, `very_high` con los percentiles de `ANOMALY_PERCENTILES` (25, 75, 90) de las temporadas 2003–2025; la climatología da 0,25 / 0,50 / 0,15 / 0,10 |
| `variant`, `candidates`, `variant_scores`, `rules` | Variante publicada, conjuntos de predictores que puede elegir, puntaje de cada variante y reglas de decisión |
| `regions` | Una entrada por unidad (ver abajo) |
| `metrics` | Resumen por anticipación y nivel: unidades con habilidad, RPSS medio, habilidad en error y cobertura; departamentos publicados, con modelo, con climatología y bajo el umbral |
| `backtest` | `scheme`, `years` y `rows`: una fila por unidad, variante y anticipación con `n`, `mae_log_model`, `mae_log_climatology`, `mae_skill`, `rps_model`, `rps_climatology`, `rpss`, `coverage_model`, `coverage_climatology`, `class_hit_model`, `class_hit_climatology` y `chosen` (cuántas veces se eligió cada conjunto de predictores). Los departamentos solo tienen la variante publicada |
| `out_of_sample` | `year` (2026) y `rows`: por unidad, anticipación y tipo (`model` o `climatology`), el pronóstico de 2026 entrenado con 2003–2025 frente a lo observado; `published_method` marca el que se habría publicado |
| `raw_vs_corrected` | La demo crudo frente a corregido con el modelo de temporada publicado (entrena 2003–2011, prueba 2013–2025) |
| `departments_check` | Celdas asignadas, celdas reasignadas a su macrorregión y diferencia máxima entre la suma de departamentos y la serie de cada macrorregión |
| `sources`, `notes` | Fuentes (ONI, ICEN, NASA POWER) y límites declarados |

Cada entrada de `regions`:

| Campo | Qué es |
|---|---|
| `region`, `name`, `level`, `macroregion` | Identificador (el `id` de `regions.geojson`), nombre en inglés, `country`/`macro`/`department` y macrorregión del departamento |
| `season_median_2003_2025`, `active` | Mediana de la temporada en 2003–2025 y si supera el umbral de actividad (`FORECAST_DEPARTMENT_MIN_SEASON`) |
| `published`, `method`, `reason` | Si hay pronóstico, `model` o `climatology` (sin habilidad a esa anticipación), y por qué. Bajo el umbral: `published: false`, `method: null` y sin cifras |
| `median`, `low`, `high` | Mediana y rango al 90 % de la temporada |
| `probabilities`, `most_likely_class`, `median_class` | Probabilidad de cada clase, la clase más probable y la clase de la mediana |
| `hist_median`, `thresholds` | Mediana 2003–2025 y los tres umbrales de clase |
| `predictors`, `spread_log` | Solo con `method: "model"`: predictores usados y dispersión en logaritmo |
| `skill`, `skill_by_lead` | Habilidad del backtesting a la anticipación publicada y a cada anticipación (1, 4, 7 y 10 meses) |

Los departamentos con poca actividad no tienen pronóstico. Antes de 2012 la serie por departamento hereda el reparto por celda con la climatología de VIIRS. Las probabilidades salen de una distribución normal en logaritmo con la dispersión de los residuos de validación cruzada. Es un pronóstico, no un dato observado.

### `map.parquet` — solo lo lee la API

Una fila por celda, año y mes con actividad.

| Campo | Tipo | Qué es |
|---|---|---|
| `lat`, `lon` | número | Centro de la celda |
| `region` | texto | Macrorregión de la celda |
| `year`, `month` | entero | — |
| `raw_terra` | entero | Días del mes con detección de Terra en la celda |
| `raw_aqua` | entero | Días del mes con detección de Aqua en la celda |
| `raw_modis` | entero | Días del mes con detección de Terra o Aqua (unión, sin duplicar) |
| `raw_viirs` | entero o `null` | Días del mes con detección de VIIRS S-NPP. `null` antes de 2012 |
| `raw_viirs_noaa20` | entero | Días del mes con detección de VIIRS NOAA-20, separado de S-NPP |
| `raw_viirs_noaa21` | entero | Días del mes con detección de VIIRS NOAA-21, separado de S-NPP |
| `estimated` | número | Parte de la estimación de la región y mes (`series.json`) que le toca a la celda. La suma de las celdas de una región da el `estimated` de la serie |
| `size_ratio` | número o `null` | Razón VIIRS/MODIS de la celda (pieza 3, extra) |

`raw_viirs` cuenta solo S-NPP, igual que en `series.json`, porque es el satélite con el que se calibró el método. Sumar NOAA-20 y NOAA-21 desde 2018 metería un salto falso nuevo: más satélites ven más celdas-día sin que haya más fuego. NOAA-20 y NOAA-21 solo se usan donde falta S-NPP (después del 2026-11-02), con su propia calibración.

`raw_viirs_noaa20` y `raw_viirs_noaa21` exponen los conteos de esos satélites por separado para inspección y transparencia. No se suman a `raw_viirs` ni alteran la serie calibrada.

`region` es una de las tres macrorregiones. Cada celda de 0,1° se asigna a la unidad departamental que cubre la mayor parte de su área y luego a su macrorregión. Callao cuenta como unidad departamental dentro de Costa.

Lo genera T2 con `scripts/build_map.py`, porque `estimated` necesita la calibración. Antes de 2012 el fuego que MODIS vio queda en sus celdas y el que no vio se reparte con la climatología de VIIRS 2013–2024, así que puede haber celdas con `raw_modis = 0`. En 2026-11 el peso de reparto suma los días de NOAA-20 posteriores al 2026-11-01, así que puede haber celdas con `raw_modis = 0` y `raw_viirs = 0` (fuego visto solo por NOAA-20).

## 4. API

| Ruta | Parámetros | Devuelve |
|---|---|---|
| `GET /regions` | — | `regions.geojson` |
| `GET /series` | `region` (obligatorio), `from`, `to` (años) | Filas de `series.json` |
| `GET /map` | `year`, `month` (obligatorios), `region` | Lista de celdas: `lat`, `lon`, `raw_terra`, `raw_aqua`, `raw_modis`, `raw_viirs`, `raw_viirs_noaa20`, `raw_viirs_noaa21`, `estimated` |
| `GET /methodology` | `region` (opcional) | `methodology.json` |
| `GET /forecast` | `region` (opcional: `peru`, macrorregión o departamento) | `forecast.json`. Con `region`, `regions`, `backtest.rows` y `out_of_sample.rows` se filtran a esa unidad; una región desconocida da 404 |
| `POST /chat` | Cuerpo JSON: `messages` (lista de `{role, content}`), `region` (opcional), `locale` (opcional) | `text/event-stream` con eventos `text`, `tool`, `chart`, `notice`, `done` y `error` (ver `docs/plan-chat-ia.md`) |

El reloj del fuego y la comparación crudo/corregido se dibujan con `/series`; no necesitan rutas propias.

La API acepta `GET` en las rutas de datos y `POST` únicamente en `/chat`, y responde con CORS. Los orígenes permitidos se fijan con la variable de entorno `CORS_ORIGINS` (separados por comas; por defecto `*`). Los mensajes de error van en inglés. Si `CHAT_ENABLED` no es `1` o falta `ANTHROPIC_API_KEY`, `POST /chat` responde `503`.

## 5. Datos de prueba

Mientras no existan los datos reales, el frontend usa archivos con estas mismas columnas en `web/mock/` (`series.json`, `regions.geojson`, `map-2024-09.json`, `methodology.json`). Al llegar los reales, solo se cambia la dirección de donde se leen.

## 6. Imágenes satelitales (NASA GIBS, desde el navegador)

La vista "Daily satellite image" del mapa no pasa por la API: el navegador pide a NASA GIBS solo el día elegido. No hace falta clave. Identificadores, fechas y niveles confirmados en los GetCapabilities del 2026-11-14; están en `web/src/lib/gibs.js`.

| Uso | Capa | Endpoint y matriz | Formato | Zoom máximo |
|---|---|---|---|---|
| Color real | `VIIRS_SNPP_CorrectedReflectance_TrueColor` (desde 2015-11-24); antes, `MODIS_Aqua_CorrectedReflectance_TrueColor` (desde 2002-07-03) o `MODIS_Terra_CorrectedReflectance_TrueColor` (desde 2000-02-24) | WMTS EPSG:3857, `GoogleMapsCompatible_Level9` | JPEG | 9 |
| Infrarrojo de onda corta | `VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1`; antes, `MODIS_Aqua_CorrectedReflectance_Bands721` o `MODIS_Terra_CorrectedReflectance_Bands721` | WMTS EPSG:3857, `GoogleMapsCompatible_Level9` | JPEG | 9 |
| Detecciones MODIS | `MODIS_Combined_Thermal_Anomalies_All` (desde 2002-07-04); antes, `MODIS_Terra_Thermal_Anomalies_All` (desde 2000-11-01) | WMTS EPSG:4326, matriz `1km`, nivel 5 | MVT (gzip) | — |
| Detecciones VIIRS | `VIIRS_SNPP_Thermal_Anomalies_375m_All` (desde 2012-01-20, con huecos) | WMTS EPSG:4326, matriz `500m`, nivel 5 | MVT (gzip) | — |

- Las capas de anomalías térmicas aparecen en el GetCapabilities EPSG:3857, pero allí responden 404 a cualquier tesela. En EPSG:4326 sí funcionan. La web descarga las teselas de nivel 5 (9° × 9°) que cubren la región elegida, las decodifica y las dibuja como GeoJSON en el mapa web.
- Cada detección trae `SCAN` y `TRACK` (km): de cerca se dibuja como un rectángulo de ese tamaño, que es su huella real. Son las detecciones NRT de FIRMS sin filtrar (día y noche, toda confianza), así que no coinciden con las celdas-día del método.
- Huecos conocidos: S-NPP sin imagen del 2026-11-03 en adelante y sin detecciones del 2024-09-26 al 2024-09-29, entre otros. MODIS deja franjas negras entre órbitas cerca del ecuador. La web lo avisa en vez de pedir teselas que no existen.
