# Schleipegel

Live-Wasserstände der Schlei (Ostsee) an den Pegeln **Schleswig** und **Kappeln** —
eine statische Website ohne Build-Schritt.

## Features

- Aktuelle Messwerte im Minutentakt mit Zustandseinstufung (MNW/MW/MHW), Tendenz und Höhe in m NHN
- Verlaufs-Chart der letzten 31 Tage (24 h bis 31 Tage, per `?range=7` verlinkbar) mit Crosshair-Tooltip, Referenzbändern und Tabellenansicht
- Hero mit der echten Schlei-Wasserfläche aus OpenStreetMap und live annotierten Pegelwerten
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
