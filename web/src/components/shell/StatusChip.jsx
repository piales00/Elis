import { useI18n } from "../../i18n/I18nProvider.jsx";
import { STATUS_TONE } from "../../lib/status.js";

export default function StatusChip({ status, className = "" }) {
  const { t } = useI18n();
  const extra = status.kind === "partial" && status.info?.partial_through ? ` · ${t("status.through", { date: status.info.partial_through })}` : "";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${STATUS_TONE[status.kind]} ${className}`}>
      {t(`status.kind.${status.kind}`)}
      {extra}
    </span>
  );
}
