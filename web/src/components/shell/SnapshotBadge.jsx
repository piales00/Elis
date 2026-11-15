import { useId } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { useDataMode } from "../../hooks/useDataMode.js";
import { isMock } from "../../data/client.js";

export default function SnapshotBadge() {
  const { t } = useI18n();
  const mode = useDataMode();
  const tipId = useId();
  if (isMock || mode !== "fallback") return null;
  return (
    <div className="group relative" data-testid="snapshot-badge">
      <button
        type="button"
        aria-describedby={tipId}
        aria-label={t("snapshot.badge")}
        className="fc-float pointer-events-auto flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn-bg" />
        <span className="hidden whitespace-nowrap sm:inline">{t("snapshot.badge")}</span>
        <span className="whitespace-nowrap sm:hidden">{t("snapshot.short")}</span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className="fc-float pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-72 rounded-xl p-3 text-xs font-normal leading-relaxed text-fg opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {t("snapshot.tooltip")}
      </div>
    </div>
  );
}
