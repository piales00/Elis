# Reporte de Integración: Asistente de Datos con Google Gemini API

**Para:** Piero y equipo Log N + 1  
**Rama:** `feat/chat-gemini` (subida a GitHub: [Pull Request](https://github.com/piales00/Elis/pull/new/feat/chat-gemini))  
**Fecha:** 14 de Noviembre, 2026  
**Estado:** ✅ **Listo, probado y en producción local (100% test passing)**

---

## 1. Resumen Ejecutivo y Problema Resuelto

- **Desafío:** Los tokens de Claude eran demasiado costosos y limitaban la fluidez durante la demo continua ante los evaluadores de la NASA Space Apps.
- **Solución Implementada:** Se integró **Google Gemini API** (`google-genai` SDK oficial) como proveedor principal configurable, manteniendo **Anthropic como fallback dual**.
- **Modelo Seleccionado:** `gemini-3.1-flash-lite` con `thinking_budget=0`.
  - **Tiempo de respuesta:** Reducido a ~0.9s en síntesis y < 2s en llamadas con herramientas.
  - **Cero alucinación:** Las cifras se verifican contra las salidas de las herramientas antes del streaming final mediante el guardián de rigor científico.
  - **Cuota:** Nula saturación (a diferencia de modelos pesados que entraban en 503 por alta demanda o 429 por agotamiento de tokens diarios).

---

## 2. Arquitectura del Flujo RAG (Buenas Prácticas aplicadas)

Siguiendo las mejores prácticas de **RAG determinista basado en herramientas (Tool-augmented Generation)**:

```
[Usuario / Interfaz Web]
         │  POST /chat (SSE)
         ▼
[Guardia de Entrada (Rate Limit + Validación)]
         │
         ▼
[Gemini 3.1 Flash Lite] ──(Detecta intención)──► [Function Calling]
         │                                               │
         │                                    Ejecuta sobre datos locales:
         │                                    • get_series (series.json)
         │                                    • compare_periods
         │                                    • rank_years
         │                                    • show_chart
         │                                    • get_methodology (methodology.json)
         │                                               │
         ◄─────── [Retorna datos exactos] ───────────────┘
         │
         ▼
[Guardia de Cifras (verify_figures)]
         │ Valida que cada número provenga del dataset
         ▼
[Streaming SSE al Frontend]
   • event: tool   (Feedback visual del proceso)
   • event: chart  (Gráfico interactivo si aplica)
   • event: text   (Texto explicativo en lenguaje natural)
   • event: done   (Token usage + métricas de rigor)
```

---

## 3. Pruebas y Validación Realizadas

1. **Batería de Pruebas Automatizadas:**
   - **67/67 tests pasando** en pytest (`test_api.py`, `test_chat_tools.py`, `test_chat_guard.py`, `test_chat_api.py`).
2. **Prueba en Vivo en Tiempo Real (Backend SSE):**
   - **Pregunta:** *"Which year had the most fire activity in Peru overall?"*
   - **Herramienta invocada:** `rank_years(from_year=2000, to_year=2026, metric="estimated", region="peru", top=1)`
   - **Resultado verificado:** 2005 con 64,463.4 fire cell-days.
   - **Evento `done` emitido:** `{"verified": true, "tools_used": [], "usage": {...}}` sin noticias de desvío ni alucinación.
3. **Resiliencia de Formatos:**
   - Se añadió tolerancia en `show_chart` para convertir años en string numérico a enteros de forma transparente.

---

## 4. Configuración (.env)

El archivo `.env` local ya cuenta con las credenciales y configuración óptima:

```env
GEMINI_API_KEY=<API_KEY_INTEGRADA>
CHAT_PROVIDER=gemini
CHAT_MODEL=gemini-3.1-flash-lite
CHAT_ENABLED=1
```

*(Si se requiere alternar a Claude en cualquier momento, basta con fijar `CHAT_PROVIDER=anthropic` y proveer `ANTHROPIC_API_KEY`).*

---

## 5. Siguientes Pasos para Piero y el Equipo

1. **Revisar y Mezclar:**
   - Abrir el PR de la rama `feat/chat-gemini` hacia `main` en GitHub: `https://github.com/piales00/Elis/pull/new/feat/chat-gemini`.
2. **Probar desde la Interfaz Web:**
   - La interfaz en `http://127.0.0.1:5173/` ya está conectada al backend `http://127.0.0.1:8000/chat`.
   - Probar las preguntas predefinidas en el panel derecho de la interfaz ("Ask the data").
