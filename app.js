/* ═══════════════════════════════════════════════════════════════
   SCHLEIPEGEL — Datenlogik & Visualisierung
   Quelle: PEGELONLINE REST-API v2 (WSV), CORS offen, keine Auth.
   Rohdaten (W, 1-Minuten-Raster) sind maximal 31 Tage abrufbar.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const API = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';

const STATIONS = [
  {
    id: 'schleswig',
    uuid: '09370c05-1041-4395-a5d4-b8db6e59c4c8',
    name: 'Schleswig',
    number: '9610040',
    position: 'Innere Schlei · Stadthafen',
    lat: 54.511432, lon: 9.569059,
    colorVar: '--s-schleswig',
    // Fallback, wird live überschrieben (Bezugszeitraum 2010–2020)
    charVals: { MNW: 400, MW: 508, MHW: 617 },
    gaugeZero: -5.018,
  },
  {
    id: 'kappeln',
    uuid: 'b09f2243-60f0-469a-8f3b-0ea6abc83267',
    name: 'Kappeln',
    number: '9610035',
    position: 'Äußere Schlei · Hafen',
    lat: 54.664384, lon: 9.937938,
    colorVar: '--s-kappeln',
    charVals: { MNW: 410, MW: 506, MHW: 610 },
    gaugeZero: -4.991,
  },
];

/* Dritter Schlei-Pegel an der Lotseninsel — seit der Ostsee-Sturmflut
   außer Betrieb und nicht mehr in der API-Stationsliste. Wird bei jedem
   Laden erneut angefragt; liefert er wieder Daten, erscheint der Livewert. */
const SCHLEIMUENDE = {
  id: 'schleimuende',
  name: 'Schleimünde',
  number: '9610025',
  lat: 54.671, lon: 10.035,
  svg: [993, 81],
};

/* Wind: DWD-Beobachtungen über die Bright-Sky-API (CORS offen, ohne Schlüssel).
   Bevorzugt wird die DWD-Station Schleswig (04466 / WMO 10035) direkt an der
   Schlei; fällt sie aus, nimmt die Anzeige die nächste Station zum Mittelpunkt
   der Schlei. (Die WarnWetter-/bund.dev-API liefert nur MOSMIX-Vorhersagen
   und sendet keine CORS-Header — für Messwerte im Browser ungeeignet.) */
const WIND_STATION_ID = '04466';
const WIND_POS = { lat: 54.6, lon: 9.8 };

const state = {
  rangeDays: 1,
  tableView: false,
  visible: { schleswig: true, kappeln: true },
  series: { schleswig: null, kappeln: null },   // volle 31-Tage-Reihe [{t: Date, v: number}]
  seriesDays: 0,                                 // wie viele Tage bereits geladen sind
  current: { schleswig: null, kappeln: null },
  schleimuende: null,   // Livewert, falls die Station wieder sendet
  wind: null,           // aktuelle DWD-Windmessung
  windHistory: null,    // stündliche Windmessungen der letzten 31 Tage
};

const $ = (sel) => document.querySelector(sel);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtCm = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const fmtM = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWind = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDayTime = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

/* ── API ────────────────────────────────────────────────────── */

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.json();
}

function fetchStationDetails(st) {
  return fetchJson(`${API}/stations/${st.uuid}.json?includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true`);
}

async function fetchMeasurements(st, days) {
  const raw = await fetchJson(`${API}/stations/${st.uuid}/W/measurements.json?start=P${days}D`);
  return raw
    .filter((m) => Number.isFinite(m.value))
    .map((m) => ({ t: new Date(m.timestamp), v: m.value }));
}

/* ── Zustand / Einstufung ───────────────────────────────────── */

function classify(value, cv) {
  if (value >= cv.MHW) return { label: 'Hochwasser', ico: '▲', color: 'var(--st-critical)' };
  if (value <= cv.MNW) return { label: 'Niedrigwasser', ico: '▼', color: 'var(--st-serious)' };
  const span = cv.MHW - cv.MNW;
  if (value >= cv.MW + span * 0.25) return { label: 'Erhöht', ico: '△', color: 'var(--st-warn)' };
  if (value <= cv.MW - span * 0.25) return { label: 'Niedrig', ico: '▽', color: 'var(--st-warn)' };
  return { label: 'Normal', ico: '●', color: 'var(--st-good)' };
}

function trendInfo(trend) {
  if (trend > 0) return { txt: 'steigend', arrow: '↗' };
  if (trend < 0) return { txt: 'fallend', arrow: '↘' };
  return { txt: 'gleichbleibend', arrow: '→' };
}

/* Trend aus der Reihe schätzen (letzte 2 h), falls die API keinen liefert */
function estimateTrend(series) {
  if (!series || series.length < 10) return 0;
  const last = series[series.length - 1];
  const cutoff = last.t.getTime() - 2 * 3600e3;
  const older = series.filter((p) => p.t.getTime() >= cutoff);
  if (older.length < 2) return 0;
  const diff = last.v - older[0].v;
  return Math.abs(diff) < 2 ? 0 : Math.sign(diff);
}

/* ── WIND ───────────────────────────────────────────────────── */

const BFT_LIMITS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
const BFT_NAMES = ['Windstille', 'leiser Zug', 'leichte Brise', 'schwache Brise',
  'mäßige Brise', 'frische Brise', 'starker Wind', 'steifer Wind',
  'stürmischer Wind', 'Sturm', 'schwerer Sturm', 'orkanartiger Sturm', 'Orkan'];

function beaufort(ms) {
  const bft = BFT_LIMITS.findIndex((lim) => ms < lim);
  return bft === -1 ? 12 : bft;
}

const COMPASS_POINTS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compassPoint(deg) {
  return COMPASS_POINTS[Math.round(deg / 22.5) % 16];
}

async function loadWind() {
  const queries = [
    `dwd_station_id=${WIND_STATION_ID}`,                 // Schleswig, direkt an der Schlei
    `lat=${WIND_POS.lat}&lon=${WIND_POS.lon}`,           // Rückfall: nächste Station
  ];
  for (const q of queries) {
    try {
      const data = await fetchJson(`https://api.brightsky.dev/current_weather?${q}`);
      const w = data.weather;
      if (w?.wind_speed_10 == null || w?.wind_direction_10 == null) continue;
      const src = (data.sources || []).find((s) => s.station_name) || {};
      state.wind = {
        speedMs: w.wind_speed_10 / 3.6,                                  // km/h → m/s
        gustMs: w.wind_gust_speed_10 != null ? w.wind_gust_speed_10 / 3.6 : null,
        dir: w.wind_direction_10,
        timestamp: new Date(w.timestamp),
        station: src.station_name || 'DWD-Station',
        distanceKm: src.distance != null ? Math.round(src.distance / 1000) : null,
      };
      return;
    } catch (e) {
      console.warn('Winddaten-Abfrage fehlgeschlagen:', q, e);
    }
  }
  state.wind = null;
}

/* Stündliche Windhistorie (31 Tage). k = Ost-West-Komponente in m/s:
   positiv = Wind aus Ost (staut Wasser ein), negativ = aus West (drückt hinaus). */
async function loadWindHistory() {
  const day = (d) => d.toISOString().slice(0, 10);
  const start = new Date(Date.now() - 31 * 24 * 3600e3);
  const end = new Date(Date.now() + 24 * 3600e3);
  const queries = [
    `dwd_station_id=${WIND_STATION_ID}`,
    `lat=${WIND_POS.lat}&lon=${WIND_POS.lon}`,
  ];
  for (const q of queries) {
    try {
      const data = await fetchJson(`https://api.brightsky.dev/weather?${q}&date=${day(start)}&last_date=${day(end)}`);
      const recs = (data.weather || [])
        .filter((r) => r.wind_speed != null && r.wind_direction != null)
        .map((r) => {
          const ms = r.wind_speed / 3.6;
          return {
            t: new Date(r.timestamp),
            ms,
            dir: r.wind_direction,
            k: ms * Math.sin((r.wind_direction * Math.PI) / 180),
          };
        })
        .filter((r) => r.t.getTime() <= Date.now());
      if (recs.length) { state.windHistory = recs; return true; }
    } catch (e) {
      console.warn('Windhistorie-Abfrage fehlgeschlagen:', q, e);
    }
  }
  return false;
}

function compassSvg(dir) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'compass');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Windrichtung ${Math.round(dir)} Grad, aus ${compassPoint(dir)}`);

  const ring = document.createElementNS(svgNS, 'circle');
  ring.setAttribute('cx', 50); ring.setAttribute('cy', 50); ring.setAttribute('r', 37);
  ring.setAttribute('class', 'compass-ring');
  svg.appendChild(ring);

  for (let i = 0; i < 16; i++) {
    const major = i % 4 === 0;
    const a = (i * 22.5 - 90) * Math.PI / 180;
    const r1 = 37, r2 = major ? 30 : 33.5;
    const tick = document.createElementNS(svgNS, 'line');
    tick.setAttribute('x1', 50 + r1 * Math.cos(a)); tick.setAttribute('y1', 50 + r1 * Math.sin(a));
    tick.setAttribute('x2', 50 + r2 * Math.cos(a)); tick.setAttribute('y2', 50 + r2 * Math.sin(a));
    tick.setAttribute('class', major ? 'compass-tick-major' : 'compass-tick');
    svg.appendChild(tick);
  }

  [['N', 50, 9], ['O', 93, 53.5], ['S', 50, 97], ['W', 7, 53.5]].forEach(([txt, x, y]) => {
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'compass-letter');
    t.textContent = txt;
    svg.appendChild(t);
  });

  // Pfeil: Schaft vom Rand (Herkunftsrichtung) durchs Zentrum, Spitze = Strömungsrichtung
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('transform', `rotate(${dir} 50 50)`);
  const shaft = document.createElementNS(svgNS, 'line');
  shaft.setAttribute('x1', 50); shaft.setAttribute('y1', 20);
  shaft.setAttribute('x2', 50); shaft.setAttribute('y2', 72);
  shaft.setAttribute('class', 'compass-needle');
  const head = document.createElementNS(svgNS, 'polygon');
  head.setAttribute('points', '44,70 56,70 50,82');
  head.setAttribute('class', 'compass-head');
  g.append(shaft, head);
  svg.appendChild(g);

  return svg;
}

function renderWindTile() {
  const w = state.wind;
  const tile = document.createElement('article');
  tile.className = 'tile tile-wind' + (w ? '' : ' is-loading');
  tile.style.setProperty('--tile-color', 'var(--reed)');

  const top = document.createElement('div');
  top.className = 'tile-top';
  const nameBox = document.createElement('div');
  const name = document.createElement('h3');
  name.className = 'tile-name';
  name.textContent = 'Wind über der Schlei';
  const sub = document.createElement('p');
  sub.className = 'tile-sub';
  sub.textContent = w
    ? `DWD-Station ${w.station}${w.distanceKm != null ? ` · ${w.distanceKm} km` : ''}`
    : 'DWD-Beobachtung';
  nameBox.append(name, sub);
  top.appendChild(nameBox);

  if (w) {
    const bft = beaufort(w.speedMs);
    const chip = document.createElement('span');
    chip.className = 'tile-state';
    chip.textContent = `${bft} Bft · ${BFT_NAMES[bft]}`;
    top.appendChild(chip);
  }
  tile.appendChild(top);

  const body = document.createElement('div');
  body.className = 'wind-body';

  if (w) {
    body.appendChild(compassSvg(w.dir));

    const facts = document.createElement('div');
    facts.className = 'wind-facts';

    const valueRow = document.createElement('div');
    valueRow.className = 'tile-value-row';
    const val = document.createElement('span');
    val.className = 'tile-value';
    val.textContent = fmtWind.format(w.speedMs);
    const unit = document.createElement('span');
    unit.className = 'tile-unit';
    unit.textContent = 'm/s';
    valueRow.append(val, unit);
    facts.appendChild(valueRow);

    const meta = document.createElement('div');
    meta.className = 'wind-meta';
    const dirLine = document.createElement('span');
    dirLine.textContent = `aus ${compassPoint(w.dir)} (${Math.round(w.dir)}°)`;
    const knLine = document.createElement('span');
    knLine.textContent = `≙ ${fmtCm.format(w.speedMs * 1.9438)} kn`;
    meta.append(dirLine, knLine);
    if (w.gustMs != null) {
      const gust = document.createElement('span');
      gust.textContent = `Böen bis ${fmtCm.format(w.gustMs)} m/s`;
      meta.appendChild(gust);
    }
    facts.appendChild(meta);
    body.appendChild(facts);
  } else {
    const err = document.createElement('p');
    err.className = 'tile-meta';
    err.textContent = 'Winddaten derzeit nicht verfügbar.';
    body.appendChild(err);
  }
  tile.appendChild(body);

  const foot = document.createElement('div');
  foot.className = 'tile-foot';
  const src = document.createElement('span');
  src.textContent = 'Quelle: DWD via Bright Sky';
  const ts = document.createElement('span');
  ts.textContent = w ? `Messung ${fmtTime.format(w.timestamp)} Uhr` : '';
  foot.append(src, ts);
  tile.appendChild(foot);

  return tile;
}

/* ── HERO: Wind-Animation ───────────────────────────────────────
   Treibende Windschlieren über der Schlei-Silhouette. Richtung folgt der
   Messung; Anzahl, Tempo und Streifenlänge skalieren mit der Windstärke. */

const windAnim = { canvas: null, ctx: null, parts: [], raf: 0, params: null, visible: true, dpr: 1, last: 0 };

function windParticle(W, H) {
  return {
    x: Math.random() * W, y: Math.random() * H,
    life: Math.random(),
    dur: 2.2 + Math.random() * 2.5,
    jitter: 0.6 + Math.random() * 0.8,
  };
}

function setupWindAnimation() {
  if (!state.wind) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const wrap = $('#fjord-wrap');
  if (!windAnim.canvas) {
    const c = document.createElement('canvas');
    c.id = 'wind-canvas';
    c.setAttribute('aria-hidden', 'true');
    wrap.appendChild(c);
    windAnim.canvas = c;
    windAnim.ctx = c.getContext('2d');
    const resize = () => {
      windAnim.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, wrap.clientWidth * windAnim.dpr);
      c.height = Math.max(1, wrap.clientHeight * windAnim.dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    new IntersectionObserver((entries) => { windAnim.visible = entries[0].isIntersecting; }).observe(wrap);
  }

  const ms = state.wind.speedMs;
  const b = (((state.wind.dir + 180) % 360) * Math.PI) / 180;   // Strömungsrichtung
  windAnim.params = {
    vx: Math.sin(b), vy: -Math.cos(b),
    speed: 22 + ms * 16,                                        // px/s
    len: 12 + ms * 4,
    n: Math.max(10, Math.min(110, Math.round(8 + ms * 9))),
    alpha: Math.min(0.5, 0.2 + ms * 0.04),
  };
  if (!windAnim.raf) {
    windAnim.last = performance.now();
    windAnim.raf = requestAnimationFrame(windTick);
  }
}

function windTick(now) {
  windAnim.raf = requestAnimationFrame(windTick);
  const { canvas: c, ctx, params: p, dpr } = windAnim;
  const dt = Math.min(0.1, (now - windAnim.last) / 1000);
  windAnim.last = now;
  if (!p || document.hidden || !windAnim.visible) return;

  const W = c.width, H = c.height;
  while (windAnim.parts.length < p.n) windAnim.parts.push(windParticle(W, H));
  if (windAnim.parts.length > p.n) windAnim.parts.length = p.n;

  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 1.4 * dpr;
  ctx.lineCap = 'round';
  const margin = p.len * dpr + 24;
  for (const q of windAnim.parts) {
    q.life += dt / q.dur;
    if (q.life >= 1) Object.assign(q, windParticle(W, H), { life: 0 });
    const v = p.speed * dpr * q.jitter;
    q.x += p.vx * v * dt;
    q.y += p.vy * v * dt;
    if (q.x < -margin) q.x += W + 2 * margin;
    if (q.x > W + margin) q.x -= W + 2 * margin;
    if (q.y < -margin) q.y += H + 2 * margin;
    if (q.y > H + margin) q.y -= H + 2 * margin;
    const a = Math.sin(q.life * Math.PI) * p.alpha;
    ctx.strokeStyle = `rgba(159, 211, 238, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x - p.vx * p.len * dpr * q.jitter, q.y - p.vy * p.len * dpr * q.jitter);
    ctx.stroke();
  }
}

/* ── HERO: Schlei-Silhouette ────────────────────────────────── */

function renderFjord() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const body = $('#fjord-body');
  const placesG = $('#fjord-places');

  const water = document.createElementNS(svgNS, 'path');
  water.setAttribute('d', SCHLEI_GEO.path);
  water.setAttribute('class', 'fjord-water');
  body.appendChild(water);

  for (const [name, [x, y]] of Object.entries(SCHLEI_GEO.places)) {
    if (name === 'Schleswig' || name === 'Kappeln' || name === 'Schleimünde') continue; // bekommen Pegel-Marker
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 3.5);
    dot.setAttribute('class', 'fjord-place-dot');
    placesG.appendChild(dot);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('class', 'fjord-place-label');
    // Missunde unterhalb, Arnis rechts, Schleimünde oberhalb-links
    if (name === 'Schleimünde') { label.setAttribute('x', x - 14); label.setAttribute('y', y - 22); label.setAttribute('text-anchor', 'end'); }
    else if (name === 'Arnis') { label.setAttribute('x', x + 12); label.setAttribute('y', y + 5); }
    else { label.setAttribute('x', x + 2); label.setAttribute('y', y + 24); }
    label.textContent = name;
    placesG.appendChild(label);
  }
}

function renderFjordGauges() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const g = $('#fjord-gauges');
  g.replaceChildren();

  for (const st of STATIONS) {
    const [x, y] = SCHLEI_GEO.gauges[st.id];
    const cur = state.current[st.id];

    const halo = document.createElementNS(svgNS, 'circle');
    halo.setAttribute('cx', x); halo.setAttribute('cy', y); halo.setAttribute('r', 8);
    halo.setAttribute('class', 'fjord-gauge-halo');
    g.appendChild(halo);

    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 6);
    dot.setAttribute('class', 'fjord-gauge-dot');
    g.appendChild(dot);

    // Wert-Annotation: Schleswig oberhalb, Kappeln links unterhalb
    const anchor = st.id === 'schleswig'
      ? { x: x + 6, y: y - 78, align: 'start' }
      : { x: x - 26, y: y - 6, align: 'end' };

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', anchor.x); label.setAttribute('y', anchor.y);
    label.setAttribute('text-anchor', anchor.align);
    label.setAttribute('class', 'fjord-value-label');
    label.textContent = `Pegel ${st.name}`;
    g.appendChild(label);

    const value = document.createElementNS(svgNS, 'text');
    value.setAttribute('x', anchor.x); value.setAttribute('y', anchor.y + 30);
    value.setAttribute('text-anchor', anchor.align);
    value.setAttribute('class', 'fjord-value');
    value.textContent = cur ? `${fmtCm.format(cur.value)} cm` : '— cm';
    g.appendChild(value);
  }

  // Schleimünde: außer Betrieb (grau), Livewert nur falls die Station wieder sendet
  const sm = SCHLEIMUENDE;
  const [sx, sy] = sm.svg;
  const live = state.schleimuende;

  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('r', 6);
  dot.setAttribute('class', live ? 'fjord-gauge-dot' : 'fjord-gauge-dot is-inactive');
  g.appendChild(dot);
  if (live) {
    const halo = document.createElementNS(svgNS, 'circle');
    halo.setAttribute('cx', sx); halo.setAttribute('cy', sy); halo.setAttribute('r', 8);
    halo.setAttribute('class', 'fjord-gauge-halo');
    g.insertBefore(halo, dot);
  }

  const smLabel = document.createElementNS(svgNS, 'text');
  smLabel.setAttribute('x', sx - 16); smLabel.setAttribute('y', sy - 44);
  smLabel.setAttribute('text-anchor', 'end');
  smLabel.setAttribute('class', 'fjord-value-label' + (live ? '' : ' is-inactive'));
  smLabel.textContent = `Pegel ${sm.name}`;
  g.appendChild(smLabel);

  const smValue = document.createElementNS(svgNS, 'text');
  smValue.setAttribute('x', sx - 16); smValue.setAttribute('y', sy - 16);
  smValue.setAttribute('text-anchor', 'end');
  smValue.setAttribute('class', live ? 'fjord-value' : 'fjord-status');
  smValue.textContent = live ? `${fmtCm.format(live.value)} cm` : 'außer Betrieb';
  g.appendChild(smValue);
}

/* ── STAT-KACHELN ───────────────────────────────────────────── */

function sparklinePath(series, w, h, pad = 2) {
  const vals = series.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const t0 = series[0].t.getTime(), t1 = series[series.length - 1].t.getTime();
  const tspan = t1 - t0 || 1;
  return series.map((p, i) => {
    const x = pad + ((p.t.getTime() - t0) / tspan) * (w - 2 * pad);
    const y = h - pad - ((p.v - min) / span) * (h - 2 * pad);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join('');
}

function renderTiles() {
  const wrap = $('#tiles');
  wrap.replaceChildren();

  for (const st of STATIONS) {
    const cur = state.current[st.id];
    const cv = st.charVals;
    const tile = document.createElement('article');
    tile.className = 'tile' + (cur ? '' : ' is-loading');
    tile.style.setProperty('--tile-color', `var(${st.colorVar})`);

    const top = document.createElement('div');
    top.className = 'tile-top';
    const nameBox = document.createElement('div');
    const name = document.createElement('h3');
    name.className = 'tile-name';
    name.textContent = `Pegel ${st.name}`;
    const sub = document.createElement('p');
    sub.className = 'tile-sub';
    sub.textContent = `${st.position} · Nr. ${st.number}`;
    nameBox.append(name, sub);
    top.appendChild(nameBox);

    if (cur) {
      const cls = classify(cur.value, cv);
      const stateChip = document.createElement('span');
      stateChip.className = 'tile-state';
      const ico = document.createElement('span');
      ico.className = 'state-ico';
      ico.style.color = cls.color;
      ico.textContent = cls.ico;
      stateChip.append(ico, document.createTextNode(cls.label));
      top.appendChild(stateChip);
    }
    tile.appendChild(top);

    const valueRow = document.createElement('div');
    valueRow.className = 'tile-value-row';
    const val = document.createElement('span');
    val.className = 'tile-value';
    val.textContent = cur ? fmtCm.format(cur.value) : '···';
    const unit = document.createElement('span');
    unit.className = 'tile-unit';
    unit.textContent = 'cm über PNP';
    valueRow.append(val, unit);

    if (cur) {
      const delta = cur.value - cv.MW;
      const d = document.createElement('span');
      d.className = 'tile-delta ' + (delta >= 0 ? 'up' : 'down');
      d.textContent = `${delta >= 0 ? '+' : '−'}${fmtCm.format(Math.abs(delta))} cm zu MW`;
      valueRow.appendChild(d);
    }
    tile.appendChild(valueRow);

    const meta = document.createElement('div');
    meta.className = 'tile-meta';
    if (cur) {
      const trend = trendInfo(cur.trend);
      const t1 = document.createElement('span');
      t1.textContent = `${trend.arrow} Tendenz ${trend.txt}`;
      const nhn = document.createElement('span');
      nhn.textContent = `≈ ${fmtM.format(cur.value / 100 + st.gaugeZero)} m NHN`;
      meta.append(t1, nhn);
    } else {
      meta.textContent = 'Lade aktuelle Messung …';
    }
    tile.appendChild(meta);

    // Sparkline: letzte 24 h
    const series = state.series[st.id];
    if (series && series.length > 2) {
      const cutoff = Date.now() - 24 * 3600e3;
      const day = series.filter((p) => p.t.getTime() >= cutoff);
      if (day.length > 2) {
        const sw = 560, sh = 44;
        const spark = document.createElement('div');
        spark.className = 'tile-spark';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', sparklinePath(downsample(day, 160), sw, sh));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', `var(${st.colorVar})`);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        spark.appendChild(svg);
        tile.appendChild(spark);
      }
    }

    const foot = document.createElement('div');
    foot.className = 'tile-foot';
    const kw = document.createElement('span');
    kw.textContent = `MNW ${cv.MNW} · MW ${cv.MW} · MHW ${cv.MHW} cm`;
    const ts = document.createElement('span');
    ts.textContent = cur ? `Messung ${fmtDayTime.format(cur.timestamp)} Uhr` : '';
    foot.append(kw, ts);
    tile.appendChild(foot);

    wrap.appendChild(tile);
  }

  wrap.appendChild(renderWindTile());
}

/* ── CHART ──────────────────────────────────────────────────── */

/* Bucket-Mittelwert: dampft 43k Minutenwerte auf Chart-Auflösung */
function downsample(series, buckets) {
  if (series.length <= buckets) return series;
  const t0 = series[0].t.getTime(), t1 = series[series.length - 1].t.getTime();
  const w = (t1 - t0) / buckets || 1;
  const out = [];
  let bi = 0, sum = 0, n = 0, tSum = 0;
  for (const p of series) {
    const idx = Math.min(buckets - 1, Math.floor((p.t.getTime() - t0) / w));
    if (idx !== bi && n) {
      out.push({ t: new Date(tSum / n), v: sum / n });
      sum = 0; n = 0; tSum = 0; bi = idx;
    }
    sum += p.v; n++; tSum += p.t.getTime();
  }
  if (n) out.push({ t: new Date(tSum / n), v: sum / n });
  return out;
}

function sliceRange(series, days) {
  if (!series) return null;
  const cutoff = Date.now() - days * 24 * 3600e3;
  return series.filter((p) => p.t.getTime() >= cutoff);
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/* Zeit-Ticks auf runden Stunden bzw. Mitternacht, ~5–7 Stück */
function timeTicks(tMin, tMax, pw) {
  const spanH = (tMax - tMin) / 3600e3;
  const maxTicks = Math.max(3, Math.min(7, Math.floor(pw / 130)));
  const stepH = [1, 2, 3, 4, 6, 12, 24, 48, 72, 96, 120, 168]
    .find((s) => spanH / s <= maxTicks) || 168;
  const first = new Date(tMin);
  first.setMinutes(0, 0, 0);
  if (stepH >= 24) first.setHours(0);
  const advance = stepH >= 24 ? 24 * 3600e3 : 3600e3;
  while (first.getTime() < tMin || (stepH < 24 && first.getHours() % stepH !== 0)) {
    first.setTime(first.getTime() + advance);
  }
  const ticks = [];
  for (let t = first.getTime(); t <= tMax; t += stepH * 3600e3) ticks.push(t);
  return ticks;
}

const chart = { data: null, geom: null };

function renderChart() {
  const svg = $('#chart-svg');
  const svgNS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();

  const desc = document.createElementNS(svgNS, 'desc');
  desc.textContent = 'Liniendiagramm der Wasserstände an den Pegeln Schleswig und Kappeln.';
  svg.appendChild(desc);

  const wrapW = $('#chart-wrap').clientWidth || 960;
  const W = Math.max(480, wrapW);
  const H = Math.min(440, Math.max(300, Math.round(W * 0.42)));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = 'auto';

  const m = { top: 18, right: 96, bottom: 34, left: 46 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;

  const active = STATIONS.filter((st) => state.visible[st.id] && state.series[st.id]);
  const sliced = active.map((st) => ({
    st,
    data: downsample(sliceRange(state.series[st.id], state.rangeDays), Math.min(600, Math.round(pw / 2))),
  })).filter((s) => s.data && s.data.length > 1);

  if (!sliced.length) { chart.data = null; return; }

  // Skalen — Referenzwerte (MNW/MW/MHW) einbeziehen, damit die Bänder sichtbar sind
  let vMin = Infinity, vMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const s of sliced) {
    for (const p of s.data) {
      if (p.v < vMin) vMin = p.v;
      if (p.v > vMax) vMax = p.v;
      const tt = p.t.getTime();
      if (tt < tMin) tMin = tt;
      if (tt > tMax) tMax = tt;
    }
  }
  const mwVals = STATIONS.map((st) => st.charVals.MW);
  vMin = Math.min(vMin, ...mwVals) - 8;
  vMax = Math.max(vMax, ...mwVals) + 8;
  const pad = (vMax - vMin) * 0.06;
  vMin -= pad; vMax += pad;

  const x = (t) => m.left + ((t - tMin) / (tMax - tMin || 1)) * pw;
  const y = (v) => m.top + ph - ((v - vMin) / (vMax - vMin || 1)) * ph;

  // Gitter + Y-Achse
  const yTicks = niceTicks(vMin, vMax, 6);
  for (const tv of yTicks) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', m.left); line.setAttribute('x2', m.left + pw);
    line.setAttribute('y1', y(tv)); line.setAttribute('y2', y(tv));
    line.setAttribute('class', 'grid-line');
    svg.appendChild(line);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', m.left - 8); lbl.setAttribute('y', y(tv) + 4);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('class', 'tick-label');
    lbl.textContent = fmtCm.format(tv);
    svg.appendChild(lbl);
  }

  // X-Achse (Basislinie + Zeit-Ticks)
  const base = document.createElementNS(svgNS, 'line');
  base.setAttribute('x1', m.left); base.setAttribute('x2', m.left + pw);
  base.setAttribute('y1', m.top + ph); base.setAttribute('y2', m.top + ph);
  base.setAttribute('class', 'axis-line');
  svg.appendChild(base);

  for (const tt of timeTicks(tMin, tMax, pw)) {
    const vline = document.createElementNS(svgNS, 'line');
    vline.setAttribute('x1', x(tt)); vline.setAttribute('x2', x(tt));
    vline.setAttribute('y1', m.top); vline.setAttribute('y2', m.top + ph);
    vline.setAttribute('class', 'grid-line');
    svg.appendChild(vline);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', x(tt));
    lbl.setAttribute('y', m.top + ph + 22);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('class', 'tick-label');
    const d = new Date(tt);
    lbl.textContent = state.rangeDays <= 1 ? `${fmtTime.format(d)} Uhr`
      : state.rangeDays <= 3 ? fmtDayTime.format(d)
      : fmtDay.format(d);
    svg.appendChild(lbl);
  }

  // Referenzbänder MNW / MW / MHW (Spanne beider Stationen — ehrlich statt gemittelt)
  const refs = ['MNW', 'MW', 'MHW'].map((k) => ({
    k,
    lo: Math.min(...STATIONS.map((s) => s.charVals[k])),
    hi: Math.max(...STATIONS.map((s) => s.charVals[k])),
  }));
  const refLabels = [];
  for (const r of refs) {
    if (r.hi < vMin || r.lo > vMax) continue;
    const band = document.createElementNS(svgNS, 'rect');
    band.setAttribute('x', m.left);
    band.setAttribute('width', pw);
    band.setAttribute('y', y(r.hi));
    band.setAttribute('height', Math.max(2, y(r.lo) - y(r.hi)));
    band.setAttribute('class', 'ref-band');
    svg.appendChild(band);
    refLabels.push(r);
  }

  // Serien: Fläche (Hauch) + Linie + Endpunkt + Endlabel
  const endLabels = [];
  for (const s of sliced) {
    const color = cssVar(s.st.colorVar) || '#1d6fb0';
    const dPath = s.data.map((p, i) => `${i ? 'L' : 'M'}${x(p.t.getTime()).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

    const area = document.createElementNS(svgNS, 'path');
    const first = s.data[0], last = s.data[s.data.length - 1];
    area.setAttribute('d', `${dPath}L${x(last.t.getTime()).toFixed(1)},${m.top + ph}L${x(first.t.getTime()).toFixed(1)},${m.top + ph}Z`);
    area.setAttribute('fill', color);
    area.setAttribute('class', 'series-area');
    svg.appendChild(area);

    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', dPath);
    line.setAttribute('stroke', color);
    line.setAttribute('class', 'series-line');
    svg.appendChild(line);

    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x(last.t.getTime()));
    dot.setAttribute('cy', y(last.v));
    dot.setAttribute('r', 4.5);
    dot.setAttribute('fill', color);
    dot.setAttribute('class', 'end-dot');
    svg.appendChild(dot);

    endLabels.push({ st: s.st, y: y(last.v), v: last.v, color });
  }

  // Endlabels entzerren (kollidierende Labels vertikal trennen, min. 16 px)
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 16) endLabels[i].y = endLabels[i - 1].y + 16;
  }
  for (const el of endLabels) {
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', m.left + pw + 12);
    lbl.setAttribute('y', el.y + 4);
    lbl.setAttribute('class', 'end-label');
    lbl.textContent = `${el.st.name} ${fmtCm.format(el.v)}`;
    svg.appendChild(lbl);
  }

  // Referenzlabels über den Linien, damit sie lesbar bleiben
  for (const r of refLabels) {
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', m.left + 6);
    lbl.setAttribute('y', y(r.hi) - 5);
    lbl.setAttribute('class', 'ref-label');
    lbl.textContent = r.k;
    svg.appendChild(lbl);
  }

  // Hover-Ebene
  const hoverG = document.createElementNS(svgNS, 'g');
  hoverG.setAttribute('id', 'hover-layer');
  svg.appendChild(hoverG);

  const hit = document.createElementNS(svgNS, 'rect');
  hit.setAttribute('x', m.left); hit.setAttribute('y', m.top);
  hit.setAttribute('width', pw); hit.setAttribute('height', ph);
  hit.setAttribute('fill', 'transparent');
  hit.setAttribute('id', 'chart-hit');
  svg.appendChild(hit);

  chart.data = sliced;
  chart.geom = { m, pw, ph, W, H, x, y, tMin, tMax };

  renderWindPanel();
  bindChartHover();
  renderTable();
}

/* Wind-Panel: Ost-West-Komponente unter dem Pegel-Chart, gleiche Zeitachse */
function renderWindPanel() {
  const panel = $('#wind-panel');
  const svg = $('#wind-svg');
  const hist = state.windHistory;
  if (!hist || !chart.geom) { panel.hidden = true; chart.windGeom = null; return; }

  const { m, pw, tMin, tMax, W, x } = chart.geom;
  const slice = hist.filter((r) => r.t.getTime() >= tMin && r.t.getTime() <= tMax);
  if (slice.length < 2) { panel.hidden = true; chart.windGeom = null; return; }
  panel.hidden = false;

  const svgNS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const H = 150;
  const mm = { top: 30, bottom: 10 };
  const ph = H - mm.top - mm.bottom;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const kMax = Math.max(4, Math.ceil(Math.max(...slice.map((r) => Math.abs(r.k)))));
  const y = (k) => mm.top + ph / 2 - (k / kMax) * (ph / 2);

  // Hilfslinien ± halbe Skala + Nulllinie
  const kTick = kMax >= 8 ? 5 : 2;
  for (const kv of [kTick, -kTick]) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', m.left); line.setAttribute('x2', m.left + pw);
    line.setAttribute('y1', y(kv)); line.setAttribute('y2', y(kv));
    line.setAttribute('class', 'grid-line');
    svg.appendChild(line);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', m.left - 8); lbl.setAttribute('y', y(kv) + 4);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('class', 'tick-label');
    lbl.textContent = kv > 0 ? `+${kv}` : `−${kTick}`;
    svg.appendChild(lbl);
  }
  const zero = document.createElementNS(svgNS, 'line');
  zero.setAttribute('x1', m.left); zero.setAttribute('x2', m.left + pw);
  zero.setAttribute('y1', y(0)); zero.setAttribute('y2', y(0));
  zero.setAttribute('class', 'wind-zero');
  svg.appendChild(zero);
  const unitLbl = document.createElementNS(svgNS, 'text');
  unitLbl.setAttribute('x', m.left - 8); unitLbl.setAttribute('y', y(0) + 4);
  unitLbl.setAttribute('text-anchor', 'end');
  unitLbl.setAttribute('class', 'tick-label');
  unitLbl.textContent = 'm/s';
  svg.appendChild(unitLbl);

  // Fläche + Linie, per clipPath in Ost- (oben) und West-Anteil (unten) getrennt
  const y0 = y(0);
  const defs = document.createElementNS(svgNS, 'defs');
  for (const [id, cy, ch] of [['wclip-ost', 0, y0], ['wclip-west', y0, H - y0]]) {
    const clip = document.createElementNS(svgNS, 'clipPath');
    clip.setAttribute('id', id);
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', m.left); rect.setAttribute('y', cy);
    rect.setAttribute('width', pw); rect.setAttribute('height', Math.max(0, ch));
    clip.appendChild(rect);
    defs.appendChild(clip);
  }
  svg.appendChild(defs);

  const linePath = slice.map((r, i) => `${i ? 'L' : 'M'}${x(r.t.getTime()).toFixed(1)},${y(r.k).toFixed(1)}`).join('');
  const areaPath = `${linePath}L${x(slice[slice.length - 1].t.getTime()).toFixed(1)},${y0}L${x(slice[0].t.getTime()).toFixed(1)},${y0}Z`;

  for (const [cls, clip] of [['wind-area-ost', 'wclip-ost'], ['wind-area-west', 'wclip-west']]) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', areaPath);
    p.setAttribute('class', cls);
    p.setAttribute('clip-path', `url(#${clip})`);
    svg.appendChild(p);
  }
  for (const [cls, clip] of [['wind-line-ost', 'wclip-ost'], ['wind-line-west', 'wclip-west']]) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', linePath);
    p.setAttribute('class', cls);
    p.setAttribute('clip-path', `url(#${clip})`);
    svg.appendChild(p);
  }

  // Richtungspfeile (Strömungsrichtung) als Band über dem Panel
  const step = Math.max(1, Math.ceil(slice.length / 26));
  for (let i = 0; i < slice.length; i += step) {
    const r = slice[i];
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('transform', `translate(${x(r.t.getTime()).toFixed(1)} 13) rotate(${(r.dir + 180) % 360})`);
    const glyph = document.createElementNS(svgNS, 'path');
    glyph.setAttribute('d', 'M0,5 L0,-5 M-3,-1.5 L0,-5 L3,-1.5');
    glyph.setAttribute('class', 'wind-arrow');
    g.appendChild(glyph);
    svg.appendChild(g);
  }

  // Seitenbeschriftung der Pole
  for (const [txt, ty] of [['OST', mm.top + 12], ['WEST', H - mm.bottom - 5]]) {
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', m.left + 6); lbl.setAttribute('y', ty);
    lbl.setAttribute('class', 'wind-side-label');
    lbl.textContent = txt;
    svg.appendChild(lbl);
  }

  const hoverG = document.createElementNS(svgNS, 'g');
  hoverG.setAttribute('id', 'wind-hover');
  svg.appendChild(hoverG);

  const hit = document.createElementNS(svgNS, 'rect');
  hit.setAttribute('x', m.left); hit.setAttribute('y', mm.top);
  hit.setAttribute('width', pw); hit.setAttribute('height', ph);
  hit.setAttribute('fill', 'transparent');
  hit.setAttribute('id', 'wind-hit');
  svg.appendChild(hit);

  chart.windGeom = { y, mm, H, ph, slice };
}

function bindChartHover() {
  const tooltip = $('#chart-tooltip');
  const svgNS = 'http://www.w3.org/2000/svg';

  function onMove(evt, srcSvg) {
    if (!chart.data) return;
    const { m, pw, ph, x, y, tMin, tMax, W } = chart.geom;
    const hoverG = $('#hover-layer');
    const windHoverG = $('#wind-hover');
    const rect = srcSvg.getBoundingClientRect();
    const scale = W / rect.width;
    const px = (evt.clientX - rect.left) * scale;
    const tt = tMin + ((px - m.left) / pw) * (tMax - tMin);

    hoverG.replaceChildren();
    windHoverG?.replaceChildren();
    const rows = [];
    let anchorX = null;

    for (const s of chart.data) {
      // nächsten Punkt suchen (binär)
      let lo = 0, hi = s.data.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s.data[mid].t.getTime() < tt) lo = mid; else hi = mid;
      }
      const p = Math.abs(s.data[lo].t.getTime() - tt) < Math.abs(s.data[hi].t.getTime() - tt) ? s.data[lo] : s.data[hi];
      anchorX = x(p.t.getTime());
      const color = cssVar(s.st.colorVar);
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', anchorX); dot.setAttribute('cy', y(p.v));
      dot.setAttribute('r', 5); dot.setAttribute('fill', color);
      dot.setAttribute('class', 'hover-dot');
      hoverG.appendChild(dot);
      rows.push({ name: `Pegel ${s.st.name}`, value: `${fmtCm.format(p.v)} cm`, color, t: p.t });
    }
    if (anchorX == null) return;

    const cross = document.createElementNS(svgNS, 'line');
    cross.setAttribute('x1', anchorX); cross.setAttribute('x2', anchorX);
    cross.setAttribute('y1', m.top); cross.setAttribute('y2', m.top + ph);
    cross.setAttribute('class', 'crosshair');
    hoverG.prepend(cross);

    // Wind-Panel: Crosshair verlängern + nächste Stundenmessung anzeigen
    if (chart.windGeom && windHoverG) {
      const wg = chart.windGeom;
      const wcross = document.createElementNS(svgNS, 'line');
      wcross.setAttribute('x1', anchorX); wcross.setAttribute('x2', anchorX);
      wcross.setAttribute('y1', wg.mm.top); wcross.setAttribute('y2', wg.H - wg.mm.bottom);
      wcross.setAttribute('class', 'crosshair');
      windHoverG.appendChild(wcross);

      let best = null;
      for (const r of wg.slice) {
        if (!best || Math.abs(r.t.getTime() - tt) < Math.abs(best.t.getTime() - tt)) best = r;
      }
      if (best && Math.abs(best.t.getTime() - tt) <= 90 * 60e3) {
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', x(best.t.getTime())); dot.setAttribute('cy', wg.y(best.k));
        dot.setAttribute('r', 4.5);
        dot.setAttribute('fill', cssVar(best.k >= 0 ? '--w-ost' : '--w-west'));
        dot.setAttribute('class', 'hover-dot');
        windHoverG.appendChild(dot);
        rows.push({
          name: 'Wind',
          value: `${fmtWind.format(best.ms)} m/s aus ${compassPoint(best.dir)}`,
          color: cssVar(best.k >= 0 ? '--w-ost' : '--w-west'),
        });
      }
    }

    // Tooltip füllen (textContent — Namen sind Fremddaten)
    tooltip.replaceChildren();
    const time = document.createElement('p');
    time.className = 'tt-time';
    time.textContent = `${fmtDayTime.format(rows[0].t)} Uhr`;
    tooltip.appendChild(time);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tt-row';
      const key = document.createElement('span');
      key.className = 'tt-key';
      key.style.background = r.color;
      const name = document.createElement('span');
      name.className = 'tt-name';
      name.textContent = r.name;
      const val = document.createElement('span');
      val.className = 'tt-val';
      val.textContent = r.value;
      row.append(key, name, val);
      tooltip.appendChild(row);
    }
    tooltip.hidden = false;

    const wrapRect = $('#chart-wrap').getBoundingClientRect();
    const ttW = tooltip.offsetWidth;
    const anchorPx = anchorX / scale;
    let left = anchorPx + 14;
    if (left + ttW > wrapRect.width - 8) left = anchorPx - ttW - 14;
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${(evt.clientY - wrapRect.top) - 20}px`;
  }

  function onLeave() {
    $('#hover-layer')?.replaceChildren();
    $('#wind-hover')?.replaceChildren();
    tooltip.hidden = true;
  }

  for (const [hitSel, svgSel] of [['#chart-hit', '#chart-svg'], ['#wind-hit', '#wind-svg']]) {
    const hit = $(hitSel);
    if (!hit) continue;
    const srcSvg = $(svgSel);
    hit.addEventListener('pointermove', (evt) => onMove(evt, srcSvg));
    hit.addEventListener('pointerleave', onLeave);
  }
}

/* ── TABELLE (stündliche Mittel) ────────────────────────────── */

function renderTable() {
  const table = $('#data-table');
  table.replaceChildren();

  const caption = document.createElement('caption');
  caption.className = 'visually-hidden';
  caption.textContent = 'Wasserstände als Tabelle, stündliche Mittelwerte in cm';
  table.appendChild(caption);

  const cols = STATIONS.filter((st) => state.series[st.id]);
  if (!cols.length) return;

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const th0 = document.createElement('th');
  th0.textContent = 'Zeit';
  th0.scope = 'col';
  hr.appendChild(th0);
  for (const st of cols) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = `${st.name} (cm)`;
    hr.appendChild(th);
  }
  const windByHour = new Map();
  if (state.windHistory) {
    for (const r of state.windHistory) windByHour.set(Math.round(r.t.getTime() / 3600e3), r);
    for (const label of ['Wind (m/s)', 'Richtung']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.appendChild(th);
    }
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  // Stundenraster über den gewählten Zeitraum
  const hourly = new Map(); // hourKey -> {stationId: [values]}
  for (const st of cols) {
    const sl = sliceRange(state.series[st.id], state.rangeDays) || [];
    for (const p of sl) {
      const key = Math.floor(p.t.getTime() / 3600e3);
      if (!hourly.has(key)) hourly.set(key, {});
      const rec = hourly.get(key);
      if (!rec[st.id]) rec[st.id] = { sum: 0, n: 0 };
      rec[st.id].sum += p.v; rec[st.id].n++;
    }
  }

  const tbody = document.createElement('tbody');
  const keys = [...hourly.keys()].sort((a, b) => b - a);
  for (const key of keys) {
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    td0.textContent = `${fmtDayTime.format(new Date(key * 3600e3))} Uhr`;
    tr.appendChild(td0);
    const rec = hourly.get(key);
    for (const st of cols) {
      const td = document.createElement('td');
      const v = rec[st.id];
      td.textContent = v ? fmtCm.format(v.sum / v.n) : '–';
      tr.appendChild(td);
    }
    if (state.windHistory) {
      const wr = windByHour.get(key);
      const tdMs = document.createElement('td');
      tdMs.textContent = wr ? fmtWind.format(wr.ms) : '–';
      const tdDir = document.createElement('td');
      tdDir.textContent = wr ? compassPoint(wr.dir) : '–';
      tr.append(tdMs, tdDir);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

/* ── LEGENDE ────────────────────────────────────────────────── */

function renderLegend() {
  const legend = $('#legend');
  legend.replaceChildren();
  for (const st of STATIONS) {
    const btn = document.createElement('button');
    btn.className = 'legend-item';
    btn.setAttribute('aria-pressed', String(state.visible[st.id]));
    btn.type = 'button';
    const key = document.createElement('span');
    key.className = 'legend-key';
    key.style.background = `var(${st.colorVar})`;
    btn.append(key, document.createTextNode(`Pegel ${st.name}`));
    btn.addEventListener('click', () => {
      // mindestens eine Serie bleibt sichtbar
      const otherVisible = STATIONS.some((o) => o.id !== st.id && state.visible[o.id]);
      if (state.visible[st.id] && !otherVisible) return;
      state.visible[st.id] = !state.visible[st.id];
      btn.setAttribute('aria-pressed', String(state.visible[st.id]));
      renderChart();
    });
    legend.appendChild(btn);
  }
}

/* ── KARTE (Leaflet + OSM) ──────────────────────────────────── */

let map, mapMarkers = {};

function renderMap() {
  map = L.map('map', { scrollWheelZoom: false });
  map.fitBounds([[54.49, 9.53], [54.70, 10.05]], { padding: [18, 18] });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  }).addTo(map);

  for (const st of STATIONS) {
    const color = cssVar(st.colorVar) || '#1d6fb0';
    const marker = L.circleMarker([st.lat, st.lon], {
      radius: 9, color: '#ffffff', weight: 2.5, fillColor: color, fillOpacity: 1,
    }).addTo(map);
    marker.bindPopup(() => {
      const cur = state.current[st.id];
      const div = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'map-popup-name';
      name.textContent = `Pegel ${st.name}`;
      const val = document.createElement('p');
      val.className = 'map-popup-val';
      val.textContent = cur
        ? `${fmtCm.format(cur.value)} cm · ${fmtDayTime.format(cur.timestamp)} Uhr`
        : 'Messwert wird geladen …';
      div.append(name, val);
      return div;
    });
    mapMarkers[st.id] = marker;
  }

  // Schleimünde: grauer Marker, solange außer Betrieb
  const sm = L.circleMarker([SCHLEIMUENDE.lat, SCHLEIMUENDE.lon], {
    radius: 8, color: '#ffffff', weight: 2, fillColor: '#8a979c', fillOpacity: 0.85,
  }).addTo(map);
  sm.bindPopup(() => {
    const div = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'map-popup-name';
    name.textContent = `Pegel ${SCHLEIMUENDE.name} SP`;
    const val = document.createElement('p');
    val.className = 'map-popup-val';
    val.textContent = state.schleimuende
      ? `${fmtCm.format(state.schleimuende.value)} cm · ${fmtDayTime.format(state.schleimuende.timestamp)} Uhr`
      : 'außer Betrieb — keine Messdaten';
    div.append(name, val);
    return div;
  });
  mapMarkers[SCHLEIMUENDE.id] = sm;
}

function updateSchleimuendeMarker() {
  const marker = mapMarkers[SCHLEIMUENDE.id];
  if (!marker) return;
  marker.setStyle(state.schleimuende
    ? { fillColor: cssVar('--s-kappeln'), fillOpacity: 1 }
    : { fillColor: '#8a979c', fillOpacity: 0.85 });
}

/* ── WIKIPEDIA ──────────────────────────────────────────────── */

const WIKI_FALLBACK = {
  description: 'Meeresarm der Ostsee',
  extract: 'Die Schlei ist ein schmaler Meeresarm der Ostsee in Schleswig-Holstein, der die beiden schleswigschen Landschaften Angeln und Schwansen trennt. Als Teil der dänisch-schleswig-holsteinischen Fördenküste wird sie als eine langgestreckt ins Land ragende Bucht oftmals als Förde angesprochen, auch wenn ihre amtliche Klassifikation aufgrund ihrer gewässerökologischen Eigenschaften die eines Boddengewässers ist.',
};

async function loadWikipedia() {
  let data = WIKI_FALLBACK;
  try {
    data = await fetchJson('https://de.wikipedia.org/api/rest_v1/page/summary/Schlei');
  } catch (e) {
    console.warn('Wikipedia nicht erreichbar, nutze eingebauten Text.', e);
  }
  $('#wiki-desc').textContent = data.description || '';
  $('#wiki-extract').textContent = data.extract || WIKI_FALLBACK.extract;
}

/* ── STEUERUNG ──────────────────────────────────────────────── */

function setStatus(msg, isError = false) {
  const el = $('#hero-updated');
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
}

function bindControls() {
  $('#range-group').addEventListener('click', (evt) => {
    const btn = evt.target.closest('.range-btn');
    if (!btn) return;
    const days = Number(btn.dataset.range);
    state.rangeDays = days;
    for (const b of document.querySelectorAll('.range-btn')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
    updateLoadingOverlay();
    renderChart();
  });

  $('#table-toggle').addEventListener('click', () => {
    state.tableView = !state.tableView;
    $('#table-toggle').setAttribute('aria-pressed', String(state.tableView));
    $('#table-wrap').hidden = !state.tableView;
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 150);
  });

  // Farbschema-Wechsel: Chart + Karte neu einfärben
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    renderChart();
    renderTiles();
    for (const st of STATIONS) {
      mapMarkers[st.id]?.setStyle({ fillColor: cssVar(st.colorVar) });
    }
  });
}

/* ── DATENFLUSS ─────────────────────────────────────────────── */

/* Schleimünde anfragen — 404 ist der Normalfall, solange sie außer Betrieb ist */
async function probeSchleimuende() {
  try {
    const data = await fetchJson(`${API}/stations/${SCHLEIMUENDE.number}.json?includeTimeseries=true&includeCurrentMeasurement=true`);
    const ts = data.timeseries?.find((t) => t.shortname === 'W');
    if (ts?.currentMeasurement?.value != null) {
      state.schleimuende = {
        value: ts.currentMeasurement.value,
        timestamp: new Date(ts.currentMeasurement.timestamp),
      };
    }
  } catch {
    state.schleimuende = null;
  }
  const note = $('#third-gauge-note');
  if (note) {
    note.textContent = state.schleimuende
      ? `Der dritte Schlei-Pegel Schleimünde SP (Lotseninsel) sendet wieder: ${fmtCm.format(state.schleimuende.value)} cm.`
      : 'Der dritte Schlei-Pegel Schleimünde SP an der Lotseninsel ist derzeit außer Betrieb und liefert keine Messdaten.';
  }
}

async function loadCurrent() {
  const results = await Promise.allSettled(STATIONS.map(fetchStationDetails));
  let ok = false;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const st = STATIONS[i];
    const ts = r.value.timeseries?.find((t) => t.shortname === 'W');
    if (!ts?.currentMeasurement) return;
    ok = true;
    state.current[st.id] = {
      value: ts.currentMeasurement.value,
      timestamp: new Date(ts.currentMeasurement.timestamp),
      trend: ts.currentMeasurement.trend ?? estimateTrend(state.series[st.id]),
      state: ts.currentMeasurement.stateMnwMhw,
    };
    if (ts.gaugeZero?.value != null) st.gaugeZero = ts.gaugeZero.value;
    for (const cv of ts.characteristicValues || []) {
      const key = cv.shortname?.trim();
      if (key && ['MNW', 'MW', 'MHW'].includes(key)) st.charVals[key] = cv.value;
    }
  });
  if (ok) {
    const newest = Math.max(...Object.values(state.current).filter(Boolean).map((c) => c.timestamp.getTime()));
    setStatus(`Live · Stand ${fmtDayTime.format(new Date(newest))} Uhr`);
  } else {
    setStatus('PEGELONLINE derzeit nicht erreichbar', true);
  }
  await probeSchleimuende();
  renderTiles();
  renderFjordGauges();
  updateSchleimuendeMarker();
}

async function loadMeasurements(days) {
  // Nur für Erst-/Backfill-Ladungen: ersetzt die Reihe komplett.
  // Nie mit weniger Tagen aufrufen als bereits geladen sind — sonst
  // schrumpft die Historie (für Updates refreshMeasurements verwenden).
  if (days < state.seriesDays) return true;
  const results = await Promise.allSettled(STATIONS.map((st) => fetchMeasurements(st, days)));
  let any = false;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    state.series[STATIONS[i].id] = r.value;
    any = true;
  });
  if (any) state.seriesDays = Math.max(state.seriesDays, days);
  // PEGELONLINE liefert für diese Stationen kein trend-Feld —
  // sobald die Reihe da ist, aus den letzten 2 h schätzen.
  for (const st of STATIONS) {
    const cur = state.current[st.id];
    if (cur && (cur.trend == null || cur.trend === 0) && state.series[st.id]) {
      cur.trend = estimateTrend(state.series[st.id]);
    }
  }
  return any;
}

/* Auto-Refresh: letzte Stunde holen und an die bestehende Reihe ANHÄNGEN,
   damit die geladene Historie erhalten bleibt. */
async function refreshMeasurements() {
  const results = await Promise.allSettled(STATIONS.map((st) => fetchMeasurements(st, 1)));
  const maxAge = Date.now() - 31 * 24 * 3600e3;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const id = STATIONS[i].id;
    const old = state.series[id];
    if (!old) { state.series[id] = r.value; return; }
    const lastT = old[old.length - 1].t.getTime();
    const fresh = r.value.filter((p) => p.t.getTime() > lastT);
    state.series[id] = old.concat(fresh).filter((p) => p.t.getTime() >= maxAge);
  });
  for (const st of STATIONS) {
    const cur = state.current[st.id];
    if (cur && state.series[st.id]) cur.trend = estimateTrend(state.series[st.id]);
  }
}

/* Ladehinweis, solange der gewählte Zeitraum die geladene Historie übersteigt */
function updateLoadingOverlay() {
  const loading = $('#chart-loading');
  const pending = state.rangeDays > state.seriesDays;
  loading.hidden = !pending;
  if (pending) {
    loading.replaceChildren();
    const spin = document.createElement('span');
    spin.className = 'spinner';
    spin.setAttribute('aria-hidden', 'true');
    loading.append(spin, ` Lade ${state.rangeDays}-Tage-Historie …`);
  }
  $('#chart-wrap').classList.toggle('is-refetching', pending);
}

async function init() {
  // Deep-Link: ?range=1|3|7|14|31
  const rangeParam = Number(new URLSearchParams(location.search).get('range'));
  if ([1, 3, 7, 14, 31].includes(rangeParam)) {
    state.rangeDays = rangeParam;
    for (const b of document.querySelectorAll('.range-btn')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.range) === rangeParam));
    }
  }

  renderFjord();
  renderFjordGauges();
  renderTiles();
  renderLegend();
  renderMap();
  bindControls();
  loadWikipedia();

  // Stufe 1: aktuelle Werte + Wind + 2 Tage für schnellen ersten Chart
  const [, okShort] = await Promise.all([
    loadCurrent(),
    loadMeasurements(2),
    loadWind().then(() => { renderTiles(); setupWindAnimation(); }),
    loadWindHistory(),
  ]);
  for (const st of STATIONS) {
    const cur = state.current[st.id];
    if (cur && !cur.trend && state.series[st.id]) cur.trend = estimateTrend(state.series[st.id]);
  }
  if (okShort) {
    updateLoadingOverlay();
    renderChart();
    renderTiles(); // jetzt mit Sparklines und Tendenz
  } else {
    $('#chart-loading').textContent = 'Messdaten konnten nicht geladen werden. Bitte später erneut versuchen.';
  }

  // Stufe 2: volle Historie im Hintergrund — mit Wiederholung und Rückfallstufen,
  // falls der große Abruf (2× ~2,4 MB) scheitert
  (async () => {
    for (const days of [31, 31, 14, 7]) {
      if (await loadMeasurements(days)) break;
      console.warn(`Historie: P${days}D fehlgeschlagen, nächster Versuch …`);
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (state.seriesDays > 0) {
      updateLoadingOverlay();
      renderChart();
    }
  })();

  // Auto-Aktualisierung alle 5 Minuten (nur bei sichtbarem Tab):
  // neue Werte werden angehängt, die Historie bleibt erhalten
  setInterval(async () => {
    if (document.hidden) return;
    loadCurrent();
    const jobs = [refreshMeasurements(), loadWind()];
    // Windhistorie ist stündlich — nur nachladen, wenn sie veraltet ist
    const lastWind = state.windHistory?.[state.windHistory.length - 1]?.t.getTime() ?? 0;
    if (Date.now() - lastWind > 65 * 60e3) jobs.push(loadWindHistory());
    await Promise.all(jobs);
    renderChart();
    renderTiles();
    setupWindAnimation();
  }, 5 * 60e3);
}

document.addEventListener('DOMContentLoaded', init);

// Debug-/Test-Zugriff (bewusst öffentlich, enthält nur ohnehin öffentliche Messdaten)
window.__schlei = { state, chart, refreshMeasurements, get seriesDays() { return state.seriesDays; } };
