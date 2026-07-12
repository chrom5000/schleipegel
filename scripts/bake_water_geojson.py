#!/usr/bin/env python3
"""Rueckprojektion der gebackenen Schlei-Wasserflaeche nach Lon/Lat.

Der SVG-Pfad in schlei-geo.js ist linear (equirektangular) auf die
viewBox 1000 x 715.6 projiziert — die Umkehrung ist exakt.
Nur Bake-Zeit; Ausgabe water.geojson wird committet.
"""
import json, re, sys

BBOX = dict(lon0=9.5439575, lat0=54.4900432, lon1=10.0361676, lat1=54.6941334, w=1000.0, h=715.6)

src = open('schlei-geo.js', encoding='utf-8').read()
path = json.loads(re.search(r'const SCHLEI_GEO = (\{.*\})', src, re.S).group(1).rsplit(';', 1)[0])['path']
assert not re.search(r'[A-LN-YA-Za-ln-y]', path.replace('M', '').replace('Z', '').replace('z', '')), \
    'Pfad enthaelt unerwartete SVG-Kommandos'

def to_lonlat(x, y):
    lon = BBOX['lon0'] + x / BBOX['w'] * (BBOX['lon1'] - BBOX['lon0'])
    lat = BBOX['lat1'] - y / BBOX['h'] * (BBOX['lat1'] - BBOX['lat0'])
    return [round(lon, 6), round(lat, 6)]

polys = []
for sub in filter(None, (s.strip() for s in path.replace('Z', 'z').split('z'))):
    assert sub.startswith('M'), sub[:20]
    pts = [to_lonlat(*map(float, p.split(','))) for p in sub[1:].split()]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    polys.append([pts])

fc = {"type": "FeatureCollection", "features": [{
    "type": "Feature", "properties": {"name": "schlei-wasser"},
    "geometry": {"type": "MultiPolygon", "coordinates": polys}}]}
json.dump(fc, open('water.geojson', 'w'), separators=(',', ':'))
print(f'{len(polys)} Polygone, {sum(len(p[0]) for p in polys)} Punkte')
