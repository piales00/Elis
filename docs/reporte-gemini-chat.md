# Elis: revisión técnica del asistente y de la demostración guiada

**Equipo:** Log N + 1
**Reto:** NASA Space Apps 2026 — *Harmonization of MODIS and VIIRS Hot Spots*

## Alcance

Ask Elis permite consultar los datos procesados, comparar periodos y mostrar gráficos. El recorrido guiado sirve para presentar el proyecto. No se ha evaluado su eficacia para despliegue de brigadas, planificación de cortafuegos, protección de sitios concretos ni elaboración de inventarios nacionales de emisiones.

La unidad es **fire cell-days**: una celda de 0,1° (aproximadamente 11 km) con al menos una detección en una fecha. No equivale a un incendio individual ni a superficie quemada. Las reconstrucciones llevan rangos del 90%; los pronósticos se muestran separados de lo observado.

## Arquitectura comprobada

`api/chat.py` expone `POST /chat` mediante Server-Sent Events. El proveedor se selecciona mediante `CHAT_PROVIDER` y las credenciales disponibles. `render.yaml` selecciona Gemini y el modelo predeterminado de ese proveedor es `gemini-3.1-flash-lite`. Anthropic es una alternativa configurable; el código no demuestra una conmutación automática de Gemini a un respaldo redundante.

Las herramientas de `api/chat_tools.py` consultan los agregados precalculados: series, comparaciones, rankings, gráficos y metodología. No ejecutan el cálculo pesado de armonización durante la consulta.

`verify_figures`, en `api/chat_guard.py`, compara los números del texto con los resultados de las herramientas, con tolerancias y excepciones para constantes, fechas, años e identificadores de satélites. **Las cifras se verifican contra los datos procesados**; esto no garantiza que la interpretación, la atribución temporal o una afirmación causal sean correctas. Los valores no respaldados pueden producir un aviso, y la respuesta de cierre comunica el resultado de la verificación.

## Límites de uso y coste

El código permite **5 preguntas cada 10 minutos** y **20 por cada ventana móvil de 24 horas**, por IP. La configuración de despliegue fija **USD 0,50 diarios** mediante `CHAT_DAILY_BUDGET_USD="0.5"` en `render.yaml`. El valor de respaldo de `chat_guard.py` sigue siendo USD 5,00 si falta la variable o es inválida: no se debe confundir ese respaldo con la configuración de despliegue.

El presupuesto se comprueba antes de admitir una petición y utiliza gasto registrado en memoria. Una petición en curso puede superar el umbral; no es un tope de facturación persistente entre reinicios o múltiples procesos. La plantilla mantiene `CHAT_ENABLED=0`, por lo que la disponibilidad real depende de la configuración del servicio y de sus credenciales.

## Correcciones de las afirmaciones anteriores

| Afirmación anterior | Redacción respaldada |
|---|---|
| Interfaz sin alucinaciones | Verificación numérica contra resultados de herramientas; sin garantía semántica |
| Salto de 333,9% en 2012 | 10.375 detecciones en 2011 y 92.807 en 2012: factor 8,95. El 333,90% corresponde a otra comparación, de 2021–2024 |
| Error residual absoluto del 3,77% | Discrepancia anual media entre reconstrucciones Aqua y VIIRS en años reservados; no error frente a la población real |
| Riesgo futuro sobrepredicho 6,6 veces | En el experimento estacional de `forecast.json`, razón mediana observado/predicho de 4,49 con datos crudos y 1,02 con armonizados: subpredicción tras el cambio de sensores |
| Acierto de 99,9% en 2026 | Las referencias nacionales y de las tres macrorregiones quedan dentro de sus rangos predictivos; una temporada no mide la calibración general |
| Alteración demostrada de inventarios de gases de efecto invernadero | Se documenta una discontinuidad en la serie de detecciones; no se evaluaron inventarios de emisiones |
| Recomendaciones de despliegue, patrullaje o respuesta local | Exploración de evidencia histórica y de pronósticos regionales, sin validación de eficacia operativa |
| Agencias y mandatos atribuidos al HUD | Se eliminan asociaciones institucionales y mandatos no demostrados |
| Validación o calibración con 36 años completos de MapBiomas | Validación anual en años compartidos de 2001–2025; MapBiomas no calibra el estimador |

Las cifras anteriores proceden de `series.json`, `methodology.json → validation` y `forecast.json → raw_vs_corrected`. El artículo técnico incluye los rangos de las reconstrucciones y pronósticos. Las tasas de error y correlaciones son resúmenes descriptivos; los JSON no suministran intervalos de muestreo para ellos.

## MapBiomas: ventana efectiva

`scripts/mapbiomas.py` conserva datos de 2000–2025 con los parámetros de `scripts/config.py`. `scripts/validate.py` excluye el primer año incompleto y calcula la correlación en años compartidos de 2001–2025. No existe cobertura de VIIRS durante toda esa ventana.

La correlación nacional almacenada es **r = 0,748**. Se compara la variación anual de área quemada con la de celdas-día activas, sin convertir entre unidades. Los cambios de sensores de MapBiomas y el filtrado con focos FIRMS en los Andes limitan su independencia. La correlación por era Landsat citada en la nota 06 no está exportada en los JSON procesados y no se repite aquí como comprobación nueva.

## Recorrido guiado

`ElisSpotlight.jsx` utiliza `AUTOPILOT_SECONDS = 40` y reparte esa duración entre cuatro misiones de 10 segundos. El recorrido termina al completar la última misión, sujeto a la programación del navegador. El temporizador pasa la marca `fromAutopilot` y `App.jsx` mantiene el recorrido activo; una selección manual lo pausa. El contador de pasos, los textos formateados y los accesos al mapa y a los gráficos son recursos de presentación, no pruebas de impacto público.

## Verificación reproducible

```bash
python -m pytest -q
python scripts/check_report_figures.py
```

Se retiran los antiguos recuentos y tiempos de pruebas y compilación: no describen necesariamente el estado actual. Un resultado de pruebas no equivale a precisión científica ni demuestra que un servicio esté disponible. La configuración de datos y API no cambia con esta revisión documental.
