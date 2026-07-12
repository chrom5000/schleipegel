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
      { id: 'relief', type: 'hillshade', source: 'terrain',
        paint: { 'hillshade-shadow-color': '#050d12', 'hillshade-highlight-color': '#3a6a86',
                 'hillshade-accent-color': '#12242e', 'hillshade-exaggeration': 0.7 } },
      { id: 'wasser', type: 'fill', source: 'water',
        paint: { 'fill-color': '#2478ad', 'fill-opacity': 0.35 } },
      { id: 'ufer', type: 'line', source: 'water',
        paint: { 'line-color': '#58b7e8', 'line-width': 1, 'line-opacity': 0.7 } },
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
    return map;
  }

  const HERO3D = {
    ready: false,

    init() {
      if (!supported() || typeof maplibregl === 'undefined') { setDom('lite'); return; }
      let saved = 'lite';
      try { saved = localStorage.getItem('hero-view') ?? 'lite'; } catch { /* egal */ }
      if (saved !== 'lite') this.setMode(saved);
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
      if (newMode === 'lite') { setDom('lite'); return; }
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
      setDom(newMode);
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
