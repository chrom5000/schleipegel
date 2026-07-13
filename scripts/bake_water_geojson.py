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

# Land = Rahmen minus Schlei minus Ostsee. Die Ostsee kommt aus der
# OSM-Kuestenlinie (natural=coastline, Land liegt in OSM immer LINKS),
# sonst wuerde das Meer oestlich von Schleimuende als Land gerendert.
F = (9.0, 54.2, 10.6, 55.1)   # lon0, lat0, lon1, lat1
FRAME = [[F[0], F[1]], [F[2], F[1]], [F[2], F[3]], [F[0], F[3]], [F[0], F[1]]]

qc = f'[out:json][timeout:120];way["natural"="coastline"]({F[1]},{F[0]},{F[3]},{F[2]});out geom;'
rc = requests.post('https://overpass-api.de/api/interpreter', data=qc.encode(),
                   headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}, timeout=180)
rc.raise_for_status()
cways = [[(p['lon'], p['lat']) for p in w['geometry']]
         for w in rc.json()['elements'] if w['type'] == 'way']

def stitch_open(pool):
    chains = []
    pool = [w[:] for w in pool if len(w) > 1]
    while pool:
        ch = pool.pop(0)
        grew = True
        while grew:
            grew = False
            for i, w in enumerate(pool):
                if w[0] == ch[-1]: ch += w[1:]; pool.pop(i); grew = True; break
                if w[-1] == ch[0]: ch = w[:-1] + ch; pool.pop(i); grew = True; break
        chains.append(ch)
    return chains

def clip_chain(ch):
    """Kette am Rahmen abschneiden; liefert Teilketten (Endpunkte am Rand)."""
    def inside(p): return F[0] <= p[0] <= F[2] and F[1] <= p[1] <= F[3]
    def cross(a, b):
        # Schnittpunkt der Strecke a-b mit dem Rahmen (parametrisch, engster t)
        ts = []
        for k, (lo, hi) in ((0, (F[0], F[2])), (1, (F[1], F[3]))):
            d = b[k] - a[k]
            if d:
                for bound in (lo, hi):
                    t = (bound - a[k]) / d
                    if 0 <= t <= 1:
                        q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                        if F[0] - 1e-9 <= q[0] <= F[2] + 1e-9 and F[1] - 1e-9 <= q[1] <= F[3] + 1e-9:
                            ts.append((t, q))
        return [q for _, q in sorted(ts)]
    subs, cur = [], []
    for a, b in zip(ch, ch[1:]):
        ia, ib = inside(a), inside(b)
        if ia:
            cur.append(a)
        if ia != ib:
            q = cross(a, b)
            if q:
                cur.append(q[0]) if ia else cur.extend([q[0]])
                if ia:
                    subs.append(cur); cur = []
                else:
                    cur = [q[0]]
        elif not ia and not ib:
            q = cross(a, b)
            if len(q) == 2:
                subs.append([q[0], q[1]])
    if cur:
        cur.append(ch[-1]) if inside(ch[-1]) else None
        if len(cur) > 1:
            subs.append(cur)
    return [s for s in subs if len(s) > 1]

def perim_t(p):
    """Position auf dem Rahmenumfang (im Uhrzeigersinn ab SW-Ecke)."""
    x, y = p
    w, h = F[2] - F[0], F[3] - F[1]
    if abs(y - F[1]) < 1e-8: return x - F[0]
    if abs(x - F[2]) < 1e-8: return w + (y - F[1])
    if abs(y - F[3]) < 1e-8: return w + h + (F[2] - x)
    return w + h + w + (F[3] - y)

def close_sea(subchains, cw):
    """Teilketten entlang des Rahmens zu Meerespolygonen schliessen."""
    corners = [(F[0], F[1]), (F[2], F[1]), (F[2], F[3]), (F[0], F[3])]
    ct = [perim_t(c) for c in corners]
    total = 2 * (F[2] - F[0]) + 2 * (F[3] - F[1])
    chains = [ch[:] for ch in subchains]
    polys = []
    while chains:
        ring = chains.pop(0)[:]
        while ring[0] != ring[-1]:
            t_end = perim_t(ring[-1])
            # naechster Anschluss (Kettenanfang) auf dem Umfang in Laufrichtung
            cands = [(ch, perim_t(ch[0])) for ch in chains] + [(None, perim_t(ring[0]))]
            def dist(t): return ((t - t_end) % total) if cw else ((t_end - t) % total)
            nxt, t_next = min(cands, key=lambda c: dist(c[1]) or total)
            # Ecken dazwischen einfuegen
            cs = sorted(((dist(t), i) for i, t in enumerate(ct) if 0 < dist(t) < dist(t_next) + 1e-12))
            for _, i in cs:
                ring.append(list(corners[i]))
            if nxt is None:
                ring.append(ring[0])
            else:
                chains.remove(nxt)
                ring += nxt
        if len(ring) > 3:
            polys.append(ring)
    return polys

subs = []
for ch in stitch_open(cways):
    subs += clip_chain(ch)
assert subs, 'keine Kuestenlinie im Rahmen gefunden'

sea = close_sea(subs, cw=True)
def contains(ring, x, y):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c
if not any(contains(r, 10.3, 54.55) for r in sea):        # bekannter Ostsee-Punkt
    sea = close_sea(subs, cw=False)
assert any(contains(r, 10.3, 54.55) for r in sea), 'Meeres-Schliessung fehlgeschlagen'

sea = [[[round(x, 6), round(y, 6)] for x, y in simplify_ring(r, TOL_M)] for r in sea]
land = [[FRAME, *[poly[0] for poly in polys], *sea]]
land += [[ring] for poly in polys for ring in poly[1:]]      # Inseln sind Land
json.dump({"type": "FeatureCollection", "features": [{
    "type": "Feature", "properties": {"name": "schlei-land"},
    "geometry": {"type": "MultiPolygon", "coordinates": land}}]},
    open('land.geojson', 'w'), separators=(',', ':'))

pts = sum(len(r) for p in polys for r in p)
print(f'{len(polys)} Polygone, {len(inners)} Inseln, {pts} Punkte (+ land.geojson)')
