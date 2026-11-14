# Contrato de datos

Este documento fija qué datos se pasan entre las partes del proyecto. Si todos lo respetan, nadie espera a nadie: el frontend trabaja con datos de prueba con estas mismas columnas y luego solo se reemplazan los archivos.

**Regla:** cualquier cambio a este contrato se avisa al equipo y se sube con un commit `docs(data): ...` antes de cambiar el código.

## 1. Parámetros fijos del método

Todos calculan con estos mismos valores. Están pensados para cambiarse en un solo lugar (`scripts/config.py`).

| Parámetro | Valor | Por qué |
|---|---|---|
| País | `Peru` (parámetro del código) | El método es genérico; Perú es la demostración |
| Cuadrícula | celdas de 0,1° (unos 11 km) | Más grande que el píxel de ambos sensores, incluso en el borde de la imagen de MODIS |
| Unidad de actividad | **celda-día**: una celda con al menos una detección en una fecha | Evita contar varias veces el mismo fuego |
| Fecha | `acq_date` en UTC | Es la que entrega FIRMS |
| Tipo de detección | solo `type = 0` (vegetación) | Quita volcanes, industria y minería |
| Confianza MODIS | `confidence >= 30` | Descarta la confianza baja |
| Confianza VIIRS | `confidence` en `n` o `h` | Equivalente: descarta la baja (`l`) |
| Par de calibración | Aqua (MODIS) y S-NPP (VIIRS) | Pasan a una hora parecida, cerca de la 1:30 pm |
| Años de calibración | 2013–2020 | 2012 se excluye porque VIIRS empieza el 20 de enero |
| Años de prueba | 2021–2024 | El método nunca los ve al calibrar |
| Estratos | región × mes | La diferencia entre sensores cambia con ambos |
| Terra | se calibra aparte | En 2000–2002 solo hay Terra, que pasa a otra hora |
| Historia base para "¿es normal?" | 2003–2025 | Años con Aqua completo |

## 2. Identificadores comunes

| Campo | Tipo | Valores |
|---|---|---|
| `region` | texto | `peru`, `amazonia`, `sierra`, `costa`. Los departamentos son opcionales, con el nombre en minúsculas y sin tildes (`ucayali`) |
| `year` | entero | 2000 a 2025 en el alcance actual; 2026 se añadirá solo si llegan los datos solicitados a FIRMS |
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
| `raw_detections` | entero | Suma ingenua de detecciones de todos los sensores. Solo para mostrar el salto falso |
| `estimated` | número | Fuego total estimado por captura y recaptura. **La cifra principal** |
| `est_low`, `est_high` | número | Rango de incertidumbre de `estimated` |
| `modis_equiv` | número | La misma actividad en escala MODIS (pieza 2). Sirve de comprobación |
| `source` | texto | `modis_only`, `both` o `viirs_only`: con qué datos se calculó |
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
  ]
}
```

- `p_modis`, `p_viirs`: fracción del fuego total que ve cada sensor (de 0 a 1).
- `error_pct_method`: error medio en los años de prueba. `error_pct_naive`: el mismo error sin corregir, para comparar.
- `mapbiomas_corr`: qué tan parecida es nuestra serie anual a la de área quemada de MapBiomas (de −1 a 1).

### `map.parquet` — solo lo lee la API

Una fila por celda, año y mes con actividad.

| Campo | Tipo | Qué es |
|---|---|---|
| `lat`, `lon` | número | Centro de la celda |
| `region` | texto | Macrorregión de la celda |
| `year`, `month` | entero | — |
| `raw_terra` | entero | Celdas-día con detección observada por Terra |
| `raw_aqua` | entero | Celdas-día con detección observada por Aqua |
| `raw_modis` | entero | Celdas-día únicos observados por Terra o Aqua |
| `raw_viirs` | entero | Celdas-día únicos observados por S-NPP, NOAA-20 o NOAA-21 |
| `estimated` | número o `null` | Actividad estimada de la celda; `null` hasta que T2 entregue una estimación compatible |
| `size_ratio` | número o `null` | Razón VIIRS/MODIS de la celda (pieza 3, extra) |

`raw_terra` y `raw_aqua` cuentan días únicos por separado. `raw_modis` cuenta la unión de días vistos por Terra o Aqua, sin duplicar una celda-día que ambos sensores hayan visto. `raw_viirs` cuenta la unión de días vistos por S-NPP, NOAA-20 o NOAA-21, sin duplicados entre plataformas. Callao se incluye como unidad departamental en Perú y en la agrupación de Costa.

`region` en `map.parquet` es una de las tres macrorregiones. Cada celda de 0,1° se asigna a la unidad departamental que cubre la mayor parte de su área y luego a su macrorregión.

## 4. API

| Ruta | Parámetros | Devuelve |
|---|---|---|
| `GET /regions` | — | `regions.geojson` |
| `GET /series` | `region` (obligatorio), `from`, `to` (años) | Filas de `series.json` |
| `GET /map` | `year`, `month` (obligatorios), `region` | Lista de celdas: `lat`, `lon`, `raw_terra`, `raw_aqua`, `raw_modis`, `raw_viirs`, `estimated` |
| `GET /methodology` | `region` (opcional) | `methodology.json` |

El reloj del fuego y la comparación crudo/corregido se dibujan con `/series`; no necesitan rutas propias.

## 5. Datos de prueba

Mientras no existan los datos reales, el frontend usa archivos con estas mismas columnas en `web/mock/` (`series.json`, `regions.geojson`, `map-2024-09.json`, `methodology.json`). Al llegar los reales, solo se cambia la dirección de donde se leen.
