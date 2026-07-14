#!/usr/bin/env python3
"""Wegenetz der Schlei-Region aus OSM backen → wege.json + orte_labels.json.

wege.json trägt doppelte Last: Kartendarstellung UND Routing-Graph —
deshalb werden Stützpunkte NICHT ausgedünnt (Kreuzungsknoten müssen
exakt erhalten bleiben; der Client baut Adjazenz über Koordinaten).
Klassen als kompakter Index, Einbahnen fürs Auto-Profil, Namen für
die Wegbeschreibung. orte_labels.json: Ortsnamen zur Orientierung.
Daten © OpenStreetMap-Mitwirkende (ODbL) — ohne Gewähr.
"""
import json

import requests

BBOX = '54.42,9.40,54.76,10.10'

# Klassenindex — muss zu WEGE_KLASSEN in einkehr.js passen
KLASSEN = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
           'residential', 'living_street', 'service', 'track', 'cycleway',
           'footway', 'path', 'pedestrian', 'steps']
REGEX = '^(' + '|'.join(KLASSEN) + ')(_link)?$'

q = f'[out:json][timeout:300];way["highway"~"{REGEX}"]({BBOX});out geom;'

r = None
for url in ('https://overpass-api.de/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter'):
    try:
        r = requests.post(url, data=q.encode(),
                          headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'},
                          timeout=360)
        r.raise_for_status()
        break
    except Exception as e:              # noqa: BLE001
        print(url, '→', e)
if r is None:
    raise SystemExit('beide Overpass-Mirrors nicht erreichbar')

feats = []
for el in r.json()['elements']:
    t = el.get('tags', {})
    hw = t['highway'].replace('_link', '')
    if hw not in KLASSEN:
        continue
    if t.get('access') in ('private', 'no') and t.get('foot') not in ('yes', 'designated'):
        continue
    p = {'k': KLASSEN.index(hw)}
    if t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout':
        p['o'] = 1
    name = t.get('name') or t.get('ref')
    if name:
        p['n'] = name
    coords = [[round(g['lon'], 5), round(g['lat'], 5)] for g in el['geometry']]
    if len(coords) < 2:
        continue
    feats.append({'type': 'Feature', 'properties': p,
                  'geometry': {'type': 'LineString', 'coordinates': coords}})

json.dump({'type': 'FeatureCollection', 'features': feats},
          open('wege.json', 'w'), separators=(',', ':'), ensure_ascii=False)

# Ortsnamen (zur Orientierung auf der Karte)
q2 = f'[out:json][timeout:120];node["place"~"^(town|village|hamlet|suburb)$"]({BBOX});out;'
r2 = requests.post(url, data=q2.encode(),
                   headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}, timeout=180)
r2.raise_for_status()
RANG = {'town': 0, 'village': 1, 'suburb': 2, 'hamlet': 3}
orte = [{'type': 'Feature',
         'properties': {'name': el['tags']['name'], 'rang': RANG[el['tags']['place']]},
         'geometry': {'type': 'Point', 'coordinates': [round(el['lon'], 5), round(el['lat'], 5)]}}
        for el in r2.json()['elements'] if el.get('tags', {}).get('name')]
json.dump({'type': 'FeatureCollection', 'features': orte},
          open('orte_labels.json', 'w'), separators=(',', ':'), ensure_ascii=False)

import os
kl = {}
for f in feats:
    kl[KLASSEN[f['properties']['k']]] = kl.get(KLASSEN[f['properties']['k']], 0) + 1
print(len(feats), 'Wege,', os.path.getsize('wege.json') // 1024, 'KiB |',
      len(orte), 'Ortslabels |', kl)
