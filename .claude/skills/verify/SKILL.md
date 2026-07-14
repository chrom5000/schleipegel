---
name: verify
description: Schlei-Infocenter lokal starten und im headless Chrome verifizieren (statische Seite, keine Build-Stufe)
---

# Schlei-Infocenter verifizieren

Statische Seite ohne Build: `index.html` + `app.js` + `styles.css` direkt servieren.

## Starten

```bash
python3 -m http.server 8734   # im Repo-Root, als Background-Task
# Seite: http://localhost:8734/index.html
```

## Fahren (headless Chrome)

Claude-in-Chrome-Extension war hier schon mal nicht verbunden — Fallback, der funktioniert:

```bash
cd <scratchpad> && npm install puppeteer-core   # klein, kein Browser-Download
```

Puppeteer mit `executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`, `headless: "new"` starten.

- Daten kommen live von PEGELONLINE/Open-Meteo/DWD — `waitUntil: "networkidle2"` plus `waitForFunction` auf das konkrete Feature (z. B. `#wind-time-row` nicht mehr `hidden`).
- **WebGL (hero3d/MapLibre):** Launch-Args `["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]` — damit rendert MapLibre headless (verifiziert mit Chrome + maplibre-gl 5.24). Fallback-Test mit `["--disable-webgl", "--disable-webgl2"]` → Silhouette bleibt, `#hero3d-controls` bleibt `hidden`. Nach Moduswechsel ~6–8 s auf Kacheln/Terrain warten, dann Screenshot.
- Mobile-Check: Viewport 390×844, `isMobile: true`; auf horizontalen Overflow prüfen (`scrollWidth > innerWidth`).
- `?v=__BUILD__`-Query-Strings sind normal (Cache-Busting-Platzhalter, wird beim Deploy ersetzt).

## Gotchas

- Ein externer 404 in der Konsole ist vorbestehend (externe Ressource), nicht lokal.
- Hero rendert in beiden Farbschemata auf dunklem Grund (`--hero-deep`) — kein separater Dark-Mode-Check im Hero nötig.
- Deploy = Push auf main (GitHub Actions) → live auf dieschlei.de. Nichts pushen, nur lokal verifizieren.

## Regattaplaner (regatta.html)

Eigene Seite, eigener Zustand: `window.REGATTA = { _map, _state }` (analog `HERO3D._map`).
Kurs für Tests per URL-Hash setzen: `#b=<klasse>&t=<stundenindex>&k=lon~lat~side~name;…` —
Achtung: `page.goto` auf dieselbe URL mit anderem Hash ist eine Same-Document-Navigation
(kein `init()`); vorher `about:blank` laden. Wasserklicks über
`REGATTA._map.project([lon,lat])` legen — der Planer lehnt Klicks auf Land mit Toast ab
(Testpunkt vorher gegen `land.geojson` prüfen). Regression: `verify-regatta.js` +
`verify-regatta-nowebgl.js` im Scratchpad.
