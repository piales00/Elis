import sys
import duckdb

raw = sys.argv[1]
con = duckdb.connect()

ZONA = """
CASE
  WHEN lat BETWEEN -10 AND -7 AND lon BETWEEN -75.5 AND -73 THEN 'Amazonia (Ucayali)'
  WHEN lat BETWEEN -15.5 AND -13.5 AND lon BETWEEN -72.5 AND -70.5 THEN 'Sierra sur (Cusco-Puno)'
  WHEN lat BETWEEN -8.2 AND -6.5 AND lon BETWEEN -79.9 AND -79.0 THEN 'Costa norte (cana)'
  ELSE 'Resto'
END"""

con.execute(f"""
CREATE TABLE aqua AS
SELECT DISTINCT floor(lat*10)::INT gy, floor(lon*10)::INT gx, d, dn, year(d) y, month(d) m, {ZONA} zona
FROM (SELECT latitude::DOUBLE lat, longitude::DOUBLE lon, acq_date::DATE d, daynight dn
      FROM read_csv('{raw}/modis_*_Peru.csv', all_varchar=true)
      WHERE satellite='Aqua' AND type='0' AND confidence::INT >= 30)
""")
con.execute(f"""
CREATE TABLE snpp AS
SELECT floor(lat*10)::INT gy, floor(lon*10)::INT gx, d, dn, year(d) y, month(d) m, {ZONA} zona, count(*) n
FROM (SELECT latitude::DOUBLE lat, longitude::DOUBLE lon, acq_date::DATE d, daynight dn
      FROM read_csv('{raw}/viirs-snpp_*_Peru.csv', all_varchar=true)
      WHERE type='0' AND confidence IN ('n','h'))
GROUP BY ALL
""")

con.execute("""
CREATE TABLE union_cd AS
SELECT coalesce(a.gy,s.gy) gy, coalesce(a.gx,s.gx) gx, coalesce(a.d,s.d) d, coalesce(a.dn,s.dn) dn,
       coalesce(a.y,s.y) y, coalesce(a.m,s.m) m, coalesce(a.zona,s.zona) zona,
       a.gy IS NOT NULL en_aqua, s.gy IS NOT NULL en_snpp, s.n
FROM aqua a FULL JOIN snpp s USING (gy,gx,d,dn)
WHERE coalesce(a.y,s.y) BETWEEN 2013 AND 2024
""")

con.execute("""
CREATE TABLE estratos AS
SELECT zona, m,
  count(*) FILTER (en_aqua) n_aqua,
  count(*) FILTER (en_snpp) n_snpp,
  count(*) FILTER (en_aqua AND en_snpp) ambos,
  (count(*) FILTER (en_aqua)+1)*(count(*) FILTER (en_snpp)+1)/(count(*) FILTER (en_aqua AND en_snpp)+1)-1 n_chapman
FROM union_cd GROUP BY ALL
""")

def show(t, q):
    print(f"\n=== {t} ===")
    print(con.sql(q))

show("Captura-recaptura por zona (2013-2024, suma de estratos zona x mes)", """
SELECT zona, sum(n_aqua) aqua, sum(n_snpp) snpp, sum(ambos) ambos, round(sum(n_chapman)) fuego_estimado,
  round(100*sum(n_aqua)/sum(n_chapman),1) pct_visto_modis,
  round(100*sum(n_snpp)/sum(n_chapman),1) pct_visto_viirs,
  round(100*(sum(n_chapman)-(sum(n_aqua)+sum(n_snpp)-sum(ambos)))/sum(n_chapman),1) pct_invisible
FROM estratos GROUP BY zona ORDER BY zona""")

show("Desacuerdo como sensor: % que Aqua tambien ve segun tamano en VIIRS", """
SELECT zona,
  round(100*avg(en_aqua::INT) FILTER (n=1),1) p_1,
  round(100*avg(en_aqua::INT) FILTER (n BETWEEN 2 AND 3),1) p_2_3,
  round(100*avg(en_aqua::INT) FILTER (n BETWEEN 4 AND 10),1) p_4_10,
  round(100*avg(en_aqua::INT) FILTER (n>10),1) p_mas10,
  round(avg(n) FILTER (en_snpp),2) puntos_viirs_promedio
FROM union_cd WHERE en_snpp GROUP BY zona ORDER BY zona""")

con.execute("""
CREATE TABLE p AS SELECT zona, m, sum(n_aqua)/sum(n_chapman) p_modis FROM estratos GROUP BY ALL
""")

show("Serie nacional: MODIS crudo, suma ingenua y fuego estimado (celdas-dia)", """
WITH a AS (SELECT y, zona, m, count(*) c FROM aqua WHERE y BETWEEN 2003 AND 2025 GROUP BY ALL),
     s AS (SELECT y, count(*) c FROM snpp GROUP BY y),
     est AS (SELECT a.y, sum(a.c / p.p_modis) e FROM a JOIN p USING (zona, m) GROUP BY a.y)
SELECT a2.y, a2.aqua, coalesce(s.c,0)+a2.aqua AS suma_ingenua, round(est.e) fuego_estimado
FROM (SELECT y, sum(c) aqua FROM a GROUP BY y) a2
LEFT JOIN s USING (y) JOIN est USING (y) ORDER BY y""")

show("Validacion: calibrar 2013-2018, predecir 2019-2024 vs Chapman del propio ano", """
WITH cal AS (
  SELECT zona, m, sum(en_aqua::INT)::DOUBLE n1, sum(en_snpp::INT)::DOUBLE n2, sum((en_aqua AND en_snpp)::INT)::DOUBLE mm
  FROM union_cd WHERE y BETWEEN 2013 AND 2018 GROUP BY ALL),
pc AS (SELECT zona, m, n1/((n1+1)*(n2+1)/(mm+1)-1) p FROM cal),
yr AS (
  SELECT y, zona, m, sum(en_aqua::INT) n1, sum(en_snpp::INT) n2, sum((en_aqua AND en_snpp)::INT) mm
  FROM union_cd WHERE y BETWEEN 2019 AND 2024 GROUP BY ALL),
r AS (
  SELECT y, sum((n1+1)*(n2+1)/(mm+1)-1) real_chapman, sum(n1/pc.p) predicho
  FROM yr JOIN pc USING (zona, m) GROUP BY y)
SELECT y, round(real_chapman) chapman, round(predicho) recaptura_predicha,
  round(100*(predicho-real_chapman)/real_chapman,1) err_pct
FROM r ORDER BY y""")
