# Rediseño de la web: de página informativa a herramienta

Rama `feat/web-rediseno`. Documento interno (español). La interfaz sigue 100 % en inglés.

## Diagnóstico

La web actual es una página larga con seis capítulos uno debajo de otro. El mapa, que es lo que más se usa, queda en el capítulo 2 y tiene altura fija. Para ver la serie de un mes hay que bajar hasta el gráfico y volver a subir. El chat es un botón flotante que tapa contenido. Parece un informe, no un instrumento.

## Concepto: «el instrumento»

Una sola pantalla, como un visor SIG o una consola científica. El **mapa es el lienzo**, la **barra de tiempo es un gráfico** y los **paneles son vistas sobre la misma región y el mismo mes**. Nada se desplaza fuera de la pantalla salvo el contenido del panel.

Principios:

1. **Un estado, muchas vistas.** Región, mes, día, capa y sensor viven en `App` y todas las vistas los leen. Cambiar de vista nunca pierde el contexto.
2. **La historia está siempre a la vista.** La barra de tiempo inferior dibuja los 324 meses (2000–2026). Con el interruptor *Raw ↔ Harmonized* el salto falso de 2012 aparece o desaparece en la parte de abajo de cualquier vista.
3. **Cada cifra con su rango y su estado.** La cifra principal del panel siempre lleva rango del 90 %, clase y una etiqueta de estado: *Observed*, *Provisional (NRT)*, *Partial month*, *Low confidence*, *Model* o *Climatology*.
4. **El pronóstico tiene su propio color (violeta) y su propia forma (líneas discontinuas, barras rayadas).** Nunca comparte estilo con lo observado.
5. **Movimiento solo cuando informa:** el panel se desliza al abrir (220 ms), el mapa vuela al cambiar de región, la reproducción avanza mes a mes. Las acciones de teclado (⌘K, flechas) no animan nada.

## Primeros 10 segundos

1. Se abre en *Explore*, Perú, septiembre de 2024: el mapa ya muestra las celdas con fuego y el panel dice **«8 490 fire cell-days (8 317–8 698) · Very high»** (o la cifra de la región elegida).
2. Abajo, la barra de tiempo muestra 26 años de temporadas de fuego; el mes elegido está marcado.
3. Arriba a la derecha aparece **«Take the 60-second tour»**. Un clic y la historia se cuenta sola.

## Arquitectura de pantallas

Riel lateral con seis vistas (iconos con etiqueta y atajo 1–6):

| Vista | Panel contextual | Mapa |
|---|---|---|
| **Explore** (1) | Región o celda elegida: estimación con rango, clase, MODIS/VIIRS crudos, detecciones del día en modo satelital, controles de sensor y de imagen | Celdas mensuales o imagen diaria |
| **Compare** (2) | *The fake record*: crudo frente a armonizado (dos paneles, nunca dos ejes) + «Without harmonization, even AI gets it wrong» | Igual que Explore |
| **This year** (3) | ¿Es normal? (12 meses frente a la mediana) y reloj del fuego; cobertura de 2026 | Igual |
| **Outlook** (4) | Temporada ago–oct 2027 (`GET /forecast`): barra apilada de probabilidades (low/normal/high/very high), mediana con rango del 90 %, etiqueta grande *Model* o *Climatology (no skill at this lead)* según `method`/`reason`, una línea de habilidad leída de `metrics.by_lead` y tabla de departamentos | Los 25 departamentos coloreados por P(high) + P(very high) de 2027 en la rampa violeta del pronóstico; los que no tienen pronóstico publicado van en gris rayado. Leyenda «Chance of a high or very high 2027 fire season». Clic en un departamento → su pronóstico en el panel |
| **Ask the data** (5) | Chat con preguntas de ejemplo verificadas; «Sync with main view» mueve región y mes | Igual |
| **Method** (6) | Cómo se calculó, validación, fuentes y la tabla de datos (panel ancho) | Igual |

Controles persistentes sobre el mapa:

- **Selector de región (⌘K / Ctrl K / «/»):** paleta de comandos con búsqueda. Lista Perú, las tres macrorregiones y los departamentos (estos abren *Outlook*, porque solo tienen pronóstico), además de vistas y acciones (*Play*, *Tour*, *Raw/Harmonized*).
- **Selector de capa:** *Activity cells · True colour · Thermal · Night lights* y el interruptor *Heat* (mapa de calor por FRP del día). Usa los hooks de `useImageryView` (`setView`, `setBase`, `setHeat`); la vista *Shortwave infrared* queda dentro del panel de Explore.
- **Selector de sensor** (solo con celdas): Estimated · MODIS · VIIRS, con sus satélites en el panel.

## Layout

Escritorio (≥ 1024 px):

```
┌──┬───────────────────┬──────────────────────────────────────────────┐
│🔥│ EXPLORE      Peru │ [⌕ Peru · Country  ⌘K]     [Cells|True|Therm|Night][Heat] │
│──│ Sep 2024 Observed │                                              │
│◎ │ 8,490             │                 M A P A                      │
│≋ │ 8,317 – 8,698     │                                              │
│◷ │ ⇈ Very high       │                                    [+][-]    │
│◔ │ MODIS 2,694 ...   │ [leyenda]                          [escala]  │
│✦ │ ...               ├──────────────────────────────────────────────┤
│§ │                   │ ▶ Sep 2024 ● Observed  ▁▂▅▂▁▁▃█▃▁ ... ▏2012 │
│  │                   │ [Raw|Harmonized]  2000 ─────────────── 2026  │
└──┴───────────────────┴──────────────────────────────────────────────┘
 56px      400 px                    resto
```

- Clic en la vista activa del riel → el panel se pliega y el mapa ocupa todo.
- *Method* abre un panel ancho (760 px) para lectura.

Móvil (< 1024 px):

```
┌──────────────────────────┐
│ [⌕ Peru ⌘K]     [Layers] │
│                          │
│          MAPA            │  42 svh (22 svh con la hoja expandida)
│ [leyenda]                │
├──────────────────────────┤
│ ▶ Sep 2024 ▁▂▅█▃▁▂ ...   │  barra de tiempo compacta
├──────────── ═ ───────────┤  asa: expande/contrae la hoja
│ EXPLORE · Peru           │
│ 8,490 (8,317–8,698)      │  hoja inferior con scroll propio
│ ...                      │
├──────────────────────────┤
│ ◎   ≋   ◷   ◔   ✦   §    │  barra de pestañas (riel)
└──────────────────────────┘
```

## Modo historia (tour)

Cinco pasos que mueven mapa, panel y barra de tiempo. Tarjeta flotante sobre la barra de tiempo con *Back / Next*, puntos de progreso y *Esc* para salir. `?tour=auto` lo reproduce solo (7 s por paso) para grabar el video.

1. **The fake record** — *Compare*, barra en *Raw*, 2012: «Add the satellites up and fire seems to multiply in 2012».
2. **Harmonized** — barra en *Harmonized*: «Same months, harmonized: no jump. Every value has a 90% range.»
3. **Seen from space** — *Explore*, Amazonía, 10 sep 2024, imagen térmica + heat: «VIIRS saw 9× as many detections as MODIS that day».
4. **This year** — *This year*, 2026: clase frente a la mediana, meses provisionales marcados.
5. **Outlook** — *Outlook*, Sierra 2027, etiqueta *Model* con probabilidades.

Video de 30 s: abrir `/?tour=auto`, grabar a 1440×900; cada paso dura lo justo para leer una frase.

## Estados

- **Carga:** esqueletos en el panel (no spinners), barra de tiempo con pulso suave; aviso en el mapa «Loading…» con `role="status"`.
- **Vacío:** el panel explica qué falta y qué hacer («No observations for this month. Pick a highlighted month in the timeline»).
- **Error:** mensaje con la causa y botón *Retry*.
- **Pronóstico / sin datos en el mapa:** aviso centrado sobre el mapa (se reutilizan los mensajes de `MapSection`). En un mes pronosticado (p. ej. 2026-12) el mapa no queda vacío: tarjeta «Forecasts are by region, not by cell» con el valor pronosticado y su rango (etiqueta *Forecast*) y un botón para abrir el pronóstico por departamentos.
- **Pronóstico en modo mock:** no hay mock de `forecast.json`; *Outlook* muestra «The season outlook is available with the API».
- **Mock:** franja ámbar fija arriba, como hasta ahora.

## Paleta (tokens en `index.css`)

Neutros fríos tipo «sala de control»; el color está reservado para datos.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#090e15` | `#f4f5f7` | Fondo de la app |
| `--surface` | `#111925` | `#ffffff` | Paneles |
| `--surface-2` | `#18222f` | `#eef0f3` | Controles |
| `--line` | `#263243` | `#d5dae1` | Bordes |
| `--fg` / `--muted` | `#eef1f5` / `#97a3b4` | `#121821` / `#566273` | Texto |
| `--accent` | `#ff5a3c` | `#d2381c` | Selección y acción principal (brasa) |
| `--c-est` | `#58b8d8` | `#1f7ea3` | Armonizado |
| `--c-raw` | `#ef7b45` | `#c4531c` | Crudo |
| `--forecast` | `#b79ced` | `#6c4fc0` | Pronóstico |
| `--amber` | `#f4b860` | `#9a6300` | Provisional / parcial |

El mapa base se queda oscuro en los dos temas: las celdas y la imagen satelital se leen mejor sobre fondo oscuro.

## Tipografía

Inter para toda la interfaz, con `tabular-nums` en cifras. Manrope solo para la cifra principal y los títulos de vista. Escala fija: 12 / 13 / 14 / 16 / 20 / 28 / 40 px.

## Motion

- Panel: `transform` + `opacity`, 220 ms, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Botones: `scale(0.97)` al pulsar, 120 ms.
- Mapa: `fitBounds` 600 ms al cambiar de región.
- Paleta de comandos: sin animación (se usa con teclado).
- `prefers-reduced-motion`: sin desplazamientos; quedan los cambios de opacidad.

## Accesibilidad

Riel como `nav` con `aria-current`; panel como `region` con título; barra de tiempo como `slider` con flechas, Inicio/Fin y `aria-valuetext`; foco visible en todo; tabla de celdas como alternativa textual al mapa; contraste AA en los dos temas.

## Implementación (estado en la rama)

Nuevos: `web/src/components/shell/` (Rail, TimeRibbon, LayerSwitcher, CommandPalette, Tour, StatusChip, MapBoundary, icons, `useOutlookLayer`, `useLabelContrast`, `views/*`), `web/src/hooks/useCellView.js` (lógica de `MapSection` extraída), `web/src/hooks/useForecast.js`, `web/src/lib/forecast.js`, `web/src/lib/status.js`.

Archivos existentes tocados (cambios pequeños, para integrar con otras ramas):

- `App.jsx`: reescrito como shell de herramienta.
- `MapView.jsx`: props `fill` (ocupa el contenedor, controles abajo a la derecha, sin gestos cooperativos ni botón de reset propio) y `onReady(map)`.
- `imagery/ImageryControls.jsx`: prop `compact` (oculta vista, fecha, bases y calor, que ya están en la barra de capas y en la línea de tiempo).
- `chat/ChatPanel.jsx`: props `embedded` y `onOpenMethod`.
- `data/client.js`: `getForecast(region?)` (en mock lanza `NoDataError`).
- `hooks/useRegionData.js`: `useRegions` devuelve también `departments`.
- `NormalChart`, `FireClock`, `SlotDetails`, `HowWeCalculated`, `imagery/RawVsCorrected`: breakpoints de viewport cambiados por container queries (`@3xl:` etc.) para que funcionen dentro del panel.
- `index.css`: tokens claro/oscuro y estilos del shell; `vite.config.js`: proxy `/api` configurable con `VITE_API_PROXY`.
- `i18n/locales/en.js` y `es.js`: claves nuevas.

`Header`, `Hero`, `Section`, `MapSection` y `TimeBar` quedan sin uso; se pueden borrar al integrar.

URL: `?view=&region=&y=&m=&unit=`; `?tour=1` abre el recorrido y `?tour=auto` lo reproduce solo.
