# Reparto del equipo

Somos tres personas y 36 horas. Cada quien trabaja en su rama y todos respetan el [contrato de datos](contrato-datos.md). Las reglas de commits están en [GIT.md](../GIT.md).

## Las 6 tareas

| # | Tarea | Entrega | Rama |
|---|---|---|---|
| T1 | **Datos y regiones** | `regions.geojson` con macrorregiones y departamentos; Terra y Aqua separados; datos de 2026 (VIIRS NOAA-20/21); `map.parquet` | `feat/datos` |
| T2 | **Metodología** | Captura y recaptura por región y mes, equivalente MODIS, validación con años de prueba, comparación con MapBiomas; `series.json` y `methodology.json` | `feat/metodo` |
| T3 | **API** | FastAPI con `/regions`, `/series`, `/map` y `/methodology` | `feat/api` |
| T4 | **Web: historia y mapa** | Página base, "el récord falso" y mapa con barra de tiempo 2000–2026 | `feat/web-mapa` |
| T5 | **Web: reloj y explicaciones** | El reloj del fuego, "¿este año es normal?" y "cómo lo calculamos" | `feat/web-reloj` |
| T6 | **Pitch y entrega** | Guion, diapositivas, video, formulario de Space Apps y app publicada | `docs/pitch` |

## Quién hace qué

| Persona | Herramientas | Tareas |
|---|---|---|
| **A** | Claude + Codex | **T2**, luego **T6** |
| **B** | Claude | **T4** y **T5** |
| **C** | Codex | **T1**, luego **T3** |

- **A** lleva lo más pesado y es responsable de la metodología ante el jurado.
- **B** tiene en el repo las skills de diseño (`emil-design-eng`, `impeccable`, `animate`, `maplibre-cartography`).
- **C** empieza por `regions.geojson`, porque lo necesitan T2 y el mapa.

Si se suma una cuarta persona, toma T6. Una quinta toma el pronóstico de temporada (pieza 4).

## Puntos de control

| Hora | Qué debe existir |
|---|---|
| H1 | Contrato de datos leído por todos; cada quien en su rama; datos de prueba en `web/mock/` |
| H6 | T1: `regions.geojson`. T2: primera captura y recaptura. Web: página con datos de prueba |
| H12 | T2: validación lista y `series.json` real. T3: API respondiendo. Web: récord falso y mapa |
| H20 | **Todo conectado con datos reales, aunque se vea feo** |
| H28 | Pulido visual y "cómo lo calculamos"; empieza el guion |
| H33 | Se congela el código: solo video, pitch y envío |

## Reglas de trabajo

0. **Todo lo que ve la NASA va en inglés:** la app, la API, el README, las diapositivas, el video y el formulario. Solo los documentos internos y los commits quedan en español.

1. **H20 manda:** una demo fea que funciona vale más que una bonita a medias.
2. **Nadie espera a nadie:** si te falta un dato, usa el de prueba y sigue.
3. **Pull Requests pequeños** y mezclados seguido, para no acumular conflictos.
4. **Los extras** (pronóstico, "lo que nadie vio", mapa de tamaño, audio) solo se empiezan después de H20.
5. **Si el método principal falla** en la validación, se usa el plan B: toda la serie en escala MODIS (`modis_equiv`).

## Primer paso de cada persona

- **A:** ejecutar `scripts/recaptura.py`, revisar los resultados y separar Terra de Aqua.
- **B:** crear `web/` con los datos de prueba del contrato y dibujar el primer reloj del fuego.
- **C:** descargar los datos (ver README), conseguir los límites de departamentos y generar `regions.geojson`.
