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
    enge:     { center: [9.665, 54.532], zoom: 13.0, pitch: 60, bearing: 0 },
    kappeln:  { center: [9.955, 54.650], zoom: 12.5, pitch: 55, bearing: -20 },
    muendung: { center: [10.03, 54.670], zoom: 13.0, pitch: 55, bearing: -30 },
  };

  const STYLE_3D = {
    version: 8,
    sources: {
      terrain: { type: 'raster-dem', tiles: [`terrain/{z}/{x}/{y}.png?v=${BUILD}`],
                 encoding: 'terrarium', tileSize: 256, minzoom: 9, maxzoom: 13,
                 bounds: [9.40, 54.40, 10.20, 54.78],
                 attribution: 'Relief: BSH (DL-DE-BY-2.0) · Terrain Tiles' },
      water: { type: 'geojson', data: `water.geojson?v=${BUILD}` },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0d1b22' } },
      // Seegrund nach Tiefe eingefärbt (hell = flach), Land in dunklen Tönen
      { id: 'relief-farbe', type: 'color-relief', source: 'terrain',
        paint: { 'color-relief-color': [
          'interpolate', ['linear'], ['elevation'],
          // Wasser bleibt in jeder Tiefe eindeutig blau (tief = satt, flach = hell)
          -16, '#0b3a66',
          -8, '#155a92',
          -3, '#2178b2',
          -0.5, '#39a1d8',
          0.5, '#24455a',
          2, '#141f26',
          20, '#1c333b',
          45, '#264550',
        ] } },
      { id: 'relief', type: 'hillshade', source: 'terrain',
        paint: { 'hillshade-shadow-color': '#02090e', 'hillshade-highlight-color': '#4b7d9b',
                 'hillshade-accent-color': '#12242e', 'hillshade-exaggeration': 0.55 } },
      { id: 'wasser', type: 'fill', source: 'water',
        paint: { 'fill-color': '#2478ad', 'fill-opacity': 0.18 } },
      { id: 'ufer', type: 'line', source: 'water',
        paint: { 'line-color': '#58b7e8', 'line-width': 1.5, 'line-opacity': 0.85 } },
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
    });
    map.on('error', (e) => console.warn('hero3d:', e.error?.message ?? e));
    // Bei Kartendrehung bleiben die Windzahlen aufrecht (Pfeile sind kartenfest)
    map.on('rotate', () => {
      if (mode !== 'lite' && typeof state !== 'undefined' && map.loaded()) renderWind();
    });
    return map;
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
      if (!map || !map.loaded() || mode === 'lite' || typeof state === 'undefined') return;
      renderPegel();
      renderWind();
      renderExtra();
    },

    renderLight() {
      if (!map || !map.loaded() || !map.getLayer('relief')) return;
      if (typeof sunPosition !== 'function') return;
      const sun = sunPosition(new Date());
      const up = sun.el > -3;
      map.setPaintProperty('relief', 'hillshade-illumination-direction',
        up ? ((sun.az % 360) + 360) % 360 : 315);
      map.setPaintProperty('relief', 'hillshade-highlight-color', up ? '#4b7d9b' : '#22404f');
      map.setPaintProperty('bg', 'background-color', up ? '#0d1b22' : '#070f14');
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
      const activate = () => { setDom(newMode); this.renderData(); this.renderLight(); };
      if (m.loaded()) activate();
      else m.once('load', activate);
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
