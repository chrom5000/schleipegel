# Design: 3D-Hero „Revier 3D" mit Seekarten-Umschalter

**Datum:** 2026-07-12 · **Status:** vom Nutzer freigegeben (Chat, 12.07.2026)

## Ziel

Der Hero von dieschlei.de zeigt die Schlei als echte, perspektivische 3D-Szene
(WebGL, dunkler Marken-Look), auf der ein Segler alles Wesentliche auf einen
Blick abliest: Revierwind mit Böen, Pegel mit Tendenz, Wetter zum gewählten
Zeitpunkt, Ostsee-Zustand, Warnungen und Seekartendaten (Tonnen, Fahrwasser,
Tiefen). Umschaltbar auf eine klassische Seekarten-Ansicht
(FreeNauticalChart). Die heutige flache SVG-Silhouette entfällt als
Hauptansicht, bleibt aber als First Paint und Fallback erhalten.

## Entscheidungen (mit Nutzer geklärt)

| Frage | Entscheidung |
|---|---|
| Technik | Echte 3D-Szene mit WebGL, Engine: **MapLibre GL JS** |
| Umschalter | **3D ↔ Seekarte** (FNC-Kacheln); Silhouette nur noch Fallback |
| Daten in der Szene | Revierwind+Böen, Pegel+Tendenz, Wetter, Ostsee+Warnungen, **Seekartendaten** |
| Kamera | **Presets + freie Kamera** (Drehen/Neigen/Zoomen, begrenzt) |
| Look | **Dunkler Marken-Look** („Ostsee-Dämmerung") in 3D, Sonnenstand steuert Licht |
| Tiefen | **Echtes Unterwasser-Relief** (Land + Seegrund als kombiniertes Gelände, Wasser halbtransparent darüber), nicht nur Schattierung/Zahlen |

Gegen Three.js entschieden: Kamerasteuerung/Touch, Labels, Kachel-Draping und
die Seekarten-Ansicht wären Eigenbau (3–4× Aufwand); die Karten-Engine liefert
Ablesbarkeit — das Kernziel — von Haus aus.

## Architektur

- **`vendor/maplibre-gl.js` + `vendor/maplibre-gl.css`**: selbst gehostet,
  Version angepinnt, BSD-3-Lizenz, Referenzen mit `?v=__BUILD__`.
  Kein Build-Schritt, kein CDN.
- **`hero3d.js`**: neue Datei (klassisches Script wie `schlei-geo.js`) mit der
  gesamten 3D-Logik. Liest denselben `state` wie `app.js`; Renderer sind
  idempotent (Loader-schreiben-state / Renderer-lesen-state-Muster bleibt).
  `app.js` ruft nach Datenänderungen zusätzlich die hero3d-Renderer auf
  (no-op, solange die Szene nicht bereit ist).
- **Ladeverhalten**: SVG-Silhouette bleibt First Paint. `hero3d.js` und
  MapLibre laden asynchron (`defer`/dynamisches Einfügen); wenn die Karte
  `load` feuert, weiche Überblendung Silhouette → Szene. Kein WebGL,
  Ladefehler oder `prefers-reduced-motion`: Silhouette bleibt einfach stehen,
  Umschalter/Presets werden ausgeblendet.

## Ansichten & Umschalter

Eine Map-Instanz, zwei Stile (Stilwechsel per `setStyle`, Datenlayer werden
danach wieder aufgesetzt):

1. **„Revier 3D"** (Standard): Hintergrund `--hero-deep`; Gelände aus
   **selbst gebackenen Kombi-Kacheln** (Terrarium-kodiert; Land aus
   AWS-Terrain-DEM, Seegrund aus BSH-Bathymetrie; `scripts/bake_terrain.py`,
   Kacheln committet — zur Laufzeit keine DEM-/WMS-Abhängigkeit) mit
   Überhöhung ~2,5×. Die Fahrrinne, die Breiten und die Enge bei Missunde
   sind so als **echte 3D-Landschaft** erkennbar; darüber liegt die
   Wasserfläche aus der vorhandenen OSM-Geometrie (`schlei-geo.js` →
   GeoJSON) **halbtransparent**, sodass das Tiefenrelief durchscheint.
   Kamera geneigt (~55° Pitch). Rückfallstufe, falls der Spike lückenhafte
   BSH-Abdeckung der inneren Schlei zeigt: Relief nur wo Daten sind,
   Rest flächige Tiefenschattierung.
2. **„Seekarte"**: FNC-Rasterkacheln
   (`https://freenauticalchart.net/fnc-de/{z}/{x}/{y}.png`, CC0-Datenbasis,
   CORS offen — verifiziert), Pitch 0, Norden oben. Bildunterschrift ergänzt
   „nicht zur Navigation" (BSH-Vorgabe für Open Data).

Umschalt-Knopf im Hero; Wahl in `localStorage` (`hero-view`). **Datenlayer
liegen über beiden Ansichten** — mit einer Ausnahme: Seezeichen- und
Tiefen-Layer sind nur in „Revier 3D" aktiv, die Seekarte bringt beides
nativ mit (sonst doppelte Tonnen).

## Kamera

- Presets (flyTo): Ganze Schlei (Start), Innere Schlei, Missunder Enge,
  Kappeln/Arnis, Mündung.
- Frei: Rotation/Pitch/Zoom; `maxBounds` um die Schlei (~GEO_BBOX + Rand),
  `minZoom`/`maxZoom` begrenzt; Reset-Knopf = Start-Preset.
- Mobil: `cooperativeGestures` — Ein-Finger-Wischen scrollt die Seite,
  Karte reagiert auf zwei Finger.

## Datenlayer

| Layer | Darstellung | Quelle/Status |
|---|---|---|
| Pegel | „Pegellatten"-Säule je Station (Höhe/Farbe nach MNW–MHW-Einstufung), Billboard mit cm-Wert + Tendenzpfeil | vorhandener `state` |
| Revierwind | 7 aufrechte Pfeil-Symbole, Beaufort-Farben (w1–w4), Länge nach Stärke, Böen im Label; folgt dem Zeitregler | vorhandener `state.revierWind` |
| Windpartikel | Custom-WebGL-Layer, IDW-Logik aus `windTick` portiert, Partikel auf der Wasserfläche | Port |
| Wetter | Wetterzeile bleibt HTML unter dem Regler (unverändert) | vorhanden |
| Seezeichen | Fahrwassertonnen/Leuchtfeuer als Symbol-Layer (IALA rot/grün im Markenstil), Namen ab hohem Zoom | **neu**: `scripts/bake_seamarks.py` bäckt OSM-Seamarks → `seamarks.json` (committet, wie `schlei-geo.js`) |
| Tiefen | **Echtes Unterwasser-Relief** über die gebackenen Kombi-Geländekacheln (siehe Ansichten), Seegrund tiefenabhängig eingefärbt; punktuelle Tiefenzahlen nur, falls sich aus den BSH-Daten sinnvoll Punktwerte backen lassen — sonst entfällt der Teil | **neu**: BSH-Bathymetrie (GeoSeaPortal, DL-DE-BY-2.0) via `scripts/bake_terrain.py` |
| Ostsee | Badge Wellenhöhe/Wassertemp vor Schleimünde | vorhandener `state` (Marine) |
| Warnungen | Warnsymbol in der Szene bei aktiver DWD-Warnung (Banner bleibt) | vorhanden |
| Badestellen | klickbare Punkte wie heute | vorhanden |
| Licht | Sonnenstand (vorhandene Berechnung) steuert Lichtrichtung/-stimmung | vorhanden |

Zeitregler (+48 h) bleibt HTML unter dem Hero und steuert Windpfeile,
Partikelfeld und Wetterzeile in beiden Ansichten.

## Fehlerfälle

- Kein WebGL / MapLibre-Ladefehler / reduced-motion → Silhouette bleibt,
  3D-Bedienelemente ausgeblendet.
- FNC-Kacheln down → Hinweis am Umschalter, 3D bleibt nutzbar.
- Gelände-Kacheln sind gebacken und werden mit der Seite ausgeliefert —
  DEM/BSH sind nur beim Backen nötig, zur Laufzeit gibt es keine
  Relief-Abhängigkeit.
- Offene technische Prüfung in Phase 1 (Spike): BSH-Bathymetrie-Abdeckung
  der inneren Schlei (flächig genug fürs Relief?), Datenbezug fürs Backen
  (WMS/GeoTIFF), brauchbare FNC-Zoomstufen für das Schlei-Gebiet.

## Attribution

Bildunterschrift ergänzt: OSM (vorhanden), BSH (DL-DE-BY-2.0,
„Quelle: Bundesamt für Seeschifffahrt und Hydrographie"), FreeNauticalChart,
Terrarium/AWS Terrain Tiles. Seekarten-Ansicht zusätzlich:
„nicht zur Navigation".

## Phasen (einzeln live-fähig)

1. **Grundszene**: Spike (BSH-Abdeckung, Datenbezug, FNC-Zoomstufen), dann
   `scripts/bake_terrain.py` + Kombi-Geländekacheln, MapLibre einbinden,
   dunkler 3D-Stil (Unterwasser-Relief + halbtransparente Wasserfläche),
   Kamera-Presets + freie Kamera, Seekarten-Umschalter, Silhouetten-Fallback
   und Überblendung.
2. **Datenlayer**: Pegel, Revierwind, Ostsee, Warnungen, Badestellen,
   Zeitregler-Kopplung, Licht nach Sonnenstand.
3. **Seekartendaten + Animation**: Seamarks backen und rendern,
   Tiefenzahlen (falls machbar), Windpartikel-Port.

## Verifikation

Je Phase mit der Projekt-Verify (headless Chrome, puppeteer-core):
WebGL via SwiftShader (`--use-gl=angle`/`--enable-unsafe-swiftshader` je nach
Chrome-Version — in Phase 1 klären und in der Verify-Skill dokumentieren).
Screenshots Desktop (1280) + iPhone (390): Szene geladen, Umschalter beide
Richtungen, ein Preset-Flug, Zeitregler-Kopplung, Fallback (WebGL per Flag
deaktiviert → Silhouette sichtbar).

## Nicht-Ziele

- Kein Routing, keine Navigation, keine amtliche Seekarten-Genauigkeit.
- Kein Mond in der Szene (bleibt ggf. der Silhouette vorbehalten).
- Keine Änderung an Chart, Kacheln, Tabelle unterhalb des Heros.
