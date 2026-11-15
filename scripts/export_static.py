import json
import shutil

import duckdb

import config


MAP_COLUMNS = ("raw_terra", "raw_aqua", "raw_modis", "raw_viirs", "raw_viirs_noaa20", "raw_viirs_noaa21")
REGION_CODES = {region: region[0] for region in config.REGIONS}
COPIED = ("series.json", "regions.geojson", "methodology.json", "forecast.json", "continuity.json")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as target:
        json.dump(value, target, ensure_ascii=False, separators=(",", ":"))


def copy_files(out):
    for name in COPIED:
        shutil.copyfile(config.PROCESSED_DIR / name, out / name)
    with (config.PROCESSED_DIR / "series.json").open(encoding="utf-8") as source:
        series = json.load(source)
    rows = series["data"] if isinstance(series, dict) else series
    for region in sorted({row["region"] for row in rows}):
        selected = sorted((row for row in rows if row["region"] == region), key=lambda row: (row["year"], row["month"]))
        write_json(out / "series" / f"{region}.json", selected)
    live = out / "live"
    live.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(config.LIVE_DIR / "scoreboard.json", live / "scoreboard.json")
    predictions = sorted((config.LIVE_DIR / "predictions").glob("*.json"))
    if predictions:
        shutil.copyfile(predictions[-1], live / "latest_prediction.json")
    else:
        write_json(live / "latest_prediction.json", None)


def encode_counts(values):
    alphabet = config.STATIC_MAP_ALPHABET
    if all(value is None for value in values):
        return None
    if any(value is not None and not 0 <= value < len(alphabet) for value in values):
        raise ValueError("A day count does not fit in one character.")
    return "".join("-" if value is None else alphabet[value] for value in values)


def encode_month(frame, origin):
    lat0, lon0, width = origin
    step = round(config.GRID_DEG * 100)
    lat = (frame["lat"] * 100).round().astype(int)
    lon = (frame["lon"] * 100).round().astype(int)
    keys = ((lat - lat0) // step) * width + (lon - lon0) // step
    deltas = keys.diff().fillna(keys.iloc[0]).astype(int).tolist()
    return {
        "k": deltas,
        "r": "".join(REGION_CODES[region] for region in frame["region"]),
        **{column: encode_counts([None if value is None or value != value else int(value) for value in frame[column].astype(object).where(frame[column].notna(), None)]) for column in MAP_COLUMNS},
        "e": (frame["estimated"] * 100).round().astype(int).tolist(),
    }


def export_map(out):
    con = duckdb.connect()
    path = str(config.PROCESSED_DIR / "map.parquet")
    frame = con.execute(
        "SELECT year, month, lat, lon, region, " + ", ".join(MAP_COLUMNS) + ", estimated "
        "FROM read_parquet(?) ORDER BY year, month, lat, lon", [path]).df()
    step = round(config.GRID_DEG * 100)
    lat0 = int((frame["lat"] * 100).round().min())
    lon0 = int((frame["lon"] * 100).round().min())
    width = int(((frame["lon"] * 100).round().max() - lon0) // step) + 1
    target = out / "map"
    if target.exists():
        shutil.rmtree(target)
    months = []
    for (year, month), group in frame.groupby(["year", "month"], sort=True):
        key = f"{year:04d}-{month:02d}"
        months.append(key)
        write_json(target / f"{key}.json", encode_month(group.reset_index(drop=True), (lat0, lon0, width)))
    write_json(target / "index.json", {
        "format": config.STATIC_MAP_FORMAT,
        "lat0": lat0, "lon0": lon0, "step": step, "width": width,
        "alphabet": config.STATIC_MAP_ALPHABET,
        "regions": {code: region for region, code in REGION_CODES.items()},
        "columns": list(MAP_COLUMNS),
        "months": months,
    })
    return frame


def check(out, frame):
    index = json.loads((out / "map" / "index.json").read_text(encoding="utf-8"))
    alphabet = index["alphabet"]
    totals = frame.groupby(["year", "month"]).agg(n=("lat", "size"), est=("estimated", "sum"), viirs=("raw_viirs", "sum"),
                                                  modis=("raw_modis", "sum"), n20=("raw_viirs_noaa20", "sum"))
    for (year, month), row in totals.iterrows():
        data = json.loads((out / "map" / f"{year:04d}-{month:02d}.json").read_text(encoding="utf-8"))
        def total(column):
            text = data[column]
            return 0 if text is None else sum(alphabet.index(c) for c in text if c != "-")
        found = (len(data["k"]), sum(data["e"]) / 100, total("raw_viirs"), total("raw_modis"), total("raw_viirs_noaa20"))
        expected = (row["n"], row["est"], row["viirs"], row["modis"], row["n20"])
        if found[0] != expected[0] or abs(found[1] - expected[1]) > 0.01 or found[2:] != tuple(int(v) for v in expected[2:]):
            raise ValueError(f"Map snapshot mismatch in {year}-{month:02d}: {found} vs {expected}")
    return len(totals)


def main():
    out = config.STATIC_EXPORT_DIR
    out.mkdir(parents=True, exist_ok=True)
    copy_files(out)
    frame = export_map(out)
    months = check(out, frame)
    files = [path for path in out.rglob("*") if path.is_file()]
    size = sum(path.stat().st_size for path in files)
    print(f"{out}: {len(files)} files, {size / 1e6:.1f} MB, {months} map months checked against map.parquet")


if __name__ == "__main__":
    main()
