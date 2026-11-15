import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { API_BASE } from "../../config.js";
import { isMock, staticUrl } from "../../data/client.js";
import { useDataMode } from "../../hooks/useDataMode.js";
import Icon from "./icons.jsx";

const REPO = "https://github.com/piales00/Elis";
const LANGS = [
  ["curl", "curl"],
  ["py", "Python"],
  ["js", "JavaScript"],
];
const LANG_KEY = "fc.api.lang";

function apiRoot() {
  if (/^https?:\/\//.test(API_BASE)) return API_BASE.replace(/\/$/, "");
  if (typeof window === "undefined") return API_BASE;
  return `${window.location.origin}${API_BASE.startsWith("/") ? "" : "/"}${API_BASE}`.replace(/\/$/, "");
}

function readLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (LANGS.some(([k]) => k === v)) return v;
  } catch {}
  return "curl";
}

function useCopy() {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    } catch {}
  };
  return [done, copy];
}

export function CopyButton({ text, label, compact = false, className = "" }) {
  const { t } = useI18n();
  const [done, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className={`fc-copy ${compact ? "fc-copy-compact" : ""} ${className}`}
      data-done={done || undefined}
      aria-label={label ? `${t("api.copy")}: ${label}` : t("api.copy")}
      title={t("api.copy")}
    >
      <Icon name={done ? "check" : "copy"} size={14} />
      {!compact && <span>{t(done ? "api.copied" : "api.copy")}</span>}
      <span className="sr-only" aria-live="polite">
        {done ? t("api.copied") : ""}
      </span>
    </button>
  );
}

const TOKEN = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|#[^\n]*|\b(?:import|from|as|with|for|in|if|const|await|break|print|curl)\b|(?<=\s)-{1,2}[A-Za-z]+)/g;

function highlight(code) {
  const out = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const s = m[0];
    const kind = s[0] === '"' || s[0] === "'" ? "str" : s[0] === "#" ? "com" : s[0] === "-" ? "flag" : "key";
    out.push(
      <span key={m.index} className={`fc-tok-${kind}`}>
        {s}
      </span>,
    );
    last = m.index + s.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({ code, label, bar, children }) {
  return (
    <div className="fc-code">
      <div className="fc-code-bar">
        {bar ?? <span className="text-xs font-semibold text-muted">{label}</span>}
        <CopyButton text={code} label={label} />
      </div>
      {children ?? (
        <pre tabIndex={0} aria-label={label}>
          <code>{highlight(code)}</code>
        </pre>
      )}
    </div>
  );
}

function q(path, params) {
  const s = new URLSearchParams(params).toString();
  return s ? `${path}?${s}` : path;
}

function buildRoutes(root) {
  const get = (id, path, params, returns, py, js) => {
    const url = `${root}${q(path, params)}`;
    return {
      id,
      method: "GET",
      path,
      params,
      returns,
      code: {
        curl: `curl "${url}"${id === "regions" ? " -o regions.geojson" : ""}`,
        py: py(url),
        js: js(url),
      },
    };
  };
  const chatBody = { messages: [{ role: "user", content: "Is 2026 a normal fire year?" }], region: "peru" };
  return [
    get(
      "series",
      "/series",
      { region: "amazonia", from: 2012, to: 2026 },
      "rows",
      (u) => `import pandas as pd\n\nseries = pd.read_json("${u}")\nprint(series[["year", "month", "estimated", "est_low", "est_high"]].tail())`,
      (u) => `const res = await fetch("${u}");\nconst series = await res.json();\nconsole.log(series.at(-1));`,
    ),
    get(
      "map",
      "/map",
      { year: 2024, month: 9, region: "amazonia" },
      "rows",
      (u) => `import pandas as pd\n\ncells = pd.read_json("${u}")\nprint(cells.nlargest(5, "estimated"))`,
      (u) => `const cells = await fetch("${u}").then((r) => r.json());\nconsole.log(cells.length, "active cells");`,
    ),
    get(
      "forecast",
      "/forecast",
      { region: "sierra" },
      "object",
      (u) => `import requests\n\noutlook = requests.get("${u}").json()\nprint(outlook["target_year"], outlook["regions"][0])`,
      (u) => `const outlook = await fetch("${u}").then((r) => r.json());\nconsole.log(outlook.target_year, outlook.regions);`,
    ),
    get(
      "methodology",
      "/methodology",
      { region: "peru" },
      "object",
      (u) => `import pandas as pd, requests\n\nmeta = requests.get("${u}").json()\nvalidation = pd.DataFrame(meta["validation"])`,
      (u) => `const meta = await fetch("${u}").then((r) => r.json());\nconsole.table(meta.validation);`,
    ),
    get(
      "regions",
      "/regions",
      {},
      "geojson",
      (u) => `import geopandas as gpd\n\nregions = gpd.read_file("${u}")\nprint(regions[["id", "name"]])`,
      (u) => `const regions = await fetch("${u}").then((r) => r.json());\nconsole.log(regions.features.map((f) => f.properties.id));`,
    ),
    {
      id: "chat",
      method: "POST",
      path: "/chat",
      params: null,
      returns: "sse",
      code: {
        curl: `curl -N -X POST "${root}/chat" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(chatBody)}'`,
        py: `import requests\n\npayload = ${JSON.stringify(chatBody).replaceAll(",", ", ").replaceAll(":", ": ").replace("https: ", "https:")}\nwith requests.post("${root}/chat", json=payload, stream=True) as r:\n    for line in r.iter_lines(decode_unicode=True):\n        if line.startswith("data:"):\n            print(line[5:])`,
        js: `const res = await fetch("${root}/chat", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(chatBody)}),\n});\nconst reader = res.body.pipeThrough(new TextDecoderStream()).getReader();\nfor (;;) {\n  const { value, done } = await reader.read();\n  if (done) break;\n  console.log(value);\n}`,
      },
    },
  ];
}

function MethodBadge({ method }) {
  return (
    <span className="fc-method" data-method={method}>
      {method}
    </span>
  );
}

function Tabs({ label, items, value, onChange, idBase, className = "" }) {
  const refs = useRef({});
  const onKey = (e) => {
    const i = items.findIndex(([k]) => k === value);
    let next = null;
    if (e.key === "ArrowRight") next = items[(i + 1) % items.length][0];
    else if (e.key === "ArrowLeft") next = items[(i - 1 + items.length) % items.length][0];
    else if (e.key === "Home") next = items[0][0];
    else if (e.key === "End") next = items[items.length - 1][0];
    if (next) {
      e.preventDefault();
      onChange(next);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className={`fc-tabs ${className}`} onKeyDown={onKey}>
      {items.map(([k, l]) => (
        <button
          key={k}
          ref={(el) => (refs.current[k] = el)}
          type="button"
          role="tab"
          id={`${idBase}-tab-${k}`}
          aria-controls={`${idBase}-panel`}
          aria-selected={value === k}
          tabIndex={value === k ? 0 : -1}
          onClick={() => onChange(k)}
          className="fc-tab"
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Explorer({ routes }) {
  const { t } = useI18n();
  const base = useId().replace(/:/g, "");
  const [active, setActive] = useState(routes[0].id);
  const [lang, setLangState] = useState(readLang);
  const listRefs = useRef({});
  const route = routes.find((r) => r.id === active) ?? routes[0];
  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };
  const onListKey = (e) => {
    const i = routes.findIndex((r) => r.id === active);
    let next = null;
    if (e.key === "ArrowDown") next = routes[(i + 1) % routes.length].id;
    else if (e.key === "ArrowUp") next = routes[(i - 1 + routes.length) % routes.length].id;
    else if (e.key === "Home") next = routes[0].id;
    else if (e.key === "End") next = routes[routes.length - 1].id;
    if (next) {
      e.preventDefault();
      setActive(next);
      listRefs.current[next]?.focus();
    }
  };

  return (
    <div className="fc-explorer">
      <div role="tablist" aria-label={t("api.endpoints")} aria-orientation="vertical" className="fc-endpoints" onKeyDown={onListKey}>
        {routes.map((r) => {
          const on = r.id === active;
          return (
            <button
              key={r.id}
              ref={(el) => (listRefs.current[r.id] = el)}
              type="button"
              role="tab"
              id={`${base}-ep-${r.id}`}
              aria-controls={`${base}-ep-panel`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(r.id)}
              className="fc-endpoint"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MethodBadge method={r.method} />
                <code className="truncate text-[13px] font-semibold">{r.path}</code>
                <span className="ml-auto shrink-0 text-[11px] font-medium text-muted">{t(`api.returns.${r.returns}`)}</span>
              </span>
              <span className="text-[13px] leading-snug text-muted">{t(`api.route.${r.id}`)}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${base}-ep-panel`} aria-labelledby={`${base}-ep-${route.id}`} className="fc-example">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method={route.method} />
            <code className="text-[14px] font-semibold">{route.path}</code>
          </div>
          <p className="m-0 max-w-[60ch] text-sm leading-relaxed text-muted">{t(`api.route.${route.id}`)}</p>
          {route.params && Object.keys(route.params).length > 0 && (
            <dl className="fc-params">
              {Object.entries(route.params).map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <code>{k}</code>
                  </dt>
                  <dd>
                    <code>{String(v)}</code>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <CodeBlock
          code={route.code[lang]}
          label={`${route.method} ${route.path} · ${LANGS.find(([k]) => k === lang)[1]}`}
          bar={<Tabs label={t("api.lang")} items={LANGS} value={lang} onChange={setLang} idBase={`${base}-lang`} />}
        >
          <pre id={`${base}-lang-panel`} role="tabpanel" aria-labelledby={`${base}-lang-tab-${lang}`} tabIndex={0}>
            <code>{highlight(route.code[lang])}</code>
          </pre>
        </CodeBlock>
      </div>
    </div>
  );
}

function useSizes(files) {
  const [sizes, setSizes] = useState({});
  const key = files.map((f) => f.href).join("|");
  useEffect(() => {
    if (isMock) return;
    const ctrl = new AbortController();
    (async () => {
      for (const f of files) {
        try {
          const res = await fetch(f.href, { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)]) });
          const len = Number(res.headers.get("content-length"));
          const size = len > 0 ? len : (await res.blob()).size;
          if (len > 0) res.body?.cancel?.();
          setSizes((s) => ({ ...s, [f.href]: size }));
        } catch {
          if (ctrl.signal.aborted) return;
        }
      }
    })();
    return () => ctrl.abort();
  }, [key]);
  return sizes;
}

function formatBytes(n, formatNumber) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${formatNumber(n / 1024, { maximumFractionDigits: 0 })} KB`;
  return `${formatNumber(n / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

function FileLink({ file, size }) {
  const { formatNumber } = useI18n();
  return (
    <a href={file.href} download={file.name} className="fc-file">
      <span className="fc-file-icon" aria-hidden="true">
        <Icon name="download" size={15} />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{file.label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
        <span className="fc-format">{file.format}</span>
        <span className="w-12 text-right tabular-nums">{size ? formatBytes(size, formatNumber) : ""}</span>
      </span>
    </a>
  );
}

function Citation({ text }) {
  const { t } = useI18n();
  const base = useId().replace(/:/g, "");
  const [fmt, setFmt] = useState("text");
  const bib = `@misc{elis2026,\n  author = {{Log N + 1}},\n  title = {Elis: a harmonized MODIS--VIIRS fire record for Peru, 2000--2026},\n  year = {2026},\n  note = {NASA Space Apps Challenge 2026},\n  url = {${REPO}}\n}`;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="fc-h !m-0">{t("api.citation.title")}</h4>
        <Tabs
          label={t("api.citation.title")}
          items={[
            ["text", t("api.citation.plain")],
            ["bibtex", "BibTeX"],
          ]}
          value={fmt}
          onChange={setFmt}
          idBase={`${base}-cite`}
        />
      </div>
      <div id={`${base}-cite-panel`} role="tabpanel" aria-labelledby={`${base}-cite-tab-${fmt}`}>
        {fmt === "text" ? (
          <figure className="fc-cite m-0">
            <blockquote className="m-0">{text}</blockquote>
            <CopyButton text={text} label={t("api.citation.title")} className="fc-code-copy" />
          </figure>
        ) : (
          <CodeBlock code={bib} label="BibTeX" />
        )}
      </div>
    </div>
  );
}

export default function ApiCard({ regionIds, note }) {
  const { t } = useI18n();
  const root = apiRoot();
  const snapshot = useDataMode() === "fallback";
  const routes = buildRoutes(root);
  const fileHref = (apiPath, file) => (snapshot ? staticUrl(file) : `${root}${apiPath}`);
  const seriesFiles = regionIds.map((id) => ({ label: t(`region.${id}`), href: fileHref(`/series?region=${id}`, `series/${id}.json`), name: `series_${id}.json`, format: "JSON" }));
  const otherFiles = [
    { label: t("api.download.forecast"), href: fileHref("/forecast", "forecast.json"), name: "forecast.json", format: "JSON" },
    { label: t("api.download.methodology"), href: fileHref("/methodology", "methodology.json"), name: "methodology.json", format: "JSON" },
    { label: t("api.download.regions"), href: fileHref("/regions", "regions.geojson"), name: "regions.geojson", format: "GeoJSON" },
    { label: t("api.download.report"), href: "/firechronos-technical-report.pdf", name: "firechronos-technical-report.pdf", format: "PDF" },
  ];
  const sizes = useSizes([...seriesFiles, ...otherFiles]);
  const citation = t("api.citation.text", { url: REPO });
  const units = [
    ["estimated", "cells"],
    ["est_low · est_high", "range"],
    ["raw_modis · raw_viirs", "raw"],
    ["is_forecast", "forecast"],
  ];

  return (
    <section aria-labelledby="api-title" className="fc-api @container/api">
      <header className="fc-api-head">
        <div className="grid gap-2">
          <h3 id="api-title" className="m-0 font-head text-2xl font-extrabold tracking-[-0.02em]">
            {t("api.title")}
          </h3>
          <p className="m-0 max-w-[62ch] text-[15px] leading-relaxed text-muted">{t("api.lede")}</p>
        </div>
        <div className="fc-baseurl">
          <span className="text-xs font-semibold text-muted">{t("api.base")}</span>
          <code className="min-w-0 truncate text-[13px]">{root}</code>
          <CopyButton text={root} label={t("api.base")} compact />
          <a className="fc-btn shrink-0" href={`${root}/docs`} target="_blank" rel="noopener">
            {t("api.docs")}
            <Icon name="external" size={14} />
          </a>
        </div>
      </header>
      {(isMock || note) && <p className="fc-note m-0">{isMock ? t("api.mockNote") : note}</p>}

      <div className="fc-api-grid">
        <div className="grid min-w-0 content-start gap-3">
          <h4 className="fc-h !m-0">{t("api.endpoints")}</h4>
          <Explorer routes={routes} />
          <dl className="fc-units">
            {units.map(([term, k]) => (
              <div key={k}>
                <dt>
                  <code>{term}</code>
                </dt>
                <dd>{t(`api.units.def.${k}`)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="grid min-w-0 content-start gap-7" aria-label={t("api.aside")}>
          <div className="grid gap-2">
            <h4 className="fc-h !m-0">{t("api.downloads")}</h4>
            <div className="fc-files">
              <p className="m-0 px-3 pb-1 pt-2.5 text-[11px] font-semibold text-muted">{t("api.download.series")}</p>
              {seriesFiles.map((f) => (
                <FileLink key={f.href} file={f} size={sizes[f.href]} />
              ))}
              <p className="m-0 border-t border-line px-3 pb-1 pt-2.5 text-[11px] font-semibold text-muted">{t("api.download.other")}</p>
              {otherFiles.map((f) => (
                <FileLink key={f.href} file={f} size={sizes[f.href]} />
              ))}
            </div>
          </div>

          <Citation text={citation} />

        </aside>
      </div>
    </section>
  );
}
