#!/usr/bin/env python3
"""Seezeichen der Schlei aus OSM backen → seamarks.json (GeoJSON).

Tonnen, Baken und Leuchtfeuer im Revier-Bbox; IALA-A-Farben werden
beim Backen abgeleitet, damit hero3d nur noch stylen muss.
Nur Bake-Zeit (requests); Ausgabe wird committet.
Daten © OpenStreetMap-Mitwirkende (ODbL) — nicht zur Navigation.
"""
import json, requests

BBOX = '54.4,9.4,54.8,10.2'
TYPES = ('buoy_lateral', 'buoy_cardinal', 'buoy_isolated_danger', 'buoy_special_purpose',
         'beacon_lateral', 'beacon_special_purpose', 'light_minor', 'light_major')

q = f"""[out:json][timeout:120];
(
{''.join(f'node["seamark:type"="{t}"]({BBOX});' for t in TYPES)}
);
out;"""
r = requests.post('https://overpass-api.de/api/interpreter', data=q.encode(),
                  headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}, timeout=180)
r.raise_for_status()

def colour_for(tags):
    kind = tags.get('seamark:type', '')
    cat = (tags.get(f'seamark:{kind}:category') or '')
    if kind.startswith('light'):
        return '#ffd97a'
    if 'lateral' in kind:
        return '#d03b3b' if cat == 'port' else '#0ca30c' if cat == 'starboard' else '#fab219'
    if 'isolated_danger' in kind:
        return '#d03b3b'
    return '#fab219'                       # cardinal / special_purpose

def icon_for(tags):
    """Sprite-Name fuer die Seekarten-Symbolik in hero3d."""
    kind = tags.get('seamark:type', '')
    cat = (tags.get(f'seamark:{kind}:category') or '')
    if kind.startswith('light'):
        return 'sm-light'
    if kind == 'buoy_lateral':
        return 'sm-buoy-port' if cat == 'port' else 'sm-buoy-stb' if cat == 'starboard' else 'sm-buoy-special'
    if kind == 'buoy_cardinal':
        return f'sm-card-{cat[:1]}' if cat[:1] in 'nsew' else 'sm-card-n'
    if kind == 'buoy_isolated_danger':
        return 'sm-danger'
    if kind == 'buoy_special_purpose':
        return 'sm-buoy-special'
    if kind == 'beacon_lateral':
        return 'sm-bcn-port' if cat == 'port' else 'sm-bcn-stb' if cat == 'starboard' else 'sm-bcn-special'
    return 'sm-bcn-special'                    # beacon_special_purpose

feats = []
for el in r.json()['elements']:
    tags = el.get('tags', {})
    kind = tags.get('seamark:type', '')
    name = tags.get('seamark:name') or tags.get('name') or ''
    feats.append({
        'type': 'Feature',
        'properties': {'kind': kind, 'name': name, 'colour': colour_for(tags),
                       'icon': icon_for(tags), 'light': kind.startswith('light')},
        'geometry': {'type': 'Point', 'coordinates': [round(el['lon'], 6), round(el['lat'], 6)]},
    })

json.dump({'type': 'FeatureCollection', 'features': feats},
          open('seamarks.json', 'w'), separators=(',', ':'), ensure_ascii=False)
kinds = {}
for f in feats:
    kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
print(len(feats), 'Seezeichen:', kinds)
