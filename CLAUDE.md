# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**Schlei-Infocenter** (dieschlei.de) — statische Website ohne Build-Schritt: Live-Pegel, Wind, Wetter, Warnungen, Badewasserqualität und Sonnenlauf für die Schlei. Drei Dateien tragen alles: `index.html`, `app.js`, `styles.css`. Sprache im Projekt ist Deutsch (UI, Kommentare, Commit-Messages).

## Kommandos

```sh
python3 -m http.server 8734        # lokal starten, kein Build nötig
node --check app.js                # Syntax-Check
```

- **Verifizieren:** `.claude/skills/verify/SKILL.md` — headless Chrome via puppeteer-core (die Claude-in-Chrome-Extension ist hier nicht verbunden). Screenshots in Desktop- (1280 px) und iPhone-Breite (390 px) prüfen.
- **Deploy:** Push auf `main` → `.github/workflows/deploy.yml` (GitHub Pages). Es gibt keinen Staging-Schritt — jeder Push geht live; vorher lokal verifizieren.
- **Vor dem Push:** `git pull --rebase` — `badewasser.yml` committet täglich (04:23 UTC) `badewasser.json` auf `main` und kommt gern dazwischen.

## Architektur

`app.js` ist ein bewusster Monolith (~2600 Zeilen), gegliedert in Abschnitts-Banner (`/* ── … ── */`):

- **Zentraler Zustand** im `state`-Objekt; `init()` (am Dateiende) orchestriert alles: erst Renderer für die statische Struktur, dann zweistufiges Laden (aktuelle Werte + 2 Tage schnell, 31 Tage Historie im Hintergrund mit Rückfallstufen), 5-Minuten-Auto-Refresh nur bei sichtbarem Tab.
- **Loader** (`loadCurrent`, `loadMeasurements`, `loadWind`, `loadRevierWind`, `loadMarine`, …) schreiben in `state`; **Renderer** (`renderChart`, `renderTiles`, `renderFjordGauges`, `renderRevierWind`, …) lesen daraus und sind idempotent — nach Datenänderung einfach erneut aufrufen.
- **Hero** ist ein SVG (`#fjord-svg`, viewBox `-40 -48 1080 828`) mit Schichten: Wasserfläche aus `schlei-geo.js` (gebackene OSM-Geometrie, Overpass-Relation 2340930), Sonnen-/Mondbahn (clientseitig berechnet, NOAA-Näherung), Windpfeile, Pegel-Marker. Geokoordinaten → SVG über `projGeo()` mit `GEO_BBOX` (muss zur Bbox in `schlei-geo.js` passen). Zoom/Pan läuft über `heroView` (viewBox-Manipulation).
- **Windanimation** ist ein Canvas-Overlay über dem Hero: Partikel holen ihren Ortswind per inverser Distanzwichtung aus den 7 `REVIER_POINTS` (ICON-D2), gekoppelt an Zeitregler (`state.revierIdx`) und Zoom; Fallback auf den globalen DWD-Vektor.
- **Windrichtungs-Konvention:** Meteorologische Richtung = woher der Wind kommt; die SVG-Pfeilgrundform zeigt nach Süden (= Strömung bei Nordwind), rotiert wird um `dir` — nicht um `dir + 180`.
- **hero3d.js**: MapLibre-Szene über der Silhouette (Modi `lite`/`3d`/`chart` via `data-hero-mode` auf `<html>`, API `window.HERO3D`; Standard ist `3d`, Silhouette = First Paint + Fallback). Gelände aus gebackenen Kombi-Kacheln (`terrain/`, `scripts/bake_terrain.py` — Land AWS-DEM + Seegrund BSH, EPSG:25832!), Wasser aus `water.geojson` (`scripts/bake_water_geojson.py`). MapLibre liegt gepinnt in `vendor/`. Spec/Plan unter `.claude/specs/` bzw. `.claude/plans/`.
- **hero3d-Datenlayer**: DOM-Marker (`maplibregl.Marker`) — überleben `setStyle` und liegen über 3D und Seekarte. hero3d liest die app.js-Globals (`state`, `classify`, `bftClass`, Formatter …) direkt; app.js ruft `window.HERO3D?.renderData?.()` am Ende von `renderTiles()`/`renderRevierWind()` und `renderLight?.()` in `renderSunLayer()`. Fallen: `rotationAlignment:'map'` zieht `pitchAlignment:'map'` nach — für aufrechte Billboards explizit `pitchAlignment:'viewport'` setzen; Windzahlen werden um `bearing − dir` gegenrotiert (Update im `rotate`-Event). MapLibres `load`-Event feuert **nur beim ersten** Stilaufbau — nach `setStyle` auf `idle` warten, sonst hängt der Moduswechsel.
- **Seekartendaten** (nur Revier 3D — die FNC-Seekarte hat sie nativ): `seamarks.json`/`depths.json` sind gebacken (`scripts/bake_seamarks.py`, `scripts/bake_depths.py`) und als Quellen+Layer **direkt im STYLE_3D-Dokument** definiert — so überleben sie `setStyle` ohne Re-Add-Logik. Text-Layer brauchen die selbst gehosteten Glyphen (`vendor/glyphs/noto/`, Fontstack-Name „noto"). Windpartikel: Canvas-Overlay `.h3-windcanvas` im Canvas-Container (über GL-Canvas, unter Markern), Partikel im Schirmraum, Richtung via `project/unproject`.

## Regattaplaner (`regatta.html` + `regatta.js` + `regatta.css`)

Eigenständige Seite, lädt nur MapLibre — **nicht** `app.js`/`hero3d.js`. `REVIER_POINTS`
und der 3D-Kartenstil sind bewusste Kopien (Quelle app.js/hero3d.js — Änderungen dort
hier nachziehen). Kurs per Klick auf Seezeichen (Snap via `queryRenderedFeatures`) oder
Wasser; kompletter Zustand im URL-Hash (`#b=…&t=…&k=…`). Rechenkern: Näherungspolare je
Bootsklasse (Rumpfgeschwindigkeits-Deckel 2,43·√LWL, Formfaktoren je Riggtyp,
DSV-Yardstick-Skalierung gegen J/70-ORC-Anker) + Zeitschritt-Simulation (12 s): direkter
Kurs zwischen Wende- und Halsenwinkel, sonst VMG-Zickzack mit Wende an der Layline oder
wenn der Bug-Lookahead Land sieht (`land.geojson`-PIP). Wind: ICON-D2 an den 7
Revierpunkten, zeitlich linear + räumlich IDW interpoliert. Der Deploy-Workflow ersetzt
`__BUILD__` in `index.html` **und** `regatta.html` — neue HTML-Seiten dort in den
sed-Aufruf aufnehmen.

## Beißfenster (`angeln.html` + `angeln.js` + `angeln.css`)

Kartenlose Werkzeug-Seite (kein MapLibre): Angel-Fenster je Zielfischart für 48 h.
Score = Saisonkurve × Temperaturfenster (Ostsee-SST als Proxy) × Licht (SunCalc-Kern
clientseitig) × Wind × Druckstabilität, Boni für Einstrom (PEGELONLINE Kappeln,
Pegel-Trend cm/h) und Mondphase. Artenprofile im `ARTEN`-Array (Verhaltensmuster,
keine Rechtsangaben!). **Bewusst ohne Schonzeiten/Mindestmaße** — stattdessen
Selbst-recherchieren-Hinweis an drei Stellen (Chip, Dialog, Startseiten-Footer);
das muss bei Änderungen erhalten bleiben. Debug-Handle: `window.BEISS`.

## Mobile

SVG-Texte skalieren mit der Karte und wären auf Telefonbreite unlesbar. Muster: `@media (max-width: 700px)` in `styles.css` hebt Schriftgrößen/Geometrie an (SVG-Attribute wie `r` per CSS), und Renderer fragen `matchMedia('(max-width: 700px)')` für Anker, Abstände und Größenfaktoren ab. Der Resize-Handler in `bindControls()` rendert betroffene Renderer nach. Neue Hero-Beschriftungen brauchen beide Seiten dieses Musters.

## Datenquellen (alle clientseitig, CORS-offen, ohne Schlüssel)

- **PEGELONLINE v2** (WSV): Pegel Schleswig/Kappeln, Rohdaten max. 31 Tage. Pegel Schleimünde ist außer Betrieb → liefert 404, wird bei jedem Laden erneut probiert (gewollt).
- **Bright Sky** (DWD): Windmessung Station Schleswig `04466`, `/alerts` für amtliche Warnungen.
- **Open-Meteo**: ICON-D2 (Revierwind + Wetter an 7 Punkten, Modellhorizont ~48 h — Zeitraster auf vorhandene Werte filtern) und Marine-API (Ostsee vor Schleimünde).
- **Badewasser SH**: kein CORS → GitHub-Actions-Cron (`scripts/fetch_badewasser.py`) schreibt `badewasser.json` ins Repo.

Verworfen nach Prüfung (kein CORS o. ä.): WarnWetter/bund.dev, UBA-Luftqualität, MUDAB. Details in der Memory-Datei `schlei-infocenter-projekt.md`.

## Konventionen

- **Cache-Busting:** `index.html` referenziert Assets mit `?v=__BUILD__`; der Deploy-Workflow ersetzt den Platzhalter durch die Run-Nummer. Neue Asset-Referenzen brauchen denselben Suffix.
- **Farben:** Die Paletten in `styles.css` (`:root`-Variablen) sind dataviz-validiert für Hell- und Dunkelmodus. Statusfarben (`--st-*`) sind fest, Serienfarben themenabhängig; im Hero (immer dunkel, `--hero-deep`) sind Festfarben mit `paint-order: stroke`-Halo das Muster.
- **Barrierefreiheit:** `prefers-reduced-motion` deaktiviert Animationen; interaktive SVG-Elemente bekommen `tabindex` und `<title>`.
