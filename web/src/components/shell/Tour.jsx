import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { prefersReducedMotion } from "../../lib/hooks.js";
import Icon from "./icons.jsx";

const DAY = { year: 2024, month: 9, day: 10 };

export const TOUR_STEPS = [
  { id: "cells", view: "explore", region: "peru", period: { year: 2012, month: 9 }, metric: "estimated", layer: "cells", group: "estimated", target: "layers" },
  { id: "raw", view: "compare", region: "peru", period: { year: 2012, month: 9 }, metric: "raw", layer: "cells", group: "viirs", target: "metric" },
  { id: "truecolor", view: "explore", region: "amazonia", date: DAY, metric: "estimated", layer: "truecolor", heat: false, target: "layers" },
  { id: "thermal", view: "explore", region: "amazonia", date: DAY, metric: "estimated", layer: "thermal", heat: false, target: "layers" },
  { id: "night", view: "explore", region: "amazonia", date: DAY, metric: "estimated", layer: "night", heat: false, target: "layers" },
  { id: "heat", view: "explore", region: "amazonia", date: DAY, metric: "estimated", layer: "truecolor", heat: true, target: "heat" },
  { id: "swir", view: "explore", region: "amazonia", date: DAY, metric: "estimated", layer: "swir", heat: false, target: "layers" },
  { id: "calendar", view: "explore", region: "peru", period: { year: 2024, month: 9 }, metric: "estimated", layer: "cells", group: "estimated", target: "calendar" },
  { id: "year", view: "year", region: "peru", period: { year: 2026, month: 9 }, metric: "estimated", layer: "cells", group: "estimated", target: "view-year" },
  { id: "outlook", view: "outlook", region: "peru", unit: "peru", metric: "estimated", layer: "cells", target: "view-outlook" },
  { id: "continuity", view: "continuity", region: "peru", metric: "estimated", layer: "cells", target: "view-continuity" },
  { id: "live", view: "explore", region: "peru", period: { year: 2024, month: 9 }, metric: "estimated", layer: "cells", group: "estimated", live: true, target: "live" },
  { id: "data", view: "data", region: "peru", metric: "estimated", layer: "cells", target: "view-data" },
];

export const AUTO_SKIP = new Set(["thermal", "night", "swir", "calendar", "year", "continuity", "live"]);
export const AUTO_STEPS = TOUR_STEPS.filter((s) => !AUTO_SKIP.has(s.id));

export const TOUR_STEP_MS = 5000;

export function tourSteps(auto) {
  return auto ? AUTO_STEPS : TOUR_STEPS;
}

function useSpotlight(target) {
  useEffect(() => {
    if (!target) return;
    const mark = () => {
      document.querySelectorAll("[data-tour-spot]").forEach((el) => el.removeAttribute("data-tour-spot"));
      document.querySelectorAll(`[data-tour="${target}"]`).forEach((el) => el.setAttribute("data-tour-spot", ""));
    };
    const ids = [setTimeout(mark, 60), setTimeout(mark, 600)];
    return () => {
      ids.forEach(clearTimeout);
      document.querySelectorAll("[data-tour-spot]").forEach((el) => el.removeAttribute("data-tour-spot"));
    };
  }, [target]);
}

export default function TourCard({ step, auto, onStep, onClose, onDone = onClose }) {
  const { t } = useI18n();
  const steps = tourSteps(auto);
  const total = steps.length;
  const current = steps[step] ?? steps[0];
  const last = step >= total - 1;
  useSpotlight(current.target);

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
          <Icon name="close" size={16} />
        </button>
      </div>
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
