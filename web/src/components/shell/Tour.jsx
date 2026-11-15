import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { prefersReducedMotion } from "../../lib/hooks.js";
import Icon from "./icons.jsx";

export const TOUR_STEPS = [
  { id: "fake", view: "compare", region: "peru", period: { year: 2012, month: 9 }, metric: "raw", layer: "cells" },
  { id: "harmonized", view: "compare", region: "peru", period: { year: 2012, month: 9 }, metric: "estimated", layer: "cells" },
  { id: "space", view: "explore", region: "amazonia", date: { year: 2024, month: 9, day: 10 }, metric: "estimated", layer: "truecolor", heat: true },
  { id: "year", view: "year", region: "peru", period: { year: 2026, month: 9 }, metric: "estimated", layer: "cells" },
  { id: "outlook", view: "outlook", region: "sierra", unit: "sierra", metric: "estimated", layer: "cells" },
];

export const TOUR_STEP_MS = 6500;

export default function TourCard({ step, auto, onStep, onClose }) {
  const { t } = useI18n();
  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];
  const last = step === total - 1;

  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => (last ? onClose() : onStep(step + 1)), TOUR_STEP_MS);
    return () => clearTimeout(id);
  }, [auto, step, last, onStep, onClose]);

  return (
    <section aria-labelledby="tour-title" aria-live="polite" className="fc-float fc-tour pointer-events-auto w-[min(30rem,calc(100%-1.5rem))] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-xs font-semibold text-muted tabular-nums">{t("tour.progress", { n: step + 1, total })}</p>
        <button type="button" onClick={onClose} aria-label={t("tour.close")} className="fc-icon-btn -mr-1 -mt-1">
          <Icon name="close" size={16} />
        </button>
      </div>
      <h2 id="tour-title" className="m-0 mt-1 font-head text-lg font-extrabold leading-snug text-balance">
        {t(`tour.${current.id}.title`)}
      </h2>
      <p className="m-0 mt-1.5 text-sm leading-relaxed text-muted">{t(`tour.${current.id}.text`)}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={t("tour.steps")}>
          {TOUR_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-label={t(`tour.${s.id}.title`)}
                aria-current={i === step ? "step" : undefined}
                onClick={() => onStep(i)}
                className={`block h-1.5 rounded-full ${i === step ? "w-6 bg-accent" : "w-1.5 bg-line-strong"}`}
                style={{ transition: prefersReducedMotion() ? "none" : "width 200ms var(--ease-out)" }}
              />
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <button type="button" className="fc-btn" disabled={step === 0} onClick={() => onStep(step - 1)}>
            {t("tour.back")}
          </button>
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => (last ? onClose() : onStep(step + 1))}>
            {t(last ? "tour.done" : "tour.next")}
          </button>
        </div>
      </div>
      {auto && <div key={step} aria-hidden="true" className="fc-tour-progress" style={{ animationDuration: `${TOUR_STEP_MS}ms` }} />}
    </section>
  );
}
