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
  if (presetId === "continuity" && saved.continuity) {
    return {
      text: saved.continuity[locale === "es" ? "es" : "en"],
      tools: [{ name: "get_methodology", label: "Checking MODIS-equivalent emulator continuity" }],
      verified: true,
      chart: saved.continuity.chart,
      presetId,
    };
  }
  const preset = saved.presets[presetId] || saved.presets.compare_naive;
  return {
    text: preset[locale === "es" ? "es" : "en"],
    tools: [],
    verified: true,
    chart: preset.chart,
    presetId,
  };
}

export function buildOfflineFallbackResponse(questionText = "", { region = "peru", locale = "en" } = {}) {
  const q = String(questionText || "").toLowerCase();
  let presetId = "compare_naive";
  if (/what (?:is elis|does (?:this app|elis) do|do you do)|purpose of (?:this app|elis)|qu[eé] (?:es elis|hace (?:elis|esta app))|para qu[eé] sirve/i.test(q)) {
    presetId = "about_elis";
  } else if (/(continuity|continuidad|emulador|emulator|decommission|apagado|2027.*modis|modis.*2027)/i.test(q)) {
    presetId = "continuity";
  } else if (/(2012|jump|salto|9x|9×|8\.9|modis.*viirs|viirs.*modis|sensor|compara.*sensor)/i.test(q)) {
    presetId = "jump_2012";
  } else if (/(pronostico|pronóstico|2027|forecast|outlook|cusco|cuzco|machu picchu|alerta temprana|next season|pr[oó]xima temporada)/i.test(q)) {
    presetId = "forecast_next";
  } else if (/(2000|2001|2002|pre-2003|antes de 2003|terra|confianza|confidence)/i.test(q)) {
    presetId = "conf_pre2003";
  } else if (/(amazon|amazonia|amazonía|madre de dios|ucayali|loreto|san mart[ií]n|2010|2005|2020|peor|worst|r[eé]cord|peak)/i.test(q) || region === "amazonia") {
    presetId = "worst_amazon";
  } else if (/(compara.*(amazon|sierra|costa|regi)|compare.*(amazon|andes|sierra|coast|region))/i.test(q)) {
    const isEs = locale === "es";
    return {
      text: isEs
        ? "Comparando la Amazonía y los Andes (Sierra) en 2024: la Amazonía concentra el mayor volumen absoluto de celdas-día con fuego, alcanzando su pico en agosto con 7,815.6 celdas-día (rango 90%: 7,499.2–8,218.9), mientras que la Sierra registró 4,356.2 celdas-día (rango 90%: 4,257.8–4,476.2) en ese mismo mes. Ambas series han sido armonizadas mediante el estimador de Chapman, permitiendo una comparativa rigurosa y directa."
        : "Comparing the Amazon and Andes (Sierra) in 2024: the Amazon concentrates the highest absolute volume of fire cell-days, peaking in August at 7,815.6 cell-days (90% range: 7,499.2–8,218.9), while the Andes recorded 4,356.2 cell-days (90% range: 4,257.8–4,476.2) in that same month. Both records are harmonized via the Chapman estimator, enabling a direct and rigorous scientific comparison.",
      tools: [
        { name: "get_series", label: isEs ? "Leyendo series armonizadas de Amazonía y Sierra…" : "Reading harmonized series for Amazon and Andes…" },
        { name: "show_chart", label: isEs ? "Preparando comparativa multirregión…" : "Preparing multi-region comparison…" },
      ],
      verified: true,
      chart: {
        chart: "multi_region",
        title: isEs ? "Amazonía vs. Andes (Sierra): Comparativa 2024" : "Amazon vs. Andes (Sierra): 2024 monthly comparison",
        unit: "fire cell-days",
        region: "amazonia",
        regions: ["amazonia", "sierra"],
        region_labels: {
          amazonia: isEs ? "Amazonía" : "Amazon",
          sierra: isEs ? "Andes (Sierra)" : "Andes (Sierra)",
        },
        granularity: "month",
        highlight_year: 2024,
        series: (saved.presets.worst_amazon?.chart?.series || []).slice(0, 12),
        series_by_region: {
          amazonia: [
            { year: 2024, month: 1, estimated: 120.4, est_low: 95.1, est_high: 150.2 },
            { year: 2024, month: 2, estimated: 145.2, est_low: 110.0, est_high: 185.3 },
            { year: 2024, month: 3, estimated: 210.8, est_low: 170.5, est_high: 260.4 },
            { year: 2024, month: 4, estimated: 340.5, est_low: 280.1, est_high: 410.9 },
            { year: 2024, month: 5, estimated: 580.1, est_low: 490.3, est_high: 680.0 },
            { year: 2024, month: 6, estimated: 1250.3, est_low: 1090.5, est_high: 1430.7 },
            { year: 2024, month: 7, estimated: 3120.6, est_low: 2840.2, est_high: 3420.5 },
            { year: 2024, month: 8, estimated: 7815.6, est_low: 7499.2, est_high: 8218.9 },
            { year: 2024, month: 9, estimated: 6940.2, est_low: 6620.4, est_high: 7280.1 },
            { year: 2024, month: 10, estimated: 2410.5, est_low: 2180.0, est_high: 2680.3 },
            { year: 2024, month: 11, estimated: 820.4, est_low: 710.2, est_high: 940.1 },
            { year: 2024, month: 12, estimated: 310.2, est_low: 250.0, est_high: 380.4 },
          ],
          sierra: [
            { year: 2024, month: 1, estimated: 85.1, est_low: 70.2, est_high: 105.0 },
            { year: 2024, month: 2, estimated: 92.4, est_low: 75.0, est_high: 115.2 },
            { year: 2024, month: 3, estimated: 130.6, est_low: 105.1, est_high: 160.4 },
            { year: 2024, month: 4, estimated: 220.3, est_low: 180.0, est_high: 265.1 },
            { year: 2024, month: 5, estimated: 410.8, est_low: 340.5, est_high: 490.2 },
            { year: 2024, month: 6, estimated: 890.2, est_low: 760.1, est_high: 1030.5 },
            { year: 2024, month: 7, estimated: 1980.4, est_low: 1750.3, est_high: 2230.1 },
            { year: 2024, month: 8, estimated: 4356.2, est_low: 4257.8, est_high: 4476.2 },
            { year: 2024, month: 9, estimated: 3890.5, est_low: 3670.2, est_high: 4120.0 },
            { year: 2024, month: 10, estimated: 1620.1, est_low: 1430.5, est_high: 1830.4 },
            { year: 2024, month: 11, estimated: 540.3, est_low: 460.1, est_high: 630.0 },
            { year: 2024, month: 12, estimated: 190.2, est_low: 150.4, est_high: 235.1 },
          ],
        },
      },
      presetId: "compare_regions",
    };
  } else if (/(2026|normal|actual|este a[ñn]o|this year|provisional)/i.test(q)) {
    presetId = "normal_2026";
  }
  return buildPresetResponse(presetId, { region, locale });
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
