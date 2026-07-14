/* ═══════════════════════════════════════════════════════════════
   BEISSFENSTER — Angel-Fenster für die Schlei, 48 h voraus.
   Heuristik aus Saison × Wassertemperatur × Licht × Wind × Druck,
   plus Einstrom- (Pegel) und Mond-Boni. Bewusst OHNE Rechtsteil:
   Schonzeiten/Mindestmaße/Regeln muss der Angler selbst prüfen —
   die UI sagt das an drei Stellen.
   Eigenständige Seite ohne Karte; Daten: Open-Meteo (ICON-D2 +
   Marine), PEGELONLINE (Kopie der API-Muster aus app.js).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const D2R = Math.PI / 180;
  const H = 3600e3;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, f) => a + (b - a) * f;

  /* ── Artenprofile (Schlei-Zielfische, Verhaltensmuster aus der
     Angelliteratur — Saisonkurve über den Tag im Jahr, Temperatur-
     fenster auf die Ostsee-SST, Lichttyp, Windfenster in m/s) ──── */
  const ARTEN = [
    { id: 'hering', name: 'Hering', unter: 'Frühjahrslauf',
      saison: [[1, .1], [45, .2], [60, .55], [85, 1], [125, 1], [145, .4], [165, .1], [265, .1], [295, .3], [330, .2], [365, .1]],
      temp: [2, 4, 9, 13], licht: 'tagdaemmerung', wind: [0, 2, 9, 14],
      einstrom: true, ort: 'Kappeln (Hafenkante, Brückenbereich) und Schleimünde',
      tipp: 'Der Schwarm kommt mit dem Einstrom — steigender Pegel bei Ostwind ist das Signal.' },
    { id: 'hornhecht', name: 'Hornhecht', unter: 'zur Rapsblüte',
      saison: [[1, 0], [105, .05], [122, .6], [135, 1], [175, 1], [195, .5], [225, .2], [255, .05], [365, 0]],
      temp: [8, 10, 17, 21], licht: 'tag', wind: [0, 2, 8, 13],
      einstrom: true, ort: 'Äußere Schlei und Mündungsbereich, gern über Kraut',
      tipp: 'Tagfisch — Sonne stört ihn nicht. Blinkert die Rapsfelder blühen, ist er da.' },
    { id: 'meerforelle', name: 'Meerforelle', unter: 'kaltes Halbjahr',
      saison: [[1, .9], [60, 1], [120, .9], [150, .5], [180, .2], [225, .15], [255, .45], [285, .8], [330, .9], [365, .9]],
      temp: [3, 5, 12, 16], licht: 'daemmerung', wind: [1, 3, 8, 12],
      einstrom: true, ufer: true, ort: 'Außenküste bei Schleimünde, äußere Schlei-Ufer',
      tipp: 'Dämmerung plus leicht angetrübtes Wasser am auflandigen Ufer — die klassische Kombination.' },
    { id: 'zander', name: 'Zander', unter: 'die trüben Breiten',
      saison: [[1, .3], [60, .3], [105, .5], [135, .9], [160, 1], [270, 1], [300, .7], [330, .5], [365, .35]],
      temp: [8, 12, 22, 26], licht: 'nachtdaemmerung', wind: [0, 2, 8, 12],
      truebung: true, ort: 'Große und Kleine Breite, Fahrrinnenkanten',
      tipp: 'Liebt wenig Licht: Dämmerung, Nacht, bedeckte Tage — und Trübung nach Windtagen.' },
    { id: 'barsch', name: 'Barsch', unter: 'ganz Jahr, warm besser',
      saison: [[1, .4], [90, .5], [130, .8], [160, 1], [280, 1], [310, .7], [365, .45]],
      temp: [8, 12, 22, 26], licht: 'tagdaemmerung', wind: [0, 1, 7, 11],
      ort: 'Steganlagen, Hafenbecken, Kanten der Breiten',
      tipp: 'Bedeckter Himmel und ruhiges Wetter — Barsch mag es unaufgeregt.' },
    { id: 'hecht', name: 'Hecht', unter: 'Krautkanten',
      saison: [[1, .7], [45, .8], [75, .5], [105, .5], [135, .7], [170, .6], [240, .6], [270, .85], [300, 1], [365, .8]],
      temp: [4, 8, 18, 23], licht: 'tagdaemmerung', wind: [0, 2, 8, 12],
      ort: 'Krautfelder und Schilfkanten der inneren Schlei',
      tipp: 'Herbst ist Hechtzeit — kühleres Wasser und Wellen ans Kraut bringen ihn in Fahrt.' },
    { id: 'aal', name: 'Aal', unter: 'Sommernächte',
      saison: [[1, 0], [100, .05], [130, .5], [160, .9], [200, 1], [240, .9], [270, .5], [300, .15], [365, 0]],
      temp: [12, 16, 24, 28], licht: 'nacht', wind: [0, 0, 6, 10],
      mond: true, ort: 'Häfen, Gräben, weiche Buchten der inneren Schlei',
      tipp: 'Warme, dunkle, gern schwüle Nächte — je weniger Mond, desto besser.' },
    { id: 'plattfisch', name: 'Plattfisch', unter: 'meist Flunder',
      saison: [[1, .3], [60, .2], [120, .4], [160, .6], [210, .8], [250, 1], [310, .9], [340, .6], [365, .35]],
      temp: [4, 8, 17, 21], licht: 'egal', wind: [0, 2, 9, 13],
      einstrom: true, ufer: true, ort: 'Schleimünde, sandige Außenstrände, Fahrrinne',
      tipp: 'Auflandiger Wind wühlt Nahrung frei — danach beißt es am Sandufer am besten.' },
  ];

  /* ── Astronomie (SunCalc-Kern, kompakt) ──────────────────────── */
  const LAT = 54.61, LON = 9.93;                   // Mitte der Schlei (Arnis)
  const J1970 = 2440588, J2000 = 2451545, DAY = 86400e3;
  const toDays = (ms) => ms / DAY - 0.5 + J1970 - J2000;
  const fromJulian = (j) => (j + 0.5 - J1970) * DAY;
  const E = D2R * 23.4397;
  function sunTimes(ms) {
    const lw = D2R * -LON, phi = D2R * LAT;
    const n = Math.round(toDays(ms) - 0.0009 - lw / (2 * Math.PI));
    const ds = 0.0009 + lw / (2 * Math.PI) + n;
    const M = D2R * (357.5291 + 0.98560028 * ds);
    const L = M + D2R * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M)) + D2R * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(L) * Math.sin(E));
    const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const cosw = (Math.sin(D2R * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosw < -1 || cosw > 1) return null;        // Polarfall — an der Schlei nicht relevant
    const w = Math.acos(cosw);
    const Jset = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return { rise: fromJulian(2 * Jnoon - Jset), set: fromJulian(Jset), noon: fromJulian(Jnoon) };
  }
  function moonIllum(ms) {                          // 0 = Neumond, 1 = Vollmond
    const syn = 29.53058867;
    const age = ((((ms - Date.UTC(2000, 0, 6, 18, 14)) / DAY) % syn) + syn) % syn;
    return { illum: (1 - Math.cos(2 * Math.PI * age / syn)) / 2, age };
  }
  const MOND_NAME = (age) => age < 1.8 ? 'Neumond' : age < 6.6 ? 'zunehmende Sichel'
    : age < 8.5 ? 'erstes Viertel' : age < 13 ? 'zunehmend' : age < 16.6 ? 'Vollmond'
    : age < 21 ? 'abnehmend' : age < 23 ? 'letztes Viertel' : age < 27.7 ? 'abnehmende Sichel' : 'Neumond';

  /* ── Daten ───────────────────────────────────────────────────── */
  const daten = { wetter: null, sst: null, pegelTrend: null };

  async function ladeWetter() {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,cloud_cover,precipitation,surface_pressure&models=icon_d2&wind_speed_unit=ms&timezone=UTC&past_days=1&forecast_days=3`);
    const d = await r.json();
    daten.wetter = {
      t: d.hourly.time.map((t) => new Date(`${t}:00Z`).getTime()),
      ms: d.hourly.wind_speed_10m, dir: d.hourly.wind_direction_10m, gust: d.hourly.wind_gusts_10m,
      temp: d.hourly.temperature_2m, cloud: d.hourly.cloud_cover,
      rain: d.hourly.precipitation, druck: d.hourly.surface_pressure,
    };
  }
  async function ladeSst() {
    const r = await fetch('https://marine-api.open-meteo.com/v1/marine?latitude=54.69&longitude=10.10&hourly=sea_surface_temperature&forecast_days=3&timezone=UTC');
    const d = await r.json();
    daten.sst = { t: d.hourly.time.map((t) => new Date(`${t}:00Z`).getTime()), v: d.hourly.sea_surface_temperature };
  }
  async function ladePegel() {                      // Kappeln W, 1 Tag (Muster aus app.js)
    const r = await fetch('https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/b09f2243-60f0-469a-8f3b-0ea6abc83267/W/measurements.json?start=P1D');
    const m = await r.json();
    if (m.length < 10) return;
    const last = m[m.length - 1];
    const ende = new Date(last.timestamp).getTime();
    const alt = m.findLast((x) => new Date(x.timestamp).getTime() <= ende - 6 * H) ?? m[0];
    daten.pegelTrend = (last.value - alt.value) / ((ende - new Date(alt.timestamp).getTime()) / H); // cm/h
  }

  /* Zeitreihen-Zugriff: linear interpoliert, mit Klemme an den Rändern */
  function reihe(serie, tMs) {
    const { t } = serie;
    if (tMs <= t[0]) return 0;
    let i = t.findIndex((x) => x > tMs);
    if (i < 0) i = t.length - 1;
    return Math.max(0, i - 1);
  }
  function wert(serie, feld, tMs) {
    const i = reihe(serie, tMs);
    const a = serie[feld][i], b = serie[feld][Math.min(i + 1, serie[feld].length - 1)];
    if (a == null || b == null) return a ?? b;
    const f = clamp01((tMs - serie.t[i]) / (serie.t[Math.min(i + 1, serie.t.length - 1)] - serie.t[i] || 1));
    return lerp(a, b, f);
  }

  /* ── Modell ──────────────────────────────────────────────────── */
  function saison(art, tMs) {
    const d = new Date(tMs);
    const tag = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
                 Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1;
    const k = art.saison;
    for (let i = 1; i < k.length; i++) {
      if (tag <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (tag - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
    }
    return k[k.length - 1][1];
  }
  function trapez(x, [a, b, c, d]) {
    if (x <= a || x >= d) return 0.08;             // Restwert statt hartem Null
    if (x < b) return lerp(0.08, 1, (x - a) / (b - a));
    if (x <= c) return 1;
    return lerp(1, 0.08, (x - c) / (d - c));
  }
  function lichtFaktor(art, tMs, cloud) {
    const s = sunTimes(tMs);
    if (!s) return 0.6;
    const dRise = Math.abs(tMs - s.rise) / H, dSet = Math.abs(tMs - s.set) / H;
    const daemmer = Math.max(Math.exp(-(dRise * dRise) / 2.2), Math.exp(-(dSet * dSet) / 2.2));
    const tagIst = tMs > s.rise && tMs < s.set;
    const wolkig = (cloud ?? 50) / 100;
    let base;
    switch (art.licht) {
      case 'tag': base = tagIst ? 0.95 : 0.15; break;
      case 'nacht': base = tagIst ? 0.25 : 1; break;
      case 'nachtdaemmerung': base = tagIst ? 0.35 + 0.3 * wolkig : 0.9; break;
      case 'daemmerung': base = tagIst ? 0.45 + 0.2 * wolkig : 0.55; break;
      case 'egal': base = 0.8; break;
      default: base = tagIst ? 0.6 + 0.2 * wolkig : 0.4;   // tagdaemmerung
    }
    return clamp01(Math.max(base, art.licht === 'tag' ? base : daemmer));
  }
  function druckFaktor(tMs) {
    const w = daten.wetter;
    const p1 = wert(w, 'druck', tMs), p0 = wert(w, 'druck', tMs - 3 * H);
    if (p1 == null || p0 == null) return 1;
    const dp = Math.abs(p1 - p0);
    return dp <= 1 ? 1 : dp >= 6 ? 0.55 : 1 - (dp - 1) * 0.09;
  }
  function windMittel24h(tMs) {
    const w = daten.wetter;
    let s = 0, n = 0;
    for (let h = 0; h <= 24; h += 3) { const v = wert(w, 'ms', tMs - h * H); if (v != null) { s += v; n++; } }
    return n ? s / n : 4;
  }

  function score(art, tMs) {
    const w = daten.wetter;
    const sst = daten.sst ? wert(daten.sst, 'v', tMs) : null;
    let s = saison(art, tMs);
    if (sst != null) s *= trapez(sst, art.temp);
    s *= lichtFaktor(art, tMs, wert(w, 'cloud', tMs));
    s *= trapez(wert(w, 'ms', tMs) ?? 4, art.wind);
    s *= druckFaktor(tMs);
    if (art.einstrom && daten.pegelTrend != null) {
      s *= daten.pegelTrend > 0.5 ? 1.2 : daten.pegelTrend > 0 ? 1.1 : 1;
    }
    if (art.truebung && windMittel24h(tMs) > 6) s *= 1.15;
    if (art.mond) {
      const { illum } = moonIllum(tMs);
      const nacht = !(tMs > sunTimes(tMs)?.rise && tMs < sunTimes(tMs)?.set);
      if (nacht) s *= illum < 0.35 ? 1.15 : illum > 0.8 && (wert(w, 'cloud', tMs) ?? 50) < 40 ? 0.85 : 1;
    }
    return clamp01(s);
  }

  /* Bestes 2-h-Fenster in den nächsten 48 h */
  function bestesFenster(art, ab) {
    let best = { s: 0, t: null };
    for (let h = 0; h < 47; h++) {
      const t = ab + h * H;
      const s = (score(art, t) + score(art, t + H)) / 2;
      if (s > best.s + 0.01) best = { s, t };
    }
    return best;
  }

  /* ── Formatierer ─────────────────────────────────────────────── */
  const fmtT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtU = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const KOMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const kompass = (d) => KOMPASS[Math.round(d / 22.5) % 16];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── Rendering ───────────────────────────────────────────────── */
  function chip(label, val, extra = '') {
    return `<span class="bf-chip">${label} <b>${val}</b>${extra}</span>`;
  }
  function renderNow(jetzt) {
    const w = daten.wetter;
    const teile = [];
    const ms = wert(w, 'ms', jetzt), dir = wert(w, 'dir', jetzt);
    if (ms != null) teile.push(chip('Wind', `${ms.toFixed(0)} m/s`, ` <span>${kompass(dir)}</span>`));
    if (daten.sst) teile.push(chip('Ostsee', `${wert(daten.sst, 'v', jetzt).toFixed(1)} °C`));
    teile.push(chip('Luft', `${wert(w, 'temp', jetzt).toFixed(0)} °C`));
    if (daten.pegelTrend != null) {
      const cm6 = daten.pegelTrend * 6;
      teile.push(chip('Pegel', `${cm6 >= 0 ? '+' : ''}${cm6.toFixed(0)} cm/6 h`,
        cm6 > 3 ? ' <span class="up">Einstrom</span>' : cm6 < -3 ? ' <span class="down">Ausstrom</span>' : ''));
    }
    const p1 = wert(w, 'druck', jetzt), dp = p1 - wert(w, 'druck', jetzt - 3 * H);
    teile.push(chip('Druck', `${p1.toFixed(0)} hPa`, ` <span>${dp > 0.8 ? '↗' : dp < -0.8 ? '↘' : '→'}</span>`));
    const s = sunTimes(jetzt);
    if (s) teile.push(chip('Sonne', `${fmtU.format(s.rise)}–${fmtU.format(s.set)}`));
    const m = moonIllum(jetzt);
    teile.push(chip('Mond', MOND_NAME(m.age), ` <span>${(m.illum * 100).toFixed(0)} %</span>`));
    $('#now-strip').innerHTML = teile.join('');
  }

  function faktorZeile(name, wertung, text) {
    const st = wertung >= 0.75 ? ['✓', 'gut'] : wertung >= 0.45 ? ['~', 'mittel'] : ['✗', 'schlecht'];
    return `<li><span class="st ${st[1]}">${st[0]}</span>${name}: ${text}</li>`;
  }

  function uferHinweis(dir) {
    if (dir > 315 || dir <= 45) return 'Wind drückt ans Südufer';
    if (dir > 135 && dir <= 225) return 'Wind drückt ans Nordufer';
    return 'Wind läuft längs der Schlei';
  }

  function renderCards(jetzt) {
    const box = $('#cards');
    box.innerHTML = '';
    const w = daten.wetter;
    const bewertet = ARTEN.map((art) => ({ art, best: bestesFenster(art, jetzt), nun: score(art, jetzt) }))
      .sort((a, b) => b.best.s - a.best.s);

    for (const { art, best, nun } of bewertet) {
      const ausSaison = best.s < 0.12;
      const el = document.createElement('article');
      el.className = 'bf-card' + (ausSaison ? ' aus-saison' : '');

      const fische = Math.round(best.s * 5);
      const skala = Array.from({ length: 5 }, (_, i) =>
        `<span class="${i < fische ? 'an' : 'aus'}">🐟</span>`).join('');

      const sst = daten.sst ? wert(daten.sst, 'v', jetzt) : null;
      const ms = wert(w, 'ms', jetzt);
      const dRise = sunTimes(jetzt);
      const faktoren = [
        faktorZeile('Saison', saison(art, jetzt), art.unter),
        sst != null ? faktorZeile('Wasser', trapez(sst, art.temp), `${sst.toFixed(1)} °C (Ostsee)`) : '',
        faktorZeile('Licht', lichtFaktor(art, jetzt, wert(w, 'cloud', jetzt)),
          art.licht === 'nacht' ? 'nachtaktiv' : art.licht === 'tag' ? 'Tagfisch'
          : dRise ? `Dämmerung ${fmtU.format(dRise.rise)} / ${fmtU.format(dRise.set)}` : 'Dämmerung'),
        faktorZeile('Wind', trapez(ms ?? 4, art.wind), `${(ms ?? 0).toFixed(0)} m/s`),
        faktorZeile('Druck', druckFaktor(jetzt), druckFaktor(jetzt) >= 0.95 ? 'stabil' : 'wechselhaft'),
        art.einstrom && daten.pegelTrend != null
          ? faktorZeile('Einstrom', daten.pegelTrend > 0.5 ? 1 : daten.pegelTrend > 0 ? 0.6 : 0.4,
              `Pegel ${daten.pegelTrend * 6 >= 0 ? '+' : ''}${(daten.pegelTrend * 6).toFixed(0)} cm/6 h`) : '',
        art.mond ? faktorZeile('Mond', 1 - moonIllum(jetzt).illum * 0.7,
          `${MOND_NAME(moonIllum(jetzt).age)}`) : '',
        art.truebung ? faktorZeile('Trübung', windMittel24h(jetzt) > 6 ? 1 : 0.5,
          windMittel24h(jetzt) > 6 ? 'Wind hat gewühlt' : 'eher klar') : '',
      ].filter(Boolean).join('');

      const fensterText = ausSaison
        ? `<p class="bf-fenster kein">Gerade <b>keine Saison</b> — ${esc(art.unter)}.</p>`
        : best.t
          ? `<p class="bf-fenster">Bestes Fenster: <b>${fmtT.format(best.t)}–${fmtU.format(best.t + 2 * H)} Uhr</b> (${Math.round(best.s * 100)} %${nun > 0.55 ? ' · jetzt gut' : ''})</p>`
          : '';

      el.innerHTML = `
        <div class="bf-card-head">
          <h2>${art.name}<small>${esc(art.unter)}</small></h2>
          <span class="bf-fische" title="${Math.round(best.s * 100)} % im besten Fenster" aria-label="${fische} von 5">${skala}</span>
        </div>
        ${fensterText}
        <canvas height="56" aria-hidden="true"></canvas>
        <ul class="bf-faktoren">${faktoren}</ul>
        <p class="bf-ort"><b>Wo:</b> ${esc(art.ort)}${art.ufer ? ` · ${uferHinweis(wert(w, 'dir', jetzt) ?? 0)}` : ''}<br>${esc(art.tipp)}</p>`;
      box.appendChild(el);
      zeichneTimeline(el.querySelector('canvas'), art, best, jetzt);
    }
  }

  /* 48-h-Timeline: Score-Fläche, Nacht-/Dämmerungsbänder, Top-Fenster */
  function zeichneTimeline(cv, art, best, ab) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = cv.parentElement.clientWidth - 32 || 300, Hh = 56;
    cv.width = W * dpr; cv.height = Hh * dpr;
    cv.style.width = '100%';
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const px = (t) => ((t - ab) / (48 * H)) * W;

    /* Nachtbänder */
    for (let d = -1; d < 3; d++) {
      const s = sunTimes(ab + d * DAY);
      if (!s) continue;
      const s2 = sunTimes(ab + (d + 1) * DAY);
      x.fillStyle = 'rgba(4, 10, 16, .55)';
      x.fillRect(px(s.set), 0, Math.max(0, px(s2 ? s2.rise : s.set + 8 * H) - px(s.set)), Hh);
    }
    /* Score-Fläche */
    x.beginPath();
    x.moveTo(0, Hh);
    for (let h = 0; h <= 48; h++) x.lineTo(px(ab + h * H), Hh - 4 - score(art, ab + h * H) * (Hh - 10));
    x.lineTo(W, Hh); x.closePath();
    const grad = x.createLinearGradient(0, 0, 0, Hh);
    grad.addColorStop(0, 'rgba(127, 212, 168, .55)');
    grad.addColorStop(1, 'rgba(127, 212, 168, .06)');
    x.fillStyle = grad; x.fill();
    x.beginPath();
    for (let h = 0; h <= 48; h++) {
      const X = px(ab + h * H), Y = Hh - 4 - score(art, ab + h * H) * (Hh - 10);
      h ? x.lineTo(X, Y) : x.moveTo(X, Y);
    }
    x.strokeStyle = '#7fd4a8'; x.lineWidth = 1.6; x.stroke();

    /* Tagesgrenzen + Labels */
    x.fillStyle = 'rgba(157, 180, 192, .75)'; x.font = '9px Instrument Sans, sans-serif';
    for (let h = 1; h < 48; h++) {
      const t = ab + h * H;
      if (new Date(t).getHours() === 0) {
        x.strokeStyle = 'rgba(157, 180, 192, .25)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(px(t), 0); x.lineTo(px(t), Hh); x.stroke();
        x.fillText(new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(t), px(t) + 4, 10);
      }
    }
    /* Top-Fenster */
    if (best.t && best.s >= 0.12) {
      x.fillStyle = 'rgba(255, 176, 87, .22)';
      x.fillRect(px(best.t), 0, px(best.t + 2 * H) - px(best.t), Hh);
      x.strokeStyle = '#ffb057'; x.lineWidth = 1.4;
      x.strokeRect(px(best.t) + 0.5, 0.5, px(best.t + 2 * H) - px(best.t) - 1, Hh - 1);
    }
  }

  /* ── Start ───────────────────────────────────────────────────── */
  async function init() {
    $('#btn-info').addEventListener('click', () => $('#dlg-info').showModal());
    $('#lead-info').addEventListener('click', () => $('#dlg-info').showModal());

    const res = await Promise.allSettled([ladeWetter(), ladeSst(), ladePegel()]);
    if (!daten.wetter) {
      $('#loading').textContent = 'Die Wettervorhersage ist gerade nicht erreichbar — bitte später erneut versuchen.';
      return;
    }
    res.forEach((r) => { if (r.status === 'rejected') console.warn('Teildaten fehlen:', r.reason); });
    $('#loading').hidden = true;
    const jetzt = Date.now();
    renderNow(jetzt);
    renderCards(jetzt);
    window.BEISS = { daten, score, ARTEN };        // für Tests/Debugging
    let rT = 0;
    addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => renderCards(jetzt), 200); }, { passive: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
