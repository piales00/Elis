import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { getLive, NoDataError } from "../../data/client.js";
import { CopyButton } from "./ApiCard.jsx";
import Icon from "./icons.jsx";
import { EVIDENCE_DOCS } from "../../content/evidence.js";

export const LIVE_BRANCH = "https://github.com/piales00/Elis/tree/live-data";
const SAME_RUN_MS = 6 * 3600 * 1000;

let cache = null;

export function useLive() {
  const [state, setState] = useState(cache ?? { status: "loading", data: null, error: null });
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    getLive()
      .then((data) => {
        cache = { status: "ready", data, error: null };
        if (!cancelled) setState(cache);
      })
      .catch((error) => !cancelled && setState({ status: error instanceof NoDataError ? "unavailable" : "error", data: null, error }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function shortHash(h) {
  return h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "";
}

function dayLabel(t, iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${t(`month.${m}`)} ${y}`;
}

function sameRun(row) {
  if (!row.prediction_generated_at_utc || !row.scored_at_utc) return false;
  return Date.parse(row.scored_at_utc) - Date.parse(row.prediction_generated_at_utc) < SAME_RUN_MS;
}

function statusLabel(t, status) {
  const key = `live.status.${status}`;
  const label = t(key);
  return label === key ? status.replaceAll("_", " ") : label;
}

function Verdict({ row }) {
  const { t } = useI18n();
  if (row.status !== "scored" || row.inside === null || row.inside === undefined) return <span className="text-muted">—</span>;
  return row.inside ? (
    <span className="inline-flex items-center gap-1 font-semibold text-c-viirs">
      <Icon name="check" size={13} />
      {t("live.inside")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-danger">
      <Icon name="close" size={13} />
      {t("live.outside")}
    </span>
  );
}

export function LiveSummary({ onOpen }) {
  const { t, formatNumber } = useI18n();
  const live = useLive();
  if (live.status !== "ready") return null;
  const p = live.data.latest_prediction;
  const peru = p?.regions?.find((r) => r.region === "peru");
  const sum = live.data.scoreboard?.summary?.find((s) => s.region === "peru");
  const n0 = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  return (
    <section aria-labelledby="live-mini" className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="live-mini" className="m-0 inline-flex items-center gap-2 text-sm font-semibold">
          <span className="fc-live-dot" aria-hidden="true" />
          {t("live.title")}
        </h3>
        <button type="button" className="fc-link text-xs" onClick={onOpen}>
          {t("live.open")}
        </button>
      </div>
      {peru ? (
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          {t("live.mini", { date: dayLabel(t, p.date), value: n0(peru.aqua_predicted), low: n0(peru.aqua_low), high: n0(peru.aqua_high) })}
          {sum ? ` ${t("live.miniScore", { n: sum.n_days, cov: formatNumber(sum.coverage, { style: "percent", maximumFractionDigits: 0 }) })}` : ""}
        </p>
      ) : (
        <p className="m-0 text-[13px] text-muted">{t("live.noPrediction")}</p>
      )}
    </section>
  );
}

export default function LiveCheck({ onClose, titleId = "live-title" }) {
  const { t, formatNumber } = useI18n();
  const live = useLive();
  const n0 = (v) => (v === null || v === undefined ? "—" : formatNumber(v, { maximumFractionDigits: v < 10 ? 1 : 0 }));
  const pctF = (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });

  const head = (
    <div className="flex items-start justify-between gap-3">
      <div className="grid gap-0.5">
        <h2 id={titleId} className="m-0 inline-flex items-center gap-2 font-head text-base font-extrabold">
          <span className="fc-live-dot" aria-hidden="true" />
          {t("live.title")}
        </h2>
        {live.data?.scoreboard?.updated_at_utc && <p className="m-0 text-[11.5px] text-muted">{t("live.updated", { when: `${dayLabel(t, live.data.scoreboard.updated_at_utc)} ${live.data.scoreboard.updated_at_utc.slice(11, 16)} UTC` })}</p>}
      </div>
      {onClose && (
        <button type="button" className="fc-icon-btn -mr-1 -mt-1" aria-label={t("live.close")} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );

  if (live.status === "loading") return <div className="grid gap-3">{head}<div className="fc-skel h-24" /></div>;
  if (live.status !== "ready")
    return (
      <div className="grid gap-3">
        {head}
        <p className="m-0 text-sm text-muted">{t(live.status === "unavailable" ? "live.unavailable" : "live.error")}</p>
      </div>
    );

  const p = live.data.latest_prediction;
  const board = live.data.scoreboard ?? { rows: [], summary: [] };
  const rows = [...(board.rows ?? [])].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const peru = board.summary?.find((s) => s.region === "peru");
  const anySameRun = rows.some(sameRun);
  const sha = p?.sha256 ?? rows[0]?.prediction_sha256;
  const latestScored = p && rows.some((r) => r.date === p.date && r.status === "scored");

  return (
    <div className="grid gap-4">
      {head}
      <p className="m-0 text-[13px] leading-relaxed text-muted">{t("live.lede")}</p>

      {p && (
        <section aria-labelledby="live-latest" className="grid gap-2">
          <h3 id="live-latest" className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-semibold">
            <span>{t("live.latest", { date: dayLabel(t, p.date) })}</span>
            <span className={`rounded-md border px-1.5 py-px text-[10.5px] font-bold ${latestScored ? "border-line text-muted" : "border-dashed border-forecast text-forecast"}`}>{t(latestScored ? "live.status.scored" : "live.pending")}</span>
          </h3>
          <table className="fc-mini-table">
            <thead>
              <tr>
                <th scope="col" className="text-left">{t("series.region")}</th>
                <th scope="col">{t("live.predicted")}</th>
                <th scope="col">{t("live.range")}</th>
              </tr>
            </thead>
            <tbody>
              {p.regions.map((r) => (
                <tr key={r.region}>
                  <th scope="row" className="text-left font-medium">{t(`region.${r.region}`)}</th>
                  <td className="font-semibold">{n0(r.aqua_predicted)}</td>
                  <td className="text-muted">
                    {n0(r.aqua_low)}–{n0(r.aqua_high)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-[11.5px] text-muted">{t("live.unit", { source: p.viirs_source === "noaa20" ? "NOAA-20" : "S-NPP" })}</p>
        </section>
      )}

      <section aria-labelledby="live-board" className="grid gap-2">
        <h3 id="live-board" className="m-0 text-[13px] font-semibold">
          {t("live.board")}
        </h3>
        {peru && (
          <div className="grid grid-cols-3 gap-2">
            <div className="fc-mini-stat">
              <span>{peru.n_days}</span>
              {t("live.days")}
            </div>
            <div className="fc-mini-stat">
              <span>{pctF(peru.coverage)}</span>
              {t("live.coverage")}
            </div>
            <div className="fc-mini-stat">
              <span>{n0(peru.mean_error)}</span>
              {t("live.meanError")}
            </div>
          </div>
        )}
        {rows.length ? (
          <div className="max-h-56 overflow-auto rounded-lg border border-line">
            <table className="fc-mini-table !border-0">
              <thead>
                <tr>
                  <th scope="col" className="text-left">{t("live.date")}</th>
                  <th scope="col" className="text-left">{t("series.region")}</th>
                  <th scope="col">{t("live.predicted")}</th>
                  <th scope="col">{t("live.observed")}</th>
                  <th scope="col" className="text-left">{t("live.result")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.date}-${r.region}`}>
                    <td className="text-left tabular-nums">{r.date.slice(5)}</td>
                    <th scope="row" className="text-left font-medium">{t(`region.${r.region}`)}</th>
                    <td>
                      {n0(r.predicted)} <span className="text-muted">({n0(r.low)}–{n0(r.high)})</span>
                    </td>
                    <td className="font-semibold">{n0(r.observed)}</td>
                    <td className="text-left">
                      {r.status === "scored" ? <Verdict row={r} /> : <span className="text-muted">{statusLabel(t, r.status)}</span>}
                      {sameRun(r) && <span className="ml-1.5 text-[10.5px] text-amber">{t("live.sameRunTag")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-sm text-muted">{t("live.noRows")}</p>
        )}
        {anySameRun && <p className="m-0 text-[11.5px] leading-relaxed text-amber">{t("live.sameRun")}</p>}
      </section>

      {sha && (
        <section aria-labelledby="live-verify" className="grid gap-2 rounded-xl border border-line p-3">
          <h3 id="live-verify" className="m-0 text-[13px] font-semibold">
            {t("live.verify")}
          </h3>
          <div className="flex items-center gap-2">
            <code className="min-w-0 truncate rounded-md bg-surface-2 px-2 py-1 text-[12px]" title={sha}>
              SHA-256 {shortHash(sha)}
            </code>
            <CopyButton text={sha} label="SHA-256" compact />
          </div>
          <p className="m-0 text-[12px] leading-relaxed text-muted">{t("live.verifyText")}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a className="fc-link inline-flex items-center gap-1 text-[12.5px]" href={LIVE_BRANCH} target="_blank" rel="noopener">
              {t("live.branch")}
              <Icon name="external" size={13} />
            </a>
            <a className="fc-link inline-flex items-center gap-1 text-[12.5px]" href={EVIDENCE_DOCS.continuity} target="_blank" rel="noopener">
              {t("live.source")}
              <Icon name="external" size={13} />
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

export function LiveBadge({ state, onState }) {
  const { t } = useI18n();
  const timer = useRef(0);
  const open = Boolean(state);
  const clear = () => clearTimeout(timer.current);
  useEffect(() => clear, []);
  const enter = (e) => {
    if (e.pointerType !== "mouse") return;
    clear();
    if (!state) timer.current = setTimeout(() => onState("hover"), 140);
  };
  const leave = (e) => {
    if (e.pointerType !== "mouse") return;
    clear();
    if (state === "hover") timer.current = setTimeout(() => onState(null), 260);
  };
  return (
    <div
      className="relative"
      onPointerEnter={enter}
      onPointerLeave={leave}
      onBlur={(e) => {
        if (state !== "pinned" && !e.currentTarget.contains(e.relatedTarget)) onState(null);
      }}
    >
      <button
        type="button"
        data-tour="live"
        aria-expanded={open}
        aria-controls="fc-live"
        onFocus={(e) => {
          if (!state && e.target.matches(":focus-visible")) onState("hover");
        }}
        onClick={() => {
          clear();
          onState(state === "pinned" ? null : "pinned");
        }}
        className="fc-float fc-press flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
        aria-label={t("live.title")}
      >
        <span className="fc-live-dot" aria-hidden="true" />
        <span className="hidden sm:inline">{t("live.badge")}</span>
      </button>
      {open && (
        <section id="fc-live" role="dialog" aria-labelledby="live-title" className="fc-float fc-pop fc-live-pop">
          <span className="fc-live-arrow" aria-hidden="true" />
          <div className="fc-live-scroll">
            <LiveCheck onClose={() => onState(null)} />
          </div>
        </section>
      )}
    </div>
  );
}
