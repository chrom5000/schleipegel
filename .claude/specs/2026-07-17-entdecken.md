# Spec: Entdecken (Kultur & Geschichte an der Schlei)

**Ziel:** Fünfter Bereichs-Tab „Entdecken": kuratierte Sehenswürdigkeiten rund
um die Schlei — Wikinger-Welterbe (Haithabu, Danewerk), Schloss Gottorf,
Feldsteinkirchen, Museen, maritime Wahrzeichen — als Punkte auf der 3D-Karte mit
mitlaufender Liste, Foto-Detailansicht, Routenplanung zum Ziel und kuratierten
Themenrouten. Architektonisch ein naher Verwandter von `einkehr.html`; Fokus auf
*besuchenswerte* Ziele statt der vollständigen Denkmalliste.

## Grundentscheidungen (aus dem Brainstorming)

- Ausrichtung **kuratiert** („Entdecken"), nicht die volle Denkmalliste.
- Beschreibungen **hybrid**: automatische Basis aus OSM + Wikipedia, dazu ~15
  eigene deutsche Einführungstexte für die Top-Highlights.
- **Mit Fotos** (Wikimedia/Wikipedia, lizenzsauber mit Namensnennung).
- Denkmal-Badge (Abgleich SH-Denkmalliste) **schon in v1**.
- **Größerer** v1-Umfang: inkl. kuratierter Themenrouten.

## Datenpipeline (`scripts/bake_entdecken.py` → `entdecken.json`)

Einmalig gebacken (Muster: bake_einkehr / bake_seamarks), Laufzeit bleibt
abhängigkeitsfrei. Schritte:

1. **Overpass** in der Schlei-Bbox (`GRAPH_BBOX` deckt ab: `54.42,9.40,54.76,10.10`),
   node+way `out center`: `historic=*` (castle, manor, monument, memorial,
   archaeological_site, ruins, rune_stone, tumulus, boundary_stone), `tourism=`
   museum|artwork|attraction|viewpoint, `man_made=` lighthouse|windmill|tower,
   Kirchen (`amenity=place_of_worship` / `building=church|chapel`). Nur benannte
   Objekte; Felder: name, wikidata, wikipedia, website, Koordinate.
2. **Wikipedia-Summary** je Objekt mit Wiki-Bezug
   (`de.wikipedia.org/api/rest_v1/page/summary/{titel}`): liefert in *einem*
   Aufruf `extract` (Beschreibung), `thumbnail.source` (Foto) und Artikel-Link.
   Fallback-Bild über Wikidata P18/Commons. Attribution mitspeichern
   (`text_source`, `img_credit`, `img_license`).
3. **Denkmalliste-Abgleich (v1):** offizielle SH-Denkmalliste-GeoJSON server-seitig
   laden (opendata.schleswig-holstein.de / tomkyle.net — kein CORS-Thema, ggf.
   Datei ins Repo gelegt). Matching je Ziel: nächstes Denkmal im Radius ~30 m,
   Namensähnlichkeit als Rückfall → `kulturdenkmal: true` (+ optional amtliche
   Schutz-Begründung). Reine Anreicherung, Backbone bleibt OSM+Wikipedia.
4. **Filtern** auf besuchenswerte Kategorien (kein anonymes Schutz-Wohnhaus),
   **Dedupe** per Wikidata/Nähe.
5. **Kuratierte Highlights einmischen:** ~15 eigene deutsche Einführungstexte
   (verknüpft per Wikidata-ID/Slug), `highlight: true` → prominentere Sortierung;
   überschreiben den Auto-Text.
6. Kategorie-**Farbe** je Feature einbacken (wie `einkehr.json`).

Feld je Ziel (Auswahl): `id`, `name`, `cat`, `lon`, `lat`, `text`, `text_source`,
`img`, `img_credit`, `img_license`, `wiki_url`, `website`, `kulturdenkmal`,
`kulturdenkmal_text`, `highlight`, `farbe`.

## Kategorien (Farbe/Filter-Chips)

1. **Wikinger & Archäologie** (Haithabu, Danewerk — UNESCO —, Hügelgräber, Runensteine)
2. **Kirchen & Klöster** (Feldsteinkirchen, Dom Schleswig, St. Marien Kappeln)
3. **Schlösser & Herrenhäuser** (Schloss Gottorf, Gutshöfe)
4. **Museen & Kultur**
5. **Technik & Wahrzeichen** (Windmühlen, Leuchtturm Schleimünde, Heringszaun, Klappbrücke)
6. **Denkmäler & Aussicht** (Gedenksteine, Aussichtstürme, historische Ortskerne Arnis/Holm)

Palette dataviz-validiert (hell/dunkel), `farbe` beim Backen je Feature eingebacken.

## Frontend (`entdecken.html` / `.js` / `.css`)

Kopie des einkehr-Musters (bewusste Kopie wie regatta↔app.js; Änderungen dort
nachziehen). Lädt nur MapLibre, **nicht** app.js/hero3d.js.

- **Karte:** MapLibre-3D-Stil-Kopie (aus hero3d/einkehr, ohne Seezeichen/Tiefen),
  Circle-/Symbol-Layer je Kategorie gefärbt, Namen ab Zoom.
- **Split-View** (Airbnb): Liste folgt dem Kartenausschnitt (moveend → sortiert
  nach Nähe zur Mitte), Kategorie-Filter-Chips mit Zählern, Highlights zuerst.
- **Detailansicht:** Foto (mit Credit/Lizenz), Name, Kategorie-Badge,
  Beschreibung (kuratiert oder Wiki), „Mehr erfahren"-Link (Wikipedia/Website),
  „geschütztes Kulturdenkmal"-Badge falls `kulturdenkmal`, **„Route hierher"**.
- **Routing:** Routing-Block aus einkehr.js kopiert (A* über `wege.json`, Snap auf
  größte Komponente je Profil, Profile Auto/Rad/Fuß, Google-Maps-Fallback
  außerhalb der Graph-Bbox), lazy nach erstem idle.
- **Mobil ≤ 700 px:** Vollbild-Liste + schwebender Karte/Liste-Umschalter
  (`map.resize()` nach Umschalten). `prefers-reduced-motion`, interaktive
  SVG/DOM-Elemente mit `tabindex`/`<title>`.

## Themenrouten (v1)

Kuratierte Touren als Konstante `ROUTEN` in `entdecken.js` (Muster `BAHNEN` in
regatta.js): jede eine geordnete Liste von Ziel-IDs. Startset:

- „Wikinger & Welterbe": Haithabu → Danewerk → Wikinger-Museum → Runenstein
- „Kirchen der Schlei": (Auswahl Feldsteinkirchen)
- „Maritime Wahrzeichen": Leuchtturm Schleimünde → Heringszaun → Klappbrücke → Mühle

UI: Touren-Auswahl → Karte hebt die Ziele geordnet hervor + Verbindungslinie,
Liste zeigt sie in Reihenfolge mit kuratiertem Text. **„Tour abfahren"** kettet
die Ziele über die A*-Engine (**mehrbeinig**: A* je aufeinanderfolgendem
Ziel-Paar, Summe aus Distanz/Zeit), zeichnet den Streckenzug. Multi-Wegpunkt-
Routing ist die einzige echte Erweiterung der einkehr-Engine.

## Integration

- **Nav:** `site-tabs` auf allen fünf Seiten (index, regatta, angeln, einkehr,
  entdecken) um Link „Entdecken" erweitern; Footer-Werkzeugliste in index.html.
- **Deploy:** `entdecken.html` in die `sed __BUILD__`-Zeile in deploy.yml.
- **Cache-Busting:** neue Assets mit `?v=__BUILD__`.
- **Metadaten:** canonical, Open-Graph (eigene og:description), `sitemap.xml`.
- **Reichweitenmessung:** GoatCounter-Snippet mit Hostname-Guard
  (`location.hostname === 'dieschlei.de'`).
- MapLibre-Vendor wiederverwenden.

## Ehrlichkeit / Recht

- Fußzeile: „Daten © OpenStreetMap-Mitwirkende · Denkmaldaten © Land
  Schleswig-Holstein · Texte/Fotos: Auszüge aus Wikipedia/Wikimedia (CC BY-SA,
  mit Namensnennung) — ohne Gewähr auf Vollständigkeit."
- Foto- und Textquelle je Ziel sichtbar (Credit/Lizenz).
- Kartenhinweis wie sonst: nicht zur Navigation.

## Bewusst draußen (v2)

Vollständige Denkmalliste als eigener Datensatz, Öffnungszeiten/Live-Daten,
Favoriten, Punkt-Clustering (nur falls zu viele Punkte), Audioguides/Offline.
