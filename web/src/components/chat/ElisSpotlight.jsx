import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import ChatChart from "./ChatChart.jsx";
import FormattedMessage, { detectAlertBadge } from "./FormattedMessage.jsx";
import { ElisMark } from "../shell/Rail.jsx";
import Icon from "../shell/icons.jsx";

const AUTOPILOT_MS = 11000;

function useAnimatedNumber(target, duration = 750) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = null;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration]);
  return val;
}

function CompactStat({ value, decimals = 1, suffix = "", prefix = "", colorClass = "text-fg", label, sublabel }) {
  const animated = useAnimatedNumber(value);
  return (
    <div className="rounded-xl border border-line bg-bg/85 px-2.5 py-2 backdrop-blur-md">
      <p className="m-0 truncate text-[9.5px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`m-0 mt-0.5 font-head text-lg font-extrabold tabular-nums ${colorClass}`}>
        {prefix}
        {animated.toFixed(decimals)}
        {suffix}
      </p>
      {sublabel && <p className="m-0 truncate text-[10px] text-muted">{sublabel}</p>}
    </div>
  );
}

export const ELIS_MISSIONS = [
  {
    id: "artifact",
    badgeEn: "MISSION 01 · SENSOR HARMONIZATION",
    badgeEs: "MISIÓN 01 · ARMONIZACIÓN SATELITAL",
    chipEn: "🚨 2012 Jump (9×)",
    chipEs: "🚨 Salto 2012 (9×)",
    kpiPillEn: "+333.9% Naive → 3.77% Chapman",
    kpiPillEs: "+333.9% Crudo → 3.77% Chapman",
    titleEn: "Why Peru's 2012 Fire Explosion Was an Optical Illusion",
    titleEs: "Por qué la explosión de fuego de 2012 fue una ilusión óptica",
    summaryEn:
      "Adding MODIS (1 km) and VIIRS (375 m) without correction fabricates a 9× jump in 2012 (+333.9% bias). Capture-recapture (Chapman) harmonizes 26 years with 3.77% residual error.",
    summaryEs:
      "Sumar MODIS (1 km) y VIIRS (375 m) sin corregir fabrica un salto falso de 9× en 2012 (+333.9% de sesgo). Captura y recaptura (Chapman) armoniza 26 años con 3.77% de error residual.",
    region: "peru",
    cameraKey: "peru",
    year: 2012,
    month: 9,
    mode3d: false,
    metric: "raw",
    userRoleEn: "MINAM · Paris Agreement (NDC)",
    userRoleEs: "MINAM · Acuerdo de París (NDC)",
    actionEn: "Replaces the fake +16.8%/yr raw trend with the true +0.18%/yr baseline for national carbon inventories.",
    actionEs: "Corrige la tendencia artificial de +16.8%/año a la real (+0.18%/año) en el inventario nacional de emisiones.",
    stats: [
      {
        value: 333.9,
        decimals: 1,
        suffix: "%",
        prefix: "+",
        colorClass: "text-danger",
        labelEn: "Naive Sum Bias",
        labelEs: "Sesgo Suma Cruda",
        subEn: "Uncorrected jump",
        subEs: "Salto sin corregir",
      },
      {
        value: 3.77,
        decimals: 2,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "Chapman Error",
        labelEs: "Error Chapman",
        subEn: "2021–2024 holdout",
        subEs: "Prueba 2021–2024",
      },
      {
        value: 0.75,
        decimals: 2,
        suffix: " r",
        prefix: "",
        colorClass: "text-est",
        labelEn: "MapBiomas Match",
        labelEs: "Correlación Landsat",
        subEn: "Landsat 30m (36 yrs)",
        subEs: "Landsat 30m (36 años)",
      },
    ],
  },
  {
    id: "amazon3d",
    badgeEn: "MISSION 02 · 3D AMAZON DROUGHT",
    badgeEs: "MISIÓN 02 · SEQUÍA AMAZONÍA 3D",
    chipEn: "🛰️ Amazon 3D (2024)",
    chipEs: "🛰️ Amazonía 3D (2024)",
    kpiPillEn: "VIIRS 84.9% vs MODIS 21.5% Recall",
    kpiPillEs: "Captura: VIIRS 84.9% vs MODIS 21.5%",
    titleEn: "Amazon Drought Anatomy: Sept 2024 vs. 2005 & 2010",
    titleEs: "Anatomía de Sequía en Amazonía: Sep 2024 vs. 2005 y 2010",
    summaryEn:
      "In September, VIIRS captures 84.9% of active fire cell-days in the Amazon while MODIS sees 21.5%. Harmonizing proves 2005 and 2010 megadroughts remain the record highs, with Sept 2024 ranking 3rd.",
    summaryEs:
      "En septiembre, VIIRS captura el 84.9% de celdas-día de fuego en la Amazonía y MODIS solo el 21.5%. Al armonizar, las megasequías de 2005 y 2010 lideran la historia y septiembre 2024 ocupa el 3.er lugar.",
    region: "amazonia",
    cameraKey: "madre_de_dios",
    year: 2024,
    month: 9,
    mode3d: true,
    metric: "estimated",
    userRoleEn: "SERNANP & FEMA Prosecutors",
    userRoleEs: "SERNANP y Fiscalías Ambientales (FEMA)",
    actionEn: "Directs aerial interdiction to persistent canopy fire corridors in Madre de Dios & Ucayali.",
    actionEs: "Dirige vigilancia e interdicción aérea a corredores de fuego persistente en Madre de Dios y Ucayali.",
    stats: [
      {
        value: 84.9,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-est",
        labelEn: "VIIRS Capture",
        labelEs: "Captura VIIRS",
        subEn: "375m peak recall",
        subEs: "Sensibilidad a 375m",
      },
      {
        value: 21.5,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-forecast",
        labelEn: "MODIS Capture",
        labelEs: "Captura MODIS",
        subEn: "1km misses small burns",
        subEs: "Omite quemas chicas",
      },
      {
        value: 2.31,
        decimals: 2,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "Amazon Error",
        labelEs: "Error Amazonía",
        subEn: "vs 361.4% naive",
        subEs: "vs 361.4% ingenuo",
      },
    ],
  },
  {
    id: "disagreement",
    badgeEn: "MISSION 03 · MACHU PICCHU & CUSCO",
    badgeEs: "MISIÓN 03 · MACHU PICCHU Y CUSCO",
    chipEn: "🏛️ Machu Picchu / Cusco",
    chipEs: "🏛️ Machu Picchu / Cusco",
    kpiPillEn: "Cusco 2027 Outlook: 1,788 [High Alert]",
    kpiPillEs: "Pronóstico Cusco 2027: 1,788 [Alerta Alta]",
    titleEn: "Machu Picchu & Cusco: Pasture Burns + 2027 High Alert",
    titleEs: "Machu Picchu y Cusco: Quemas Agrícolas + Alerta Alta 2027",
    summaryEn:
      "In the Andes (Cusco / Sacred Valley), VIIRS detects 4.1× more activity than MODIS because fragmented pasture burns (1 VIIRS spot) have only 7% MODIS recall. For the 2027 season, Cusco is projected at High Alert (1,788 cell-days vs 1,261 median).",
    summaryEs:
      "En Cusco y el cañón de Machu Picchu, VIIRS detecta 4.1× más actividad que MODIS porque son quemas fragmentadas de pastizal (MODIS solo ve el 7%). Para la temporada 2027, Cusco tiene Alerta Alta (1,788 celdas-día predichas vs 1,261 histórica).",
    region: "sierra",
    cameraKey: "cusco",
    year: 2024,
    month: 8,
    mode3d: true,
    metric: "estimated",
    userRoleEn: "SERNANP Machu Picchu · GORE Cusco · MIDAGRI",
    userRoleEs: "SERNANP Machu Picchu · GORE Cusco · MIDAGRI",
    actionEn: "Deploy controlled community burn calendars and buffer-zone patrols in Urubamba ahead of the Aug–Oct 2027 High-risk season.",
    actionEs: "Activar calendarios de quema controlada y patrullaje perimetral en Urubamba antes de la temporada Alta ago–oct 2027.",
    stats: [
      {
        value: 1788,
        decimals: 0,
        suffix: "",
        prefix: "",
        colorClass: "text-forecast",
        labelEn: "Cusco 2027 Forecast",
        labelEs: "Pronóstico Cusco 2027",
        subEn: "90% CI: 1,183–2,701",
        subEs: "IC 90%: 1,183–2,701",
      },
      {
        value: 71.1,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-danger",
        labelEn: "High/Very High Prob",
        labelEs: "Prob. Alta/Muy Alta",
        subEn: "vs 1,261 hist. median",
        subEs: "vs 1,261 med. hist.",
      },
      {
        value: 4.1,
        decimals: 1,
        suffix: "×",
        prefix: "",
        colorClass: "text-est",
        labelEn: "VIIRS/MODIS Ratio",
        labelEs: "Razón VIIRS/MODIS",
        subEn: "Small pasture fires",
        subEs: "Fuegos de pastizal",
      },
    ],
  },
  {
    id: "earlywarning",
    badgeEn: "MISSION 04 · 2027 SEASONAL OUTLOOK",
    badgeEs: "MISIÓN 04 · PRONÓSTICO 2027 INDECI",
    chipEn: "🛡️ 2027 INDECI Alert",
    chipEs: "🛡️ Alerta 2027 INDECI",
    kpiPillEn: "2026 Backtest: 99.9% Hit · 2027 Sierra Very High",
    kpiPillEs: "Acierto 2026: 99.9% · Sierra 2027 Muy Alta",
    titleEn: "2027 Pre-Positioned Logistics across 25 Departments",
    titleEs: "Logística Preventiva 2027 en los 25 Departamentos",
    summaryEn:
      "Unaligned AI over-predicts by 6.6× due to the 2012 jump. Trained on our Chapman baseline, the 2026 out-of-sample forecast hit 22,939 vs 22,955 observed cell-days (99.9%). For 2027, Sierra (14,426) and Coast (1,895) project Very High anomalies.",
    summaryEs:
      "Sin armonizar, la IA sobrepredice 6.6× por el salto de 2012. Con nuestra serie Chapman, el pronóstico 2026 acertó 22,939 vs 22,955 celdas-día observadas (99.9%). Para 2027, Sierra (14,426) y Costa (1,895) proyectan temporada Muy Alta.",
    region: "sierra",
    cameraKey: "sierra",
    year: 2026,
    month: 9,
    mode3d: false,
    metric: "estimated",
    userRoleEn: "INDECI & SERFOR · T-60d Pre-Positioning",
    userRoleEs: "INDECI y SERFOR · Pre-posicionamiento T-60d",
    actionEn: "Pre-position helicopters and brigades 60 days ahead in Cusco, Junín, Áncash, Pasco & La Libertad for the 2027 peak.",
    actionEs: "Pre-posicionar helicópteros y brigadas 60 días antes en Cusco, Junín, Áncash, Pasco y La Libertad para el pico 2027.",
    stats: [
      {
        value: 99.9,
        decimals: 1,
        suffix: "%",
        prefix: "",
        colorClass: "text-[var(--c-viirs)]",
        labelEn: "2026 Season Hit",
        labelEs: "Acierto Temp. 2026",
        subEn: "22,939 vs 22,955 obs",
        subEs: "22,939 vs 22,955 obs",
      },
      {
        value: 14426,
        decimals: 0,
        suffix: "",
        prefix: "",
        colorClass: "text-forecast",
        labelEn: "Andes 2027 Outlook",
        labelEs: "Sierra 2027 (Muy Alta)",
        subEn: "90% CI: 10.1k–20.5k",
        subEs: "IC 90%: 10.1k–20.5k",
      },
      {
        value: 6.6,
        decimals: 1,
        suffix: "×",
        prefix: "",
        colorClass: "text-danger",
        labelEn: "Raw AI Bias",
        labelEs: "Sesgo IA Cruda",
        subEn: "Without Chapman",
        subEs: "Sin armonización",
      },
    ],
  },
];

export default function ElisSpotlight({
  open,
  minimized = false,
  onToggleMinimized,
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
  const [showChart, setShowChart] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

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

  const handlePointerDown = (e) => {
    if (e.target.closest("button, a, input")) return;
    const startX = e.clientX - dragOffset.x;
    const startY = e.clientY - dragOffset.y;
    const onMove = (ev) => {
      setDragOffset({
        x: Math.max(-320, Math.min(320, ev.clientX - startX)),
        y: Math.max(-420, Math.min(80, ev.clientY - startY)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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

  if (minimized) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-line-strong bg-surface/90 px-3 py-1.5 shadow-xl backdrop-blur-xl">
          <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-extrabold text-forecast">
            <ElisMark size={16} />
            <span className="hidden sm:inline">Elis Dock</span>
          </span>
          {ELIS_MISSIONS.map((m) => {
            const active = !customTurn && m.id === mission.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMission(m)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                  active
                    ? "border-est bg-est/20 text-est"
                    : "border-line bg-bg/70 text-muted hover:text-fg"
                }`}
              >
                {isEs ? m.chipEs : m.chipEn}
              </button>
            );
          })}
          <span className="hidden rounded-full border border-forecast/30 bg-forecast/10 px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-forecast md:inline-block">
            {isEs ? mission.kpiPillEs : mission.kpiPillEn}
          </span>
          <button
            type="button"
            onClick={onToggleAutopilot}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold cursor-pointer ${
              autopilot ? "border-forecast bg-forecast text-bg" : "border-line bg-bg text-fg"
            }`}
          >
            {autopilot ? "⏸" : "▶"} 60s
          </button>
          <button
            type="button"
            onClick={() => onToggleMinimized?.(false)}
            className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-[11px] font-bold text-fg hover:border-est cursor-pointer"
            title={isEs ? "Expandir tarjeta" : "Expand card"}
          >
            ▴ {isEs ? "Abrir" : "Expand"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-1.5 py-0.5 text-xs font-bold text-muted hover:text-fg cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-end px-3 sm:bottom-24 sm:px-5">
      <section
        ref={dragRef}
        aria-label="Elis Mission Control Spotlight"
        style={{
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        }}
        className="pointer-events-auto w-full max-w-[490px] overflow-hidden rounded-2xl border border-line-strong bg-surface/90 shadow-2xl backdrop-blur-xl"
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

        <div
          onPointerDown={handlePointerDown}
          title={isEs ? "Arrastra para mover por la pantalla" : "Drag to move anywhere on screen"}
          className="flex cursor-grab active:cursor-grabbing items-center justify-between gap-2 border-b border-line bg-bg/70 px-3.5 py-2 select-none"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-forecast/15 p-1 text-forecast">
              <ElisMark size={15} />
            </span>
            <span className="truncate font-mono text-[10px] font-extrabold uppercase tracking-wider text-forecast">
              {customTurn
                ? isEs
                  ? "ELIS · ANÁLISIS EN VIVO"
                  : "ELIS · LIVE PROJECTION"
                : isEs
                  ? mission.badgeEs
                  : mission.badgeEn}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleAutopilot}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold transition cursor-pointer ${
                autopilot
                  ? "border-forecast bg-forecast text-bg"
                  : "border-line bg-bg text-fg hover:border-forecast"
              }`}
            >
              {autopilot ? "⏸" : "▶"} 60s
            </button>
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                showChart ? "border-est bg-est/15 text-est" : "border-line bg-bg text-muted hover:text-fg"
              }`}
            >
              📊 {isEs ? "Gráfico" : "Chart"}
            </button>
            <button
              type="button"
              onClick={() => onToggleMinimized?.(true)}
              title={isEs ? "Minimizar a barra inferior" : "Minimize to bottom dock"}
              className="rounded-md border border-line bg-bg px-2 py-0.5 text-[11px] font-bold text-muted hover:text-fg cursor-pointer"
            >
              _
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Spotlight"
              className="rounded-md border border-line bg-bg px-2 py-0.5 text-[11px] font-bold text-muted hover:text-fg cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-bg/35 px-3.5 py-1.5">
          {ELIS_MISSIONS.map((m) => {
            const active = !customTurn && m.id === mission.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMission(m)}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                  active
                    ? "border-est bg-est/15 text-est"
                    : "border-line bg-bg/60 text-muted hover:text-fg"
                }`}
              >
                {isEs ? m.chipEs : m.chipEn}
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5 p-3.5">
          <div>
            <h3 className="m-0 font-head text-base font-extrabold leading-snug text-fg">
              {customTurn
                ? isEs
                  ? "Síntesis Verificada de Elis"
                  : "Elis Verified Synthesis"
                : isEs
                  ? mission.titleEs
                  : mission.titleEn}
            </h3>
            <div className="mt-1">
              <FormattedMessage content={customTurn ? customTurn.content : isEs ? mission.summaryEs : mission.summaryEn} compact />
            </div>
            {false && (
              <p>
              {customTurn ? customTurn.content : isEs ? mission.summaryEs : mission.summaryEn}
            </p>)}
          </div>

          {!customTurn && (
            <div className="grid grid-cols-3 gap-1.5">
              {mission.stats.map((st, idx) => (
                <CompactStat
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

          {(showChart || customTurn?.chart) && missionChart && (
            <div className="pt-1">
              <ChatChart chartData={missionChart} onSyncView={onSyncView} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forecast/30 bg-forecast/10 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[9.5px] font-extrabold uppercase tracking-wider text-forecast">
                🛡️ {customTurn ? "INDECI · SERFOR · MINAM" : isEs ? mission.userRoleEs : mission.userRoleEn}
              </span>
              <p className="m-0 mt-0.5 text-[11.5px] font-medium leading-snug text-fg">
                {customTurn
                  ? isEs
                    ? "Vuela en 3D o abre el mapa departamental 2027 de INDECI."
                    : "Fly to 3D satellite relief or open the 2027 departmental outlook map."
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
                    cameraKey: mission.cameraKey || customTurn?.chart?.region || mission.region,
                    year: customTurn?.chart?.highlight_year || mission.year,
                    month: customTurn?.chart?.highlight_month || mission.month,
                    mode3d: true,
                  })
                }
                className="rounded-lg border border-forecast bg-forecast px-2.5 py-1 text-[11px] font-bold text-bg shadow-sm transition hover:opacity-90 cursor-pointer"
              >
                🛰️ 3D
              </button>
              <button
                type="button"
                onClick={onOpenOutlook}
                className="rounded-lg border border-line bg-bg px-2 py-1 text-[11px] font-semibold text-fg hover:border-est cursor-pointer"
              >
                {isEs ? "Pronóstico 2027 →" : "2027 Map →"}
              </button>
              {customTurn && onOpenChatDrawer && (
                <button
                  type="button"
                  onClick={onOpenChatDrawer}
                  className="rounded-lg border border-est/50 bg-est/15 px-2 py-1 text-[11px] font-bold text-est hover:border-est cursor-pointer"
                >
                  💬 {isEs ? "Chat" : "Ask"}
                </button>
              )}
              {false && <button />}
              <button type="button" className="hidden">
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
