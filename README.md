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
- Karten & Gewässergeometrie: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende (ODbL)
- Enzyklopädie-Inhalte: [Wikipedia „Schlei"](https://de.wikipedia.org/wiki/Schlei) (CC BY-SA 4.0)
