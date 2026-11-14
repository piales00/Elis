import json

import duckdb

import config


PROVISIONAL_POLYGONS = {
    "amazonia": (
        (-78.3, -2.8),
        (-75.2, 0.0),
        (-75.0, -1.5),
        (-73.1, -2.2),
        (-69.8, -4.2),
        (-70.5, -9.4),
        (-68.6, -12.5),
        (-68.6, -14.3),
        (-72.0, -13.4),
        (-75.3, -10.3),
        (-77.2, -6.2),
    ),
    "sierra": (
        (-80.4, -3.3),
        (-80.0, -4.5),
        (-78.5, -4.5),
        (-78.3, -2.8),
        (-77.2, -6.2),
        (-75.3, -10.3),
        (-72.0, -13.4),
        (-68.6, -14.3),
        (-69.6, -17.5),
        (-73.5, -15.3),
        (-76.2, -11.8),
        (-79.0, -7.5),
    ),
    "costa": (
        (-81.4, -4.7),
        (-80.4, -3.3),
        (-79.0, -7.5),
        (-76.2, -11.8),
        (-73.5, -15.3),
        (-69.6, -17.5),
        (-70.4, -18.5),
        (-75.2, -15.6),
        (-78.7, -10.1),
        (-81.1, -6.2),
    ),
}


def assign_regions(con, table):
    table_name = '"' + table.replace('"', '""') + '"'
    regions_path = config.PROCESSED_DIR / "regions.geojson"
    con.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS region VARCHAR")
    con.execute(f"UPDATE {table_name} SET region = NULL")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE region_points AS
        SELECT DISTINCT lat, lon FROM {table_name}
    """)

    if regions_path.exists():
        con.execute("SET autoinstall_known_extensions = false")
        try:
            con.execute("LOAD spatial")
        except duckdb.Error as error:
            raise RuntimeError(
                "regions.geojson requires a locally installed DuckDB spatial extension; "
                "no download was attempted."
            ) from error
        features = json.loads(regions_path.read_text())["features"]
        polygons = [
            (feature["properties"]["id"], json.dumps(feature["geometry"]))
            for feature in features
            if feature["properties"].get("level") == "macro"
            and feature["properties"].get("id") in config.REGIONS
        ]
        if {region for region, _ in polygons} != set(config.REGIONS):
            raise ValueError("regions.geojson must contain all configured macroregions.")
        con.execute("""
            CREATE OR REPLACE TEMP TABLE region_polygons (
                region VARCHAR, geometry GEOMETRY
            )
        """)
        con.executemany(
            "INSERT INTO region_polygons VALUES (?, ST_GeomFromGeoJSON(?))",
            polygons,
        )
        con.execute("""
            CREATE OR REPLACE TEMP TABLE region_matches AS
            SELECT p.lat, p.lon, min(r.region) AS region
            FROM region_points p
            JOIN region_polygons r ON ST_Covers(r.geometry, ST_Point(p.lon, p.lat))
            GROUP BY p.lat, p.lon
        """)
        print(f"Region source: {regions_path} (macro polygons, DuckDB spatial)")
    else:
        edges = [
            (region, *start, *end)
            for region in config.REGIONS
            for vertices in (PROVISIONAL_POLYGONS[region],)
            for start, end in zip(vertices, vertices[1:] + vertices[:1])
        ]
        con.execute("""
            CREATE OR REPLACE TEMP TABLE region_edges (
                region VARCHAR, x1 DOUBLE, y1 DOUBLE, x2 DOUBLE, y2 DOUBLE
            )
        """)
        con.executemany("INSERT INTO region_edges VALUES (?, ?, ?, ?, ?)", edges)
        con.execute("""
            CREATE OR REPLACE TEMP TABLE region_matches AS
            WITH polygon_hits AS (
                SELECT p.lat, p.lon, e.region,
                    bool_or(
                        (p.lon - e.x1) * (e.y2 - e.y1)
                            = (p.lat - e.y1) * (e.x2 - e.x1)
                        AND p.lon BETWEEN least(e.x1, e.x2) AND greatest(e.x1, e.x2)
                        AND p.lat BETWEEN least(e.y1, e.y2) AND greatest(e.y1, e.y2)
                    ) OR count(*) FILTER (
                        WHERE (e.y1 > p.lat) <> (e.y2 > p.lat)
                        AND p.lon < e.x1 + (p.lat - e.y1)
                            * (e.x2 - e.x1) / nullif(e.y2 - e.y1, 0)
                    ) % 2 = 1 AS inside
                FROM region_points p CROSS JOIN region_edges e
                GROUP BY p.lat, p.lon, e.region
            )
            SELECT lat, lon, min(region) AS region
            FROM polygon_hits WHERE inside
            GROUP BY lat, lon
        """)
        print(
            "Region source: provisional approximate macroregion polygons "
            "(SQL point-in-polygon; approximate borders and elevation zones)"
        )

    con.execute(f"""
        UPDATE {table_name} AS target SET region = matches.region
        FROM region_matches AS matches
        WHERE target.lat = matches.lat AND target.lon = matches.lon
    """)
    for temporary_table in (
        "region_points", "region_matches", "region_edges", "region_polygons"
    ):
        con.execute(f"DROP TABLE IF EXISTS {temporary_table}")
