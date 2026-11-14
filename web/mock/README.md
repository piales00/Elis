# Datos de prueba (web/mock)

**MOCK DATA — NOT REAL.** Todos los números de esta carpeta son inventados para probar la interfaz. No representan fuego real en Perú.

Los cuatro archivos siguen exactamente las columnas del [contrato de datos](../../docs/contrato-datos.md), sin campos adicionales. El aviso de "dato ficticio" vive en la interfaz (insignia fija mientras `DATA_SOURCE === "mock"` en `js/config.js`).

## Qué contiene cada archivo

| Archivo | Contenido |
|---|---|
| `series.json` | 84 filas: `peru`, `amazonia`, `sierra` y `costa` en julio–septiembre de 2005, 2011, 2012 y 2024; enero–julio de 2026 observados; agosto–septiembre de 2026 como pronóstico de prueba. Octubre–diciembre de 2026 **no existen** (sin observaciones, no son pronóstico) |
| `regions.geojson` | 4 rectángulos toscos, sin relación con los límites reales |
| `map-2024-09.json` | 85 celdas de 0,1° con `lat`, `lon`, `raw_modis`, `raw_viirs`, `estimated` |
| `methodology.json` | `params` del contrato; detección de agosto y septiembre por región; validación por región |

## Valores que existen solo para probar la interfaz

Ninguno sale de una fórmula científica del proyecto; se fijaron a mano o con reglas arbitrarias de generación.

- `anomaly_class`: asignada por año y región, sin umbrales reales. La regla real la define T2.
- `modis_equiv`: casi igual a `raw_modis`; no es el equivalente MODIS real.
- `raw_detections`: crece de forma arbitraria desde 2012 solo para ver un salto falso.
- `est_low` y `est_high`: 0,85 y 1,2 veces `estimated`, solo para tener un rango válido.
- `hist_median`: perfil estacional inventado.
- Filas con `is_forecast: true` (agosto–septiembre de 2026): prueban la separación entre observado y pronóstico. El contrato no define cómo se rellenan `raw_modis`, `raw_viirs` y `raw_detections` en un mes pronosticado; el mock usa `0`, `null` y `0`.
- `source` en filas pronosticadas: `both`, sin respaldo en el contrato.
- `peru` es la suma de las tres macrorregiones en cada campo numérico.
- `methodology.json`: `p_modis` y `p_viirs` son cocientes de los conteos del mismo archivo, solo para que cuadren entre sí.

## Cuidados

- `GET /map` no devuelve `region` por celda. En modo mock, `data.js` filtra por región con los polígonos de `regions.geojson`; con la API real el filtro lo hace el servidor.
- `getMap` solo tiene datos para 2024-09 y falla con un error visible para cualquier otro mes. No hay respaldo silencioso a mocks cuando `DATA_SOURCE` es `"api"`.
