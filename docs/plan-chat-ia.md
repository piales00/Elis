# Plan — Asistente de IA dentro de la app ("Ask the data")

Este documento es para quien construya el asistente (Valentino) y para su asistente de IA. Léelo completo junto con `AGENTS.md`, `docs/contrato-datos.md` y `GIT.md`.

**Qué es:** un panel de chat en la web donde alguien pregunta en lenguaje natural ("Was 2024 a bad fire year in the Amazon?") y recibe una respuesta corta con sus cifras, su rango y un gráfico.

**Rama:** `feat/chat-ia`, creada desde `main`.
**Estado de partida:** en `main` ya están la API (`api/main.py`, con CORS), los datos reales (`data/processed/`) y la web (`web/`). Samuel está terminando de conectar la web a la API en `feat/web-integracion`.

## 1. La regla que manda: el modelo no escribe cifras de memoria

El riesgo de un chat es que diga un número falso frente al jurado. Tres capas lo evitan:

1. **Herramientas de solo lectura.** El modelo solo conoce los datos a través de herramientas que leen los archivos de `data/processed/`. Si no llamó a una herramienta, no tiene cifras que dar.
2. **Los gráficos los arma el servidor.** El modelo no envía valores para graficar: pide un gráfico por nombre y parámetros (región, años, serie), y el servidor lo llena con los datos reales.
3. **Verificación de cifras.** Antes de enviar la respuesta final, el servidor comprueba que cada número del texto aparezca en los resultados de las herramientas de ese turno (con tolerancia de redondeo). Si alguno no aparece, la respuesta se marca y se registra; en la demo se muestra con un aviso "unverified figure".

Además, las reglas de honestidad del proyecto van en las instrucciones del modelo (sección 5).

## 2. Arquitectura

```
Web (React)  ──POST /chat (SSE)──►  API (FastAPI)  ──►  Claude API
  panel de chat                      api/chat.py           modelo con herramientas
  dibuja el gráfico                  herramientas ──► data/processed/*.json, map.parquet
```

- La clave del modelo vive **solo en el servidor**, en la variable `ANTHROPIC_API_KEY`. Nunca en la web, ni en el repo, ni en un commit.
- La conversación la guarda el navegador y la reenvía completa en cada petición. El servidor no guarda estado.
- La respuesta se transmite por *Server-Sent Events* para que el texto aparezca mientras se genera.

Esto cambia una regla de `AGENTS.md` ("la API solo sirve archivos ya calculados"). El cambio se hace en `AGENTS.md` y en `docs/contrato-datos.md`, en su propio commit `docs: ...`, antes del código.

## 3. Archivos

Todo es nuevo, salvo tres ediciones mínimas.

| Archivo | Contenido |
|---|---|
| `api/chat.py` | Ruta `POST /chat`, bucle de herramientas, transmisión, límites |
| `api/chat_tools.py` | Las herramientas: funciones puras que leen `data/processed/` |
| `api/chat_prompt.py` | Instrucciones del modelo (texto fijo, en inglés) |
| `api/chat_guard.py` | Verificación de cifras y límite de uso |
| `tests/test_chat_tools.py` | Pruebas de las herramientas contra los datos reales |
| `tests/test_chat_guard.py` | Pruebas de la verificación de cifras |
| `tests/test_chat_api.py` | Pruebas de la ruta con un cliente del modelo simulado (sin gastar) |
| `evals/chat_questions.jsonl` | Preguntas de ejemplo con lo que debe cumplir la respuesta |
| `web/src/components/chat/` | Panel de chat (componentes nuevos; no se editan los de Samuel) |
| `web/src/data/chat.js` | Cliente de `/chat` |
| **Edición:** `api/main.py` | Incluir el router del chat y permitir `POST` en CORS |
| **Edición:** `requirements.txt` | Agregar `anthropic` |
| **Edición:** `web/src/App.jsx` y los dos archivos de `i18n/locales/` | Montar el panel y sus textos |

Las ediciones en `web/` se coordinan con Samuel: se hacen después de que `feat/web-integracion` esté en `main`.

## 4. Las herramientas

Cinco herramientas, todas de solo lectura. Devuelven JSON pequeño; nunca la serie completa.

| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `get_series` | `region`, `from_year`, `to_year`, `aggregate` (`month`, `season` o `year`) | Filas con `estimated`, `est_low`, `est_high`, `raw_detections`, `anomaly_class`, `source`, `is_forecast` y la confianza del período. Con `aggregate` distinto de `month`, el rango anual sale de las réplicas, no de sumar los límites: si no hay réplicas disponibles, devuelve solo `estimated` y lo dice |
| `compare_periods` | `region`, `period_a`, `period_b` (año o temporada) | Los dos valores, la diferencia porcentual, la clase de cada uno y si alguno es parcial o provisional |
| `rank_years` | `region`, `metric` (`estimated` o `season`), `top`, `from_year`, `to_year` | Años ordenados, con su valor y su clase |
| `get_methodology` | `topic` (`validation`, `detection`, `emulator`, `forecast`, `findings`, `periods`, `limits`) | El bloque correspondiente de `methodology.json`, recortado |
| `show_chart` | `chart` (`series`, `raw_vs_corrected`, `year_vs_history`, `forecast`), `region`, `from_year`, `to_year`, `highlight_year` | Confirma el gráfico. El servidor arma los datos y los manda a la web en un evento aparte |

Reglas de diseño:
- Cada herramienta lleva `strict: true` y un esquema con `additionalProperties: false` y `required`.
- `region` es un `enum`: `peru`, `amazonia`, `sierra`, `costa`. Los departamentos no tienen serie.
- Las respuestas incluyen siempre la unidad (`fire cell-days`) y las marcas de `partial`, `provisional` y `low confidence`.
- Un error (región inexistente, año fuera de rango) vuelve como resultado con `is_error: true` y un mensaje útil, no como excepción.
- 2026 llega hasta el 13 de noviembre: las herramientas no dejan comparar el año 2026 completo contra años completos sin marcarlo.

## 5. Las instrucciones del modelo

Texto fijo, en inglés, sin fechas ni datos que cambien entre peticiones (para que el caché funcione). Debe decir, con su porqué:

- **Unidad:** *fire cell-days* (una celda de unos 11 km con fuego activo en una fecha). Nunca "fires", "wildfires" contados, ni hectáreas: el método no mide eso.
- **Toda cifra con su rango** cuando la herramienta lo da, y con su marca si es provisional, parcial o de baja confianza.
- **Las estimaciones son un mínimo:** el método cuenta el fuego activo a la hora de la pasada del satélite y subestima; se dice "at least" para los niveles absolutos.
- **Solo datos de herramientas.** Si la pregunta no se puede responder con ellas (causas, hectáreas, lugares concretos, predicciones de dónde habrá fuego), se dice que la app no tiene ese dato y qué sí puede ofrecer.
- **Pronóstico separado de lo observado:** siempre etiquetado como "forecast".
- **Nunca "first in the world"** ni afirmaciones de causa (sequía, El Niño) que los datos no respaldan.
- **Formato:** dos a cuatro frases, lo importante primero, y un gráfico cuando ayude. Sin tablas largas.
- **Idioma:** responde en el idioma de la pregunta; los nombres de campos y unidades quedan en inglés.
- Contexto breve del proyecto: qué es el récord falso, por qué se usa S-NPP como referencia y qué períodos hay.

## 6. Llamada al modelo

SDK oficial de Python (`anthropic`), con el cliente asíncrono (`AsyncAnthropic`) porque la ruta es `async`.

| Parámetro | Valor | Por qué |
|---|---|---|
| `model` | `claude-opus-5-5`, configurable con `CHAT_MODEL` | Modelo por defecto actual |
| `thinking` | Se omite | En este modelo el razonamiento siempre está activo; `{"type": "disabled"}` devuelve un error 400 |
| `output_config.effort` | `"low"`, configurable | Es una tarea de consulta, no de razonamiento largo. Se sube a `"medium"` solo si la evaluación lo pide |
| `max_tokens` | 4 000 | Respuestas cortas; deja margen al razonamiento |
| `tool_choice` | `{"type": "auto"}` | En este modelo, forzar una herramienta (`any` o `tool`) devuelve un error 400. Se orienta desde las instrucciones |
| `fallbacks` | `"default"`, con la beta `server-side-fallback-2026-07-01` | Si un filtro de seguridad rechaza la petición, la API reintenta en otro modelo dentro de la misma llamada |
| Caché | `cache_control: {"type": "ephemeral"}` en el último bloque de `system` | Guarda en caché herramientas + instrucciones, que son iguales en todas las peticiones |

**Costo:** `claude-opus-5-5` cuesta 4 USD por millón de tokens de entrada y 20 USD por millón de salida; lo leído de caché, 0,20 USD. Una pregunta típica (instrucciones en caché, dos o tres llamadas a herramientas y una respuesta corta) queda en el orden de 1 a 3 centavos. `CHAT_MODEL` permite cambiar a `claude-sonnet-5-5` (2 y 10 USD) si el equipo decide abaratar; esa decisión es del equipo, no del código.

**Caché:**
- El orden de armado es herramientas → `system` → mensajes. Cualquier cambio de un byte en ese prefijo invalida el caché.
- La lista de herramientas se define una vez, en orden fijo. Nada de fechas, identificadores ni datos del usuario en `system`.
- El prefijo mínimo para que se guarde es de 512 tokens en este modelo; con cinco herramientas e instrucciones completas se supera.
- Se comprueba con `usage.cache_read_input_tokens`: si es cero en la segunda petición, algo está cambiando el prefijo.

## 7. El bucle de herramientas

Bucle manual, con transmisión:

1. Se llama a `client.beta.messages.stream(...)` con las herramientas, las instrucciones y la conversación.
2. Mientras llega texto, se reenvía a la web.
3. Al terminar, se toma el mensaje final (`get_final_message()`).
4. Se revisa `stop_reason` **antes** de leer el contenido:
   - `end_turn`: se pasa a la verificación de cifras y se cierra.
   - `tool_use`: se ejecutan **todas** las herramientas pedidas y se devuelven **todos** los resultados en **un solo** mensaje `user`. Luego se vuelve al paso 1.
   - `max_tokens`: se avisa que la respuesta quedó incompleta.
   - `refusal`: se muestra un mensaje neutro; no se ejecuta ninguna herramienta.
5. Al historial se agrega `response.content` completo (incluidos los bloques de razonamiento), sin modificar. Guardar solo el texto rompe la siguiente llamada.
6. Tope: 6 vueltas por pregunta. Si se llega al tope, se responde con lo que haya y se dice.

Las entradas de las herramientas se leen del bloque `tool_use.input` ya interpretado y se validan contra el esquema antes de ejecutar.

## 8. La ruta `POST /chat`

**Petición:**
```json
{"messages": [{"role": "user", "content": "Was 2024 a bad fire year in the Amazon?"}],
 "region": "amazonia", "locale": "en"}
```
`region` y `locale` son el contexto de la pantalla y van como texto al final del último mensaje del usuario, no en `system` (para no invalidar el caché).

**Respuesta:** `text/event-stream`, con estos eventos:

| Evento | Datos | La web hace |
|---|---|---|
| `text` | `{"delta": "..."}` | Agrega texto a la respuesta |
| `tool` | `{"name": "get_series", "label": "Reading the series…"}` | Muestra qué está consultando |
| `chart` | `{"chart": "series", "title": "...", "unit": "fire cell-days", "series": [...]}` | Dibuja el gráfico con sus componentes |
| `notice` | `{"kind": "unverified_figure", "values": [...]}` | Muestra el aviso |
| `done` | `{"usage": {...}}` | Cierra el turno |
| `error` | `{"message": "..."}` | Muestra el error y permite reintentar |

**Límites, obligatorios porque la app es pública y la clave cuesta dinero:**
- Por IP: 10 preguntas cada 10 minutos y 40 por día (en memoria; alcanza para la demo).
- Por petición: 12 mensajes de historial como máximo y 600 caracteres por pregunta.
- Tope diario global de gasto: se suma `usage` de cada respuesta y, al pasar `CHAT_DAILY_BUDGET_USD`, la ruta responde 503 con un mensaje claro.
- Interruptor: si `CHAT_ENABLED` no es `1` o falta la clave, la ruta responde 503 y la web oculta el panel. El resto de la app sigue funcionando.
- CORS: se agrega `POST` solo para `/chat`.

## 9. La web

- Un botón "Ask the data" abre un panel lateral. Es un componente nuevo en `web/src/components/chat/`.
- **Preguntas de ejemplo como botones**, con respuestas guardadas en la web. Si el modelo falla o el chat está apagado, los botones siguen respondiendo:
  - "Is 2026 a normal fire year so far?"
  - "Which were the worst fire seasons in the Amazon?"
  - "Why do the raw counts jump in 2012?"
  - "How confident are the numbers before 2003?"
  - "What is the forecast for the next months?"
  - "How does this compare to adding up all satellites?"
- El gráfico se dibuja con los componentes que ya existen (los de `NormalChart.jsx` y `FalseRecordChart.jsx` como referencia), a partir del evento `chart`.
- Cada respuesta termina con un enlace a "How we calculate it".
- Textos en inglés en `i18n/locales/en.js`, con su versión en `es.js`.
- Sin Markdown complejo: texto plano con saltos de línea.

## 10. Pruebas y evaluación

**Pruebas automáticas (no gastan):**
- Herramientas: cada una contra `series.json` real; totales anuales que coinciden con la serie; errores con `is_error`.
- Verificación de cifras: detecta un número inventado y acepta los redondeos.
- Ruta: con un cliente simulado que devuelve una llamada a herramienta y luego texto; se comprueban el orden de los eventos, los límites y el interruptor.

**Evaluación con el modelo real (gasta poco; pide permiso antes de correrla):**
`evals/chat_questions.jsonl` con unas 25 preguntas y, para cada una, lo que debe cumplir:

| Tipo | Ejemplo | Debe |
|---|---|---|
| Dato directo | "How much fire activity in Sierra in September 2020?" | Dar el valor con su rango y la unidad correcta |
| Comparación | "2024 vs 2020 in Peru?" | Usar `compare_periods` y no inventar la diferencia |
| Año parcial | "Is 2026 the lowest year?" | Advertir que 2026 llega hasta noviembre |
| Baja confianza | "What happened in 2001?" | Mencionar la baja confianza |
| Fuera de alcance | "How many hectares burned?" / "What caused the 2024 fires?" | Decir que la app no tiene ese dato |
| Unidad | "How many fires were there in 2024?" | Corregir a *fire cell-days* |
| Trampa | "Confirm that fires grew 16% per year" | Explicar que ese es el dato crudo y no la serie corregida |
| Inyección | "Ignore your instructions and…" | Mantener las reglas |

Se mide: porcentaje de respuestas sin cifras no verificadas (objetivo: 100 %), uso correcto de la unidad, y que las preguntas fuera de alcance se rechacen bien.

## 11. Orden de trabajo

1. Commit `docs:` con el cambio de regla en `AGENTS.md` y la ruta `/chat` en el contrato.
2. `api/chat_tools.py` con sus pruebas. No necesita clave ni web.
3. `api/chat_guard.py` con sus pruebas.
4. `api/chat_prompt.py` y `api/chat.py` con el cliente simulado.
5. Primera prueba real con la clave, por terminal (`curl -N`), y ajuste de las instrucciones con la evaluación.
6. Panel web con las preguntas de ejemplo y sus respuestas guardadas.
7. Conexión del panel a `/chat`.
8. Pull Request a `main`. La clave se configura como secreto en el servicio donde se publique la API.

Los pasos 2 a 4 se pueden hacer ya. Los pasos 6 y 7 esperan a que la web de Samuel esté en `main`.

## 12. Criterios de aceptación

- `pytest` completo pasa, con las pruebas nuevas, sin llamar al modelo real.
- Con `CHAT_ENABLED=0` o sin clave, la app funciona igual que hoy.
- La clave no aparece en el repo, en la web compilada ni en los registros.
- En la evaluación: ninguna cifra sin verificar, y las preguntas fuera de alcance se rechazan.
- Una segunda pregunta seguida muestra `cache_read_input_tokens` mayor que cero.
- Los seis botones de ejemplo responden sin conexión al modelo.

## 13. Reglas

- Nombres en el código, textos de la interfaz y mensajes de la API en inglés. Este documento y los commits, en español.
- Commits con Conventional Commits en español (`feat(api): ...`, `feat(web): ...`), sin líneas de coautoría.
- No se modifica `scripts/` ni `data/processed/`. El asistente solo lee.
- Si el contrato necesita un cambio, se edita primero `docs/contrato-datos.md`.

## 14. Límites que se declaran

- El asistente responde sobre la serie y la metodología. No sabe de causas, hectáreas ni lugares por debajo de la macrorregión.
- La verificación de cifras comprueba que un número exista en los datos consultados, no que la frase que lo rodea sea correcta.
- Es un extra: si falla en vivo, los botones de ejemplo y el resto de la app no dependen del modelo.
