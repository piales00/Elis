import saved from "../../data/chat-presets.json";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import ChatChart from "./ChatChart.jsx";
import FormattedMessage from "./FormattedMessage.jsx";
import { ElisMark } from "../shell/Rail.jsx";

export const AUTOPILOT_SECONDS = 40;

const mission = (id, index, titleEn, titleEs, preset, options = {}) => ({
  id,
  badgeEn: `MISSION ${index} · HARMONIZED RECORD`,
  badgeEs: `MISIÓN ${index} · REGISTRO ARMONIZADO`,
  chipEn: titleEn,
  chipEs: titleEs,
  titleEn,
  titleEs,
  summaryEn: preset.en,
  summaryEs: preset.es,
  kpiPillEn: "MODIS–VIIRS · fire cell-days",
  kpiPillEs: "MODIS–VIIRS · fire cell-days",
  userPromptEn: titleEn,
  userPromptEs: titleEs,
  userRoleEn: "Explore the evidence",
  userRoleEs: "Explora la evidencia",
  actionEn: "Inspect the chart and synchronize the map and timeline. Forecasts remain separate from observations.",
  actionEs: "Inspecciona el gráfico y sincroniza mapa y línea de tiempo. El pronóstico se mantiene separado de lo observado.",
  region: "peru",
  cameraKey: "peru",
  year: 2012,
  month: 9,
  metric: "estimated",
  mode3d: false,
  decisionChips: [
    { labelEn: "Compare chart", labelEs: "Comparar gráfico", action: "chart" },
    { labelEn: "Explore in 3D", labelEs: "Explorar en 3D", action: "3d" },
  ],
  ...options,
});

export const ELIS_MISSIONS = [
  mission("artifact", 1, "The 2012 sensor jump", "El salto de sensores de 2012", saved.presets.jump_2012, { metric: "raw" }),
  mission("amazon3d", 2, "Amazon record in 3D", "Registro amazónico en 3D", saved.presets.worst_amazon, { region: "amazonia", cameraKey: "madre_de_dios", year: 2010, month: 8, mode3d: true }),
  mission("disagreement", 3, "Continuity after MODIS", "Continuidad tras MODIS", saved.continuity, { region: "sierra", cameraKey: "cusco", year: 2024, month: 8, mode3d: true }),
  mission("earlywarning", 4, "Seasonal outlook", "Pronóstico de temporada", saved.presets.forecast_next, { year: 2026, decisionChips: [
    { labelEn: "Forecast map", labelEs: "Mapa de pronóstico", action: "outlook" },
    { labelEn: "Ask about uncertainty", labelEs: "Consultar incertidumbre", action: "chat" },
  ] }),
];

const AUTOPILOT_MS = AUTOPILOT_SECONDS * 1000 / ELIS_MISSIONS.length;

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
  onCompleteAutopilot,
  onClose,
  onOpenChatDrawer,
  onOpenOutlook,
  onOpenMethod,
  onSyncView,
}) {
  const { locale, t } = useI18n();
  const isEs = locale === "es";
  const [showChart, setShowChart] = useState(false);
  const missionIndex = useMemo(() => {
    const idx = ELIS_MISSIONS.findIndex((m) => m.id === activeMissionId);
    return idx >= 0 ? idx : 0;
  }, [activeMissionId]);

  const mission = ELIS_MISSIONS[missionIndex];

  const startedAt = useRef(null);
  useEffect(() => {
    startedAt.current = open && autopilot && !customTurn ? performance.now() : null;
  }, [open, autopilot, customTurn]);

  const advanceRef = useRef(null);
  advanceRef.current = () => {
    if (missionIndex === ELIS_MISSIONS.length - 1) {
      onCompleteAutopilot?.();
      return;
    }
    const nextIdx = missionIndex + 1;
    onSelectMission(ELIS_MISSIONS[nextIdx], true);
  };

  useEffect(() => {
    if (!open || !autopilot || customTurn) return;
    const deadline = startedAt.current + (missionIndex + 1) * AUTOPILOT_MS;
    const timer = setTimeout(() => {
      advanceRef.current?.();
    }, Math.max(0, deadline - performance.now()));
    return () => clearTimeout(timer);
  }, [open, autopilot, missionIndex, customTurn]);

  const missionChart = useMemo(() => {
    if (customTurn?.chart) return customTurn.chart;
    if (mission.id === "artifact") return { ...saved.presets.jump_2012.chart, chart: "raw_vs_corrected" };
    if (mission.id === "amazon3d") return saved.presets.worst_amazon.chart;
    if (mission.id === "earlywarning") return saved.presets.forecast_next.chart;
    if (mission.id === "disagreement") return saved.continuity.chart;
    const rows = series.filter((r) => (!r.region || r.region === mission.region) && r.year === mission.year);
    return rows.length ? {
      chart: "year_vs_history",
      title: `${mission.region}: ${mission.year}`,
      region: mission.region,
      highlight_year: mission.year,
      unit: "fire cell-days",
      series: rows,
    } : null;
  }, [customTurn, series, mission]);

  if (!open) return null;

  if (minimized) {
    return (
      <div className="fc-elis-spotlight pointer-events-none absolute inset-x-0 z-30 flex items-end justify-center px-3">
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
            {autopilot ? "⏸" : "▶"} {AUTOPILOT_SECONDS}s
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
    <div className="fc-elis-spotlight pointer-events-none absolute inset-x-0 z-30 flex justify-end px-3">
      <section

        aria-label="Elis Mission Control Spotlight"

        className="pointer-events-auto max-h-full w-full max-w-[490px] overflow-y-auto rounded-2xl border border-line-strong bg-surface/90 shadow-2xl backdrop-blur-xl"
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


          className="flex items-center justify-between gap-2 border-b border-line bg-bg/70 px-3.5 py-2 select-none"
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
            {!customTurn && (
              <span className="shrink-0 rounded border border-forecast/30 bg-forecast/10 px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold text-forecast">
                {missionIndex + 1} / {ELIS_MISSIONS.length}
              </span>
            )}
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
              {autopilot ? "⏸" : "▶"} {t("chat.autopilot", { seconds: AUTOPILOT_SECONDS })}
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

        {!customTurn && (
          <div className="flex items-center gap-2 border-b border-line bg-bg/40 px-3.5 py-1.5 text-xs text-muted">
            <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-forecast/90">
              {isEs ? "Consulta:" : "Question:"}
            </span>
            <span className="truncate italic text-fg font-medium">
              "{isEs ? mission.userPromptEs : mission.userPromptEn}"
            </span>
          </div>
        )}

        <div className="space-y-2.5 p-3.5">
          <div>
            <h3 className="m-0 font-head text-base font-extrabold leading-snug text-fg">
              {customTurn
                ? isEs
                  ? "Síntesis de Elis"
                  : "Elis Synthesis"
                : isEs
                  ? mission.titleEs
                  : mission.titleEn}
            </h3>
            <div className="mt-1">
              <FormattedMessage content={customTurn ? customTurn.content : isEs ? mission.summaryEs : mission.summaryEn} compact />
            </div>
          </div>

          {(showChart || customTurn?.chart) && missionChart && (
            <div className="pt-1">
              <ChatChart chartData={missionChart} onSyncView={onSyncView} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forecast/30 bg-forecast/10 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[9.5px] font-extrabold uppercase tracking-wider text-forecast">
                {customTurn ? "MODIS–VIIRS" : isEs ? mission.userRoleEs : mission.userRoleEn}
              </span>
              <p className="m-0 mt-0.5 text-[11.5px] font-medium leading-snug text-fg">
                {customTurn
                  ? isEs
                    ? "Explora el relieve 3D o el pronóstico departamental de 2027."
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
            </div>
          </div>

          {!customTurn && mission.decisionChips && mission.decisionChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted">
                {isEs ? "Explorar:" : "Explore:"}
              </span>
              {mission.decisionChips.map((chip, cIdx) => (
                <button
                  key={`chip-${cIdx}`}
                  type="button"
                  onClick={() => {
                    if (autopilot) onToggleAutopilot();
                    if (chip.action === "chart") setShowChart(true);
                    else if (chip.action === "outlook") onOpenOutlook();
                    else if (chip.action === "chat") onOpenChatDrawer?.();
                    else if (chip.action === "3d") {
                      onSyncView?.({
                        region: mission.region,
                        cameraKey: mission.cameraKey,
                        year: mission.year,
                        month: mission.month,
                        mode3d: true,
                      });
                    }
                  }}
                  className="rounded-lg border border-line bg-bg/80 px-2 py-1 text-[10.5px] font-semibold text-fg shadow-xs transition hover:border-forecast hover:bg-forecast/10 hover:text-forecast cursor-pointer"
                >
                  {isEs ? chip.labelEs : chip.labelEn}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
