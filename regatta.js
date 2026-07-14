/* ═══════════════════════════════════════════════════════════════
   REGATTAPLANER — Strecke von Tonne zu Tonne, durchgerechnet mit
   der ICON-D2-Windvorhersage und klassenspezifischen Näherungspolaren.
   Eigenständige Seite: lädt nur MapLibre, nicht app.js/hero3d.js.
   REVIER_POINTS und Kartenstil sind bewusste Kopien (Quelle: app.js,
   hero3d.js) — Änderungen dort bitte hier nachziehen.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const BUILD = document.querySelector('script[src^="regatta.js"]')?.src.split('v=')[1] ?? 'dev';
  const $ = (s) => document.querySelector(s);
  const KN = 1.94384;                              // m/s → Knoten
  const MAX_BOUNDS = [[9.35, 54.38], [10.35, 54.80]];

  /* ── Revierpunkte (Kopie aus app.js) ─────────────────────────── */
  const REVIER_POINTS = [
    { name: 'Kleine Breite', lat: 54.513, lon: 9.585 },
    { name: 'Missunder Enge', lat: 54.532, lon: 9.665 },
    { name: 'Große Breite', lat: 54.51, lon: 9.72 },
    { name: 'Sieseby', lat: 54.59, lon: 9.81 },
    { name: 'Arnis', lat: 54.635, lon: 9.925 },
    { name: 'Kappeln', lat: 54.663, lon: 9.985 },
    { name: 'Schleimünde', lat: 54.671, lon: 10.03 },
  ];

  /* ── Bootsklassen der Schlei ─────────────────────────────────────
     Belegt durch Recherche (07/2026): Folkeboot (Schleipokal = LM,
     DFV-Flotte Schlei), H-Boot (Meisterschaften Kappeln), Pirat
     („Schlei Weekend"), Conger (Regatten mit SBV Winnemark), ILCA 7 /
     Europe / Opti (Jugendarbeit ASC u. a.), J/70 (moderne Sportboot-
     klasse), Fahrtenkreuzer (Yardstick-Feld der Mittwochsregatta).
     ys = DSV-Yardstickzahl (Näherung), lwl = Wasserlinie in m,
     up = Formfaktor am Wind, rig = none|spi|gennaker,
     beat = Basis-Wendewinkel (TWA), tack = Wendeverlust in s. */
  const KLASSEN = [
    { id: 'folkeboot', name: 'Folkeboot', typ: 'Kielboot', ys: 118, lwl: 6.05, rig: 'none', up: 0.78, beat: 47, tack: 10 },
    { id: 'hboot', name: 'H-Boot', typ: 'Kielboot · Spi', ys: 108, lwl: 6.20, rig: 'spi', up: 0.80, beat: 45, tack: 9 },
    { id: 'j70', name: 'J/70', typ: 'Sportboot', ys: 97, lwl: 6.40, rig: 'gennaker', up: 0.85, beat: 44, tack: 8, planing: true },
    { id: 'kreuzer', name: 'Fahrtenkreuzer', typ: 'Yacht ~30 ft', ys: 106, lwl: 8.20, rig: 'none', up: 0.78, beat: 48, tack: 14 },
    { id: 'pirat', name: 'Pirat', typ: 'Jolle · Spi', ys: 121, lwl: 4.60, rig: 'spi', up: 0.80, beat: 46, tack: 6 },
    { id: 'conger', name: 'Conger', typ: 'Jolle', ys: 124, lwl: 4.35, rig: 'none', up: 0.78, beat: 47, tack: 6 },
    { id: 'ilca7', name: 'ILCA 7', typ: 'Jolle', ys: 114, lwl: 4.06, rig: 'none', up: 0.80, beat: 45, tack: 5, planing: true },
    { id: 'europe', name: 'Europe', typ: 'Jolle', ys: 118, lwl: 3.35, rig: 'none', up: 0.78, beat: 45, tack: 5 },
    { id: 'opti', name: 'Optimist', typ: 'Jugendjolle', ys: 163, lwl: 2.16, rig: 'none', up: 0.78, beat: 50, tack: 5 },
  ];

  /* ── Näherungspolare ─────────────────────────────────────────────
     Referenzpotential: bestes Reach-Tempo eines J/70-artigen Sport-
     boots (an die öffentliche ORC-Polare angelehnt), relativ skaliert
     über die DSV-Yardstickzahl. Verdränger laufen weich gegen die
     Rumpfgeschwindigkeit (2,43·√LWL), Gleiter dürfen raumschots bei
     Wind darüber hinaus. Alles Näherung — die UI sagt das dazu. */
  const POT = [[0, 0], [2, 1.6], [4, 3.4], [6, 4.8], [8, 5.9], [10, 6.6], [12, 7.2],
               [14, 7.9], [16, 8.7], [20, 10.6], [25, 12.6], [30, 13.5]];

  const lerp = (a, b, f) => a + (b - a) * f;
  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        return lerp(table[i - 1][1], table[i][1], (x - table[i - 1][0]) / (table[i][0] - table[i - 1][0]));
      }
    }
    return table[table.length - 1][1];
  }

  const hullSpeed = (lwl) => 2.43 * Math.sqrt(lwl);

  function beatTWA(cls, twsKn) {
    return cls.beat + (twsKn < 6 ? 6 : twsKn < 8 ? 3 : 0) - (twsKn > 16 ? 1 : 0);
  }
  function runTWA(cls, twsKn) {                    // ab hier wird gehalst statt platt gelaufen
    if (cls.rig === 'gennaker') return twsKn < 8 ? 140 : twsKn < 14 ? 148 : 155;
    if (cls.rig === 'spi') return twsKn < 8 ? 162 : 172;
    return 180;                                    // ohne Spi: Vorwind direkt
  }

  function shape(cls, twa, twsKn) {
    const spi = cls.rig !== 'none';
    const pts = [
      [beatTWA(cls, twsKn), cls.up], [60, 0.94], [80, 1], [110, 1],
      [135, spi ? 0.97 : 0.88], [150, spi ? 0.92 : 0.80],
      [165, spi ? 0.85 : 0.70], [180, spi ? 0.78 : 0.62],
    ];
    let s = interp(pts, Math.max(twa, pts[0][0]));
    if (!spi && twsKn < 6 && twa > 120) s *= 0.9;  // Leichtwind ohne Spi: zäh vor dem Wind
    return s;
  }

  /* Bootsgeschwindigkeit in kn bei TWS (kn) und TWA (°) */
  function polar(cls, twsKn, twa) {
    const raw = interp(POT, twsKn) * (96 / cls.ys) * shape(cls, twa, twsKn);
    const cap = hullSpeed(cls.lwl);
    const capped = raw / (1 + (raw / cap) ** 8) ** (1 / 8);   // weiches Minimum
    if (cls.planing) {
      const p = Math.min(1, Math.max(0, (twsKn - 12) / 6)) * Math.min(1, Math.max(0, (twa - 90) / 30));
      return lerp(capped, raw * 0.95, p);
    }
    return capped;
  }

  /* ── Geometrie (lokale Näherung — die Schlei ist klein) ───────── */
  const D2R = Math.PI / 180;
  const M_LAT = 110540;
  const mLon = (lat) => 111320 * Math.cos(lat * D2R);
  const wrap180 = (x) => ((x + 540) % 360) - 180;
  const wrap360 = (x) => ((x % 360) + 360) % 360;
  function dist(a, b) {                            // [lon,lat] → Meter
    return Math.hypot((b[0] - a[0]) * mLon((a[1] + b[1]) / 2), (b[1] - a[1]) * M_LAT);
  }
  function bearing(a, b) {
    return wrap360(Math.atan2((b[0] - a[0]) * mLon(a[1]), (b[1] - a[1]) * M_LAT) / D2R);
  }
  function dest(p, brg, d) {
    return [p[0] + Math.sin(brg * D2R) * d / mLon(p[1]), p[1] + Math.cos(brg * D2R) * d / M_LAT];
  }

  /* Landtest gegen land.geojson (vorbereitete Ringe mit Bbox) */
  let LAND = null;
  function prepLand(gj) {
    LAND = [];
    for (const f of gj.features) {
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const rings of polys) {
        const o = rings[0];
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [x, y] of o) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        LAND.push({ bbox: [x0, y0, x1, y1], rings });
      }
    }
  }
  function pip(x, y, ring) {
    let ins = false;
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
      if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) / (y2 - y1) * (x2 - x1)) ins = !ins;
    }
    return ins;
  }
  function onLand(p) {
    if (!LAND) return false;
    for (const { bbox, rings } of LAND) {
      if (p[0] < bbox[0] || p[0] > bbox[2] || p[1] < bbox[1] || p[1] > bbox[3]) continue;
      if (pip(p[0], p[1], rings[0]) && !rings.slice(1).some((h) => pip(p[0], p[1], h))) return true;
    }
    return false;
  }

  /* ── Bahnvorlagen: SVA-Bahnkarten (Segelverein Arnis) ────────────
     Bahnen über die Fahrwassertonnen der Arnisser Breite. Tonnen-
     lagen exakt aus seamarks.json (OSM); GELB (Vereinstonne) und
     Start-/Ziellinie aus der Bahnkarte GENÄHERT — die UI sagt das.
     Folge-Kürzel: Zahl+s/b = Tonne Stb/Bb runden, G = GELB. */
  const BAHN_MARKEN = {
    35: [9.93190, 54.62665], 37: [9.92892, 54.62513], 39: [9.92303, 54.62395],
    43: [9.90742, 54.61971], 45: [9.89485, 54.61507],
    G: [9.90750, 54.62617],                        // OSM-Tonne „Regatta" (gelb)
    START: [9.9350, 54.6275],                      // genähert: Startlinie vor Arnis
  };
  const BAHNEN = {
    rot: { name: 'Rot', folge: '35s 37s Gb 45b 39b Gb 43b 37b 35b' },
    gruen: { name: 'Grün', folge: '35s 37s 45s Gs 39s 43s Gs 37b 35b' },
    rotgelb: { name: 'Rot-Gelb', folge: '35s 37s Gb 43b 39b 43b 37b 35b' },
    gruengelb: { name: 'Grün-Gelb', folge: '35s 37s 43s Gs 39s 43s 37b 35b' },
    gelb: { name: 'Gelb', folge: '35s 37s Gb 39b Gb 39b Gb 39b 37b 35b' },
    weiss: { name: 'Weiß', folge: '35s 37s Gb 39b Gb 39b 37b 35b' },
  };
  let bahnLaedt = false;

  function ladeBahn(id) {
    const b = BAHNEN[id];
    if (!b) return;
    const marken = b.folge.split(' ').map((tok) => {
      const side = tok.at(-1) === 's' ? 'stb' : 'bb';
      const key = tok.slice(0, -1);
      return { pos: [...BAHN_MARKEN[key]],
               name: key === 'G' ? 'GELB (Regatta-Tonne)' : `Tonne ${key}`, side };
    });
    state.course = [
      { pos: [...BAHN_MARKEN.START], name: 'Startlinie Arnis', side: 'stb' },
      ...marken,
      { pos: [...BAHN_MARKEN.START], name: 'Ziellinie Arnis', side: 'stb' },
    ];
    bahnLaedt = true;
    afterCourseChange();
    bahnLaedt = false;
    if (map) {
      const bb = new maplibregl.LngLatBounds();
      state.course.forEach((m) => bb.extend(m.pos));
      const mobil = matchMedia('(max-width: 700px)').matches;
      map.fitBounds(bb, {
        padding: mobil ? { top: 100, bottom: 210, left: 40, right: 40 }
                       : { top: 120, bottom: 160, left: 340, right: 340 },
        maxZoom: 14,
      });
    }
    toast(`Bahn ${b.name} geladen — Lage der Startlinie ist genähert`);
  }

  /* ── Zustand ─────────────────────────────────────────────────── */
  const state = {
    course: [],                                    // {pos:[lon,lat], name, side:'stb'|'bb'}
    boat: 'folkeboot',
    startIdx: 0,                                   // Index ins Stundenraster
    wind: null,                                    // {times:[Date], points:[{lat,lon,hours:[{u,v,gust}]}]}
    sim: null,                                     // Ergebnis von simulate()
    playing: false,
  };
  const cls = () => KLASSEN.find((k) => k.id === state.boat);

  /* ── Wind: ICON-D2 laden + interpolieren ─────────────────────── */
  async function loadWind() {
    const lats = REVIER_POINTS.map((p) => p.lat).join(',');
    const lons = REVIER_POINTS.map((p) => p.lon).join(',');
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&models=icon_d2&wind_speed_unit=ms&timezone=UTC&forecast_days=3`);
    const arr = await r.json().then((d) => (Array.isArray(d) ? d : [d]));
    const now = Date.now();
    const idxs = arr[0].hourly.time
      .map((t, i) => ({ t: new Date(`${t}:00Z`), i }))
      .filter(({ t, i }) => t.getTime() >= now - 3600e3 && t.getTime() <= now + 48.5 * 3600e3
        && arr[0].hourly.wind_speed_10m[i] != null);
    state.wind = {
      times: idxs.map(({ t }) => t),
      points: REVIER_POINTS.map((p, pi) => ({
        ...p,
        hours: idxs.map(({ i }) => {
          const ms = arr[pi].hourly.wind_speed_10m[i];
          const dir = arr[pi].hourly.wind_direction_10m[i];
          return { u: -ms * Math.sin(dir * D2R), v: -ms * Math.cos(dir * D2R),
                   gust: arr[pi].hourly.wind_gusts_10m[i] };
        }),
      })),
    };
    const sl = $('#time-slider');
    sl.max = String(state.wind.times.length - 1);
    state.startIdx = Math.min(state.startIdx, state.wind.times.length - 1);
  }

  /* Wind an Ort und (Milli-)Zeit: zeitlich linear, räumlich IDW */
  function windAt(pos, tMs) {
    const w = state.wind;
    if (!w) return null;
    const t0 = w.times[0].getTime();
    const f = Math.min(Math.max((tMs - t0) / 3600e3, 0), w.times.length - 1.001);
    const i = Math.floor(f), fr = f - i;
    let su = 0, sv = 0, sg = 0, sw = 0;
    for (const p of w.points) {
      const dx = (pos[0] - p.lon) * mLon(p.lat) / 1000, dy = (pos[1] - p.lat) * M_LAT / 1000;
      const wgt = 1 / (dx * dx + dy * dy + 2.25);
      const a = p.hours[i], b = p.hours[i + 1] ?? a;
      su += wgt * lerp(a.u, b.u, fr); sv += wgt * lerp(a.v, b.v, fr);
      sg += wgt * lerp(a.gust, b.gust, fr); sw += wgt;
    }
    const u = su / sw, v = sv / sw;
    return { ms: Math.hypot(u, v), dir: wrap360(Math.atan2(-u, -v) / D2R), gust: sg / sw };
  }

  /* ── Simulation ──────────────────────────────────────────────────
     Zeitschritte je Schenkel: direkter Kurs, wenn der TWA zwischen
     Wende- und Halsenwinkel liegt, sonst VMG-Zickzack. Gewendet wird
     an der Layline oder wenn der Bugausleger Land sieht. */
  const DT = 12;                                   // s je Schritt
  const RUNDUNG_R = 28;                            // m Bogenradius um die Marke

  /* Bogen um eine Bahnmarke: Bb = gegen, Stb = im Uhrzeigersinn.
     aStart = Peilung Marke→Boot bei Ankunft, aEnd = seitlicher
     Versatz zur Peilung des nächsten Schenkels. */
  function rundungsBogen(M, aStart, brgOut, side) {
    const ccw = side === 'bb';
    const aEnd = wrap360(ccw ? brgOut + 90 : brgOut - 90);
    let sweep = ccw ? wrap360(aStart - aEnd) : wrap360(aEnd - aStart);
    if (sweep > 335) sweep = 335;                  // entartete Volldrehung kappen
    const pts = [];
    for (let a = 0; a < sweep; a += 16) {
      pts.push(dest(M, wrap360(ccw ? aStart - a : aStart + a), RUNDUNG_R));
    }
    pts.push(dest(M, aEnd, RUNDUNG_R));
    return pts;
  }

  function simulate() {
    state.sim = null;
    if (state.course.length < 2 || !state.wind || !LAND) return;
    const boat = cls();
    const t0 = state.wind.times[state.startIdx].getTime();
    let t = t0;
    let pos = [...state.course[0].pos];
    const track = [];
    const legs = [];
    let steps = 0;

    for (let li = 1; li < state.course.length; li++) {
      const target = state.course[li].pos;
      const legT0 = t, legSailed0 = trackDist(track);
      let tacks = 0, tackSign = 0;
      const modeTime = {};

      while (steps++ < 20000) {
        const w = windAt(pos, t);
        const tws = w.ms * KN;
        const brgT = bearing(pos, target);
        const dRem = dist(pos, target);
        const beatA = beatTWA(boat, tws), runA = runTWA(boat, tws);
        const twaDirect = Math.abs(wrap180(brgT - w.dir));

        let heading, twa, mode;
        if (twaDirect < beatA - 0.5) {             // Kreuzen
          mode = 'kreuz'; twa = beatA;
          const rel = wrap180(brgT - w.dir);
          if (!tackSign) tackSign = rel >= 0 ? 1 : -1;
          if (tackSign * rel <= -(beatA - 2)) { tackSign *= -1; tacks++; t += boat.tack * 1000; }
          heading = wrap360(w.dir + tackSign * beatA);
        } else if (twaDirect > runA + 0.5) {       // Vorwind-Kreuz (Halsen)
          mode = 'vorwindkreuz'; twa = runA;
          const rel = wrap180(brgT - w.dir - 180);
          const lim = 180 - runA;
          if (!tackSign) tackSign = rel >= 0 ? 1 : -1;
          if (tackSign * rel <= -(lim - 2)) { tackSign *= -1; tacks++; t += boat.tack * 500; }
          heading = wrap360(w.dir + 180 - tackSign * lim);
        } else {                                   // direkt
          heading = brgT; twa = twaDirect; tackSign = 0;
          mode = twa < 60 ? 'amwind' : twa < 110 ? 'halbwind' : twa < 155 ? 'raum' : 'vorwind';
        }

        let v = Math.max(polar(boat, tws, twa), 0.35) / KN;   // m/s, Restfahrt bei Flaute

        /* Bugausleger: sieht der Kurs in ~40 s Land, wird gewendet/ausgewichen */
        const look = Math.max(60, v * 40);
        if (onLand(dest(pos, heading, look))) {
          if (mode === 'kreuz' || mode === 'vorwindkreuz') {
            tackSign *= -1; tacks++; t += boat.tack * 1000;
            heading = mode === 'kreuz'
              ? wrap360(w.dir + tackSign * beatA)
              : wrap360(w.dir + 180 - tackSign * (180 - runA));
          } else {
            for (const off of [30, -30, 55, -55, 80, -80]) {  // greedy ausweichen
              if (!onLand(dest(pos, wrap360(heading + off), look))) { heading = wrap360(heading + off); break; }
            }
            twa = Math.abs(wrap180(heading - w.dir));
            v = Math.max(polar(boat, tws, Math.max(twa, beatA)), 0.35) / KN;
          }
        }

        track.push({ pos: [...pos], t, heading, twa, v: v * KN, tws, dir: w.dir, mode });
        modeTime[mode] = (modeTime[mode] ?? 0) + DT;

        /* Ankunft: Ziellinie direkt durchfahren; Rundungsmarken schon
           außerhalb des Bogenradius verlassen, damit die Anfahrt nie
           dichter (oder auf der falschen Seite) an der Tonne vorbeiläuft */
        const istZiel = li === state.course.length - 1;
        if (dRem < (istZiel ? Math.max(32, v * DT * 1.2) : RUNDUNG_R + v * DT)) {
          if (istZiel) {
            t += dRem / v * 1000;
            pos = [...target];
            track.push({ pos: [...pos], t, heading: brgT, twa, v: v * KN, tws, dir: w.dir, mode });
          }
          break;                                   // Bahnmarken: Bogen folgt unten
        }
        pos = dest(pos, heading, v * DT);
        t += DT * 1000;
        if (t - t0 > 24 * 3600e3) break;           // Notbremse: > 24 h
      }

      /* Rundung: an allen Marken außer der Ziellinie auf der
         eingestellten Seite herumfahren (sichtbar + Zeitaufschlag) */
      if (li < state.course.length - 1) {
        const w = windAt(pos, t);
        const tws = w.ms * KN;
        const aStart = wrap360(bearing(target, pos));
        const brgOut = bearing(target, state.course[li + 1].pos);
        const vR = Math.max(polar(boat, tws, 70), 1) / KN * 0.7;   // gedrosselt ums Manöver
        for (const p of rundungsBogen(target, aStart, brgOut, state.course[li].side)) {
          const d = dist(pos, p);
          if (d < 0.5) continue;
          t += d / vR * 1000;
          track.push({ pos: p, t, heading: bearing(pos, p), twa: 70, v: vR * KN, tws, dir: w.dir, mode: 'rundung' });
          pos = p;
        }
      }

      const domMode = Object.entries(modeTime).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'halbwind';
      const w0 = windAt(state.course[li - 1].pos, legT0);
      legs.push({
        to: state.course[li], rhumb: dist(state.course[li - 1].pos, target),
        sailed: trackDist(track) - legSailed0, dur: t - legT0, tacks,
        mode: domMode, tws0: w0.ms * KN, dir0: w0.dir,
        twa0: Math.abs(wrap180(bearing(state.course[li - 1].pos, target) - w0.dir)),
      });
    }

    state.sim = {
      track, legs, t0, t1: t,
      dist: legs.reduce((s, l) => s + l.rhumb, 0),
      sailed: legs.reduce((s, l) => s + l.sailed, 0),
      tacks: legs.reduce((s, l) => s + l.tacks, 0),
    };
  }
  function trackDist(track) {
    let s = 0;
    for (let i = 1; i < track.length; i++) s += dist(track[i - 1].pos, track[i].pos);
    return s;
  }

  /* ── Karte ───────────────────────────────────────────────────── */
  let map = null;
  const EMPTY = { type: 'FeatureCollection', features: [] };

  const STYLE = {                                  // Revier-3D-Look (Kopie aus hero3d.js)
    version: 8,
    glyphs: `${new URL('vendor/glyphs/', location.href).href}{fontstack}/{range}.pbf`,
    sources: {
      terrain: { type: 'raster-dem', tiles: [`terrain/{z}/{x}/{y}.png?v=${BUILD}`],
                 encoding: 'terrarium', tileSize: 256, minzoom: 9, maxzoom: 13,
                 bounds: [9.30, 54.33, 10.45, 54.95],
                 attribution: 'Relief: BSH (DL-DE-BY-2.0) · Terrain Tiles' },
      water: { type: 'geojson', data: `water.geojson?v=${BUILD}` },
      land: { type: 'geojson', data: `land.geojson?v=${BUILD}` },
      seamarks: { type: 'geojson', data: `seamarks.json?v=${BUILD}`,
                  attribution: 'Seezeichen: © OSM — nicht zur Navigation' },
      depths: { type: 'geojson', data: `depths.json?v=${BUILD}` },
      course: { type: 'geojson', data: EMPTY },
      track: { type: 'geojson', data: EMPTY },
      laylines: { type: 'geojson', data: EMPTY },
    },
    sky: {
      'sky-color': '#0a1620', 'horizon-color': '#14293a', 'fog-color': '#0d1b22',
      'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.9, 'fog-ground-blend': 0.45,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 9, 1, 12, 0.6, 14, 0],
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0d1b22' } },
      { id: 'relief-farbe', type: 'color-relief', source: 'terrain',
        paint: { 'color-relief-color': [
          'interpolate', ['linear'], ['elevation'],
          -16, '#123f6e', -10, '#17517f', -6, '#1d6293', -3.5, '#2274a8', -2, '#2b87bd',
          -1, '#379dd2', -0.4, '#45b1e2', 0.3, '#2c4f61', 1.2, '#15222a', 6, '#1a2c34',
          14, '#20363f', 28, '#27424c', 45, '#2e4e59',
        ] } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#1a2b34' } },
      { id: 'relief', type: 'hillshade', source: 'terrain',
        paint: { 'hillshade-shadow-color': '#03090e', 'hillshade-highlight-color': '#4f83a2',
                 'hillshade-accent-color': '#0f2029', 'hillshade-exaggeration': 0.55 } },
      { id: 'wasser', type: 'fill', source: 'water', paint: { 'fill-color': '#2478ad', 'fill-opacity': 0.12 } },
      { id: 'ufer-glow', type: 'line', source: 'water',
        paint: { 'line-color': '#3f9e6b', 'line-opacity': 0.35, 'line-blur': 3,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6] } },
      { id: 'ufer', type: 'line', source: 'water',
        paint: { 'line-color': '#5cbd85', 'line-opacity': 0.95,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 14, 2] } },
      { id: 'depth-label', type: 'symbol', source: 'depths', minzoom: 12,
        layout: { 'text-field': ['get', 'label'], 'text-font': ['noto'], 'text-size': 11 },
        paint: { 'text-color': '#9fd3ee', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.2,
                 'text-opacity': 0.85 } },
      /* Kurs-Layer unter den Seezeichen, damit Tonnen klickbar bleiben */
      { id: 'laylines-line', type: 'line', source: 'laylines',
        paint: { 'line-color': '#7fd4a8', 'line-opacity': 0.45, 'line-width': 1.2, 'line-dasharray': [1.5, 2.5] } },
      { id: 'course-glow', type: 'line', source: 'course',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffb057', 'line-opacity': 0.25, 'line-width': 7, 'line-blur': 4 } },
      { id: 'course-line', type: 'line', source: 'course',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffb057', 'line-opacity': 0.85, 'line-width': 1.8, 'line-dasharray': [2.2, 1.6] } },
      { id: 'track-line', type: 'line', source: 'track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'mode'],
                   'kreuz', '#7fd4a8', 'vorwindkreuz', '#dba7f0', 'vorwind', '#dba7f0',
                   'raum', '#9fd3ee', '#e8f1f6'],
                 'line-opacity': 0.92, 'line-width': 2.4 } },
      { id: 'seamark-dot', type: 'symbol', source: 'seamarks', minzoom: 10.5,
        layout: { 'icon-image': ['get', 'icon'],
                  'icon-size': ['interpolate', ['linear'], ['zoom'], 10.5, 0.5, 14, 1],
                  'icon-anchor': 'bottom', 'icon-allow-overlap': true } },
      { id: 'seamark-name', type: 'symbol', source: 'seamarks', minzoom: 13,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['noto'], 'text-size': 11,
                  'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#d9e6ec', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.4 } },
    ],
    terrain: { source: 'terrain', exaggeration: 2.5 },
  };

  /* Seezeichen-Sprites (Kopie aus hero3d.js) */
  const SM = { ink: '#0d1b22', halo: 'rgba(242,247,248,.95)',
               red: '#e0473f', green: '#17b06b', yellow: '#ffcf4d', black: '#20272c', magenta: '#e353c0' };
  function smIcon(id) {
    const c = document.createElement('canvas');
    c.width = 44; c.height = 60;
    const x = c.getContext('2d');
    x.scale(2, 2); x.lineJoin = 'round'; x.lineCap = 'round';
    const draw = (build, fill) => {
      x.beginPath(); build();
      x.strokeStyle = SM.halo; x.lineWidth = 3.2; x.stroke();
      if (fill) { x.fillStyle = fill; x.fill(); }
      x.strokeStyle = SM.ink; x.lineWidth = 1; x.stroke();
    };
    const waterline = () => draw(() => { x.moveTo(4, 29); x.lineTo(18, 29); });
    const cone = (cx, cy, up, fill) => draw(() => {
      x.moveTo(cx, cy + (up ? -3.4 : 3.4));
      x.lineTo(cx - 3.6, cy + (up ? 3.4 : -3.4));
      x.lineTo(cx + 3.6, cy + (up ? 3.4 : -3.4));
      x.closePath();
    }, fill);
    const xmark = (cx, cy, fill) => {
      draw(() => { x.moveTo(cx - 3, cy - 3); x.lineTo(cx + 3, cy + 3); }, null);
      draw(() => { x.moveTo(cx + 3, cy - 3); x.lineTo(cx - 3, cy + 3); }, null);
      x.strokeStyle = fill; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(cx - 3, cy - 3); x.lineTo(cx + 3, cy + 3);
      x.moveTo(cx + 3, cy - 3); x.lineTo(cx - 3, cy + 3); x.stroke();
    };
    const staff = () => { waterline(); draw(() => { x.moveTo(11, 28.5); x.lineTo(11, 13); }); };
    const pillar = (bands) => {
      waterline();
      draw(() => { x.rect(9, 13, 4, 15.5); }, bands[0]);
      const h = 15.5 / bands.length;
      bands.forEach((col, i) => { x.fillStyle = col; x.fillRect(9, 13 + i * h, 4, h); });
      x.strokeStyle = SM.ink; x.lineWidth = 1; x.strokeRect(9, 13, 4, 15.5);
    };
    switch (id) {
      case 'sm-buoy-port': waterline(); draw(() => x.rect(6.5, 16, 9, 12.5), SM.red); break;
      case 'sm-buoy-stb': waterline(); draw(() => {
        x.moveTo(11, 13.5); x.lineTo(5.5, 28.5); x.lineTo(16.5, 28.5); x.closePath();
      }, SM.green); break;
      case 'sm-buoy-special': waterline(); draw(() => x.rect(7.5, 18, 7, 10.5), SM.yellow); xmark(11, 13, SM.yellow); break;
      case 'sm-danger': staff(); draw(() => x.arc(11, 15.5, 2.2, 0, 7), SM.black);
        draw(() => x.arc(11, 9.5, 2.2, 0, 7), SM.red); break;
      case 'sm-card-n': pillar([SM.black, SM.yellow]); cone(11, 9, true, SM.black); cone(11, 2.5, true, SM.black); break;
      case 'sm-card-s': pillar([SM.yellow, SM.black]); cone(11, 9, false, SM.black); cone(11, 2.5, false, SM.black); break;
      case 'sm-card-e': pillar([SM.black, SM.yellow, SM.black]); cone(11, 2.5, true, SM.black); cone(11, 9, false, SM.black); break;
      case 'sm-card-w': pillar([SM.yellow, SM.black, SM.yellow]); cone(11, 2.5, false, SM.black); cone(11, 9, true, SM.black); break;
      case 'sm-bcn-port': staff(); draw(() => x.rect(7.8, 6.5, 6.4, 6.4), SM.red); break;
      case 'sm-bcn-stb': staff(); cone(11, 9.5, true, SM.green); break;
      case 'sm-bcn-special': staff(); xmark(11, 9.5, SM.yellow); break;
      case 'sm-light': waterline(); draw(() => {
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const b = a + Math.PI / 5;
          x[i ? 'lineTo' : 'moveTo'](11 + 5 * Math.cos(a), 21 + 5 * Math.sin(a));
          x.lineTo(11 + 2.2 * Math.cos(b), 21 + 2.2 * Math.sin(b));
        }
        x.closePath();
      }, SM.yellow);
        draw(() => {
          x.moveTo(14, 17); x.quadraticCurveTo(22, 10, 20, 3);
          x.quadraticCurveTo(15, 8, 13, 15); x.closePath();
        }, SM.magenta);
        break;
      default: return null;
    }
    return x.getImageData(0, 0, 44, 60);
  }

  function initMap() {
    try {
      map = createMap();
    } catch (e) {
      console.warn('Karte nicht verfügbar:', e);
      $('#course-hint').textContent = 'Dieses Gerät unterstützt kein WebGL — der Regattaplaner braucht die 3D-Karte.';
    }
  }
  function createMap() {
    const map = new maplibregl.Map({
      container: 'map', style: STYLE,
      center: [9.79, 54.585], zoom: 10.3, pitch: 45, bearing: 20,
      maxBounds: MAX_BOUNDS, minZoom: 9, maxZoom: 15.5,
      antialias: true, attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    window.REGATTA = { _map: map, _state: state, _druckblatt: baueDruckblatt };   // für Tests/Debugging
    map.on('styleimagemissing', (e) => {
      if (!e.id.startsWith('sm-') || map.hasImage(e.id)) return;
      const img = smIcon(e.id);
      if (img) map.addImage(e.id, img, { pixelRatio: 2 });
    });
    map.on('mouseenter', 'seamark-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'seamark-dot', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', onMapClick);
    return map;
  }

  function onMapClick(e) {
    if (state.playing) return;
    const box = 10;
    const hits = map.queryRenderedFeatures(
      [[e.point.x - box, e.point.y - box], [e.point.x + box, e.point.y + box]],
      { layers: ['seamark-dot'] });
    let pos, name;
    if (hits.length) {
      const f = hits[0];
      pos = [...f.geometry.coordinates];
      name = f.properties.name || SM_KURZ[f.properties.icon] || 'Seezeichen';
    } else {
      pos = [e.lngLat.lng, e.lngLat.lat];
      if (onLand(pos)) { toast('Das liegt an Land — bitte aufs Wasser tippen.'); return; }
      name = 'Wegpunkt';
    }
    state.course.push({ pos, name, side: 'stb' });
    afterCourseChange();
    toast(`${markLabel(state.course.length - 1)} · ${name}`);
  }
  const SM_KURZ = {
    'sm-buoy-port': 'Stumpftonne', 'sm-buoy-stb': 'Spitztonne', 'sm-buoy-special': 'Sondertonne',
    'sm-card-n': 'Kardinal N', 'sm-card-s': 'Kardinal S', 'sm-card-e': 'Kardinal O', 'sm-card-w': 'Kardinal W',
    'sm-danger': 'Einzelgefahr', 'sm-bcn-port': 'Bake Bb', 'sm-bcn-stb': 'Bake Stb',
    'sm-bcn-special': 'Bake', 'sm-light': 'Leuchtfeuer',
  };

  /* ── Kartenobjekte: Marken, Kurs, Track, Laylines, Wind, Boot ── */
  const markers = [];
  let boatMarker = null;
  const windMarkers = [];

  function markLabel(i) {
    if (i === 0) return 'Start';
    if (i === state.course.length - 1 && state.course.length > 1) return 'Ziel';
    return `Marke ${i}`;
  }
  function badgeText(i) {
    if (i === 0) return 'S';
    if (i === state.course.length - 1 && state.course.length > 1) return 'Z';
    return String(i);
  }

  function renderMarkers() {
    if (!map) return;
    while (markers.length) markers.pop().remove();
    state.course.forEach((m, i) => {
      const el = document.createElement('div');
      el.className = 'rp-mark' + (i === 0 ? ' is-start' : '') +
        (i === state.course.length - 1 && state.course.length > 1 ? ' is-ziel' : '');
      el.textContent = badgeText(i);
      el.title = `${markLabel(i)} · ${m.name} — Klick entfernt`;
      const label = document.createElement('span');
      label.className = 'rp-mark-label';
      const doppelt = state.course.findIndex((o) => o.pos[0] === m.pos[0] && o.pos[1] === m.pos[1]) < i;
      label.textContent = (m.name === 'Wegpunkt' || doppelt) ? '' : m.name;
      el.appendChild(label);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.course.splice(i, 1);
        afterCourseChange();
      });
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(m.pos).addTo(map));
    });
  }

  function renderCourseLayers() {
    if (!map?.getSource('course')) return;
    const line = state.course.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: state.course.map((m) => m.pos) } }
      : null;
    map.getSource('course').setData(line ? { type: 'FeatureCollection', features: [line] } : EMPTY);

    /* Track: pro Modus-Abschnitt ein Feature (Farbcodierung) */
    const feats = [];
    if (state.sim) {
      let cur = null;
      for (const p of state.sim.track) {
        if (!cur || cur.properties.mode !== p.mode) {
          if (cur && cur.geometry.coordinates.length > 1) feats.push(cur);
          cur = { type: 'Feature', properties: { mode: p.mode },
                  geometry: { type: 'LineString', coordinates: cur ? [cur.geometry.coordinates.at(-1)] : [] } };
        }
        cur.geometry.coordinates.push(p.pos);
      }
      if (cur && cur.geometry.coordinates.length > 1) feats.push(cur);
    }
    map.getSource('track').setData({ type: 'FeatureCollection', features: feats });

    /* Laylines an Kreuz-Marken */
    const lay = [];
    if (state.sim) {
      state.sim.legs.forEach((l, i) => {
        if (l.mode !== 'kreuz') return;
        const tws = l.tws0, beatA = beatTWA(cls(), tws);
        const len = Math.min(1200, l.rhumb * 0.45);
        for (const s of [1, -1]) {
          lay.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [
            state.course[i + 1].pos,
            dest(state.course[i + 1].pos, wrap360(l.dir0 + 180 - s * beatA), len),
          ] } });
        }
      });
    }
    map.getSource('laylines').setData({ type: 'FeatureCollection', features: lay });
  }

  function renderWindMarkers(tMs) {
    if (!state.wind || !map) return;
    if (!windMarkers.length) {
      for (const p of REVIER_POINTS) {
        const el = document.createElement('div');
        el.className = 'rp-windpt';
        el.innerHTML = `<svg viewBox="0 0 24 24"><g class="rot"><path d="M12 3v13M12 21l-4.5-6h9z" fill="none" stroke="#e8f1f6" stroke-width="2.4" opacity=".95" paint-order="stroke"/><path d="M12 3v13M12 21l-4.5-6h9z" fill="#45b1e2" stroke="#45b1e2" stroke-width="1.1"/></g></svg><small></small>`;
        windMarkers.push({ marker: new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' })
          .setLngLat([p.lon, p.lat]).addTo(map), el, p });
      }
    }
    for (const wm of windMarkers) {
      const w = windAt([wm.p.lon, wm.p.lat], tMs);
      if (!w) continue;
      // Pfeil-Grundform zeigt nach Süden (Strömung bei Nordwind) → Rotation um dir
      wm.el.querySelector('.rot').setAttribute('transform', `rotate(${w.dir} 12 12)`);
      wm.el.querySelector('small').textContent = `${(w.ms * KN).toFixed(0)} kn`;
    }
  }

  function ensureBoatMarker() {
    if (boatMarker) return boatMarker;
    const el = document.createElement('div');
    el.className = 'rp-boat-ghost';
    el.innerHTML = `<svg viewBox="0 0 34 34">
      <path d="M17 3c4 5 5.4 12 5.4 17.5 0 4.5-2.4 8.5-5.4 10.5-3-2-5.4-6-5.4-10.5C11.6 15 13 8 17 3z" fill="#e8f1f6" stroke="#0d1b22" stroke-width="1.4"/>
      <path d="M17 6.5c2.6 3.8 3.6 9 3.6 13.5H17z" fill="#ffb057"/>
      <circle cx="17" cy="24" r="1.6" fill="#0d1b22"/></svg>`;
    boatMarker = new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' });
    return boatMarker;
  }

  /* ── Playback: das Geisterboot segelt die Route ab ───────────── */
  let playRaf = 0;
  function playbackDuration() {
    const dur = (state.sim.t1 - state.sim.t0) / 1000;
    return Math.min(60, Math.max(18, dur / 150)) * 1000;   // Wandzeit in ms
  }
  function togglePlay(force) {
    const next = force ?? !state.playing;
    if (next && !state.sim) return;
    state.playing = next;
    $('#btn-play').classList.toggle('playing', next);
    $('#btn-play').setAttribute('aria-label', next ? 'Pause' : 'Abspielen');
    $('#sim-clock').hidden = !next;
    if (!next) {
      cancelAnimationFrame(playRaf);
      boatMarker?.remove();
      renderWindMarkers(currentStartMs());
      drawPolar();
      return;
    }
    const t0 = performance.now();
    const total = playbackDuration();
    ensureBoatMarker().setLngLat(state.sim.track[0].pos).addTo(map);
    const tick = (now) => {
      if (!state.playing) return;
      const p = Math.min((now - t0) / total, 1);
      const simT = state.sim.t0 + p * (state.sim.t1 - state.sim.t0);
      const s = sampleTrack(simT);
      boatMarker.setLngLat(s.pos).setRotation(s.heading);
      $('#sim-clock').textContent = fmtClock(simT) + `  ·  ${s.v.toFixed(1)} kn`;
      renderWindMarkers(simT);
      drawPolar(s);
      if (p >= 1) { togglePlay(false); return; }
      playRaf = requestAnimationFrame(tick);
    };
    playRaf = requestAnimationFrame(tick);
  }
  function sampleTrack(tMs) {
    const tr = state.sim.track;
    let lo = 0, hi = tr.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tr[mid].t <= tMs) lo = mid; else hi = mid;
    }
    const a = tr[lo], b = tr[hi];
    const f = b.t > a.t ? (tMs - a.t) / (b.t - a.t) : 0;
    return { ...a, pos: [lerp(a.pos[0], b.pos[0], f), lerp(a.pos[1], b.pos[1], f)] };
  }

  /* ── UI: Formatierer ─────────────────────────────────────────── */
  const NM = 1852;
  const fmtNm = (m) => `${(m / NM).toFixed(m < 10 * NM ? 2 : 1)} sm`;
  const fmtDur = (ms) => {
    const min = Math.round(ms / 60000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
  };
  const fmtTime = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = (ms) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(ms);
  const MODE_NAME = { kreuz: 'Kreuz', amwind: 'Am Wind', halbwind: 'Halbwind', raum: 'Raum', vorwind: 'Vorwind', vorwindkreuz: 'Halsen' };

  const currentStartMs = () => state.wind ? state.wind.times[state.startIdx].getTime() : Date.now();

  /* ── UI: Kursliste ───────────────────────────────────────────── */
  function renderCourseList() {
    const ol = $('#course-list');
    ol.innerHTML = '';
    $('#course-hint').hidden = state.course.length > 0;
    $('#btn-clear').hidden = state.course.length === 0;
    state.course.forEach((m, i) => {
      const li = document.createElement('li');
      li.draggable = false;
      if (i === 0) li.classList.add('is-start');
      if (i === state.course.length - 1 && state.course.length > 1) li.classList.add('is-ziel');
      li.innerHTML = `
        <span class="rp-grip" title="Ziehen zum Umsortieren">⠿</span>
        <span class="rp-badge">${badgeText(i)}</span>
        <span class="rp-mark-name">${esc(m.name)}<small>${markLabel(i)}</small></span>
        <button class="rp-round" data-side="${m.side}" title="Rundungsseite umschalten">${m.side === 'stb' ? 'Stb ↻' : 'Bb ↺'}</button>
        <button class="rp-del" title="Marke entfernen" aria-label="Marke ${i + 1} entfernen">✕</button>`;
      li.querySelector('.rp-round').addEventListener('click', () => {
        m.side = m.side === 'stb' ? 'bb' : 'stb';
        renderCourseList(); refresh(); writeHash();
      });
      li.querySelector('.rp-del').addEventListener('click', () => {
        state.course.splice(i, 1); afterCourseChange();
      });
      bindDrag(li, i);
      ol.appendChild(li);
    });
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Umsortieren per Pointer-Drag am Griff */
  let drag = null;
  function bindDrag(li, i) {
    const grip = li.querySelector('.rp-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { from: i, to: i };
      li.classList.add('dragging');
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#course-list li');
        document.querySelectorAll('#course-list li').forEach((n) => n.classList.remove('dragover'));
        if (over) {
          drag.to = [...over.parentNode.children].indexOf(over);
          over.classList.add('dragover');
        }
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        li.classList.remove('dragging');
        if (drag && drag.to !== drag.from) {
          const [m] = state.course.splice(drag.from, 1);
          state.course.splice(drag.to, 0, m);
          afterCourseChange();
        } else renderCourseList();
        drag = null;
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
  }

  function renderAnalysis() {
    const has = !!state.sim && state.sim.legs.length > 0;
    $('#course-sum').hidden = !has;
    $('#btn-play').disabled = !has;
    const ul = $('#leg-list');
    ul.innerHTML = '';
    if (!has) { $('#sum-eta').textContent = '–'; return; }
    const s = state.sim;
    $('#sum-dist').textContent = fmtNm(s.dist);
    $('#sum-sailed').textContent = fmtNm(s.sailed);
    $('#sum-tacks').textContent = String(s.tacks);
    $('#sum-eta').textContent = `${fmtDur(s.t1 - s.t0)} → ${fmtClock(s.t1)}`;
    s.legs.forEach((l, i) => {
      const li = document.createElement('li');
      const modeCls = l.mode === 'kreuz' ? 'm-kreuz' : (l.mode === 'vorwind' || l.mode === 'vorwindkreuz') ? 'm-vorwind' : '';
      li.innerHTML = `
        <span class="rp-leg-no">${badgeText(i)}→${badgeText(i + 1)}</span>
        <span class="rp-leg-mode ${modeCls}">${MODE_NAME[l.mode]}</span>
        <span class="rp-leg-data">${fmtNm(l.rhumb)} · ${fmtDur(l.dur)}${l.tacks ? ` · ${l.tacks}⤬` : ''}</span>`;
      ul.appendChild(li);
    });
  }

  /* ── UI: Bootsklassen + Polardiagramm ────────────────────────── */
  function renderClasses() {
    const box = $('#class-list');
    box.innerHTML = '';
    for (const k of KLASSEN) {
      const b = document.createElement('button');
      b.className = 'rp-class';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(k.id === state.boat));
      b.innerHTML = `<b>${k.name}</b><small>${k.typ} · YS ${k.ys}</small>`;
      b.addEventListener('click', () => {
        state.boat = k.id;
        renderClasses(); refresh(); writeHash();
      });
      box.appendChild(b);
    }
    $('#boat-ys').textContent = `Yardstick ${cls().ys}`;
  }

  function drawPolar(live) {
    const cv = $('#polar');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = 460, H = 300;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    x.clearRect(0, 0, W, H);
    const boat = cls();
    const refPos = state.course[0]?.pos ?? [9.79, 54.585];
    const w = windAt(refPos, currentStartMs());
    const tws = live ? live.tws : (w ? w.ms * KN : 12);

    const ox = 118, oy = H / 2, R = 128;
    let vmax = 0;
    for (let a = 30; a <= 180; a += 5) vmax = Math.max(vmax, polar(boat, tws, a));
    const scale = Math.max(2, Math.ceil(vmax * 1.15));
    const pt = (twa, v) => [ox + Math.sin(twa * D2R) * (v / scale) * R, oy - Math.cos(twa * D2R) * (v / scale) * R];

    /* Ringe + Speichen */
    x.strokeStyle = 'rgba(157,180,192,.18)'; x.fillStyle = 'rgba(157,180,192,.7)';
    x.font = '10px Instrument Sans, sans-serif'; x.lineWidth = 1;
    const step = scale > 8 ? 4 : 2;
    for (let v = step; v <= scale; v += step) {
      x.beginPath(); x.arc(ox, oy, (v / scale) * R, -Math.PI / 2, Math.PI / 2); x.stroke();
      x.fillText(`${v}`, ox - 4, oy - (v / scale) * R + 11);
    }
    for (const a of [45, 90, 135]) {
      x.beginPath(); x.moveTo(ox, oy);
      const [px, py] = pt(a, scale); x.lineTo(px, py); x.stroke();
    }
    x.beginPath(); x.moveTo(ox, oy - R - 6); x.lineTo(ox, oy + R + 6); x.stroke();

    /* Kurve */
    const beatA = beatTWA(boat, tws);
    x.beginPath();
    for (let a = beatA; a <= 180; a += 2) {
      const [px, py] = pt(a, polar(boat, tws, a));
      a === beatA ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.strokeStyle = '#45b1e2'; x.lineWidth = 2.2; x.lineJoin = 'round'; x.stroke();

    /* VMG-Optima */
    x.fillStyle = '#7fd4a8';
    const [bx, by] = pt(beatA, polar(boat, tws, beatA));
    x.beginPath(); x.arc(bx, by, 3.4, 0, 7); x.fill();
    const runA = runTWA(boat, tws);
    if (runA < 180) {
      x.fillStyle = '#dba7f0';
      const [rx, ry] = pt(runA, polar(boat, tws, runA));
      x.beginPath(); x.arc(rx, ry, 3.4, 0, 7); x.fill();
    }

    /* Live-Zeiger im Playback */
    if (live) {
      const [lx, ly] = pt(live.twa, live.v);
      x.strokeStyle = '#ffb057'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(ox, oy); x.lineTo(lx, ly); x.stroke();
      x.fillStyle = '#ffb057';
      x.beginPath(); x.arc(lx, ly, 4, 0, 7); x.fill();
    }

    /* Beschriftung */
    x.fillStyle = 'rgba(232,241,246,.95)';
    x.font = '650 17px Bricolage Grotesque, sans-serif';
    x.fillText(`${boat.name}`, 272, 34);
    x.font = '13px Instrument Sans, sans-serif';
    x.fillStyle = 'rgba(157,180,192,.95)';
    x.fillText(`bei ${tws.toFixed(0)} kn Wind`, 272, 54);
    x.font = '12.5px Instrument Sans, sans-serif';
    x.fillStyle = '#7fd4a8';
    x.fillText(`● Wende-VMG ${beatA.toFixed(0)}°`, 272, 80);
    if (runA < 180) { x.fillStyle = '#dba7f0'; x.fillText(`● Halse ${runA.toFixed(0)}°`, 272, 98); }
    x.fillStyle = 'rgba(157,180,192,.6)';
    x.fillText('kn', ox - 4, oy - R - 10);
  }

  /* ── UI: Zeitleiste + Sparkline ──────────────────────────────── */
  function drawSpark() {
    const cv = $('#spark');
    if (!state.wind) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 400, H = 46;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const pos = state.course[0]?.pos ?? [9.79, 54.585];
    const n = state.wind.times.length;
    const vals = state.wind.times.map((t) => windAt(pos, t.getTime()));
    const vmax = Math.max(12, ...vals.map((v) => v.gust * KN)) * 1.1;
    const px = (i) => (i / (n - 1)) * W;
    const py = (kn) => H - 4 - (kn / vmax) * (H - 10);

    x.beginPath();                                 // Böen: zarte Fläche
    x.moveTo(0, H);
    vals.forEach((v, i) => x.lineTo(px(i), py(v.gust * KN)));
    x.lineTo(W, H); x.closePath();
    x.fillStyle = 'rgba(255,176,87,.12)'; x.fill();

    x.beginPath();                                 // Mittelwind: Linie
    vals.forEach((v, i) => x[i ? 'lineTo' : 'moveTo'](px(i), py(v.ms * KN)));
    x.strokeStyle = '#45b1e2'; x.lineWidth = 1.8; x.stroke();

    for (let i = 0; i < n; i += 6) {               // Richtungspfeile alle 6 h
      const a = vals[i].dir * D2R;
      const cx = px(i), cy = 8;
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.beginPath(); x.moveTo(0, -4); x.lineTo(0, 3); x.moveTo(-2.4, 0.5); x.lineTo(0, 4); x.lineTo(2.4, 0.5);
      x.strokeStyle = 'rgba(232,241,246,.6)'; x.lineWidth = 1.2; x.stroke();
      x.restore();
    }

    const sx = px(state.startIdx);                 // Startzeit-Cursor
    x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx, H);
    x.strokeStyle = '#ffb057'; x.lineWidth = 2; x.stroke();
  }

  function renderTimeRow() {
    if (!state.wind) return;
    const t = state.wind.times[state.startIdx];
    $('#time-out').textContent = fmtTime.format(t);
    const w = windAt(state.course[0]?.pos ?? [9.79, 54.585], t.getTime());
    $('#time-wind').textContent = w ? `${(w.ms * KN).toFixed(0)} kn · Böen ${(w.gust * KN).toFixed(0)} kn` : '';
  }

  /* ── Teilen, GPX, Hash ───────────────────────────────────────── */
  function writeHash() {
    const k = state.course.map((m) =>
      `${m.pos[0].toFixed(5)}~${m.pos[1].toFixed(5)}~${m.side}~${encodeURIComponent(m.name)}`).join(';');
    const h = `#b=${state.boat}&t=${state.startIdx}${k ? `&k=${k}` : ''}`;
    history.replaceState(null, '', h);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('b') && KLASSEN.some((x) => x.id === p.get('b'))) state.boat = p.get('b');
    const t = parseInt(p.get('t') ?? '', 10);
    if (t >= 0 && t < 48) state.startIdx = t;
    if (p.get('k')) {
      state.course = p.get('k').split(';').map((s) => {
        const [lon, lat, side, name] = s.split('~');
        return { pos: [parseFloat(lon), parseFloat(lat)], side: side === 'bb' ? 'bb' : 'stb',
                 name: decodeURIComponent(name ?? 'Wegpunkt') };
      }).filter((m) => Number.isFinite(m.pos[0]) && Number.isFinite(m.pos[1]));
    }
  }

  async function share() {
    writeHash();
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: 'Regattakurs auf der Schlei', url }); return; }
      await navigator.clipboard.writeText(url);
      toast('Link kopiert — Kurs, Klasse und Startzeit inklusive.');
    } catch { /* abgebrochen */ }
  }

  function exportGpx() {
    if (!state.course.length) { toast('Erst einen Kurs legen.'); return; }
    const rte = state.course.map((m, i) =>
      `    <rtept lat="${m.pos[1]}" lon="${m.pos[0]}"><name>${esc(markLabel(i))} ${esc(m.name)}</name></rtept>`).join('\n');
    const trk = state.sim ? state.sim.track.map((p) =>
      `      <trkpt lat="${p.pos[1]}" lon="${p.pos[0]}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n') : '';
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="dieschlei.de Regattaplaner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Regattakurs Schlei</name><desc>Planung — nicht zur Navigation</desc></metadata>
  <rte><name>Kurs</name>
${rte}
  </rte>${state.sim ? `
  <trk><name>Berechnete Route (${cls().name})</name><trkseg>
${trk}
    </trkseg></trk>` : ''}
</gpx>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    a.download = 'schlei-regatta.gpx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ── Druck-Bahnblatt (PDF über den Browser-Druckdialog) ──────────
     Karte wird top-down auf den Kurs gerahmt und als Bild gegriffen
     (WebGL-Puffer ist nur im render-Event gültig), Marken-Badges
     werden auf ein 2D-Canvas komponiert, Kamera danach zurückgestellt. */
  async function baueDruckblatt() {
    if (state.course.length < 2) { toast('Erst einen Kurs legen oder eine Bahn laden.'); return false; }
    if (!map) { toast('Ohne Karte kein Bahnblatt.'); return false; }
    writeHash();
    const cam = { center: map.getCenter(), zoom: map.getZoom(),
                  pitch: map.getPitch(), bearing: map.getBearing() };
    const bb = new maplibregl.LngLatBounds();
    state.course.forEach((m) => bb.extend(m.pos));
    (state.sim?.track ?? []).forEach((pt) => bb.extend(pt.pos));
    map.fitBounds(bb, { padding: 70, duration: 0, pitch: 0, bearing: 0 });
    await new Promise((res) => { map.once('idle', res); setTimeout(res, 8000); });
    const roh = await new Promise((res) => {
      map.once('render', () => res(map.getCanvas().toDataURL()));
      map.triggerRepaint();
    });

    const gl = map.getCanvas();
    const cv = document.createElement('canvas');
    cv.width = gl.width; cv.height = gl.height;
    const x = cv.getContext('2d');
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = roh; });
    x.drawImage(img, 0, 0);
    const sc = gl.width / map.getContainer().clientWidth;
    state.course.forEach((m, i) => {
      const p = map.project(m.pos);
      const px = p.x * sc, py = p.y * sc, r = 13 * sc;
      x.beginPath(); x.arc(px, py, r, 0, 7);
      x.fillStyle = i === 0 ? '#7fd4a8'
        : (i === state.course.length - 1 ? '#e8f1f6' : '#ffb057');
      x.fill();
      x.lineWidth = 2.2 * sc; x.strokeStyle = '#0d1b22'; x.stroke();
      x.fillStyle = '#241503';
      x.font = `700 ${13 * sc}px Bricolage Grotesque, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(badgeText(i), px, py + sc);
    });
    const bild = cv.toDataURL('image/jpeg', 0.9);
    map.jumpTo(cam);                               // Kamera zurück

    const bahnId = $('#bahn-select').value;
    const titel = bahnId ? `SVA-Bahn ${BAHNEN[bahnId].name}` : 'Eigener Kurs';
    const s0 = state.sim;
    const w0 = state.wind ? windAt(state.course[0].pos, currentStartMs()) : null;
    const seite = (sd) => sd === 'stb'
      ? '<span class="pb-stb">Stb ↻</span>' : '<span class="pb-bb">Bb ↺</span>';
    const marken = state.course.map((m, i) => `<tr><td>${badgeText(i)}</td>
      <td>${esc(m.name)}</td><td>${i === 0 || i === state.course.length - 1 ? '—' : seite(m.side)}</td></tr>`).join('');
    const legs = s0 ? s0.legs.map((l, i) => `<tr>
      <td>${badgeText(i)} → ${badgeText(i + 1)}</td><td>${MODE_NAME[l.mode]}</td>
      <td>${fmtNm(l.rhumb)}</td><td>${l.tacks || '—'}</td><td>${fmtDur(l.dur)}</td></tr>`).join('') : '';
    $('#print-blatt').innerHTML = `
      <header class="pb-kopf"><h1>Bahnblatt <span>· ${esc(titel)}</span></h1>
        <p>dieschlei.de/regatta<br>erstellt ${new Intl.DateTimeFormat('de-DE',
          { dateStyle: 'medium', timeStyle: 'short' }).format(Date.now())}</p></header>
      <div class="pb-meta">
        <span>Boot <b>${esc(cls().name)}</b> (YS ${cls().ys})</span>
        ${state.wind ? `<span>Start <b>${fmtTime.format(state.wind.times[state.startIdx])}</b></span>` : ''}
        ${w0 ? `<span>Wind <b>${(w0.ms * KN).toFixed(0)} kn aus ${Math.round(w0.dir)}°</b> · Böen ${(w0.gust * KN).toFixed(0)} kn</span>` : ''}
        ${s0 ? `<span>Bahn <b>${fmtNm(s0.dist)}</b> · gesegelt <b>${fmtNm(s0.sailed)}</b></span>
        <span>Zeitbedarf <b>${fmtDur(s0.t1 - s0.t0)}</b> · ${s0.tacks} Wenden</span>` : ''}
      </div>
      <img class="pb-karte" src="${bild}" alt="Kurskarte">
      <h2>Markenfolge</h2>
      <table><thead><tr><th>#</th><th>Marke</th><th>Rundung</th></tr></thead>
        <tbody>${marken}</tbody></table>
      ${legs ? `<h2>Schenkel (Simulation)</h2>
      <table><thead><tr><th>Schenkel</th><th>Kurs</th><th>Distanz</th><th>Wenden</th><th>Zeit</th></tr></thead>
        <tbody>${legs}</tbody></table>` : ''}
      <p class="pb-link">Kurs im Planer öffnen: ${esc(location.href)}</p>
      <p class="pb-fuss">Näherungsrechnung (ICON-D2-Vorhersage, Näherungspolare) —
        <strong>nicht zur Navigation</strong>. Maßgeblich sind Ausschreibung und Bahnkarte
        des Veranstalters. Seezeichen © OSM · Wind: DWD/Open-Meteo · Yardstick: DSV.</p>`;
    return true;
  }

  /* ── Kleinkram ───────────────────────────────────────────────── */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function refresh() {
    simulate();
    renderCourseLayers();
    renderAnalysis();
    renderTimeRow();
    drawSpark();
    drawPolar();
    renderWindMarkers(currentStartMs());
  }
  function afterCourseChange() {
    if (state.playing) togglePlay(false);
    if (!bahnLaedt) { const sel = $('#bahn-select'); if (sel) sel.value = ''; }
    renderMarkers();
    renderCourseList();
    refresh();
    writeHash();
  }

  function bindUI() {
    $('#btn-clear').addEventListener('click', () => { state.course = []; afterCourseChange(); });
    $('#bahn-select').addEventListener('change', (e) => { if (e.target.value) ladeBahn(e.target.value); });
    $('#btn-share').addEventListener('click', share);
    $('#btn-gpx').addEventListener('click', exportGpx);
    $('#btn-pdf').addEventListener('click', async () => {
      if (state.playing) togglePlay(false);
      if (await baueDruckblatt()) requestAnimationFrame(() => window.print());
    });
    $('#btn-info').addEventListener('click', () => $('#dlg-info').showModal());
    $('#btn-play').addEventListener('click', () => togglePlay());
    let simTimer = 0;
    $('#time-slider').addEventListener('input', (e) => {
      state.startIdx = parseInt(e.target.value, 10);
      renderTimeRow(); drawSpark();
      clearTimeout(simTimer);
      simTimer = setTimeout(() => { refresh(); writeHash(); }, 160);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if ((e.key === 'Backspace' || e.key === 'Delete') && state.course.length) {
        state.course.pop(); afterCourseChange();
      }
    });
    /* Mobile Tabs */
    document.querySelectorAll('.rp-tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        const panel = { course: '#panel-course', boat: '#panel-boat', time: '#panel-time' }[b.dataset.tab];
        const el = $(panel);
        const wasOpen = el.classList.contains('open');
        document.querySelectorAll('.rp-panel, .rp-time').forEach((n) => n.classList.remove('open'));
        document.querySelectorAll('.rp-tabs button').forEach((n) => n.classList.remove('active'));
        if (!wasOpen) { el.classList.add('open'); b.classList.add('active'); }
      });
    });
    addEventListener('resize', () => { drawSpark(); }, { passive: true });
  }

  /* ── Start ───────────────────────────────────────────────────── */
  async function init() {
    readHash();
    renderClasses();
    renderCourseList();
    bindUI();
    initMap();
    const landP = fetch(`land.geojson?v=${BUILD}`).then((r) => r.json()).then(prepLand);
    try {
      await Promise.all([loadWind(), landP]);
    } catch (e) {
      console.warn('Winddaten nicht verfügbar:', e);
      toast('Windvorhersage momentan nicht erreichbar — Planung ohne Zeitrechnung.');
    }
    $('#time-slider').value = String(state.startIdx);
    renderMarkers();
    refresh();
    if (map && state.course.length > 1) {
      const b = new maplibregl.LngLatBounds();
      state.course.forEach((m) => b.extend(m.pos));
      const mobil = matchMedia('(max-width: 700px)').matches;
      map.fitBounds(b, {
        padding: mobil ? { top: 100, bottom: 200, left: 34, right: 34 }
                       : { top: 110, bottom: 150, left: 330, right: 330 },
        pitch: 45, maxZoom: 13.5,
      });
    }
    if (matchMedia('(max-width: 700px)').matches && !state.course.length) {
      toast('Tippe Seezeichen oder Wasser an, um deinen Kurs zu legen.');
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
