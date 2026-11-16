import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegions, useRegionData } from "./hooks/useRegionData.js";
import { useMapCells } from "./hooks/useMapCells.js";
import { useCellView } from "./hooks/useCellView.js";
import { useForecast } from "./hooks/useForecast.js";
import { useImageryView } from "./components/imagery/useImageryView.js";
import { DEFAULT_PERIOD, FIRST_YEAR, LAST_YEAR, LOCALES } from "./config.js";
import { fromIndex, monthIndex, periodState, stepPeriod } from "./lib/period.js";
import { periodStatus } from "./lib/status.js";
import { chanceHigh, findUnit } from "./lib/forecast.js";
import { featureBounds, mapPadding } from "./lib/mapStyle.js";
import { prefersReducedMotion } from "./lib/hooks.js";
import { DEFAULT_SUB } from "./content/sensors.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import MockBanner from "./components/MockBanner.jsx";
import MapLegend from "./components/MapLegend.jsx";
import ImageryLegend from "./components/imagery/ImageryLegend.jsx";
import ChatPanel from "./components/chat/ChatPanel.jsx";
import ElisSpotlight, { ELIS_MISSIONS, AUTOPILOT_SECONDS } from "./components/chat/ElisSpotlight.jsx";
import { speakElisText, cancelElisSpeech } from "./utils/speech.js";
import { ElisMark } from "./components/shell/Rail.jsx";
import Rail, { VIEWS } from "./components/shell/Rail.jsx";
import TimeRibbon from "./components/shell/TimeRibbon.jsx";
import LayerSwitcher from "./components/shell/LayerSwitcher.jsx";
import CommandPalette from "./components/shell/CommandPalette.jsx";
import TourCard, { tourSteps } from "./components/shell/Tour.jsx";
import Icon from "./components/shell/icons.jsx";
import MapBoundary from "./components/shell/MapBoundary.jsx";
import { useLabelContrast } from "./components/shell/useLabelContrast.js";
import { useOutlookLayer } from "./components/shell/useOutlookLayer.js";
import ExploreView from "./components/shell/views/ExploreView.jsx";
import CompareView from "./components/shell/views/CompareView.jsx";
import YearView from "./components/shell/views/YearView.jsx";
import OutlookView, { OutlookLegend } from "./components/shell/views/OutlookView.jsx";
import MethodView from "./components/shell/views/MethodView.jsx";
import DataView from "./components/shell/views/DataView.jsx";
import ContinuityView from "./components/shell/views/ContinuityView.jsx";
import { LiveBadge, LiveSummary } from "./components/shell/LiveCheck.jsx";
import SnapshotBadge from "./components/shell/SnapshotBadge.jsx";

const MapView = lazy(() => import("./components/MapView.jsx"));
const NONE = [];
const PANEL_WIDTH = { explore: 380, compare: 600, continuity: 560, year: 540, outlook: 500, ask: 440 };
const WIDE = new Set(["method", "data"]);

function readUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const y = Number(p.get("y"));
    const m = Number(p.get("m"));
    return {
      view: VIEWS.includes(p.get("view")) ? p.get("view") : "explore",
      region: p.get("region") || "peru",
      unit: p.get("unit") || null,
      period: y >= FIRST_YEAR && y <= LAST_YEAR && m >= 1 && m <= 12 ? { year: y, month: m } : DEFAULT_PERIOD,
      tour: p.get("tour"),
    };
  } catch {
    return { view: "explore", region: "peru", unit: null, period: DEFAULT_PERIOD, tour: null };
  }
}

function readTheme() {
  try {
    const v = localStorage.getItem("fc.theme");
    if (v === "light" || v === "dark") return v;
  } catch {}
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function typing(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

const initial = readUrl();

export default function App() {
  const { t, formatNumber, locale, setLocale, languageName } = useI18n();
  const toolbarRef = useRef(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const resize = () => toolbar.parentElement.style.setProperty("--elis-top", `${toolbar.offsetTop + toolbar.offsetHeight + 12}px`);
    const observer = new ResizeObserver(resize);
    observer.observe(toolbar);
    resize();
    return () => observer.disconnect();
  }, []);
  const [view, setView] = useState(initial.view);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [region, setRegion] = useState(initial.region);
  const [unit, setUnit] = useState(initial.unit ?? initial.region);
  const [period, setPeriod] = useState(initial.period);
  const [group, setGroup] = useState("estimated");
  const [sub, setSub] = useState("all");
  const [ribbonMetric, setRibbonMetric] = useState("estimated");
  const [playing, setPlaying] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(null);
  const [tour, setTour] = useState(() => {
    if (initial.tour) return { step: 0, auto: initial.tour === "auto" };
    try {
      if (window.localStorage.getItem("fc-tour-seen")) return null;
      window.localStorage.setItem("fc-tour-seen", "1");
    } catch {
      return null;
    }
    return { step: 0, auto: false };
  });
  const [theme, setTheme] = useState(readTheme);
  const [terrain, setTerrain] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [dataTab, setDataTab] = useState("series");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightMinimized, setSpotlightMinimized] = useState(false);
  const [activeMissionId, setActiveMissionId] = useState("artifact");
  const [autopilot, setAutopilot] = useState(false);
  const [projectedTurn, setProjectedTurn] = useState(null);
  const panelRef = useRef(null);

  const regionsState = useRegions();
  const { regionIds, regions, departments } = regionsState;
  const { status, error, series, methodology } = useRegionData(region);
  const forecast = useForecast();
  const periods = methodology?.periods;

  useEffect(() => {
    if (regionIds.length && !regionIds.includes(region)) setRegion(regionIds[0]);
  }, [regionIds, region]);

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eef2ef" : "#0a130f");
  }, [theme]);

  const outlook = view === "outlook";
  const seriesLoading = status === "loading";
  const observed = !seriesLoading && periodState(series, period.year, period.month) === "observed";
  const map = useMapCells({ ...period, region, enabled: observed && !outlook });
  const img = useImageryView({ period, onPeriodChange: setPeriod, regions, region });
  const cellView = useCellView({ series, seriesLoading, period, map, group, sub });
  const layer = img.view === "cells" ? "cells" : img.base;
  const imagery = img.view === "imagery" && !outlook;
  const current = periodStatus(series, periods, period.year, period.month);
  const regionLabel = t(`region.${region}`);
  const unitData = findUnit(forecast.data, unit);
  const deptFeature = departments?.features.find((f) => f.properties.id === unit) ?? null;
  const loadError = regionsState.status === "error" ? regionsState.error : status === "error" ? error : null;

  const fitTo = useCallback(
    (feature) => {
      if (!mapInstance || !feature) return;
      mapInstance.fitBounds(featureBounds(feature), { padding: mapPadding(mapInstance), duration: prefersReducedMotion() ? 0 : 600, maxZoom: 8 });
    },
    [mapInstance],
  );

  const selectRegion = useCallback((id) => {
    setRegion(id);
    setUnit(id);
  }, []);

  const selectUnit = useCallback(
    (id) => {
      const dept = departments?.features.find((f) => f.properties.id === id);
      setUnit(id);
      if (dept) {
        if (dept.properties.macroregion) setRegion(dept.properties.macroregion);
      } else if (regionIds.includes(id)) setRegion(id);
    },
    [departments, regionIds],
  );

  useLabelContrast(mapInstance, imagery && Boolean(img.raster));

  useOutlookLayer(mapInstance, {
    departments,
    forecast: forecast.data,
    active: outlook,
    selected: deptFeature ? unit : null,
    onSelect: (id) => {
      selectUnit(id);
      setPanelOpen(true);
    },
    describe: (p) =>
      p.p < 0
        ? t("outlook.noForecast")
        : `${t("outlook.popup", { p: formatNumber(p.p, { style: "percent", maximumFractionDigits: 0 }) })} · ${t(`outlook.method.${p.method}.short`)}`,
  });

  const lastObserved = useMemo(() => {
    let best = -1;
    for (const r of series) if (!r.is_forecast) best = Math.max(best, monthIndex(r.year, r.month));
    return best;
  }, [series]);

  const openView = useCallback(
    (v) => {
      setPlaying(false);
      if (v === view) {
        setPanelOpen((o) => !o);
        return;
      }
      setView(v);
      setPanelOpen(true);
      if (v === "outlook" && !deptFeature) setUnit(region);
      if (v === "year" && period.year !== LAST_YEAR && lastObserved >= 0) setPeriod(fromIndex(lastObserved));
      requestAnimationFrame(() => panelRef.current?.scrollTo?.({ top: 0 }));
    },
    [view, region, deptFeature, period.year, lastObserved],
  );

  const setLayer = useCallback(
    (l) => {
      if (l === "cells") img.setView("cells");
      else {
        img.setBase(l);
        img.setView("imagery");
      }
    },
    [img],
  );

  const toggleHeat = () => {
    if (img.view === "cells") {
      img.setView("imagery");
      img.setHeat(true);
    } else img.setHeat(!img.heat);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!imagery && monthIndex(period.year, period.month) >= lastObserved) setPeriod({ year: FIRST_YEAR, month: 11 });
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    if (imagery) {
      if (img.detections.status === "loading") return;
      const id = setTimeout(() => {
        const d = new Date(Date.UTC(img.date.year, img.date.month - 1, img.date.day + 1));
        const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        if (next.year > LAST_YEAR) setPlaying(false);
        else img.setDate(next);
      }, 1500);
      return () => clearTimeout(id);
    }
    if (seriesLoading || map.status === "loading") return;
    const id = setTimeout(() => {
      const next = stepPeriod(period, 1);
      if (monthIndex(next.year, next.month) > lastObserved || (next.year === period.year && next.month === period.month)) setPlaying(false);
      else setPeriod(next);
    }, 700);
    return () => clearTimeout(id);
  }, [playing, imagery, period, map.status, seriesLoading, lastObserved, img.detections.status, img.date]);

  const applyStep = useCallback(
    (i, auto) => {
      const s = tourSteps(auto)[i];
      if (!s) return;
      setPlaying(false);
      setAutopilot(false);
      setSpotlightOpen(false);
      setProjectedTurn(null);
      setPaletteOpen(false);
      setSheetExpanded(false);
      setView(s.view);
      setPanelOpen(!["terrain", "hud"].includes(s.id));
      setRibbonMetric(s.metric || "estimated");
      selectRegion("peru");
      setUnit("peru");
      setGroup("estimated");
      setSub(DEFAULT_SUB.estimated);
      img.setHeat(false);
      img.clearCell();
      img.setView("cells");
      setPeriod({ year: 2024, month: 9 });
      if (s.layer) {
        img.setBase(s.layer);
        img.setDate({ year: 2024, month: 9, day: 10 });
      }
      mapInstance?.fire("resetview");
      if (s.id === "terrain") mapInstance?.fire("fly3d", { region: "cusco" });
      setLiveOpen(s.live ? "pinned" : null);
    },
    [img, selectRegion, mapInstance],
  );

  const closeTour = useCallback(() => {
    setTour(null);
    setPlaying(false);
    setPaletteOpen(false);
    setView("explore");
    setPanelOpen(true);
    setLiveOpen(null);
    setSpotlightOpen(false);
    setAutopilot(false);
    setSheetExpanded(false);
    selectRegion("peru");
    setUnit("peru");
    setGroup("estimated");
    setSub(DEFAULT_SUB.estimated);
    img.setView("cells");
    img.setHeat(false);
    img.clearCell();
    setRibbonMetric("estimated");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        mapInstance?.resize();
        mapInstance?.fire("resetview", { instant: true });
        setTimeout(() => {
          mapInstance?.resize();
          mapInstance?.fire("resetview", { instant: true });
        }, 400);
      }),
    );
  }, [img, mapInstance, selectRegion]);

  const startTour = useCallback((auto = false) => setTour({ step: 0, auto, run: Date.now() }), []);

  const applyElisMission = useCallback(
    (mission, enableAutopilot = null, expandCard = true) => {
      if (!mission) return;
      setPlaying(false);
      setTour(null);
      setProjectedTurn(null);
      setActiveMissionId(mission.id);
      setSpotlightOpen(true);
      setSpotlightMinimized(!expandCard);
      if (enableAutopilot !== null) setAutopilot(enableAutopilot);
      if (mission.region) selectRegion(mission.region);
      if (mission.year && mission.month) setPeriod({ year: mission.year, month: mission.month });
      if (mission.metric) setRibbonMetric(mission.metric);
      if (mission.mode3d) {
        mapInstance?.fire("fly3d", { region: mission.cameraKey || mission.region || "amazonia" });
      } else {
        mapInstance?.fire("resetview");
      }
    },
    [selectRegion, mapInstance],
  );

  const tourStep = tour?.step;
  const tourAuto = tour?.auto;
  const tourRun = tour?.run;
  useEffect(() => {
    if (tourStep === undefined || tourStep === null) return;
    applyStep(tourStep, tourAuto);
  }, [tourStep, tourAuto, tourRun]);

  useEffect(() => {
    if (tourStep === undefined || tourStep === null) return;
    if (tourSteps(tourAuto)[tourStep]?.id !== "imagery") return;
    const sequence = ["cells", "thermal", "truecolor", "swir"];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % sequence.length;
      setLayer(sequence[i]);
    }, 1200);
    return () => clearInterval(id);
  }, [tourStep, tourAuto, tourRun, setLayer]);

  useEffect(() => {
    try {
      const p = new URLSearchParams();
      p.set("view", view);
      p.set("region", region);
      if (outlook && unit !== region) p.set("unit", unit);
      p.set("y", period.year);
      p.set("m", period.month);
      window.history.replaceState(null, "", `?${p.toString()}`);
    } catch {}
  }, [view, region, unit, period, outlook]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && tour) {
        closeTour();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing(e.target) || paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (new RegExp(`^[1-${VIEWS.length}]$`).test(e.key)) openView(VIEWS[Number(e.key) - 1]);
      else if (e.key === "Escape" && liveOpen) setLiveOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, openView, tour, liveOpen, closeTour]);

  useEffect(() => {
    if (!liveOpen) return;
    const onDown = (e) => {
      if (!e.target.closest?.('#fc-live, [data-tour="live"], .fc-tour')) setLiveOpen(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [liveOpen]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("fc.theme", next);
    } catch {}
  };

  const commands = useMemo(() => {
    const out = [];
    for (const id of regionIds) {
      out.push({ id: `r-${id}`, group: t("palette.regions"), label: t(`region.${id}`), hint: t(id === "peru" ? "palette.country" : "palette.macro"), run: () => selectRegion(id) });
    }
    for (const f of departments?.features ?? []) {
      const u = findUnit(forecast.data, f.properties.id);
      const p = chanceHigh(u);
      out.push({
        id: `d-${f.properties.id}`,
        group: t("palette.departments"),
        label: f.properties.name,
        hint: p === null ? t("palette.deptNone") : t("palette.deptOutlook", { p: formatNumber(p, { style: "percent", maximumFractionDigits: 0 }) }),
        keywords: f.properties.id,
        run: () => {
          setView("outlook");
          setPanelOpen(true);
          selectUnit(f.properties.id);
        },
      });
    }
    VIEWS.forEach((v, i) => out.push({ id: `v-${v}`, group: t("palette.views"), label: t(`view.${v}`), hint: String(i + 1), run: () => openView(v) }));
    out.push({ id: "a-tour", group: t("palette.actions"), label: t("tour.start"), run: () => startTour(false) });
    out.push({ id: "a-live", group: t("palette.actions"), label: t("live.title"), hint: t("live.badge"), run: () => setLiveOpen("pinned") });
    out.push({ id: "a-continuity", group: t("palette.actions"), label: t("cont.toggle"), run: () => openView("continuity") });
    out.push({ id: "a-play", group: t("palette.actions"), label: t(playing ? "ribbon.pause" : "ribbon.play"), run: togglePlay });
    out.push({
      id: "a-metric",
      group: t("palette.actions"),
      label: t(ribbonMetric === "raw" ? "palette.showHarmonized" : "palette.showRaw"),
      run: () => setRibbonMetric((m) => (m === "raw" ? "estimated" : "raw")),
    });
    for (const l of ["cells", "truecolor", "thermal", "night", "swir"]) out.push({ id: `l-${l}`, group: t("palette.layers"), label: t(`layers.${l}`), run: () => setLayer(l) });
    out.push({ id: "a-theme", group: t("palette.actions"), label: t(theme === "dark" ? "theme.toLight" : "theme.toDark"), run: toggleTheme });
    return out;
  });

  const yearItem = useCallback(
    (y) =>
      y >= FIRST_YEAR && y <= LAST_YEAR
        ? { id: `y-${y}`, group: t("palette.time"), label: t("palette.goYear", { year: y }), run: () => setPeriod((p) => ({ year: y, month: y === FIRST_YEAR ? Math.max(p.month, 11) : p.month })) }
        : null,
    [t],
  );

  const forecastRows = series.filter((r) => r.is_forecast);
  const showForecastCard = !outlook && !imagery && current.kind === "forecast";
  const message = outlook ? null : imagery ? img.message : cellView.message;
  const messageError = imagery ? img.isError : cellView.isError;
  const periodLabel = `${t(`month.${period.month}`)} ${period.year}`;
  const regionButtonLabel = outlook && unitData ? (unitData.level === "department" ? unitData.name : t(`region.${unitData.region}`)) : regionLabel;

  let panel = null;
  if (view === "explore")
    panel = (
      <div className="grid gap-6">
      <ExploreView
        regionLabel={regionLabel}
        period={period}
        status={current}
        img={img}
        group={group}
        sub={sub}
        onSubChange={setSub}
        cellView={cellView}
        onOpenOutlook={() => openView("outlook")}
        onOpenCells={() => {
          setDataTab("cells");
          openView("data");
        }}
      />
      <LiveSummary onOpen={() => setLiveOpen("pinned")} />
      </div>
    );
  else if (view === "continuity") panel = <ContinuityView region={region} period={period} onSelectPeriod={(p) => { setPlaying(false); setPeriod(p); }} />;
  else if (view === "compare") panel = <CompareView series={series} region={region} period={period} onSelectPeriod={setPeriod} methodology={methodology} />;
  else if (view === "year") panel = <YearView series={series} region={region} period={period} onSelectPeriod={setPeriod} />;
  else if (view === "outlook") panel = (
      <OutlookView
        forecast={forecast}
        unitId={unit}
        onSelectUnit={selectUnit}
        nextRows={deptFeature ? NONE : forecastRows}
        series={deptFeature ? NONE : series}
        periods={periods}
        monthlyMethods={methodology?.forecast?.published}
      />
    );
  else if (view === "method") panel = <MethodView methodology={methodology} forecast={forecast} theme={theme} onTheme={toggleTheme} onOpenData={() => openView("data")} />;
  else if (view === "data") panel = <DataView key={dataTab} initialTab={dataTab} regionIds={regionIds} period={period} periods={periods} forecast={forecast} />;

  const panelTitle = view === "outlook" ? t("view.outlook") : t(`view.${view}`);
  const panelSub = view === "outlook" || view === "ask" || WIDE.has(view) ? null : `${regionLabel} · ${periodLabel}`;

  return (
    <div className="fc-app" data-panel={panelOpen || WIDE.has(view) ? "open" : "closed"} data-wide={WIDE.has(view) || undefined} data-sheet={sheetExpanded ? "expanded" : "half"} style={{ "--panel-w": `${PANEL_WIDTH[view] ?? 400}px` }}>
      <MockBanner />
      <a href="#fc-panel" className="fc-skip">
        {t("a11y.skip")}
      </a>
      <Rail view={view} panelOpen={panelOpen} onSelect={openView} onTour={() => startTour(false)} theme={theme} onTheme={toggleTheme} />

      <aside data-tour="active-panel" id="fc-panel" aria-labelledby="fc-panel-title" className="fc-panel">
        <button
          type="button"
          className="fc-sheet-handle lg:hidden"
          aria-label={t(sheetExpanded ? "sheet.collapse" : "sheet.expand")}
          aria-expanded={sheetExpanded}
          onClick={() => setSheetExpanded((v) => !v)}
        >
          <span aria-hidden="true" />
        </button>
        <header className={`fc-panel-head ${view === "ask" ? "lg:hidden" : ""}`}>
          <div className="min-w-0">
            <h2 id="fc-panel-title" className="m-0 font-head text-base font-extrabold">
              {panelTitle}
            </h2>
            {panelSub && <p className="m-0 truncate text-xs text-muted">{panelSub}</p>}
          </div>
          <button type="button" className={`fc-icon-btn hidden ${WIDE.has(view) ? "" : "lg:grid"}`} aria-label={t("panel.collapse")} title={t("panel.collapse")} onClick={() => setPanelOpen(false)}>
            <Icon name="prev" size={18} />
          </button>
        </header>
        {loadError && (
          <p role="alert" className="m-0 mx-4 mb-3 rounded-lg border border-danger px-3 py-2 text-sm text-danger">
            {t("status.error", { message: loadError?.message ?? String(loadError) })}
          </p>
        )}
        {view === "ask" ? (
          <div className="min-h-0 flex-1">
            <ChatPanel
              embedded
              region={region}
              series={series}
              methodology={methodology}
              onOpenMethod={() => openView("method")}
              onLaunchMission={(missionId, auto = false) => {
                const found = ELIS_MISSIONS.find((m) => m.id === missionId) || ELIS_MISSIONS[0];
                setPanelOpen(false);
                applyElisMission(found, auto, true);
              }}
              onProjectTurn={(turn) => {
                setAutopilot(false);
                setProjectedTurn(turn);
                setSpotlightOpen(true);
                setSpotlightMinimized(false);
                setPanelOpen(false);
                setSpotlightMinimized(false);
                const targetReg = turn?.chart?.region && regionIds.includes(turn.chart.region) ? turn.chart.region : region;
                if (targetReg) selectRegion(targetReg);
                if (turn?.chart?.highlight_year) {
                  setPeriod({ year: turn.chart.highlight_year, month: turn.chart.highlight_month || 9 });
                }
                mapInstance?.fire("fly3d", { region: targetReg });
              }}
              onSyncView={({ region: nextRegion, cameraKey, year, month, mode3d }) => {
                const targetReg = nextRegion && regionIds.includes(nextRegion) ? nextRegion : region;
                if (nextRegion && regionIds.includes(nextRegion)) selectRegion(nextRegion);
                if (year && month) setPeriod({ year, month });
                if (mode3d) {
                  mapInstance?.fire("fly3d", { region: cameraKey || targetReg });
                }
              }}
            />
          </div>
        ) : (
          <div ref={panelRef} className="fc-panel-body @container" aria-busy={seriesLoading || undefined}>
            {seriesLoading && view !== "outlook" ? (
              <div className="grid gap-3">
                <div className="fc-skel h-4 w-1/3" />
                <div className="fc-skel h-12 w-2/3" />
                <div className="fc-skel h-4 w-1/2" />
                <div className="fc-skel h-28" />
              </div>
            ) : (
              panel
            )}
          </div>
        )}
      </aside>

      <main className="fc-stage" aria-label={t("map.stage")}>
        <MapBoundary>
        <Suspense fallback={<div className="fc-skel h-full w-full rounded-none" />}>
          <MapView
            fill
            regions={regions}
            cells={outlook ? NONE : cellView.cells}
            metric={cellView.metric}
            breaks={cellView.breaks}
            region={region}
            onRegionSelect={selectRegion}
            onCellSelect={img.selectCell}
            imagery={outlook ? { ...img.imagery, enabled: false } : img.imagery}
            ariaLabel={t("map.aria", { period: periodLabel })}
            onReady={setMapInstance}
            onTerrainChange={setTerrain}
            focus={outlook && deptFeature ? deptFeature : null}
          />
        </Suspense>
        </MapBoundary>

        <div ref={toolbarRef} className="fc-overlay fc-overlay-top">
          <div className="flex min-w-0 max-w-full flex-col items-start gap-2">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {!panelOpen && (
              <button type="button" className="fc-float fc-press hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold lg:flex" onClick={() => setPanelOpen(true)}>
                <Icon name={view} size={18} />
                {t(`view.${view}`)}
              </button>
            )}
            <button type="button" onClick={() => setPaletteOpen(true)} className="fc-float fc-press flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-xl pl-3 pr-2 text-sm" aria-keyshortcuts="Control+K Meta+K /">
              <Icon name="search" size={17} className="text-muted" />
              <span className="truncate font-semibold sm:max-w-none">{regionButtonLabel}</span>
              <span className="hidden text-muted sm:inline">{t("palette.trigger")}</span>
              <kbd className="fc-kbd hidden sm:inline-block">⌘K</kbd>
            </button>
            <button
              type="button"
              className="fc-float fc-press grid size-10 place-items-center rounded-xl"
              aria-label={t("map.reset")}
              title={t("map.reset")}
              onClick={() => mapInstance?.fire("resetview")}
            >
              <Icon name="fit" size={17} />
            </button>
            <LiveBadge state={liveOpen} onState={setLiveOpen} />
            <div role="group" aria-label={t("lang.label")} className="fc-float flex h-10 items-center rounded-xl p-0.5 text-xs font-bold">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={locale === code}
                  aria-label={languageName(code)}
                  title={languageName(code)}
                  onClick={() => setLocale(code)}
                  className={`rounded-lg px-2 py-1 text-xs font-bold uppercase transition cursor-pointer ${
                    locale === code ? "bg-fg text-bg" : "text-muted hover:text-fg"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2" data-elis-controls data-tour="hud">
            <button
              type="button"
              onClick={() => {
                if (spotlightOpen && !autopilot) {
                  setSpotlightOpen(false);
                } else {
                  const currentM = ELIS_MISSIONS.find((m) => m.id === activeMissionId) || ELIS_MISSIONS[0];
                  applyElisMission(currentM, false);
                }
              }}
              className={`fc-float fc-press flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition cursor-pointer ${
                spotlightOpen ? "!border-forecast bg-forecast/15 text-forecast" : "text-fg hover:!border-forecast"
              }`}
              title={t("hud.open")}
            >
              <ElisMark size={18} />
              <span>{t("hud.title")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (spotlightOpen && autopilot) {
                  cancelElisSpeech();
                  setAutopilot(false);
                } else {
                  const text = locale === "es" ? ELIS_MISSIONS[0].takeawayEs : ELIS_MISSIONS[0].takeawayEn;
                  if (text) {
                    speakElisText(text, locale === "es");
                  }
                  applyElisMission(ELIS_MISSIONS[0], true);
                }
              }}
              className={`fc-float fc-press flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold cursor-pointer transition ${
                spotlightOpen && autopilot
                  ? "!border-forecast !bg-forecast !text-bg shadow-lg"
                  : "border-forecast/60 bg-forecast/10 text-forecast hover:!border-forecast hover:bg-forecast/20"
              }`}
              title={t("chat.autopilot", { seconds: AUTOPILOT_SECONDS })}
            >
              <span>{spotlightOpen && autopilot ? "⏸" : "⚡"}</span>
              <span>{t("hud.quickTour")}</span>
            </button>
            {!tour && (
              <button type="button" aria-label={t("tour.start")} className="fc-float fc-press flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold lg:hidden" onClick={() => startTour(false)}>
                <Icon name="tour" size={17} />
                <span className="hidden sm:inline">{t("tour.short")}</span>
              </button>
            )}
          </div>
          <SnapshotBadge />
          </div>
          {outlook ? (
            <p className="fc-float pointer-events-auto m-0 hidden h-10 items-center whitespace-nowrap rounded-xl border-dashed !border-forecast px-3 text-sm font-semibold text-forecast sm:flex">{t("outlook.mapBadge")}</p>
          ) : (
            <LayerSwitcher layer={layer} onLayer={setLayer} heat={img.heat} onHeat={toggleHeat} group={group} onGroup={(g) => { setGroup(g); setSub(DEFAULT_SUB[g]); }} />
          )}
        </div>

        {message && (
          <p role={messageError ? "alert" : "status"} className={`fc-float fc-map-message ${messageError ? "!border-danger text-danger" : ""}`}>
            {message}
          </p>
        )}

        {showForecastCard && current.row && (
          <div className="fc-overlay-center">
            <section aria-labelledby="fc-forecast-card" className="fc-float fc-forecast-block pointer-events-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl p-4">
              <p className="m-0 text-xs font-bold text-forecast">{t("explore.forecastTag")}</p>
              <h3 id="fc-forecast-card" className="m-0 mt-1 text-base font-semibold">
                {t("forecastCard.title")}
              </h3>
              <p className="m-0 mt-1 text-sm text-muted">{t("forecastCard.text", { region: regionLabel, period: periodLabel })}</p>
              <p className="m-0 mt-2 font-head text-3xl font-extrabold text-forecast tabular-nums">{formatNumber(current.row.estimated, { maximumFractionDigits: 0 })}</p>
              <p className="m-0 text-sm tabular-nums">
                <span className="text-muted">{t("explore.range")}</span> {formatNumber(current.row.est_low, { maximumFractionDigits: 0 })} – {formatNumber(current.row.est_high, { maximumFractionDigits: 0 })} <span className="text-muted">{t("unit.short")}</span>
              </p>
              <button type="button" className="fc-btn mt-3" onClick={() => openView("outlook")}>
                {t("forecastCard.cta")}
              </button>
            </section>
          </div>
        )}

        <ElisSpotlight
          open={spotlightOpen}
          minimized={spotlightMinimized}
          onToggleMinimized={(min) => {
            setSpotlightMinimized(min);
            if (!min && view === "ask") setPanelOpen(false);
          }}
          activeMissionId={activeMissionId}
          autopilot={autopilot}
          onCompleteAutopilot={() => setAutopilot(false)}
          customTurn={projectedTurn}
          series={series}
          onSelectMission={(m, fromAutopilot = false) => applyElisMission(m, fromAutopilot ? true : false, !spotlightMinimized)}
          onToggleAutopilot={() => {
            if (!autopilot) {
              applyElisMission(ELIS_MISSIONS[0], true);
            } else {
              setAutopilot(false);
            }
          }}
          onClose={() => {
            setSpotlightOpen(false);
            setAutopilot(false);
          }}
          onOpenChatDrawer={() => {
            openView("ask");
          }}
          onOpenOutlook={() => {
            setSpotlightOpen(false);
            setAutopilot(false);
            openView("outlook");
          }}
          onOpenMethod={() => {
            setSpotlightOpen(false);
            setAutopilot(false);
            openView("method");
          }}
          onSyncView={({ region: nextRegion, cameraKey, year, month, mode3d }) => {
            const targetReg = nextRegion && regionIds.includes(nextRegion) ? nextRegion : region;
            if (nextRegion && regionIds.includes(nextRegion)) selectRegion(nextRegion);
            if (year && month) setPeriod({ year, month });
            if (mode3d) {
              mapInstance?.fire("fly3d", { region: cameraKey || targetReg });
            } else {
              mapInstance?.fire("resetview");
            }
          }}
        />

        <div className="fc-overlay fc-overlay-bottom">
          <div className="pointer-events-none max-w-[min(24rem,calc(100%-4rem))] [&>*]:pointer-events-auto">
            {outlook ? (
              forecast.data && <OutlookLegend />
            ) : imagery && !terrain ? (
              <ImageryLegend dateLabel={img.dateLabel} detections={img.detections} regionLabel={regionLabel} heat={img.heat} />
            ) : cellView.cells.length > 0 ? (
              <MapLegend terrain={terrain} metric={cellView.metric} breaks={cellView.breaks} />
            ) : null}
          </div>
        </div>

      </main>

      {tour && (
        <div className="fc-overlay-tour">
          <TourCard step={tour.step} auto={tour.auto} onStep={(i) => setTour((tr) => ({ ...tr, step: i }))} onClose={closeTour}
            onPrepare={() => applyStep(tour.step, tour.auto)}
            onDone={closeTour}
          />
        </div>
      )}

      <footer className="fc-ribbon-wrap" aria-label={t("ribbon.label")}>
        <TimeRibbon
          series={series}
          periods={periods}
          loading={seriesLoading}
          period={period}
          onChange={(p) => {
            setPlaying(false);
            setPeriod(p);
          }}
          metric={ribbonMetric}
          onMetricChange={setRibbonMetric}
          playing={playing}
          onTogglePlay={togglePlay}
          imageryDate={imagery ? img.date : null}
          onImageryDateChange={img.setDate}
          onFakeRecord={() => {
            setPlaying(false);
            setPeriod({ year: 2012, month: 9 });
            setRibbonMetric("raw");
          }}
        />
      </footer>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} yearItem={yearItem} />
    </div>
  );
}
