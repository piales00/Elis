import { useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import NormalChart from "../../NormalChart.jsx";
import FireClock from "../../FireClock.jsx";
import Coverage2026 from "../../Coverage2026.jsx";
import { LAST_YEAR } from "../../../config.js";

const TABS = ["normal", "clock"];

export default function YearView({ series, region, period, onSelectPeriod }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("normal");
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("year.tabs")} className="fc-seg self-start">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`year-tab-${k}`} aria-selected={tab === k} aria-controls={`year-panel-${k}`} onClick={() => setTab(k)} className="fc-seg-item">
            {t(`year.tab.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`year-panel-${tab}`} aria-labelledby={`year-tab-${tab}`}>
        <p className="m-0 mb-4 text-sm leading-relaxed text-muted">{t(tab === "normal" ? "normal.lede" : "clock.lede")}</p>
        {tab === "normal" ? (
          <NormalChart series={series} region={region} period={period} onSelectPeriod={onSelectPeriod} />
        ) : (
          <FireClock series={series} region={region} period={period} onSelectPeriod={onSelectPeriod} />
        )}
      </div>
      {period.year === LAST_YEAR && <Coverage2026 series={series} />}
    </div>
  );
}
