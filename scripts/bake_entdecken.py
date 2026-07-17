#!/usr/bin/env python3
"""Sehenswürdigkeiten der Schlei backen → entdecken.json (GeoJSON).

Kuratierte Auswahl aus OSM (historic/tourism/man_made/Kirchen), angereichert
mit Wikipedia-Text+Foto (Task 2) und einem Denkmalliste-Badge (Task 3); die
Highlight-Einführungen stehen in KURATIERT (Task 4). Nur Bake-Zeit (requests,
pyproj); Ausgabe wird committet. Daten © OSM-Mitwirkende (ODbL), Land SH,
Wikipedia/Wikimedia (CC BY-SA).
"""
import json
import math
import re
import time
import unicodedata

import requests

BBOX = '54.42,9.40,54.76,10.10'          # süd,west,nord,ost — deckt Haithabu/Danewerk/Schleimünde
MAX_DIST_M = 4000                          # großzügiger als Einkehr — Danewerk/Gottorf liegen weiter vom Wasser
IMMER = ('danewerk', 'danevirke')          # Flaggschiffe weiter landeinwärts (Distanzfilter umgehen)

# (Overpass-Schlüssel, Werte-Regex) — nur benannte Objekte
TAGS = [
    ('historic', 'castle|manor|palace|monument|memorial|archaeological_site|ruins|rune_stone|tumulus|boundary_stone|church|monastery'),
    ('tourism', 'museum|artwork|attraction|viewpoint'),
    ('man_made', 'lighthouse|windmill|watermill|tower'),
    ('amenity', 'place_of_worship'),
]
parts = []
for k, v in TAGS:
    parts.append(f'nwr["{k}"~"^({v})$"]["name"]({BBOX});')
    parts.append(f'nwr["{k}"~"^({v})$"]["wikidata"]({BBOX});')
    parts.append(f'nwr["{k}"~"^({v})$"]["wikipedia"]({BBOX});')
q = '[out:json][timeout:180];\n(' + ''.join(parts) + ');\nout center;'

r = None
for url in ('https://overpass-api.de/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter'):
    try:
        r = requests.post(url, data=q.encode(),
                          headers={'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'},
                          timeout=240)
        r.raise_for_status()
        break
    except Exception as e:                 # noqa: BLE001 — Mirror probieren
        print(url, '→', e)
if r is None:
    raise SystemExit('beide Overpass-Mirrors nicht erreichbar')

# Schlei-Wasserfläche für den Distanzfilter (wie bake_einkehr)
water = json.load(open('water.geojson'))
pts = []
for f in water['features']:
    polys = f['geometry']['coordinates']
    if f['geometry']['type'] == 'Polygon':
        polys = [polys]
    for poly in polys:
        pts.extend(poly[0][::3])


def dist_schlei(lon, lat):
    ml = 111320 * math.cos(math.radians(lat))
    return min(math.hypot((lon - x) * ml, (lat - y) * 110540) for x, y in pts)


def kategorie(t):
    h = t.get('historic', '')
    a = t.get('amenity', '')
    tou = t.get('tourism', '')
    mm = t.get('man_made', '')
    name = t.get('name', '')
    if h in ('archaeological_site', 'rune_stone', 'tumulus') or 'Haithabu' in name or 'Danewerk' in name or 'Wikinger' in name:
        return 'wikinger'
    if a == 'place_of_worship' or h in ('church', 'monastery'):
        return 'kirche'
    if h in ('castle', 'manor', 'palace'):
        return 'schloss'
    if tou == 'museum':
        return 'museum'
    if mm in ('lighthouse', 'windmill', 'watermill'):
        return 'technik'
    if mm == 'tower' or tou == 'viewpoint':
        return 'denkmal'
    return 'denkmal'                        # monument, memorial, boundary_stone, ruins, artwork, attraction


def slugify(s):
    s = s.lower()
    s = s.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'ort'


WP_HDR = {'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}


def wikidata_label(qid):
    try:
        j = requests.get(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json',
                         headers=WP_HDR, timeout=30).json()
        labels = j['entities'][qid].get('labels', {})
        return (labels.get('de') or labels.get('en') or {}).get('value', '')
    except Exception as e:                  # noqa: BLE001
        print('wdlabel', qid, '→', e)
        return ''


def objekt_name(t):
    if t.get('name'):
        return t['name']
    wp = t.get('wikipedia', '')
    if wp.startswith('de:'):
        return wp[3:].replace('_', ' ')
    if t.get('wikidata'):
        return wikidata_label(t['wikidata'])
    return ''


def wiki_titel(t):
    """OSM-Tags → (lang, titel) für die Wikipedia-REST-Summary; bevorzugt de."""
    wp = t.get('wikipedia', '')
    if ':' in wp:
        lang, titel = wp.split(':', 1)
        if lang == 'de':
            return 'de', titel
    qid = t.get('wikidata', '')
    if qid:
        try:
            j = requests.get(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json',
                             headers=WP_HDR, timeout=30).json()
            sl = j['entities'][qid].get('sitelinks', {})
            if 'dewiki' in sl:
                return 'de', sl['dewiki']['title']
        except Exception as e:              # noqa: BLE001
            print('wikidata', qid, '→', e)
    if ':' in wp:                           # nicht-de als Rückfall
        return wp.split(':', 1)[0], wp.split(':', 1)[1]
    return None, None


def commons_credit(img_url):
    """Aus einer upload.wikimedia-Thumb-URL Autor + Lizenz von Commons holen."""
    m = re.search(r'/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)', img_url)
    if not m:
        return '', ''
    datei = requests.utils.unquote(m.group(1))
    try:
        j = requests.get('https://commons.wikimedia.org/w/api.php', headers=WP_HDR, timeout=30,
                         params={'action': 'query', 'titles': f'File:{datei}', 'prop': 'imageinfo',
                                 'iiprop': 'extmetadata', 'format': 'json'}).json()
        page = next(iter(j['query']['pages'].values()))
        ext = page['imageinfo'][0]['extmetadata']
        autor = re.sub(r'<[^>]+>', '', ext.get('Artist', {}).get('value', '')).strip()
        lizenz = ext.get('LicenseShortName', {}).get('value', '').strip()
        return autor, lizenz
    except Exception as e:                  # noqa: BLE001
        print('commons', datei, '→', e)
        return '', ''


def anreichern(t):
    """→ dict mit text/wiki_url/img/img_credit/img_license (leere Felder weg)."""
    lang, titel = wiki_titel(t)
    if not titel:
        return {}
    try:
        s = requests.get(f'https://{lang}.wikipedia.org/api/rest_v1/page/summary/'
                         + requests.utils.quote(titel.replace(' ', '_'), safe=''),
                         headers=WP_HDR, timeout=30).json()
    except Exception as e:                  # noqa: BLE001
        print('summary', titel, '→', e)
        return {}
    out = {'text': (s.get('extract') or '').strip(),
           'text_source': 'Wikipedia (CC BY-SA 4.0)',
           'wiki_url': s.get('content_urls', {}).get('desktop', {}).get('page', '')}
    thumb = (s.get('thumbnail') or {}).get('source') or (s.get('originalimage') or {}).get('source')
    if thumb:
        autor, lizenz = commons_credit(thumb)
        out.update(img=thumb, img_credit=autor, img_license=lizenz)
    return {k: v for k, v in out.items() if v}


feats, skipped, seen = [], 0, {}
elements = sorted(r.json()['elements'], key=lambda el: (
    (el.get('tags', {}).get('name') or ''),
    el.get('lat') or el.get('center', {}).get('lat') or 0,
    el.get('lon') or el.get('center', {}).get('lon') or 0))
for el in elements:
    t = el.get('tags', {})
    lat = el.get('lat') or el.get('center', {}).get('lat')
    lon = el.get('lon') or el.get('center', {}).get('lon')
    name = objekt_name(t)
    if lat is None or lon is None or not name:
        continue
    if dist_schlei(lon, lat) > MAX_DIST_M and not any(s in name.lower() for s in IMMER):
        skipped += 1
        continue
    sid = slugify(name)
    seen[sid] = seen.get(sid, 0) + 1
    if seen[sid] > 1:
        sid = f'{sid}-{seen[sid]}'
    p = {
        'id': sid,
        'name': name,
        'cat': kategorie(t),
        'wikidata': t.get('wikidata', ''),
        'wikipedia': t.get('wikipedia', ''),
        'website': t.get('website') or t.get('contact:website') or '',
    }
    p.update(anreichern(t))
    time.sleep(0.1)
    feats.append({'type': 'Feature',
                  'properties': {k: v for k, v in p.items() if v},
                  'geometry': {'type': 'Point',
                               'coordinates': [round(lon, 6), round(lat, 6)]}})

feats.sort(key=lambda f: f['properties']['name'])
json.dump({'type': 'FeatureCollection', 'features': feats},
          open('entdecken.json', 'w'), separators=(',', ':'), ensure_ascii=False)
kat = {}
for f in feats:
    kat[f['properties']['cat']] = kat.get(f['properties']['cat'], 0) + 1
print(len(feats), 'Ziele:', kat, '| außerhalb', MAX_DIST_M, 'm:', skipped)
