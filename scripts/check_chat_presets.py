import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'web/src/data/chat-presets.json'


def build():
    sources = {}
    datasets = {}
    for name in ('series', 'forecast', 'methodology', 'continuity'):
        content = (ROOT / f'data/processed/{name}.json').read_bytes()
        sources[name] = hashlib.sha256(content).hexdigest()
        datasets[name] = json.loads(content)
    series = datasets['series']
    methodology = datasets['methodology']
    forecast = datasets['forecast']
    continuity = datasets['continuity']
    ci = round(methodology['params']['ci_level'] * 100)
    assert ci == round(forecast['ci_level'] * 100) == round(continuity['ci_level'] * 100)
    def row(region, year, month):
        return next(r for r in series if r['region'] == region and r['year'] == year and r['month'] == month)
    def n(value):
        return f'{value:,.1f}'
    def estimate(r):
        assert r['est_low'] <= r['estimated'] <= r['est_high']
        return f"{n(r['estimated'])} fire cell-days ({ci}%: {n(r['est_low'])}–{n(r['est_high'])})"
    def chart(region, year):
        return {'chart': 'year_vs_history', 'title': f'{region}: {year}', 'unit': 'fire cell-days', 'region': region, 'highlight_year': year,
                'series': [dict(r, provisional=year == 2026 and r['month'] >= 8 and not r['is_forecast'], partial=year == 2026 and r['month'] == 11) for r in series if r['region'] == region and r['year'] == year]}
    peru = next(r for r in forecast['regions'] if r['region'] == 'peru')
    validation = next(r for r in methodology['validation'] if r['region'] == 'peru')
    sep = row('peru', 2026, 9)
    december = row('peru', 2026, 12)
    assert december['is_forecast']
    early = row('peru', 2000, 11)
    amazon = row('amazonia', 2010, 8)
    old, new = row('peru', 2011, 9), row('peru', 2012, 9)
    totals = {year: sum(r['raw_detections'] for r in series if r['region'] == 'peru' and r['year'] == year and not r['is_forecast']) for year in (2011, 2012)}
    peak = sum(r['estimated'] for r in series if r['region'] == 'peru' and r['year'] == 2026 and r['month'] in forecast['season_months'])
    previous_peak = sum(r['estimated'] for r in series if r['region'] == 'peru' and r['year'] == 2025 and r['month'] in forecast['season_months'])
    oos = next(r for r in forecast['out_of_sample']['rows'] if r['region'] == 'peru' and r['lead'] == 1 and r['kind'] == 'model')
    assert round(peak, 1) == oos['observed']
    delta = (peak / previous_peak - 1) * 100
    median_delta = (peak / peru['hist_median'] - 1) * 100
    print(f'2026 Aug–Oct: {n(peak)}; 2025: {n(previous_peak)}; change {delta:+.1f}%; vs historical median {median_delta:+.1f}%; class {oos["observed_class"]}')
    def rank_years(region, months):
        totals = {year: sum(r['estimated'] for r in series if r['region'] == region and r['year'] == year and r['month'] in months and not r['is_forecast']) for year in range(2003, 2026)}
        return ', '.join(str(year) for year in sorted(totals, key=totals.get, reverse=True)[:3])
    peak_ranking = rank_years('amazonia', forecast['season_months'])
    annual_ranking = rank_years('amazonia', range(1, 13))
    texts = {
        'normal_2026': (
            f"Peru's provisional 2026 August–October season has class {oos['observed_class']}. The seasonal total is {abs(median_delta):.1f}% below the historical median ({n(peru['hist_median'])}) and {delta:.1f}% above 2025. Normal is a percentile class, not equality to the median.\nSeptember 2026: at least {estimate(sep)}. November is partial and December is a separate forecast.",
            f"La temporada provisional agosto–octubre de 2026 en Perú tiene clase {oos['observed_class']}. El total estacional está {abs(median_delta):.1f}% por debajo de la mediana histórica ({n(peru['hist_median'])}) y {delta:.1f}% por encima de 2025. Normal es una clase por percentiles, no igualdad con la mediana.\nSeptiembre de 2026: al menos {estimate(sep)}. Noviembre es parcial y diciembre es un pronóstico separado."),
        'worst_amazon': (
            f"The highest Amazon August–October seasons since 2003 rank {peak_ranking}; full years rank {annual_ranking}. August 2010 illustrates a historical peak month: at least {estimate(amazon)}.\nMonthly peaks, annual totals and seasonal rankings answer different questions. The macroregional series does not identify local causes or land cover.",
            f"Las temporadas agosto–octubre más altas de la Amazonía desde 2003 son {peak_ranking}; los años completos son {annual_ranking}. Agosto de 2010 ilustra un mes de actividad histórica alta: al menos {estimate(amazon)}.\nLos picos mensuales, totales anuales y rankings estacionales responden preguntas diferentes. La serie macrorregional no identifica causas locales ni cobertura del suelo."),
        'jump_2012': (
            f"Raw annual detections rose from {totals[2011]:,} in 2011 to {totals[2012]:,} in 2012 ({totals[2012]/totals[2011]:.1f}×) when VIIRS joined MODIS. This sensor change breaks comparability.\nFor a matched month, September 2011 has at least {estimate(old)}; September 2012 has at least {estimate(new)}. Harmonization corrects detection differences; the remaining change is an estimate, not ground truth.",
            f"Las detecciones anuales crudas pasaron de {totals[2011]:,} en 2011 a {totals[2012]:,} en 2012 ({totals[2012]/totals[2011]:.1f}×) al incorporarse VIIRS a MODIS. El cambio de sensores rompe la comparabilidad.\nPara el mismo mes, septiembre de 2011 tiene al menos {estimate(old)}; septiembre de 2012 tiene al menos {estimate(new)}. La armonización corrige diferencias de detección; el cambio restante es una estimación, no la verdad absoluta."),
        'conf_pre2003': (
            f"The pre-2003 record has low confidence because the early Terra observations require a statistical bridge to Aqua. The year 2000 includes only November and December.\nNovember 2000 in Peru: at least {estimate(early)}. The wide range is essential; the historical classification baseline starts in 2003.",
            f"El registro anterior a 2003 tiene baja confianza porque las primeras observaciones de Terra requieren un puente estadístico hacia Aqua. El año 2000 incluye solo noviembre y diciembre.\nNoviembre de 2000 en Perú: al menos {estimate(early)}. El rango amplio es esencial; la base histórica de clasificación empieza en 2003."),
        'forecast_next': (
            f"Forecast, separate from observed activity: Peru's August–October {forecast['target_year']} outlook is {n(peru['median'])} fire cell-days ({ci}% forecast range: {n(peru['low'])}–{n(peru['high'])}), initialized in {forecast['origin']}.\nThe separate December 2026 monthly forecast is {estimate(december)}. Published seasonal method: {peru['method']}; no model skill over climatology at this lead. This outlook can inform preparedness planning; it is not an operational recommendation.",
            f"Pronóstico separado de lo observado: la perspectiva de agosto–octubre de {forecast['target_year']} para Perú es {n(peru['median'])} fire cell-days (rango de pronóstico al {ci}%: {n(peru['low'])}–{n(peru['high'])}), con origen {forecast['origin']}.\nEl pronóstico mensual separado de diciembre de 2026 es {estimate(december)}. Método estacional publicado: {peru['method']}; el modelo no supera la climatología a esta anticipación. Puede informar la planificación de preparación; no es una recomendación operativa."),
        'compare_naive': (
            f"In the held-out validation, the naive sum's mean error is {validation['error_pct_naive']:.1f}% versus {validation['error_pct_method']:.1f}% for the harmonized method. These are validation metrics, not the size of the 2012 jump.\nThe emulator offers a MODIS-equivalent comparison and a continuity scenario after MODIS. Its uncertainty and drift limits remain visible; neither product identifies causes or burned area.",
            f"En la validación reservada, el error medio de la suma ingenua es {validation['error_pct_naive']:.1f}% frente a {validation['error_pct_method']:.1f}% del método armonizado. Son métricas de validación, no el tamaño del salto de 2012.\nEl emulador ofrece una comparación equivalente MODIS y un escenario de continuidad tras MODIS. Sus límites de incertidumbre y deriva siguen visibles; ninguno identifica causas ni área quemada."),
    }
    chart_keys = {'normal_2026': ('peru', 2026), 'worst_amazon': ('amazonia', 2010), 'jump_2012': ('peru', 2012), 'compare_naive': ('peru', 2024), 'forecast_next': ('peru', 2026)}
    presets = {key: {'en': en, 'es': es, 'chart': chart(*chart_keys[key]) if key in chart_keys else None} for key, (en, es) in texts.items()}
    c = next(r for r in continuity['rows'] if r['region'] == 'sierra' and r['month'] == '2024-08')
    assert c['aqua_emulated_low'] <= c['aqua_emulated'] <= c['aqua_emulated_high']
    continuity_text = {
        'en': f"The emulator reconstructs a MODIS-equivalent record from VIIRS. {c['region']}, {c['month']}: {n(c['aqua_emulated'])} fire cell-days ({ci}%: {n(c['aqua_emulated_low'])}–{n(c['aqua_emulated_high'])}). This scenario separates the MODIS scale from the harmonized record; examine uncertainty and drift before interpreting continuity.",
        'es': f"El emulador reconstruye un registro equivalente MODIS desde VIIRS. {c['region']}, {c['month']}: {n(c['aqua_emulated'])} fire cell-days ({ci}%: {n(c['aqua_emulated_low'])}–{n(c['aqua_emulated_high'])}). El escenario separa la escala MODIS del registro armonizado; revisa incertidumbre y deriva antes de interpretar la continuidad."
    }
    continuity_text['chart'] = {
        'chart': 'year_vs_history', 'title': 'Sierra: MODIS-equivalent emulator, 2024', 'unit': 'fire cell-days', 'region': 'sierra', 'highlight_year': 2024,
        'series': [{'year': 2024, 'month': int(r['month'][-2:]), 'estimated': r['aqua_emulated'], 'est_low': r['aqua_emulated_low'], 'est_high': r['aqua_emulated_high'], 'is_forecast': False} for r in continuity['rows'] if r['region'] == 'sierra' and r['month'].startswith('2024-')]
    }
    presets["about_elis"] = {'en': 'Elis helps you explore a comparable history of fire in Peru by harmonizing MODIS and VIIRS satellite detections. Their different pixel sizes and detection capabilities create an artificial jump when raw records are combined. Explore the harmonized record with uncertainty ranges, compare the sensors, and inspect continuity after MODIS. Activity is measured in fire cell-days, not individual fires or hectares. Seasonal outlooks are shown separately from observations.', 'es': 'Elis permite explorar una historia comparable del fuego en Perú al armonizar las detecciones satelitales MODIS y VIIRS. Sus distintos tamaños de píxel y capacidades de detección producen un salto artificial al combinar los registros crudos. Explora el registro armonizado con rangos de incertidumbre, compara sensores y revisa la continuidad tras MODIS. La actividad se mide en celdas-día con fuego, no en incendios individuales ni hectáreas. Los pronósticos se muestran separados de las observaciones.', 'chart': None}
    return {'sources': sources, 'presets': presets, 'continuity': continuity_text}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.write:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        assert json.loads(OUTPUT.read_text()) == result, 'Saved answers differ from processed data; run with --write.'
    print('All saved answer figures and chart rows match processed datasets.')


if __name__ == '__main__':
    main()
