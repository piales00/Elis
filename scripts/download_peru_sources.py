import csv
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from config import (
    BOUNDARY_SOURCE_FILE,
    BOUNDARY_SOURCE_URL,
    COUNTRY,
    MODIS_YEARS,
    RAW_DIR,
    SNPP_YEARS,
)


USER_AGENT = "FireChronos-Peru/1.0"


def download(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
    except urllib.error.HTTPError as error:
        temporary.unlink(missing_ok=True)
        if error.code == 404:
            raise RuntimeError(f"NASA FIRMS aún no publica este archivo: {url}") from error
        raise RuntimeError(f"La descarga falló con HTTP {error.code}: {url}") from error
    except OSError:
        temporary.unlink(missing_ok=True)
        raise
    if destination.suffix == ".csv":
        with temporary.open(encoding="utf-8-sig", newline="") as source:
            header = next(csv.reader(source), [])
        required = {"latitude", "longitude", "acq_date", "type", "confidence"}
        if not required.issubset({column.strip().lower() for column in header}):
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f"La respuesta no parece un CSV FIRMS válido: {url}")
    elif temporary.stat().st_size < 100:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"La respuesta de límites está vacía: {url}")
    temporary.replace(destination)


def download_boundary() -> None:
    if BOUNDARY_SOURCE_FILE.is_file() and BOUNDARY_SOURCE_FILE.stat().st_size > 100:
        return
    BOUNDARY_SOURCE_FILE.parent.mkdir(parents=True, exist_ok=True)
    download(BOUNDARY_SOURCE_URL, BOUNDARY_SOURCE_FILE)


def download_country_csv(product: str, year: int) -> None:
    filename = f"{product}_{year}_{COUNTRY}.csv"
    destination = RAW_DIR / filename
    if destination.is_file() and destination.stat().st_size > 100:
        return
    url = f"https://firms.modaps.eosdis.nasa.gov/data/country/{product}/{year}/{filename}"
    download(url, destination)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    download_boundary()
    products = [("modis", year) for year in MODIS_YEARS]
    products.extend(("viirs-snpp", year) for year in SNPP_YEARS)
    for product, year in products:
        destination = RAW_DIR / f"{product}_{year}_{COUNTRY}.csv"
        if destination.is_file() and destination.stat().st_size > 100:
            print(f"Ya existe: {destination.name}")
            continue
        download_country_csv(product, year)
        print(f"Descargado: {destination.name}")
    print("Los CSV solicitados de NOAA-20/21 se añaden manualmente en data/raw/; los NRT son provisionales.")


if __name__ == "__main__":
    main()
