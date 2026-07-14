#!/usr/bin/env python3
"""Einkehr-Verzeichnis der Schlei aus OSM backen → einkehr.json (GeoJSON).

Restaurants, Cafés, Imbisse, Unterkünfte, Camping und Häfen in der
Schlei-Region; Distanzfilter zur Wasserfläche hält Eckernförde & Umland
draußen. Nur Bake-Zeit (requests); Ausgabe wird committet.
Daten © OpenStreetMap-Mitwirkende (ODbL) — ohne Gewähr.
"""
import json
import math

import requests

BBOX = '54.44,9.45,54.73,10.07'
MAX_DIST_M = 3000                     # zur Schlei-Wasserfläche

TAGS = [
    ('amenity', 'restaurant|cafe|ice_cream|fast_food|bar|pub|biergarten'),
    ('tourism', 'hotel|guest_house|hostel|camp_site|caravan_site'),
    ('leisure', 'marina'),
]
q = '[out:json][timeout:180];\n(' + ''.join(
    f'nwr["{k}"~"^({v})$"]["name"]({BBOX});' for k, v in TAGS) + ');\nout center;'

r = None
for url in ('https://overpass-api.de/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter'):
    try:
        r = requests.post(url, data=q.encode(),
                          headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'},
                          timeout=240)
        r.raise_for_status()
        break
    except Exception as e:              # noqa: BLE001 — Mirror probieren
        print(url, '→', e)
if r is None:
    raise SystemExit('beide Overpass-Mirrors nicht erreichbar')

# Schlei-Wasserfläche für den Distanzfilter
water = json.load(open('water.geojson'))
pts = []
for f in water['features']:
    polys = f['geometry']['coordinates']
    if f['geometry']['type'] == 'Polygon':
        polys = [polys]
    for poly in polys:
        pts.extend(poly[0][::3])        # jeder 3. Uferpunkt reicht


def dist_schlei(lon, lat):
    ml = 111320 * math.cos(math.radians(lat))
    return min(math.hypot((lon - x) * ml, (lat - y) * 110540) for x, y in pts)


def kategorie(t):
    a, tou, lei = t.get('amenity', ''), t.get('tourism', ''), t.get('leisure', '')
    if lei == 'marina':
        return 'hafen'
    if tou in ('camp_site', 'caravan_site'):
        return 'camping'
    if tou:
        return 'schlafen'
    if a == 'restaurant':
        return 'restaurant'
    if a in ('cafe', 'ice_cream'):
        return 'cafe'
    return 'imbiss'                     # fast_food, bar, pub, biergarten


feats, skipped = [], 0
for el in r.json()['elements']:
    t = el.get('tags', {})
    lat = el.get('lat') or el.get('center', {}).get('lat')
    lon = el.get('lon') or el.get('center', {}).get('lon')
    if lat is None or not t.get('name'):
        continue
    if dist_schlei(lon, lat) > MAX_DIST_M:
        skipped += 1
        continue
    strasse = t.get('addr:street', '')
    nr = t.get('addr:housenumber', '')
    p = {
        'name': t['name'],
        'cat': kategorie(t),
        'cuisine': (t.get('cuisine') or '').replace(';', ' · ').replace('_', ' '),
        'website': t.get('website') or t.get('contact:website') or '',
        'phone': t.get('phone') or t.get('contact:phone') or '',
        'adresse': f'{strasse} {nr}'.strip(),
        'ort': t.get('addr:city', ''),
        'zeiten': t.get('opening_hours', ''),
    }
    feats.append({'type': 'Feature',
                  'properties': {k: v for k, v in p.items() if v},
                  'geometry': {'type': 'Point',
                               'coordinates': [round(lon, 6), round(lat, 6)]}})

feats.sort(key=lambda f: f['properties']['name'])
json.dump({'type': 'FeatureCollection', 'features': feats},
          open('einkehr.json', 'w'), separators=(',', ':'), ensure_ascii=False)
kat = {}
for f in feats:
    kat[f['properties']['cat']] = kat.get(f['properties']['cat'], 0) + 1
print(len(feats), 'Orte:', kat, '| ausserhalb 3 km:', skipped)
