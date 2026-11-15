import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { getContinuity, NoDataError } from "../../../data/client.js";
import LineChart, { Legend } from "../LineChart.jsx";

const DEFAULT_SHUTDOWN = "2023-01";

function useContinuity(shutdown) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: s.data ? "refreshing" : "loading" }));
    const id = setTimeout(() => {
      getContinuity({ shutdown })
        .then((data) => !cancelled && setState({ status: "ready", data, error: null }))
        .catch((error) => !cancelled && setState({ status: error instanceof NoDataError ? "unavailable" : "error", data: null, error }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [shutdown]);
  return state;
}

function monthLabel(t, m) {
  const [y, mo] = m.split("-").map(Number);
  return `${t(`month.${mo}`)} ${y}`;
}

function Stat({ value, label, tone }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <span className={`font-head text-xl font-extrabold leading-none tabular-nums ${tone ?? ""}`}>{value}</span>
      <span className="text-[11.5px] leading-snug text-muted">{label}</span>
    </div>
  );
}

export default function ContinuityView({ region }) {
  const { t, formatNumber } = useI18n();
  const [on, setOn] = useState(true);
  const [shutdown, setShutdown] = useState(DEFAULT_SHUTDOWN);
  const state = useContinuity(on ? shutdown : DEFAULT_SHUTDOWN);
  const data = state.data;
  const n0 = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  const pct = (v, d = 0) => `${formatNumber(v, { maximumFractionDigits: d })}%`;
  const compact = (v) => formatNumber(v, { notation: "compact", maximumFractionDigits: 1 });
  const rid = data?.regions?.includes(region) ? region : "peru";

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.region === rid), [data, rid]);
  const pre = data?.metrics?.summary?.find((s) => s.region === rid && s.period === "pre_drift");
  const drift = (data?.metrics?.emulator_by_year ?? []).filter((r) => r.region === rid && r.period === "drift");
  const lastDrift = drift[drift.length - 1];
  const amazon = (data?.metrics?.emulator_by_year ?? []).filter((r) => r.region === "amazonia" && r.period === "drift").pop();
  const filled = (data?.metrics?.harmonized_check?.months_with_modis_filled_days ?? []).filter((m) => m.region === rid);
  const cut = on ? data?.scenario?.shutdown ?? shutdown : null;
  const endYear = data?.scenario?.modis_science_end_year ?? 2027;
  const [minMonth, maxMonth] = data?.period ?? ["2012-01", "2026-11"];

  const modisSeries = [
    { id: "aqua", label: t("cont.aqua"), tip: t("cont.tip.aqua"), color: "var(--c-modis)", width: 2, value: (d) => (!cut || d.month < cut ? d.aqua_observed : null) },
    ...(cut ? [{ id: "aquaHidden", label: t("cont.aquaHidden"), tip: t("cont.tip.hidden"), color: "var(--c-modis)", width: 1.2, dash: "2 3", muted: true, value: (d) => (d.month >= cut ? d.aqua_observed : null) }] : []),
    {
      id: "emu",
      label: t("cont.emulated"),
      tip: t("cont.tip.emulated"),
      color: "var(--c-viirs)",
      width: 2,
      value: (d) => (!cut || d.month >= cut ? d.aqua_emulated : null),
      low: (d) => (!cut || d.month >= cut ? d.aqua_emulated_low : null),
      high: (d) => (!cut || d.month >= cut ? d.aqua_emulated_high : null),
    },
  ];
  const harmSeries = [
    { id: "harm", label: t("cont.harmonized"), tip: t("cont.tip.harmonized"), color: "var(--c-est)", width: 2, value: (d) => d.harmonized, low: (d) => d.harmonized_low, high: (d) => d.harmonized_high },
  ];

  const tip = (d, list) => (
    <>
      <p className="m-0 mb-1 font-semibold">{monthLabel(t, d.month)}</p>
      {list.map((s) => {
        const v = s.value(d);
        if (v === null || v === undefined) return null;
        return (
          <p key={s.id} className="m-0 flex justify-between gap-2 tabular-nums">
            <span className="text-muted">{s.tip ?? s.label}</span>
            <span className="font-semibold">
              {n0(v)}
              {s.low && s.low(d) !== null ? <span className="font-normal text-muted"> ({n0(s.low(d))}–{n0(s.high(d))})</span> : null}
            </span>
          </p>
        );
      })}
    </>
  );

  if (state.status === "unavailable") return <p className="fc-empty m-0 text-sm">{t("cont.unavailable")}</p>;
  if (state.status === "error") return <p role="alert" className="m-0 text-sm text-danger">{t("status.error", { message: state.error?.message ?? "" })}</p>;

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="m-0 font-head text-xl font-extrabold leading-snug tracking-[-0.01em] text-balance">{t("cont.headline", { year: endYear })}</p>
        <p className="m-0 text-sm leading-relaxed text-muted">{t("cont.lede", { region: t(`region.${rid}`) })}</p>
      </header>

      <div className="fc-toolbar flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" role="switch" aria-checked={on} onClick={() => setOn((v) => !v)} className="fc-switch">
          <span className="fc-switch-track" aria-hidden="true">
            <span className="fc-switch-thumb" />
          </span>
          <span className="text-sm font-semibold">{t("cont.toggle")}</span>
        </button>
        <label className={`flex items-center gap-2 text-xs font-semibold text-muted ${on ? "" : "opacity-50"}`}>
          {t("cont.from")}
          <input
            type="month"
            className="fc-input h-8 px-2 text-sm font-normal text-fg"
            value={shutdown}
            min={minMonth}
            max={maxMonth}
            disabled={!on}
            onChange={(e) => e.target.value && e.target.value > minMonth && e.target.value <= maxMonth && setShutdown(e.target.value)}
          />
        </label>
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {state.status === "loading" || state.status === "refreshing" ? t("status.loading") : ""}
        </span>
      </div>

      <section aria-labelledby="cont-modis" className="grid gap-2">
        <h3 id="cont-modis" className="m-0 text-[15px] font-semibold">
          {t("cont.chart1")}
        </h3>
        <p className="m-0 text-xs text-muted">{t("cont.chart1.sub")}</p>
        <Legend series={modisSeries} />
        {rows.length ? (
          <LineChart
            data={rows}
            series={modisSeries}
            marker={cut ? { month: cut, label: t("cont.switch", { month: monthLabel(t, cut) }) } : null}
            height={210}
            format={(v) => compact(v)}
            ariaLabel={t("cont.chart1.aria", { region: t(`region.${rid}`) })}
            describe={(d) => tip(d, modisSeries)}
          />
        ) : (
          <div className="fc-skel h-[210px]" />
        )}
      </section>

      {pre && (
        <section aria-labelledby="cont-err" className="grid gap-2">
          <h3 id="cont-err" className="m-0 text-[15px] font-semibold">
            {t("cont.error.title", { a: pre.years[0], b: pre.years[1] })}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={`${pre.bias_pct > 0 ? "+" : ""}${pct(pre.bias_pct, 1)}`} label={t("cont.error.bias")} />
            <Stat value={pct(pre.annual_mape_pct, 1)} label={t("cont.error.annual")} />
            <Stat value={pct(pre.range_coverage * 100)} label={t("cont.error.coverage")} />
          </div>
        </section>
      )}

      {drift.length > 0 && (
        <section aria-labelledby="cont-drift" className="grid gap-3">
          <h3 id="cont-drift" className="m-0 text-[15px] font-semibold">
            {t("cont.drift.title")}
          </h3>
          {lastDrift && (
            <p className="m-0 text-sm leading-relaxed">
              {t("cont.drift.text", { pct: pct(Math.abs(lastDrift.aqua_vs_emulated_pct)), year: lastDrift.year, region: t(`region.${rid}`) })}
              {amazon && rid !== "amazonia" ? ` ${t("cont.drift.amazon", { pct: pct(Math.abs(amazon.aqua_vs_emulated_pct)) })}` : ""}
            </p>
          )}
          <ul className="m-0 grid list-none gap-1.5 p-0" aria-label={t("cont.drift.title")}>
            {drift.map((r) => {
              const v = Math.min(60, Math.abs(r.aqua_vs_emulated_pct));
              return (
                <li key={r.year} className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
                  <span className="font-semibold tabular-nums">{r.year}</span>
                  <span className="block h-2 rounded-full bg-surface-3" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${(v / 60) * 100}%`, background: "var(--c-modis)" }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {r.aqua_vs_emulated_pct < 0 ? "−" : "+"}
                    {pct(Math.abs(r.aqua_vs_emulated_pct))}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-xs text-muted">{t("cont.drift.note")}</p>
        </section>
      )}

      <section aria-labelledby="cont-harm" className="grid gap-2">
        <h3 id="cont-harm" className="m-0 text-[15px] font-semibold">
          {t("cont.chart2")}
        </h3>
        <p className="m-0 text-xs text-muted">{t("cont.chart2.sub")}</p>
        {rows.length ? (
          <LineChart
            data={rows}
            series={harmSeries}
            marker={cut ? { month: cut, label: t("cont.switchShort") } : null}
            height={150}
            format={(v) => compact(v)}
            ariaLabel={t("cont.chart2.aria", { region: t(`region.${rid}`) })}
            describe={(d) => tip(d, harmSeries)}
          />
        ) : (
          <div className="fc-skel h-[150px]" />
        )}
        <p className="m-0 text-xs leading-relaxed text-muted">{t("cont.filled", { n: filled.length })}</p>
      </section>

      <p className="m-0 rounded-xl border border-line px-4 py-3 text-sm font-semibold">{t("cont.message", { year: endYear })}</p>
    </div>
  );
}
