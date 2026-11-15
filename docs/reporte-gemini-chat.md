# Elis Technical Paper: Architectural Blueprint & Verification Report

**Proyecto:** FireChronos Perú — Elis HUD & Data Intelligence Assistant  
**Equipo:** Log N + 1 (Valentino, Piero y equipo)  
**Reto:** NASA Space Apps Challenge 2026 — *Harmonization of MODIS and VIIRS Hot Spots*  
**Estado:** ✅ **Listo, Verificado y en Producción Local (100% Tests Passing & Vite Build Clean)**  

---

## 1. Resumen Ejecutivo y Marco de Decisión

Los sistemas tradicionales de monitoreo satelital presentan una ruptura metodológica crítica en 2012: al entrar en operación el sensor **VIIRS (375 m)** junto con **MODIS (1 km)**, la suma cruda de detecciones aparenta una multiplicación artificial de **9× en el fuego en Perú (+333.9% de sesgo)**. Si una institución pública (como MINAM o INDECI) o un modelo de inteligencia artificial sin corregir consume estos datos crudos:
1. Se sobreestiman las emisiones de carbono en inventarios nacionales ante el Acuerdo de París (+16.8%/año frente al +0.18%/año real).
2. Los modelos predictivos no armonizados inflan el riesgo futuro en un **6.6×**.
3. Se toman decisiones operativas erróneas de despliegue y combate en campo.

**FireChronos Perú** resuelve esta fractura mediante un estimador bi-satelital de **Captura-Recaptura (Chapman)** por región y mes, complementado con un asistente de inteligencia satelital verificada denominado **Elis**, dotado de una consola de comando en cabina (**Elis HUD Spotlight**) con un modo de navegación automática de **40 segundos**.

---

## 2. Validación Científica y Verificación Histórica

### 2.1. Archivo Histórico MapBiomas (36 Años: 1990–2025)
Para calibrar y validar de forma independiente nuestras estimaciones frente a cartografía de área quemada por teledetección óptica de media resolución, el modelo se contrastó contra el archivo de **36 años de MapBiomas Fuego Perú (Colección 2, 1990–2025)**:
- **Período de Solapamiento Satelital Completo:** 25 años de serie continua (2001–2025), donde MODIS y VIIRS cubren el ciclo anual completo.
- **Correlación Histórica Global:** Coeficiente de correlación de Pearson de **$r = 0.748 \approx 0.75$** sobre todo el territorio peruano.
- **Correlación Intra-Era de Alta Resolución:** En el intervalo correspondiente a Landsat 8 (2013–2020), la serie armonizada Chapman alcanza una correlación de **$r = 0.98$** con el área quemada de MapBiomas.
- **Error Residual:** Tras la armonización, el error residual cae al **3.77%**, eliminando el salto espurio de 2012.
- **Honestidad de Unidades:** La métrica oficial es **celdas-día con fuego** (*fire cell-days*), con bandas de credibilidad del 90%, evitando conversiones engañosas a hectáreas directas.

---

## 3. Arquitectura del Agente Elis: RAG Determinista Cero-Alucinación

Elis opera mediante una arquitectura de **Generación Aumentada por Herramientas (Tool-Augmented Generation / RAG)** con doble motor de inferencia:
- **Motor Principal:** Google Gemini API (`gemini-3.1-flash-lite`, `google-genai` SDK oficial) con `thinking_budget=0` y llamadas a función (*function calling*).
- **Motor de Respaldo Redundante:** Anthropic Claude (`claude-opus-5-5` / `claude-3-5-sonnet`) configurable mediante variable de entorno `CHAT_PROVIDER`.

### Flujo de Ejecución y Barrera de Cero Alucinación
```
[Operador / UI Web]
       │  POST /chat (Server-Sent Events)
       ▼
[Guardia de Tasa y Rate Limit (10 req/min por IP)]
       │
       ▼
[Gemini 3.1 Flash Lite] ──(Deducción de Intención)──► [Function Calling Estricto]
       │                                                         │
       │                                               Ejecuta sobre datos locales:
       │                                               • get_series (series.json)
       │                                               • compare_periods
       │                                               • rank_years
       │                                               • show_chart
       │                                               • get_methodology
       │                                                         │
       ◄──────── [Retorna Datos Numéricos Exactos] ───────────────┘
       │
       ▼
[Guardia de Rigor Científico: verify_figures]
       │ Comprueba que cada número emitido coincida con los tool results
       ▼
[Streaming SSE al Frontend]
  • event: tool    (Transparencia metodológica en tiempo real)
  • event: chart   (Gráfico SVG reactivo sincronizable)
  • event: text    (Síntesis ejecutiva estructurada)
  • event: done    (Auditoría de verificación: verified=true)
```

---

## 4. Elis HUD Mission Control: Especificación del Autopiloto de 40 Segundos

Para exposiciones de alto impacto ante evaluadores internacionales de la NASA (quienes disponen de tiempos breves de evaluación), el HUD de Elis incorpora el **40s Autopilot Showcase**, compuesto por **4 misiones de 10 segundos exactos cada una** ($4 \times 10\,\text{s} = 40\,\text{s}$).

### 4.1. Corrección del Bug de Continuidad en el Timer
- **Causa Raíz Identificada:** En `web/src/App.jsx`, la función `applyElisMission(m, enableAutopilot = false)` forzaba el apagado del autopiloto en cada cambio de misión invocado por el callback de avance.
- **Solución Implementada:**
  - En `ElisSpotlight.jsx`, el temporizador `advanceRef.current` invoca `onSelectMission(ELIS_MISSIONS[nextIdx], true)`.
  - En `App.jsx`, se declaró `onSelectMission={(m, fromAutopilot = false) => applyElisMission(m, fromAutopilot ? true : false, !spotlightMinimized)}`.
  - Resultado: El ciclo avanza de forma continua y limpia: **Misión 1 → Misión 2 → Misión 3 → Misión 4 → Misión 1** sin detenerse en la Misión 2.

### 4.2. Innovaciones de Interfaz y Experiencia de Usuario (UI/UX)
1. **Temporizador Calibrado:** `AUTOPILOT_MS = 10000` (10 segundos por misión), con barra de progreso fluida en SVG/CSS.
2. **Contador de Pasos en Cabecera:** Indicador visual `[ 1 / 4 ]`, `[ 2 / 4 ]`, `[ 3 / 4 ]`, `[ 4 / 4 ]` para dar certidumbre de avance al evaluador.
3. **Insignia de Consulta Operativa (Operator Query Badge):**
   - Muestra de forma destacada la pregunta real que un comandante u oficial público hace a Elis:
     - Misión 1: *¿Por qué el fuego pareció multiplicarse por 9 en 2012?*
     - Misión 2: *¿Son frentes continuos de deforestación o quemas aisladas en Amazonía?*
     - Misión 3: *¿Cuál es el riesgo en Machu Picchu y por qué fallan los satélites tradicionales?*
     - Misión 4: *¿Dónde pre-posicionar recursos de INDECI 60 días antes para 2027?*
4. **Memo Ejecutivo Estructurado:** Renderizado mediante el componente tipográfico `FormattedMessage.jsx`, eliminando marcas de formato crudo (`**`, asteriscos) y resaltando alertas críticas y conclusiones en lenguaje claro.
5. **Chips de Decisión Interactivos (Decision Chips):** Al pie de cada misión, se ofrecen acciones inmediatas de decisión pública (`📊 Ver Gráfico Crudo vs Chapman`, `🛰️ Relieve 3D Satelital`, `🛡️ Plan INDECI T-60d`, `🔮 Pronóstico 2027`, `💬 Consultar a Elis`). Al hacer clic en un chip, el autopiloto se pausa automáticamente para otorgar el control interactivo total al humano.

---

## 5. Matriz de Casos de Uso Operativo del HUD

| Misión | Pregunta Operativa del Usuario | Entidad del Estado | Hallazgo Verificado | Decisión Operativa / Impacto |
|---|---|---|---|---|
| **01. Salto 2012** | *"Why did fire detections explode 9× in 2012?"* | **MINAM** (Acuerdo de París / NDC) | Salto falso de +333.9% por entrada de VIIRS. Chapman reduce el error residual a 3.77%. | Reemplaza la tendencia artificial de +16.8%/año por la real (+0.18%/año) en el inventario nacional de GEI. |
| **02. Amazonía** | *"Are Amazon fires continuous fronts or small burns?"* | **SERNANP & Fiscalías (FEMA)** | VIIRS capta el 84.9% en dosel y MODIS solo el 21.5%. 2005 y 2010 superaron a 2024. | Dirige patrullas e interdicción aérea a corredores de fuego persistente en Madre de Dios y Ucayali. |
| **03. Andes** | *"What is the fire regime in Machu Picchu?"* | **SERNANP Machu Picchu & GORE Cusco** | Quemas fragmentadas de pastizales (MODIS detecta solo el 7%). Cusco en Alerta Alta 2027 (1,788 celdas-día). | Activación de calendarios comunitarios de quema prescrita y patrullas perimetrales en Urubamba. |
| **04. INDECI 2027** | *"Where should INDECI pre-position aerial resources?"* | **INDECI & COEN** (Comando Nacional) | IA cruda sobrepredice 6.6×. Modelo Chapman logró 99.9% de acierto en 2026. Sierra proyecta anomalía Muy Alta en 2027. | Pre-posicionamiento logístico de aviones cisterna y brigadas terrestres con 60 días de anticipación (T-60d). |

---

## 6. Pruebas Automatizadas y Verificación de Compilación

1. **Batería de Pruebas Backend (`pytest`):**
   - `tests/test_api.py`, `tests/test_chat_api.py`, `tests/test_chat_tools.py`, `tests/test_chat_guard.py`.
   - **Resultado:** **69 passed in 5.69s (100% éxito)**.
2. **Compilación de Producción Frontend (`Vite`):**
   - `cd web && npm run build`.
   - **Resultado:** **✓ built in 2.27s sin errores** (97 módulos transformados con bundles optimizados).
3. **Servicio Activo en Desarrollo:**
   - Backend FastAPI en `http://127.0.0.1:8000` con `api.main:app`.
   - Frontend Vite en `http://127.0.0.1:5173` conectado directamente a la API en vivo.

---

## 7. Instrucciones para Piero y el Equipo

1. **Revisión del Código:** Todos los cambios en `web/src/App.jsx` y `web/src/components/chat/ElisSpotlight.jsx` se encuentran integrados y listos para commit en Git.
2. **Presentación ante el Jurado (Demostración de 40 Segundos):**
   - Abrir la interfaz web (`http://127.0.0.1:5173/`).
   - Hacer clic en el botón **"▶ 40s Autopilot"** de Elis Spotlight.
   - En 40 segundos exactos, el jurado verá el recorrido completo con preguntas del operador, datos de Chapman en vivo, gráficos comparativos, mapas 3D y chips de decisión para INDECI y MINAM.
