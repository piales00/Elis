import saved from "./chat-presets.json";
import { API_BASE } from "../config.js";

export const PRESET_QUESTIONS = [
  { id: "about_elis", key: "chat.preset.aboutElis", defaultRegion: null },
  {
    id: "normal_2026",
    key: "chat.preset.normal2026",
    defaultRegion: null,
  },
  {
    id: "worst_amazon",
    key: "chat.preset.worstAmazon",
    defaultRegion: "amazonia",
  },
  {
    id: "jump_2012",
    key: "chat.preset.jump2012",
    defaultRegion: "peru",
  },
  {
    id: "conf_pre2003",
    key: "chat.preset.confPre2003",
    defaultRegion: "peru",
  },
  {
    id: "forecast_next",
    key: "chat.preset.forecastNext",
    defaultRegion: null,
  },
  {
    id: "compare_naive",
    key: "chat.preset.compareNaive",
    defaultRegion: "peru",
  },
];

export function buildPresetResponse(presetId, { locale = "en" }) {
  const preset = saved.presets[presetId] || saved.presets.compare_naive;
  return {
    text: preset[locale === "es" ? "es" : "en"],
    tools: [],
    verified: true,
    chart: preset.chart,
  };
}

export async function streamChat({ messages, region, locale, onEvent, signal }) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ messages, region, locale }),
    signal,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && body.detail) detail = body.detail;
    } catch {
      // ignore json parse failure
    }
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawBlock = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);
      if (!rawBlock) continue;

      let eventName = "message";
      let dataStr = "";
      for (const line of rawBlock.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataStr += line.slice(5).trim();
        }
      }
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          onEvent(eventName, parsed);
        } catch {
          // ignore malformed SSE chunk
        }
      }
    }
  }
}

const TARGET_PLACES = [
  { kw: ["madre de dios", "tambopata", "manu"], es: "Madre de Dios", en: "Madre de Dios", macro: "amazonia", cam: "madre_de_dios" },
  { kw: ["cusco", "cuzco", "machu picchu", "urubamba", "valle sagrado", "sacred valley"], es: "Cusco y Machu Picchu", en: "Cusco & Machu Picchu", macro: "sierra", cam: "cusco" },
  { kw: ["ucayali", "pucallpa"], es: "Ucayali", en: "Ucayali", macro: "amazonia", cam: "ucayali" },
  { kw: ["puno", "titicaca"], es: "Puno", en: "Puno", macro: "sierra", cam: "puno" },
  { kw: ["junin", "junín"], es: "Junín", en: "Junín", macro: "sierra", cam: "junin" },
  { kw: ["san martin", "san martín", "tarapoto"], es: "San Martín", en: "San Martín", macro: "amazonia", cam: "san_martin" },
  { kw: ["loreto", "iquitos"], es: "Loreto", en: "Loreto", macro: "amazonia", cam: "loreto" },
  { kw: ["ancash", "áncash", "huaraz"], es: "Áncash", en: "Áncash", macro: "sierra", cam: "sierra" },
  { kw: ["piura"], es: "Piura", en: "Piura", macro: "costa", cam: "costa" },
];

export function buildDecisionSuggestions({ question = "", region = "peru", locale = "en" }) {
  const q = String(question || "").toLowerCase();
  const isEs = locale === "es" || /(cual|cuál|como|cómo|que|qué|incendio|fuego|pronostico|pronóstico|madre de dios)/i.test(q);
  let macro = region || "peru";
  let cam = macro;
  const regMapEs = { peru: "Perú", amazonia: "la Amazonía", sierra: "la Sierra (Andes)", costa: "la Costa" };
  const regMapEn = { peru: "Peru", amazonia: "the Amazon", sierra: "the Andes (Sierra)", costa: "the Coast" };
  let labelEs = regMapEs[macro] || "Perú";
  let labelEn = regMapEn[macro] || "Peru";

  for (const p of TARGET_PLACES) {
    if (p.kw.some((k) => q.includes(k))) {
      labelEs = p.es;
      labelEn = p.en;
      macro = p.macro;
      cam = p.cam;
      break;
    }
  }

  const target = isEs ? labelEs : labelEn;
  const askedForecast = /(pronostico|pronóstico|2027|forecast|outlook|alerta temprana)/i.test(q);
  const askedContinuity = /(continuity|continuidad|emulador|emulator)/i.test(q);
  const askedSensors = /(sensor|modis|viirs|2012|desacuerdo|chapman|salto|disagreement)/i.test(q);

  const chips = [];
  if (!askedForecast) {
    chips.push({
      id: "ChipForecast2027",
      label: isEs ? `🔮 Pronóstico 2027: ${target}` : `🔮 2027 Outlook: ${target}`,
      prompt: isEs
        ? `¿Cuál es el pronóstico estacional 2027, el rango al 90% y la clase de anomalía para ${target}?`
        : `What is the 2027 seasonal outlook, 90% range, and anomaly class for ${target}?`,
      region: macro,
      cameraKey: cam,
      mode3d: true,
    });
  }
  if (!askedContinuity) {
    chips.push({
      id: "ChipContinuity",
      label: isEs ? `🛡️ Continuidad tras MODIS (${target})` : `🛡️ Continuity after MODIS (${target})`,
      prompt: isEs
        ? `¿Cómo mantiene el emulador la escala MODIS y cuáles son sus límites en ${target}?`
        : `How does the emulator maintain the MODIS scale and what are its limits in ${target}?`,
      region: macro,
      cameraKey: cam,
      mode3d: true,
    });
  }
  if (!askedSensors) {
    chips.push({
      id: "ChipSensorComparison",
      label: isEs ? "🛰️ Comparar MODIS y VIIRS" : "🛰️ Compare MODIS and VIIRS",
      prompt: isEs
        ? `Compara MODIS y VIIRS para septiembre en ${target}?`
        : `Compare MODIS and VIIRS for September in ${target}?`,
      region: macro,
      cameraKey: cam,
      mode3d: false,
    });
  }
  chips.push({
    id: "ChipComparePeaks",
    label: isEs ? "📊 Comparar 2024 vs. Récords Históricos" : "📊 Compare 2024 vs. Record Years",
    prompt: isEs
      ? `Compara la actividad de fuego de 2024 frente a los años récord históricos desde 2003 en ${target}.`
      : `Compare 2024 fire activity against the historical peak record years since 2003 in ${target}.`,
    region: macro,
    cameraKey: cam,
    mode3d: false,
  });
  return chips.slice(0, 3);
}

export function fmtNum(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString("en-US");
}
