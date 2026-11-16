import { AUTOPILOT_SECONDS } from "./ElisSpotlight.jsx";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {
  PRESET_QUESTIONS,
  buildOfflineFallbackResponse,
  buildPresetResponse,
  streamChat,
} from "../../data/chat.js";
import ChatChart from "./ChatChart.jsx";
import FormattedMessage, { detectAlertBadge } from "./FormattedMessage.jsx";
import { buildDecisionSuggestions } from "../../data/chat.js";
import Icon from "../shell/icons.jsx";
import { ElisMark } from "../shell/Rail.jsx";
import { useDataMode } from "../../hooks/useDataMode.js";

const MAX_HISTORY_MESSAGES = 12;
const MAX_INPUT_CHARS = 600;

export default function ChatPanel({
  region = "peru",
  series = [],
  methodology = null,
  onSyncView,
  onLaunchMission,
  onProjectTurn,
  embedded = false,
  onOpenMethod,
}) {
  const { locale, t } = useI18n();
  const snapshot = useDataMode() === "fallback";
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [liveStatus, setLiveStatus] = useState("ready");
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = turns.length ? scrollRef.current.scrollHeight : 0;
    }
  }, [turns, streaming, open]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && openState) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openState]);

  const handlePresetClick = (preset) => {
    if (streaming) return;
    const questionText = t(preset.key);
    const targetRegion = preset.defaultRegion || region || "peru";
    const built = buildPresetResponse(preset.id, {
      region: targetRegion,
      series,
      methodology,
      locale,
    });

    const assistantTurn = {
      id: `a-${Date.now() + 1}`,
      role: "assistant",
      content: built.text,
      tools: built.tools || [],
      chart: built.chart || null,
      unverified: [],
      verified: built.verified,
      isPreset: true,
      presetId: preset.id,
      targetRegion,
      suggestions: buildDecisionSuggestions({ question: questionText, region: targetRegion, locale }),
      done: true,
    };
    setTurns((prev) => [
      ...prev.slice(-(MAX_HISTORY_MESSAGES - 2)),
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: questionText,
        presetKey: preset.key,
      },
      assistantTurn,
    ]);
    if (onSyncView && built.chart) {
      onSyncView({
        region: built.chart.region || targetRegion,
        year: built.chart.highlight_year || 2024,
        month: 9,
        mode3d: false,
      });
    }
  };

  useEffect(() => {
    setTurns((prev) =>
      prev.map((turn) => {
        if (turn.presetId) {
          const rebuilt = buildPresetResponse(turn.presetId, {
            region: turn.targetRegion || region || "peru",
            series,
            methodology,
            locale,
          });
          return {
            ...turn,
            content: rebuilt.text,
            suggestions: buildDecisionSuggestions({
              question: turn.presetId,
              region: turn.targetRegion || region || "peru",
              locale,
            }),
          };
        }
        if (turn.role === "user" && turn.presetKey) {
          return {
            ...turn,
            content: t(turn.presetKey),
          };
        }
        return turn;
      }),
    );
  }, [locale]);

  const buildApiMessages = (nextUserQuestion) => {
    const history = turns
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-(MAX_HISTORY_MESSAGES - 1))
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
    history.push({ role: "user", content: nextUserQuestion });
    return history;
  };

  const runLiveQuestion = async (questionText) => {
    const trimmed = questionText.trim();
    if (!trimmed || streaming) return;
    if (/what (?:is elis|does (?:this app|elis) do|do you do)|purpose of (?:this app|elis)|qu[eé] (?:es elis|hace (?:elis|esta app))|para qu[eé] sirve/i.test(trimmed)) {
      handlePresetClick(PRESET_QUESTIONS.find((preset) => preset.id === "about_elis"));
      return;
    }
    if (snapshot) return;

    const userTurnId = `u-${Date.now()}`;
    const assistantTurnId = `a-${Date.now() + 1}`;
    const apiMessages = buildApiMessages(trimmed);

    setTurns((prev) => [
      ...prev.slice(-(MAX_HISTORY_MESSAGES - 2)),
      {
        id: userTurnId,
        role: "user",
        content: trimmed,
      },
      {
        id: assistantTurnId,
        role: "assistant",
        content: "",
        tools: [],
        chart: null,
        unverified: [],
        verified: true,
        isPreset: false,
        done: false,
        error: null,
      },
    ]);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        messages: apiMessages,
        region,
        locale,
        signal: controller.signal,
        onEvent: (eventName, data) => {
          setTurns((prev) =>
            prev.map((item) => {
              if (item.id !== assistantTurnId) return item;
              if (eventName === "text") {
                return {
                  ...item,
                  content: item.content + (data.delta || ""),
                };
              }
              if (eventName === "tool") {
                const exists = item.tools.some((tl) => tl.name === data.name && tl.label === data.label);
                return {
                  ...item,
                  tools: exists ? item.tools : [...item.tools, { name: data.name, label: data.label }],
                };
              }
              if (eventName === "chart") {
                return {
                  ...item,
                  chart: data,
                };
              }
              if (eventName === "notice" && data.kind === "unverified_figure") {
                return {
                  ...item,
                  verified: false,
                  unverified: Array.isArray(data.values) ? data.values : [],
                };
              }
              if (eventName === "error") {
                if (!item.content) {
                  const fallback = buildOfflineFallbackResponse(trimmed, { region, locale });
                  return {
                    ...item,
                    content: fallback.text,
                    chart: fallback.chart || item.chart,
                    tools: item.tools.length ? item.tools : fallback.tools || [],
                    verified: true,
                    isPreset: true,
                    suggestions: buildDecisionSuggestions({ question: trimmed, region, locale }),
                    done: true,
                  };
                }
                return {
                  ...item,
                  error: t("chat.error.busy"),
                  done: true,
                };
              }
              if (eventName === "done") {
                return {
                  ...item,
                  done: true,
                  usage: data.usage || null,
                  suggestions: Array.isArray(data.suggestions) && data.suggestions.length
                    ? data.suggestions
                    : buildDecisionSuggestions({ question: trimmed, region, locale }),
                };
              }
              return item;
            }),
          );
        },
      });
      setLiveStatus("ready");
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err.status === 503) {
        setLiveStatus("unavailable");
      }
      const fallback = buildOfflineFallbackResponse(trimmed, { region, locale });
      setTurns((prev) =>
        prev.map((item) =>
          item.id === assistantTurnId
            ? item.content
              ? {
                  ...item,
                  error: t("chat.error.busy"),
                  done: true,
                }
              : {
                  ...item,
                  content: fallback.text,
                  chart: fallback.chart || item.chart,
                  tools: item.tools.length ? item.tools : fallback.tools || [],
                  verified: true,
                  isPreset: true,
                  presetId: fallback.presetId,
                  targetRegion: region,
                  suggestions: buildDecisionSuggestions({ question: trimmed, region, locale }),
                  done: true,
                }
            : item,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || streaming || snapshot) return;
    const q = input;
    setInput("");
    runLiveQuestion(q);
  };

  const handleClear = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setStreaming(false);
    setTurns([]);
  };

  const regionName = t(`region.${region}`);

  return (
    <>
      {!embedded && <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="ask-the-data-drawer"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full border border-line bg-fg px-4 py-2.5 text-sm font-semibold text-bg shadow-lg transition hover:opacity-90 cursor-pointer"
      >
        <Icon name="ask" size={16} />
        <span>{t("chat.trigger")}</span>
      </button>}

      {open && (
        <div
          id="ask-the-data-drawer"
          role={embedded ? undefined : "dialog"}
          aria-label={t("chat.title")}
          className={embedded ? "flex h-full min-h-0 flex-col" : "fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-line bg-bg shadow-2xl"}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="m-0 flex items-center gap-1.5 text-base font-bold text-fg">
                  <Icon name="ask" size={18} className="text-forecast" />
                  {t("chat.title")}
                  <span className="rounded-[5px] bg-forecast px-1 text-[10px] font-extrabold leading-[15px] text-bg">{t("ai.tag")}</span>
                </h2>
                <span className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-est">
                  {regionName}
                </span>
              </div>
              <p className="m-0 mt-0.5 text-xs text-muted">{t("chat.subtitle")}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-medium text-muted hover:text-fg cursor-pointer"
                >
                  {t("chat.clear")}
                </button>
              )}
              {!embedded && <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("chat.close")}
                className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-fg hover:border-muted cursor-pointer"
              >
                ✕
              </button>}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {turns.length === 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-forecast/35 bg-gradient-to-b from-surface via-surface/95 to-bg/90 p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="relative grid size-11 place-items-center rounded-xl border border-forecast/40 bg-forecast/15 shadow-inner">
                    <ElisMark size={24} />
                    <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full border-2 border-bg bg-emerald-500" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 font-head text-sm font-extrabold tracking-tight text-fg">
                        {locale === "es" ? "Elis · Asistente Científico" : "Elis · Science Assistant"}
                      </h3>
                      <span className="rounded-full border border-forecast/30 bg-forecast/10 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider text-forecast">
                        NASA Space Apps
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 text-[11px] font-medium text-muted">
                      {locale === "es" ? "Armonización Satelital MODIS–VIIRS (2000–2026)" : "MODIS–VIIRS Satellite Harmonization (2000–2026)"}
                    </p>
                  </div>
                </div>

                <p className="m-0 mt-3 text-xs leading-relaxed text-fg/90">
                  {locale === "es"
                    ? "Exploro 26 años de historia comparable del fuego en el Perú resolviendo la discrepancia entre satélites:"
                    : "Exploring 26 years of comparable fire history in Peru, reconciling multi-sensor discrepancies:"}
                </p>

                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = PRESET_QUESTIONS.find((item) => item.id === "compare_naive");
                      if (p) handlePresetClick(p);
                    }}
                    className="group flex w-full cursor-pointer items-start justify-between gap-2.5 rounded-xl border border-line bg-bg/70 p-2.5 text-left transition-all hover:border-forecast/60 hover:bg-surface/90 hover:shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none">🛰️</span>
                      <div className="leading-snug">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs font-bold text-fg group-hover:text-forecast transition-colors">
                            {locale === "es" ? "Estimador de Chapman" : "Chapman Estimator"}
                          </strong>
                          <span className="rounded bg-line/60 px-1 py-0.2 font-mono text-[9px] text-muted">90% CI</span>
                        </div>
                        <span className="text-[11px] text-muted">
                          {locale === "es"
                            ? "Celdas-día con fuego comparables con rangos de incertidumbre al 90 %."
                            : "Harmonized fire cell-days with strict 90% confidence intervals."}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-forecast font-bold">
                      →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const p = PRESET_QUESTIONS.find((item) => item.id === "jump_2012");
                      if (p) handlePresetClick(p);
                    }}
                    className="group flex w-full cursor-pointer items-start justify-between gap-2.5 rounded-xl border border-line bg-bg/70 p-2.5 text-left transition-all hover:border-forecast/60 hover:bg-surface/90 hover:shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none">🚨</span>
                      <div className="leading-snug">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs font-bold text-fg group-hover:text-forecast transition-colors">
                            {locale === "es" ? "Artificio de 2012 resuelto" : "2012 Artifact Resolved"}
                          </strong>
                          <span className="rounded bg-line/60 px-1 py-0.2 font-mono text-[9px] text-muted">9× Jump</span>
                        </div>
                        <span className="text-[11px] text-muted">
                          {locale === "es"
                            ? "El salto de 9× fue por la entrada de VIIRS (375 m), no una multiplicación del fuego real."
                            : "The 9× count surge was a sensor transition (VIIRS 375 m), not an explosion in burning."}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-forecast font-bold">
                      →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const p = PRESET_QUESTIONS.find((item) => item.id === "forecast_next");
                      if (p) handlePresetClick(p);
                    }}
                    className="group flex w-full cursor-pointer items-start justify-between gap-2.5 rounded-xl border border-line bg-bg/70 p-2.5 text-left transition-all hover:border-forecast/60 hover:bg-surface/90 hover:shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none">🛡️</span>
                      <div className="leading-snug">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs font-bold text-fg group-hover:text-forecast transition-colors">
                            {locale === "es" ? "Pronóstico y Continuidad" : "Outlook & Continuity"}
                          </strong>
                          <span className="rounded bg-line/60 px-1 py-0.2 font-mono text-[9px] text-muted">2027+</span>
                        </div>
                        <span className="text-[11px] text-muted">
                          {locale === "es"
                            ? "Pronóstico 2027 separado de lo observado y emulador para cuando MODIS se apague en 2026."
                            : "2027 outlook kept separate from observations + emulator for post-MODIS continuity."}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-forecast font-bold">
                      →
                    </span>
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10px] text-muted">
                  <span>
                    {locale === "es" ? "💡 Toca una tarjeta o escribe cualquier pregunta abajo" : "💡 Tap any card or ask any question below"}
                  </span>
                  <span className="font-mono text-forecast">● LIVE READY</span>
                </div>
              </div>
            )}
            {onLaunchMission && (
              <div className="rounded-xl border border-forecast/40 bg-forecast/10 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-forecast">
                    {locale === "es" ? "HUD EN EL MAPA" : "MAP MISSION HUD"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onLaunchMission("artifact", true)}
                    className="rounded-md bg-forecast px-2.5 py-1 text-[11px] font-bold text-bg shadow-sm transition hover:opacity-90 cursor-pointer"
                  >
                    ▶ {t("chat.autopilot", { seconds: AUTOPILOT_SECONDS })}
                  </button>
                </div>
                <p className="m-0 mb-2.5 text-xs text-muted">
                  {locale === "es"
                    ? "Explora cuatro misiones del reto con gráficos, rangos de incertidumbre y navegación 3D:"
                    : "Explore four challenge briefings with charts, uncertainty ranges and 3D navigation:"}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onLaunchMission("artifact", false)}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-[11px] font-semibold text-fg transition hover:border-forecast cursor-pointer"
                  >
                    🚨 {locale === "es" ? "Salto Falso 9× (2012)" : "2012 False 9× Jump"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchMission("amazon3d", false)}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-[11px] font-semibold text-fg transition hover:border-forecast cursor-pointer"
                  >
                    🛰️ {locale === "es" ? "Amazonía 3D (2010)" : "Amazon 3D (2010)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchMission("disagreement", false)}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-[11px] font-semibold text-fg transition hover:border-forecast cursor-pointer"
                  >
                    {locale === "es" ? "Continuidad tras MODIS" : "Continuity after MODIS"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchMission("earlywarning", false)}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-[11px] font-semibold text-fg transition hover:border-forecast cursor-pointer"
                  >
                    🛡️ {locale === "es" ? "Pronóstico de temporada" : "Seasonal outlook"}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="m-0 mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("chat.presets.heading")}
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={streaming || snapshot}
                  onClick={() =>
                    runLiveQuestion(
                      locale === "es"
                        ? "¿Cuál es el pronóstico de temporada de 2027 para Cusco, con su rango y método?"
                        : "What is the 2027 seasonal outlook for Cusco, including its range and method?",
                    )
                  }
                  className="w-full rounded-lg border border-forecast/40 bg-forecast/10 px-3 py-2 text-left text-xs font-semibold text-forecast transition hover:border-forecast disabled:opacity-50 cursor-pointer"
                >
                  🏛️ {locale === "es" ? "¿Pronóstico 2027 para Cusco con incertidumbre?" : "What is the 2027 Cusco outlook and uncertainty?"}
                </button>
                {PRESET_QUESTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={streaming}
                    onClick={() => handlePresetClick(preset)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-left text-xs font-medium text-fg transition hover:border-est hover:bg-surface disabled:opacity-50 cursor-pointer"
                  >
                    {t(preset.key)}
                  </button>
                ))}
              </div>
            </div>

            {snapshot && (
              <div role="status" className="rounded-xl border border-line bg-warn-bg px-3 py-2 text-xs font-medium text-warn-fg">
                {t("chat.status.snapshot")}
              </div>
            )}

            {!snapshot && liveStatus === "unavailable" && (
              <div className="rounded-xl border border-line bg-warn-bg px-3 py-2 text-xs font-medium text-warn-fg">
                {t("chat.status.offlineFallback")}
              </div>
            )}

            {turns.map((turn) => {
              if (turn.role === "user") {
                return (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-fg px-3.5 py-2 text-sm font-medium text-bg">
                      {turn.content}
                    </div>
                  </div>
                );
              }

              return (
                <div key={turn.id} className="rounded-2xl border border-line bg-surface p-3.5 text-sm text-fg">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {turn.tools &&
                      turn.tools.map((tl, idx) => (
                        <span
                          key={`${tl.name}-${idx}`}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-mono font-medium text-est"
                        >
                          ⚙ {tl.name}
                        </span>
                      ))}
                    {turn.done && !turn.error && turn.verified && (turn.isPreset || turn.tools?.length > 0) && /\d/.test(turn.content) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-medium text-[var(--c-viirs)]">
                        ✓ {t("chat.badge.verified")}
                      </span>
                    )}
                    {turn.done && !turn.error && (() => {
                      const badge = detectAlertBadge(turn.content, locale === "es");
                      return badge ? (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-extrabold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      ) : null;
                    })()}
                    {false && (
                      <span>
                      </span>
                    )}
                    {turn.done && !turn.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-fg">
                        ⚠ {t("chat.notice.unverified")}: {turn.unverified.join(", ")}
                      </span>
                    )}
                  </div>

                  {!turn.content && !turn.error && !turn.done && (
                    <p className="m-0 text-xs text-muted animate-pulse">
                      {turn.tools.length > 0
                        ? turn.tools[turn.tools.length - 1].label
                        : t("chat.status.thinking")}
                    </p>
                  )}

                  {turn.content && (
                    <div className="m-0 text-sm text-fg">
                      <FormattedMessage content={turn.content} />
                    </div>
                  )}
                  {false && (
                    <p>
                      {turn.content}
                    </p>
                  )}

                  {turn.error && (
                    <div className="mt-2 rounded-lg border border-danger/40 bg-bg p-2.5 text-xs text-danger">
                      <p className="m-0 font-medium">{turn.error}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const lastUser = [...turns].reverse().find((m) => m.role === "user");
                            if (lastUser) runLiveQuestion(lastUser.content);
                          }}
                          className="rounded border border-line bg-surface px-2 py-1 text-[11px] font-medium text-fg hover:border-muted cursor-pointer"
                        >
                          {t("chat.retry")}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-col gap-1.5">
                        {PRESET_QUESTIONS.map((preset) => (
                          <button key={preset.id} type="button" disabled={streaming} onClick={() => handlePresetClick(preset)} className="rounded border border-line bg-surface px-2 py-2 text-left text-fg cursor-pointer">
                            {t(preset.key)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {turn.chart && <ChatChart chartData={turn.chart} onSyncView={onSyncView} />}

                  {turn.done && !turn.error && Array.isArray(turn.suggestions) && turn.suggestions.length > 0 && (
                    <div className="mt-3 rounded-xl border border-line bg-bg/75 p-2.5">
                      <p className="m-0 mb-1.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-forecast">
                        {locale === "es" ? "🧭 RUTAS DE DECISIÓN (ELIGE QUÉ PROFUNDIZAR)" : "🧭 NEXT DECISION PATHS (CLICK TO DRILL DOWN)"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {turn.suggestions.map((chip) => (
                          <button
                            key={chip.id || chip.label}
                            type="button"
                            disabled={streaming || snapshot}
                            onClick={() => {
                              if (onSyncView && chip.region) {
                                onSyncView({
                                  region: chip.region,
                                  cameraKey: chip.cameraKey || chip.region,
                                  year: 2024,
                                  month: 9,
                                  mode3d: Boolean(chip.mode3d),
                                });
                              }
                              runLiveQuestion(chip.prompt);
                            }}
                            className="rounded-lg border border-forecast/40 bg-forecast/10 px-2.5 py-1 text-left text-[11px] font-semibold text-fg transition hover:border-forecast hover:bg-forecast/20 disabled:opacity-50 cursor-pointer"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {turn.done && !turn.error && onSyncView && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {onProjectTurn && (
                        <button
                          type="button"
                          onClick={() => onProjectTurn(turn)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-est/50 bg-est/15 px-2.5 py-1 text-[11px] font-bold text-est transition hover:border-est cursor-pointer"
                        >
                          <span>✨</span>
                          <span>
                            {locale === "es"
                              ? "Proyectar en HUD Central"
                              : "Project on Center HUD"}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onSyncView({
                            region: turn.chart?.region || region || "peru",
                            year: turn.chart?.highlight_year || 2024,
                            month: turn.chart?.highlight_month || 9,
                            mode3d: true,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-forecast/40 bg-forecast/10 px-2.5 py-1 text-[11px] font-semibold text-forecast transition hover:border-forecast cursor-pointer"
                      >
                        <span>🛰️</span>
                        <span>
                          {locale === "es"
                            ? "Volar al relieve 3D de esta región"
                            : "Fly to 3D relief for this region"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSyncView({
                            region: turn.chart?.region || region || "peru",
                            year: turn.chart?.highlight_year || 2024,
                            month: turn.chart?.highlight_month || 9,
                            mode3d: false,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1 text-[11px] font-medium text-fg transition hover:border-est cursor-pointer"
                      >
                        <span>🗺️</span>
                        <span>
                          {locale === "es"
                            ? "Sincronizar mapa 2D y línea de tiempo"
                            : "Sync 2D map & timeline"}
                        </span>
                      </button>
                    </div>
                  )}

                  {turn.done && (
                    <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted">
                        <span className="rounded border border-line bg-bg px-1.5 py-0.5">MODIS Aqua + VIIRS S-NPP</span>
                        <span className="rounded border border-line bg-bg px-1.5 py-0.5">0.1° (~11 km)</span>
                        <span className="rounded border border-line bg-bg px-1.5 py-0.5">Chapman 90% CI</span>
                      </div>
                      <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">{t("chat.unitReminder")}</span>
                      <a
                        href="#method"
                        onClick={(e) => {
                          setOpen(false);
                          if (onOpenMethod) {
                            e.preventDefault();
                            onOpenMethod();
                          }
                        }}
                        className="font-semibold text-est hover:underline"
                      >
                        {t("chat.howWeCalculateLink")} →
                      </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                maxLength={MAX_INPUT_CHARS}
                disabled={streaming || snapshot}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t(snapshot ? "chat.input.snapshot" : "chat.input.placeholder")}
                aria-label={t(snapshot ? "chat.input.snapshot" : "chat.input.placeholder")}
                className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-est focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={streaming || snapshot || !input.trim()}
                className="rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {streaming ? "…" : t("chat.send")}
              </button>
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-muted">{t("chat.disclaimer")}</p>
          </form>
        </div>
      )}
    </>
  );
}
