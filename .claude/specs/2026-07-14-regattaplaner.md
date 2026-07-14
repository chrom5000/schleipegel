# Spec: Schlei-Regattaplaner

**Ziel:** Eigenständige Planer-Seite (`regatta.html`), auf der Segler eine Regattastrecke
von Tonne zu Tonne legen und mit der ICON-D2-Windvorhersage seriös durchrechnen:
Schenkelklassifikation (Kreuz/Halbwind/Raum/Vorwind), Wendeschläge innerhalb der
Uferlinie, Zeitbedarf nach Bootsklassen-Polare, animierte Abfahrt der Strecke.

## Entscheidungen

- **Eigene Seite**, kein Umbau des Hero: `regatta.html` + `regatta.js` + `regatta.css`.
  Lädt nur `vendor/maplibre-gl.*` — nicht `app.js`/`hero3d.js` (bewusste Duplikation
  von REVIER_POINTS und dem 3D-Stil für Isolation; Quelle ist jeweils app.js/hero3d.js).
- **Einstieg:** Button „Regatta" in den Hero-Controls + Footer-Link; Deploy-Workflow
  ersetzt `__BUILD__` künftig in `index.html` **und** `regatta.html`.
- **Bootsklassen** (Schlei-belegt durch Recherche 2026-07):
  Folkeboot (Schleipokal = Landesmeisterschaft, DFV-Flotte Schlei), H-Boot (NDM/DM
  Kappeln), Pirat (Piraten-KV „Schlei Weekend"), Conger (Regatten mit SBV Winnemark),
  ILCA 7, Europe, Opti (Jugendarbeit ASC/Fleckeby), J/70 (moderne Sportbootklasse),
  Fahrtenkreuzer ~30 ft (Yardstick-Feld der Mittwochsregatta/Blaues Band).
- **Polare:** parametrisches Näherungsmodell je Klasse — Rumpfgeschwindigkeits-Deckel
  (2,43·√LWL), Kurvenform je Typ (Verdränger-Kielboot / Jolle / Gleiter mit Gennaker),
  kalibriert an der öffentlich bekannten J/70-ORC-Polare und relativ skaliert über
  DSV-Yardstickzahlen. In der UI klar als „Näherungspolare" ausgewiesen.
- **Wind:** Open-Meteo ICON-D2 an den 7 Revierpunkten (wie app.js), stündlich +48 h,
  räumlich IDW-interpoliert, zeitlich linear (Richtung vektoriell).
- **Simulation:** Zeitschritt-Simulation (15 s) je Schenkel; direkter Kurs, wenn
  TWA zwischen Wende- und Halsenwinkel liegt, sonst VMG-Zickzack mit Wende an
  Layline oder Ufer-Lookahead (Landtest gegen land.geojson); Wendeverlust je Klasse.
- **Grenze der Seriosität** (muss sichtbar sein): ICON-D2 = 2,2-km-Gitter — lokale
  Abdeckung, Thermik und Kanalisierung der Schlei sind NICHT enthalten. Planung ja,
  Platztaktik nein. Drei Disclaimer-Orte: Info-Dialog, Caption, Footer-Zeile.

## UI (modernste Browsertechnik, maximale Politur)

- Vollbild-MapLibre-Szene im Revier-3D-Look (Stil aus hero3d übernommen), Marken-
  Schriften Bricolage Grotesque/Instrument Sans, Glass-Panels (backdrop-filter).
- Links: Kurspanel (nummerierte Marken, Drag-Reorder, Rundungsseite Bb/Stb, Distanzen).
- Rechts: Bootspanel (Klassenkarten mit Yardstick) + live Polardiagramm (Canvas)
  mit TWA-Zeiger.
- Unten: Startzeit-Regler über 48 h mit Wind-Sparkline + **Playback**: Geisterboot
  segelt die berechnete Route ab (Signature-Element), Uhr + Live-Daten laufen mit.
- Karteninteraktion: Klick auf Seezeichen = Wegpunkt (gesnappt, mit Name), Klick
  aufs Wasser = freier Wegpunkt; Kurslinie, Kreuz-Zickzack, Laylines als Layer.
- Teilen: Kurs+Klasse+Startzeit im URL-Hash; Web Share API/Clipboard; GPX-Export.
- `<dialog>` für Info/Klassenquellen, View Transitions wo verfügbar, volle
  `prefers-reduced-motion`-Unterstützung, Tastatur (Space = Play, ⌫ = letzte Marke).
- Mobil ≤700 px: Panels als Bottom-Sheet mit Tabs, Karte bleibt Vollbild.


## Nachtrag: SVA-Bahnvorlagen (2026-07-14)

Nutzerwunsch: Regatten wie in der Vereins-Bahnkarte planen (sva1981.de,
bahnkarten_2024.pdf). Umsetzung: Auswahlfeld „Bahn laden" im Kurspanel mit den
sechs SVA-Bahnen (Rot, Grün, Rot-Gelb, Grün-Gelb, Gelb, Weiß) als Markenfolgen
mit fester Rundungsseite. Tonnen 35/37/39/43/45 exakt aus seamarks.json (OSM,
deckungsgleich mit der Bahnkarte), GELB = OSM-Sondertonne „Regatta"
(54.62617, 9.90750), Startlinie vor Arnis genähert (54.6275, 9.9350; im
Info-Dialog ausgewiesen). Manuelle Kursänderung setzt die Bahnwahl zurück;
Bahnen sind über den URL-Hash teilbar wie jeder Kurs.
