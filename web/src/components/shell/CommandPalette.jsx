import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import Icon from "./icons.jsx";

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CommandPalette({ open, onClose, items, yearItem }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const restore = useRef(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement;
    setQuery("");
    setCursor(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => restore.current?.focus?.();
  }, [open]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    const out = q ? items.filter((it) => fold(`${it.label} ${it.hint ?? ""} ${it.keywords ?? ""}`).includes(q)) : items;
    const year = /^\d{4}$/.test(q) ? yearItem(Number(q)) : null;
    return year ? [year, ...out] : out;
  }, [items, query, yearItem]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const run = (item) => {
    if (!item || item.disabled) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") setCursor((c) => Math.min(results.length - 1, c + 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
    else if (e.key === "Enter") run(results[cursor]);
    else if (e.key === "Escape") onClose();
    else if (e.key === "Tab") e.preventDefault();
    else return;
    e.preventDefault();
  };

  let lastGroup = null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("palette.title")} className="fc-float w-full max-w-[34rem] overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={18} className="text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="fc-palette-list"
            aria-activedescendant={results[cursor] ? `fc-cmd-${cursor}` : undefined}
            placeholder={t("palette.placeholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted focus-visible:outline-none"
          />
          <kbd className="fc-kbd">Esc</kbd>
        </div>
        <ul id="fc-palette-list" ref={list} role="listbox" className="m-0 max-h-[min(60vh,26rem)] list-none overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("palette.empty")}</li>}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="m-0 px-3 pb-1 pt-2.5 text-[11px] font-semibold text-muted">{header}</p>}
                <div
                  id={`fc-cmd-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === cursor}
                  aria-disabled={item.disabled || undefined}
                  onPointerMove={() => setCursor(i)}
                  onClick={() => run(item)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === cursor ? "bg-surface-3" : ""} ${item.disabled ? "opacity-50" : ""}`}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs text-muted">{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="m-0 flex gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>
            <kbd className="fc-kbd">↑</kbd> <kbd className="fc-kbd">↓</kbd> {t("palette.move")}
          </span>
          <span>
            <kbd className="fc-kbd">↵</kbd> {t("palette.select")}
          </span>
        </p>
      </div>
    </div>
  );
}
