/* ═══════════════════════════════════════════════════════════════
   HERO3D — MapLibre-Szene „Revier 3D" + Seekarten-Ansicht.
   Läuft neben app.js, liest nichts aus state (Phase 1).
   Modi: 'lite' (SVG-Silhouette, Standard in Phase 1), '3d', 'chart'.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const BUILD = document.querySelector('script[src^="app.js"]')?.src.split('v=')[1] ?? 'dev';
  const FNC = { min: 7, max: 15 };                    // Spike: z7–15 liefern Inhalt
  const MAX_BOUNDS = [[9.35, 54.38], [10.35, 54.80]];

  const PRESETS = {
    schlei:   { center: [9.79, 54.585], zoom: 10.3, pitch: 55, bearing: 20 },
    innere:   { center: [9.60, 54.520], zoom: 12.0, pitch: 60, bearing: 30 },
    enge:     { center: [9.645, 54.541], zoom: 12.4, pitch: 60, bearing: 0 },   // Stexwig–Missunde
    kappeln:  { center: [9.955, 54.650], zoom: 12.5, pitch: 55, bearing: -20 },
    muendung: { center: [10.03, 54.670], zoom: 13.0, pitch: 55, bearing: -30 },
  };

  const STYLE_3D = {
    version: 8,
    glyphs: `${new URL('vendor/glyphs/', location.href).href}{fontstack}/{range}.pbf`,
    sources: {
      terrain: { type: 'raster-dem', tiles: [`terrain/{z}/{x}/{y}.png?v=${BUILD}`],
                 encoding: 'terrarium', tileSize: 256, minzoom: 9, maxzoom: 13,
                 bounds: [9.30, 54.33, 10.45, 54.95],
                 attribution: 'Relief: BSH (DL-DE-BY-2.0) · Terrain Tiles' },
      water: { type: 'geojson', data: `water.geojson?v=${BUILD}` },
      land: { type: 'geojson', data: `land.geojson?v=${BUILD}` },
      beaches: { type: 'geojson', data: `beaches.json?v=${BUILD}` },
      seamarks: { type: 'geojson', data: `seamarks.json?v=${BUILD}`,
                  attribution: 'Seezeichen: © OSM — nicht zur Navigation' },
      depths: { type: 'geojson', data: `depths.json?v=${BUILD}` },
    },
    sky: {
      'sky-color': '#0a1620',
      'horizon-color': '#14293a',
      'fog-color': '#0d1b22',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.9,
      'fog-ground-blend': 0.45,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 9, 1, 12, 0.6, 14, 0],
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0d1b22' } },
      // Seegrund nach Tiefe (hell = flach, satt = tief), Land in ruhigen
      // Blaugrautoenen, die mit der Hoehe leicht aufhellen — feine Rampe
      // gegen Banding
      { id: 'relief-farbe', type: 'color-relief', source: 'terrain',
        paint: { 'color-relief-color': [
          'interpolate', ['linear'], ['elevation'],
          -16, '#123f6e',
          -10, '#17517f',
          -6, '#1d6293',
          -3.5, '#2274a8',
          -2, '#2b87bd',
          -1, '#379dd2',
          -0.4, '#45b1e2',
          0.3, '#2c4f61',
          1.2, '#15222a',
          6, '#1a2c34',
          14, '#20363f',
          28, '#27424c',
          45, '#2e4e59',
        ] } },
      // Land als Vektorflaeche: die Uferlinie ist damit bei jedem Zoom exakt
      // (das Tiefenraster verschluckt schmale Landformen wie den Arnis-Damm)
      { id: 'land', type: 'fill', source: 'land',
        paint: { 'fill-color': '#1a2b34' } },
      { id: 'relief', type: 'hillshade', source: 'terrain',
        paint: { 'hillshade-shadow-color': '#03090e', 'hillshade-highlight-color': '#4f83a2',
                 'hillshade-accent-color': '#0f2029', 'hillshade-exaggeration': 0.55 } },
      { id: 'wasser', type: 'fill', source: 'water',
        paint: { 'fill-color': '#2478ad', 'fill-opacity': 0.12 } },
      // Uferlinie: leicht sattes Gruen, feiner Kern ueber weichem Saum
      { id: 'ufer-glow', type: 'line', source: 'water',
        paint: { 'line-color': '#3f9e6b', 'line-opacity': 0.35, 'line-blur': 3,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6] } },
      { id: 'ufer', type: 'line', source: 'water',
        paint: { 'line-color': '#5cbd85', 'line-opacity': 0.95,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 14, 2] } },
      // Badestellen: Strandabschnitte gelb
      { id: 'beach', type: 'line', source: 'beaches',
        paint: { 'line-color': '#e8c96a', 'line-opacity': 0.95,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 5] } },
      // Seekartendaten nur in Revier 3D — die Seekarten-Ansicht hat sie nativ
      { id: 'depth-label', type: 'symbol', source: 'depths', minzoom: 12,
        layout: { 'text-field': ['get', 'label'], 'text-font': ['noto'], 'text-size': 11 },
        paint: { 'text-color': '#9fd3ee', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.2,
                 'text-opacity': 0.85 } },
      // Seezeichen mit Seekarten-Symbolik (Sprites via styleimagemissing)
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

  const STYLE_CHART = {
    version: 8,
    sources: {
      fnc: { type: 'raster', tiles: ['https://freenauticalchart.net/fnc-de/{z}/{x}/{y}.png'],
             tileSize: 256, minzoom: FNC.min, maxzoom: FNC.max,
             attribution: '© FreeNauticalChart (BSH-Daten) — nicht zur Navigation' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#dfe9ee' } },
      { id: 'seekarte', type: 'raster', source: 'fnc' },
    ],
  };

  /* ── SEEKARTEN-SYMBOLE (IALA) — als Sprites gezeichnet ──
     Tonnenkörper + Toppzeichen wie auf der Seekarte: ■-Stumpftonne,
     ▲-Spitztonne, Kardinaltonnen mit Doppelkegeln, Baken als Stange,
     Leuchtfeuer mit Magenta-Flare. Anker unten = Standort. */

  const SM = {
    ink: '#0d1b22', halo: 'rgba(242,247,248,.95)',
    red: '#e0473f', green: '#17b06b', yellow: '#ffcf4d', black: '#20272c', magenta: '#e353c0',
  };

  function smIcon(id) {
    const c = document.createElement('canvas');
    c.width = 44; c.height = 60;
    const x = c.getContext('2d');
    x.scale(2, 2);
    x.lineJoin = 'round'; x.lineCap = 'round';

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
      case 'sm-buoy-port':                       // rote Stumpftonne (Zylinder)
        waterline(); draw(() => x.rect(6.5, 16, 9, 12.5), SM.red); break;
      case 'sm-buoy-stb':                        // grüne Spitztonne (Kegel)
        waterline(); draw(() => {
          x.moveTo(11, 13.5); x.lineTo(5.5, 28.5); x.lineTo(16.5, 28.5); x.closePath();
        }, SM.green); break;
      case 'sm-buoy-special':                    // gelb, ✕-Toppzeichen
        waterline(); draw(() => x.rect(7.5, 18, 7, 10.5), SM.yellow); xmark(11, 13, SM.yellow); break;
      case 'sm-danger':                          // Einzelgefahr: ●● auf Spiere
        staff(); draw(() => x.arc(11, 15.5, 2.2, 0, 7), SM.black);
        draw(() => x.arc(11, 9.5, 2.2, 0, 7), SM.red); break;
      case 'sm-card-n': pillar([SM.black, SM.yellow]); cone(11, 9, true, SM.black); cone(11, 2.5, true, SM.black); break;
      case 'sm-card-s': pillar([SM.yellow, SM.black]); cone(11, 9, false, SM.black); cone(11, 2.5, false, SM.black); break;
      case 'sm-card-e': pillar([SM.black, SM.yellow, SM.black]); cone(11, 2.5, true, SM.black); cone(11, 9, false, SM.black); break;
      case 'sm-card-w': pillar([SM.yellow, SM.black, SM.yellow]); cone(11, 2.5, false, SM.black); cone(11, 9, true, SM.black); break;
      case 'sm-bcn-port': staff(); draw(() => x.rect(7.8, 6.5, 6.4, 6.4), SM.red); break;
      case 'sm-bcn-stb': staff(); cone(11, 9.5, true, SM.green); break;
      case 'sm-bcn-special': staff(); xmark(11, 9.5, SM.yellow); break;
      case 'sm-light':                           // Feuer: Stern + Magenta-Flare
        waterline(); draw(() => {
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

  function bindSeamarkIcons(m) {
    m.on('styleimagemissing', (e) => {
      if (!e.id.startsWith('sm-') || m.hasImage(e.id)) return;
      const img = smIcon(e.id);
      if (img) m.addImage(e.id, img, { pixelRatio: 2 });
    });
  }

  /* Erläuterung je Zeichentyp — was bedeutet das Zeichen für den Segler? */
  const SM_INFO = {
    'sm-buoy-port':    ['Stumpftonne · Backbord', 'Fahrwasserbegrenzung: von See kommend an Backbord (links) liegen lassen.'],
    'sm-buoy-stb':     ['Spitztonne · Steuerbord', 'Fahrwasserbegrenzung: von See kommend an Steuerbord (rechts) liegen lassen.'],
    'sm-card-n':       ['Kardinaltonne Nord', 'Gefahr liegt südlich der Tonne — nördlich passieren.'],
    'sm-card-s':       ['Kardinaltonne Süd', 'Gefahr liegt nördlich der Tonne — südlich passieren.'],
    'sm-card-e':       ['Kardinaltonne Ost', 'Gefahr liegt westlich der Tonne — östlich passieren.'],
    'sm-card-w':       ['Kardinaltonne West', 'Gefahr liegt östlich der Tonne — westlich passieren.'],
    'sm-buoy-special': ['Sondertonne', 'Gelbes Zeichen: Sperr- oder Warngebiet, Messstrecke, Regattabahn o. Ä.'],
    'sm-danger':       ['Einzelgefahrenzeichen', 'Markiert eine einzelne Gefahrenstelle — mit Abstand ringsum passierbar.'],
    'sm-bcn-port':     ['Bake · Backbord', 'Festes Seezeichen: Fahrwasserbegrenzung, an Backbord liegen lassen.'],
    'sm-bcn-stb':      ['Bake · Steuerbord', 'Festes Seezeichen: Fahrwasserbegrenzung, an Steuerbord liegen lassen.'],
    'sm-bcn-special':  ['Bake · Sonderzeichen', 'Festes Zeichen an Land oder im Flachwasser, z. B. Richtbake oder Gebietsgrenze.'],
    'sm-light':        ['Leuchtfeuer', 'Befeuertes Seezeichen — Molen-, Orientierungs- oder Richtfeuer.'],
  };

  function bindSeamarkClicks(m) {
    m.on('click', 'seamark-dot', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const [title, desc] = SM_INFO[f.properties.icon] ?? ['Seezeichen', ''];
      const box = document.createElement('div');
      const head = document.createElement('strong');
      head.textContent = f.properties.name ? `${f.properties.name} — ${title}` : title;
      const body = document.createElement('p');
      body.textContent = desc;
      const src = document.createElement('small');
      src.textContent = 'Quelle: OSM — nicht zur Navigation';
      box.append(head, body, src);
      new maplibregl.Popup({ offset: 14, closeButton: false, maxWidth: '260px' })
        .setLngLat(f.geometry.coordinates)
        .setDOMContent(box)
        .addTo(m);
    });
    m.on('mouseenter', 'seamark-dot', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'seamark-dot', () => { m.getCanvas().style.cursor = ''; });
  }

  let map = null;
  let mode = 'lite';

  const MODES = ['lite', '3d', 'chart'];
  const NAMES = { lite: 'Klassisch', '3d': 'Revier 3D', chart: 'Seekarte' };

  // Der Knopf zeigt jeweils die NÄCHSTE Ansicht im Zyklus
  function syncModeBtn() {
    const btn = document.querySelector('#hero3d-mode');
    if (btn) btn.textContent = `Ansicht: ${NAMES[MODES[(MODES.indexOf(mode) + 1) % MODES.length]]}`;
  }

  function supported() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  function setDom(newMode) {
    mode = newMode;
    document.documentElement.dataset.heroMode = newMode;   // CSS blendet Silhouette/Canvas um
    try { localStorage.setItem('hero-view', newMode); } catch { /* Privat-Modus */ }
    const cap = document.querySelector('#hero3d-caption');
    if (cap) cap.hidden = newMode !== 'chart';
    syncModeBtn();
    HERO3D._pending = null;
  }

  function ensureMap() {
    if (map) return map;
    map = new maplibregl.Map({
      container: 'hero3d',
      style: STYLE_3D,
      ...PRESETS.schlei,
      maxBounds: MAX_BOUNDS, minZoom: 9, maxZoom: 15.5,
      cooperativeGestures: true, attributionControl: { compact: true },
      antialias: true,
      dragRotate: true, pitchWithRotate: true, touchPitch: true,
    });
    // Sichtbare Kamera-Bedienung: Kompass kippt/dreht (Rechtsklick-Ziehen
    // bzw. Zwei-Finger geht zusätzlich)
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
    map.on('error', (e) => console.warn('hero3d:', e.error?.message ?? e));
    bindSeamarkIcons(map);
    bindSeamarkClicks(map);
    HERO3D._map = map;                     // für Tests/Debugging
    // Bei Kartendrehung bleiben die Windzahlen aufrecht (Pfeile sind kartenfest)
    map.on('rotate', () => {
      if (mode !== 'lite' && typeof state !== 'undefined') renderWind();
    });
    return map;
  }

  /* ── WINDPARTIKEL (Phase 3): Canvas-Overlay über der Karte ──
     Partikel leben im Schirmraum; ihr Ortswind kommt per IDW über die
     Revierpunkte (wie windTick in app.js), die Schirm-Richtung über
     project/unproject — damit stimmt die Strömung auch bei Pitch,
     Drehung und auf der Seekarte. */

  const wind = { canvas: null, ctx: null, parts: [], raf: 0,
                 field: null, fieldIdx: -1, fieldSrc: null, last: 0 };

  function windField() {
    if (typeof state === 'undefined') return null;
    const rw = state.revierWind;
    if (!rw) return null;
    const idx = Math.min(state.revierIdx ?? 0, rw.times.length - 1);
    if (wind.field && wind.fieldIdx === idx && wind.fieldSrc === rw) return wind.field;
    const pts = [];
    for (const p of rw.points) {
      const h = p.hours[idx];
      if (!h || h.ms == null || h.dir == null) continue;
      const b = (((h.dir + 180) % 360) * Math.PI) / 180;
      pts.push({ lon: p.lon, lat: p.lat, ve: Math.sin(b) * h.ms, vn: Math.cos(b) * h.ms });
    }
    if (!pts.length) return null;
    pts.meanMs = pts.reduce((s, f) => s + Math.hypot(f.ve, f.vn), 0) / pts.length;
    wind.field = pts; wind.fieldIdx = idx; wind.fieldSrc = rw;
    return pts;
  }

  function windParticle3(W, H) {
    return { x: Math.random() * W, y: Math.random() * H,
             life: Math.random(), dur: 2.2 + Math.random() * 2.5,
             jitter: 0.6 + Math.random() * 0.8 };
  }

  function ensureWindCanvas() {
    if (wind.canvas) return;
    const c = document.createElement('canvas');
    c.className = 'h3-windcanvas';
    c.setAttribute('aria-hidden', 'true');
    // über dem GL-Canvas, unter den Markern
    map.getCanvasContainer().insertBefore(c, map.getCanvas().nextSibling);
    wind.canvas = c;
    wind.ctx = c.getContext('2d');
    const resize = () => {
      const gl = map.getCanvas();
      c.width = gl.width; c.height = gl.height;
    };
    resize();
    map.on('resize', resize);
    wind.last = performance.now();
    wind.raf = requestAnimationFrame(windTick3);
  }

  function windTick3(now) {
    wind.raf = requestAnimationFrame(windTick3);
    const dt = Math.min(0.1, (now - wind.last) / 1000);
    wind.last = now;
    const c = wind.canvas, ctx = wind.ctx;
    if (!c || mode === 'lite' || document.hidden) { ctx?.clearRect(0, 0, c.width, c.height); return; }
    const field = windField();
    if (!field) { ctx.clearRect(0, 0, c.width, c.height); return; }

    const W = c.width, H = c.height;
    const dpr = W / map.getCanvas().clientWidth || 1;
    const n = Math.max(10, Math.min(110, Math.round(8 + field.meanMs * 9)));
    while (wind.parts.length < n) wind.parts.push(windParticle3(W, H));
    if (wind.parts.length > n) wind.parts.length = n;

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.4 * dpr;
    ctx.lineCap = 'round';
    const margin = 80 * dpr;
    for (const q of wind.parts) {
      q.life += dt / q.dur;
      if (q.life >= 1) Object.assign(q, windParticle3(W, H), { life: 0 });

      const ll = map.unproject([q.x / dpr, q.y / dpr]);
      // IDW in km-Metrik (ε ≈ 1,5 km glättet die Spitzen)
      const cosl = Math.cos((ll.lat * Math.PI) / 180);
      let sw = 0, ae = 0, an = 0;
      for (const f of field) {
        const dx = (ll.lng - f.lon) * 111.32 * cosl;
        const dy = (ll.lat - f.lat) * 110.54;
        const w = 1 / (dx * dx + dy * dy + 2.25);
        sw += w; ae += f.ve * w; an += f.vn * w;
      }
      ae /= sw; an /= sw;
      const ms = Math.hypot(ae, an);
      if (ms < 0.05) continue;

      // Schirm-Richtung des Windes am Ort des Partikels
      const p1 = map.project([ll.lng, ll.lat]);
      const p2 = map.project([ll.lng + (ae * 1e-5) / cosl, ll.lat + an * 1e-5]);
      let dxp = p2.x - p1.x, dyp = p2.y - p1.y;
      const norm = Math.hypot(dxp, dyp);
      if (norm < 1e-6) continue;
      dxp /= norm; dyp /= norm;

      const spd = (22 + ms * 16) * dpr * q.jitter;
      const len = (12 + ms * 4) * dpr * q.jitter;
      q.x += dxp * spd * dt;
      q.y += dyp * spd * dt;
      if (q.x < -margin) q.x += W + 2 * margin;
      if (q.x > W + margin) q.x -= W + 2 * margin;
      if (q.y < -margin) q.y += H + 2 * margin;
      if (q.y > H + margin) q.y -= H + 2 * margin;
      const a = Math.sin(q.life * Math.PI) * Math.min(0.5, 0.2 + ms * 0.04);
      ctx.strokeStyle = `rgba(159, 211, 238, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - dxp * len, q.y - dyp * len);
      ctx.stroke();
    }
  }

  /* ── HIMMELSKÖRPER: Sonne (nachts Mond) am Kartenrand in echter
     Azimut-Richtung — der 3D-Ersatz für den Sonnenbogen der
     Silhouette. Dreht mit der Kamera mit (rotate-Event). ── */

  let himmelEl = null;

  function ensureHimmel() {
    if (himmelEl || !map) return;
    himmelEl = document.createElement('div');
    himmelEl.className = 'h3-himmel';
    himmelEl.setAttribute('aria-hidden', 'true');
    himmelEl.innerHTML = `
      <svg viewBox="0 0 44 44" class="h3-himmel-sonne" aria-hidden="true">
        <circle cx="22" cy="22" r="16" fill="#ffd97a" opacity=".16"/>
        <circle cx="22" cy="22" r="12" fill="#ffd97a" opacity=".22"/>
        <circle cx="22" cy="22" r="8" fill="#ffe49d"/>
      </svg>
      <svg viewBox="0 0 44 44" class="h3-himmel-mond" aria-hidden="true">
        <circle cx="22" cy="22" r="14" fill="#e6edf2" opacity=".1"/>
        <path d="M27 10a13 13 0 1 0 7.5 20A11 11 0 0 1 27 10z"
              fill="#e6edf2" stroke="#b9c9d4" stroke-width="1"/>
      </svg>
      <small></small>`;
    map.getContainer().appendChild(himmelEl);
    map.on('rotate', renderHimmel);
    map.on('resize', renderHimmel);
  }

  function renderHimmel() {
    if (!map || typeof sunPosition !== 'function') return;
    ensureHimmel();
    const jetzt = new Date();
    const sonne = sunPosition(jetzt);
    let k = null;
    if (sonne.el > -0.833) k = { az: sonne.az, el: sonne.el, typ: 'sonne', name: 'Sonne' };
    else if (typeof moonPosition === 'function') {
      const mond = moonPosition(jetzt);
      if (mond.el > 0) k = { az: mond.az, el: mond.el, typ: 'mond', name: 'Mond' };
    }
    const r = map.getContainer().getBoundingClientRect();
    if (!k || r.width < 60) { himmelEl.style.display = 'none'; return; }
    himmelEl.style.display = '';
    himmelEl.dataset.typ = k.typ;
    // Schirmrichtung = Azimut minus Kartendrehung; bis an den Rand schieben
    const th = ((k.az - map.getBearing()) * Math.PI) / 180;
    const vx = Math.sin(th), vy = -Math.cos(th);
    const cx = r.width / 2, cy = r.height / 2;
    const dx = Math.abs(vx) > 1e-6 ? (cx - 46) / Math.abs(vx) : Infinity;
    const dy = Math.abs(vy) > 1e-6 ? (cy - 54) / Math.abs(vy) : Infinity;
    const d = Math.min(dx, dy);
    himmelEl.style.left = `${(cx + vx * d).toFixed(1)}px`;
    himmelEl.style.top = `${(cy + vy * d).toFixed(1)}px`;
    himmelEl.querySelector('small').textContent =
      `${k.name} ${compassPoint(k.az)} · ${Math.round(k.el)}°`;
  }

  /* ── DATENLAYER (Phase 2): DOM-Marker, überleben setStyle ── */

  const markers = new Map();   // key → maplibregl.Marker

  function upsertMarker(key, lngLat, el, opts = {}) {
    let mk = markers.get(key);
    if (!mk) {
      mk = new maplibregl.Marker({ element: el, ...opts }).setLngLat(lngLat).addTo(map);
      markers.set(key, mk);
    } else {
      mk.setLngLat(lngLat);
      if (opts.rotation != null) mk.setRotation(opts.rotation);
    }
    return mk;
  }

  function dropMarker(key) {
    markers.get(key)?.remove();
    markers.delete(key);
  }

  function renderPegel() {
    if (typeof STATIONS === 'undefined') return;
    for (const st of STATIONS) {
      const cur = state.current?.[st.id];
      const key = `pegel:${st.id}`;
      if (!cur) { dropMarker(key); continue; }
      const cls = classify(cur.value, st.charVals);
      const tr = trendInfo(cur.trend ?? 0);
      const span = st.charVals.MHW - st.charVals.MNW;
      const p = Math.max(0, Math.min(1, (cur.value - st.charVals.MNW) / span));
      let el = markers.get(key)?.getElement();
      if (!el) {
        el = document.createElement('div');
        el.className = 'h3-marker h3-pegel';
        el.innerHTML = '<span class="h3-latte"><i></i></span><span class="h3-body"><b></b><small></small></span>';
      }
      el.querySelector('b').textContent = `${fmtCm.format(cur.value)} cm ${tr.arrow}`;
      el.querySelector('small').textContent = `Pegel ${st.name} · ${cls.label}`;
      const bar = el.querySelector('.h3-latte i');
      bar.style.height = `${Math.round(p * 100)}%`;
      bar.style.background = cls.color;
      el.title = `Pegel ${st.name}: ${fmtCm.format(cur.value)} cm (${cls.label}, ${tr.txt})`;
      upsertMarker(key, [st.lon, st.lat], el, { anchor: 'bottom' });
    }
  }

  const VANE_COLORS = { w1: '#8fc3e0', w2: '#d8ebf4', w3: '#ffd97a', w4: '#ff8f5e' };

  function renderWind() {
    const rw = state.revierWind;
    if (!rw) { for (const k of [...markers.keys()]) if (k.startsWith('wind:')) dropMarker(k); return; }
    const idx = Math.min(state.revierIdx ?? 0, rw.times.length - 1);
    for (const p of rw.points) {
      const h = p.hours[idx];
      const key = `wind:${p.name}`;
      if (!h || h.ms == null || h.dir == null) { dropMarker(key); continue; }
      const color = VANE_COLORS[bftClass(h.ms)];
      let el = markers.get(key)?.getElement();
      if (!el) {
        el = document.createElement('div');
        el.className = 'h3-wind';
        el.innerHTML = `<svg viewBox="-10 -22 20 44" width="26" height="56" aria-hidden="true">
            <line class="h3-vane-shaft" x1="0" y1="-18" x2="0" y2="12"/>
            <path class="h3-vane-head" d="M-6,8 L0,20 L6,8 Z"/>
          </svg><b></b>`;
      }
      const val = el.querySelector('b');
      val.textContent = fmtWind.format(h.ms);
      val.style.color = color;
      // Zahl bleibt aufrecht: Pfeil rotiert um dir (kartenfest), also gegenrotieren
      val.style.transform = `rotate(${map.getBearing() - h.dir}deg)`;
      el.querySelector('.h3-vane-shaft').style.stroke = color;
      el.querySelector('.h3-vane-head').style.fill = color;
      const bft = beaufort(h.ms);
      el.title = `${p.name}: ${fmtWind.format(h.ms)} m/s (${bft} Bft, ${BFT_NAMES[bft]}) aus ${compassPoint(h.dir)}, Böen ${fmtWind.format(h.gust ?? 0)} m/s${h.temp != null ? `, ${fmtTemp.format(h.temp)} °C` : ''} — ICON-D2`;
      upsertMarker(key, [p.lon, p.lat], el,
        { rotationAlignment: 'map', pitchAlignment: 'viewport', rotation: h.dir });
    }
  }

  function renderExtra() {
    // Ostsee vor Schleimünde
    const mr = state.marine;
    if (mr) {
      const key = 'marine:ostsee';
      let el = markers.get(key)?.getElement();
      if (!el) {
        el = document.createElement('div');
        el.className = 'h3-marker h3-marine';
        el.innerHTML = '<span class="h3-body"><b></b><small>Ostsee · Welle · Wasser</small></span>';
      }
      el.querySelector('b').textContent = `${fmtWind.format(mr.wave ?? 0)} m · ${fmtCm.format(mr.sst)} °C`;
      el.title = `Ostsee vor Schleimünde: Wellenhöhe ${fmtWind.format(mr.wave ?? 0)} m, Wassertemperatur ${fmtCm.format(mr.sst)} °C`;
      upsertMarker(key, [10.075, 54.685], el, { anchor: 'left' });
    } else dropMarker('marine:ostsee');

    // Amtliche Warnung als Szene-Marker (Banner oben existiert weiter)
    if (state.alerts?.length) {
      const key = 'alert:0';
      let el = markers.get(key)?.getElement();
      if (!el) {
        el = document.createElement('div');
        el.className = 'h3-marker h3-alert';
        el.innerHTML = '<span class="h3-body"><b>⚠︎ Warnung</b><small></small></span>';
      }
      el.querySelector('small').textContent = state.alerts[0].event ?? 'amtliche Warnung';
      upsertMarker(key, [9.79, 54.60], el, { anchor: 'bottom' });
    } else dropMarker('alert:0');

    // Badestellen als klickbare Ampel-Punkte mit Popup
    for (const s of state.badewasser?.spots ?? []) {
      const key = `bw:${s.name}`;
      if (markers.has(key)) continue;                      // statisch je Seitenladen
      const ok = (s.ecoli == null || s.ecoli <= 500) && (s.entero == null || s.entero <= 200);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'h3-bw';
      el.style.background = ok ? '#0ca30c' : '#fab219';
      el.setAttribute('aria-label', `Badestelle ${s.name}`);
      const detail = s.datum
        ? `Probe ${new Date(s.datum).toLocaleDateString('de-DE')}: E. coli ${s.ecoli ?? '–'}, Enterokokken ${s.entero ?? '–'} · ${ok ? 'unauffällig' : 'erhöht'}`
        : 'keine aktuelle Probe';
      upsertMarker(key, [s.lon, s.lat], el)
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false })
          .setText(`${s.name} — ${detail}`));
    }
  }

  const HERO3D = {
    ready: false,

    renderData() {
      // DOM-Marker brauchen keine fertig geladenen Kacheln — kein loaded()-
      // Guard, sonst verpuffen die Daten-Hooks während der Ladephase und
      // der nächste kommt erst mit dem 5-Minuten-Intervall
      if (!map || mode === 'lite' || typeof state === 'undefined') return;
      renderPegel();
      renderWind();
      renderExtra();
    },

    renderLight() {
      if (!map || typeof sunPosition !== 'function') return;
      try { if (!map.getLayer('relief')) return; } catch { return; }
      const sun = sunPosition(new Date());
      const up = sun.el > -3;
      map.setPaintProperty('relief', 'hillshade-illumination-direction',
        up ? ((sun.az % 360) + 360) % 360 : 315);
      map.setPaintProperty('relief', 'hillshade-highlight-color', up ? '#4f83a2' : '#33596d');
      map.setPaintProperty('bg', 'background-color', up ? '#0d1b22' : '#0a141b');
      renderHimmel();
    },

    init() {
      if (!supported() || typeof maplibregl === 'undefined') { setDom('lite'); return; }
      let saved = null;
      try { saved = localStorage.getItem('hero-view'); } catch { /* egal */ }
      this.setMode(saved ?? '3d');                 // Standard: Revier 3D
      HERO3D.ready = true;
      document.querySelector('#hero3d-controls')?.removeAttribute('hidden');

      // Bedienelemente: Ansicht-Zyklus und Blickpunkte
      document.querySelector('#hero3d-mode')?.addEventListener('click', () =>
        this.setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]));
      syncModeBtn();
      document.querySelectorAll('.hero3d-presets [data-preset]').forEach((b) =>
        b.addEventListener('click', () => this.setPreset(b.dataset.preset)));
    },

    getMode() { return mode; },

    setMode(newMode) {
      if (!['lite', '3d', 'chart'].includes(newMode) || newMode === mode) return;
      if (this._pending === newMode) return;
      if (newMode === 'lite') { setDom('lite'); return; }
      this._pending = newMode;
      const m = ensureMap();
      const want3d = newMode === '3d';
      const isChartStyle = !!m.getStyle()?.layers?.some((l) => l.id === 'seekarte');
      if (want3d === isChartStyle) {
        m.setStyle(want3d ? STYLE_3D : STYLE_CHART);
      }
      m.easeTo(want3d
        ? { pitch: PRESETS.schlei.pitch, bearing: PRESETS.schlei.bearing, duration: 600 }
        : { pitch: 0, bearing: 0, duration: 600 });
      m.once('idle', () => m.resize());
      // Silhouette steht, bis die Szene wirklich da ist — dann Daten rendern
      // 'idle' statt 'load': load feuert nur beim allerersten Stilaufbau —
      // nach setStyle-Wechseln bliebe der Modus sonst für immer hängen
      const activate = () => { setDom(newMode); this.renderData(); this.renderLight(); ensureWindCanvas(); };
      if (m.loaded()) activate();
      else m.once('idle', activate);
    },

    setPreset(name) {
      const p = PRESETS[name];
      if (!p || !map || mode === 'lite') return;
      map.flyTo({ ...p, ...(mode === 'chart' ? { pitch: 0, bearing: 0 } : {}), duration: 1800 });
    },
  };

  window.HERO3D = HERO3D;
  document.addEventListener('DOMContentLoaded', () => HERO3D.init());
})();
