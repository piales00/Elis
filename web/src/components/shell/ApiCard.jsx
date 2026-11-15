import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { API_BASE } from "../../config.js";
import { isMock } from "../../data/client.js";
import Icon from "./icons.jsx";

const REPO = "https://github.com/piales00/firechronos-peru";

function apiRoot() {
  if (/^https?:\/\//.test(API_BASE)) return API_BASE.replace(/\/$/, "");
  if (typeof window === "undefined") return API_BASE;
  return `${window.location.origin}${API_BASE.startsWith("/") ? "" : "/"}${API_BASE}`.replace(/\/$/, "");
}

function CopyButton({ text, label }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  };
  return (
    <button type="button" onClick={copy} className="fc-icon-btn shrink-0" aria-label={`${t("api.copy")} ${label}`} title={t("api.copy")}>
      <Icon name={done ? "check" : "copy"} size={15} />
    </button>
  );
}

function Snippet({ label, code }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <span className="mt-0.5 w-12 shrink-0 text-[11px] font-semibold text-muted">{label}</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-[12px] leading-relaxed">{code}</code>
      <CopyButton text={code} label={label} />
    </div>
  );
}

export default function ApiCard({ regionIds, note }) {
  const { t } = useI18n();
  const root = apiRoot();
  const routes = [
    { method: "GET", path: "/regions", desc: "api.route.regions", curl: `curl "${root}/regions" -o regions.geojson`, py: `import geopandas as gpd; regions = gpd.read_file("${root}/regions")` },
    { method: "GET", path: "/series?region=amazonia&from=2012&to=2026", desc: "api.route.series", curl: `curl "${root}/series?region=amazonia&from=2012&to=2026"`, py: `import pandas as pd; series = pd.read_json("${root}/series?region=amazonia&from=2012&to=2026")` },
    { method: "GET", path: "/map?year=2024&month=9&region=amazonia", desc: "api.route.map", curl: `curl "${root}/map?year=2024&month=9&region=amazonia"`, py: `import pandas as pd; cells = pd.read_json("${root}/map?year=2024&month=9&region=amazonia")` },
    { method: "GET", path: "/methodology?region=peru", desc: "api.route.methodology", curl: `curl "${root}/methodology?region=peru"`, py: `import pandas as pd, requests; validation = pd.DataFrame(requests.get("${root}/methodology?region=peru").json()["validation"])` },
    { method: "GET", path: "/forecast?region=sierra", desc: "api.route.forecast", curl: `curl "${root}/forecast?region=sierra"`, py: `import pandas as pd, requests; outlook = pd.json_normalize(requests.get("${root}/forecast").json()["regions"])` },
    {
      method: "POST",
      path: "/chat",
      desc: "api.route.chat",
      curl: `curl -N -X POST "${root}/chat" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Is 2026 a normal fire year?"}],"region":"peru"}'`,
      py: `import requests; r = requests.post("${root}/chat", json={"messages": [{"role": "user", "content": "Is 2026 a normal fire year?"}]}, stream=True)`,
    },
  ];
  const files = [
    ...regionIds.map((id) => ({ label: `series.json · ${t(`region.${id}`)}`, href: `${root}/series?region=${id}`, name: `series_${id}.json` })),
    { label: "methodology.json", href: `${root}/methodology`, name: "methodology.json" },
    { label: "forecast.json", href: `${root}/forecast`, name: "forecast.json" },
    { label: "regions.geojson", href: `${root}/regions`, name: "regions.geojson" },
  ];
  const citation = t("api.citation.text", { url: REPO });

  return (
    <section aria-labelledby="api-title" className="grid gap-6 border-t border-line pt-8 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid content-start gap-4">
        <div>
          <h3 id="api-title" className="m-0 font-head text-xl font-extrabold">
            {t("api.title")}
          </h3>
          <p className="m-0 mt-1 max-w-[70ch] text-sm text-muted">{t("api.lede")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{t("api.base")}</span>
          <code className="rounded-md bg-surface-2 px-2 py-1 text-[13px]">{root}</code>
          <CopyButton text={root} label={t("api.base")} />
          <a className="fc-link" href={`${root}/docs`} target="_blank" rel="noopener">
            {t("api.docs")} <Icon name="external" size={14} className="inline" />
          </a>
        </div>
        {(isMock || note) && <p className="fc-note m-0">{isMock ? t("api.mockNote") : note}</p>}
        <ul className="m-0 grid list-none gap-4 p-0">
          {routes.map((r) => (
            <li key={r.path} className="grid gap-1.5">
              <p className="m-0 flex flex-wrap items-baseline gap-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${r.method === "GET" ? "bg-surface-3" : "bg-forecast-soft text-forecast"}`}>{r.method}</span>
                <code className="text-[13px] font-semibold">{r.path}</code>
                <span className="text-muted">{t(r.desc)}</span>
              </p>
              <Snippet label="curl" code={r.curl} />
              <Snippet label="Python" code={r.py} />
            </li>
          ))}
        </ul>
      </div>

      <aside className="grid content-start gap-6">
        <div>
          <h4 className="fc-h">{t("api.files")}</h4>
          <ul className="m-0 grid list-none gap-1 p-0">
            {files.map((f) => (
              <li key={f.href}>
                <a href={f.href} download={f.name} className="fc-row flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm">
                  <span>{f.label}</span>
                  <Icon name="download" size={16} className="text-muted" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="fc-h">{t("api.units.title")}</h4>
          <ul className="m-0 grid list-disc gap-1 pl-4 text-sm leading-relaxed">
            <li>{t("api.units.cells")}</li>
            <li>{t("api.units.range")}</li>
            <li>{t("api.units.raw")}</li>
            <li>{t("api.units.forecast")}</li>
          </ul>
        </div>
        <div>
          <h4 className="fc-h">{t("api.licence.title")}</h4>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-sm leading-relaxed">
            {["firms", "gibs", "power", "mapbiomas", "enso", "inei"].map((k) => (
              <li key={k}>{t(`api.licence.${k}`)}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted">{t("api.licence.ours")}</p>
        </div>
        <div>
          <h4 className="fc-h">{t("api.citation.title")}</h4>
          <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
            <p className="m-0 flex-1">{citation}</p>
            <CopyButton text={citation} label={t("api.citation.title")} />
          </div>
        </div>
      </aside>
    </section>
  );
}
