import { useEffect, useState } from "react";
import { useRegions, useRegionData } from "./hooks/useRegionData.js";
import { useMapCells } from "./hooks/useMapCells.js";
import { DEFAULT_PERIOD } from "./config.js";
import { periodState } from "./lib/period.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import MockBanner from "./components/MockBanner.jsx";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import Section from "./components/Section.jsx";
import StatusMessage from "./components/StatusMessage.jsx";
import FalseRecordChart from "./components/FalseRecordChart.jsx";
import MapSection from "./components/MapSection.jsx";
import FireClock from "./components/FireClock.jsx";
import NormalChart from "./components/NormalChart.jsx";
import HowWeCalculated from "./components/HowWeCalculated.jsx";
import Coverage2026 from "./components/Coverage2026.jsx";
import SeriesTable from "./components/SeriesTable.jsx";
import DataSummary from "./components/DataSummary.jsx";

export default function App() {
  const { t } = useI18n();
  const [region, setRegion] = useState("peru");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);

  const regionsState = useRegions();
  const { regionIds, regions } = regionsState;
  const { status, error, series, methodology } = useRegionData(region);

  useEffect(() => {
    if (regionIds.length && !regionIds.includes(region)) setRegion(regionIds[0]);
  }, [regionIds, region]);

  const seriesLoading = status === "loading";
  const observed = !seriesLoading && periodState(series, period.year, period.month) === "observed";
  const map = useMapCells({ ...period, region, enabled: observed });

  const loadError = regionsState.status === "error" ? regionsState.error : status === "error" ? error : null;

  return (
    <>
      <MockBanner />
      <Header regionIds={regionIds} region={region} onRegionChange={setRegion} />
      <Hero />
      <div className="mx-auto max-w-[1180px] px-4 pt-6 sm:px-6">
        <StatusMessage status={loadError ? "error" : seriesLoading ? "loading" : "ready"} error={loadError} />
      </div>
      <main>
        <Section id="false-record" eyebrow={t("record.eyebrow")} title={t("record.title")} lede={t("record.lede")}>
          <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <FalseRecordChart series={series} region={region} period={period} onSelectPeriod={setPeriod} />
          </div>
        </Section>

        <Section id="map" eyebrow={t("map.eyebrow")} title={t("map.title")} lede={t("map.lede")}>
          <MapSection
            regions={regions}
            region={region}
            onRegionSelect={setRegion}
            series={series}
            seriesLoading={seriesLoading}
            period={period}
            onPeriodChange={setPeriod}
            map={map}
          />
        </Section>

        <Section id="fire-clock" eyebrow={t("clock.eyebrow")} title={t("clock.title")} lede={t("clock.lede")}>
          <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <FireClock series={series} region={region} period={period} onSelectPeriod={setPeriod} />
          </div>
        </Section>

        <Section id="is-it-normal" eyebrow={t("normal.eyebrow")} title={t("normal.title")} lede={t("normal.lede")}>
          <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <NormalChart series={series} region={region} period={period} onSelectPeriod={setPeriod} />
          </div>
        </Section>

        <Section id="method" eyebrow={t("method.eyebrow")} title={t("method.title")} lede={t("method.lede")}>
          <HowWeCalculated methodology={methodology} region={region} />
        </Section>

        <Section id="data-check" eyebrow={t("nav.data")} title={t("check.title")} lede={t("check.lede")}>
          <Coverage2026 series={series} />
          <SeriesTable series={series} />
          <DataSummary series={series} regionCount={regionIds.length} mapCells={map.cells} methodology={methodology} />
        </Section>
      </main>
      <footer className="border-t border-line px-4 py-8 sm:px-6">
        <p className="mx-auto m-0 max-w-[1180px] text-sm text-muted">{t("unit.note")}</p>
      </footer>
    </>
  );
}
