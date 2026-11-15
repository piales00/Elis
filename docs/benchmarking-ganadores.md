# Benchmarking de ganadores de NASA Space Apps (2022-2025) para FireChronos Perú

Fecha de la investigación: 2026-11-14. Reto: *Harmonization of MODIS and VIIRS Hot Spots* (Space Apps 2026).

Convención: **[V]** = verificado abriendo la fuente citada. **[I]** = inferencia mía, no está en ninguna fuente.

Nota de método: `WebFetch` falló contra spaceappschallenge.org (error de certificado). Para leer esas páginas descargué el HTML público con `curl -k` y extraje los campos del formulario de proyecto que la página trae incrustados. No hice login ni usé nada privado. Los enlaces de la sección 8 son los que abrí.

---

## 0. Dato urgente de calendario [V]

La guía oficial 2026 (https://www.spaceappschallenge.org/resources/judging-awards-guide/ y https://www.spaceappschallenge.org/resources/project-submission-guide/) dice:

- El envío abre el sábado 14 de noviembre de 2026 a las 9:00 (hora local del evento) y **cierra el domingo 15 de noviembre a las 23:59 hora local**. Hay que pulsar "Submit for Judging". Solo cuenta el último guardado.
- Global Nominees: 3 de diciembre de 2026. Global Finalists y Honorable Mentions: 17 de diciembre de 2026. Global Winners: 26 de enero de 2027.

Es decir, el plazo de envío es mañana.

---

## 1. Resumen: lecciones más útiles para FireChronos Perú

1. **El demo es de 30 segundos o 7 diapositivas, y es el filtro de entrada.** [V] Pasarse de 30 s o de 7 diapositivas deja el proyecto fuera del juicio global. Los tres videos de ganadores 2025 que pude medir duran 29-30 s (Queñaris, Resonant Exoplanets, PureFlow). Lo normal entre ganadores es un video corto + enlace a una web desplegada.
2. **Los jueces puntúan 1-5 en Impact, Creativity, Validity, Relevance y Presentation.** [V] Presentation pesa igual que las otras cuatro, y la guía lo repite expresamente. La mayor parte de la evaluación sale de la página del proyecto, no del demo. [V] Esa página es donde FireChronos tiene su ventaja (método, validación, rangos).
3. **Hay que usar datos de NASA de forma central y citarlos con enlaces.** [V] La guía dice que para optar a un premio global hay que usar al menos un dato o recurso de NASA, y Relevance puntúa que el dato NASA sea "un componente central y no un añadido". FIRMS (MODIS y VIIRS) cumple con holgura.
4. **Los ganadores 2025 tienen demo desplegado y verificable.** [V] 9 de 10 tienen enlace a una app o sitio publicado (el décimo, Photonics Odyssey, enlaza una carpeta de Drive y un deck de Canva). Los enlaces que probé respondían 200. FireChronos ya tiene web, API y mapa, así que está bien posicionado.
5. **Peru ya ganó en 2025 con otro tema (Queñaris, Local Impact, Arequipa) y lista FIRMS entre sus referencias.** [V] El jurado ve con buenos ojos el impacto local concreto y medible (cifras de caudal, supervivencia, sectores económicos afectados).
6. **Reglas de IA e integridad.** [V] El uso de IA está permitido para acelerar, no para "idear la solución". Hay que señalar dónde se usó (imágenes con marca visible; código y datos con mención en el texto o metadatos). Todo recurso externo va en Referencias. Los ganadores 2025 declaran con detalle qué herramienta usaron y para qué.
7. **Honestidad científica como diferenciador.** [I] Ningún ganador 2025 que pude leer reporta intervalos de incertidumbre ni validación externa. FireChronos (rango en toda estimación, validación MapBiomas, unidad "celdas-día con fuego") puede destacar en Validity si lo muestra en una sola pantalla y en una frase del demo.
8. **Riesgo principal [I]:** el método (Chapman, equivalente MODIS, ML, pronóstico) es denso para un video de 30 s. Los ganadores cuentan una sola idea con una imagen potente. Conviene abrir el demo con el problema ("el fuego parece multiplicarse por 9 en 2012") y cerrar con el mapa o la serie corregida.

---

## 2. Tabla de ganadores globales por año

Fuente de cada fila: el anuncio oficial de NASA del año (enlaces en sección 8). La columna "enlace oficial" da la página del proyecto en spaceappschallenge.org solo cuando la abrí. **Para 2023 y 2024 no pude abrir las páginas de proyecto**: la página de equipo existe pero su proyecto no es visible sin sesión (`canViewProject: false`, comprobado en AsturExplorers 2024). Los slugs de equipo 2023/2024 que probé por adivinanza no resolvieron, y no inventé enlaces.

### 2025 (10 ganadores de 18 860 equipos; anuncio 18 de diciembre de 2025) [V]
Fuente: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/ y https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/

| Premio | Equipo / proyecto | País | Reto | Qué hicieron | Página oficial |
|---|---|---|---|---|---|
| Best Use of Science | SpaceGenes+ | Alemania | Build a Space Biology Knowledge Engine | Dashboard sobre cómo radiación y microgravedad juntas alteran la expresión génica (datos GeneLab). | https://www.spaceappschallenge.org/2025/find-a-team/spacegenes/ |
| Best Use of Data | Resonant Exoplanets | EE. UU. | A World Away: Hunting for Exoplanets with AI | IA sobre datos Kepler/TESS/JWST para hallar exoplanetas y posibles biofirmas. | https://www.spaceappschallenge.org/2025/find-a-team/resonant-exoplanets/ |
| Best Use of Technology | Twisters (SkySense) | México | Will It Rain On My Parade? | Web app de clima hiperlocal con datos NASA POWER + IA y asistente conversacional. | https://www.spaceappschallenge.org/2025/find-a-team/twisters/ |
| Galactic Impact | Astro Sweepers | Evento universal | Commercializing LEO | Cumplimiento de desechos orbitales (DAS/ODAR) y un índice de riesgo por objeto. | https://www.spaceappschallenge.org/2025/find-a-team/astro-sweepers-we-catch-what-space-leaves-behind/ |
| Best Mission Concept | PureFlow | Brasil | Your Home in Space: The Habitat Layout Creator | Diseño 3D de hábitats probado contra tormentas solares (API DONKI de NASA). | https://www.spaceappschallenge.org/2025/find-a-team/pureflow2/ |
| Most Inspirational | Photonics Odyssey (AakashNet) | India | Commercializing LEO | Propuesta de internet satelital como infraestructura nacional con antena de arreglo en fase. | https://www.spaceappschallenge.org/2025/find-a-team/photonic-force/ |
| Best Storytelling | HerCode Space (A Solar Tale) | Evento universal | Stellar Stories: Space Weather Through the Eyes of Earthlings | Cuento ilustrado web, narrado por el Sol, sobre clima espacial para niños. | https://www.spaceappschallenge.org/2025/find-a-team/hercode-space/ |
| Global Connection | Gaia+LEO | EE. UU. | Commercializing LEO | Optimización de redes de centros de datos orbitales y terrestres. | https://www.spaceappschallenge.org/2025/find-a-team/gaialeo/ |
| Art & Technology | Zumorroda-X (Henry's Farm Adventures) | Egipto | NASA Farm Navigators | Juego de minijuegos sobre agricultura y clima con datos NASA. | https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/ |
| Local Impact | Queñaris | **Perú** (Arequipa) | BloomWatch: An Earth Observation Application for Global Flowering Phenology | Reforestación de queñuas con microorganismos, datos NASA, drones e IA. | https://www.spaceappschallenge.org/2025/find-a-team/watana-project/ |

El enlace de Queñaris usa el slug `watana-project`; el nombre del proyecto en esa página es "Queñaris" y el reto, el país y la ciudad coinciden con el anuncio de NASA. [V]

### 2024 (10 ganadores de 9 996 envíos; anuncio de enero de 2025) [V]
Fuente: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/ y https://spaceappschallenge.org/nasa-space-apps-2024/awards/global-winners (la segunda no la pude leer como texto, solo se confirmó que existe)

| Premio | Equipo / proyecto | País (ciudad) | Reto | Qué hicieron |
|---|---|---|---|---|
| Best Use of Science | WMPGang, "SkyShield" | Canadá (Waterloo) | Create an Orrery Web App that Displays Near-Earth Objects | Web app que identifica zonas de riesgo para satélites con datos de objetos cercanos. Cuatro estudiantes, unas 30 horas, sin experiencia web previa (spaceq.ca). |
| Best Use of Data | GaamaRamma, "Waterwise" | EE. UU. (evento universal) | Leveraging Earth Observation Data for Informed Agricultural Decision-Making | Ayuda a agricultores con agua en sequía, plagas y enfermedades. |
| Best Use of Technology | 42 QuakeHeroes | Brasil (Maceió) | Seismic Detection Across the Solar System | Red neuronal que localiza eventos sísmicos en series temporales. |
| Galactic Impact | NVS-knot, "2plant" | Ucrania (Kiev) | Leveraging Earth Observation Data... | Evalúa condiciones de siembra con humedad del suelo y evapotranspiración. |
| Best Mission Concept | AsturExplorers, "Landsat Connect" | España (Gijón) | Landsat Reflectance Data: On the Fly... | Web app para seguir Landsat, ver reflectancia y recibir alertas de paso. |
| Most Inspirational | Innovisionaries, "Eco-Metropolis" | EAU (Sharjah) | SDGs in the Classroom | Juego de ciudad con decisiones basadas en datos ambientales reales. |
| Best Storytelling | TerraTales | Egipto (El Cairo) | Tell Us a Climate Story! | Web con historias climáticas, modelo de pronóstico con IA y juego. |
| Global Connection | Asteroid Destroyer | Canadá (Saskatoon) | Navigator for the Habitable Worlds Observatory | Mapa de exoplanetas por tamaño, temperatura y distancia con ML. |
| Art & Technology | Connected Earth Museum | Brasil (Campinas) | Imagine our Connected Earth | Museo virtual sobre cambio climático con anfitrión de IA y visualizaciones, incluidos incendios. |
| Local Impact | Team I.O., "G.R.O.W." | Brasil (Florianópolis) | Community Mapping | Hace comprensible el SIG ambiental para no expertos; Universe Magazine lo describe como un sitio con interfaz tipo chat que da información de incendios en tiempo real. |

Enlace oficial de proyecto: no verificable (ver nota arriba). El único slug de 2024 que sí encontré fue la página de equipo https://www.spaceappschallenge.org/nasa-space-apps-2024/find-a-team/asturexplorers/ (sin proyecto visible).

### 2023 (10 ganadores de 5 556 envíos; anuncio 23 de enero de 2024) [V]
Fuente: https://science.nasa.gov/directorates/smd/2023-nasa-international-space-apps-challenge-announces-10-global-winners

| Premio | Equipo | País | Reto | Qué hicieron |
|---|---|---|---|---|
| Best Use of Science | LunarTech Ensemble | Egipto | Make a Moonquake Map 2.0! | Sitio y juego inmersivo para visualizar datos sísmicos lunares Apollo. |
| Best Use of Data | Storm Prophet | Ucrania | Develop the Oracle of DSCOVR | Modelo LSTM que predice niveles de tormenta geomagnética. |
| Best Use of Technology | Spacebee | EE. UU. y Argentina | Make a Moonquake Map 2.0! | Web con ubicación, tipo, fecha y gráficos de moonquakes. |
| Galactic Impact | Greetings from Earth!! | Brasil | Ocean Gardens | Web interactiva que muestra los océanos como jardines que regulan el clima. |
| Best Mission Concept | ASTROGENESIS | **Perú** | Planetary Tourism Office | Plataforma de itinerarios a planetas y lunas. |
| Most Inspirational | Space Quest Maidens | Brasil | Eclipses: Perspective is Everything | Herramienta educativa sobre eclipses para niños. |
| Best Storytelling | TeamVoyagers | Bangladesh | Everything Starts with Water | Juego web sobre el ciclo del agua y el cambio climático. |
| Global Connection | Arcobaleno | Brasil | Immersed in the Sounds of Space | Sonificación de datos NASA para personas con discapacidad visual. |
| Art & Technology | Oogway Comics | Tayikistán | Habitable Exoplanets | Cómic sobre un exoplaneta habitable con datos NASA. |
| Local Impact | $quality_over_quantity | Taiwán | Explore a Biodiversity Hotspot with Imaging Spectroscopy | Método para priorizar la protección de zonas de biodiversidad. |

Enlaces oficiales de proyecto 2023: no verificados. Repositorios públicos que sí abrí: Lunar Trek (https://github.com/yousefkotp/Lunar-Trek, se presenta como "award-winning" para el reto Moonquake Map 2.0; no pude confirmar que sea de LunarTech Ensemble) y un repo de Storm Prophet (https://github.com/commanderxa/dscovry; no confirmé la autoría ni el premio).

### 2022 (10 ganadores) [V]
Fuente: https://www.earthdata.nasa.gov/news/2022-space-apps-challenge-winners (lista sin descripciones). Las URLs de proyecto vienen de esa página de NASA y no las abrí una por una.

| Premio | Equipo | País | Reto | Enlace |
|---|---|---|---|---|
| Best Use of Science | What's New? | Taiwán | Carrington Event | https://2022.spaceappschallenge.org/challenges/2022-challenges/carrington-event/teams/whats-new/project |
| Best Use of Data | Starflock | EE. UU. | Take Flight | https://2022.spaceappschallenge.org/challenges/2022-challenges/take-flight/teams/starflock-3/project |
| Best Use of Technology | tAMing particles | Lituania | Mars Habitat | https://2022.spaceappschallenge.org/challenges/2022-challenges/mars-habitat/teams/taming-particles/project |
| Galactic Impact | Selene | India | Moonquake Map | https://2022.spaceappschallenge.org/challenges/2022-challenges/moonquake-map/teams/selene-5/project |
| Best Mission Concept | Mars 3D Home | Argentina | Mars Habitat | https://2022.spaceappschallenge.org/challenges/2022-challenges/mars-habitat/teams/mars-3d-home/project |
| Most Inspirational | Team Diamonds | Bangladesh | Twinkle Twinkle Little Star | https://2022.spaceappschallenge.org/challenges/2022-challenges/twinkle-twinkle-little-star/teams/team-diamonds/project |
| Best Storytelling | MIMBI | Paraguay | STEAM | https://2022.spaceappschallenge.org/challenges/2022-challenges/steam/teams/mimbi/project |
| Global Connection | Standard NCTU CS Student | Taiwán | Track the ISS | https://2022.spaceappschallenge.org/challenges/2022-challenges/track-the-iss/teams/standard-nctu-cs-student/project |
| Art & Technology | Earth, Wind & Flare | EE. UU. | Creative Data Display | https://2022.spaceappschallenge.org/challenges/2022-challenges/creative-data-display/teams/earth-wind-flare/project |
| Local Impact | Brute Force | Chipre | Moonquake Map | https://2022.spaceappschallenge.org/challenges/2022-challenges/moonquake-map/teams/brute-force-5/project |

Observación [V]: en los cuatro años, el premio de Best Use of Science / Data / Technology va a quien resuelve un reto concreto con datos concretos, y los premios de Storytelling, Inspirational y Art & Technology van mayormente a proyectos educativos o lúdicos (juegos, cómics, cuentos). Las categorías de 2025 y 2024 coinciden, salvo que 2025 cambia "Best Mission Concept" y "Galactic Impact" de reto. En 2025 y 2024 el anuncio muestra una distribución geográfica muy repartida (Perú aparece en 2023 y 2025).

---

## 3. Fichas de proyectos analizados a fondo (2025, páginas oficiales abiertas)

Todas las fichas salen de los campos del formulario de la página oficial del proyecto (resumen, enlace al demo, enlace al proyecto, detalles, referencias de IA, referencias de datos, otras referencias) más pruebas de que los enlaces responden. Los campos observados son los mismos en los 10 proyectos, lo que confirma la estructura del formulario de 2025: nombre, resumen, demo, enlace al proyecto, detalles, referencias de IA, referencias de datos y otras referencias. El campo "solution" aparece vacío en todos.

**Duración de video medida con YouTube [V]:** Queñaris 30 s, Resonant Exoplanets 30 s, PureFlow 29 s. No pude medir los demás (están en Google Drive, Canva o sin metadatos accesibles).

### 3.1 Queñaris (Local Impact, Perú) https://www.spaceappschallenge.org/2025/find-a-team/watana-project/
- Demo: video YouTube de 30 s https://youtu.be/QvbLhHqKULc. Proyecto desplegado: https://quenaris.vercel.app (200).
- Descripción: problema local con cifras (caudal de manantial de 14 L/s a 0 en días; sectores que dependen del agua: energía 67,7 %, agroindustria 28,5 %, minería 11 %), luego "What exactly does it do / How does it work / What benefits does it have", flujo en pasos (dron, índices satelitales, IA, vivero, monitoreo) y cifras de impacto (25 cm/año, supervivencia mayor a 80 %, 5 000 plántulas).
- Datos NASA: LP DAAC (HLS, índices NDVI/EVI/NDMI...), Earthdata, **FIRMS y su API, LAADS, MODIS**, ARSET, earthaccess. Más USGS y ESA como "otras referencias".
- IA: declaración detallada, herramienta por herramienta (Gemini para análisis del ortomosaico, ChatGPT, Claude para código de datos satelitales, Perplexity, Deepseek/Copilot, Lovable para la plantilla del front).
- Lección: cifras locales, flujo en pasos, lista larga de datos NASA con enlaces, y IA declarada sin ocultar nada.

### 3.2 Twisters / SkySense (Best Use of Technology, México) https://www.spaceappschallenge.org/2025/find-a-team/twisters/
- Demo: archivo en Google Drive (no medido). Proyecto: https://skysense.surf/ (200).
- Resumen: qué es, qué variables analiza, asistente conversacional (TwisterBot), por qué importa. Detalles: stack (React, Firebase, Google APIs, Figma) y datos (NASA POWER, Open-Meteo).
- Datos NASA: POWER API, Earthdata, Giovanni, GES DISC.
- IA: texto claro de "escribimos el código nosotros; la IA aceleró X, Y, Z" (Lovable, Builder.io, ChatGPT para iconos).
- Lección: el ganador de tecnología es una app terminada, no un prototipo.

### 3.3 SpaceGenes+ (Best Use of Science, Alemania) https://www.spaceappschallenge.org/2025/find-a-team/spacegenes/
- Demo: Drive. Proyecto: https://spacegenes-plus.framer.website/ (200).
- Resumen con un hallazgo concreto (genes TP53, ATM, GADD45A con respuesta no aditiva), dataset exacto citado (GLDS-288, OSD-288).
- Lección: premio de ciencia por una pregunta científica precisa y un dataset identificado por código, no por tecnología. Esto es lo más cercano al perfil de FireChronos.

### 3.4 Resonant Exoplanets (Best Use of Data, EE. UU.) https://www.spaceappschallenge.org/2025/find-a-team/resonant-exoplanets/
- Demo: YouTube 30 s https://www.youtube.com/watch?v=5fBB5YJpfwU. Proyecto: https://resonant-planet.vercel.app (200).
- Detalles: arquitectura completa (FastAPI, XGBoost, Lightkurve, Astroquery, React, Google Cloud), el diferenciador técnico (solver de matemática exacta "Modulus") y el beneficio ("menos falsos positivos"). Entrega informes PDF automáticos y gráficos.
- Datos: Kepler, TESS, JWST, Hubble (MAST).
- Lección: tiene una afirmación técnica fuerte y comprobable (reducir falsos positivos) y la acompaña con salidas descargables.

### 3.5 Astro Sweepers (Galactic Impact, evento universal) https://www.spaceappschallenge.org/2025/find-a-team/astro-sweepers-we-catch-what-space-leaves-behind/
- Demo: Drive. Proyecto: https://astro-sweepers.vercel.app/ (200).
- Detalles estructurados con numeración ("1. Detailed Project Description"), método propio con nombre (índice ASRI, "DCRA v3"), datos NASA SPARK y Space-Track, y propuesta comercial (informes para aseguradoras y reguladores).
- IA: declarada (ChatGPT para ideas y redacción; imágenes de IA con marca de agua).
- Lección: un índice con nombre propio y un cliente claro.

### 3.6 PureFlow (Best Mission Concept, Brasil) https://www.spaceappschallenge.org/2025/find-a-team/pureflow2/
- Demo: YouTube 29 s https://youtu.be/hHUpo7bTVuc. Proyecto en GitHub Pages (200).
- Resumen: "no solo si se puede construir un hábitat, sino si la tripulación sobrevive", integra la API DONKI de NASA. Detalles con pregunta como título ("Would Your Habitat Survive a Solar Storm... Today?").
- IA: audio con ElevenLabs, declarado.
- Lección: la pregunta provocadora y un dato NASA en tiempo real como "gancho".

### 3.7 Gaia+LEO (Global Connection, EE. UU.) https://www.spaceappschallenge.org/2025/find-a-team/gaialeo/
- Demo: Drive. Proyecto: README de GitHub (200).
- Resumen técnico (optimización entera mixta, CapEx+OpEx, límites de latencia y potencia). Datos NASA POWER con fechas y variables exactas en la referencia. Simulación en Python, Three.js y Streamlit.
- IA: ChatGPT, Cursor, Copilot declarados.
- Lección: citar rango de fechas y variables concretas de los datos (credibilidad).

### 3.8 A Solar Tale (Best Storytelling, evento universal) https://www.spaceappschallenge.org/2025/find-a-team/hercode-space/
- Demo: YouTube https://youtu.be/1C9ueho9ero (duración no accesible). Proyecto: https://a-solar-tale.netlify.app/ (200).
- Detalles: relato en cinco actos, stack (React, Scrollama, diseño móvil primero), puntos de innovación.
- IA: lista de herramientas (Nano banana, Pixaverse, Narakeet, Gemini, ChatGPT).
- Lección: el premio de narrativa fue por una forma de contar, y aun así cita datos NASA (Solar Storms and Flares, Space Weather).

### 3.9 Henry's Farm Adventures / Zumorroda-X (Art & Technology, Egipto) https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/
- Demo: Drive. Proyecto: https://henrysfarmadventures.vercel.app/ (200).
- Resumen narrativo con personajes (Henry, Bilal en Pakistán, Ramesh en India) y minijuegos. Datos: NASA Earth Observatory, NASA Harvest, Extreme Heat y Floods Data Pathfinder.
- Lección: dato NASA convertido en experiencia; los ejemplos de agricultores reales dan peso.

### 3.10 Photonics Odyssey / AakashNet (Most Inspirational, India) https://www.spaceappschallenge.org/2025/find-a-team/photonic-force/
- Demo: deck de Canva (enlace de edición). Proyecto: carpeta de Drive. Referencia de datos mínima (NASA Image and Video Library).
- Lección: el contraejemplo útil. Ganó Most Inspirational con muy poco uso de datos NASA, por la fuerza del problema social. No es el perfil del premio científico.

### 3.11 Extra: repos de 2023 (README) [V]
- Lunar Trek (https://github.com/yousefkotp/Lunar-Trek): README con Resumen, Tabla de contenidos, Características, Tecnologías, Análisis de series temporales, Juego, "Use of Artificial Intelligence" (afirma que un ajuste fino de LLM no se integró por falta de tiempo) y Contribuidores. Demo en vercel.app; sin video.
- DSCOVRY / Storm Prophet (https://github.com/commanderxa/dscovry): README técnico con requisitos, entrenamiento, estructura, datos (datos crudos de GFZ y índice Kp), limpieza de datos y arquitectura del modelo (LSTM de 2 capas en PyTorch). Repo archivado el 23 de enero de 2024. No dice que haya ganado.

---

## 4. Proyectos de fuego, incendios y observación de la Tierra

Verificado [V] salvo donde se indique.

| Año | Proyecto | Estado | Qué hizo | Enlace |
|---|---|---|---|---|
| 2025 | Queñaris (Perú) | Global Winner, Local Impact | Reforestación; lista FIRMS y MODIS entre sus referencias, pero no es un proyecto de detección de fuego. | https://www.spaceappschallenge.org/2025/find-a-team/watana-project/ |
| 2025 | Twisters / SkySense | Global Winner, Best Use of Technology | Observación de la Tierra (NASA POWER): clima hiperlocal. | https://www.spaceappschallenge.org/2025/find-a-team/twisters/ |
| 2025 | Zumorroda-X | Global Winner | Datos de calor extremo e inundaciones para educación. | https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/ |
| 2024 | Team I.O. "G.R.O.W." (Brasil) | Global Winner, Local Impact | Según Universe Magazine, sitio tipo chat con información de incendios en tiempo real. Según NASA, "hace comprensible el SIG ambiental". No pude abrir la página del proyecto ni confirmar que use FIRMS. | https://universemagazine.com/en/ukrainian-team-wins-nasa-space-apps-challenge-2024 |
| 2024 | Connected Earth Museum (Brasil) | Global Winner, Art & Technology | Museo virtual con IA que visualiza temperatura, densidad de población e incendios. | NASA 2024 (sección 8) |
| 2024 | NVS-knot "2plant", GaamaRamma "Waterwise" | Global Winners | Observación de la Tierra para agricultura (humedad del suelo, evapotranspiración, agua). | NASA 2024 (sección 8) |
| 2023 | Phoenix Eye (México, Tec de Monterrey Sonora Norte) | Global Finalist (uno de 40 de 587 nominados). No ganó entre los 10 según la lista de NASA 2023. | Predicción de la propagación de incendios en las primeras 24 h con ML, alertas sin internet (según el artículo del Tec; no dice qué datos usa). | https://conecta.tec.mx/en/news/sonora-norte/education/nasa-tec-students-go-world-hackathon-app-vs-forest-fires |
| 2023 | $quality_over_quantity (Taiwán) | Global Winner, Local Impact | Observación de la Tierra (espectroscopia de imágenes) para biodiversidad. | NASA 2023 (sección 8) |
| 2020 | Operation: Prometheus | Global Finalist, reto Spot That Fire V3.0 | Simulador de propagación de incendios con ML y mapa Mapbox. Usó **MODIS USA 7d de FIRMS** y MOPITT (CSA). Dijo que dedicó cerca del 50 % del tiempo a recolectar y limpiar datos. Tenía demo en vivo, diapositivas y código vía Linktree; sin video. | https://2020.spaceappschallenge.org/challenges/confront/spot-fire-3/teams/operation-prometheus |
| 2020 | Project L.L.O.C.U.S.T. | Global Winner, Galactic Impact | Usa MODIS (Terra), SMAP y ASTER con ML para pronosticar plagas de langosta en un mapa de riesgo. | https://2020.spaceappschallenge.org/challenges/inform/automated-detection-hazards/teams/project-llocust-1/project |

Notas de honestidad:
- "FireWay" (2020, Best Use of Technology) NO es un proyecto de fuego: es un conector universal para reabastecer satélites. Lo verifiqué abriendo su página. [V]
- Una búsqueda en spaceappschallenge.org no devolvió ningún ganador, finalista o mención 2025 relacionado con incendios; la lista de finalistas 2025 carga con JavaScript y no pude leerla. No afirmo que no exista. [V sobre la búsqueda, I sobre la conclusión]
- Mi lectura es que **no hay en 2022-2025 ningún ganador global centrado en armonizar MODIS y VIIRS** (con las listas que pude leer). [I] Con el reto 2026 abierto, eso es una oportunidad, no una garantía.
- No pude abrir la página oficial del reto 2026 "Harmonization of MODIS and VIIRS Hot Spots": el texto se carga en el navegador y no viene en el HTML descargado. No tengo verificado el texto del reto ni el enlace exacto.

---

## 5. Criterios de evaluación y requisitos de envío (2026)

Fuentes: https://www.spaceappschallenge.org/resources/judging-awards-guide/ , https://www.spaceappschallenge.org/resources/project-submission-guide/ (ambas abiertas) [V]

**Criterios (escala 1 a 5 en cada uno, en todas las fases):**
1. **Impact:** aborda un problema pequeño o grande; alcance y calidad del efecto.
2. **Creativity:** originalidad y mejora significativa sobre lo existente.
3. **Validity:** sólido en principios científicos, factibilidad técnica, completitud y usabilidad.
4. **Relevance:** responde directa y completamente al reto; **integra datos NASA como componente central, no superficial**.
5. **Presentation:** comunica el reto, la solución y su importancia; los jueces evalúan el demo **y** el proyecto completo. La guía pide dedicar tiempo al pitch y reclutar a alguien de narrativa y diseño.

**Premios globales (10):** Best Use of Science (método científico válido), Best Use of Data (hacer accesibles los datos o darles una aplicación única), Best Use of Technology, Galactic Impact (mejorar la vida en la Tierra o el universo), Best Mission Concept, Best Use of Storytelling, Global Connection, Art & Technology, Local Impact, Most Inspirational. Los jueces ejecutivos son líderes de NASA y de las agencias asociadas.

**Requisitos de envío 2026:**
- Responder a uno de los retos oficiales. Equipos de 1 a 6 personas (en Evento Universal, mínimo 2). Todos inscritos en el mismo evento local o en el universal.
- Todos los campos obligatorios completos. **Todo el contenido en inglés.**
- **Demo:** video de 30 s o menos, o presentación de hasta 7 diapositivas (incluidas portada e introducción). Alojada fuera (YouTube, Drive, GitHub...), enlace público, sin login ni permisos. El video puede estar en otro idioma pero **debe llevar subtítulos en inglés**. Superar 30 s o 7 diapositivas descalifica del juicio global.
- Campos del formulario (guía): nombre del proyecto; resumen de alto nivel; enlace al demo; enlace público al proyecto final; detalles (qué hace, cómo funciona, beneficios, qué esperan lograr, herramientas); **qué datos y recursos de NASA usaron (obligatorio al menos uno para premio global)**; referencias de todo recurso externo (código, texto, imágenes); casilla de términos; casilla de "trabajo original".
- **Declaración de IA ("Super Intelligence tools"):** permitida; no debe usarse para idear la solución. Imágenes y video generados llevan marca de agua visible; audio, código y datos deben reconocerse en el texto o metadatos. Prohibido modificar marca NASA (logos, banderas, identificadores de misión). La guía dice que la respuesta a esta pregunta es solo para recopilación de datos y no la ven los jueces, pero sí ven los indicadores de IA dentro del proyecto.
- Sin imágenes, video o audio de menores de 18 años en el demo ni en el proyecto final.
- Se puede guardar y reenviar hasta el cierre; vale el último guardado. Subida de imágenes JPG/PNG/GIF hasta 10 MB en la página; no se suben videos ni documentos.
- Recomendado: solicitar clasificación de sitio web (FortiGuard) para que el filtro de NASA no bloquee la web del equipo.
- Guion sugerido de 30 s (guía de demo): 0:00 quién eres; 0:02 qué reto y por qué; 0:05 nombre y lema; 0:10 cómo funciona, con imágenes o prototipo y cómo los datos NASA lo hicieron posible; 0:20-0:30 mirada al futuro. Para diapositivas: imagen del proyecto, experiencia de usuario, cómo los datos abiertos NASA lo hacen posible, nombre del equipo y de los integrantes, reto elegido.

---

## 6. Patrones entre ganadores

**Verificados [V] (en las 10 páginas de 2025):**
- Todos publican un demo y un enlace a algo que se puede abrir (9 de 10 con producto desplegado o repo).
- Los demos son cortos (29-30 s en los tres que medí), consistentes con la regla vigente.
- Todos citan datos y recursos con enlaces; los de ciencia y datos citan dataset exacto o rango de fechas (GLDS-288, NASA POWER 10/2023-10/2025, Kepler/TESS/JWST/MAST).
- Todos declaran el uso de IA con herramienta y propósito.
- Los resúmenes empiezan por "qué es y qué problema resuelve" y terminan en impacto o beneficio; los detalles añaden el stack tecnológico.
- Los de premios educativos o de arte (Storytelling, Art & Technology, Inspirational) llevan personajes, historia o un problema social humano.
- Los de ciencia/datos/tecnología tienen una afirmación técnica concreta (hallazgo, reducción de falsos positivos, app terminada).
- Impacto local expresado con cifras (Queñaris).

**Inferencias mías [I]:**
- Los jurados premian proyectos terminados y navegables por encima de ideas conceptuales, salvo en Mission Concept e Inspirational.
- La ciencia pesa en los premios científicos, pero ninguno de los 10 de 2025 expone incertidumbre o validación externa; FireChronos puede diferenciarse ahí.
- Los errores que evitan: enlaces rotos o con permiso (la guía los advierte explícitamente), videos largos, texto sin datos NASA, uso de IA sin declarar.

---

## 7. Recomendaciones concretas para FireChronos Perú

### Verificadas en fuente [V]
1. **Cumplir los límites del demo.** Video de 30 s o 7 diapositivas, en un enlace público probado en ventana privada. Si el video está en español, subtítulos en inglés incrustados.
2. **Todo el texto del formulario en inglés** (también lo pide AGENTS.md).
3. **Citar los datos NASA con enlaces**: FIRMS (MODIS C6.1/C6.1 NRT y VIIRS 375 m: S-NPP, NOAA-20, NOAA-21), con los productos y el rango de fechas usado, igual que hace Gaia+LEO con NASA POWER.
4. **Declarar la IA** herramienta por herramienta, como Queñaris, y poner marca de agua en imágenes generadas. No decir que la IA ideó la solución.
5. **Listar todo recurso externo** en Referencias (MapBiomas, DuckDB, MapLibre, librerías, tipografías, imágenes, música).
6. **Rellenar bien "details"**: qué hace, cómo funciona, beneficios, qué esperan lograr, herramientas. Es lo que más cuenta, más que el demo.
7. **Abrir el enlace desplegado desde una red limpia** y pedir clasificación FortiGuard si es un dominio nuevo.
8. **Dar una cifra local concreta** como Queñaris (cifras de caudal, porcentajes de sectores).

### Inferencias mías [I]
1. **Gancho del demo:** "Without correction, fire in Peru appears to multiply 9x in 2012. We fixed it." en los primeros 5 s, con la serie corregida y la cruda en la misma gráfica.
2. **Una pantalla de "evidencia de validez":** estimación con rango, comparación con el equivalente MODIS y la validación con MapBiomas, en lenguaje llano. Es lo que ningún ganador de 2025 muestra.
3. **Presentación de la unidad de medida:** "fire cell-days" en una nota corta para que el jurado vea la honestidad científica sin leer la metodología.
4. **No llenar el demo con los cuatro módulos.** Mostrar la serie armonizada con rango como protagonista; el mapa de tamaño y el pronóstico como segundos planos, etiquetados como experimental y como proyección (no observado).
5. **Nombre y lema cortos** (como "SkySense" o "PureFlow"): conviene un lema que diga el beneficio, p. ej. una línea sobre "one comparable fire history for Peru, 2000-2026".
6. **Premio realista:** los más naturales son Best Use of Data y Best Use of Science (comparar con SpaceGenes+ y Resonant Exoplanets); Local Impact es posible por el ángulo Perú, siempre que se hable de decisores o comunidades concretas. [I]
7. **Evitar:** afirmar "primeros del mundo", hablar de "incendios" o "hectáreas" en lugar de celdas-día con fuego, y presentar el pronóstico como dato observado.
8. **Seguridad de entrega:** dado que el cierre es mañana a las 23:59 hora local, enviar una versión completa temprano y reenviar mejoras; el sistema guarda el último envío.

---

## 8. Fuentes abiertas

**Oficiales de Space Apps (HTML descargado con curl -k):**
- https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/
- https://www.spaceappschallenge.org/2025/awards/global-winners/ (la lista salió de la página de NASA y de la anterior; esta página carga con JS)
- https://www.spaceappschallenge.org/resources/judging-awards-guide/
- https://www.spaceappschallenge.org/resources/project-submission-guide/
- Páginas de equipo 2025 (cada una con su proyecto): https://www.spaceappschallenge.org/2025/find-a-team/twisters/ , /spacegenes/ , /resonant-exoplanets/ , /astro-sweepers-we-catch-what-space-leaves-behind/ , /pureflow2/ , /gaialeo/ , /hercode-space/ , /photonic-force/ , /watana-project/ , /zumorroda-x/ (todas bajo https://www.spaceappschallenge.org/2025/find-a-team/)
- https://www.spaceappschallenge.org/nasa-space-apps-2024/find-a-team/asturexplorers/ (abierta; proyecto no visible)
- https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/ (la URL carga, pero el texto del reto no venía en el HTML; no está verificada como página real del reto)

**Anuncios de NASA:**
- 2025: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/
- 2024: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/
- 2023: https://science.nasa.gov/directorates/smd/2023-nasa-international-space-apps-challenge-announces-10-global-winners
- 2022: https://www.earthdata.nasa.gov/news/2022-space-apps-challenge-winners
- 2020: https://www.earthdata.nasa.gov/news/2020-space-apps-challenge-winners

**Páginas de proyectos y sitios desplegados abiertos:**
- https://quenaris.vercel.app , https://resonant-planet.vercel.app , https://skysense.surf/ , https://astro-sweepers.vercel.app/ , https://henrysfarmadventures.vercel.app/ , https://a-solar-tale.netlify.app/ , https://spacegenes-plus.framer.website/ , https://larasdiniz.github.io/PureFlow-2025/src/public/html/home/home.html , https://github.com/stayingfoolish/gaia-LEO/blob/main/README.md (solo comprobé que responden 200)
- Videos (solo metadatos de duración): https://youtu.be/QvbLhHqKULc , https://www.youtube.com/watch?v=5fBB5YJpfwU , https://youtu.be/hHUpo7bTVuc
- https://2020.spaceappschallenge.org/challenges/confront/spot-fire-3/teams/operation-prometheus
- https://2020.spaceappschallenge.org/challenges/create/lets-connect/teams/fireway/project

**Prensa y repositorios:**
- https://universemagazine.com/en/ukrainian-team-wins-nasa-space-apps-challenge-2024
- https://spaceq.ca/two-canadian-teams-selected-as-global-winners-for-the-nasa-space-apps-challenge/
- https://conecta.tec.mx/en/news/sonora-norte/education/nasa-tec-students-go-world-hackathon-app-vs-forest-fires
- https://github.com/yousefkotp/Lunar-Trek
- https://github.com/commanderxa/dscovry

**Consultadas solo por búsqueda (no abiertas, no usadas como fuente de datos):** Wikipedia (NASA International Space Apps Challenge), militaryaerospace.com, kyivpost.com (Storm Prophet), noticiasambientales.com, prototypesforhumanity.com (Phoenix Eye), ianslive.in y otras notas indias sobre Photonics Odyssey.

**Limitaciones:** no pude abrir las páginas de proyecto de 2022 ni de 2023 y 2024 (2022 por tiempo; 2023 y 2024 porque no son visibles sin sesión); no mido la duración de los demos en Drive/Canva; no leí las listas de finalistas, nominados y menciones honoríficas (cargan con JS); no pude confirmar el texto oficial del reto 2026.
