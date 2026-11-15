import { useI18n } from "../../../i18n/I18nProvider.jsx";
import HowWeCalculated from "../../HowWeCalculated.jsx";
import SeriesTable from "../../SeriesTable.jsx";
import DataSummary from "../../DataSummary.jsx";
import { Preferences } from "../Rail.jsx";

export default function MethodView({ methodology, region, series, regionCount, mapCells, theme, onTheme }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-6">
      <p className="m-0 text-sm leading-relaxed text-muted">{t("method.lede")}</p>
      <HowWeCalculated methodology={methodology} region={region} />
      <details className="fc-details">
        <summary>{t("check.title")}</summary>
        <p className="m-0 mt-2 text-sm text-muted">{t("check.lede")}</p>
        <SeriesTable series={series} />
        <DataSummary series={series} regionCount={regionCount} mapCells={mapCells} methodology={methodology} />
      </details>
      <p className="m-0 text-xs text-muted">{t("unit.note")}</p>
      <div className="lg:hidden">
        <Preferences theme={theme} onTheme={onTheme} />
      </div>
    </div>
  );
}
