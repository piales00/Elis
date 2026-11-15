# Encargo — Corregir el sesgo de la era Aqua (2002–2011)

Para quien se sume a ayudar con el método de Elis, y para su asistente de IA. Léelo completo junto con `AGENTS.md`, `docs/contrato-datos.md` y la nota `docs/methods/01-harmonization.md`.

**Rama:** `fix/sesgo-era-aqua`, creada desde `main`.
**Qué está en juego:** la afirmación central del proyecto, que el salto falso de 2012 queda corregido.
**Si no sale a tiempo:** no pasa nada; la serie actual sigue publicada. Este cambio solo se fusiona si pasa todas las pruebas.

## 1. El problema

Desde 2012 estimamos el fuego con VIIRS S-NPP: `estimated = n_snpp / p_viirs`. Antes de 2012 solo hay MODIS Aqua, así que estimamos con `estimated = n_aqua / p_aqua`. Las dos probabilidades (`p_aqua`, `p_viirs`) salen de la misma calibración con pasadas simultáneas, en 2013–2020.

En los años de prueba (2021–2024) calculamos el fuego **de las dos maneras a la vez** y comparamos. La versión con Aqua da **sistemáticamente más** que la versión con VIIRS:

| Región | Aqua frente a VIIRS en 2021–2024 |
|---|---|
| Amazonía | entre +5,6 % y +13,8 % según el año |
| Perú (error medio) | 3,5 % |

Consecuencias:

1. **La era Aqua (2002–2011) puede estar algo inflada** frente a la era VIIRS. Entonces el escalón de 2012 no está corregido del todo: queda un pequeño escalón hacia abajo.
2. **Los rangos al 90 % de esa era quedan corridos.** Se construyen con los residuos log(Aqua/VIIRS) de los años de prueba (`scripts/build_series.py`, función `residual_factors`, fuente `aqua_vs_viirs_test`). Como esos residuos no están centrados en cero, en **189 de 1 252 meses** (todos anteriores a 2012) la estimación queda pegada a un borde de su propio rango. Para comprobarlo: en `data/processed/series.json`, las filas observadas con `est_low == estimated` o `est_high == estimated`.
3. Hay además una **fuga de información**: los rangos de 2002–2011 usan los residuos de los años de prueba (2021–2024), que deberían quedar intactos para validar.

## 2. Qué hay que hacer

1. **Medir el sesgo con los años de calibración, no con los de prueba.** Para 2013–2020, por región y mes del año, calcular log(estimado con Aqua / estimado con VIIRS) sobre los días en que los dos sensores están disponibles (respeta `config.OUTAGES` y `config.DEGRADED`; usa la misma máscara que hoy usa la validación). Reportar el sesgo medio por región, su intervalo (bootstrap por años) y si es estable entre años y entre temporada alta y baja.
2. **Decidir la corrección con evidencia, sin mirar 2021–2024:**
   - Si el sesgo es significativo (su intervalo no incluye cero), corregir las estimaciones con Aqua: `estimated_aqua_corr = estimated_aqua × exp(−sesgo)`, con el sesgo por región (o por región y temporada, solo si la diferencia es clara; nada más fino, porque se sobreajusta).
   - Si no es significativo, no corregir, y documentarlo.
   - La misma lógica aplica a Terra (2000-11 a 2002-06), que pasa por el puente Terra→Aqua: comprobar si hereda el sesgo.
3. **Centrar los rangos.** Los residuos estructurales de la era Aqua tienen que salir de 2013–2020 (no de los años de prueba) y estar centrados después de la corrección. Ningún mes debe quedar con la estimación en el borde de su rango, salvo que el rango sea de verdad asimétrico y lo expliques.
4. **Validar fuera de muestra con 2021–2024**, que el paso 1 no tocó: el error de Aqua frente a VIIRS debe bajar (o al menos no subir) en todas las regiones. Reportar antes y después.
5. **Comprobar el escalón de 2012:** comparar la razón `estimated / n_aqua` antes y después de 2012, y la comparación con MapBiomas dentro de cada era Landsat (`data/interim/mapbiomas.parquet`). El salto de 2011 a 2012 en la serie corregida no debe ser mayor que la variación normal entre años.
6. **Regenerar todo lo que depende de la serie**, en este orden: `scripts/build_series.py` → `validate.py` → `build_map.py` → `fetch_power.py` (usa su caché) → `forecast.py` → `forecast_v2.py` → `continuity.py`. Las filas de 2012 en adelante **no deben cambiar** (compáralas con `git show origin/main:data/processed/series.json`).
7. **Actualizar la documentación en inglés:** `docs/methods/01-harmonization.md` y `06-validation.md` con la corrección y los números nuevos, y regenerar el informe PDF (`docs/report/`, ver cómo se generó en su HTML). Si el contrato de datos cambia (por ejemplo, un campo nuevo), editar primero `docs/contrato-datos.md`.

## 3. Prueba adicional (opcional, si sobra tiempo)

**¿La subestimación es igual todos los años?** El simulador (`scripts/experimental/underestimation_sim.py`, resultados en `docs/resultados-subestimacion.md`) estima que la cifra principal cuenta cerca del 89 % del fuego activo. No comprobamos que esa proporción sea estable año a año. Si varía mucho, afecta a las tendencias. La prueba: correr el simulador con las condiciones de cada año (número de fuegos, mezcla de tamaños por FRP, hora de paso de Aqua) y reportar el factor por año con su rango. Solo informar; no corregir la serie.

## 4. Preparación

Los datos crudos e intermedios **no están en GitHub**. Pídeselos al equipo (zip de `data/raw/` e `data/interim/`) y cópialos en esas carpetas.

```bash
git switch main && git pull
git switch -c fix/sesgo-era-aqua
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q        # deben pasar todas antes de empezar
```

## 5. Criterios de aceptación

- `python -m pytest -q` pasa completo, con pruebas nuevas para la corrección y el centrado. No se relaja ninguna prueba existente.
- Las filas observadas de 2012 en adelante de `series.json` no cambian.
- Ningún mes queda con la estimación en el borde de su rango sin explicación.
- El error en 2021–2024 no empeora en ninguna región.
- El sesgo se midió solo con 2013–2020.
- La nota técnica y el PDF reflejan los números nuevos.

## 6. Reglas

- Parámetros científicos en `scripts/config.py`; nombres en inglés en el código; sin comentarios salvo imprescindibles.
- Unidad: *fire cell-days*. Toda cifra con su rango. Pronóstico separado de lo observado.
- Commits en español con Conventional Commits (`fix(metodo): ...`, `data: ...`, `docs: ...`), **sin líneas `Co-Authored-By` ni menciones a IA**. Pull Request a `main` con *squash and merge*.
- No subir `data/raw/`, `data/interim/`, `.venv/` ni `.env`.
- Honestidad: si la corrección no mejora la validación, se informa y no se aplica.

## 7. Entregable

Un Pull Request con: el código, los datos regenerados, la nota técnica actualizada, el PDF y una tabla en la descripción con el sesgo medido (por región, con intervalo), el error de validación antes y después, el número de meses con la estimación en el borde antes y después, y el salto 2011→2012 antes y después.
