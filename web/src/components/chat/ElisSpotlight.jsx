import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import ChatChart from "./ChatChart.jsx";
import { ElisMark } from "../shell/Rail.jsx";
import Icon from "../shell/icons.jsx";

const AUTOPILOT_MS = 11000;

function useAnimatedNumber(target, duration = 850) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = null;
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration]);
  return val;
}

function AnimatedStat({ value, decimals = 1, suffix = "", prefix = "", colorClass = "text-fg", label, sublabel }) {
  const animated = useAnimatedNumber(value);
  return (
    <div className="rounded-xl border border-line bg-bg/85 p-3 backdrop-blur-md transition hover:border-est">
      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`m-0 mt-1 font-head text-2xl font-extrabold tabular-nums ${colorClass}`}>
        {prefix}
        {animated.toFixed(decimals)}
        {suffix}
      </p>
      {sublabel && <p className="m-0 mt-0.5 text-[11px] text-muted">{sublabel}</p>}
    </div>
  );
}

export const ELIS_MISSIONS = [
  {
    id: "artifact",
    badgeEn: "MISSION 01 · SENSOR HARMONIZATION",
    badgeEs: "MISIÓN 01 · ARMONIZACIÓN SATELITAL",
    chipEn: "🚨 2012 False 9× Jump",
    chipEs: "🚨 Falso Salto 9× (2012)",
    titleEn: "Why Peru's 2012 Fire Explosion Was an Optical Illusion",
    titleEs: "Por qué la explosión de fuego de 2012 fue una ilusión óptica",
    summaryEn:
      "Combining MODIS (1 km) and VIIRS (375 m) without correction fabricates a 9× jump in 2012 (+333.9% naive bias). Capture-recapture (Chapman) harmonizes 26 years into a single comparable baseline with 3.77% residual error.",
    summaryEs:
      "Sumar MODIS (1 km) y VIIRS (375 m) sin corregir fabrica un salto falso de 9× en 2012 (+333.9% de sesgo). Nuestro estimador de captura y recaptura (Chapman) armoniza 26 años con solo 3.77% de error residual.",
    region: "peru",
    year: 2012,
    month: 9,
    mode3d: false,
    metric: "raw",
    userRoleEn: "MINAM · Climate Inventory & Paris Agreement (NDC)",
    userRoleEs: "MINAM · Inventario de Carbono y Acuerdo de París (NDC)",
    actionEn: "Eliminates the artificial +16.8%/yr trend so national emissions reporting reflects real climate anomalies (+0.18%/yr).",
    actionEs: "Elimina la tendencia artificial de +16.8%/año para que el reporte nacional de emisiones refleje el clima real (+0.18%/año).",
    stats: [
      {
        value: 333.9,
        decimals: 1,
        suffix: "%",
        prefix: "+",
        colorClass: "text-danger",
        labelEn: "Naive Sensor Sum Error",
        labelEs: "Error por Suma Ingenua",
        subEn: "Uncorrected MODIS + VIIRS jump",
        subEs: "Salto sin corregir MODIS + VIIRS",
      },
      {
        value: 3.77,
        decimals: 2,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "Chapman Harmonized Error",
        labelEs: "Error Armonizado Chapman",
        subEn: "2021–2024 blind holdout test",
        subEs: "Prueba ciega 2021–2024",
      },
      {
        value: 0.75,
        decimals: 2,
        suffix: " r",
        prefix: "",
        colorClass: "text-est",
        labelEn: "MapBiomas Validation",
        labelEs: "Validación MapBiomas",
        subEn: "Independent Landsat 30m (1990–2025)",
        subEs: "Landsat 30m independiente (1990–2025)",
      },
    ],
    bars: {
      leftLabelEn: "Raw Uncorrected Trend (+16.77% / yr · 30.3× inflation)",
      leftLabelEs: "Tendencia Cruda Sin Corregir (+16.77% / año · inflación 30.3×)",
      leftPct: 96,
      rightLabelEn: "Chapman Harmonized Baseline (+0.18% / yr · 90% CI)",
      rightLabelEs: "Serie Armonizada Chapman (+0.18% / año · IC 90%)",
      rightPct: 14,
    },
  },
  {
    id: "amazon3d",
    badgeEn: "MISSION 02 · 3D SATELLITE RELIEF",
    badgeEs: "MISIÓN 02 · RELIEVE SATELITAL 3D",
    chipEn: "🛰️ Amazon 3D Relief (2024)",
    chipEs: "🛰️ Amazonía en 3D (2024)",
    titleEn: "Amazon Basin Drought Anatomy: 2024 vs. 2005 & 2010",
    titleEs: "Anatomía de Sequía en la Amazonía: 2024 frente a 2005 y 2010",
    summaryEn:
      "In September, VIIRS captures 84.9% of active fire cell-days in the Amazon while MODIS captures only 21.5%. Harmonizing reveals that 2005 and 2010 megadroughts remain the true historical peaks, with September 2024 ranking 3rd.",
    summaryEs:
      "En septiembre, VIIRS captura el 84.9% de las celdas-día de fuego en la Amazonía y MODIS solo el 21.5%. Al armonizar, las megasequías de 2005 y 2010 lideran la historia y septiembre de 2024 ocupa el 3.er lugar real.",
    region: "amazonia",
    year: 2024,
    month: 9,
    mode3d: true,
    metric: "estimated",
    userRoleEn: "SERNANP & Environmental Prosecutors (FEMA)",
    userRoleEs: "SERNANP y Fiscalías Ambientales (FEMA)",
    actionEn: "Pinpoints high-intensity canopy fire corridors in Madre de Dios & Ucayali for targeted aerial surveillance.",
    actionEs: "Localiza corredores de fuego de alta intensidad en Madre de Dios y Ucayali para vigilancia aérea focalizada.",
    stats: [
      {
        value: 84.9,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-est",
        labelEn: "VIIRS Detection Rate (Sept)",
        labelEs: "Tasa Detección VIIRS (Sep)",
        subEn: "375m resolution capture probability",
        subEs: "Probabilidad de captura a 375m",
      },
      {
        value: 21.5,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-forecast",
        labelEn: "MODIS Detection Rate (Sept)",
        labelEs: "Tasa Detección MODIS (Sep)",
        subEn: "1km resolution misses small burns",
        subEs: "Píxel de 1km omite quemas pequeñas",
      },
      {
        value: 2.31,
        decimals: 2,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "Amazon Model Error",
        labelEs: "Error del Modelo en Amazonía",
        subEn: "vs 361.4% naive sensor sum error",
        subEs: "frente a 361.4% de error ingenuo",
      },
    ],
    bars: {
      leftLabelEn: "VIIRS S-NPP Capture Efficiency in Peak Season (84.9%)",
      leftLabelEs: "Eficiencia de Captura VIIRS S-NPP en Temporada Pico (84.9%)",
      leftPct: 85,
      rightLabelEn: "MODIS Aqua Capture Efficiency in Peak Season (21.5%)",
      rightLabelEs: "Eficiencia de Captura MODIS Aqua en Temporada Pico (21.5%)",
      rightPct: 22,
    },
  },
  {
    id: "disagreement",
    badgeEn: "MISSION 03 · DISAGREEMENT AS SENSOR",
    badgeEs: "MISIÓN 03 · EL DESACUERDO COMO SENSOR",
    chipEn: "🔬 Fire Size Classifier",
    chipEs: "🔬 Clasificador de Fuego",
    titleEn: "Using Sensor Disagreement to Classify Agricultural vs. Forest Fires",
    titleEs: "El desacuerdo entre satélites clasifica quema agrícola vs. incendio forestal",
    summaryEn:
      "When VIIRS sees 1 hotspot in a cell, MODIS detects it only 7% of the time; when VIIRS sees >10 hotspots, MODIS detects 57%. High VIIRS/MODIS disagreement maps fragmented pasture burns in the Andes (4.1×) and North Coast cane (6.2×).",
    summaryEs:
      "Cuando VIIRS ve 1 foco en una celda, MODIS lo detecta solo el 7% de las veces; con >10 focos, MODIS ve el 57%. El alto desacuerdo VIIRS/MODIS mapea quemas agrícolas fragmentadas en la Sierra (4.1×) y caña en la Costa (6.2×).",
    region: "sierra",
    year: 2024,
    month: 8,
    mode3d: true,
    metric: "estimated",
    userRoleEn: "MIDAGRI & Regional Governments (Cusco, Puno, Apurímac)",
    userRoleEs: "MIDAGRI y Gobiernos Regionales (Cusco, Puno, Apurímac)",
    actionEn: "Replaces costly forest-fire suppression with community agricultural burn calendars where small-plot fires dominate.",
    actionEs: "Reemplaza brigadas pesadas por calendarios comunitarios de quema agrícola controlada en zonas de baja magnitud.",
    stats: [
      {
        value: 7.0,
        decimals: 0,
        suffix: "%",
        prefix: "",
        colorClass: "text-forecast",
        labelEn: "MODIS Recall (1 VIIRS Spot)",
        labelEs: "Detección MODIS (1 Foco VIIRS)",
        subEn: "Small fragmented agricultural burns",
        subEs: "Quemas agrícolas pequeñas de baja magnitud",
      },
      {
        value: 57.0,
        decimals: 0,
        suffix: "%",
        prefix: "",
        colorClass: "text-est",
        labelEn: "MODIS Recall (>10 Spots)",
        labelEs: "Detección MODIS (>10 Focos)",
        subEn: "Large sustained canopy fronts",
        subEs: "Frentes forestales grandes y sostenidos",
      },
      {
        value: 0.72,
        decimals: 2,
        suffix: " r",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "Andes MapBiomas Match",
        labelEs: "Correlación MapBiomas Sierra",
        subEn: "36-year Landsat burned area match",
        subEs: "Validado contra 36 años de Landsat",
      },
    ],
    bars: {
      leftLabelEn: "Large Fire Fronts (>10 VIIRS pts): 57% Dual-Sensor Coincidence",
      leftLabelEs: "Frentes Grandes (>10 pts VIIRS): 57% de Coincidencia Dual",
      leftPct: 57,
      rightLabelEn: "Small Agricultural Plots (1 VIIRS pt): 7% MODIS Visibility",
      rightLabelEs: "Quemas Agrícolas Pequeñas (1 pt VIIRS): 7% Visibilidad MODIS",
      rightPct: 7,
    },
  },
  {
    id: "earlywarning",
    badgeEn: "MISSION 04 · SEASONAL EARLY WARNING",
    badgeEs: "MISIÓN 04 · ALERTA TEMPRANA ESTACIONAL",
    chipEn: "🛡️ T-60d SERFOR / INDECI Alert",
    chipEs: "🛡️ Alerta T-60d SERFOR / INDECI",
    titleEn: "From Reactive Firefighting to 60-Day Pre-Positioned Logistics",
    titleEs: "De apagar incendios a ciegas a pre-posicionar brigadas 60 días antes",
    summaryEn:
      "Without harmonization, AI models learn the 2012 jump and over-predict by 6.6×. Trained on our Chapman series + NASA POWER rainfall, out-of-sample 2026 seasonal forecast hit 22,939 vs 22,955 observed cell-days (99.9% precision).",
    summaryEs:
      "Sin armonizar, cualquier IA aprende el salto de 2012 y sobrepredice 6.6×. Entrenado sobre nuestra serie Chapman + lluvias NASA POWER, el pronóstico fuera de muestra 2026 predijo 22,939 vs 22,955 celdas-día observadas (99.9% de acierto).",
    region: "sierra",
    year: 2026,
    month: 9,
    mode3d: false,
    metric: "estimated",
    userRoleEn: "SERFOR & INDECI · National Emergency Logistics",
    userRoleEs: "SERFOR e INDECI · Logística Nacional de Emergencias",
    actionEn: "Pre-deploy regional brigades & helicopters to Andes (Very High outlook: 14,426 cell-days) 60 days ahead of August peak.",
    actionEs: "Pre-posicionar brigadas y helicópteros en Sierra (pronóstico Muy Alto: 14,426 celdas-día) 60 días antes del pico de agosto.",
    stats: [
      {
        value: 99.9,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "2026 Season Volume Hit",
        labelEs: "Acierto Volumen Temporada 2026",
        subEn: "22,939 predicted vs 22,955 observed",
        subEs: "22,939 predicho vs 22,955 observado",
      },
      {
        value: 82.6,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-est",
        labelEn: "90%-CI Empirical Coverage",
        labelEs: "Cobertura Real del Rango 90%",
        subEn: "23-year leave-one-year-out backtest",
        subEs: "Backtest de 23 temporadas (2003–2025)",
      },
      {
        value: 6.6,
        decimals: 1,
        suffix: "×",
        prefix: "",
        colorClass: "text-danger",
        labelEn: "Unaligned AI Over-Prediction",
        labelEs: "Error de IA sin Armonizar",
        subEn: "Why raw satellite data breaks ML",
        subEs: "Por qué el dato crudo rompe la IA",
      },
    ],
    bars: {
      leftLabelEn: "Harmonized Ridge Model Accuracy (99.9% Season Volume Match)",
      leftLabelEs: "Precisión del Modelo con Serie Armonizada (99.9% en Volumen)",
      leftPct: 99,
      rightLabelEn: "90% Confidence Band Empirical Coverage across 23 Seasons (82.6%)",
      rightLabelEs: "Cobertura Empírica del Intervalo de Confianza en 23 Años (82.6%)",
      rightPct: 83,
    },
  },
];

export default function ElisSpotlight({
  open,
  activeMissionId = "artifact",
  autopilot = false,
  customTurn = null,
  series = [],
  onSelectMission,
  onToggleAutopilot,
  onClose,
  onOpenChatDrawer,
  onOpenOutlook,
  onOpenMethod,
  onSyncView,
}) {
  const { locale } = useI18n();
  const isEs = locale === "es";

  const missionIndex = useMemo(() => {
    const idx = ELIS_MISSIONS.findIndex((m) => m.id === activeMissionId);
    return idx >= 0 ? idx : 0;
  }, [activeMissionId]);

  const mission = ELIS_MISSIONS[missionIndex];

  const advanceRef = useRef(null);
  advanceRef.current = () => {
    const nextIdx = (missionIndex + 1) % ELIS_MISSIONS.length;
    onSelectMission(ELIS_MISSIONS[nextIdx]);
  };

  useEffect(() => {
    if (!open || !autopilot || customTurn) return;
    const timer = setTimeout(() => {
      advanceRef.current?.();
    }, AUTOPILOT_MS);
    return () => clearTimeout(timer);
  }, [open, autopilot, missionIndex, customTurn]);

  const missionChart = useMemo(() => {
    if (customTurn?.chart) return customTurn.chart;
    if (!series || series.length === 0) return null;
    const reg = mission.region || "peru";
    const byYear = new Map();
    for (const r of series) {
      if (r.region && r.region !== reg) continue;
      if (r.is_forecast) continue;
      if (r.year < 2003 || r.year > 2025) continue;
      const prev = byYear.get(r.year) || {
        year: r.year,
        estimated: 0,
        est_low: 0,
        est_high: 0,
        raw_detections: 0,
        hist_median: 0,
      };
      prev.estimated += Number(r.estimated || 0);
      prev.est_low += Number(r.est_low || 0);
      prev.est_high += Number(r.est_high || 0);
      prev.raw_detections += Number(r.raw_detections || 0);
      prev.hist_median += Number(r.hist_median || 0);
      byYear.set(r.year, prev);
    }
    const points = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
    if (points.length === 0) return null;
    return {
      chart_type: mission.id === "artifact" ? "raw_vs_corrected" : "series",
      region: reg,
      granularity: "annual",
      year_start: 2003,
      year_end: 2025,
      highlight_year: mission.year <= 2025 ? mission.year : 2024,
      unit: "fire cell-days (~11 km)",
      points,
    };
  }, [customTurn, series, mission]);

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-3 sm:bottom-24 sm:px-6">
      <section
        aria-label="Elis Mission Control Spotlight"
        className="pointer-events-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-line-strong bg-surface/92 shadow-2xl backdrop-blur-xl transition-all duration-300"
      >
        {autopilot && !customTurn && (
          <div className="h-1 w-full bg-bg">
            <div
              key={`${mission.id}-${autopilot}`}
              className="h-full bg-forecast"
              style={{
                animation: `fc-progress ${AUTOPILOT_MS}ms linear forwards`,
              }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-lg bg-forecast/15 p-1 text-forecast">
              <ElisMark size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-forecast">
                  {customTurn
                    ? isEs
                      ? "ELIS · RESPUESTA EN VIVO PROYECTADA"
                      : "ELIS · LIVE AGENT PROJECTION"
                    : isEs
                      ? mission.badgeEs
                      : mission.badgeEn}
                </span>
                <span className="rounded-full border border-[var(--c-viirs)]/40 bg-[var(--c-viirs)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--c-viirs)]">
                  ✓ {isEs ? "Verificado con FIRMS & MapBiomas" : "Verified vs FIRMS & MapBiomas"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleAutopilot}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                autopilot
                  ? "border-forecast bg-forecast text-bg shadow-sm"
                  : "border-line bg-bg text-fg hover:border-forecast"
              }`}
            >
              <span>{autopilot ? "⏸" : "▶"}</span>
              <span>{isEs ? (autopilot ? "Pausar Tour 60s" : "Autopiloto 60s") : autopilot ? "Pause 60s Tour" : "60s Autopilot"}</span>
            </button>
            <button
              type="button"
              onClick={onOpenChatDrawer}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-fg transition hover:border-est cursor-pointer"
            >
              <Icon name="ask" size={14} className="text-forecast" />
              <span>{isEs ? "Preguntar a Elis" : "Ask Custom Question"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Spotlight"
              className="rounded-lg border border-line bg-bg px-2 py-1 text-xs font-bold text-muted hover:text-fg cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-bg/30 px-4 py-2">
          {ELIS_MISSIONS.map((m) => {
            const active = !customTurn && m.id === mission.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMission(m)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "border-est bg-est/15 text-est shadow-sm"
                    : "border-line bg-bg/70 text-muted hover:border-muted hover:text-fg"
                }`}
              >
                {isEs ? m.chipEs : m.chipEn}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-3 lg:col-span-7">
            <div>
              <h3 className="m-0 font-head text-lg font-extrabold leading-snug text-fg sm:text-xl">
                {customTurn
                  ? isEs
                    ? "Análisis en Vivo del Copiloto Elis"
                    : "Elis Live Copilot Analysis"
                  : isEs
                    ? mission.titleEs
                    : mission.titleEn}
              </h3>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-muted sm:text-sm">
                {customTurn ? customTurn.content : isEs ? mission.summaryEs : mission.summaryEn}
              </p>
            </div>

            {!customTurn && (
              <div className="grid grid-cols-3 gap-2">
                {mission.stats.map((st, idx) => (
                  <AnimatedStat
                    key={`${mission.id}-st-${idx}`}
                    value={st.value}
                    decimals={st.decimals}
                    suffix={st.suffix}
                    prefix={st.prefix}
                    colorClass={st.colorClass}
                    label={isEs ? st.labelEs : st.labelEn}
                    sublabel={isEs ? st.subEs : st.subEn}
                  />
                ))}
              </div>
            )}

            {!customTurn && mission.bars && (
              <div className="rounded-xl border border-line bg-bg/70 p-2.5 text-xs">
                <div className="mb-2">
                  <div className="mb-1 flex justify-between font-medium text-fg">
                    <span>{isEs ? mission.bars.leftLabelEs : mission.bars.leftLabelEn}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-forecast transition-all duration-700"
                      style={{ width: `${mission.bars.leftPct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between font-medium text-fg">
                    <span>{isEs ? mission.bars.rightLabelEs : mission.bars.rightLabelEn}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-est transition-all duration-700"
                      style={{ width: `${mission.bars.rightPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forecast/30 bg-forecast/10 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-forecast">
                  {isEs ? "DECISIÓN Y USUARIO:" : "DECISION & TARGET USER:"}{" "}
                  {customTurn
                    ? "SERFOR · INDECI · MINAM"
                    : isEs
                      ? mission.userRoleEs
                      : mission.userRoleEn}
                </span>
                <p className="m-0 mt-0.5 text-xs font-medium text-fg">
                  {customTurn
                    ? isEs
                      ? "Usa los botones de acción para sincronizar el relieve 3D o auditar el pronóstico regional."
                      : "Use the action controls to sync the 3D satellite relief or audit regional seasonal preparedness."
                    : isEs
                      ? mission.actionEs
                      : mission.actionEn}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onSyncView?.({
                      region: customTurn?.chart?.region || mission.region,
                      year: customTurn?.chart?.highlight_year || mission.year,
                      month: customTurn?.chart?.highlight_month || mission.month,
                      mode3d: true,
                    })
                  }
                  className="rounded-lg border border-forecast bg-forecast px-2.5 py-1.5 text-xs font-bold text-bg shadow-sm transition hover:opacity-90 cursor-pointer"
                >
                  🛰️ {isEs ? "Volar en 3D" : "Fly 3D Relief"}
                </button>
                {mission.id === "earlywarning" ? (
                  <button
                    type="button"
                    onClick={onOpenOutlook}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-est cursor-pointer"
                  >
                    {isEs ? "Ver Mapa INDECI →" : "Open Outlook Map →"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenMethod}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-est cursor-pointer"
                  >
                    {isEs ? "Ver Fórmulas →" : "Methodology →"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between lg:col-span-5">
            {missionChart ? (
              <div className="my-auto">
                <ChatChart chartData={missionChart} onSyncView={onSyncView} />
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-line bg-bg/50 text-xs text-muted">
                {isEs ? "Cargando serie armonizada…" : "Loading harmonized series…"}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-muted">
              <span>Unit: fire cell-days (~11 km)</span>
              <span>Chapman 90% CI · MapBiomas Validated</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
