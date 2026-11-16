const VIDEO_URL = "https://www.youtube.com/watch?v=Fkg9rDq_U2Y";

const ANNUAL = [[2003,14125,44608,35313,55407],[2004,10527,35351,27461,43425],[2005,21016,62776,49033,78332],[2006,11880,39336,31617,48824],[2007,16603,47934,37465,59638],[2008,12671,38879,30919,47758],[2009,10575,33354,26563,41066],[2010,18588,54139,43045,68150],[2011,10375,32397,26161,40014],[2012,92807,45117,43618,47407],[2013,70826,37222,35865,39465],[2014,63459,34417,33224,36330],[2015,78640,41528,40218,43578],[2016,102178,52342,50548,55143],[2017,63032,35345,34130,37270],[2018,123896,37925,36529,40176],[2019,153745,42206,40826,44338],[2020,198258,57573,55485,60918],[2021,136960,39538,38130,41826],[2022,180188,52063,50151,54889],[2023,226950,46742,45132,49176],[2024,299657,53743,51908,56620],[2025,153749,33493,32212,35480]];

const ES = {
  skip: "Saltar al contenido",
  navLabel: "Secciones",
  nRes: "Recursos", nProb: "Problema", nMeth: "Método", nRes2: "Resultados", nTool: "La herramienta", nTeam: "Equipo",
  openApp: "Abrir la app",
  h1: "Un historial del fuego en Perú que sí se puede comparar, 2000–2026.",
  heroSub: "Nuestra respuesta al reto de NASA Space Apps 2026 <em>Harmonization of MODIS and VIIRS Hot Spots</em>. Dos eras de satélites se vuelven un solo registro comparable año a año, en celdas-día con fuego y siempre con un rango del 90 %.",
  watch: "Ver el video de 30 s",
  hcTitle: "Perú, cada año comparado con 2011",
  lgRaw: "Detecciones crudas, MODIS + VIIRS sumados",
  lgEst: "Registro armonizado de Elis, rango del 90 %",
  hcAria: "Gráfico de líneas, 2003 a 2025, con 2011 como base. Las detecciones crudas saltan de 1 a 8,9 veces en 2012 y llegan a 28,9 veces en 2024. El registro armonizado pasa solo de 1 a 1,39 veces en 2012 y se mantiene entre 1 y 1,94 veces.",
  eraL: "Llega VIIRS",
  noteRaw: "en un año. Cambió el sensor, no el fuego.",
  noteEst: "armonizado",
  hcCap: "Cada serie dividida entre su propio valor de 2011. Las detecciones crudas son puntos de calor de NASA FIRMS sumados entre sensores; el registro armonizado está en celdas-día con fuego. Años completos 2003–2025 de <code>/data/series.json</code>.",
  tRes: "Todo lo que construimos, a un clic.",
  pRes: "La app en vivo, el video, el informe, el código, la API y un registro público de predicciones diarias que no se pueden editar después.",
  vidSoon: "Video muy pronto",
  vidSub: "Un recorrido de 30 segundos por la app: el salto falso, la corrección, el mapa.",
  vidLabel: "Video de demostración",
  appT: "Abrir la app",
  appS: "Mapa, gráficos, pronóstico y Pregúntale a Elis. Sin registro.",
  rPaper: "Informe técnico", rPaperS: "Artículo de 20 páginas: método, 18 ecuaciones, 10 figuras y 193 cifras verificadas en PDF.",
  rNotes: "Notas de método (01–08)", rNotesS: "Ocho notas técnicas, incluido el asistente Ask Elis y el HUD de 40 s; cada cifra apunta a su archivo.",
  rRepo: "Código fuente", rRepoS: "Python, DuckDB, FastAPI, la app web y el video en Remotion, todo abierto.",
  rLive: "Registro en vivo", rLiveS: "Una predicción sellada cada día, evaluada cuando llegan los datos del satélite.",
  rApi: "API pública", rApiS: "Los mismos archivos que lee la app, en JSON. Gratis y sin clave.",
  copy: "Copiar comando", copied: "Copiado",
  apiNote: "El servidor gratuito se duerme si no se usa; la primera petición puede tardar cerca de un minuto.",
  tProb: "Sumas los satélites y el fuego parece estallar.",
  pProb: "MODIS observa Perú desde 2000 con píxeles de 1 km. VIIRS se sumó en 2012 con píxeles de 375 m y ve fuegos más pequeños. Si sumas sus puntos de calor, 2012 parece una catástrofe. Fue un instrumento nuevo.",
  barsAria: "Detecciones crudas en Perú: 10.375 en 2011 solo con MODIS, 92.807 en 2012 con VIIRS sumado.",
  bk1: "Solo MODIS", bk2: "MODIS + VIIRS",
  barsX: "en detecciones crudas, en un año",
  barsCap: "Detecciones crudas de NASA FIRMS sumadas en Perú. Mismo país, un año parecido, otros ojos.",
  pixAria: "Izquierda: un píxel MODIS de 1 km con un fuego pequeño dentro, que no destaca. Derecha: el mismo cuadrado dividido en píxeles VIIRS de 375 m; el fuego llena uno de ellos.",
  pixCap: "El mismo fuego pequeño. En un píxel MODIS de 1 km se diluye; en un píxel VIIRS de 375 m llena el cuadro. En un píxel MODIS caben unos siete de VIIRS, por eso VIIRS detecta fuegos que MODIS nunca vería.",
  tMeth: "Contamos lo que ven ambos satélites y estimamos lo que ninguno vio.",
  pMeth: "Un truco de la ecología, ajustado a satélites. La unidad es la <b>celda-día con fuego</b>: una celda de 0,1°, unos 11 km, en una fecha con al menos una detección.",
  s1T: "Captura y recaptura, en pasadas simultáneas",
  s1P: "Los fuegos que ven ambos satélites revelan cuántos no vio ninguno. Calibramos el estimador de Chapman solo en días en que Aqua MODIS y S-NPP VIIRS pasan con menos de 20 minutos de diferencia. Así coinciden en el 80 % de las celdas-día de Aqua, frente al 55–58 % con 20–60 minutos.",
  s2T: "Un control bayesiano de tres listas, con rangos del 90 %",
  s2P: "Con dos listas no se sabe si ambos sensores pierden los mismos fuegos. Con tres sí. Un modelo log-lineal bayesiano con Aqua, S-NPP y NOAA-20 encuentra dependencia positiva en cada par, así que nuestro registro es un <b>límite inferior</b>, entre 10 y 15 % bajo según la simulación. Lo informamos con su rango y sin aplicar corrección.",
  s3T: "Un emulador de MODIS para cuando MODIS ya no esté",
  s3P: "Se espera que Terra y Aqua terminen su misión científica en 2027. Un modelo de gradient boosting predice qué celdas-día de VIIRS habría visto MODIS (AUC 0,76; error anual del 3,2 %, 2013–2022), así la serie a escala MODIS continúa. Si apagas MODIS, el registro armonizado no cambia.",
  tResu: "Funciona en años que nunca vio.",
  pResu: "Calibrado en 2013–2020 y probado en 2021–2024. Reconstruimos Perú dos veces, una solo con Aqua y otra solo con VIIRS, y medimos la diferencia anual entre ambas.",
  dNaive: "Sumar detecciones", dElis: "Elis",
  vNaive: "334 %", vElis: "3,8 %",
  duelCap: "Diferencia anual media entre dos reconstrucciones independientes de Perú, años de prueba 2021–2024.",
  regCap: "Diferencia anual por macrorregión",
  thReg: "Región", thElis: "Elis", thNaive: "Sumar detecciones",
  rgAma: "Amazonía", rgAnd: "Andes", rgCos: "Costa",
  vAma: "2,3 %", vAmaN: "361 %", vAnd: "7,0 %", vAndN: "337 %", vCos: "9,0 %", vCosN: "199 %",
  duelNote: "Mide la concordancia entre dos reconstrucciones independientes, no la exactitud frente a un censo de incendios.",
  fcTag: "Pronóstico · probado fuera de muestra",
  fcT: "En julio de 2026 pronosticamos la temporada de agosto a octubre: <b>24.392</b> celdas-día con fuego. Los satélites contaron después <b>22.955</b>.",
  fcAria: "Mediana pronosticada 24.392 con un rango del 90 % de 18.848 a 31.568. Mediana climatológica 27.301 con un rango de 18.224 a 35.565. Observado 22.955, dentro de ambos rangos y más cerca del pronóstico.",
  fcClim: "Climatología",
  fcModel: "Pronóstico de Elis, rango del 90 %",
  fcObs: "Observado",
  fcCap: "Rango 18.848–31.568, emitido con un mes de anticipación. La observación de 2026 viene de datos casi en tiempo real, todavía provisionales. Los pronósticos siempre se muestran aparte de lo observado, en violeta.",
  of20: " de 20",
  ld1: "departamentos donde el pronóstico a un mes le gana a la climatología en una validación 2003–2025 dejando un año fuera. En el resto publicamos la climatología y lo decimos.",
  ld2n: "0,75",
  ld2: "de correlación entre el registro y el área quemada de MapBiomas Fuego, un producto Landsat independiente que nunca usamos para entrenar.",
  resSrc: "Fuentes: <code>data/processed/methodology.json</code> y <code>forecast.json</code> en el repositorio.",
  tTool: "Una herramienta para usar, no solo una cifra.",
  pTool: "Cada mes desde 2000 en un mapa, imágenes satelitales de cualquier día, un pronóstico de la próxima temporada y un asistente que responde con los datos. En inglés y en español.",
  tabsLabel: "Pantallas de la app", trackLabel: "Capturas de la app", prev: "Pantalla anterior", next: "Pantalla siguiente",
  a1: "Vista Explorar de Elis: mapa de Perú en septiembre de 2024 con celdas-día con fuego armonizadas por celda de 11 km y la estimación nacional de 15.520 con su rango del 90 %.",
  a2: "Vista 3D del relieve sobre los Andes del sur en septiembre de 2024, con las celdas de actividad de fuego sobre el terreno.",
  a3: "Imagen infrarroja térmica de NASA GIBS del 10 de septiembre de 2024 con cada detección MODIS y VIIRS.",
  a4: "Imagen satelital en color real de Perú el 10 de septiembre de 2024 con humo y nubes, y las detecciones de fuego.",
  a5: "Vista Comparar: las detecciones crudas saltan al lanzarse los satélites, mientras las celdas-día armonizadas siguen siendo comparables.",
  a6: "Vista Continuidad: un apagado simulado de MODIS en enero de 2023, con Aqua emulado desde VIIRS que continúa la serie a escala MODIS.",
  a7: "Pronóstico de la temporada de agosto a octubre de 2027 por departamento, en violeta, con probabilidades por clase y el rango climatológico nacional.",
  a8: "El asistente Pregúntale a Elis responde sobre las peores temporadas de fuego en la Amazonía, con un gráfico de la actividad anual armonizada.",
  c1: "<b>Explorar.</b> Cualquier mes desde 2000 en el mapa, con la estimación, su rango del 90 % y lo que vio cada sensor.",
  c2: "<b>Relieve 3D.</b> Septiembre de 2024 sobre los Andes: dónde se ubica el fuego en el terreno.",
  c3: "<b>Térmica.</b> Infrarrojo de NASA GIBS del 10 de septiembre de 2024, con cada detección MODIS y VIIRS del día.",
  c4: "<b>Color real.</b> El mismo día visto desde el espacio, humo incluido.",
  c5: "<b>Comparar.</b> Crudo frente a armonizado: activa los satélites según se lanzaron y mira cómo desaparecen los saltos falsos.",
  c6: "<b>Continuidad.</b> Simula el fin de MODIS; el emulador mantiene la escala MODIS.",
  c7: "<b>Pronóstico.</b> La temporada 2027 por departamento, en probabilidades. Climatología donde el modelo no tiene habilidad.",
  c8: "<b>Pregúntale a Elis y HUD de 40 s.</b> Preguntas en lenguaje sencillo y recorrido guiado de 4 misiones en 40 segundos, respondidos con los archivos procesados y las cifras verificadas.",
  tScope: "Qué significan las cifras, y qué no.",
  isH: "Lo que Elis informa",
  is1: "<b>Celdas-día con fuego.</b> Una celda de 0,1°, unos 11 km, en una fecha con al menos una detección.",
  is2: "<b>Un rango en cada estimación.</b> Del 90 %, salvo que se indique otro.",
  is3: "<b>Un límite inferior.</b> Los sensores pierden algunos fuegos a la vez; la simulación sitúa el registro entre 10 y 15 % bajo. Ninguna corrección pasó nuestras pruebas, así que no aplicamos ninguna.",
  is4: "<b>Una confianza que cambia con el tiempo.</b> 2000–2002 se apoya en Terra y en el inicio de Aqua, con rangos amplios; agosto–noviembre de 2026 son datos provisionales casi en tiempo real.",
  notH: "Lo que Elis no afirma",
  not1: "<b>No es un conteo de incendios</b> ni de hectáreas quemadas.",
  not2: "<b>No es un pronóstico disfrazado de dato.</b> Los pronósticos van etiquetados y separados de lo observado.",
  not3: "<b>No es una comprobación contra un censo.</b> La validación mide la concordancia entre reconstrucciones independientes.",
  not4: "<b>No da causas.</b> Elis dice dónde y cuándo la actividad de fuego fue inusual, no por qué.",
  tTeam: "Equipo Log N + 1.",
  pTeam: "Cuatro estudiantes de Lima, cuatro habilidades distintas, 36 horas.",
  roleTm: "Integrante del equipo",
  close: "Estudiantes peruanos. Si funciona aquí, puede funcionar en cualquier lugar.",
  tCred: "Datos y créditos",
  cr1: "Detecciones de fuego activo MODIS y VIIRS",
  cr2: "Imágenes en color real, térmicas y nocturnas",
  cr3: "Precipitación mensual para índices de sequía",
  cr4: "Índice de El Niño–Oscilación del Sur",
  cr5: "Índice Costero El Niño, vía IGP",
  cr6: "Área quemada usada para validar",
  cr7: "Límites departamentales",
  cr8: "Mapa base satelital",
  ai: "<b>Uso de IA.</b> El asistente Pregúntale a Elis usa Google Gemini con respaldo automático de modelos y respuestas locales verificadas sobre nuestros archivos procesados, y cada cifra que devuelve se verifica contra esos archivos antes de mostrarse.",
  foot: "Proyecto de NASA Space Apps Challenge 2026, reto <em>Harmonization of MODIS and VIIRS Hot Spots</em>. No es un producto oficial de la NASA.",
  top: "Volver arriba",
  tipRaw: "Detecciones crudas", tipEst: "Armonizado", tipUnit: "celdas-día", tipRange: "rango del 90 %",
  tReg: "Perú en tres regiones.",
  pReg: "Elis estima la actividad de fuego por región y mes: Costa, Andes y Amazonía. El mapa reproduce cada mes desde 2003 hasta octubre de 2026 con la estimación armonizada de cada región.",
  rgAria: "Mapa de Perú dividido en Costa, Andes y Amazonía, cada una coloreada según sus celdas-día con fuego armonizadas del mes elegido.",
  rgProv: "Provisional, datos casi en tiempo real",
  rgPauseL: "Pausar", rgPlayL: "Reproducir", rgMonth: "Mes",
  rgLow: "Menos", rgHigh: "Más",
  rgUnitIn: "celdas-día con fuego en Perú",
  rgNote: "Cada región se colorea según su propio rango de 2003–2026, así que el color compara meses dentro de una región, no una región con otra. Las cifras son celdas-día con fuego con su rango del 90 %.",
  qs1: "<b>5</b><span>sensores de NASA FIRMS</span>",
  qs2: "<b>0,1°</b><span>grilla por día (≈11 km)</span>",
  qs3: "<b>90 %</b><span>rango en cada estimación</span>",
  qs4: "<b>286</b><span>meses reproducidos, 2003–2026</span>",
  tEmber: "Un historial de fuego que sí se puede comparar.",
  lEmber: "Una historia mensual comparable del fuego en Perú, 2000–2026.",
  langBtn: "EN", langAria: "Switch to English"
};
const EN_EXTRA = { rgPlayL: "Play", rgUnitIn: "fire cell-days in Peru", copied: "Copied", tipRaw: "Raw detections", tipEst: "Harmonized", tipUnit: "fire cell-days", tipRange: "90% range", langBtn: "ES", langAria: "Cambiar a español" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
document.documentElement.classList.add("js");

const EN = { ...EN_EXTRA };
$$("[data-i18n]").forEach(e => { EN[e.dataset.i18n] = e.innerHTML; });
$$("[data-i18n-attr]").forEach(e => e.dataset.i18nAttr.split(";").forEach(p => { const [a, k] = p.split(":"); EN[k] = e.getAttribute(a); }));

let lang = "en";
let regRender = () => {};
const t = k => (lang === "es" ? ES : EN)[k] ?? EN[k] ?? "";
const nf = (v, d = 0) => v.toLocaleString(lang === "es" ? "es-ES" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });
const fmt = v => lang === "es" && v >= 1000 && v < 10000 ? String(v).replace(/(\d)(\d{3})$/, "$1.$2") : nf(v);

function setLang(l, save) {
  lang = l;
  document.documentElement.lang = l;
  $$("[data-i18n]").forEach(e => { const v = t(e.dataset.i18n); if (v) e.innerHTML = v; });
  $$("[data-i18n-attr]").forEach(e => e.dataset.i18nAttr.split(";").forEach(p => { const [a, k] = p.split(":"); const v = t(k); if (v) e.setAttribute(a, v); }));
  $$(".bar-v").forEach(e => { e.textContent = fmt(+e.dataset.n); });
  $$(".fc-ticks span").forEach((e, i) => { e.textContent = fmt([20000, 25000, 30000, 35000][i]); });
  const b = $("#lang");
  b.firstElementChild.textContent = t("langBtn");
  b.setAttribute("aria-label", t("langAria"));
  buildTabs();
  regRender();
  if (save) { try { localStorage.setItem("elis.landing.lang", l); } catch {} }
}

function initialLang() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "es" || q === "en") return q;
    const s = localStorage.getItem("elis.landing.lang");
    if (s === "es" || s === "en") return s;
  } catch {}
  return "en";
}

$("#lang").addEventListener("click", () => setLang(lang === "es" ? "en" : "es", true));

function youTubeId(u) {
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function initVideo() {
  const id = youTubeId(VIDEO_URL);
  if (!id) return;
  const box = $("#vid");
  box.dataset.state = "ready";
  box.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "vid-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", lang === "es" ? "Reproducir el video" : "Play the video");
  btn.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
  btn.innerHTML = '<span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></span>';
  const play = () => {
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    f.title = "Elis demo video";
    f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    f.allowFullscreen = true;
    box.replaceChildren(f);
  };
  btn.addEventListener("click", play);
  box.append(btn);
}

$$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
  const txt = $("#" + b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(txt); } catch {
    const r = document.createRange(); r.selectNodeContents($("#" + b.dataset.copy));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  b.classList.add("done");
  b.setAttribute("aria-label", t("copied"));
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove("done"); b.setAttribute("aria-label", t("copy")); }, 1600);
}));

const track = $("#track");
const shots = $$(".shot", track);
let active = 0;
function buildTabs() {
  const box = $("#tabs");
  box.innerHTML = "";
  shots.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.role = "tab";
    b.id = "tab-" + i;
    b.textContent = lang === "es" ? s.dataset.tabEs : s.dataset.tab;
    b.setAttribute("aria-selected", i === active ? "true" : "false");
    b.tabIndex = i === active ? 0 : -1;
    b.addEventListener("click", () => go(i));
    box.append(b);
  });
}
function go(i, focus) {
  i = Math.max(0, Math.min(shots.length - 1, i));
  const pad = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
  track.scrollTo({ left: shots[i].offsetLeft - pad, behavior: reduce.matches ? "auto" : "smooth" });
  mark(i);
  if (focus) $("#tab-" + i)?.focus();
}
function mark(i) {
  active = i;
  $$(".tab").forEach((b, j) => { b.setAttribute("aria-selected", j === i ? "true" : "false"); b.tabIndex = j === i ? 0 : -1; });
  const tab = $("#tab-" + i);
  if (tab) { const box = $("#tabs"); box.scrollTo({ left: tab.offsetLeft - box.clientWidth / 2 + tab.clientWidth / 2, behavior: "smooth" }); }
  $$(".arrow").forEach(a => { a.disabled = (a.dataset.dir === "-1" && i === 0) || (a.dataset.dir === "1" && i === shots.length - 1); });
}
$("#tabs").addEventListener("keydown", e => {
  if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1, true); }
  if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1, true); }
});
$$(".arrow").forEach(a => a.addEventListener("click", () => go(active + +a.dataset.dir)));
let st;
track.addEventListener("scroll", () => {
  clearTimeout(st);
  st = setTimeout(() => {
    const pad = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
    let best = 0, d = Infinity;
    shots.forEach((s, i) => { const x = Math.abs(s.offsetLeft - pad - track.scrollLeft); if (x < d) { d = x; best = i; } });
    if (best !== active) mark(best);
  }, 90);
}, { passive: true });

function chart() {
  const fig = $("#heroChart"), canvas = $(".hc-canvas", fig), plot = $(".hc-plot", fig), tip = $("#hcTip"), guide = $("#hcGuide");
  const base = ANNUAL.find(r => r[0] === 2011);
  let cur = -1;
  const show = i => {
    if (i < 0) { tip.hidden = true; guide.hidden = true; cur = -1; return; }
    cur = i;
    const [y, raw, est, lo, hi] = ANNUAL[i];
    const x = i / (ANNUAL.length - 1) * 100;
    guide.hidden = false; guide.style.left = x + "%";
    const d = lang === "es" ? "," : ".";
    const r1 = (raw / base[1]).toFixed(1).replace(".", d), r2 = (est / base[2]).toFixed(2).replace(".", d);
    tip.innerHTML = `<b>${y}</b><span class="t-raw">${t("tipRaw")}: ${fmt(raw)} · ×${r1}</span><br><span class="t-est">${t("tipEst")}: ${fmt(est)} ${t("tipUnit")} · ×${r2}</span><br>${t("tipRange")}: ${fmt(lo)}–${fmt(hi)}`;
    tip.hidden = false;
    const w = canvas.clientWidth, tw = tip.offsetWidth, px = x / 100 * w;
    tip.style.left = Math.max(0, Math.min(w - tw, px < w / 2 ? px + 12 : px - tw - 12)) + "px";
  };
  canvas.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    show(Math.round((e.clientX - r.left) / r.width * (ANNUAL.length - 1)));
  });
  canvas.addEventListener("pointerleave", () => show(-1));
  plot.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = cur < 0 ? 9 : cur + (e.key === "ArrowRight" ? 1 : -1);
      show(Math.max(0, Math.min(ANNUAL.length - 1, n)));
    }
    if (e.key === "Escape") show(-1);
  });
  plot.addEventListener("blur", () => show(-1));
  if (!reduce.matches) {
    const r = fig.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) fig.classList.add("play");
  }
}

function reveal() {
  if (reduce.matches || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    if (e.boundingClientRect.top > innerHeight * 0.55) e.target.classList.add("rv-in");
    io.unobserve(e.target);
  }), { rootMargin: "0px 0px -8% 0px" });
  $$("[data-reveal]").forEach(el => {
    if (el.getBoundingClientRect().top > innerHeight) io.observe(el);
  });
}

function navState() {
  const bar = $(".bar");
  const links = $$(".nav a");
  const secs = links.map(a => $(a.getAttribute("href")));
  const on = () => {
    bar.classList.toggle("scrolled", scrollY > 8);
    let k = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < 120) k = i; });
    links.forEach((a, i) => { a.classList.toggle("on", i === k); if (i === k) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  };
  addEventListener("scroll", on, { passive: true });
  on();
}

/* Ribbons: horizontal marquee bands (NASA Space Apps Challenge / challenge name) */
function ribbons() {
  $$("[data-ribbon]").forEach(r => {
    const unit = r.querySelector(".rb-t > span");
    if (!unit) return;
    const n = 10, track = r.querySelector(".rb-t");
    track.innerHTML = "";
    for (let i = 0; i < n * 2; i++) {
      const c = unit.cloneNode(true);
      if (i >= n) c.setAttribute("aria-hidden", "true");
      track.append(c);
    }
    r.querySelectorAll(".rb-t > span").forEach((c, i) => { if (i > 0) c.setAttribute("aria-hidden", "true"); });
  });
}

/* Team cards: soft 3D tilt on hover (fine pointers only) */
function teamTilt() {
  if (reduce.matches || !matchMedia("(hover:hover) and (pointer:fine)").matches) return;
  $$("#team li").forEach(li => {
    li.addEventListener("pointermove", e => {
      const r = li.getBoundingClientRect();
      li.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 14 + "deg");
      li.style.setProperty("--rx", -((e.clientY - r.top) / r.height - .5) * 14 + "deg");
    });
    li.addEventListener("pointerleave", () => { li.style.setProperty("--rx", "0deg"); li.style.setProperty("--ry", "0deg"); });
  });
}

/* Ember circle: decorative glowing disc with orbiting sparks */
function ember() {
  const cv = $("#flame");
  if (!cv) return;
  const sec = cv.parentElement, cx = cv.getContext("2d");
  let W = 0, H = 0, tx = 0, ty = 0, mx = 0, my = 0, vis = true, raf = 0, t0 = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = Array.from({ length: 110 }, () => ({ a: rnd() * 6.283, r: rnd(), s: .2 + rnd() * .6, z: 1 + rnd() * 2 }));
  const size = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * d; cv.height = H * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
  };
  const draw = t => {
    mx += (tx - mx) * .07; my += (ty - my) * .07;
    cx.clearRect(0, 0, W, H);
    const R = Math.min(W, H) * .34, x = W / 2 + mx * 50, y = H / 2 + my * 40, pu = 1 + .03 * Math.sin(t / 500);
    cx.globalCompositeOperation = "lighter";
    cx.globalAlpha = .95;
    let g = cx.createRadialGradient(x, y, R * .1, x, y, R * 2.2 * pu);
    g.addColorStop(0, "rgba(242,113,31,.35)"); g.addColorStop(1, "rgba(210,50,74,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    g = cx.createRadialGradient(x - R * .1, y - R * .1, 0, x, y, R * pu);
    g.addColorStop(0, "rgba(255,214,150,.9)"); g.addColorStop(.35, "rgba(246,140,50,.85)"); g.addColorStop(.75, "rgba(214,60,40,.7)"); g.addColorStop(1, "rgba(88,184,216,.45)");
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, R * pu, 0, 6.283); cx.fill();
    for (const p of P) {
      p.a += reduce.matches ? 0 : .0015 * p.s;
      const d = R * (1.05 + p.r * 1.2 + .08 * Math.sin(t / 700 + p.a * 5));
      cx.fillStyle = p.r < .3 ? "rgba(88,184,216,.7)" : "rgba(255,170,70,.75)";
      cx.beginPath(); cx.arc(x + Math.cos(p.a) * d - mx * 20 * p.z, y + Math.sin(p.a) * d - my * 20 * p.z, p.z, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = "source-over";
  };
  const loop = now => {
    if (!t0) t0 = now;
    if (vis && !document.hidden) draw(now - t0);
    raf = requestAnimationFrame(loop);
  };
  size();
  addEventListener("resize", () => { size(); if (reduce.matches) draw(5000); });
  sec.addEventListener("pointermove", e => { const r = sec.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5; }, { passive: true });
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(sec);
  if (reduce.matches) draw(5000); else raf = requestAnimationFrame(loop);
}

/* Regions map: Costa / Andes / Amazonia shaded by the harmonized monthly estimate (data/series/*.json) */
function regionsMap() {
  const D = window.ELIS_REGIONS, fig = $("#regMap"), svg = fig && $("svg", fig);
  if (!D || !svg) return;
  const IDS = ["costa", "sierra", "amazonia"];
  const NAME = { costa: "rgCos", sierra: "rgAnd", amazonia: "rgAma" };
  const NS = "http://www.w3.org/2000/svg";
  const months = D.series.peru.map(r => r[0] * 12 + r[1] - 1);
  const by = {};
  [...IDS, "peru"].forEach(k => { by[k] = new Map(D.series[k].map(r => [r[0] * 12 + r[1] - 1, r])); });
  const N = months.length;
  const p95 = {};
  [...IDS, "peru"].forEach(k => { const v = D.series[k].map(r => r[2]).sort((a, b) => a - b); p95[k] = v[Math.floor(v.length * .95)] || 1; });
  const STOPS = [[123, 63, 184], [210, 50, 74], [242, 113, 31], [255, 209, 102]];
  const color = v => {
    const t = Math.pow(Math.max(0, Math.min(1, v)), .55) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i;
    return "rgb(" + STOPS[i].map((c, j) => Math.round(c + (STOPS[i + 1][j] - c) * f)).join(",") + ")";
  };
  svg.setAttribute("viewBox", `0 0 ${D.w} ${D.h}`);
  const paths = {};
  IDS.forEach(k => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", D.paths[k]); p.setAttribute("class", "rg rg-" + k); p.setAttribute("fill-rule", "evenodd");
    svg.append(p); paths[k] = p;
  });
  const out = document.createElementNS(NS, "path");
  out.setAttribute("d", D.outline); out.setAttribute("class", "rg-out"); svg.append(out);
  const labels = {};
  IDS.forEach(k => {
    const tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", D.labels[k][0]); tx.setAttribute("y", D.labels[k][1]); tx.setAttribute("aria-hidden", "true");
    svg.append(tx); labels[k] = tx;
  });
  const rows = $("#rgRows");
  rows.innerHTML = IDS.map(k => `<li data-r="${k}"><i class="sw"></i><b></b><span class="tr"><i></i></span><span class="v"></span><small></small></li>`).join("");
  const li = {}; IDS.forEach(k => { li[k] = $(`li[data-r="${k}"]`, rows); });
  const slider = $("#rgRange"), play = $("#rgPlay");
  slider.max = N - 1;
  let idx = months.indexOf(2024 * 12 + 8), playing = false, last = 0, acc = 0, user = false;
  const loc = () => (lang === "es" ? "es-ES" : "en-US");
  const monthName = m => { const x = new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString(loc(), { month: "long", year: "numeric" }); return x.charAt(0).toUpperCase() + x.slice(1); };
  const range = r => `${fmt(r[3])}–${fmt(r[4])}`;
  function render() {
    const m = months[idx], pr = by.peru.get(m), y = Math.floor(m / 12), mo = m % 12 + 1;
    $("#rgDate").textContent = monthName(m);
    $("#rgProv").hidden = !(y === 2026 && mo >= 8);
    $("#rgPeru").textContent = fmt(pr[2]);
    $("#rgPeruU").textContent = `${t("rgUnitIn")} · ${t("tipRange")}: ${range(pr)}`;
    IDS.forEach(k => {
      const r = by[k].get(m), c = color(r[2] / p95[k]);
      paths[k].style.fill = c;
      labels[k].textContent = t(NAME[k]);
      const e = li[k];
      e.style.setProperty("--sw", c); e.style.setProperty("--w", Math.min(100, r[2] / p95[k] * 100).toFixed(1) + "%");
      $("b", e).textContent = t(NAME[k]); $(".v", e).textContent = fmt(r[2]);
      $("small", e).textContent = `${t("tipRange")}: ${range(r)}`;
    });
    slider.value = idx;
    slider.setAttribute("aria-valuetext", `${monthName(m)}: ${fmt(pr[2])} ${t("tipUnit")}`);
  }
  function setPlaying(on) {
    playing = on;
    play.dataset.state = on ? "pause" : "play";
    const l = t(on ? "rgPauseL" : "rgPlayL");
    play.setAttribute("aria-label", l); play.title = l;
  }
  regRender = () => { render(); setPlaying(playing); };
  const tick = now => {
    if (!playing) return;
    if (last && !document.hidden) { acc += now - last; while (acc >= 140) { acc -= 140; idx = (idx + 1) % N; } render(); }
    last = now; requestAnimationFrame(tick);
  };
  const start = () => { if (playing) return; setPlaying(true); last = 0; acc = 0; requestAnimationFrame(tick); };
  const stop = () => { setPlaying(false); };
  play.addEventListener("click", () => { user = true; playing ? stop() : start(); });
  slider.addEventListener("input", () => { user = true; stop(); idx = +slider.value; render(); });
  IDS.forEach(k => {
    const on = () => { svg.dataset.hl = k; paths[k].classList.add("hl"); IDS.forEach(o => li[o].classList.toggle("dim", o !== k)); };
    const off = () => { delete svg.dataset.hl; paths[k].classList.remove("hl"); IDS.forEach(o => li[o].classList.remove("dim")); };
    paths[k].addEventListener("pointerenter", on); paths[k].addEventListener("pointerleave", off);
    li[k].addEventListener("pointerenter", on); li[k].addEventListener("pointerleave", off);
  });
  render(); setPlaying(false);
  if (!reduce.matches && "IntersectionObserver" in window) {
    new IntersectionObserver(es => {
      if (es[0].isIntersecting) { if (!user) { idx = 0; start(); } }
      else if (!user) stop();
    }, { threshold: .35 }).observe(fig);
  }
}

ribbons();
teamTilt();
ember();
regionsMap();
setLang(initialLang(), false);
initVideo();
mark(0);
chart();
reveal();
navState();
