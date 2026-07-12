#!/usr/bin/env python3
"""Kombi-Gelaendekacheln fuer den 3D-Hero: Land (AWS-Terrarium-DEM)
plus Seegrund (BSH-Bathymetrie) in eigene Terrarium-PNGs backen.

Nur Bake-Zeit. Abhaengigkeiten (venv empfohlen, PEP 668):
    python3 -m venv .venv && .venv/bin/pip install requests numpy pillow rasterio
Quellen: AWS Terrain Tiles (Namensnennung), BSH GeoSeaPortal (DL-DE-BY-2.0,
Coverage ELC_INSPIRE__EL.GridCoverage_balticsea, EPSG:25832 — siehe
.claude/specs/2026-07-12-terrain-spike.md). Ausgabe terrain/{z}/{x}/{y}.png
wird committet; zur Laufzeit gibt es keine externe Relief-Abhaengigkeit.
"""
import io, math, os
import numpy as np
import requests
from PIL import Image
import rasterio
from rasterio.warp import transform as warp_transform

BBOX = (9.40, 54.40, 10.20, 54.78)          # lon0, lat0, lon1, lat1
WATER_BBOX = (9.50, 54.47, 10.08, 54.72)    # Schlei + Rand: nur hier volle Aufloesung
ZOOMS = range(9, 14)
DETAIL_ZOOM = 13                            # ab hier nur Kacheln im WATER_BBOX
DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
# Spike-Ergebnis: BSH-Ostsee-Coverage, Subsets in UTM 32N (Metern)
BSH_URL = ('https://gdi.bsh.de/mapservice_gs/ELC_INSPIRE/ows?service=WCS&version=2.0.1'
           '&request=GetCoverage&coverageId=ELC_INSPIRE__EL.GridCoverage_balticsea'
           '&subset=E(525900,577200)&subset=N(6028000,6071000)&format=image/tiff')

def tile_range(z, bbox):
    def xy(lon, lat):
        r = math.radians(lat)
        n = 2 ** z
        return (int((lon + 180) / 360 * n),
                int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n))
    x0, y1 = xy(bbox[0], bbox[1]); x1, y0 = xy(bbox[2], bbox[3])
    return range(x0, x1 + 1), range(y0, y1 + 1)

def tile_lonlat_grid(z, x, y, size=256):
    n = 2 ** z
    xs = (x + (np.arange(size) + 0.5) / size) / n * 360 - 180
    ymerc = (y + (np.arange(size) + 0.5) / size) / n
    lats = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * ymerc))))
    return np.meshgrid(xs, lats)

def decode_terrarium(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

def encode_terrarium(elev):
    # Auf 0,25 m quantisieren: kaum Praezisionsverlust, deutlich kleinere PNGs
    v = np.round((np.clip(elev, -11000, 8900) + 32768) * 4) / 4
    r = np.floor(v / 256); g = np.floor(v % 256); b = np.floor((v - np.floor(v)) * 256)
    return Image.fromarray(np.stack([r, g, b], axis=-1).astype(np.uint8))

print('Bathymetrie laden (BSH) …')
tif = requests.get(BSH_URL, timeout=180); tif.raise_for_status()
ds = rasterio.open(io.BytesIO(tif.content))
bathy = ds.read(1).astype(np.float64)
if ds.nodata is not None:
    bathy[bathy == ds.nodata] = np.nan
bathy[bathy >= 0] = np.nan               # nur echte Tiefen uebernehmen
inv = ~ds.transform                       # E/N (25832) → Pixel
print(f'  {bathy.shape[1]}x{bathy.shape[0]} px, Abdeckung {(~np.isnan(bathy)).mean():.2f}')

def bathy_at(lons, lats):
    es, ns = warp_transform('EPSG:4326', ds.crs, lons.ravel(), lats.ravel())
    cols, rows = inv * (np.asarray(es), np.asarray(ns))
    cols = np.round(cols).astype(int); rows = np.round(rows).astype(int)
    ok = (rows >= 0) & (rows < bathy.shape[0]) & (cols >= 0) & (cols < bathy.shape[1])
    out = np.full(lons.size, np.nan)
    out[ok] = bathy[rows[ok], cols[ok]]
    return out.reshape(lons.shape)

total = 0
for z in ZOOMS:
    xr, yr = tile_range(z, WATER_BBOX if z >= DETAIL_ZOOM else BBOX)
    for x in xr:
        for y in yr:
            r = requests.get(DEM_URL.format(z=z, x=x, y=y), timeout=60)
            r.raise_for_status()
            elev = decode_terrarium(Image.open(io.BytesIO(r.content)))
            lons, lats = tile_lonlat_grid(z, x, y)
            depth = bathy_at(lons, lats)
            use = ~np.isnan(depth) & (elev <= 1.0)   # nur Wasserflaeche ersetzen
            elev[use] = depth[use]
            os.makedirs(f'terrain/{z}/{x}', exist_ok=True)
            encode_terrarium(elev).save(f'terrain/{z}/{x}/{y}.png', optimize=True)
            total += 1
    print(f'z{z}: fertig ({len(xr)}x{len(yr)})')
print(f'{total} Kacheln geschrieben')
