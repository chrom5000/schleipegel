# Entdecken-Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fünfter Bereichs-Tab „Entdecken" — kuratierte Sehenswürdigkeiten rund um die Schlei als 3D-Karte mit mitlaufender Liste, Foto-Detailansicht, Routenplanung zum Ziel und kuratierten Themenrouten.

**Architecture:** Eigenständige Seite `entdecken.html`/`.js`/`.css`, die nur MapLibre lädt (nicht app.js/hero3d.js) und architektonisch ein naher Verwandter von `einkehr.html` ist. Daten werden einmalig gebacken (`scripts/bake_entdecken.py` → `entdecken.json`) aus OSM (Overpass) + Wikipedia-REST (Text + Foto) + offizieller SH-Denkmalliste (Badge). Kartenstil, Split-View und der komplette A\*-Routing-Block sind **bewusste Kopien aus `einkehr.js`/`hero3d.js`** (Muster wie regatta↔app.js — Änderungen an der Quelle hier nachziehen; als Kommentar vermerken).

**Tech Stack:** MapLibre GL JS (gepinnt, vendored), reines ES ohne Build; Python 3 mit `requests` und `pyproj` (nur Bake-Zeit); Verifikation via `node --check` + `python3 -m http.server` + headless Chrome (puppeteer-core, verify-Skill).

## Global Constraints

- Sprache **Deutsch** in UI, Kommentaren und Commit-Messages; volle Rechtschreibung inkl. Umlaute/ß.
- **Kein Build-Schritt.** JS-Syntax wird mit `node --check <datei>.js` geprüft; funktional/visuell headless (verify-Skill), Screenshots in **Desktop (1280 px)** und **iPhone (390 px)**.
- **Cache-Busting:** jede neue Asset-Referenz mit `?v=__BUILD__`; `entdecken.html` in die `sed __BUILD__`-Zeile in `.github/workflows/deploy.yml` aufnehmen (dort stehen schon index/regatta/angeln/einkehr).
- **Reichweitenmessung:** GoatCounter-Snippet nur bei `location.hostname === 'dieschlei.de'` (Hostname-Guard, sonst verzerren Vorschau/Tests die Statistik).
- **Laufzeit** nur clientseitig, CORS-offen, schlüssellos; alles Übrige ist **gebacken** und committet. `entdecken.html` lädt **nicht** app.js/hero3d.js.
- **MapLibre** nur aus `vendor/` (gepinnt), inkl. `vendor/glyphs/` Fontstack „noto".
- **Farben** dataviz-validiert für Hell/Dunkel; Hero/Karte ist dunkel (`#0d1b22`-Familie wie einkehr).
- **Barrierefreiheit:** `prefers-reduced-motion` deaktiviert Animationen; interaktive Elemente mit `tabindex`/`aria`/`<title>`.
- **Mobil ≤ 700 px:** Liste im Vollbild, schwebender Karte/Liste-Umschalter; nach Umschalten `map.resize()`.
- **Ehrlichkeit:** „nicht zur Navigation"; Quellen/Lizenz je Foto und Text sichtbar (OSM ODbL · Land SH · Wikipedia/Wikimedia CC BY-SA mit Namensnennung).
- **Vor jedem Push** `git pull --rebase` (der Badewasser-Cron committet täglich auf `main`). Push geht sofort live — vorher lokal verifizieren.

---

## File Structure

- `scripts/bake_entdecken.py` — **neu.** Bäckt `entdecken.json` aus Overpass + Wikipedia + Denkmalliste; enthält die kuratierten Highlight-Texte (`KURATIERT`).
- `entdecken.json` — **neu (Bake-Ausgabe, committet).** GeoJSON-FeatureCollection der Sehenswürdigkeiten.
- `scripts/data/denkmalliste-sh.geojson` — **neu (Rohquelle, committet oder .gitignore je Größe).** Offizielle SH-Denkmalliste; Eingang für den Abgleich.
- `entdecken.html` — **neu.** Seitengerüst (Kopf/OG/Nav/Layout/Detail/Routen/Dialog), Kopie von `einkehr.html`.
- `entdecken.css` — **neu.** Kopie von `einkehr.css` + Ergänzungen (Detailkarte mit Foto, Themenrouten-Leiste).
- `entdecken.js` — **neu.** Kartenstil + Datenfluss + Liste + Detail + Routing (Port aus `einkehr.js`) + Themenrouten (`ROUTEN`).
- `index.html`, `regatta.html`, `angeln.html`, `einkehr.html` — **ändern:** Nav `site-tabs` um „Entdecken"; `index.html` zusätzlich Footer-Werkzeugliste.
- `.github/workflows/deploy.yml` — **ändern:** `entdecken.html` in die sed-Zeile.
- `sitemap.xml` — **ändern:** Eintrag `entdecken.html`.
- `CLAUDE.md` — **ändern:** Abschnitt „Entdecken" ergänzen.

**ID-Konvention (durchgängig):** Jede Sehenswürdigkeit bekommt eine stabile `id` = Slug des Namens (`ä→ae, ö→oe, ü→ue, ß→ss`, Rest kleingeschrieben, Nicht-Alphanumerisches → `-`, Kollision → `-2` …). Kuratierte Highlights überschreiben ihre `id` mit dem festen Slug aus `KURATIERT`, damit `ROUTEN` sie zuverlässig referenziert.

---

## Task 1: Bake-Grundgerüst — OSM → entdecken.json

**Files:**
- Create: `scripts/bake_entdecken.py`
- Test: Ausführen erzeugt `entdecken.json`

**Interfaces:**
- Produces: `entdecken.json` = `{type:'FeatureCollection', features:[…]}`, je Feature `properties = {id, name, cat, wikidata, wikipedia, website}` und `geometry` Point `[lon,lat]`. Kategorien (`cat`): `wikinger|kirche|schloss|museum|technik|denkmal`.

- [ ] **Step 1: Skript schreiben** (Muster `scripts/bake_einkehr.py`: Overpass mit Mirror-Fallback, Wasser-Distanzfilter, `out center`)

```python
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
import unicodedata

import requests

BBOX = '54.42,9.40,54.76,10.10'          # süd,west,nord,ost — deckt Haithabu/Danewerk/Schleimünde
MAX_DIST_M = 4000                          # großzügiger als Einkehr — Danewerk/Gottorf liegen weiter vom Wasser

# (Overpass-Schlüssel, Werte-Regex) — nur benannte Objekte
TAGS = [
    ('historic', 'castle|manor|palace|monument|memorial|archaeological_site|ruins|rune_stone|tumulus|boundary_stone|church|monastery'),
    ('tourism', 'museum|artwork|attraction|viewpoint'),
    ('man_made', 'lighthouse|windmill|watermill|tower'),
    ('amenity', 'place_of_worship'),
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


feats, skipped, seen = [], 0, {}
for el in r.json()['elements']:
    t = el.get('tags', {})
    lat = el.get('lat') or el.get('center', {}).get('lat')
    lon = el.get('lon') or el.get('center', {}).get('lon')
    name = t.get('name')
    if lat is None or not name:
        continue
    if dist_schlei(lon, lat) > MAX_DIST_M:
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
```

- [ ] **Step 2: Ausführen und Ausgabe prüfen**

Run: `cd /Users/bo/CLAUDE/Pegel && python3 scripts/bake_entdecken.py`
Expected: druckt z. B. `~150–400 Ziele: {...}` mit allen sechs Kategorien > 0; `außerhalb … m: <n>`.

- [ ] **Step 3: JSON-Gültigkeit + Flaggschiffe prüfen**

Run: `python3 -c "import json;d=json.load(open('entdecken.json'));ns=[f['properties']['name'] for f in d['features']];print(len(ns));print([n for n in ns if 'Haithabu' in n or 'Danewerk' in n or 'Gottorf' in n or 'Kappeln' in n][:10])"`
Expected: gültig, enthält Haithabu, Danewerk und Schloss Gottorf o. ä.

- [ ] **Step 4: Commit**

```bash
git add scripts/bake_entdecken.py entdecken.json
git commit -m "Entdecken: Bake-Grundgerüst (OSM → entdecken.json)"
```

---

## Task 2: Wikipedia-Anreicherung (Text + Foto + Attribution)

**Files:**
- Modify: `scripts/bake_entdecken.py` (Anreicherungsschritt vor dem Schreiben)
- Test: erneut ausführen, Abdeckung prüfen

**Interfaces:**
- Consumes: Feature-`properties.wikidata` / `.wikipedia` aus Task 1.
- Produces: zusätzliche `properties`: `text` (Kurzbeschreibung), `text_source` (fest „Wikipedia (CC BY-SA 4.0)"), `wiki_url`, `img` (Foto-URL), `img_credit`, `img_license`.

- [ ] **Step 1: Anreicherungsfunktionen einfügen** (nach `slugify`, vor der Feature-Schleife)

```python
WP_HDR = {'User-Agent': 'dieschlei.de bake (einkauf@bohillebrand.de)'}


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
```

- [ ] **Step 2: In der Feature-Schleife aufrufen** — die Zeile, die `p` baut, um die Anreicherung ergänzen; direkt nach dem `p = {…}`-Block einfügen:

```python
    p.update(anreichern(t))
```

- [ ] **Step 3: Höflich drosseln** — vor `feats.append(` ein kleines `time.sleep(0.1)` setzen und `import time` oben ergänzen (Wikipedia/Commons nicht hämmern).

- [ ] **Step 4: Ausführen + Abdeckung prüfen**

Run: `python3 scripts/bake_entdecken.py && python3 -c "import json;d=json.load(open('entdecken.json'))['features'];print('mit Text',sum('text' in f['properties'] for f in d),'/',len(d));print('mit Foto',sum('img' in f['properties'] for f in d));h=[f for f in d if f['properties']['id']=='haithabu'];print(h[0]['properties'].get('text','')[:120] if h else 'kein haithabu')"`
Expected: viele Objekte mit Text, etliche mit Foto; Haithabu hat einen Textauszug.

- [ ] **Step 5: Commit**

```bash
git add scripts/bake_entdecken.py entdecken.json
git commit -m "Entdecken: Wikipedia-Text + Foto + Commons-Attribution einbacken"
```

---

## Task 3: Denkmalliste-Abgleich (Badge `kulturdenkmal`)

**Files:**
- Create: `scripts/data/denkmalliste-sh.geojson` (Bezug, s. Step 1)
- Modify: `scripts/bake_entdecken.py`
- Test: erneut ausführen, Treffer prüfen

**Interfaces:**
- Produces: zusätzliche `properties`: `kulturdenkmal` (`true`, nur wenn Treffer) und optional `kulturdenkmal_text` (amtliche Bezeichnung/Begründung, falls im Datensatz vorhanden).

- [ ] **Step 1: SH-Denkmalliste-GeoJSON beziehen.** Auf `https://opendata.schleswig-holstein.de/organization/landesamt-fur-denkmalpflege` den landesweiten **GeoJSON**-Datensatz (Geodaten-Denkmalliste SH) öffnen und die aktuelle `.geojson`-Ressource nach `scripts/data/denkmalliste-sh.geojson` laden. **CRS prüfen:** RFC 7946 wäre WGS84 (lon/lat ≈ 9…10 / 54…55); enthält die Datei große Koordinaten (~5–6-stellig), liegt sie in **EPSG:25832** (UTM 32N) und muss beim Einlesen umprojiziert werden.

Run zum Prüfen: `python3 -c "import json;d=json.load(open('scripts/data/denkmalliste-sh.geojson'));print(len(d['features']));print(d['features'][0]['geometry']['type'], d['features'][0]['geometry']['coordinates'][:1] if d['features'][0]['geometry']['type']=='Point' else 'poly');print(list(d['features'][0]['properties'].keys()))"`

- [ ] **Step 2: Lade-/Match-Funktion einfügen** (nach `commons_credit`)

```python
from pyproj import Transformer

_T25832 = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)


def _koord(geom):
    """Repräsentativen (lon,lat) eines Denkmal-Features holen (Punkt oder Polygon-Schwerpunkt)."""
    g = geom['type']
    if g == 'Point':
        c = geom['coordinates']
    elif g in ('Polygon', 'MultiPolygon'):
        ring = geom['coordinates'][0] if g == 'Polygon' else geom['coordinates'][0][0]
        c = [sum(x) / len(ring) for x in zip(*[(pt[0], pt[1]) for pt in ring])]
    elif g in ('LineString', 'MultiLineString'):
        line = geom['coordinates'] if g == 'LineString' else geom['coordinates'][0]
        c = line[len(line) // 2]
    else:
        return None
    lon, lat = c[0], c[1]
    if lon > 180 or lat > 180:              # projiziert → nach WGS84
        lon, lat = _T25832.transform(lon, lat)
    return lon, lat


def lade_denkmale():
    try:
        dm = json.load(open('scripts/data/denkmalliste-sh.geojson'))
    except FileNotFoundError:
        print('WARNUNG: denkmalliste-sh.geojson fehlt — Badge wird nicht gesetzt')
        return []
    out = []
    for f in dm['features']:
        c = _koord(f.get('geometry') or {})
        if not c:
            continue
        pr = f.get('properties', {})
        bez = pr.get('Bezeichnung') or pr.get('bezeichnung') or pr.get('Objektname') or ''
        begr = pr.get('Begruendung') or pr.get('Rechtsgrund') or pr.get('Beschreibung') or ''
        out.append((c[0], c[1], (pr.get('name') or bez or '').lower(), begr))
    print('Denkmale geladen:', len(out))
    return out


DENKMALE = lade_denkmale()


def denkmal_match(name, lon, lat):
    """Nächstes Denkmal ≤30 m, oder ≤150 m mit Namensähnlichkeit → (True, text)."""
    ml = 111320 * math.cos(math.radians(lat))
    nl = name.lower()
    best = None
    for dx, dy, dn, begr in DENKMALE:
        d = math.hypot((dx - lon) * ml, (dy - lat) * 110540)
        if d <= 30 or (d <= 150 and dn and (dn in nl or nl in dn)):
            if best is None or d < best[0]:
                best = (d, begr)
    if best is None:
        return {}
    return {'kulturdenkmal': True, **({'kulturdenkmal_text': best[1]} if best[1] else {})}
```

- [ ] **Step 3: In der Feature-Schleife aufrufen** — nach `p.update(anreichern(t))`:

```python
    p.update(denkmal_match(name, lon, lat))
```

- [ ] **Step 4: Ausführen + Treffer prüfen**

Run: `python3 scripts/bake_entdecken.py && python3 -c "import json;d=json.load(open('entdecken.json'))['features'];print('Kulturdenkmale',sum(f['properties'].get('kulturdenkmal') for f in d),'/',len(d))"`
Expected: eine plausible Zahl > 0 (viele Kirchen/Schlösser sind gelistet).

- [ ] **Step 5: Commit** (GeoJSON-Rohdatei ggf. via `.gitignore` ausschließen, wenn > ein paar MB — dann in bake_entdecken oben dokumentieren, woher sie kommt)

```bash
git add scripts/bake_entdecken.py entdecken.json
git commit -m "Entdecken: Denkmalliste-Abgleich → Kulturdenkmal-Badge"
```

---

## Task 4: Kuratierte Highlight-Einführungen

**Files:**
- Modify: `scripts/bake_entdecken.py`
- Test: erneut ausführen, Highlights prüfen

**Interfaces:**
- Produces: bei getroffenen Flaggschiffen `properties.text` = kuratierter Text, `properties.highlight = true`, und `properties.id` = fester Slug aus `KURATIERT` (stabile Referenz für `ROUTEN`).

- [ ] **Step 1: `KURATIERT` einfügen** (oben, nach den Konstanten). Match über Namensvarianten (case-insensitiv, Teilstring).

```python
# Kuratierte Einführungen für die Flaggschiffe. `namen` = OSM-Namensvarianten
# zum Zuordnen; `slug` wird zur stabilen id (von ROUTEN referenziert).
KURATIERT = [
    {'slug': 'haithabu', 'namen': ['Haithabu'],
     'text': 'Bedeutendste Wikinger-Handelsmetropole Nordeuropas und seit 2018 UNESCO-Welterbe. '
             'Der halbkreisförmige Ringwall am Haddebyer Noor und das benachbarte Wikinger Museum machen die Epoche greifbar.'},
    {'slug': 'danewerk', 'namen': ['Danewerk', 'Dannewerk'],
     'text': 'Das größte Bodendenkmal Nordeuropas — ein über Jahrhunderte ausgebautes Wallsystem quer über die Kimbrische Halbinsel. '
             'Gemeinsam mit Haithabu seit 2018 UNESCO-Welterbe.'},
    {'slug': 'wikinger-museum-haithabu', 'namen': ['Wikinger Museum', 'Wikinger-Museum', 'Wikingermuseum'],
     'text': 'Am Fundort von Haithabu zeigt das Museum Originalfunde und rekonstruierte Wikingerhäuser direkt am Wasser.'},
    {'slug': 'schloss-gottorf', 'namen': ['Gottorf', 'Schloss Gottorf'],
     'text': 'Barockresidenz auf einer Schleiinsel in Schleswig, heute Landesmuseen für Kunst und Archäologie — '
             'mit dem Nydam-Boot und dem rekonstruierten Gottorfer Globus.'},
    {'slug': 'schleswiger-dom', 'namen': ['St.-Petri-Dom', 'St. Petri', 'Schleswiger Dom', 'Dom zu Schleswig'],
     'text': 'Der St.-Petri-Dom prägt die Silhouette Schleswigs; im Inneren der weltberühmte Bordesholmer Altar von Hans Brüggemann (1521).'},
    {'slug': 'heringszaun-kappeln', 'namen': ['Heringszaun'],
     'text': 'Die letzte funktionsfähige Reusenanlage ihrer Art in Europa — ein technisches Kulturdenkmal mitten in Kappeln.'},
    {'slug': 'klappbruecke-kappeln', 'namen': ['Klappbrücke', 'Klappbruecke'],
     'text': 'Kappelns Klappbrücke über die Schlei öffnet zu festen Zeiten für die Durchfahrt — ein Blickfang am Hafen.'},
    {'slug': 'muehle-amanda', 'namen': ['Amanda', 'Mühle Amanda', 'Windmühle Amanda'],
     'text': 'Die Galerieholländermühle Amanda von 1888 ist Kappelns Wahrzeichen und eine der schönsten Mühlen der Region.'},
    {'slug': 'leuchtturm-schleimuende', 'namen': ['Schleimünde', 'Leuchtturm Schleimünde'],
     'text': 'Der Leuchtturm Schleimünde bewacht seit 1871 die Einfahrt von der Ostsee in die Schlei; die kleine Lotseninsel ist nur per Boot erreichbar.'},
    {'slug': 'arnis', 'namen': ['Arnis'],
     'text': 'Arnis ist mit rund 300 Einwohnern die kleinste Stadt Deutschlands, 1667 gegründet, mit historischer Schifferstadt-Silhouette an der Schlei.'},
    {'slug': 'holm-schleswig', 'namen': ['Holm'],
     'text': 'Die Fischersiedlung Holm in Schleswig bewahrt mit ihrem Friedhof rund um die zentrale Kapelle das Bild eines alten Fischerdorfs.'},
]
```

- [ ] **Step 2: Merge-Funktion einfügen** (nach `KURATIERT`)

```python
def kuratiert_match(name):
    nl = name.lower()
    for e in KURATIERT:
        if any(v.lower() in nl for v in e['namen']):
            return e
    return None
```

- [ ] **Step 3: In der Feature-Schleife anwenden** — nach `p.update(denkmal_match(...))`:

```python
    k = kuratiert_match(name)
    if k:
        p['id'] = k['slug']
        p['text'] = k['text']
        p['text_source'] = 'Redaktion dieschlei.de'
        p['highlight'] = True
```

(Das überschreibt die stabile `id`; die Kollisions-Zählung aus Task 1 darf danach nicht erneut greifen — Reihenfolge im Code beibehalten: erst `sid`/`p` bauen, dann `p.update(anreichern)`, `denkmal_match`, zuletzt `kuratiert_match`.)

- [ ] **Step 4: Ausführen + Highlights prüfen**

Run: `python3 scripts/bake_entdecken.py && python3 -c "import json;d=json.load(open('entdecken.json'))['features'];hl=[f['properties'] for f in d if f['properties'].get('highlight')];print('Highlights',len(hl));[print(' ',p['id'],'—',p['text'][:60]) for p in hl]"`
Expected: mehrere Highlights (idealerweise ≥ 6 der 11), jeweils mit kuratiertem Text; nicht getroffene Slugs notieren (Namensvariante evtl. anpassen).

- [ ] **Step 5: Commit**

```bash
git add scripts/bake_entdecken.py entdecken.json
git commit -m "Entdecken: kuratierte Highlight-Einführungen einbacken"
```

---

## Task 5: Seitengerüst — entdecken.html + entdecken.css

**Files:**
- Create: `entdecken.html` (Kopie `einkehr.html`, angepasst)
- Create: `entdecken.css` (Kopie `einkehr.css` + Detail/Routen-Ergänzungen)
- Test: headless laden, Gerüst prüfen

**Interfaces:**
- Produces: DOM-IDs, die `entdecken.js` erwartet: `#map`, `#suche`, `#chips`, `#count`, `#cards`, `#btn-info`, `#btn-flip`, `#dlg-info`, `#pick-hinweis`, Routen-Panel (`#route-panel`, `#route-ziel`, `#route-zu`, `#route-standort`, `#route-pick`, `#route-profile`, `#route-status`, `#route-erg`, `#route-summe`, `#route-schritte`, `#route-google`), **neu:** Detailkarte `#detail` und Themenrouten-Leiste `#touren`.

- [ ] **Step 1: `einkehr.html` nach `entdecken.html` kopieren** und im `<head>` ersetzen: `<title>` → „Entdecken — Schlei-Infocenter"; `meta[name=description]`, alle `og:*` (`og:url`→`.../entdecken.html`, `og:title`, `og:description` = „Sehenswürdigkeiten, Wikinger-Welterbe und Geschichte rund um die Schlei — mit Karte, Fotos und Routenplanung."); `<link rel=canonical>`→`.../entdecken.html`; `einkehr.css`→`entdecken.css`; `einkehr.js`→`entdecken.js`. GoatCounter-Snippet unverändert (Hostname-Guard bleibt). Favicon-`path` (das Haus-SVG) darf bleiben oder auf eine Landmarke geändert werden.

- [ ] **Step 2: Header/Nav anpassen** — `h1` → „Ent<span>decken</span>"; die `site-tabs` um den eigenen Eintrag ergänzen und `aria-current` umsetzen:

```html
    <nav class="site-tabs" aria-label="Bereiche">
      <a href="index.html">Infocenter</a>
      <a href="regatta.html">&#9873; Regatta</a>
      <a href="angeln.html">&#10547; Bei&szlig;fenster</a>
      <a href="einkehr.html">&#8962; Einkehr</a>
      <a href="entdecken.html" aria-current="page">&#9906; Entdecken</a>
    </nav>
```

- [ ] **Step 3: Themenrouten-Leiste + Detailkarte einfügen.** Direkt nach dem öffnenden `<aside …id="panel-liste">` und der Suchzeile die Touren-Leiste ergänzen; die Detailkarte als eigenes `<section>` vor dem Routen-Panel:

```html
      <div class="ed-touren" id="touren" role="group" aria-label="Themenrouten"></div>
```
```html
  <!-- Detailkarte (Foto + Beschreibung), erscheint bei Auswahl -->
  <section class="ed-detail" id="detail" hidden aria-label="Details zur Sehenswürdigkeit"></section>
```

- [ ] **Step 4: Info-Dialog + Fußzeile anpassen** — Dialogtext auf die neuen Quellen umschreiben; Fußzeile in `#panel-liste`:

```html
      <p class="ek-fuss">Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende ·
        Denkmaldaten © Land Schleswig-Holstein · Texte &amp; Fotos: Auszüge aus Wikipedia/Wikimedia (CC BY-SA, mit Namensnennung) —
        ohne Gewähr auf Vollständigkeit. Nicht zur Navigation.</p>
```

- [ ] **Step 5: `einkehr.css` nach `entdecken.css` kopieren** und Ergänzungen anhängen (Detailkarte mit Foto, Touren-Chips). Farb-/Layout-Variablen der Kopie bleiben.

```css
/* ── Themenrouten-Leiste ─────────────────────────────────────── */
.ed-touren { display: flex; gap: .4rem; flex-wrap: wrap; padding: 0 1rem .5rem; }
.ed-tour { border: 1px solid var(--linie, #26424f); background: transparent; color: inherit;
  border-radius: 999px; padding: .3rem .7rem; font: inherit; font-size: .82rem; cursor: pointer; }
.ed-tour[aria-pressed="true"] { background: #bfe7ff22; border-color: #45b1e2; }

/* ── Detailkarte ─────────────────────────────────────────────── */
.ed-detail { position: fixed; z-index: 30; background: #10222b; color: #e6eef2;
  border: 1px solid #26424f; border-radius: 14px; box-shadow: 0 12px 40px #0009;
  right: 1rem; bottom: 1rem; width: min(360px, calc(100vw - 2rem)); overflow: hidden; }
.ed-detail img { display: block; width: 100%; height: 180px; object-fit: cover; }
.ed-detail-body { padding: .8rem 1rem 1rem; }
.ed-detail h2 { margin: 0 0 .2rem; font-size: 1.15rem; }
.ed-badge { display: inline-block; font-size: .72rem; padding: .1rem .5rem; border-radius: 999px;
  background: #d9a44122; color: #e8c96a; border: 1px solid #d9a44155; margin: .1rem .3rem .3rem 0; }
.ed-detail p { margin: .4rem 0; font-size: .9rem; line-height: 1.45; }
.ed-quelle { font-size: .72rem; opacity: .7; }
.ed-detail-x { position: absolute; top: .5rem; right: .5rem; background: #0009; color: #fff;
  border: 0; border-radius: 999px; width: 30px; height: 30px; font-size: 1rem; cursor: pointer; }
@media (max-width: 700px) { .ed-detail { left: .5rem; right: .5rem; bottom: 4.2rem; width: auto; } }
@media (prefers-reduced-motion: no-preference) { .ed-detail { animation: ed-rise .18s ease-out; } }
@keyframes ed-rise { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
```

- [ ] **Step 6: Rauchtest headless** — `python3 -m http.server 8734` starten; im headless Chrome `http://localhost:8734/entdecken.html` laden und prüfen: `document.querySelector('#map')`, `#cards`, `#touren`, `#detail` existieren; Nav enthält 5 `.site-tabs a`; **keine** Konsolenfehler außer evtl. „entdecken.js“-Datenfehlern (js kommt in Task 6). Screenshot Desktop.

- [ ] **Step 7: Commit**

```bash
git add entdecken.html entdecken.css
git commit -m "Entdecken: Seitengerüst (HTML + CSS)"
```

---

## Task 6: Karte + Kategorien + Liste-folgt-Karte + Chips

**Files:**
- Create: `entdecken.js`
- Test: headless — Punkte, Chips, Liste

**Interfaces:**
- Consumes: `entdecken.json`, DOM-IDs aus Task 5.
- Produces: IIFE mit `state`, `map`, `STYLE`, `KAT`, `gefiltert()`, `applyFilter()`, `renderListe()`, `renderChips()`, `waehle(f, ausKarte)` (Detail folgt in Task 7), `init()`. Global `window.ENTDECKEN = { _map, _state }`.

- [ ] **Step 1: `entdecken.js` anlegen** — Grundgerüst aus `einkehr.js` portieren. Konkret:
  1. Kopf-Kommentar auf „ENTDECKEN … Kartenstil + Split-View sind Kopien aus einkehr.js/hero3d.js — Änderungen dort nachziehen".
  2. `BUILD`-Zeile: Selektor `script[src^="entdecken.js"]`.
  3. **`STYLE`** aus `einkehr.js` (Zeilen 33–118) **unverändert** übernehmen (Terrain/Water/Land/Wege/Route/Start/Wahl/Orte-Layer). Zusätzlich zwei Quellen+Layer für Themenrouten (vor `orte-punkt` einfügen), Daten leer:

```javascript
      touren: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
```
```javascript
      { id: 'tour-linie', type: 'line', source: 'touren',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#d9a441', 'line-width': 3, 'line-dasharray': [1.5, 1.2] } },
      { id: 'tour-num', type: 'symbol', source: 'touren',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': ['get', 'nr'], 'text-font': ['noto'], 'text-size': 13 },
        paint: { 'text-color': '#0d1b22', 'text-halo-color': '#d9a441', 'text-halo-width': 9 } },
```
  4. **`KAT`** ersetzen durch die sechs Entdecken-Kategorien:

```javascript
  const KAT = {
    wikinger: { name: 'Wikinger & Archäologie', einzel: 'Wikinger / Archäologie', farbe: '#d9a441' },
    kirche:   { name: 'Kirchen & Klöster',       einzel: 'Kirche / Kloster',       farbe: '#b48cf2' },
    schloss:  { name: 'Schlösser & Herrenhäuser', einzel: 'Schloss / Herrenhaus',   farbe: '#ff8f7a' },
    museum:   { name: 'Museen & Kultur',          einzel: 'Museum',                 farbe: '#45b1e2' },
    technik:  { name: 'Technik & Wahrzeichen',    einzel: 'Technik / Wahrzeichen',  farbe: '#7fd4a8' },
    denkmal:  { name: 'Denkmäler & Aussicht',     einzel: 'Denkmal / Aussicht',     farbe: '#9db4c0' },
  };
```
  5. `esc`, `distM`, `MAX_BOUNDS`, `state` (`{ orte:[], kat:'alle', suche:'', aktiv:null }`) aus einkehr übernehmen.
  6. **`gefiltert()`** übernehmen, Suchfelder anpassen: `[p.name, p.text].some(...)` (kein `ort`/`cuisine`/`adresse`).
  7. **`applyFilter()`**, **`renderChips()`**, **`bindUI()`** (Suche + Info + Flip) aus einkehr übernehmen (nur `EINKEHR`→`ENTDECKEN`, Klassennamen `ek-`→bleiben, da CSS kopiert).
  8. **`renderListe()`** aus einkehr übernehmen; die Karten-`innerHTML` vereinfachen: Untertitel = `KAT[p.cat].einzel`, plus Highlight-Stern und Kulturdenkmal-Häkchen:

```javascript
    for (const f of vis) {
      const p = f.properties;
      const li = document.createElement('li');
      li.className = 'ek-card' + (state.aktiv === f ? ' aktiv' : '');
      li.style.setProperty('--dot', KAT[p.cat].farbe);
      const sub = [KAT[p.cat].einzel, p.kulturdenkmal ? '🛡 Kulturdenkmal' : '']
        .filter(Boolean).join(' · ');
      li.innerHTML = `
        <div class="ek-card-kopf"><span class="dot"></span>
          <h2>${p.highlight ? '★ ' : ''}${esc(p.name)}</h2>
          ${c ? `<span class="entf">${fmtEntf(distM(c, f.geometry.coordinates))}</span>` : ''}</div>
        <p class="ek-card-sub">${esc(sub)}</p>`;
      li.addEventListener('click', (e) => { if (!e.target.closest('a, button')) waehle(f, false); });
      box.appendChild(li);
    }
```
  Sortierung in `renderListe()`: nach Highlight zuerst, dann Nähe — die vorhandene `.sort(...)` ersetzen durch:
```javascript
        .sort((x, y) => (y.properties.highlight ? 1 : 0) - (x.properties.highlight ? 1 : 0)
          || distM(c, x.geometry.coordinates) - distM(c, y.geometry.coordinates));
```
  `fmtEntf` übernehmen.
  9. **`waehle(f, ausKarte)`** vorerst minimal: Wahl-Ring setzen + `flyTo` (Detail-Rendering kommt in Task 7). Aus einkehr die Ring-/Fly-Zeilen übernehmen, den Popup-Block weglassen; am Ende Listen-Markierung wie in einkehr.
  10. **`init()`** aus einkehr übernehmen und anpassen: `fetch('entdecken.json…')`; Farbe/idx-Einbacken bleibt (`KAT[cat].farbe`); Karten-Klick-Handler `'orte-punkt'` bleibt (matcht per `id` statt name — s. u.); `map.on('moveend', renderListe)`; `window.ENTDECKEN = { _map: map, _state: state }`. Den `map.once('idle', …ladeGraph)` **erst in Task 8** ergänzen (jetzt weglassen). Klick-Match robuster über `id`:
```javascript
      map.on('click', 'orte-punkt', (e) => {
        const f = state.orte.find((o) => o.properties.id === e.features[0].properties.id);
        if (f) waehle(f, true);
      });
```
  Dazu in der `gj.features.forEach`-Schleife `f.properties.id` unangetastet lassen (kommt schon aus dem Bake).

- [ ] **Step 2: Syntax prüfen** — Run: `node --check entdecken.js` → keine Ausgabe (Erfolg).

- [ ] **Step 3: Headless-Funktionstest** — Server läuft; `entdecken.html` laden, auf Style + Daten warten, prüfen:
  - `ENTDECKEN._state.orte.length > 0`
  - `document.querySelectorAll('#chips .ek-chip').length === 7` (Alle + 6 Kategorien)
  - `document.querySelectorAll('#cards li').length > 0`
  - `map.queryRenderedFeatures({layers:['orte-punkt']}).length > 0`
  - Konsole fehlerfrei. Screenshot Desktop (1280) + iPhone (390).

- [ ] **Step 4: Filter/Move testen** — Chip „Kirchen & Klöster" klicken → `#count` sinkt, nur Kirchen sichtbar; Karte verschieben (`map.panBy`) → Liste aktualisiert (moveend). Screenshot.

- [ ] **Step 5: Commit**

```bash
git add entdecken.js
git commit -m "Entdecken: Karte, Kategorien, Liste-folgt-Karte, Chips"
```

---

## Task 7: Detailansicht mit Foto + Attribution + Badge

**Files:**
- Modify: `entdecken.js` (`waehle` → `zeigeDetail`)
- Test: headless — Detail öffnet mit Foto/Text

**Interfaces:**
- Consumes: `#detail`-Container, Feature-`properties` (`text, img, img_credit, img_license, text_source, wiki_url, website, kulturdenkmal, kulturdenkmal_text`).
- Produces: `zeigeDetail(f)`, `schliesseDetail()`; „Route hierher"-Knopf mit `class="ek-akt-route" data-id="…"` (Handler in Task 8), „Mehr erfahren"-Link.

- [ ] **Step 1: `zeigeDetail` einbauen** — in `waehle()` nach dem Wahl-Ring/`flyTo` aufrufen `zeigeDetail(f)`. Neue Funktionen:

```javascript
  function zeigeDetail(f) {
    const p = f.properties, el = $('#detail');
    const foto = p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : '';
    const credit = p.img && (p.img_credit || p.img_license)
      ? `<p class="ed-quelle">Foto: ${esc(p.img_credit || 'Wikimedia')}${p.img_license ? ' · ' + esc(p.img_license) : ''}</p>` : '';
    const badges = [KAT[p.cat].einzel, p.kulturdenkmal ? '🛡 geschütztes Kulturdenkmal' : '']
      .filter(Boolean).map((b) => `<span class="ed-badge">${esc(b)}</span>`).join('');
    const mehr = p.wiki_url || p.website;
    el.innerHTML = `
      <button class="ed-detail-x" id="detail-x" aria-label="Schließen">✕</button>
      ${foto}
      <div class="ed-detail-body">
        <h2>${esc(p.name)}</h2>
        <div>${badges}</div>
        ${p.text ? `<p>${esc(p.text)}</p>` : '<p>Für dieses Ziel liegt noch keine Beschreibung vor.</p>'}
        ${p.kulturdenkmal_text ? `<p class="ed-quelle">${esc(p.kulturdenkmal_text)}</p>` : ''}
        ${credit}
        ${p.text ? `<p class="ed-quelle">Text: ${esc(p.text_source || 'OpenStreetMap')}</p>` : ''}
        <div class="ek-card-akt">
          <button class="ek-akt ek-akt-route" data-id="${esc(p.id)}">→ Route hierher</button>
          ${mehr ? `<a class="ek-akt" target="_blank" rel="noopener" href="${esc(mehr)}">Mehr erfahren</a>` : ''}
        </div>
      </div>`;
    el.hidden = false;
    $('#detail-x').addEventListener('click', schliesseDetail);
  }
  function schliesseDetail() {
    $('#detail').hidden = true;
    state.aktiv = null;
    map?.getSource('wahl')?.setData({ type: 'FeatureCollection', features: [] });
    document.querySelectorAll('.ek-card.aktiv').forEach((n) => n.classList.remove('aktiv'));
  }
```

- [ ] **Step 2: Route-Delegation vorbereiten** — der Detail-Knopf nutzt `data-id`. In Task 8 wird der Klick-Handler `.ek-akt-route` darauf umgestellt. Jetzt nur sicherstellen, dass `zeigeDetail` gerendert wird.

- [ ] **Step 3: Syntax** — Run: `node --check entdecken.js` → Erfolg.

- [ ] **Step 4: Headless** — `ENTDECKEN._state.orte`-Feature mit `id==='haithabu'` über einen Klick simulieren (`waehle`), prüfen: `#detail` sichtbar, enthält `<h2>Haithabu`, einen Beschreibungsabsatz, bei vorhandenem `img` ein `<img>` mit gesetztem `src`; Badge-Text „geschütztes Kulturdenkmal" nur falls `kulturdenkmal`. Screenshot Desktop + iPhone (Bottom-Sheet).

- [ ] **Step 5: Commit**

```bash
git add entdecken.js entdecken.css
git commit -m "Entdecken: Foto-Detailansicht mit Attribution und Badge"
```

---

## Task 8: Routing „Route hierher" (Port aus einkehr.js)

**Files:**
- Modify: `entdecken.js`, `entdecken.html` (Routen-Panel ist bereits kopiert)
- Test: headless — Route wird berechnet

**Interfaces:**
- Consumes: `wege.json`, `#route-*`-DOM, `#pick-hinweis`, `state.orte`.
- Produces: `GRAPH_BBOX, KLASSE_LABEL, PROFILE, ladeGraph, bauGraph, nahKnoten, astar, wegbeschreibung, imGraph, fmtDauer, route`-Objekt, `zeigeRoutePanel(f)`, `berechneRoute()`, `bindRoute()`, `setStart`, Pick-Modus. Global `ENTDECKEN._zeigeRoute`.

- [ ] **Step 1: Routing-Block wörtlich portieren** — aus `einkehr.js` die Zeilen **136–463** (von `/* ── Routing … */` bis zum Ende von `bindRoute()`) **unverändert** nach `entdecken.js` kopieren (vor `renderListe`). Diese Blöcke sind vollständig eigenständig und hängen nur an DOM-IDs, die im kopierten HTML existieren. **Eine** Anpassung in `bindRoute()`: die `.ek-akt-route`-Delegation matcht jetzt über `data-id` statt `data-idx`:

```javascript
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.ek-akt-route');
      if (!b) return;
      e.stopPropagation();
      const f = state.orte.find((o) => o.properties.id === b.dataset.id);
      if (f) zeigeRoutePanel(f);
    });
```

- [ ] **Step 2: `zeigeRoutePanel` an die Detailkarte koppeln** — im kopierten `zeigeRoutePanel(f)` unverändert lassen; ergänzen, dass bei geöffnetem Detail dieses sichtbar bleibt (kein Konflikt — Panel liegt oberhalb). Kein weiterer Eingriff nötig.

- [ ] **Step 3: `bindRoute()` + lazy Graph aktivieren** — in `init()`:
  1. `bindRoute();` am Anfang von `init()` aufrufen (wie einkehr).
  2. Den in Task 6 ausgelassenen Lazy-Load ergänzen: nach `applyFilter`-Anbindung `map.once('idle', () => ladeGraph());`.
  3. `window.ENTDECKEN` erweitern: `{ _map: map, _state: state, _route: route, _setStart: setStart, _zeigeRoute: zeigeRoutePanel }`.
  4. Den Karten-`click`-Handler für den Pick-Modus aus einkehr (`map.on('click', (e) => { if (!route.pick) return; … setStart(…) })`) übernehmen.

- [ ] **Step 4: Syntax** — Run: `node --check entdecken.js` → Erfolg.

- [ ] **Step 5: Headless-Routentest** — `entdecken.html` laden, auf `idle` warten (Graph lädt). Dann:
  - `ENTDECKEN._zeigeRoute(ENTDECKEN._state.orte.find(o=>o.properties.id==='schloss-gottorf'))` → `#route-panel` sichtbar.
  - `ENTDECKEN._setStart([9.93,54.66],'Kappeln')` (Startpunkt im Netz) → nach kurzem Warten `map.getSource('route')._data.features[0].geometry.coordinates.length > 1`, `#route-summe` zeigt „… km · … min".
  - Startpunkt außerhalb (`[9.0,54.0]`) → Status enthält „außerhalb" + Google-Link.
  - Screenshot mit Routenlinie.

- [ ] **Step 6: Commit**

```bash
git add entdecken.js
git commit -m "Entdecken: Routenplanung zum Ziel (A*-Port aus einkehr)"
```

---

## Task 9: Themenrouten — Auswahl + Hervorhebung

**Files:**
- Modify: `entdecken.js`, `entdecken.css` (Touren-Chips sind bereits da)
- Test: headless — Tour hebt Ziele geordnet hervor

**Interfaces:**
- Consumes: `#touren`, Quelle `touren` im STYLE, `state.orte`.
- Produces: `ROUTEN`-Konstante, `renderTouren()`, `waehleTour(id)`, `state.tour`. Quelle `touren` erhält geordnete Punkte (`nr`) + eine `LineString`-Verbindung.

- [ ] **Step 1: `ROUTEN` definieren** (bei den Konstanten). Ziel-IDs = Slugs aus dem Bake. Die Kirchentour mit real gebackenen IDs füllen — dazu vorab prüfen:

Run: `python3 -c "import json;d=json.load(open('entdecken.json'))['features'];print([f['properties']['id'] for f in d if f['properties']['cat']=='kirche'][:12])"`

Dann die 4–6 markantesten Kirchen-IDs eintragen (z. B. `schleswiger-dom` plus die IDs von St. Marien Kappeln, Kirche Sieseby, Kirche Arnis, sofern vorhanden):

```javascript
  const ROUTEN = [
    { id: 'wikinger', name: '🛡 Wikinger & Welterbe',
      ziele: ['haithabu', 'danewerk', 'wikinger-museum-haithabu'] },
    { id: 'kirchen', name: '⛪ Kirchen der Schlei',
      ziele: ['schleswiger-dom' /* + reale Kirchen-IDs aus dem Bake ergänzen */] },
    { id: 'maritim', name: '⚓ Maritime Wahrzeichen',
      ziele: ['leuchtturm-schleimuende', 'heringszaun-kappeln', 'klappbruecke-kappeln', 'muehle-amanda'] },
  ];
```

- [ ] **Step 2: `renderTouren()` + `waehleTour()` einbauen** (nach `renderChips`)

```javascript
  function renderTouren() {
    const box = $('#touren');
    box.innerHTML = '';
    for (const t of ROUTEN) {
      const b = document.createElement('button');
      b.className = 'ed-tour';
      b.setAttribute('aria-pressed', String(state.tour === t.id));
      b.textContent = t.name;
      b.addEventListener('click', () => waehleTour(state.tour === t.id ? null : t.id));
      box.appendChild(b);
    }
  }

  function tourZiele(t) {
    // aufgelöste Features in Reihenfolge; fehlende IDs überspringen (robust)
    return t.ziele.map((id) => state.orte.find((o) => o.properties.id === id)).filter(Boolean);
  }

  function waehleTour(id) {
    state.tour = id;
    renderTouren();
    const src = map?.getSource('touren');
    if (!id) { src?.setData({ type: 'FeatureCollection', features: [] }); applyFilter(); return; }
    const t = ROUTEN.find((r) => r.id === id);
    const ziele = tourZiele(t);
    const feats = ziele.map((f, i) => ({ type: 'Feature',
      properties: { nr: String(i + 1) }, geometry: f.geometry }));
    if (ziele.length > 1) feats.push({ type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: ziele.map((f) => f.geometry.coordinates) } });
    src?.setData({ type: 'FeatureCollection', features: feats });
    // Liste auf die Tour-Ziele beschränken
    renderTourListe(ziele, t);
    if (ziele.length) {
      const bb = new maplibregl.LngLatBounds();
      ziele.forEach((f) => bb.extend(f.geometry.coordinates));
      map.fitBounds(bb, { padding: 80, maxZoom: 13, duration: 700 });
    }
  }

  function renderTourListe(ziele, t) {
    const box = $('#cards');
    $('#count').textContent = `Tour „${t.name}" — ${ziele.length} Ziele in Reihenfolge`;
    box.innerHTML = '';
    ziele.forEach((f, i) => {
      const p = f.properties;
      const li = document.createElement('li');
      li.className = 'ek-card';
      li.style.setProperty('--dot', KAT[p.cat].farbe);
      li.innerHTML = `<div class="ek-card-kopf"><span class="dot"></span>
        <h2>${i + 1}. ${esc(p.name)}</h2></div>
        <p class="ek-card-sub">${esc(KAT[p.cat].einzel)}</p>`;
      li.addEventListener('click', () => waehle(f, false));
      box.appendChild(li);
    });
    box.insertAdjacentHTML('beforeend',
      `<li class="ek-leer"><button class="ek-akt ek-akt-tour" id="tour-fahren">🧭 Tour abfahren</button></li>`);
  }
```

- [ ] **Step 3: In `init()` + `renderListe()` verzahnen** — `renderTouren();` nach `renderChips();` aufrufen. In `renderListe()` am Anfang: `if (state.tour) return;` (die Tour steuert die Liste selbst; ein Klick auf ein Kategorie-Chip in `applyFilter`/`renderChips` setzt `state.tour = null`). In `renderChips`' `mkChip`-Click zusätzlich `state.tour = null;` setzen. `state` um `tour: null` erweitern.

- [ ] **Step 4: Syntax** — Run: `node --check entdecken.js` → Erfolg.

- [ ] **Step 5: Headless** — Tour „Wikinger & Welterbe" per Klick auf den Chip wählen; prüfen: `map.getSource('touren')._data.features` enthält ≥ 3 Punkt-Features mit `nr` 1..n + eine LineString; `#cards` zeigt die Ziele nummeriert + Knopf „Tour abfahren". Screenshot (Karte mit nummerierten Marken + gestrichelter Linie).

- [ ] **Step 6: Commit**

```bash
git add entdecken.js entdecken.css
git commit -m "Entdecken: Themenrouten — Auswahl und Hervorhebung"
```

---

## Task 10: „Tour abfahren" — mehrbeiniges Routing

**Files:**
- Modify: `entdecken.js`
- Test: headless — durchgehende Tour-Route

**Interfaces:**
- Consumes: `astar`, `nahKnoten`, `ladeGraph`, `PROFILE`, `route.profil`, `tourZiele`.
- Produces: `fahreTour(t)` — kettet A\* über alle aufeinanderfolgenden Ziel-Paare, zeichnet den Streckenzug in Quelle `route`, Summe in `#route-summe`.

- [ ] **Step 1: `fahreTour` einbauen** (nach `berechneRoute`)

```javascript
  async function fahreTour(t) {
    const ziele = tourZiele(t);
    if (ziele.length < 2) return;
    $('#route-status') && ($('#route-status').textContent = 'Tour wird berechnet …');
    await ladeGraph();
    const v = PROFILE[route.profil].v;
    const coords = [];
    let dist = 0, dauer = 0, fehlend = 0;
    for (let i = 0; i < ziele.length - 1; i++) {
      const a = nahKnoten(...ziele[i].geometry.coordinates, route.profil);
      const b = nahKnoten(...ziele[i + 1].geometry.coordinates, route.profil);
      const weg = a >= 0 && b >= 0 ? astar(a, b, v, route.profil === 'auto') : null;
      if (!weg) { fehlend++; continue; }
      coords.push(...(coords.length ? weg.coords.slice(1) : weg.coords));
      dist += weg.dist; dauer += weg.dauer;
    }
    map.getSource('route').setData({ type: 'FeatureCollection',
      features: coords.length ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }] : [] });
    const panel = $('#route-panel'), erg = $('#route-erg'), summe = $('#route-summe');
    if (panel) panel.hidden = false;
    $('#route-ziel').textContent = t.name.replace(/^[^ ]+ /, '');
    summe.innerHTML = `Gesamttour · ${dist < 950 ? Math.round(dist / 10) * 10 + ' m'
      : (dist / 1000).toFixed(1).replace('.', ',') + ' km'} · ${fmtDauer(dauer)}
      ${fehlend ? `<small>${fehlend} Abschnitt(e) ohne Wegverbindung — evtl. per Boot/Fähre</small>`
        : '<small>Planung über OSM-Wegedaten — keine Navigation</small>'}`;
    if (erg) erg.hidden = false;
    if (coords.length) {
      const bb = new maplibregl.LngLatBounds();
      coords.forEach((c) => bb.extend(c));
      map.fitBounds(bb, { padding: 70, maxZoom: 13.5, duration: 700 });
    }
  }
```

- [ ] **Step 2: Knopf verdrahten** — delegiert (der Knopf entsteht in `renderTourListe`):

```javascript
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#tour-fahren')) return;
      const t = ROUTEN.find((r) => r.id === state.tour);
      if (t) fahreTour(t);
    });
```
(In `bindRoute()` oder `init()` einmalig registrieren.)

- [ ] **Step 3: Syntax** — Run: `node --check entdecken.js` → Erfolg.

- [ ] **Step 4: Headless** — Tour „Maritime Wahrzeichen" wählen, auf `idle` warten, `#tour-fahren` klicken; prüfen: `map.getSource('route')._data.features[0].geometry.coordinates.length > 5`, `#route-summe` zeigt „Gesamttour · … km · … min". Screenshot durchgehende Linie.

- [ ] **Step 5: Commit**

```bash
git add entdecken.js
git commit -m "Entdecken: Tour abfahren — mehrbeiniges Routing"
```

---

## Task 11: Integration — Nav, Footer, Deploy, Sitemap

**Files:**
- Modify: `index.html`, `regatta.html`, `angeln.html`, `einkehr.html`
- Modify: `.github/workflows/deploy.yml`, `sitemap.xml`
- Test: grep + headless Nav

**Interfaces:**
- Produces: „Entdecken"-Link in allen fünf `site-tabs`; Deploy-sed inkl. `entdecken.html`; Sitemap-Eintrag.

- [ ] **Step 1: Nav ergänzen** — in `index.html`, `regatta.html`, `angeln.html`, `einkehr.html` in `<nav class="site-tabs">` denselben Link einfügen (ohne `aria-current`, außer auf der eigenen Seite):

```html
      <a href="entdecken.html">&#9906; Entdecken</a>
```
(Prüfen, dass die Reihenfolge zu `entdecken.html` passt: Infocenter · Regatta · Beißfenster · Einkehr · Entdecken.)

- [ ] **Step 2: Footer-Werkzeugliste** — in `index.html` die Werkzeugzeile (aktuell „Regattaplaner · Beißfenster · Einkehr") um Entdecken erweitern:

```html
        · <a href="entdecken.html">Entdecken</a> (Sehenswürdigkeiten, Wikinger-Welterbe und Geschichte — Karte, Fotos, Routen)
```

- [ ] **Step 3: Deploy-sed erweitern** — in `.github/workflows/deploy.yml` die Zeile

```
run: sed -i "s/__BUILD__/${{ github.run_number }}/g" index.html regatta.html angeln.html einkehr.html
```
um `entdecken.html` am Ende ergänzen.

- [ ] **Step 4: Sitemap** — in `sitemap.xml` einen `<url>`-Block für `https://dieschlei.de/entdecken.html` nach dem einkehr-Block einfügen (gleiche Felder wie die anderen).

- [ ] **Step 5: Verifizieren**

Run: `grep -l "entdecken.html" index.html regatta.html angeln.html einkehr.html entdecken.html && grep entdecken .github/workflows/deploy.yml sitemap.xml`
Expected: alle fünf HTML-Dateien + deploy.yml + sitemap.xml nennen `entdecken.html`.
Zusätzlich headless: auf `index.html` und `einkehr.html` je ein `.site-tabs a[href="entdecken.html"]` vorhanden.

- [ ] **Step 6: Commit**

```bash
git add index.html regatta.html angeln.html einkehr.html .github/workflows/deploy.yml sitemap.xml
git commit -m "Entdecken: Navigation, Footer, Deploy-sed und Sitemap"
```

---

## Task 12: Gesamt-Verifikation + Doku

**Files:**
- Create: Scratchpad `verify-entdecken.js` (nicht committen)
- Modify: `CLAUDE.md`
- Test: voller headless Durchlauf Desktop + iPhone

**Interfaces:**
- Consumes: alles Vorherige.

- [ ] **Step 1: Verify-Skript schreiben** (Muster `.claude/skills/verify/SKILL.md`, WebGL-Flags wie bei hero3d). Prüfpunkte in einem Lauf: Seite lädt fehlerfrei; `ENTDECKEN._state.orte.length > 0`; 7 Chips; Klick Highlight → `#detail` mit `<img>` (falls `img`), Text, Badge; „Route hierher" + `_setStart` → Routenlinie + Summe; Tour „Wikinger & Welterbe" → nummerierte Marken + Linie; „Tour abfahren" → durchgehende Route. Screenshots Desktop (1280) und iPhone (390) je für: Übersicht, Detail, Route, Tour.

- [ ] **Step 2: Laufen lassen + Screenshots begutachten**

Run: `node --check entdecken.js && python3 -m http.server 8734 & node verify-entdecken.js`
Expected: alle Assertions grün; Screenshots zeigen gefärbte Punkte, lesbare Detailkarte (Desktop rechts unten, iPhone Bottom-Sheet), Routenlinie, nummerierte Tour.

- [ ] **Step 3: `prefers-reduced-motion` + a11y** — Lauf mit `page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}])`: Detailkarte erscheint ohne Animation; Nav-Links per Tab erreichbar; `#detail-x` fokussierbar.

- [ ] **Step 4: CLAUDE.md ergänzen** — nach dem „Einkehr"-Abschnitt einen Abschnitt „## Entdecken (`entdecken.html` + `entdecken.js` + `entdecken.css`)" einfügen: kuratierte Sehenswürdigkeiten aus `entdecken.json` (gebacken via `scripts/bake_entdecken.py` — OSM + Wikipedia-REST für Text/Foto + SH-Denkmalliste für das Badge, `pyproj` für EPSG:25832); Kartenstil/Split-View/Routing sind Kopien aus einkehr.js (Änderungen dort nachziehen); Themenrouten `ROUTEN` inkl. „Tour abfahren" (mehrbeiniges A\*); stabile `id` = Namensslug, Highlights überschreiben sie; Debug `window.ENTDECKEN`. In der Datenquellen-/Konventions-Liste die neuen Quellen (Wikipedia/Wikimedia, Denkmalliste SH) und den GoatCounter-Hinweis für die fünfte Seite ergänzen.

- [ ] **Step 5: Lokaler Gesamtcheck vor Push** — `node --check entdecken.js`; alle fünf Seiten kurz headless öffnen (keine Konsolenfehler); `git pull --rebase` (Badewasser-Cron); dann Commit.

```bash
git add CLAUDE.md
git commit -m "Entdecken: CLAUDE.md-Doku und Verifikation"
```

---

## Self-Review (Plan ↔ Spec)

- **Spec-Abdeckung:** kuratierte Ausrichtung (Task 1 Filter + Task 4) ✓; Hybrid-Beschreibungen (Task 2 + 4) ✓; Fotos + Attribution (Task 2, Task 7) ✓; Denkmal-Badge v1 (Task 3) ✓; Kategorien (Task 6) ✓; Split-View/Liste-folgt-Karte (Task 6) ✓; Detail (Task 7) ✓; Routing-Reuse (Task 8) ✓; Themenrouten inkl. „Tour abfahren" (Task 9–10) ✓; Integration Nav/Deploy/Sitemap/OG/GoatCounter (Task 5, 11) ✓; mobil + a11y + reduced-motion (Task 5, 12) ✓; Ehrlichkeitszeile (Task 5) ✓.
- **Platzhalter:** Kirchentour-IDs (Task 9) und die GeoJSON-Ressourcen-URL (Task 3) sind **datenabgeleitet** und als konkrete Beschaffungs-/Prüfschritte formuliert, keine offenen TODOs.
- **Typkonsistenz:** `id` (Slug) ist die durchgehende Referenz — Bake setzt sie, `waehle`/Route/`ROUTEN` lesen sie über `properties.id`; Klick-Handler auf `data-id`. `KAT`-Schlüssel = `cat`-Werte aus `kategorie()`. Quelle `touren`/`route`/`wahl`/`orte` konsistent zwischen STYLE und Renderern.
