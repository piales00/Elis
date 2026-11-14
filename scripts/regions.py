import json

import pyarrow as pa
from shapely.geometry import shape
from shapely.strtree import STRtree

import config
from build_peru_data import load_departments, macroregion_for_cell


def regions_geojson_departments():
    path = config.PROCESSED_DIR / "regions.geojson"
    if not path.exists():
        raise FileNotFoundError(
            "Missing department boundaries: run scripts/download_peru_sources.py "
            "or provide data/processed/regions.geojson."
        )
    departments = [
        {
            "id": feature["properties"]["id"],
            "macroregion": feature["properties"]["macroregion"],
            "polygon": shape(feature["geometry"]),
        }
        for feature in json.loads(path.read_text())["features"]
        if feature["properties"].get("macroregion") in config.REGIONS
    ]
    expected = len(set().union(*config.MACROREGION_DEPARTMENTS.values()))
    if len(departments) != expected:
        raise ValueError(f"regions.geojson must contain {expected} departmental units, found {len(departments)}.")
    return sorted(departments, key=lambda department: department["id"])


def load_region_departments():
    if config.BOUNDARY_SOURCE_FILE.is_file():
        print(f"Region source: {config.BOUNDARY_SOURCE_FILE} (unsimplified departments, largest area share)")
        return load_departments()
    print("Region source: data/processed/regions.geojson (simplified departments, largest area share)")
    return regions_geojson_departments()


def assign_regions(con, table):
    table_name = '"' + table.replace('"', '""') + '"'
    departments = load_region_departments()
    tree = STRtree([department["polygon"] for department in departments])
    cache = {}
    cells = con.execute(f"SELECT DISTINCT cell_y, cell_x FROM {table_name}").fetchall()
    rows = [
        {"cell_y": cell_y, "cell_x": cell_x,
         "region": macroregion_for_cell(cell_y, cell_x, tree, departments, cache)}
        for cell_y, cell_x in cells
    ]
    con.register("region_matches_arrow", pa.Table.from_pylist(
        rows, schema=pa.schema([("cell_y", pa.int32()), ("cell_x", pa.int32()), ("region", pa.string())])))
    con.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS region VARCHAR")
    con.execute(f"""
        UPDATE {table_name} AS target SET region = matches.region
        FROM region_matches_arrow AS matches
        WHERE target.cell_y = matches.cell_y AND target.cell_x = matches.cell_x
    """)
    con.unregister("region_matches_arrow")
