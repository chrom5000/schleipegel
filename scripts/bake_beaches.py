#!/usr/bin/env python3
"""Strandstreifen fuer die Badestellen backen → beaches.json (GeoJSON).

Je Badestelle das Stueck Uferlinie (Wasserpolygon) ±150 m um den
uferseitig naechsten Punkt — als LineString, gelb gerendert.
Nur Bake-Zeit; Eingaben water.geojson + badewasser.json.
"""
import json, math

HALF_LEN = 150.0   # m Uferlinie je Richtung
MAX_DIST = 400.0   # m: Badestelle weiter weg vom Ufer? Dann kein Streifen.

water = json.load(open('water.geojson'))['features'][0]['geometry']['coordinates']
spots = json.load(open('badewasser.json'))['spots']

KX = 111320 * math.cos(math.radians(54.58)); KY = 110540

def m(p, q):
    return math.hypot((p[0] - q[0]) * KX, (p[1] - q[1]) * KY)

def project(a, b, s):
    """Fusspunkt von s auf Strecke a-b (in Metern), gibt (dist, t, punkt)."""
    ax, ay = a[0] * KX, a[1] * KY
    bx, by = b[0] * KX, b[1] * KY
    sx, sy = s[0] * KX, s[1] * KY
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2))
    px, py = ax + t * dx, ay + t * dy
    return math.hypot(sx - px, sy - py), t, [px / KX, py / KY]

def walk(ring, i0, t0, direction, budget):
    """Von der Projektion aus die Uferlinie entlanglaufen, budget Meter weit."""
    pts = []
    n = len(ring) - 1                       # letzter Punkt == erster
    i, t = i0, t0
    while budget > 0:
        a, b = ring[i % n], ring[(i + 1) % n]
        seg = m(a, b)
        if direction > 0:
            rest = seg * (1 - t)
            if rest >= budget:
                f = t + budget / seg if seg else t
                pts.append([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
                break
            pts.append(list(b)); budget -= rest; i += 1; t = 0
        else:
            rest = seg * t
            if rest >= budget:
                f = t - budget / seg if seg else t
                pts.append([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
                break
            pts.append(list(a)); budget -= rest; i -= 1; t = 1
    return pts

feats = []
for s in spots:
    sp = [s['lon'], s['lat']]
    best = None
    for poly in water:
        for ring in poly:
            n = len(ring) - 1
            for i in range(n):
                d, t, p = project(ring[i], ring[i + 1], sp)
                if best is None or d < best[0]:
                    best = (d, ring, i, t, p)
    if best is None or best[0] > MAX_DIST:
        continue
    _, ring, i, t, p = best
    back = walk(ring, i, t, -1, HALF_LEN)[::-1]
    fwd = walk(ring, i, t, +1, HALF_LEN)
    line = back + [p] + fwd
    feats.append({'type': 'Feature', 'properties': {'name': s.get('name', '')},
                  'geometry': {'type': 'LineString',
                               'coordinates': [[round(x, 6), round(y, 6)] for x, y in line]}})

json.dump({'type': 'FeatureCollection', 'features': feats},
          open('beaches.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(feats), 'Strandstreifen')
