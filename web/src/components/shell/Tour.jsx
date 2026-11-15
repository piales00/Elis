import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { prefersReducedMotion } from "../../lib/hooks.js";
import { ElisMark } from "./Rail.jsx";

export const TOUR_STEPS = [
  { id: "cells", view: "explore", target: "layers" },
  { id: "imagery", view: "explore", layer: "truecolor", target: "layers" },
  { id: "terrain", view: "explore", target: "terrain" },
  { id: "hud", view: "explore", target: "hud" },
  { id: "ask", view: "ask", target: "view-ask" },
  { id: "compare", view: "compare", metric: "raw", target: "metric" },
  { id: "continuity", view: "continuity", target: "view-continuity" },
  { id: "outlook", view: "outlook", target: "view-outlook" },
  { id: "live", view: "explore", live: true, target: "live" },
  { id: "data", view: "data", target: "view-data" },
];

export const AUTO_STEPS = TOUR_STEPS.filter((s) => ["cells", "imagery", "hud", "ask", "outlook", "data"].includes(s.id));

export const TOUR_STEP_MS = 5000;

export function tourSteps(auto) {
  return auto ? AUTO_STEPS : TOUR_STEPS;
}

function useSpotlight(target, onPrepare) {
  const prepare = useRef(onPrepare);
  prepare.current = onPrepare;
  useEffect(() => {
    const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
    let recovering = false;
    const mark = () => {
      const candidates = [...document.querySelectorAll(`[data-tour="${target}"]`)];
      const found = candidates.find(visible);
      if (found) recovering = false;
      else if (!recovering) {
        recovering = true;
        prepare.current?.();
      }
      const selected = found || document.querySelector('[data-tour="active-panel"]');
      document.querySelectorAll("[data-tour-spot]").forEach((el) => {
        if (el !== selected) el.removeAttribute("data-tour-spot");
      });
      if (selected && visible(selected) && !selected.hasAttribute("data-tour-spot")) {
        selected.setAttribute("data-tour-spot", "");
        if (selected.closest("nav")) selected.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    const observer = new MutationObserver(mark);
    observer.observe(document.getElementById("root"), { childList: true, subtree: true });
    window.addEventListener("resize", mark);
    window.addEventListener("scroll", mark, true);
    const ids = [setTimeout(mark, 60), setTimeout(mark, 600)];
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", mark);
      window.removeEventListener("scroll", mark, true);
      ids.forEach(clearTimeout);
      document.querySelectorAll("[data-tour-spot]").forEach((el) => el.removeAttribute("data-tour-spot"));
    };
  }, [target]);
}

export default function TourCard({ step, auto, onStep, onClose, onDone = onClose, onPrepare }) {
  const { t } = useI18n();
  const steps = tourSteps(auto);
  const total = steps.length;
  const current = steps[step] ?? steps[0];
  const last = step >= total - 1;
  useSpotlight(current.target, onPrepare);

  const advance = useRef(null);
  advance.current = () => (last ? onClose() : onStep(step + 1));
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => advance.current(), TOUR_STEP_MS);
    return () => clearTimeout(id);
  }, [auto, step]);

  return (
    <section aria-labelledby="tour-title" aria-live="polite" className="fc-float fc-tour pointer-events-auto w-[min(26rem,calc(100%-1.5rem))] rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold text-muted tabular-nums">
          {t("tour.progress", { n: step + 1, total })}
          {auto && <span className="rounded-md border border-line px-1.5 py-px text-[10.5px]">{t("tour.auto")}</span>}
        </p>
        <button type="button" onClick={onClose} aria-label={t("tour.close")} aria-keyshortcuts="Escape" className="fc-icon-btn -mr-1 -mt-1">
          {t("tour.skip")}
        </button>
      </div>
      {step === 0 && (
        <p className="m-0 mt-2 flex items-center gap-2 text-sm font-semibold">
          <ElisMark size={24} />
          {t("tour.welcome")}
        </p>
      )}
      <h2 id="tour-title" className="m-0 mt-1 font-head text-[17px] font-extrabold leading-snug text-balance">
        {t(`tour.${current.id}.title`)}
      </h2>
      <p className="m-0 mt-1 text-sm leading-relaxed text-muted">{t(`tour.${current.id}.text`)}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={t("tour.steps")}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-label={`${i + 1}. ${t(`tour.${s.id}.title`)}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => onStep(i)}
                className="fc-tour-dot"
              >
                <span className={`block h-1.5 rounded-full ${i === step ? "w-5 bg-accent" : i < step ? "w-1.5 bg-muted" : "w-1.5 bg-line-strong"}`} style={{ transition: prefersReducedMotion() ? "none" : "width 200ms var(--ease-out)" }} />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="fc-btn" disabled={step === 0} onClick={() => onStep(step - 1)}>
            {t("tour.back")}
          </button>
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => (last ? onDone() : onStep(step + 1))}>
            {t(last ? "tour.done" : "tour.next")}
          </button>
        </div>
      </div>
      {auto && <div key={step} aria-hidden="true" className="fc-tour-progress" style={{ animationDuration: `${TOUR_STEP_MS}ms` }} />}
    </section>
  );
}
