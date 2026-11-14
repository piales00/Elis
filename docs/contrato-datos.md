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
| `raw_detections` | entero | Suma ingenua de detecciones de todos los sensores. Solo para mostrar el salto falso |
| `estimated` | número | Fuego total estimado por captura y recaptura. **La cifra principal** |
| `est_low`, `est_high` | número | Rango de incertidumbre de `estimated`, al 90 % |
| `modis_equiv` | número | Celdas-día en escala **MODIS Aqua** (pieza 2). Sirve de comprobación. Ver la regla de abajo |
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

**2026:** la serie llega hasta el 2026-11-13. Desde agosto los datos son NRT y van marcados como `provisional` en `periods`. Del 2026-11-02 al 2026-11-13 no hay S-NPP: `estimated` usa NOAA-20 llevado a escala S-NPP (razón medida en enero–octubre de 2026); `raw_viirs` sigue siendo solo S-NPP. El último mes, si está incompleto, se compara con la misma ventana de días de 2003–2025 en `hist_median` y `anomaly_class`, y no se extrapola. `raw_detections` de 2026 incluye NOAA-20 y NOAA-21, porque es la suma ingenua de todos los sensores.

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
- `emulator`: resultados del emulador MODIS (pieza 2) en los años de prueba. `auc` mide si distingue bien qué celdas ve MODIS y cuáles no (de 0,5 a 1). `brier` es el error de sus probabilidades (cuanto más bajo, mejor). `monthly_error_pct` es el error medio del total mensual frente al Aqua real, y `monthly_error_pct_fixed_ratio` es el mismo error con un factor fijo, para comparar.

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
| `estimated` | número | Parte de la estimación de la región y mes (`series.json`) que le toca a la celda. La suma de las celdas de una región da el `estimated` de la serie |
| `size_ratio` | número o `null` | Razón VIIRS/MODIS de la celda (pieza 3, extra) |

`raw_viirs` cuenta solo S-NPP, igual que en `series.json`, porque es el satélite con el que se calibró el método. Sumar NOAA-20 y NOAA-21 desde 2018 metería un salto falso nuevo: más satélites ven más celdas-día sin que haya más fuego. NOAA-20 y NOAA-21 solo se usan donde falta S-NPP (después del 2026-11-02), con su propia calibración.

`region` es una de las tres macrorregiones. Cada celda de 0,1° se asigna a la unidad departamental que cubre la mayor parte de su área y luego a su macrorregión. Callao cuenta como unidad departamental dentro de Costa.

Lo genera T2 con `scripts/build_map.py`, porque `estimated` necesita la calibración. Antes de 2012 el fuego que MODIS vio queda en sus celdas y el que no vio se reparte con la climatología de VIIRS 2013–2024, así que puede haber celdas con `raw_modis = 0`. En 2026-11 el peso de reparto suma los días de NOAA-20 posteriores al 2026-11-01, así que puede haber celdas con `raw_modis = 0` y `raw_viirs = 0` (fuego visto solo por NOAA-20).

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
