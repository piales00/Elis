from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
COUNTRY = "Peru"
REGION_ID = "peru"
REGION_NAME = "Perú"
MACROREGION_NAMES = {"amazonia": "Amazonía", "sierra": "Sierra", "costa": "Costa"}
MACROREGION_DEPARTMENTS = {
    "amazonia": {"AMAZONAS", "LORETO", "MADRE DE DIOS", "SAN MARTIN", "UCAYALI"},
    "sierra": {
        "ANCASH",
        "APURIMAC",
        "AREQUIPA",
        "AYACUCHO",
        "CAJAMARCA",
        "CUSCO",
        "HUANCAVELICA",
        "HUANUCO",
        "JUNIN",
        "PASCO",
        "PUNO",
    },
    "costa": {"CALLAO", "ICA", "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "MOQUEGUA", "PIURA", "TACNA", "TUMBES"},
}
DEPARTMENT_DISPLAY_NAMES = {
    "ANCASH": "Áncash",
    "APURIMAC": "Apurímac",
    "HUANUCO": "Huánuco",
    "JUNIN": "Junín",
    "SAN MARTIN": "San Martín",
}
GRID_DEG = 0.1
BOUNDARY_SIMPLIFICATION_DEG = 0.001
MIN_YEAR = 2000
MAX_YEAR = 2025
MODIS_CONFIDENCE_MIN = 30
VIIRS_CONFIDENCE_ACCEPTED = {"n", "h"}
VEGETATION_TYPE = "0"
MODIS_YEARS = range(2000, 2026)
SNPP_YEARS = range(2012, 2026)
BOUNDARY_SOURCE_URL = (
    "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/"
    "Limites_Politicos_Administrativos/MapServer/0/query"
    "?where=1%3D1&outFields=IDDPTO%2CNOMBDEP%2CNOMBDEPID%2CDOCREG%2CFECREG%2COBSERV"
    "&returnGeometry=true&outSR=4326&f=geojson"
)
BOUNDARY_SOURCE_NAME = "INEI, límites censales referenciales publicados en el servicio de SERFOR"
BOUNDARY_SOURCE_FILE = RAW_DIR / "departamentos_peru_fuente.geojson"
