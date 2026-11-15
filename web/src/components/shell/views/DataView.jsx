import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { getMap, getSeries, NoDataError } from "../../../data/client.js";
import { FIRST_YEAR, LAST_YEAR } from "../../../config.js";
import { periodStatus } from "../../../lib/status.js";
import { chanceHigh, CLASSES } from "../../../lib/forecast.js";
import { ClassBadge } from "../../SlotDetails.jsx";
import DataTable from "../DataTable.jsx";
import StatusChip from "../StatusChip.jsx";
import ApiCard from "../ApiCard.jsx";
import Attributions from "../Attributions.jsx";

const TABS = ["series", "cells", "outlook"];
const STATUSES = ["observed", "low", "provisional", "partial", "forecast"];
const SOURCES = ["modis_only", "both", "viirs_only", "forecast"];
const MACROS = ["amazonia", "sierra", "costa"];
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

function useAllSeries(regionIds) {
  const [state, setState] = useState({ status: "loading", rows: [], error: null });
  const key = regionIds.join(",");
  useEffect(() => {
    if (!regionIds.length) return;
    let cancelled = false;
    setState({ status: "loading", rows: [], error: null });
    Promise.all(regionIds.map((region) => getSeries({ region })))
      .then((lists) => !cancelled && setState({ status: "ready", rows: lists.flat(), error: null }))
      .catch((error) => !cancelled && setState({ status: "error", rows: [], error }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

function useCells({ year, month, region }) {
  const [state, setState] = useState({ status: "loading", rows: [], error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", rows: [], error: null });
    const regions = region === "all" ? MACROS : [region];
    Promise.all(regions.map((r) => getMap({ year, month, region: r }).then((cells) => cells.map((c) => ({ ...c, region: r })))))
      .then((lists) => !cancelled && setState({ status: "ready", rows: lists.flat(), error: null }))
      .catch((error) => !cancelled && setState({ status: error instanceof NoDataError ? "nodata" : "error", rows: [], error }));
    return () => {
      cancelled = true;
    };
  }, [year, month, region]);
  return state;
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <Field label={label}>
      <select className="fc-input h-9 px-2 text-sm font-normal" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function DataView({ regionIds, period, periods, forecast, apiNote, initialTab = "series" }) {
  const { t, formatNumber } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const num = (v, d = 1) => (v === null || v === undefined ? <span className="text-muted">{t("series.na")}</span> : formatNumber(v, { maximumFractionDigits: d }));
  const pct = (v) => (v === null || v === undefined ? <span className="text-muted">{t("series.na")}</span> : formatNumber(v, { style: "percent", maximumFractionDigits: 0 }));
  const regionName = (id) => t(`region.${id}`);

  const all = useAllSeries(regionIds);
  const [sRegion, setSRegion] = useState("all");
  const [from, setFrom] = useState(FIRST_YEAR);
  const [to, setTo] = useState(LAST_YEAR);
  const [sMonth, setSMonth] = useState("all");
  const [sClass, setSClass] = useState("all");
  const [sSource, setSSource] = useState("all");
  const [statuses, setStatuses] = useState(new Set(STATUSES));

  const seriesRows = useMemo(() => {
    const byRegion = {};
    for (const r of all.rows) (byRegion[r.region] ??= []).push(r);
    return all.rows.map((r) => {
      const st = periodStatus(byRegion[r.region], periods, r.year, r.month);
      return { ...r, __key: `${r.region}-${r.year}-${r.month}`, status: st.kind, __status: st };
    });
  }, [all.rows, periods]);
  const seriesFiltered = useMemo(
    () =>
      seriesRows.filter(
        (r) =>
          (sRegion === "all" || r.region === sRegion) &&
          r.year >= Math.min(from, to) &&
          r.year <= Math.max(from, to) &&
          (sMonth === "all" || r.month === Number(sMonth)) &&
          (sClass === "all" || r.anomaly_class === sClass) &&
          (sSource === "all" || r.source === sSource) &&
          statuses.has(r.status),
      ),
    [seriesRows, sRegion, from, to, sMonth, sClass, sSource, statuses],
  );

  const [cYear, setCYear] = useState(period.year);
  const [cMonth, setCMonth] = useState(period.month);
  const [cRegion, setCRegion] = useState("all");
  const [minEst, setMinEst] = useState(0);
  const cells = useCells({ year: cYear, month: cMonth, region: cRegion });
  const cellRows = useMemo(() => cells.rows.filter((c) => (c.estimated ?? 0) >= minEst).map((c) => ({ ...c, __key: `${c.lat},${c.lon}` })), [cells.rows, minEst]);

  const [oLevel, setOLevel] = useState("all");
  const [oMethod, setOMethod] = useState("all");
  const outlookRows = useMemo(
    () =>
      (forecast.data?.regions ?? [])
        .filter((r) => (oLevel === "all" || r.level === oLevel) && (oMethod === "all" || (oMethod === "none" ? !r.published : r.method === oMethod)))
        .map((r) => ({ ...r, __key: r.region, p_hv: chanceHigh(r) })),
    [forecast.data, oLevel, oMethod],
  );

  const monthOptions = [["all", t("data.any")], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), t(`month.${i + 1}`)])];

  const seriesColumns = [
    { key: "region", label: t("series.region"), align: "left", render: (r) => regionName(r.region) },
    { key: "year", label: t("year.label") },
    { key: "month", label: t("time.month") },
    { key: "status", label: t("series.status"), align: "left", render: (r) => <StatusChip status={r.__status} /> },
    { key: "estimated", label: t("series.estimated"), render: (r) => <strong>{num(r.estimated)}</strong> },
    { key: "est_low", label: t("data.col.low"), render: (r) => num(r.est_low) },
    { key: "est_high", label: t("data.col.high"), render: (r) => num(r.est_high) },
    { key: "raw_modis", label: t("series.raw_modis"), render: (r) => num(r.raw_modis) },
    { key: "raw_viirs", label: t("series.raw_viirs"), render: (r) => num(r.raw_viirs) },
    { key: "raw_detections", label: t("series.raw_detections"), render: (r) => num(r.raw_detections) },
    { key: "modis_equiv", label: t("series.modis_equiv"), render: (r) => num(r.modis_equiv) },
    { key: "hist_median", label: t("series.hist_median"), render: (r) => num(r.hist_median) },
    { key: "anomaly_class", label: t("series.anomaly"), align: "left", render: (r) => (r.anomaly_class ? <ClassBadge value={r.anomaly_class} /> : num(null)) },
    { key: "source", label: t("series.source"), align: "left", render: (r) => t(`source.${r.source}`) },
  ];
  const cellColumns = [
    { key: "region", label: t("series.region"), align: "left", render: (r) => regionName(r.region) },
    { key: "lat", label: t("map.table.lat"), render: (r) => r.lat.toFixed(2) },
    { key: "lon", label: t("map.table.lon"), render: (r) => r.lon.toFixed(2) },
    { key: "estimated", label: t("metric.estimated"), render: (r) => <strong>{num(r.estimated, 2)}</strong> },
    { key: "raw_modis", label: t("metric.raw_modis"), render: (r) => num(r.raw_modis) },
    { key: "raw_terra", label: t("metric.raw_terra"), render: (r) => num(r.raw_terra) },
    { key: "raw_aqua", label: t("metric.raw_aqua"), render: (r) => num(r.raw_aqua) },
    { key: "raw_viirs", label: t("metric.raw_viirs"), render: (r) => num(r.raw_viirs) },
    { key: "raw_viirs_noaa20", label: t("metric.raw_viirs_noaa20"), render: (r) => num(r.raw_viirs_noaa20) },
    { key: "raw_viirs_noaa21", label: t("metric.raw_viirs_noaa21"), render: (r) => num(r.raw_viirs_noaa21) },
  ];
  const outlookColumns = [
    { key: "name", label: t("data.col.unit"), align: "left", render: (r) => (r.level === "department" ? r.name : regionName(r.region)) },
    { key: "level", label: t("data.col.level"), align: "left", render: (r) => t(`outlook.level.${r.level}`, { macro: r.macroregion ? regionName(r.macroregion) : "" }) },
    { key: "method", label: t("data.col.method"), align: "left", render: (r) => (r.method ? t(`outlook.method.${r.method}.short`) : <span className="text-muted">{t("outlook.noForecast")}</span>) },
    { key: "median", label: t("data.col.median"), render: (r) => <strong>{num(r.median, 0)}</strong> },
    { key: "low", label: t("data.col.low"), render: (r) => num(r.low, 0) },
    { key: "high", label: t("data.col.high"), render: (r) => num(r.high, 0) },
    ...CLASSES.map((c) => ({ key: `p_${c}`, label: `P(${t(`anomaly.${c}`)})`, raw: (r) => r.probabilities?.[c] ?? null, render: (r) => pct(r.probabilities?.[c]) })),
    { key: "p_hv", label: t("data.col.phv"), render: (r) => <strong>{pct(r.p_hv)}</strong> },
    { key: "most_likely_class", label: t("data.col.likely"), align: "left", render: (r) => (r.most_likely_class ? t(`anomaly.${r.most_likely_class}`) : num(null)) },
    { key: "hist_median", label: t("data.col.hist"), render: (r) => num(r.hist_median, 0) },
    { key: "rpss", label: t("data.col.rpss"), raw: (r) => r.skill?.rpss ?? null, render: (r) => num(r.skill?.rpss, 2) },
  ];

  const toggleStatus = (s) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="@container grid gap-10">
      <section aria-labelledby="data-tables" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="data-tables" className="m-0 font-head text-2xl font-extrabold tracking-[-0.02em]">
              {t("data.title")}
            </h3>
            <p className="m-0 mt-2 max-w-[68ch] text-[15px] leading-relaxed text-muted">{t("data.lede")}</p>
          </div>
          <div role="tablist" aria-label={t("data.title")} className="fc-seg">
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" id={`data-tab-${k}`} aria-controls={`data-panel-${k}`} aria-selected={tab === k} onClick={() => setTab(k)} className="fc-seg-item">
                {t(`data.tab.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" id={`data-panel-${tab}`} aria-labelledby={`data-tab-${tab}`} className="grid gap-4">
          {tab === "series" && (
            <>
              <div className="fc-filters fc-toolbar">
                <Select label={t("series.region")} value={sRegion} onChange={setSRegion} options={[["all", t("data.allRegions")], ...regionIds.map((id) => [id, regionName(id)])]} />
                <Select label={t("data.from")} value={from} onChange={(v) => setFrom(Number(v))} options={YEARS.map((y) => [y, y])} />
                <Select label={t("data.to")} value={to} onChange={(v) => setTo(Number(v))} options={YEARS.map((y) => [y, y])} />
                <Select label={t("time.month")} value={sMonth} onChange={setSMonth} options={monthOptions} />
                <Select label={t("series.anomaly")} value={sClass} onChange={setSClass} options={[["all", t("data.any")], ...CLASSES.map((c) => [c, t(`anomaly.${c}`)])]} />
                <Select label={t("series.source")} value={sSource} onChange={setSSource} options={[["all", t("data.any")], ...SOURCES.map((s) => [s, s === "forecast" ? t("status.forecast") : t(`source.${s}`)])]} />
                <fieldset className="m-0 grid gap-1 border-0 p-0">
                  <legend className="mb-1 p-0 text-xs font-semibold text-muted">{t("series.status")}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                      <label key={s} className={`chip !py-1 !text-xs ${statuses.has(s) ? "chip-on" : ""}`}>
                        <input type="checkbox" className="sr-only" checked={statuses.has(s)} onChange={() => toggleStatus(s)} />
                        {t(`status.kind.${s}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              {all.status === "error" ? (
                <p role="alert" className="m-0 text-danger">
                  {t("status.error", { message: all.error?.message ?? "" })}
                </p>
              ) : (
                <DataTable id="series" caption={t("data.tab.series")} columns={seriesColumns} rows={seriesFiltered} loading={all.status === "loading"} filename={`firechronos_series_${sRegion}_${Math.min(from, to)}-${Math.max(from, to)}.csv`} initialSort={{ key: "year", dir: "desc" }} />
              )}
            </>
          )}

          {tab === "cells" && (
            <>
              <div className="fc-filters fc-toolbar">
                <Select label={t("year.label")} value={cYear} onChange={(v) => setCYear(Number(v))} options={YEARS.map((y) => [y, y])} />
                <Select label={t("time.month")} value={cMonth} onChange={(v) => setCMonth(Number(v))} options={monthOptions.slice(1)} />
                <Select label={t("series.region")} value={cRegion} onChange={setCRegion} options={[["all", t("data.allRegions")], ...MACROS.map((id) => [id, regionName(id)])]} />
                <Field label={t("data.minEst")}>
                  <input type="number" min="0" step="0.5" value={minEst} onChange={(e) => setMinEst(Math.max(0, Number(e.target.value) || 0))} className="fc-input h-9 w-28 px-2 text-sm font-normal" />
                </Field>
              </div>
              <p className="m-0 text-xs text-muted">{t("data.cellsNote")}</p>
              {cells.status === "error" ? (
                <p role="alert" className="m-0 text-danger">
                  {t("status.error", { message: cells.error?.message ?? "" })}
                </p>
              ) : (
                <DataTable
                  id="cells"
                  caption={t("data.tab.cells")}
                  columns={cellColumns}
                  rows={cellRows}
                  loading={cells.status === "loading"}
                  empty={cells.status === "nodata" ? t("map.status.nodata") : undefined}
                  filename={`firechronos_cells_${cYear}-${String(cMonth).padStart(2, "0")}_${cRegion}.csv`}
                  initialSort={{ key: "estimated", dir: "desc" }}
                />
              )}
            </>
          )}

          {tab === "outlook" && (
            <>
              <div className="fc-filters fc-toolbar">
                <Select label={t("data.col.level")} value={oLevel} onChange={setOLevel} options={[["all", t("data.any")], ["country", t("outlook.level.country")], ["macro", t("outlook.level.macro")], ["department", t("data.departments")]]} />
                <Select label={t("data.col.method")} value={oMethod} onChange={setOMethod} options={[["all", t("data.any")], ["model", t("outlook.method.model.short")], ["climatology", t("outlook.method.climatology.short")], ["none", t("outlook.noForecast")]]} />
              </div>
              <p className="m-0 text-xs text-muted">{t("data.outlookNote", { season: forecast.data ? `${forecast.data.target_year}` : "" })}</p>
              {forecast.status === "unavailable" ? (
                <p className="fc-empty m-0 text-sm">{t("outlook.mock.text")}</p>
              ) : (
                <DataTable id="outlook" caption={t("data.tab.outlook")} columns={outlookColumns} rows={outlookRows} loading={forecast.status === "loading"} filename={`firechronos_outlook_${forecast.data?.target_year ?? ""}.csv`} initialSort={{ key: "p_hv", dir: "desc" }} />
              )}
            </>
          )}
        </div>
      </section>

      <ApiCard regionIds={regionIds} note={apiNote} />
      <div className="border-t border-line pt-8">
        <Attributions id="data-sources" />
      </div>
    </div>
  );
}
