#!/usr/bin/env python3
"""Schlei-Wasserflaeche in voller Aufloesung aus OSM (Relation 2340930).

Outer-Ways werden an den Endpunkten zu Ringen zusammengenaeht, Inseln
(inner) werden Loecher; Douglas-Peucker ~8 m haelt die Datei klein,
ohne dass Ufer treppig werden. Nur Bake-Zeit (requests noetig);
Ausgabe water.geojson wird committet.

(Die SVG-Silhouette nutzt weiterhin die staerker vereinfachte
Geometrie in schlei-geo.js — hier geht es um die MapLibre-Szene.)
"""
import json, math, sys, requests

REL = 2340930
TOL_M = 8.0
sys.setrecursionlimit(100000)

q = f'[out:json][timeout:120];relation({REL});out geom;'
r = requests.post('https://overpass-api.de/api/interpreter', data=q.encode(),
                  headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}, timeout=180)
r.raise_for_status()
rel = next(e for e in r.json()['elements'] if e['type'] == 'relation')

ways = {'outer': [], 'inner': []}
for m in rel['members']:
    if m['type'] == 'way' and 'geometry' in m:
        role = m.get('role') or 'outer'
        if role in ways:
            ways[role].append([(p['lon'], p['lat']) for p in m['geometry']])

def stitch(pool):
    rings = []
    pool = [w for w in pool if len(w) > 1]
    while pool:
        ring = pool.pop(0)
        while ring[0] != ring[-1]:
            for i, w in enumerate(pool):
                if w[0] == ring[-1]:
                    ring += w[1:]; pool.pop(i); break
                if w[-1] == ring[-1]:
                    ring += w[-2::-1]; pool.pop(i); break
            else:
                raise SystemExit(f'Ring nicht schliessbar (Rest {len(pool)} Ways)')
        rings.append(ring)
    return rings

def simplify(pts, tol):
    lat0 = math.radians(pts[0][1])
    kx, ky = 111320 * math.cos(lat0), 110540
    def simp(a, b):
        if b - a < 2:
            return []
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = (bx - ax) * kx, (by - ay) * ky
        L = math.hypot(dx, dy) or 1e-9
        imax, dmax = -1, tol
        for i in range(a + 1, b):
            px, py = (pts[i][0] - ax) * kx, (pts[i][1] - ay) * ky
            d = abs(px * dy - py * dx) / L
            if d >= dmax:
                imax, dmax = i, d
        if imax < 0:
            return []
        return simp(a, imax) + [imax] + simp(imax, b)
    keep = sorted({0, len(pts) - 1, *simp(0, len(pts) - 1)})
    return [pts[i] for i in keep]

def simplify_ring(pts, tol):
    # Geschlossener Ring: Start = Ende → Sehne kollabiert. Erst halbieren.
    mid = len(pts) // 2
    return simplify(pts[:mid + 1], tol)[:-1] + simplify(pts[mid:], tol)

outers = [simplify_ring(rg, TOL_M) for rg in stitch(ways['outer'])]
inners = [simplify_ring(rg, TOL_M) for rg in stitch(ways['inner'])]
outers.sort(key=len, reverse=True)

# Alle Loecher haengen am (einen) grossen Aussenring der Schlei
polys = [[[[round(x, 6), round(y, 6)] for x, y in ring] for ring in [outers[0], *inners]]]
for extra in outers[1:]:
    polys.append([[[round(x, 6), round(y, 6)] for x, y in extra]])

fc = {"type": "FeatureCollection", "features": [{
    "type": "Feature", "properties": {"name": "schlei-wasser"},
    "geometry": {"type": "MultiPolygon", "coordinates": polys}}]}
json.dump(fc, open('water.geojson', 'w'), separators=(',', ':'))
pts = sum(len(r) for p in polys for r in p)
print(f'{len(polys)} Polygone, {len(inners)} Inseln, {pts} Punkte')
