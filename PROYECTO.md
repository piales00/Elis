# FireChronos Perú — Definición del proyecto

> Equipo Log N + 1 · NASA Space Apps 2026 · Reto "Harmonization of MODIS and VIIRS Hot Spots" · Actualizado 2026-11-14

## 1. La solución en dos líneas

**Contamos el fuego de Perú como los biólogos cuentan peces: usando dos satélites que ven distinto, estimamos cuánto fuego hubo realmente en 26 años, incluido el que ninguno vio.**
**Lo comprobamos con un segundo método y convertimos la diferencia entre satélites en un mapa del tipo de fuego de cada región.**

Frase de posicionamiento: *"Reconstruimos un calendario comparable del fuego en Perú, estimando cuánto puede faltar y mostrando cuánta duda queda."*

## 2. El problema

Dos satélites miden el fuego, pero ven distinto:

- **MODIS (viejo, desde 2000):** píxeles de 1 km; solo ve fuegos grandes. Sigue funcionando, pero sus satélites ya superaron con creces su vida útil prevista.
- **VIIRS (nuevo, desde 2012):** píxeles de 375 m; ve también fuegos pequeños.

Si se juntan sin corregir, el fuego en Perú **se multiplica por 9 entre 2011 y 2012**. Es falso: cambió la herramienta de medición, no el fuego. Con esos datos, Serfor, Indeci, los gobiernos regionales y los periodistas sacan conclusiones equivocadas.

**En una frase:** hoy nadie puede comparar honestamente un año con otro, porque el instrumento cambió a mitad de la historia.

**Alcance:** el histórico es de **Perú**, validado a fondo. El método es genérico: el código recibe el país como parámetro, porque FIRMS publica CSV anuales iguales para todos los países.

## 3. La solución: tres piezas

### Pieza 1 — Contar el fuego como peces (el corazón, original)
En los años en que funcionaron los dos satélites (2012–2024) vemos qué fuegos vio solo MODIS, cuáles solo VIIRS y cuáles los dos. Con el método de **captura y recaptura** (estimador de Chapman) estimamos el fuego total, incluido el que ninguno vio, separado por **región y mes**.

De ahí sale qué porcentaje del fuego ve cada satélite. Así cada periodo se lleva a la misma unidad:

| Periodo | Datos disponibles | Cálculo |
|---|---|---|
| 2000–2011 | Solo MODIS | MODIS ÷ "% que ve MODIS" |
| 2012–2024 | MODIS + VIIRS | Fórmula de captura y recaptura |
| 2025 en adelante | VIIRS (y MODIS mientras funcione) | VIIRS ÷ "% que ve VIIRS" |

**Unidad de todas las gráficas:** *cuadros-día con fuego estimados* (cuadros de unos 11 km). No son "incendios" ni "hectáreas".

### Pieza 2 — Equivalente MODIS (la base verificable)
Se agrupan las detecciones de VIIRS en la escala de MODIS para responder "¿qué habría visto MODIS?". Luego se compara con el MODIS real en años de prueba.
- Sirve para **verificar** la pieza 1: si los dos métodos cuentan la misma historia, el resultado es confiable.
- Sirve como **plan B** si la pieza 1 resulta inestable.
- Tiene un antecedente publicado muy cercano (Zheng et al., 2026), que **citamos como respaldo**.
- Es una aproximación estadística, no una simulación física del sensor.

### Pieza 3 — El desacuerdo como sensor (experimental)
Donde VIIRS ve mucho más que MODIS, los fuegos son pequeños (chacras, caña, pastizales). Donde ven casi lo mismo, son grandes (bosque). Con eso se arma un **mapa del tamaño típico del fuego**. Se presenta como **hipótesis en prueba**, validada contra MapBiomas.

### Pieza 4 — "¿Cómo viene la temporada?" (solo si alcanza el tiempo)
Es un pronóstico de temporada por región, construido **sobre la serie corregida**: *"con el fuego acumulado hasta julio y la lluvia de este año, ¿septiembre será normal, alto o muy alto?"*

- **Entradas:** el fuego acumulado de los primeros meses (corregido) y la lluvia mensual de NASA POWER (gratis y sin clave).
- **Modelo:** simple (comparación con años parecidos o una regresión sencilla), porque hay unas 25 temporadas por región.
- **Salida:** una categoría (normal, alto o muy alto) con un rango, nunca una cifra exacta.
- **Prueba (backtesting):** se "predicen" temporadas pasadas como si no se conocieran y se informa el acierto real, aunque sea modesto.
- **Demo clave:** el mismo modelo entrenado con datos crudos predice un crecimiento falso (aprende el salto de 2012). Entrenado con datos corregidos, da una temporada realista. Frase del pitch: *"Sin armonizar, hasta la IA se equivoca."*
- **En la app:** el anillo exterior del reloj del fuego se completa con una línea punteada etiquetada "pronóstico", siempre separada de lo observado.
- **Condición:** se construye **solo después** de que las piezas 1 y 2 funcionen. Si falta tiempo, se hace únicamente la demo "crudo frente a corregido".

## 4. Evidencia que ya tenemos (datos reales de FIRMS, Perú)

Datos: MODIS 2000–2025 y VIIRS S-NPP 2012–2025, unos 1,4 millones de detecciones. Scripts en `scripts/`.
Filtros: solo vegetación (`type = 0`); MODIS con confianza ≥ 30; VIIRS con confianza `n` o `h`. Las zonas son rectángulos aproximados, todavía no límites oficiales.

1. **El salto falso:** la suma ingenua pasa de 10.375 detecciones (2011) a 92.807 (2012).
2. **El récord cambia según cómo se mida:** con Aqua (un sensor constante), los meses con más fuego son agosto de 2005 y agosto de 2010, años de sequía. Septiembre de 2024 queda tercero.
3. **VIIRS ve más que MODIS, pero cuánto depende de la región:** Amazonía 3,6 veces, sierra sur 4,1 (inestable), costa norte con caña 6,2.
4. **El calendario depende del sensor:** en Ucayali, septiembre concentra el 43 % del año según MODIS y el 33 % según VIIRS.
5. **Se confirma el calendario agrícola:** Amazonía con pico en agosto–septiembre; sierra de agosto a octubre; costa norte pareja todo el año.
6. **Detección según tamaño:** si VIIRS ve 1 punto en un cuadro, MODIS lo ve el 7 % de las veces; si VIIRS ve más de 10, el 57 %.
7. **Pendientes:** la sierra muestra 28 % de detecciones nocturnas frente a 8 % en la Amazonía, sin explicación aún. Además, las detecciones de 2025 no cuadran con el área quemada que reporta MapBiomas.

## 5. Lecciones del benchmarking (`docs/benchmarking.md`)

- **Pieza 1:** no se encontró nadie que haya aplicado captura y recaptura a MODIS y VIIRS. Sí existe un antecedente con registros de incendios en tierra (Australia, 2011). Nunca decir "primeros del mundo".
- **Límite principal:** los dos satélites pueden fallar juntos (nubes, humo). La estimación es un **mínimo con rango**, no una cifra exacta.
- **Corregir de más crea temporadas falsas**, como le pasó a GFED4.1s. Hay que comparar contra MapBiomas.
- **Terra y Aqua se calibran por separado.** En 2000–2001 solo hay datos de Terra.
- **La validación no puede ser circular:** se reservan años de prueba y se compara con una fuente externa (MapBiomas Fuego Perú, Landsat a 30 m, 1990–2025).
- **Trabajo futuro:** FireSat (primeros satélites operativos lanzados en julio de 2026) como tercera "red" de captura; fusión con GOES.

## 6. Experiencia de usuario

Una sola página que se recorre como una historia. Al hacer clic en una región, todo se filtra a esa región.

| # | Pantalla | Qué entiende el usuario | Prioridad |
|---|---|---|---|
| 1 | **"El récord falso":** el gráfico crudo se transforma en el corregido | El problema | Imprescindible |
| 2 | **Mapa con barra de tiempo 2000–2026** e interruptor crudo / corregido | Dónde y cuánto | Imprescindible |
| 3 | **El reloj del fuego:** un reloj circular por región (meses alrededor, años en anillos, este año en el anillo exterior) | Cuándo se quema cada región | Imprescindible |
| 4 | **"¿Este año es normal?":** 2026 frente a la historia | Si hay que preocuparse | Importante |
| 5 | **"Cómo lo calculamos":** los peces, el equivalente MODIS, la validación y los límites | Por qué confiar | Importante |
| 6 | **Mapa "lo que nadie vio"** y **mapa del tamaño del fuego** | El aporte original | Si sobra tiempo |
| 7 | **"Literalmente armonizamos":** el cierre musical | Que el jurado lo recuerde | Si sobra tiempo |
| 8 | **Pronóstico de temporada** (línea punteada en el reloj) y demo "sin armonizar, hasta la IA se equivoca" | Por qué la corrección importa para decidir | Si sobra tiempo |

Tres relojes lado a lado (Amazonía, sierra y costa) muestran que **Perú tiene tres temporadas de fuego distintas**.

**Fuera de alcance:** chatbot, predicción de dónde habrá un incendio mañana, globo 3D y modelo de propensión al fuego. El pronóstico de temporada (pieza 4) sí entra, si alcanza el tiempo.

## 7. Clima y propensión al fuego

**No construimos un modelo de propensión** (viento, temperatura, humedad). Es otro problema, el de predecir dónde habrá fuego; no lo pide el reto y ya existen índices oficiales (el FWI de GWIS/Copernicus).

**Sí usamos clima como contexto**, si hay tiempo: precipitación y temperatura mensuales de NASA POWER, para explicar por qué un año fue alto. Por ejemplo: "2005 y 2010 fueron años de sequía".

**La variable climática que sí importa para nuestro método es la nubosidad:** las nubes tapan el fuego para los dos satélites a la vez y hacen que la estimación se quede corta. Sirve para ensanchar el rango de incertidumbre.

## 8. Plan (36 horas)

| Bloque | Entrega |
|---|---|
| 0–6 h | Regiones reales; captura y recaptura por región y mes (Terra y Aqua por separado) |
| 6–12 h | Equivalente MODIS; validación con años reservados; comparación con MapBiomas; agregados en Parquet |
| 12–20 h | API con FastAPI; frontend: récord falso, mapa con barra de tiempo y reloj del fuego |
| 20–28 h | "¿Este año es normal?", "Cómo lo calculamos" y rangos de incertidumbre |
| 28–33 h | Datos 2026 (VIIRS NOAA-20/21); extras según el tiempo: pieza 4 (pronóstico, unas 5–6 h), lo que nadie vio, mapa de tamaño, audio |
| 33–36 h | Video, ensayo del pitch y envío |

## 9. Riesgos y respuestas para el jurado

| Pregunta probable | Respuesta |
|---|---|
| ¿Qué están contando? | Cuadros-día con fuego, no incendios ni hectáreas |
| ¿Y si los dos satélites fallan juntos? | Por eso damos un mínimo con rango y lo comparamos con MapBiomas |
| ¿No están llevando el presente al pasado? | Calibramos por región y mes, separamos Terra y Aqua, y probamos con años reservados |
| ¿Borraron también cambios reales? | La serie corregida mantiene 2005 y 2010 como años altos, lo que coincide con sequías conocidas |
| ¿Por qué no usan FIRMS directamente? | FIRMS muestra observaciones; nosotros una historia comparable con su incertidumbre |
| ¿Su sistema predice incendios? | No predice incendios puntuales. Da un pronóstico de temporada por región, separado de lo observado y probado con temporadas pasadas |

## 10. Decisiones pendientes del equipo

- Roles: ¿quién es el dueño de la metodología?
- Nombre final.
