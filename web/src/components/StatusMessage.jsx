import { useI18n } from "../i18n/I18nProvider.jsx";

export default function StatusMessage({ status, error }) {
  const { t } = useI18n();
  if (status === "loading") return <p role="status" className="m-0 mb-2 text-muted">{t("status.loading")}</p>;
  if (status === "error") {
    return (
      <p role="alert" className="m-0 mb-2 font-semibold text-danger">
        {t("status.error", { message: error?.message ?? String(error) })}
      </p>
    );
  }
  return null;
}
