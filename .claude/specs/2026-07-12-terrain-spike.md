# Spike-Ergebnis: Bathymetrie-Datenlage & FNC-Zoomstufen (Phase 1, Task 1)

**Datum:** 2026-07-12

## Entscheidung

**`BATHY_MODE = 'bsh-wcs'`** — der BSH-WCS liefert die innere Schlei flächig.
EMODnet-Fallback nicht nötig (Prüfung übersprungen, da BSH voll abdeckt).

## BSH-WCS (GeoSeaPortal, DL-DE-BY-2.0)

- Endpunkt: `https://gdi.bsh.de/mapservice_gs/ELC_INSPIRE/ows`
- Coverage: **`ELC_INSPIRE__EL.GridCoverage_balticsea`**
- CRS: **EPSG:25832** (UTM 32N) — Subsets als `E(…)`/`N(…)` in Metern,
  **nicht** Long/Lat! Das Bake-Skript transformiert mit `rasterio.warp`.
- Raster ~50 m, Float32, `nodata = 999999.0` (Land)
- Testausschnitt Kleine Breite (E 533000–545000, N 6037000–6047000):
  Wasserfläche vollständig gefüllt, Tiefen −0,5 … −5,4 m, Form der
  Schleswiger Bucht klar erkennbar (Screenshot im Session-Scratchpad).
- Bake-Bbox lon 9,40–10,20 / lat 54,40–54,78 in UTM:
  **E 525968–577180, N 6028101–6070971**

## FreeNauticalChart-Kacheln

`https://freenauticalchart.net/fnc-de/{z}/{x}/{y}.png` über der Schlei:

| z | Ergebnis |
|---|---|
| 7–15 | Inhalt vorhanden (2–14 kB, Stichproben Schleswig/Kappeln/Mitte) |
| 16–17 | leer (0 Bytes) |

→ **FNC-Quelle: `minzoom: 7`, `maxzoom: 15`** (MapLibre überzoomt darüber hinaus).

## Bake-Umgebung

`python3 -m venv` mit `requests numpy pillow rasterio` funktioniert
(macOS-System-Python ist PEP-668-verwaltet — venv nutzen, kein `pip3 --user`).
