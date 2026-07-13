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

def glyph_for(tags):
    """Seekarten-Glyphe: Stumpftonne (Backbord) vs. Spitztonne (Steuerbord)."""
    kind = tags.get('seamark:type', '')
    cat = (tags.get(f'seamark:{kind}:category') or '')
    if kind.startswith('light'):
        return '✦'
    if 'lateral' in kind:
        return '■' if cat == 'port' else '▲' if cat == 'starboard' else '●'
    if 'cardinal' in kind or 'isolated_danger' in kind:
        return '◆'
    return '●'                             # special_purpose

# Seezeichen tief im Binnenland (z. B. Richtbaken wie „Grimsnis") verwirren
# im Segler-Cockpit — alles > 60 m landeinwaerts wird verworfen.
import math
land = json.load(open('land.geojson'))['features'][0]['geometry']['coordinates']
water = json.load(open('water.geojson'))['features'][0]['geometry']['coordinates']
KX = 111320 * math.cos(math.radians(54.58)); KY = 110540

def inside_mp(mp, lon, lat):
    ins = False
    for poly in mp:
        for ring in poly:                        # even-odd ueber alle Ringe
            c, j = False, len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i]; xj, yj = ring[j]
                if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                    c = not c
                j = i
            if c: ins = not ins
    return ins

def shore_dist(lon, lat):
    best = 1e12
    for poly in water:
        for ring in poly:
            for a, b in zip(ring, ring[1:]):
                ax, ay = (a[0] - lon) * KX, (a[1] - lat) * KY
                bx, by = (b[0] - lon) * KX, (b[1] - lat) * KY
                dx, dy = bx - ax, by - ay
                L2 = dx * dx + dy * dy
                t = 0 if L2 == 0 else max(0, min(1, -(ax * dx + ay * dy) / L2))
                best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best

feats = []
dropped = 0
for el in r.json()['elements']:
    tags = el.get('tags', {})
    if inside_mp(land, el['lon'], el['lat']) and shore_dist(el['lon'], el['lat']) > 60:
        dropped += 1
        continue
    kind = tags.get('seamark:type', '')
    name = tags.get('seamark:name') or tags.get('name') or ''
    feats.append({
        'type': 'Feature',
        'properties': {'kind': kind, 'name': name, 'colour': colour_for(tags),
                       'glyph': glyph_for(tags), 'light': kind.startswith('light')},
        'geometry': {'type': 'Point', 'coordinates': [round(el['lon'], 6), round(el['lat'], 6)]},
    })

json.dump({'type': 'FeatureCollection', 'features': feats},
          open('seamarks.json', 'w'), separators=(',', ':'), ensure_ascii=False)
kinds = {}
for f in feats:
    kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
print(len(feats), 'Seezeichen:', kinds, f'({dropped} landeinwärts verworfen)')
