# Schlei-Infocenter

Die Schlei auf einen Blick: Live-Wasserstände an den Pegeln **Schleswig** und
**Kappeln**, Wind mit 48-Stunden-Ausblick, amtliche Warnungen, Badewasserqualität
und Sonnenlauf — eine statische Website ohne Build-Schritt.

## Features

- Aktuelle Messwerte im Minutentakt mit Zustandseinstufung (MNW/MW/MHW), Tendenz und Höhe in m NHN
- Verlaufs-Chart der letzten 31 Tage (24 h bis 31 Tage, per `?range=7` verlinkbar) mit Crosshair-Tooltip, Referenzbändern und Tabellenansicht
- Wind-Pegel-Korrelation: Ost-West-Windkomponente (DWD Schleswig) zeitgleich unter dem Pegel-Chart, plus **Ausblick +48 h** (Open-Meteo/ICON) mit Jetzt-Linie
- Hero mit der echten Schlei-Wasserfläche aus OpenStreetMap, live annotierten Pegelwerten, **animiertem Wind** (Richtung/Stärke der DWD-Messung) und **Sonnenbogen** (Auf-/Untergang, Live-Sonnenstand, clientseitig berechnet)
- Amtliche DWD-Warnungen (Sturmflut/Unwetter) als Banner, nur bei aktiver Warnung sichtbar
- Wind-Kachel (Kompassrose, Beaufort), Ostsee-Kachel (Wassertemperatur/Wellenhöhe vor Schleimünde)
- Badewasserqualität aller Schlei-Badestellen auf der Karte (Open Data SH, täglich per GitHub-Actions-Cron aktualisiert)
- Leaflet-Karte (OSM) und Wikipedia-Kurzporträt der Schlei
- **Regattaplaner** (`regatta.html`): Strecke von Tonne zu Tonne legen, mit der
  ICON-D2-Windvorhersage durchrechnen — Schenkelklassifikation (Kreuz/Raum/Vorwind),
  simulierte Wendeschläge innerhalb der Uferlinie, Laylines, Zeitbedarf nach
  Bootsklasse (Folkeboot, H-Boot, J/70, Pirat, Conger, ILCA 7, Europe, Opti,
  Fahrtenkreuzer — Näherungspolaren, DSV-Yardstick-kalibriert), animierte Abfahrt
  der Route, GPX-Export und teilbare Kurs-Links — nicht zur Navigation
- **Beißfenster** (`angeln.html`): Angel-Fenster je Zielfischart (Hering, Hornhecht,
  Meerforelle, Zander, Barsch, Hecht, Aal, Plattfisch) für die nächsten 48 h —
  Heuristik aus Saison, Wassertemperatur, Licht, Wind, Luftdruck, Pegel-Einstrom
  und Mondphase, mit offengelegten Faktoren. Ohne Rechtsangaben: Schonzeiten,
  Mindestmaße und örtliche Regeln sind selbst zu recherchieren
- Hell-/Dunkelmodus nach Systemeinstellung, responsiv, `prefers-reduced-motion` wird respektiert

## Lokal starten

```sh
python3 -m http.server 8742
# → http://localhost:8742/
```

Ein beliebiger statischer Webserver genügt; die Seite ruft alle Daten clientseitig ab.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` veröffentlicht bei jedem Push auf `main`
automatisch über GitHub Actions. Einmalig im Repo aktivieren:
**Settings → Pages → Source → „GitHub Actions"**.

## Datenquellen

- Wasserstände: [PEGELONLINE](https://www.pegelonline.wsv.de/)-REST-API der
  Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV) — Rohdaten ohne Gewähr
- Karten, Gewässergeometrie, Küstenlinie & Seezeichen:
  © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende (ODbL)
- Tiefen-/Geländerelief („Revier 3D"): Bathymetrie des
  [BSH GeoSeaPortal](https://www.geoseaportal.de/) (dl-de/by-2-0,
  Quelle: Bundesamt für Seeschifffahrt und Hydrographie) und
  Terrain Tiles (AWS Open Data) — einmalig gebacken (`scripts/bake_terrain.py`)
- Seekarten-Ansicht: [FreeNauticalChart](https://freenauticalchart.net/)-Kacheln
  auf Basis wöchentlicher BSH-Open-Data — **nicht zur Navigation**
- Wind/Wetter: DWD via Bright Sky und Open-Meteo (ICON-D2, Marine)
- Badegewässerdaten: Land Schleswig-Holstein (dl-de/by-2-0)
- Enzyklopädie-Inhalte: [Wikipedia „Schlei"](https://de.wikipedia.org/wiki/Schlei) (CC BY-SA 4.0)
