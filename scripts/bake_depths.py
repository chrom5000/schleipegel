#!/usr/bin/env python3
"""Tiefenzahlen fuer Revier 3D backen → depths.json (GeoJSON).

Je ~600-m-Zelle der tiefste BSH-Messpunkt innerhalb der Schlei;
Zellen ohne echte Messung (Datenluecken) bekommen keine Zahl.
Nur Bake-Zeit; Quelle BSH GeoSeaPortal (DL-DE-BY-2.0).
"""
import io, json
import numpy as np
import requests
import rasterio
from rasterio.warp import transform as warp_transform

CELL = 12          # Rasterzellen a 50 m → ~600 m
MIN_DEPTH = -1.5   # flachere Zellen sind als Zahl uninteressant

BSH_URL = ('https://gdi.bsh.de/mapservice_gs/ELC_INSPIRE/ows?service=WCS&version=2.0.1'
           '&request=GetCoverage&coverageId=ELC_INSPIRE__EL.GridCoverage_balticsea'
           '&subset=E(525900,577200)&subset=N(6028000,6071000)&format=image/tiff')

# Nur innerhalb der Schlei (Bbox des Wasserpolygons), nicht die offene Ostsee
w = json.load(open('water.geojson'))['features'][0]['geometry']['coordinates']
lons = [p[0] for poly in w for ring in poly for p in ring]
lats = [p[1] for poly in w for ring in poly for p in ring]
LON0, LON1, LAT0, LAT1 = min(lons), max(lons), min(lats), max(lats)

tif = requests.get(BSH_URL, timeout=180); tif.raise_for_status()
ds = rasterio.open(io.BytesIO(tif.content))
d = ds.read(1).astype(float)
if ds.nodata is not None:
    d[d == ds.nodata] = np.nan
d[d >= 0] = np.nan

feats = []
h, wd = d.shape
for r0 in range(0, h - CELL, CELL):
    for c0 in range(0, wd - CELL, CELL):
        cell = d[r0:r0 + CELL, c0:c0 + CELL]
        if np.all(np.isnan(cell)) or np.nanmin(cell) > MIN_DEPTH:
            continue
        rr, cc = np.unravel_index(np.nanargmin(cell), cell.shape)
        e, n = ds.transform * (c0 + cc + 0.5, r0 + rr + 0.5)
        lon, lat = warp_transform(ds.crs, 'EPSG:4326', [e], [n])
        lon, lat = lon[0], lat[0]
        if not (LON0 <= lon <= LON1 and LAT0 <= lat <= LAT1):
            continue                                   # offene Ostsee auslassen
        depth = -float(np.nanmin(cell))
        feats.append({'type': 'Feature',
                      'properties': {'label': f'{depth:.1f}'.replace('.', ',')},
                      'geometry': {'type': 'Point', 'coordinates': [round(lon, 6), round(lat, 6)]}})

json.dump({'type': 'FeatureCollection', 'features': feats},
          open('depths.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(feats), 'Tiefenzahlen')
