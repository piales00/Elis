import sys
import duckdb

raw = sys.argv[1]
con = duckdb.connect()

con.execute(f"""
CREATE TABLE det AS
SELECT 'MODIS' AS sensor, satellite AS sat, latitude AS lat, longitude AS lon,
       CAST(acq_date AS DATE) AS d, daynight, CAST(type AS INT) AS type,
       CAST(confidence AS VARCHAR) AS conf, frp
FROM read_csv('{raw}/modis_*_Peru.csv', all_varchar=true, union_by_name=true)
UNION ALL
SELECT 'VIIRS', 'SNPP', latitude, longitude, CAST(acq_date AS DATE), daynight,
       CAST(type AS INT), CAST(confidence AS VARCHAR), frp
FROM read_csv('{raw}/viirs-snpp_*_Peru.csv', all_varchar=true, union_by_name=true)
""")
con.execute("ALTER TABLE det ALTER lat TYPE DOUBLE; ALTER TABLE det ALTER lon TYPE DOUBLE")

con.execute("""
CREATE TABLE f AS
SELECT *, year(d) AS y, month(d) AS m,
       floor(lat*10)::INT AS gy, floor(lon*10)::INT AS gx,
       CASE
         WHEN lat BETWEEN -10 AND -7 AND lon BETWEEN -75.5 AND -73 THEN 'Amazonia (Ucayali)'
         WHEN lat BETWEEN -15.5 AND -13.5 AND lon BETWEEN -72.5 AND -70.5 THEN 'Sierra sur (Cusco-Puno)'
         WHEN lat BETWEEN -8.2 AND -6.5 AND lon BETWEEN -79.9 AND -79.0 THEN 'Costa norte (cana)'
         ELSE 'Resto'
       END AS zona
FROM det
WHERE (sensor='MODIS' AND TRY_CAST(conf AS INT) >= 30)
   OR (sensor='VIIRS' AND conf IN ('n','h'))
""")

def show(title, q):
    print(f"\n=== {title} ===")
    print(con.sql(q))

show("Tipos de deteccion (type) por sensor, sin filtrar", """
SELECT sensor, type, count(*) n FROM det GROUP BY ALL ORDER BY sensor, type""")

show("Serie anual nacional (solo vegetacion type=0)", """
WITH v AS (SELECT * FROM f WHERE type=0)
SELECT y,
  count(*) FILTER (sensor='MODIS') AS modis_det,
  count(*) FILTER (sensor='VIIRS') AS viirs_det,
  count(*) AS ingenuo_suma,
  count(DISTINCT (gy,gx,d)) FILTER (sat='Aqua') AS aqua_celdas_dia,
  count(DISTINCT (gy,gx,d)) FILTER (sat='SNPP') AS snpp_celdas_dia
FROM v WHERE y <= 2025 GROUP BY y ORDER BY y""")

show("Razon SNPP/Aqua en celdas-dia por zona (2013-2024, type=0)", """
WITH c AS (
  SELECT zona, y, sat, count(DISTINCT (gy,gx,d)) cd
  FROM f WHERE type=0 AND y BETWEEN 2013 AND 2024 AND sat IN ('Aqua','SNPP')
  GROUP BY ALL)
SELECT zona,
  sum(cd) FILTER (sat='Aqua') aqua,
  sum(cd) FILTER (sat='SNPP') snpp,
  round(sum(cd) FILTER (sat='SNPP') / sum(cd) FILTER (sat='Aqua'), 2) razon_celdas,
  round(median(r),2) mediana_razon_anual,
  round(min(r),2) min_anual, round(max(r),2) max_anual
FROM c LEFT JOIN (
  SELECT zona, y,
    (count(DISTINCT (gy,gx,d)) FILTER (sat='SNPP'))::DOUBLE /
    nullif(count(DISTINCT (gy,gx,d)) FILTER (sat='Aqua'),0) r
  FROM f WHERE type=0 AND y BETWEEN 2013 AND 2024 GROUP BY ALL) USING (zona, y)
GROUP BY zona ORDER BY zona""")

show("Razon de DETECCIONES crudas SNPP/Aqua por zona (2013-2024)", """
SELECT zona,
  round((count(*) FILTER (sat='SNPP'))::DOUBLE / count(*) FILTER (sat='Aqua'),2) razon_det
FROM f WHERE type=0 AND y BETWEEN 2013 AND 2024 GROUP BY zona ORDER BY zona""")

show("Calendario: % de celdas-dia MODIS por mes y zona (2001-2024, type=0)", """
WITH c AS (
  SELECT zona, m, count(DISTINCT (gy,gx,d,sat)) cd
  FROM f WHERE sensor='MODIS' AND type=0 AND y BETWEEN 2001 AND 2024 GROUP BY ALL)
PIVOT (SELECT zona, m, round(100.0*cd/sum(cd) OVER (PARTITION BY zona),1) pct FROM c)
ON m USING first(pct) GROUP BY zona ORDER BY zona""")

show("Calendario VIIRS SNPP: % celdas-dia por mes y zona (2013-2024)", """
WITH c AS (
  SELECT zona, m, count(DISTINCT (gy,gx,d)) cd
  FROM f WHERE sat='SNPP' AND type=0 AND y BETWEEN 2013 AND 2024 GROUP BY ALL)
PIVOT (SELECT zona, m, round(100.0*cd/sum(cd) OVER (PARTITION BY zona),1) pct FROM c)
ON m USING first(pct) GROUP BY zona ORDER BY zona""")

show("% nocturno por sensor y zona (type=0, 2013-2024)", """
SELECT zona, sat,
  round(100.0*count(*) FILTER (daynight='N')/count(*),1) pct_noche, count(*) n
FROM f WHERE type=0 AND y BETWEEN 2013 AND 2024 GROUP BY ALL ORDER BY zona, sat""")

show("Ano pico y meses pico (Aqua celdas-dia, nacional)", """
SELECT y, m, count(DISTINCT (gy,gx,d)) cd FROM f
WHERE sat='Aqua' AND type=0 GROUP BY ALL ORDER BY cd DESC LIMIT 8""")
