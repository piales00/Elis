import { useI18n } from "../../../i18n/I18nProvider.jsx";
import FalseRecordChart from "../../FalseRecordChart.jsx";
import RawVsCorrected from "../../imagery/RawVsCorrected.jsx";

export default function CompareView({ series, region, period, onSelectPeriod, methodology }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4">
      <p className="m-0 text-sm leading-relaxed text-muted">{t("compare.lede")}</p>
      <FalseRecordChart series={series} region={region} period={period} onSelectPeriod={onSelectPeriod} />
      <RawVsCorrected methodology={methodology} region={region} regionLabel={t(`region.${region}`)} />
    </div>
  );
}
