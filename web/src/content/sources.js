export const DATA_SOURCES = [
  { key: "firms", url: "https://firms.modaps.eosdis.nasa.gov/" },
  { key: "gibs", url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" },
  { key: "eox", url: "https://s2maps.eu" },
  { key: "terrain", url: "https://registry.opendata.aws/terrain-tiles/" },
  { key: "live", url: "https://github.com/piales00/elis-live" },
  { key: "gemini", url: "https://ai.google.dev/gemini-api/docs/models" },
  { key: "power", url: "https://power.larc.nasa.gov/" },
  { key: "oni", url: "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" },
  { key: "icen", url: "http://met.igp.gob.pe/datos/icen.html" },
  { key: "mapbiomas", url: "https://peru.mapbiomas.org/" },
  { key: "inei", url: "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/Limites_Politicos_Administrativos/MapServer" },
  { key: "basemap", url: "https://openfreemap.org/" },
  { key: "osm", url: "https://www.openstreetmap.org/copyright" },
  { key: "zheng", url: "https://doi.org/10.3390/rs18101650" },
];

export const SOFTWARE = [
  { name: "MapLibre GL JS", url: "https://maplibre.org/" },
  { name: "React", url: "https://react.dev/" },
  { name: "Vite", url: "https://vite.dev/" },
  { name: "Tailwind CSS", url: "https://tailwindcss.com/" },
  { name: "FastAPI", url: "https://fastapi.tiangolo.com/" },
  { name: "DuckDB", url: "https://duckdb.org/" },
  { name: "scikit-learn", url: "https://scikit-learn.org/" },
  { name: "NumPyro / JAX", url: "https://num.pyro.ai/" },
  { name: "Inter / Manrope (Google Fonts)", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" },
  { name: "Python", url: "https://www.python.org/" },
];

export const STEPS = ["sensors", "unit", "capture", "check", "validate", "range"];
export const LIMITS = ["unit", "together", "terra", "regions", "forecast"];
