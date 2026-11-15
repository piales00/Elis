import { API_BASE } from "../config.js";

export const PRESET_QUESTIONS = [
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

function fmtNum(val, digits = 1) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtInt(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  return Math.round(Number(val)).toLocaleString("en-US");
}

function buildAnnualSeriesFromRows(rows, region, fromYear = 2003, toYear = 2026) {
  const byYear = new Map();
  for (const r of rows || []) {
    if (r.region !== region || r.is_forecast) continue;
    if (r.year < fromYear || r.year > toYear) continue;
    const prev = byYear.get(r.year) || {
      year: r.year,
      estimated: 0,
      raw_detections: 0,
      raw_modis: 0,
      raw_viirs: 0,
      months: 0,
    };
    prev.estimated += Number(r.estimated || 0);
    prev.raw_detections += Number(r.raw_detections || 0);
    prev.raw_modis += Number(r.raw_modis || 0);
    prev.raw_viirs += Number(r.raw_viirs || 0);
    prev.months += 1;
    byYear.set(r.year, prev);
  }
  return Array.from(byYear.values())
    .sort((a, b) => a.year - b.year)
    .map((item) => ({
      year: item.year,
      estimated: Number(item.estimated.toFixed(1)),
      raw_detections: item.raw_detections,
      partial: item.year === 2000 || item.year === 2026 || item.months < 12,
      provisional: item.year === 2026,
      low_confidence: item.year <= 2002,
    }));
}

function buildYearMonthlySeries(rows, region, year) {
  return (rows || [])
    .filter((r) => r.region === region && r.year === year)
    .sort((a, b) => a.month - b.month)
    .map((r) => ({
      year: r.year,
      month: r.month,
      estimated: r.estimated,
      est_low: r.est_low,
      est_high: r.est_high,
      hist_median: r.hist_median,
      anomaly_class: r.anomaly_class,
      is_forecast: Boolean(r.is_forecast),
      provisional: r.year === 2026 && r.month >= 8 && !r.is_forecast,
      partial: r.year === 2026 && r.month === 11,
    }));
}

export function buildPresetResponse(presetId, { region = "peru", series = [], locale = "en" }) {
  const isEs = locale === "es";
  const regLabel =
    region === "amazonia"
      ? isEs
        ? "Amazonía"
        : "the Amazon"
      : region === "sierra"
        ? isEs
          ? "la Sierra (Andes)"
          : "the Andes (Sierra)"
        : region === "costa"
          ? isEs
            ? "la Costa"
            : "the Coast"
          : isEs
            ? "Perú"
            : "Peru";

  const annualPeru = buildAnnualSeriesFromRows(series, region || "peru", 2000, 2026);
  const rows2026 = buildYearMonthlySeries(series, region || "peru", 2026);

  if (presetId === "normal_2026") {
    const text = isEs
      ? `📌 Diagnóstico: La temporada pico 2026 en Perú (ago–oct, NRT provisional) cerró en categoría normal con al menos 22,955.0 fire cell-days vs. la mediana histórica de 27,300.8 (+34.4% frente a 2025).\n📊 Ventana Parcial (al 2026-11-13): Enero–octubre suma al menos 32,489.0 fire cell-days (+20.0% vs. 2025) y del 1 al 13 de noviembre registra 1,400.5 (IC 90%: 1,320.6–1,489.9).\n🛡️ Acción INDECI / SERFOR: Mantener vigilancia estándar en noviembre–diciembre y concentrar la pre-asignación logística T-60d para la temporada 2027 en Sierra y Cusco.`
      : `📌 Finding: Peru's 2026 peak season (Aug–Oct, provisional NRT) tracks in the normal class with at least 22,955.0 fire cell-days vs. the 2003–2025 median of 27,300.8 (+34.4% above 2025).\n📊 Partial Year Window (through 2026-11-13): Complete Jan–Oct totals at least 32,489.0 fire cell-days (+20.0% vs. 2025), and Nov 1–13 records 1,400.5 (90% CI: 1,320.6–1,489.9).\n🛡️ INDECI / SERFOR Action: Maintain standard monitoring for late 2026 and shift T-60d pre-positioning toward the High-alert 2027 Andes season.`;

    return {
      text,
      tools: [
        { name: "compare_periods", label: isEs ? "Comparando 2026 vs. historia…" : "Comparing 2026 vs. history…" },
        { name: "show_chart", label: isEs ? "Dibujando 2026 vs. mediana histórica…" : "Rendering 2026 vs. historical median…" },
      ],
      verified: true,
      chart: {
        chart: "year_vs_history",
        title: isEs
          ? `${regLabel}: Actividad mensual 2026 vs. mediana 2003–2025`
          : `${regLabel}: 2026 monthly activity vs. 2003–2025 median`,
        unit: "fire cell-days",
        region: region || "peru",
        highlight_year: 2026,
        series: rows2026.length
          ? rows2026
          : [
              { year: 2026, month: 7, estimated: 4729.4, est_low: 4596.5, est_high: 4931.6, hist_median: 4236.9, is_forecast: false },
              { year: 2026, month: 8, estimated: 7213.7, est_low: 7025.6, est_high: 7496.5, hist_median: 10174.1, is_forecast: false, provisional: true },
              { year: 2026, month: 9, estimated: 8573.4, est_low: 8377.5, est_high: 8827.5, hist_median: 11353.3, is_forecast: false, provisional: true },
              { year: 2026, month: 10, estimated: 7167.9, est_low: 7033.0, est_high: 7416.5, hist_median: 5002.0, is_forecast: false, provisional: true },
              { year: 2026, month: 11, estimated: 1400.5, est_low: 1320.6, est_high: 1489.9, hist_median: 1195.1, is_forecast: false, provisional: true, partial: true },
              { year: 2026, month: 12, estimated: 1249.0, est_low: 536.2, est_high: 3127.7, hist_median: 1334.1, is_forecast: true },
            ],
      },
    };
  }

  if (presetId === "worst_amazon") {
    const text = isEs
      ? `📌 Diagnóstico: En temporada pico (ago–oct), los récords en Amazonía son 2010 (al menos 20,702.0 fire cell-days, very_high), 2024 (20,314.2) y 2005 (19,969.0).\n📊 Total Anual y Picos: En año completo lideran 2005 (32,535.4), 2007 (30,112.0) y 2010 (29,013.8) por encima de 2024 (28,263.6), con el récord mensual en agosto 2010 (11,622.1; IC 90%: 10,894.6–17,164.8).\n🛡️ Acción SERNANP / FEMA: Focalizar patrullaje aéreo en corredores de Madre de Dios y Ucayali donde se concentran los frentes de bosque.`
      : `📌 Finding: By peak season (Aug–Oct), the worst Amazon records since 2003 are 2010 (at least 20,702.0 fire cell-days, very_high), 2024 (20,314.2), and 2005 (19,969.0).\n📊 Full-Year & Monthly Peaks: Full-year totals rank 2005 (32,535.4), 2007 (30,112.0), and 2010 (29,013.8) above 2024 (28,263.6), peaking in Aug 2010 (11,622.1; 90% CI: 10,894.6–17,164.8).\n🛡️ SERNANP / FEMA Action: Target aerial surveillance along Madre de Dios and Ucayali primary-forest corridors during drought anomalies.`;

    return {
      text,
      tools: [
        { name: "rank_years", label: isEs ? "Ordenando años récord en Amazonía…" : "Ranking peak seasons in Amazon…" },
        { name: "show_chart", label: isEs ? "Graficando serie armonizada…" : "Plotting harmonized series…" },
      ],
      verified: true,
      chart: {
        chart: "series",
        title: isEs
          ? "Amazonía: Actividad anual armonizada (2003–2025)"
          : "Amazon: Harmonized annual fire activity (2003–2025)",
        unit: "fire cell-days",
        region: "amazonia",
        highlight_year: 2010,
        series: annualPeru.length && region === "amazonia"
          ? annualPeru.filter((r) => r.year >= 2003 && r.year <= 2025)
          : [
              { year: 2003, estimated: 22240.9, raw_detections: 7098 },
              { year: 2005, estimated: 32535.4, raw_detections: 10008 },
              { year: 2007, estimated: 30112.0, raw_detections: 10070 },
              { year: 2010, estimated: 29013.8, raw_detections: 9428 },
              { year: 2012, estimated: 23443.4, raw_detections: 50002 },
              { year: 2016, estimated: 25660.1, raw_detections: 54784 },
              { year: 2020, estimated: 26432.7, raw_detections: 93302 },
              { year: 2022, estimated: 24570.0, raw_detections: 86220 },
              { year: 2024, estimated: 28263.6, raw_detections: 169974 },
              { year: 2025, estimated: 16891.5, raw_detections: 76062 },
            ],
      },
    };
  }

  if (presetId === "jump_2012") {
    const text = isEs
      ? `📌 Diagnóstico: El salto crudo de 8.9× entre 2011 (10,375 detecciones) y 2012 (92,807) es un artefacto instrumental por la entrada de VIIRS S-NPP (píxel de 375 m) junto a MODIS (1 km).\n📊 Corrección Chapman: En septiembre, VIIRS captura el 83.7% de las celdas-día frente al 20.6% de MODIS Aqua; al armonizar, Perú pasó de al menos 33,238.0 fire cell-days en 2011 a 45,117.4 en 2012 (+35.7% real, no 9×).\n🛡️ Acción MINAM: Adoptar la serie armonizada en los inventarios nacionales de carbono (NDC) para evitar sesgos de +333.9%.`
      : `📌 Finding: The 8.9× raw jump from 10,375 detections (2011) to 92,807 (2012) is an instrumental artifact caused by VIIRS S-NPP (375 m pixel) joining MODIS (1 km).\n📊 Chapman Correction: In September, VIIRS captures 83.7% of fire cell-days vs. 20.6% for MODIS Aqua; harmonized activity rose from at least 33,238.0 fire cell-days (2011) to 45,117.4 (2012, +35.7% rather than 9×).\n🛡️ MINAM Action: Use the harmonized baseline for Paris Agreement (NDC) emissions inventories to eliminate the +333.9% naive bias.`;

    return {
      text,
      tools: [
        { name: "compare_periods", label: isEs ? "Comparando 2011 vs. 2012…" : "Comparing 2011 vs. 2012…" },
        { name: "get_methodology", label: isEs ? "Leyendo probabilidades de detección…" : "Reading sensor detection probabilities…" },
        { name: "show_chart", label: isEs ? "Graficando crudo vs. armonizado…" : "Plotting raw vs. harmonized series…" },
      ],
      verified: true,
      chart: {
        chart: "raw_vs_corrected",
        title: isEs
          ? "Perú: Detecciones crudas vs. estimación armonizada (2003–2025)"
          : "Peru: Raw detections vs. harmonized estimate (2003–2025)",
        unit: "fire cell-days",
        region: "peru",
        highlight_year: 2012,
        series: annualPeru.length
          ? annualPeru.filter((r) => r.year >= 2003 && r.year <= 2025)
          : [
              { year: 2005, estimated: 52287.8, raw_detections: 16210 },
              { year: 2010, estimated: 50096.2, raw_detections: 16255 },
              { year: 2011, estimated: 33238.0, raw_detections: 10375 },
              { year: 2012, estimated: 45117.4, raw_detections: 92807 },
              { year: 2016, estimated: 48715.1, raw_detections: 104431 },
              { year: 2020, estimated: 54712.9, raw_detections: 193888 },
              { year: 2023, estimated: 44643.5, raw_detections: 229224 },
              { year: 2024, estimated: 49904.6, raw_detections: 298739 },
              { year: 2025, estimated: 33493.3, raw_detections: 153749 },
            ],
      },
    };
  }

  if (presetId === "conf_pre2003") {
    const text = isEs
      ? `Las estimaciones anteriores a 2003 (2000-11 a 2002-12) están marcadas como de baja confianza (low confidence). Entre noviembre de 2000 y junio de 2002 solo operaba MODIS Terra (pasada matutina ~10:30 AM) antes del inicio de MODIS Aqua el 2002-07-04 (~1:30 PM), por lo que ese tramo requiere un puente estadístico Terra–Aqua; además, el año 2000 es parcial (solo noviembre y diciembre, al menos 23,362.8 fire cell-days en Perú, seguidos de 24,377.8 en 2001 y 24,575.7 en 2002). La línea base histórica para clasificar anomalías comienza en 2003, primer año completo de Aqua.`
      : `Estimates before 2003 (2000-11 through 2002-12) carry low confidence. Between November 2000 and June 2002 only MODIS Terra (morning overpass) was operating before MODIS Aqua launched on 2002-07-04 (~1:30 PM overpass), requiring a Terra-to-Aqua statistical bridge; additionally, year 2000 is partial with only November and December observed (at least 23,362.8 fire cell-days in Peru, followed by 24,377.8 in 2001 and 24,575.7 in 2002). The historical baseline for anomaly classes therefore starts in 2003, the first complete Aqua year.`;

    return {
      text,
      tools: [
        { name: "get_methodology", label: isEs ? "Consultando períodos y niveles de confianza…" : "Reading periods and confidence levels…" },
        { name: "get_series", label: isEs ? "Leyendo tramo 2000–2002…" : "Reading 2000–2002 series…" },
      ],
      verified: true,
      chart: null,
    };
  }

  if (presetId === "forecast_next") {
    const text = isEs
      ? `Separado de los datos observados (que llegan de forma parcial hasta el 2026-11-13), el pronóstico (forecast) para diciembre de 2026 (2026-12, calculado desde el último mes completo 2026-10) proyecta en Perú una mediana de 1,249.0 fire cell-days (rango de pronóstico al 90%: 536.2 a 3,127.7; mediana histórica: 1,334.1, clase normal). Por macrorregión, el pronóstico para 2026-12 es 567.0 (rango: 168.2 a 1,370.1, climatología) en Amazonía, 320.5 (148.1 a 1,236.2) en la Sierra y 473.7 (304.2 a 966.0) en la Costa, todos en categoría normal.`
      : `Strictly separated from observed data (which reaches 2026-11-13 as a partial month), the December 2026 (2026-12) forecast initialized from the last complete month (2026-10) projects a median of 1,249.0 fire cell-days across Peru (90% forecast range: 536.2 to 3,127.7 vs. historical median 1,334.1, normal class). By macroregion, the December 2026 forecast is 567.0 (range: 168.2 to 1,370.1, climatology fallback) in the Amazon, 320.5 (148.1 to 1,236.2) in the Andes, and 473.7 (304.2 to 966.0) on the Coast, all within the normal category.`;

    return {
      text,
      tools: [
        { name: "get_methodology", label: isEs ? "Consultando modelo de pronóstico…" : "Reading seasonal forecast evaluation…" },
        { name: "show_chart", label: isEs ? "Dibujando observado 2026 + pronóstico…" : "Plotting 2026 observed + forecast…" },
      ],
      verified: true,
      chart: {
        chart: "forecast",
        title: isEs
          ? "Perú: Actividad observada en 2026 y pronóstico de diciembre"
          : "Peru: 2026 observed activity and December forecast",
        unit: "fire cell-days",
        region: "peru",
        highlight_year: 2026,
        series: rows2026.length
          ? rows2026
          : [
              { year: 2026, month: 7, estimated: 4729.4, est_low: 4596.5, est_high: 4931.6, hist_median: 4236.9, is_forecast: false },
              { year: 2026, month: 8, estimated: 7213.7, est_low: 7025.6, est_high: 7496.5, hist_median: 10174.1, is_forecast: false, provisional: true },
              { year: 2026, month: 9, estimated: 8573.4, est_low: 8377.5, est_high: 8827.5, hist_median: 11353.3, is_forecast: false, provisional: true },
              { year: 2026, month: 10, estimated: 7167.9, est_low: 7033.0, est_high: 7416.5, hist_median: 5002.0, is_forecast: false, provisional: true },
              { year: 2026, month: 11, estimated: 1400.5, est_low: 1320.6, est_high: 1489.9, hist_median: 1195.1, is_forecast: false, provisional: true, partial: true },
              { year: 2026, month: 12, estimated: 1249.0, est_low: 536.2, est_high: 3127.7, hist_median: 1334.1, is_forecast: true },
            ],
      },
    };
  }

  const text = isEs
    ? `Sumar todos los satélites sin corregir (Terra, Aqua, S-NPP, NOAA-20 desde 2018-04 y NOAA-21 desde 2023-03) produce un error medio de 333.9% en Perú en los años de prueba reservados (2021–2024), frente a solo 3.8% con nuestro método armonizado (correlación de 0.748 con el área quemada de MapBiomas). Además, entrenar un modelo con la suma cruda inventa una tendencia falsa de +16.77% anual (un crecimiento ficticio de 30.3x entre 2003 y 2025) y falla por 6.6x al cruzar 2012, mientras que la serie armonizada muestra una tendencia casi plana de +0.18% anual.`
    : `Adding all satellites without harmonization (Terra, Aqua, S-NPP, NOAA-20 from 2018-04, and NOAA-21 from 2023-03) produces a 333.9% mean error across Peru on the held-out test years (2021–2024), compared with just 3.8% for our harmonized method (0.748 annual correlation with MapBiomas burned area). Worse, fitting a trend or forecast model on raw counts invents a false +16.77% per year growth (a 30.3x increase over 2003–2025) and misses post-2012 predictions by 6.6x, whereas the harmonized series shows a nearly flat +0.18% per year trend.`;

  return {
    text,
    tools: [
      { name: "get_methodology", label: isEs ? "Verificando errores de validación y tendencias…" : "Checking validation errors and trends…" },
      { name: "show_chart", label: isEs ? "Comparando suma ingenua vs. serie armonizada…" : "Comparing naive sum vs. harmonized series…" },
    ],
    verified: true,
    chart: {
      chart: "raw_vs_corrected",
      title: isEs
        ? "Perú: Suma ingenua de satélites vs. serie armonizada (2003–2025)"
        : "Peru: Naive multi-satellite sum vs. harmonized series (2003–2025)",
      unit: "fire cell-days",
      region: "peru",
      highlight_year: 2024,
      series: annualPeru.length
        ? annualPeru.filter((r) => r.year >= 2003 && r.year <= 2025)
        : [
            { year: 2005, estimated: 52287.8, raw_detections: 16210 },
            { year: 2010, estimated: 50096.2, raw_detections: 16255 },
            { year: 2011, estimated: 33238.0, raw_detections: 10375 },
            { year: 2012, estimated: 45117.4, raw_detections: 92807 },
            { year: 2018, estimated: 34218.2, raw_detections: 121388 },
            { year: 2020, estimated: 54712.9, raw_detections: 193888 },
            { year: 2023, estimated: 44643.5, raw_detections: 229224 },
            { year: 2024, estimated: 49904.6, raw_detections: 298739 },
            { year: 2025, estimated: 33493.3, raw_detections: 153749 },
          ],
    },
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
  const askedActions = /(accion|acción|acciones|indeci|serfor|minam|presupuesto|interven|que hacer|qué hacer|action|deploy|t-60)/i.test(q);
  const askedSensors = /(sensor|modis|viirs|2012|desacuerdo|chapman|salto|disagreement)/i.test(q);

  const chips = [];
  if (!askedForecast) {
    chips.push({
      id: "ChipForecast2027",
      label: isEs ? `🔮 Pronóstico 2027: ${target}` : `🔮 2027 Outlook: ${target}`,
      prompt: isEs
        ? `¿Cuál es el pronóstico estacional 2027, el rango al 90% y el nivel de alerta para ${target}?`
        : `What is the 2027 seasonal outlook, 90% range, and alert level for ${target}?`,
      region: macro,
      cameraKey: cam,
      mode3d: true,
    });
  }
  if (!askedActions) {
    chips.push({
      id: "ChipActionT60",
      label: isEs ? `🛡️ Plan Operativo T-60d (${target})` : `🛡️ T-60d Action Plan (${target})`,
      prompt: isEs
        ? `¿Qué acciones operativas e intervención preventiva T-60d (INDECI / SERFOR / SERNANP) se recomiendan en ${target}?`
        : `What T-60d preventive operational actions (INDECI / SERFOR / SERNANP) are recommended in ${target}?`,
      region: macro,
      cameraKey: cam,
      mode3d: true,
    });
  }
  if (!askedSensors) {
    chips.push({
      id: "ChipSensorRegime",
      label: isEs ? "🛰️ Régimen: Quema vs. Bosque (Sensores)" : "🛰️ Fire Regime: Pasture vs. Forest",
      prompt: isEs
        ? `¿Qué revela la diferencia entre MODIS y VIIRS sobre el tipo de fuego en ${target}?`
        : `What does MODIS vs. VIIRS sensor disagreement reveal about the fire regime in ${target}?`,
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

export { fmtInt, fmtNum };
