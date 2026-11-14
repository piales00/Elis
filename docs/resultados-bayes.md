# Resultados del modelo de tres listas (Aqua, S-NPP, NOAA-20)

Análisis de robustez de la cifra principal. Período 2018-04-01 a 2022-12-31, unidad: celda-día (0,1°, una fecha) con al menos una detección. Se excluyeron 72 días con interrupción de algún satélite (`config.OUTAGES`/`DEGRADED` más huecos de VIIRS detectados en los datos; lista en `bayes_diagnostics.json`).

## Qué se ajustó

- **Datos:** `scripts/experimental/cells_three.py` crea las celdas-día de NOAA-20 2018–2025 con las mismas funciones y filtros de `cells.py` (confianza, `type = 0`, rejilla y regiones). En el tramo SP de 2026 que comparten, coincide fila por fila con `cells.parquet` (7 295 celdas-día, ninguna diferencia).
- **Modelo** (`scripts/experimental/bayes_model.py`, NumPyro NUTS, 4 cadenas × 1000 iteraciones + 1000 de calentamiento, semilla 42): cada conteo de historia es Poisson con media `N × P(historia)`, y P sale de un modelo log-lineal con efectos principales por satélite y términos por pares. Los efectos principales son jerárquicos (región × mes del año más una desviación por año). La dependencia por pares es jerárquica por región; una variante la deja variar además entre estación seca (julio a noviembre) y húmeda. No hay interacción triple: es el supuesto que identifica N.
- **Comparadores, en los mismos días:** Chapman directo Aqua/S-NPP; "principal equivalente" = `n_snpp / p_viirs` con las `p` de `detection_probs.parquet` (la regla de `capture_recapture.py`); y `estimated` de `estimates.parquet` en los mismos meses completos.
- **Sensibilidad** (`scripts/experimental/bayes_sensitivity.py`): máxima verosimilitud del modelo saturado (forma cerrada) y bootstrap paramétrico.

## Las siete historias (A = Aqua, S = S-NPP, N = NOAA-20)

| Región | Solo A | Solo S | Solo N | A+S | A+N | S+N | A+S+N | Observadas |
|---|---|---|---|---|---|---|---|---|
| Amazonía | 3 069 | 43 850 | 46 175 | 3 631 | 3 697 | 25 782 | 9 553 | 135 757 |
| Sierra | 2 152 | 36 399 | 37 915 | 2 727 | 2 802 | 20 506 | 7 094 | 109 595 |
| Costa | 538 | 12 356 | 13 154 | 515 | 447 | 3 992 | 655 | 31 657 |

## Resultado principal

| Perú, 2018-04 a 2022-12 | Celdas-día | Veces el principal equivalente |
|---|---|---|
| Vistas por S-NPP | 167 060 | 0,78 |
| Principal equivalente (`n_snpp/p_viirs`) | 214 445 | 1 |
| `estimated` de series (mismos meses, todos los días) | 226 018 | 1,05 |
| Chapman Aqua/S-NPP (todos los días) | 270 331 | 1,26 |
| Tres listas, independencia | 428 979 [426 000–431 000] | 2,00 [1,99–2,01] |
| Tres listas, con dependencia | 661 947 [647 216–677 665] | 3,09 [3,02–3,16] |
| Tres listas, dependencia por estación | 638 941 | 2,98 [2,91–3,05] |

Intervalos al 90 %. Por año la razón es estable (2,9–3,3), y por región va de 2,9–3,0 en Amazonía y Sierra a 3,8 en la Costa.

**Dependencia estimada (log de la razón de momios, intervalo al 90 %):**

| Región | Aqua–S-NPP | Aqua–NOAA-20 | S-NPP–NOAA-20 |
|---|---|---|---|
| Amazonía | 1,40 [1,37–1,44] | 1,36 [1,32–1,39] | 0,63 [0,58–0,68] |
| Sierra | 1,44 [1,40–1,48] | 1,41 [1,37–1,45] | 0,57 [0,51–0,63] |
| Costa | 1,54 [1,46–1,63] | 1,36 [1,28–1,44] | 0,46 [0,34–0,56] |

Las tres son positivas y lejos de cero. Un satélite que ve una celda-día hace mucho más probable que otro también la vea (razón de momios ≈ 4 entre MODIS y VIIRS). Por eso los métodos que suponen independencia subestiman. La dependencia S-NPP–NOAA-20 casi desaparece en la estación húmeda (0,10–0,33) y es 0,45–0,75 en la seca.

## Cómo leerlo: confirma la dirección, no la magnitud

1. **La subestimación por dependencia es real:** todas las dependencias por pares son positivas y la independencia queda descartada (predictivo de historias: 57 % de cobertura frente a 93 % del modelo con pares).
2. **La magnitud (×3) no es creíble como corrección de la cifra principal.** NOAA-20 pasa unos 50 minutos después de S-NPP; ningún día de 2018–2022 coinciden con menos de 20 minutos. El fuego que nace o se apaga en ese intervalo aparece como "visto por uno solo" y el modelo lo cuenta como fuego que se habría podido no ver. Así, estas tres listas estiman las celdas-día con fuego en *algún momento* de una ventana de ~1 h, no la foto a la hora de paso que define la cifra principal.
   - En la simulación con cambio de fuego entre pasadas (`turnover_synthetic`), el modelo con pares sobreestima la población de la primera hora en +10 % con persistencia total, +39 % con 0,8 y +58 % con 0,6. En la misma simulación, Chapman de dos listas simultáneas subestima en −21 %.
   - Restringido a los días en que Aqua y S-NPP pasan juntos (menos de 20 min), Chapman da 1,03 × el principal equivalente (coincide con el método principal) y el modelo de tres listas sigue en 3,0×. Ese día lo único asíncrono es NOAA-20, y es lo que eleva el total.
3. **Heterogeneidad.** En la simulación con dos clases de fuego (grande o pequeño), el modelo con pares subestima un 8 % y el de independencia un 31 %. El modelo con pares absorbe la mayor parte de la heterogeneidad, pero no toda.

**Conclusión:** la cifra principal casi seguro subestima el fuego activo a la hora de paso, porque los satélites no son independientes. Con estos datos la cantidad no se puede fijar. La cota superior que dan tres listas (×3) está inflada por la diferencia de hora de NOAA-20, y las simulaciones con parámetros parecidos a los reales sugieren una subestimación de Chapman del orden del 20–30 %, sin medición directa.

## Persistencia S-NPP / NOAA-20

Mismo instrumento, ~50 minutos de diferencia (2018–2022, pasadas diurnas):

- De lo que ve S-NPP, NOAA-20 ve el 39,6 %; al revés, el 38,5 % (Sørensen 0,39). De noche, 0,41. Estable por año (0,38–0,41).
- Depende mucho del tamaño. Con PRF de S-NPP menor que 5 MW, NOAA-20 la ve en el 26 %; entre 5 y 20 MW, en el 44 %; por encima de 20 MW, en el 64 %.
- Con lo que ve Aqua, a igual diferencia de hora, S-NPP y NOAA-20 coinciden igual (S-NPP: 0,77 con menos de 20 min, 0,58 con 20–40, 0,53 con 40–60; NOAA-20: 0,72, 0,60 y 0,53). **Lo que importa es la hora de paso, no el satélite.** Es la misma lectura del hallazgo 79 % frente a 57 %.
- **Lectura:** a una escala de ~50 minutos, la mayoría de las celdas-día con fuego pequeño que ve VIIRS no se ve en la pasada siguiente. Los fuegos de más de 20 MW persisten mucho más. El fuego pequeño es intermitente a la escala de la hora de paso. Por eso definir la cifra principal como "fuego a la hora de paso" es necesario y no un detalle.

## Sensibilidad

| Variante | Con dependencia / principal | Independencia / principal | Chapman A/S / principal |
|---|---|---|---|
| Región (todo el período junto) | 3,01 [2,94–3,09] | 1,86 | 1,20 |
| Región × mes (años juntos) | 3,05 | 1,99 | 1,25 |
| Región × frecuencia histórica de fuego de la celda (2013–2017) | 3,13 | 1,89 | 1,21 |
| Región × clase de PRF | 1,95 | 2,50 | 1,28 |
| Solo días simultáneos Aqua/S-NPP | 3,04 | 1,61 | 1,03 |
| Días no simultáneos | 3,59 | 2,00 | 1,46 |
| Solo detecciones diurnas | 3,05 | 1,98 | 1,27 |
| 2023–2025 (Aqua con deriva) | 3,67 | 1,77 | 1,40 |

- **Frecuencia histórica de la celda:** es una covariable limpia, conocida también para las celdas no vistas. No cambia la conclusión.
- **Clase de PRF:** no sirve para estratificar. La clase sale del PRF máximo de los satélites que vieron la celda, así que una celda vista por dos cae más arriba que vista por uno. Eso produce la dependencia S-NPP–NOAA-20 fuertemente negativa en la clase de menos de 5 MW (−3) y positiva en la de más de 20 MW (+1,8). Se reporta, pero no se usa.
- **2023–2025:** con la deriva de Aqua, Chapman Aqua/S-NPP sube a 1,40 (se separan las horas de paso). Además, la dependencia S-NPP–NOAA-20 salta a 1,6–2,0 en 2024–2025 sin explicación clara (¿más huecos de S-NPP, cambios de procesamiento?). Por eso el núcleo del análisis se queda en 2018–2022.
- Los totales estratificados finos (región × año × mes) dejan fuera de 13 a 73 estratos con algún conteo cero. Los intervalos de esas filas son aproximados.

## Diagnósticos y criterios de aceptación

| Criterio | Estado |
|---|---|
| R-hat < 1,01 en los parámetros principales | **Cumple** (máximo 1,008; tamaño efectivo mínimo 536; 0 divergencias en los ajustes reales) |
| Comprobación predictiva | **Cumple a medias.** Reproduce los conteos por satélite (100 % de estratos dentro del 90 %) y el 93–94 % de las historias. El test global de Freeman-Tukey da p ≈ 0 en todas las variantes: queda falta de ajuste fina con conteos de decenas de miles |
| Prueba con años reservados (sin S-NPP 2021–2022) | **Cumple.** 100 % de los meses dentro del 90 % (intervalos de ±10 %); por año, 5 de 6 región-años cubiertos (Amazonía 2022: −8 %, justo fuera) |
| Rango de 2000–2011 más ancho que el de 2013–2020 | **No evaluado:** no se extendió a 2000–2025 |
| Comparación con `estimates.parquet` reportada tal cual | **Cumple** |
| Validación sintética | Con independencia: los dos modelos recuperan N (−0,3 % y −1,1 %). Con dependencia log-lineal: el de pares recupera (+0,2 %); el de independencia falla (−34 %). Con heterogeneidad: el de pares −7,8 % (no cubre) y el de independencia −31 % |

## Límites y decisiones

- No hay interacción triple: supuesto no comprobable con tres listas.
- La asincronía de NOAA-20 se confunde con la dependencia y con la detección; es el límite principal. Una cuarta lista simultánea con S-NPP (NOAA-21, desde 2023) o GOES ayudaría.
- Huecos de VIIRS detectados con una regla propia (constantes en `three_lists.py`): ninguna detección con al menos 5 del otro VIIRS, o menos del 20 % del otro con al menos 20.
- No se extendió a 2000–2025: con la magnitud sin resolver en 2018–2022, extenderla a años sin VIIRS solo propagaría una cifra no validada.
- Salidas: `data/interim/bayes_estimates.parquet` (región, año, mes y `peru`, 2018-04 a 2022-12), `bayes_histories.parquet`, `bayes_diagnostics.json`, `bayes_sensitivity.json` y los registros `bayes_run.log` y `bayes_sensitivity.log`.
