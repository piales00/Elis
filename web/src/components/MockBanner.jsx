import { isMock } from "../data/client.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function MockBanner() {
  const { t } = useI18n();
  if (!isMock) return null;
  return (
    <div role="status" className="relative z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-warn-bg px-4 py-1.5 text-sm text-warn-fg">
      <strong className="tracking-wide">{t("mock.badge")}</strong>
      <span>{t("mock.detail")}</span>
    </div>
  );
}
