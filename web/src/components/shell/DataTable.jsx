import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { downloadText, toCsv } from "../../lib/csv.js";
import Icon from "./icons.jsx";

const PAGE = 25;

export default function DataTable({ id, caption, columns, rows, filename, initialSort, loading, empty }) {
  const { t, formatNumber } = useI18n();
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "asc" });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue ?? col.raw ?? ((r) => r[col.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : 1) * dir;
    });
  }, [rows, columns, sort]);

  useEffect(() => setPage(0), [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const shown = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted" aria-live="polite">
          {loading ? t("status.loading") : t("data.rows", { n: formatNumber(sorted.length) })}
        </p>
        <button type="button" className="fc-btn" disabled={!sorted.length} onClick={() => downloadText(toCsv(columns, sorted), filename)}>
          <Icon name="download" size={16} />
          {t("data.csv", { n: formatNumber(sorted.length) })}
        </button>
      </div>
      <div className="fc-table-wrap">
        <table className="fc-table" aria-describedby={`${id}-caption`}>
          <caption id={`${id}-caption`} className="sr-only">
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const on = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={c.align === "left" ? "text-left" : "text-right"}>
                    <button type="button" onClick={() => toggle(c.key)} className="fc-th-btn">
                      {c.label}
                      <span aria-hidden="true" className={on ? "text-fg" : "text-transparent"}>
                        {on && sort.dir === "desc" ? "↓" : "↑"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.__key ?? i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "left" ? "text-left" : "text-right"}>
                    {c.render ? c.render(r) : r[c.key] ?? <span className="text-muted">{t("series.na")}</span>}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && !shown.length && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-muted">
                  {empty ?? t("data.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label={t("data.pages")} className="flex items-center justify-end gap-2 text-sm">
          <button type="button" className="fc-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t("data.prev")}
          </button>
          <span className="tabular-nums text-muted">{t("data.page", { n: page + 1, total: pages })}</span>
          <button type="button" className="fc-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            {t("data.next")}
          </button>
        </nav>
      )}
    </div>
  );
}
