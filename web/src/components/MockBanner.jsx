import { isMock } from "../data/client.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function MockBanner() {
  const { t } = useI18n();
  if (!isMock) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex flex-wrap gap-x-3 gap-y-1 bg-warn-bg px-4 py-2 text-sm text-warn-fg"
    >
      <strong>{t("mock.badge")}</strong>
      <span>{t("mock.detail")}</span>
    </div>
  );
}
