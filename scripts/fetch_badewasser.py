#!/usr/bin/env python3
"""Badewasserqualität an der Schlei aus dem Open-Data-Portal Schleswig-Holstein.

Die Quelle (efi2.schleswig-holstein.de) erlaubt kein CORS für fremde Origins,
daher holt dieser Fetcher die Daten per GitHub-Actions-Cron und legt sie als
statisches badewasser.json neben die Website.

Quellen (Lizenz dl-de/by-2-0, Land Schleswig-Holstein):
  - Proben:     https://efi2.schleswig-holstein.de/bg/opendata/v_proben_odata.csv
  - Stammdaten: https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv

Beide Dateien sind pipe-getrennt, Latin-1, ohne Kopfzeile.
Proben-Spalten:     0=ID, 1=Name, 8=Datum, 10=E.coli, 11=Enterokokken, 12=Wassertemp
Stammdaten-Spalten: 0=ID, 3=Anzeigename, 24=Lon, 25=Lat, 26=Beschreibung, 27=Hinweis
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone

PROBEN_URL = 'https://efi2.schleswig-holstein.de/bg/opendata/v_proben_odata.csv'
STAMM_URL = 'https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv'
OUT = 'badewasser.json'


def fetch_lines(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Schleipegel/1.0 (github.com/chrom5000/schleipegel)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('latin-1').splitlines()


def num(s):
    try:
        return float(s.replace(',', '.'))
    except (ValueError, AttributeError):
        return None


def main():
    stamm = {}
    for line in fetch_lines(STAMM_URL):
        c = line.split('|')
        if len(c) > 27 and c[0].startswith('DESH') and c[1].upper().startswith('SCHLEI;'):
            stamm[c[0]] = {
                'name': c[3],
                'lon': num(c[24]),
                'lat': num(c[25]),
                'hinweis': c[27].strip() or None,
            }

    latest = {}
    for line in fetch_lines(PROBEN_URL):
        c = line.split('|')
        if len(c) < 13 or not c[0].startswith('DESH') or c[0] not in stamm:
            continue
        try:
            date = datetime.strptime(c[8], '%d.%m.%Y')
        except ValueError:
            continue
        if c[0] not in latest or date > latest[c[0]]['date']:
            latest[c[0]] = {
                'date': date,
                'ecoli': num(c[10]),
                'entero': num(c[11]),
                'wasserTemp': num(c[12]),
            }

    spots = []
    for sid, meta in sorted(stamm.items()):
        if meta['lat'] is None or meta['lon'] is None:
            continue
        probe = latest.get(sid)
        spots.append({
            'id': sid,
            'name': meta['name'],
            'lat': round(meta['lat'], 6),
            'lon': round(meta['lon'], 6),
            'hinweis': meta['hinweis'],
            'datum': probe['date'].strftime('%Y-%m-%d') if probe else None,
            'ecoli': probe['ecoli'] if probe else None,
            'entero': probe['entero'] if probe else None,
            'wasserTemp': probe['wasserTemp'] if probe else None,
        })

    if not spots:
        print('FEHLER: keine Schlei-Badestellen gefunden — Quellformat geändert?', file=sys.stderr)
        sys.exit(1)

    out = {
        'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'quelle': 'Land Schleswig-Holstein, Badegewässer-Daten (dl-de/by-2-0)',
        'spots': spots,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'{len(spots)} Badestellen geschrieben, neueste Probe: '
          f'{max((s["datum"] or "") for s in spots)}')


if __name__ == '__main__':
    main()
