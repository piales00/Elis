import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {
  PRESET_QUESTIONS,
  buildPresetResponse,
  streamChat,
} from "../../data/chat.js";
import ChatChart from "./ChatChart.jsx";
import Icon from "../shell/icons.jsx";
import { useDataMode } from "../../hooks/useDataMode.js";

const MAX_HISTORY_MESSAGES = 12;
const MAX_INPUT_CHARS = 600;

export default function ChatPanel({
  region = "peru",
  series = [],
  methodology = null,
  onSyncView,
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

    setTurns((prev) => [
      ...prev.slice(-(MAX_HISTORY_MESSAGES - 2)),
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: questionText,
      },
      {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        content: built.text,
        tools: built.tools || [],
        chart: built.chart || null,
        unverified: [],
        verified: true,
        isPreset: true,
        done: true,
      },
    ]);
  };

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
    if (!trimmed || streaming || snapshot) return;

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
                return {
                  ...item,
                  error: data.message || t("chat.error.generic"),
                  done: true,
                };
              }
              if (eventName === "done") {
                return {
                  ...item,
                  done: true,
                  usage: data.usage || null,
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
      setTurns((prev) =>
        prev.map((item) =>
          item.id === assistantTurnId
            ? {
                ...item,
                error: err.message || t("chat.error.generic"),
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
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="m-0 mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("chat.presets.heading")}
              </p>
              <div className="flex flex-col gap-1.5">
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
                    {turn.done && !turn.error && turn.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-medium text-[var(--c-viirs)]">
                        ✓ {t("chat.badge.verified")}
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
                    <p className="m-0 whitespace-pre-line leading-relaxed text-sm text-fg">
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
                    </div>
                  )}

                  {turn.chart && <ChatChart chartData={turn.chart} onSyncView={onSyncView} />}

                  {turn.done && (
                    <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-xs">
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
