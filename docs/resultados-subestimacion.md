# Resultados: ¿cuánto subestima la cifra principal?

Rama `feat/subestimacion`. Código: `scripts/experimental/underestimation*.py`. Resultados crudos (no se suben): `data/interim/underestimation_*.json(l)`.

## 1. Qué se quería medir

La cifra principal es el estimador de Chapman con MODIS (Aqua) y VIIRS (S-NPP) cuando pasan casi a la vez. Supone que los dos sensores son independientes. Si el fuego que uno no ve también tiende a escapar al otro (fuegos pequeños o poco intensos), Chapman da menos que lo real. Queríamos saber **cuánto** y si algún otro método lo corrige con fiabilidad.

Como la verdad no se observa, se construyó un simulador de celdas-día con fuego (intensidad latente, detección distinta por sensor, vida corta del fuego, parpadeo) y se midió el error de cada estimador contra la verdad simulada.

## 2. El simulador frente a los hechos observados

Calibrado con datos reales 2013–2020 (`best_fit`). El parámetro τ_S se fija en 0,4.

| Hecho observado | Real | Simulador |
|---|---|---|
| P(S-NPP ve \| Aqua ve), pasadas a menos de 20 min | 0,796 | 0,795 |
| Ídem, 20–40 min | 0,569 | 0,614 |
| Ídem, 40–60 min | 0,538 | 0,513 |
| P(Aqua ve \| S-NPP ve) | 0,172 | 0,171 |
| Persistencia S-NPP a NOAA-20, FRP baja / media / alta | 26 / 44 / 64 % | 26 / 45 / 62 % |
| Chapman simultáneo / S-NPP | 1,256 | 1,257 |

El ajuste converge (pérdida 55). Cuatro mundos alternativos (heterogeneidad baja/alta, parpadeo bajo/alto) se ajustan mucho peor (pérdida 970–1540, casi 20 a 30 veces más) y no se consideran razonables; sirven solo para ver cómo cambia el resultado si el mundo fuera otro.

## 3. El examen de los estimadores

Aprobar = |sesgo| < 10 % y cobertura del intervalo ≥ 80 % en todos los escenarios, con al menos 20 réplicas por escenario. Sesgo = media de N/verdad − 1. Cobertura = fracción de réplicas cuyo intervalo contiene la verdad. Réplicas por escenario (best / het.baja-parp.alto / het.baja-parp.bajo / het.alta-parp.alto / het.alta-parp.bajo): 25 / 22 / 20 / 19 / 4 (B_detection_persistence: 25 en todos).

Escenario `best_fit` (el único que reproduce los hechos):

| Estimador | Réplicas | Sesgo | Cobertura | Fallos / no converge |
|---|---|---|---|---|
| main (cifra principal) | 25 | −11,2 % | 0 % | 0 / 0 |
| A1 Huggins | 25 | −9,2 % | 0 % | 0 / 0 |
| A2 intensidad latente | 25 | +52,7 % | 0 % | 0 / 3 |
| B detección+persistencia | 25 | +3,6 % | 52 % | 0 / 0 |
| B solo días simultáneos | 25 | +1,2 % | 92 % | 0 / 0 |
| C clase latente | 25 | +306 % | 0 % | 1 / 0 |
| LL3 tres listas | 25 | +227 % | 0 % | 0 / 0 |

Peor caso entre los cinco escenarios:

| Estimador | Peor sesgo | Peor cobertura | Aprueba |
|---|---|---|---|
| main | −39 % | 0 % | no |
| A1 Huggins | −38 % | 0 % | no |
| A2 | hasta +445 000 % (diverge) | 0 % | no |
| B detección+persistencia | +5,6 % | 8 % | no |
| B solo simultáneos | +2,4 % | 68 % | no (cobertura; además incompleto) |
| C | hasta +715 % | 0 % | no |
| LL3 | hasta +583 % | 0 % | no |

**El examen está incompleto.** El JSONL tiene 215 filas. B_detection_persistence corrió aparte y está completo (25 por escenario). Los demás estimadores quedaron a medias: 25, 22, 20 y 19 réplicas en cuatro escenarios (el de 19 queda bajo el mínimo de 20) y solo 4 en `heterogeneity_high_flicker_low`. Dos escenarios quedan bajo el mínimo de 20 réplicas, así que ningún estimador puede aprobar formalmente. Eso no cambia la conclusión: los estimadores fallan también en escenarios completos. El resumen está en `data/interim/underestimation_exam.json`.

## 4. Conclusión

**Cuánto subestima.** En el mundo simulado que reproduce los hechos, la cifra principal queda ~11 % por debajo de la verdad (N/verdad = 0,89; el factor verdadero es 1,13, rango de réplicas 1,10–1,18). Su intervalo no cubre la verdad en ninguna réplica (0 de 25). En mundos que reproducen peor los hechos el factor va de 0,91 a 1,65, es decir, depende mucho de supuestos que los datos no fijan (heterogeneidad y parpadeo). La certeza es moderada: el orden de magnitud (10–15 %) sale del mejor ajuste, pero no hay un intervalo fiable.

**Por qué no se publica un factor.** Ningún estimador alternativo pasa el examen. El único cercano, B con días simultáneos (sesgo ≤ 2,4 %), no alcanza el 80 % de cobertura en un escenario, no se completó y sale de un modelo que no se validó contra datos reales. Aplicar a la serie un factor que no pasó el examen sería una cifra sin respaldo. Se mantiene la cifra principal como **cota inferior** (lower bound).

## 5. Efecto sobre las tendencias

Si el factor fuera aproximadamente constante entre años, las tendencias y los cocientes entre periodos no cambiarían, solo el nivel. **No se comprobó la estabilidad por año**: `underestimation.py` solo la calcula para estimadores que aprueban, y ninguno aprobó. Los mundos alternativos sugieren que el factor depende de la heterogeneidad del fuego (0,91 a 1,65), y esta puede variar con la temporada y la región, de modo que no se puede afirmar que sea constante.

## 6. Límites y supuestos

- τ_S (dispersión de S-NPP alrededor de la intensidad latente) está fijado en 0,4, no estimado; los hechos observados no lo identifican por separado.
- Las nubes y el humo que tapan a ambos sensores a la vez no se pueden ver con captura y recaptura y no están modeladas a fondo; la verdad simulada solo cuenta fuego detectable por alguno.
- Solo se usa la pasada diurna; el fuego nocturno queda fuera del simulador.
- Los escenarios alternativos se ajustan mal; no deben leerse como incertidumbre calibrada.
- El examen quedó incompleto (sección 3) y se resumió sin volver a correrlo.
- La unidad sigue siendo celdas-día con fuego, no incendios ni hectáreas.

## 7. Recomendación de presentación

- En la app y en el pitch, la cifra principal se presenta como **lower bound**, con su rango, sin factor de corrección.
- Se puede decir la cifra simulada solo como contexto, nunca como corrección aplicada.

Frase para el pitch (respaldada por el 0,89 y el factor 1,13 del mejor ajuste; el límite superior ronda 15–18 % en las réplicas, por eso se dice "roughly"):

> Our simulator suggests the harmonized record undercounts active fire by roughly 10–15%, but no method passed our tests well enough to publish a correction, so we report it as a lower bound.
