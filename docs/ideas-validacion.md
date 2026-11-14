# Ideas de validación — demostrar que el modelo funciona

Ideas para después del MVP, guardadas el 2026-11-14. El criterio común: poner el modelo a prueba en algo que **no puede haber visto ni ajustado**. Ninguna está empezada.

## Resumen

| # | Idea | Qué prueba | Impacto en el pitch | Recomendación |
|---|---|---|---|---|
| 1 | Buscar los fuegos que nadie vio con Sentinel-2 | Que la idea central es real | El más alto | **Hacer** |
| 2 | Predicciones diarias selladas con hash | Que el modelo predice, no solo ajusta | Alto, verificable en vivo | Si hay quien la mantenga cada día |
| 3 | Túnel de viento: un Perú simulado | Que el flujo recupera la verdad | Alto ante jurado técnico | **Hacer** |
| 4 | GOES-16 como cuarto ojo | El mecanismo de la hora de paso | Medio | Trabajo futuro |
| 5 | Probar en Bolivia o Brasil | Que el método es transferible | Medio | Trabajo futuro |

## 1. Ir a buscar los fuegos que nadie vio

**Qué dice el modelo:** cerca del 20 % del fuego activo no lo ve ningún satélite (Chapman con pasadas simultáneas: N ≈ 1,25 × S-NPP). Hoy es una deducción estadística.

**Cómo se prueba:**
1. Se eligen al azar celdas-día de temporada (julio a octubre) donde ni MODIS ni VIIRS detectaron nada, pero que están en zonas con fuego frecuente (climatología VIIRS 2013–2024). Como control, se eligen también celdas-día donde sí hubo detección.
2. Para cada una se buscan imágenes **Sentinel-2 L2A** (10 m, cada 5 días) en Microsoft Planetary Computer (STAC público, sin cuenta), antes y después de la fecha.
3. Se calcula el dNBR (diferencia del índice normalizado de área quemada) y se marca una cicatriz nueva si supera un umbral estándar, con máscara de nubes.
4. Una IA de visión revisa los casos dudosos y una muestra se revisa a mano para medir su error.
5. Se compara la fracción de celdas "invisibles" con cicatriz nueva contra lo que predice Chapman.

**Resultado posible:**
- Si coincide: la idea central queda probada con evidencia física.
- Si hay más cicatrices de las previstas: mide cuánto subestima Chapman (hoy solo suponemos un −29 % por simulación).

**Límites:** Sentinel-2 empieza en 2015 (completo desde 2017); las nubes de la Amazonía reducen la muestra; una cicatriz puede venir de un fuego de otro día dentro del intervalo entre imágenes.

**Frase del pitch:**
> "Our model predicted that 1 in 5 fires is invisible to both satellites. So we went looking for them with 10-meter imagery — and found them."

## 2. Predicciones públicas con sello de tiempo

**Cómo funciona:**
1. Cada día, con el VIIRS NRT del día, el emulador predice cuántas celdas-día debería ver MODIS Aqua por región.
2. La predicción se publica **antes** de que lleguen los datos de Aqua, con su hash SHA-256 en un commit de GitHub.
3. Al día siguiente se compara con lo que vio Aqua y un marcador en la web acumula los aciertos.

**Qué prueba:** que el modelo predice datos que todavía no existen. Nadie puede ajustar la predicción después.

**Requisito:** un proceso que corra cada día (GitHub Actions con la `MAP_KEY` de FIRMS como secreto) durante la evaluación.

## 3. Túnel de viento: un Perú simulado con el fuego conocido

**Cómo funciona:**
1. Se simula un Perú con fuegos de tamaño, duración, horario y ubicación realistas, calibrados con lo observado. Ahí **conocemos la verdad**.
2. Se simula qué detectaría cada satélite: tamaño de píxel, ángulo de visión, hora de paso, nubes, deriva de Aqua desde 2023 e interrupciones.
3. Se corre **todo el flujo** (`cells.py` → `capture_recapture.py` → `build_series.py`) sobre esos datos.
4. Se mide si recupera el fuego real.

**Preguntas que responde:**
- Cuánto subestima Chapman cuando los fuegos grandes los ven todos.
- Si la calibración con pasadas simultáneas corrige el efecto de la hora.
- Si el rango al 90 % cubre la verdad el 90 % de las veces.
- Qué pasa con la deriva de Aqua.

**Frase del pitch:**
> "We built a synthetic Peru where we know every fire, and our pipeline recovers it within X%."

## 4. Un cuarto ojo que no duerme: GOES-16

- GOES-East mira Perú cada 10 minutos; su producto de fuego (ABI FDC) es abierto en AWS (NOAA Open Data).
- Ve el ciclo diario completo: cuándo empieza un fuego, cuánto dura y si sigue encendido a la hora de Aqua o de S-NPP.
- Mide directamente la persistencia del fuego que hoy deducimos de la diferencia de hora entre pasadas.
- Límite: píxel de 2 km, ve solo fuegos grandes.

## 5. Probarlo fuera de Perú

- Se aplica la calibración de Perú a Bolivia o Brasil sin reajustar, y se compara con referencias independientes (INPE, MapBiomas Brasil).
- Si funciona, el método es transferible, lo que pesa en el criterio de impacto.

## Relación con otras piezas

- El **modelo bayesiano** (`docs/plan-experimental.md`) mide la dependencia entre satélites con tres listas. La idea 1 la mide con evidencia física. Si las dos coinciden, la subestimación queda cuantificada por dos caminos.
- La idea 3 sirve para comprobar el modelo bayesiano antes de usarlo con datos reales.
