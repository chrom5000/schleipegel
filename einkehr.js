/* ═══════════════════════════════════════════════════════════════
   EINKEHR — freies OSM-Verzeichnis (einkehr.json, gebacken via
   scripts/bake_einkehr.py) als Split-View: Liste folgt der Karte,
   Karte folgt der Liste. Bewertungen bewusst extern (Deep-Links
   zu Google/Booking) — keine Schlüssel, keine Fremd-Rankings.
   Kartenstil ist eine schlanke Kopie aus hero3d.js.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const BUILD = document.querySelector('script[src^="einkehr.js"]')?.src.split('v=')[1] ?? 'dev';
  const $ = (s) => document.querySelector(s);
  const MAX_BOUNDS = [[9.35, 54.38], [10.35, 54.80]];

  const KAT = {
    restaurant: { name: 'Restaurants', einzel: 'Restaurant', farbe: '#ffb057' },
    cafe: { name: 'Cafés & Eis', einzel: 'Café / Eis', farbe: '#e8c96a' },
    imbiss: { name: 'Imbiss & Kneipe', einzel: 'Imbiss / Kneipe', farbe: '#ff8f7a' },
    schlafen: { name: 'Schlafen', einzel: 'Unterkunft', farbe: '#b48cf2' },
    camping: { name: 'Camping', einzel: 'Camping', farbe: '#7fd4a8' },
    hafen: { name: 'Häfen', einzel: 'Hafen', farbe: '#45b1e2' },
  };

  const state = { orte: [], kat: 'alle', suche: '', aktiv: null };
  let map = null, popup = null;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const distM = (a, b) => Math.hypot(
    (b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (b[1] - a[1]) * 110540);

  /* ── Karte (Stil: schlanke hero3d-Kopie ohne Seezeichen/Tiefen) ── */
  const STYLE = {
    version: 8,
    sources: {
      terrain: { type: 'raster-dem', tiles: [`terrain/{z}/{x}/{y}.png?v=${BUILD}`],
                 encoding: 'terrarium', tileSize: 256, minzoom: 9, maxzoom: 13,
                 bounds: [9.30, 54.33, 10.45, 54.95],
                 attribution: 'Relief: BSH (DL-DE-BY-2.0) · Terrain Tiles' },
      water: { type: 'geojson', data: `water.geojson?v=${BUILD}` },
      land: { type: 'geojson', data: `land.geojson?v=${BUILD}` },
      orte: { type: 'geojson', data: { type: 'FeatureCollection', features: [] },
              attribution: 'Orte: © OSM-Mitwirkende' },
      wahl: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      wege: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      plabels: { type: 'geojson', data: `orte_labels.json?v=${BUILD}` },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      start: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    sky: { 'sky-color': '#0a1620', 'horizon-color': '#14293a', 'fog-color': '#0d1b22',
           'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.9, 'fog-ground-blend': 0.45 },
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
      { id: 'ufer', type: 'line', source: 'water',
        paint: { 'line-color': '#5cbd85', 'line-opacity': 0.8,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2] } },
      /* Wegenetz: Klassenindex k — 0 Autobahn … 14 Treppe (bake_wege.py) */
      { id: 'wege-pfad', type: 'line', source: 'wege', minzoom: 12.4,
        filter: ['>=', ['get', 'k'], 9],
        paint: { 'line-color': '#375a50', 'line-dasharray': [2, 1.8], 'line-opacity': 0.8,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 12.4, 0.7, 16, 1.8] } },
      { id: 'wege-klein', type: 'line', source: 'wege', minzoom: 11.2,
        filter: ['all', ['>=', ['get', 'k'], 6], ['<=', ['get', 'k'], 8]],
        paint: { 'line-color': '#2e4a58', 'line-opacity': 0.9,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 11.2, 0.6, 16, 3.5] } },
      { id: 'wege-mittel', type: 'line', source: 'wege', minzoom: 9.8,
        filter: ['all', ['>=', ['get', 'k'], 4], ['<=', ['get', 'k'], 5]],
        paint: { 'line-color': '#3a5866',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 16, 4.5] } },
      { id: 'wege-gross', type: 'line', source: 'wege',
        filter: ['<=', ['get', 'k'], 3],
        paint: { 'line-color': '#4a6b78',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.1, 16, 6] } },
      { id: 'ortname-gross', type: 'symbol', source: 'plabels',
        filter: ['<=', ['get', 'rang'], 1],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['noto'],
                  'text-size': ['match', ['get', 'rang'], 0, 15, 12.5],
                  'text-letter-spacing': 0.06 },
        paint: { 'text-color': '#a8bfca', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.5 } },
      { id: 'ortname-klein', type: 'symbol', source: 'plabels', minzoom: 11.6,
        filter: ['>=', ['get', 'rang'], 2],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['noto'], 'text-size': 10.5 },
        paint: { 'text-color': '#8ea6b2', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.4 } },
      { id: 'route-glow', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#45b1e2', 'line-opacity': 0.4, 'line-width': 9, 'line-blur': 5 } },
      { id: 'route-linie', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#bfe7ff', 'line-width': 3 } },
      { id: 'start-punkt', type: 'circle', source: 'start',
        paint: { 'circle-radius': 8, 'circle-color': '#7fd4a8',
                 'circle-stroke-color': '#0d1b22', 'circle-stroke-width': 2.5 } },
      { id: 'wahl-ring', type: 'circle', source: 'wahl',
        paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)',
                 'circle-stroke-color': '#e8f1f6', 'circle-stroke-width': 2.2 } },
      { id: 'orte-punkt', type: 'circle', source: 'orte',
        paint: { 'circle-color': ['get', 'farbe'],
                 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 13, 7, 15, 9],
                 'circle-stroke-color': '#0d1b22', 'circle-stroke-width': 1.6 } },
      { id: 'orte-name', type: 'symbol', source: 'orte', minzoom: 12.6,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['noto'], 'text-size': 11,
                  'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#d9e6ec', 'text-halo-color': '#0d1b22', 'text-halo-width': 1.4 } },
    ],
    glyphs: `${new URL('vendor/glyphs/', location.href).href}{fontstack}/{range}.pbf`,
    terrain: { source: 'terrain', exaggeration: 2.5 },
  };

  /* ── Filter + Datenfluss ─────────────────────────────────────── */
  function gefiltert() {
    const q = state.suche.trim().toLowerCase();
    return state.orte.filter((f) => {
      const p = f.properties;
      if (state.kat !== 'alle' && p.cat !== state.kat) return false;
      if (!q) return true;
      return [p.name, p.ort, p.cuisine, p.adresse].some((x) => x && x.toLowerCase().includes(q));
    });
  }

  function applyFilter() {
    map?.getSource('orte')?.setData({ type: 'FeatureCollection', features: gefiltert() });
    renderListe();
  }

  /* ── Routing: A* über das gebackene Wegenetz (wege.json) ─────────
     Graph entsteht clientseitig: gemeinsame Koordinaten = Knoten.
     Kein externer Routing-Dienst, keine Schlüssel — Planung, keine
     Navigation. Klassenindex muss zu scripts/bake_wege.py passen. */
  const GRAPH_BBOX = [9.40, 54.42, 10.10, 54.76];
  const KLASSE_LABEL = ['Autobahn', 'Schnellstraße', 'Bundesstraße', 'Landstraße', 'Straße',
    'Straße', 'Wohnstraße', 'Spielstraße', 'Zufahrt', 'Feld-/Waldweg', 'Radweg',
    'Fußweg', 'Pfad', 'Fußgängerzone', 'Treppe'];
  /* m/s je Wegklasse; 0 = für das Profil gesperrt */
  const PROFILE = {
    auto: { name: 'Auto', icon: '🚗', mode: 'driving',
            v: [30, 25, 22.2, 19.4, 16.7, 13.9, 8.3, 4.2, 4.2, 0, 0, 0, 0, 0, 0] },
    rad: { name: 'Rad', icon: '🚲', mode: 'bicycling',
           v: [0, 0, 4.6, 5, 4.7, 4.6, 4.2, 4, 3.6, 3.2, 5, 3, 3.4, 2.5, 0.5] },
    fuss: { name: 'Zu Fuß', icon: '🚶', mode: 'walking',
            v: [0, 0, 1.1, 1.2, 1.25, 1.3, 1.35, 1.35, 1.35, 1.35, 1.3, 1.4, 1.35, 1.4, 0.9] },
  };

  let graph = null, graphP = null;
  function ladeGraph() {
    graphP ??= fetch(`wege.json?v=${BUILD}`).then((r) => r.json()).then((gj) => {
      map?.getSource('wege')?.setData(gj);        // Anzeige gleich mit füttern
      return bauGraph(gj);
    });
    return graphP;
  }
  function bauGraph(gj) {
    const idOf = new Map(), xs = [], ys = [], adj = [];
    const namen = [''], namenIdx = new Map([['', 0]]);
    const knoten = (c) => {
      const k = c[0] + ',' + c[1];
      let i = idOf.get(k);
      if (i === undefined) { i = xs.length; idOf.set(k, i); xs.push(c[0]); ys.push(c[1]); adj.push([]); }
      return i;
    };
    for (const f of gj.features) {
      const p = f.properties, cs = f.geometry.coordinates;
      let ni = namenIdx.get(p.n ?? '');
      if (ni === undefined) { ni = namen.length; namenIdx.set(p.n, ni); namen.push(p.n); }
      let a = knoten(cs[0]);
      for (let i = 1; i < cs.length; i++) {
        const b = knoten(cs[i]);
        const d = distM(cs[i - 1], cs[i]);
        adj[a].push(b, d, p.k, ni, 0);             // [Ziel, m, Klasse, Name, gegenEinbahn]
        adj[b].push(a, d, p.k, ni, p.o ? 1 : 0);
        a = b;
      }
    }
    graph = { xs, ys, adj, namen };
    return graph;
  }

  function nahKnoten(lon, lat, v) {
    const { xs, ys, adj } = graph;
    const ml = 111320 * Math.cos(lat * Math.PI / 180);
    let best = -1, bd = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const dx = (xs[i] - lon) * ml, dy = (ys[i] - lat) * 110540;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        const a = adj[i];
        let ok = false;
        for (let j = 0; j < a.length; j += 5) if (v[a[j + 2]] > 0) { ok = true; break; }
        if (ok) { bd = d; best = i; }
      }
    }
    return best;
  }

  function astar(start, ziel, v, einbahn) {
    const { xs, ys, adj } = graph;
    const n = xs.length;
    const g = new Float64Array(n).fill(Infinity);
    const her = new Int32Array(n).fill(-1);
    const herEdge = new Int32Array(n).fill(-1);
    const zu = new Uint8Array(n);
    const vmax = Math.max(...v);
    const ml = 111320 * Math.cos(ys[ziel] * Math.PI / 180);
    const h = (i) => Math.hypot((xs[i] - xs[ziel]) * ml, (ys[i] - ys[ziel]) * 110540) / vmax;
    const hf = [], hi = [];
    const push = (f, i) => {
      hf.push(f); hi.push(i);
      let c = hf.length - 1;
      while (c > 0) {
        const pa = (c - 1) >> 1;
        if (hf[pa] <= hf[c]) break;
        [hf[pa], hf[c]] = [hf[c], hf[pa]]; [hi[pa], hi[c]] = [hi[c], hi[pa]]; c = pa;
      }
    };
    const pop = () => {
      const i = hi[0], lf = hf.pop(), li = hi.pop();
      if (hf.length) {
        hf[0] = lf; hi[0] = li;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < hf.length && hf[l] < hf[m]) m = l;
          if (r < hf.length && hf[r] < hf[m]) m = r;
          if (m === c) break;
          [hf[m], hf[c]] = [hf[c], hf[m]]; [hi[m], hi[c]] = [hi[c], hi[m]]; c = m;
        }
      }
      return i;
    };
    g[start] = 0; push(h(start), start);
    while (hf.length) {
      const u = pop();
      if (zu[u]) continue;
      zu[u] = 1;
      if (u === ziel) break;
      const a = adj[u];
      for (let j = 0; j < a.length; j += 5) {
        const sp = v[a[j + 2]];
        if (!sp || (einbahn && a[j + 4])) continue;
        const to = a[j], ng = g[u] + a[j + 1] / sp;
        if (ng < g[to] - 1e-9) { g[to] = ng; her[to] = u; herEdge[to] = j; push(ng + h(to), to); }
      }
    }
    if (!isFinite(g[ziel])) return null;
    const coords = [], schritte = [];
    let dist = 0, cur = ziel;
    while (cur !== start) {
      const pa = her[cur], j = herEdge[cur], a = adj[pa];
      coords.push([xs[cur], ys[cur]]);
      dist += a[j + 1];
      schritte.push({ ni: a[j + 3], k: a[j + 2], d: a[j + 1] });
      cur = pa;
    }
    coords.push([xs[start], ys[start]]);
    coords.reverse(); schritte.reverse();
    return { coords, schritte, dauer: g[ziel], dist };
  }

  function wegbeschreibung(schritte) {
    const grob = [];
    for (const st of schritte) {
      const label = graph.namen[st.ni] || KLASSE_LABEL[st.k];
      const last = grob[grob.length - 1];
      if (last && last.label === label) last.d += st.d;
      else grob.push({ label, d: st.d });
    }
    const out = [];
    for (const st of grob) {                       // Ministücke dem Nachbarn zuschlagen
      if (st.d < 40 && out.length) out[out.length - 1].d += st.d;
      else out.push(st);
    }
    return out;
  }

  /* ── Routen-UI ───────────────────────────────────────────────── */
  const route = { ziel: null, start: null, startName: '', profil: 'auto', pick: false };
  const fmtDauer = (s) => {
    const min = Math.round(s / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
  };
  const imGraph = ([lon, lat]) =>
    lon >= GRAPH_BBOX[0] && lon <= GRAPH_BBOX[2] && lat >= GRAPH_BBOX[1] && lat <= GRAPH_BBOX[3];

  function zeigeRoutePanel(f) {
    route.ziel = f;
    $('#route-ziel').textContent = f.properties.name;
    $('#route-panel').hidden = false;
    ladeGraph();
    if (matchMedia('(max-width: 700px)').matches && !document.body.classList.contains('karte')) {
      document.body.classList.add('karte');
      $('#btn-flip').textContent = 'Liste';
      map?.resize();
    }
    map?.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 12), duration: 600 });
    if (route.start) berechneRoute();
    else $('#route-status').textContent = 'Startpunkt wählen — per Standort oder Tipp auf die Karte.';
  }
  function schliesseRoute() {
    route.ziel = null; route.pick = false;
    document.body.classList.remove('pickmodus');
    $('#route-panel').hidden = true;
    map?.getSource('route')?.setData({ type: 'FeatureCollection', features: [] });
    map?.getSource('start')?.setData({ type: 'FeatureCollection', features: [] });
  }
  function setStart(pos, name) {
    route.start = pos; route.startName = name;
    map?.getSource('start')?.setData({ type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: pos } }] });
    berechneRoute();
  }

  async function berechneRoute() {
    if (!route.ziel || !route.start) return;
    const status = $('#route-status'), erg = $('#route-erg');
    erg.hidden = true;
    const zielCo = route.ziel.geometry.coordinates;
    const g = `https://www.google.com/maps/dir/?api=1&origin=${route.start[1]},${route.start[0]}&destination=${zielCo[1]},${zielCo[0]}&travelmode=${PROFILE[route.profil].mode}`;
    if (!imGraph(route.start)) {
      status.innerHTML = `${esc(route.startName)} liegt außerhalb des Schlei-Wegenetzes — 
        <a href="${g}" target="_blank" rel="noopener">Route in Google Maps öffnen</a>.`;
      return;
    }
    status.textContent = 'Route wird berechnet …';
    await ladeGraph();
    await new Promise((r) => setTimeout(r, 30));   // Status erst rendern lassen
    const v = PROFILE[route.profil].v;
    const a = nahKnoten(route.start[0], route.start[1], v);
    const b = nahKnoten(zielCo[0], zielCo[1], v);
    const weg = a >= 0 && b >= 0 ? astar(a, b, v, route.profil === 'auto') : null;
    if (!weg) {
      status.innerHTML = `Keine Verbindung im Wegenetz gefunden — 
        <a href="${g}" target="_blank" rel="noopener">Route in Google Maps öffnen</a>.`;
      map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    status.textContent = `Ab ${route.startName} · ${PROFILE[route.profil].name}`;
    map.getSource('route').setData({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: weg.coords } }] });
    const bb = new maplibregl.LngLatBounds();
    weg.coords.forEach((c) => bb.extend(c));
    map.fitBounds(bb, { padding: 80, maxZoom: 14.5, duration: 700 });
    $('#route-summe').innerHTML = `${weg.dist < 950 ? Math.round(weg.dist / 10) * 10 + ' m'
      : (weg.dist / 1000).toFixed(1).replace('.', ',') + ' km'} · ${fmtDauer(weg.dauer)}
      <small>Planung über OSM-Wegedaten — keine Navigation, Ampeln/Wartezeiten nicht enthalten</small>`;
    const ol = $('#route-schritte');
    ol.innerHTML = '';
    for (const st of wegbeschreibung(weg.schritte)) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${esc(st.label)}</b><span>${st.d < 950 ? Math.round(st.d / 10) * 10 + ' m'
        : (st.d / 1000).toFixed(1).replace('.', ',') + ' km'}</span>`;
      ol.appendChild(li);
    }
    $('#route-google').href = g;
    erg.hidden = false;
  }

  /* Pick-Modus: deutlich sichtbar — Banner über der Karte, aktiver
     Knopf, Fadenkreuz (Desktop); Esc oder erneuter Klick bricht ab. */
  function startePick(meldung) {
    route.pick = true;
    document.body.classList.add('pickmodus');
    $('#route-pick').classList.add('aktivmodus');
    if (matchMedia('(max-width: 700px)').matches && !document.body.classList.contains('karte')) {
      document.body.classList.add('karte');
      $('#btn-flip').textContent = 'Liste';
      map?.resize();
    }
    $('#route-status').textContent = meldung ?? 'Tippe jetzt den Startpunkt auf der Karte an.';
    $('#pick-hinweis').hidden = false;
  }
  function endePick() {
    route.pick = false;
    document.body.classList.remove('pickmodus');
    $('#route-pick').classList.remove('aktivmodus');
    $('#pick-hinweis').hidden = true;
  }

  function bindRoute() {
    $('#route-zu').addEventListener('click', () => { endePick(); schliesseRoute(); });
    $('#route-standort').addEventListener('click', () => {
      if (!navigator.geolocation || !window.isSecureContext) {
        // Geolocation gibt es nur über HTTPS (oder localhost) — z. B. nicht in der LAN-Vorschau
        startePick('Die Standortabfrage braucht eine sichere Verbindung (HTTPS) — auf dieschlei.de funktioniert sie. Tippe den Start hier direkt auf die Karte.');
        return;
      }
      $('#route-status').textContent = 'Standort wird bestimmt …';
      navigator.geolocation.getCurrentPosition(
        (pos) => { endePick(); setStart([pos.coords.longitude, pos.coords.latitude], 'deinem Standort'); },
        (err) => {
          const grund = err.code === 1
            ? 'Die Standortfreigabe wurde abgelehnt (Browser-Einstellung)'
            : 'Dein Standort ließ sich gerade nicht bestimmen';
          startePick(`${grund} — tippe den Startpunkt stattdessen auf die Karte.`);
        },
        { enableHighAccuracy: true, timeout: 10000 });
    });
    $('#route-pick').addEventListener('click', () => {
      if (route.pick) { endePick(); $('#route-status').textContent = 'Startpunkt wählen — per Standort oder Tipp auf die Karte.'; }
      else startePick();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && route.pick) { endePick(); $('#route-status').textContent = 'Startpunkt wählen — per Standort oder Tipp auf die Karte.'; }
    });
    const box = $('#route-profile');
    for (const [id, pr] of Object.entries(PROFILE)) {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === route.profil));
      b.textContent = `${pr.icon} ${pr.name}`;
      b.addEventListener('click', () => {
        route.profil = id;
        box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        berechneRoute();
      });
      box.appendChild(b);
    }
    /* Route-Knöpfe in Karten/Popups (delegiert) */
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.ek-akt-route');
      if (!b) return;
      e.stopPropagation();
      zeigeRoutePanel(state.orte[+b.dataset.idx]);
    });
  }

  /* ── Liste (folgt dem Kartenausschnitt) ──────────────────────── */
  const MAX_KARTEN = 80;

  function renderListe() {
    const box = $('#cards');
    const alle = gefiltert();
    let vis = alle, hinweis = '';
    if (map) {
      const b = map.getBounds();
      const c = [map.getCenter().lng, map.getCenter().lat];
      vis = alle
        .filter((f) => b.contains(f.geometry.coordinates))
        .sort((x, y) => distM(c, x.geometry.coordinates) - distM(c, y.geometry.coordinates));
      if (vis.length > MAX_KARTEN) {
        hinweis = ` — die ${MAX_KARTEN} nächsten zur Kartenmitte`; vis = vis.slice(0, MAX_KARTEN);
      }
    }
    $('#count').textContent = alle.length
      ? `${vis.length} von ${alle.length} Orten im Kartenausschnitt${hinweis}`
      : 'Kein Ort passt zu Filter und Suche.';
    box.innerHTML = '';
    if (!vis.length) {
      box.innerHTML = `<li class="ek-leer">${alle.length ? 'Im Ausschnitt liegt kein Treffer — Karte bewegen oder herauszoomen.' : 'Nichts gefunden — Suche oder Filter lockern.'}</li>`;
      return;
    }
    const c = map ? [map.getCenter().lng, map.getCenter().lat] : null;
    for (const f of vis) {
      const p = f.properties;
      const li = document.createElement('li');
      li.className = 'ek-card' + (state.aktiv === f ? ' aktiv' : '');
      li.style.setProperty('--dot', KAT[p.cat].farbe);
      const sub = [KAT[p.cat].einzel, p.cuisine, [p.adresse, p.ort].filter(Boolean).join(', ')]
        .filter(Boolean).join(' · ');
      li.innerHTML = `
        <div class="ek-card-kopf"><span class="dot"></span><h2>${esc(p.name)}</h2>
          ${c ? `<span class="entf">${fmtEntf(distM(c, f.geometry.coordinates))}</span>` : ''}</div>
        <p class="ek-card-sub">${esc(sub)}</p>
        <div class="ek-card-akt">${aktionen(p)}</div>`;
      li.addEventListener('click', (e) => { if (!e.target.closest('a, button')) waehle(f, false); });
      box.appendChild(li);
    }
  }
  const fmtEntf = (m) => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

  function aktionen(p) {
    const ziel = `${p.name}, ${p.adresse ? p.adresse + ', ' : ''}${p.ort || 'Schlei'}`;
    const a = [`<button class="ek-akt ek-akt-route" data-idx="${p.idx}">→ Route</button>`,
      `<a class="ek-akt ek-akt-google" target="_blank" rel="noopener"
      href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ziel)}">★ Google</a>`];
    if (p.cat === 'schlafen' || p.cat === 'camping') {
      a.push(`<a class="ek-akt ek-akt-booking" target="_blank" rel="noopener"
        href="https://www.booking.com/searchresults.de.html?ss=${encodeURIComponent(`${p.name} ${p.ort || 'Schlei'}`)}">Booking</a>`);
    }
    if (p.website) a.push(`<a class="ek-akt" target="_blank" rel="noopener" href="${esc(p.website)}">Website</a>`);
    if (p.phone) a.push(`<a class="ek-akt" href="tel:${esc(p.phone.replace(/\s/g, ''))}">Anrufen</a>`);
    return a.join('');
  }

  /* ── Auswahl: Karte ↔ Liste synchron ─────────────────────────── */
  function waehle(f, ausKarte) {
    state.aktiv = f;
    const p = f.properties, co = f.geometry.coordinates;
    map.getSource('wahl').setData({ type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: f.geometry }] });
    if (!ausKarte) map.flyTo({ center: co, zoom: Math.max(map.getZoom(), 13.6), duration: 700 });
    popup?.remove();
    const div = document.createElement('div');
    div.className = 'ek-pop';
    div.innerHTML = `<h3>${esc(p.name)}</h3>
      <p>${esc([KAT[p.cat].einzel, p.cuisine, [p.adresse, p.ort].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}
      ${p.zeiten ? `<br>Öffnungszeiten: ${esc(p.zeiten)}` : ''}</p>
      <div class="ek-card-akt">${aktionen(p)}</div>`;
    popup = new maplibregl.Popup({ offset: 14, maxWidth: '290px' })
      .setLngLat(co).setDOMContent(div).addTo(map);
    popup.on('close', () => {
      state.aktiv = null;
      map.getSource('wahl').setData({ type: 'FeatureCollection', features: [] });
      document.querySelectorAll('.ek-card.aktiv').forEach((n) => n.classList.remove('aktiv'));
    });
    if (ausKarte) renderListe();
    document.querySelectorAll('.ek-card.aktiv').forEach((n) => n.classList.remove('aktiv'));
    const idx = [...$('#cards').children].find((li) => li.querySelector('h2')?.textContent === p.name);
    idx?.classList.add('aktiv');
    idx?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ── UI ──────────────────────────────────────────────────────── */
  function renderChips() {
    const zahl = {};
    for (const f of state.orte) zahl[f.properties.cat] = (zahl[f.properties.cat] ?? 0) + 1;
    const box = $('#chips');
    box.innerHTML = '';
    const mkChip = (id, name, farbe, n) => {
      const b = document.createElement('button');
      b.className = 'ek-chip';
      if (farbe) b.style.setProperty('--dot', farbe);
      b.setAttribute('aria-pressed', String(state.kat === id));
      b.innerHTML = `${farbe ? '<span class="dot"></span>' : ''}${name}${n != null ? ` <small>${n}</small>` : ''}`;
      b.addEventListener('click', () => { state.kat = id; renderChips(); applyFilter(); });
      box.appendChild(b);
    };
    mkChip('alle', 'Alle', null, state.orte.length);
    for (const [id, k] of Object.entries(KAT)) mkChip(id, k.name, k.farbe, zahl[id] ?? 0);
  }

  function bindUI() {
    let t = 0;
    $('#suche').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.suche = e.target.value; applyFilter(); }, 160);
    });
    $('#btn-info').addEventListener('click', () => $('#dlg-info').showModal());
    $('#btn-flip').addEventListener('click', () => {
      const karte = document.body.classList.toggle('karte');
      $('#btn-flip').textContent = karte ? 'Liste' : 'Karte';
      if (karte) map?.resize();
    });
  }

  /* ── Start ───────────────────────────────────────────────────── */
  async function init() {
    bindUI();
    bindRoute();
    const laden = fetch(`einkehr.json?v=${BUILD}`).then((r) => r.json());
    try {
      map = new maplibregl.Map({
        container: 'map', style: STYLE,
        center: [9.79, 54.585], zoom: 10.2, pitch: 42, bearing: 12,
        maxBounds: MAX_BOUNDS, minZoom: 9, maxZoom: 16,
        antialias: true, attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('moveend', renderListe);
      map.on('click', (e) => {                     // Startpunkt-Tipp im Pick-Modus
        if (!route.pick) return;
        document.body.classList.remove('pickmodus');
        $('#route-pick').classList.remove('aktivmodus');
        $('#pick-hinweis').hidden = true;
        setStart([e.lngLat.lng, e.lngLat.lat], 'Kartenpunkt');
        setTimeout(() => { route.pick = false; }, 0);   // Orte-Klick im selben Tick unterdrücken
      });
      map.on('click', 'orte-punkt', (e) => {
        if (route.pick) return;
        const hit = e.features[0];
        const f = state.orte.find((o) => o.properties.name === hit.properties.name
          && Math.abs(o.geometry.coordinates[0] - hit.geometry.coordinates[0]) < 1e-4);
        if (f) waehle(f, true);
      });
      map.on('mouseenter', 'orte-punkt', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'orte-punkt', () => { map.getCanvas().style.cursor = ''; });
    } catch (e) {
      console.warn('Karte nicht verfügbar:', e);
      map = null;
      $('#count').textContent = 'Karte nicht verfügbar — das Verzeichnis funktioniert trotzdem.';
    }
    const gj = await laden;
    // Farbe + Index je Feature einbacken (Circle-Layer bzw. Route-Knöpfe)
    gj.features.forEach((f, i) => {
      f.properties.farbe = KAT[f.properties.cat]?.farbe ?? '#9db4c0';
      f.properties.idx = i;
    });
    state.orte = gj.features;
    renderChips();
    window.EINKEHR = { _map: map, _state: state, _route: route,
      _setStart: setStart, _zeigeRoute: zeigeRoutePanel };  // für Tests/Debugging
    if (map) {
      if (map.isStyleLoaded()) applyFilter();
      else map.once('load', applyFilter);
      map.once('idle', () => ladeGraph());         // Wegenetz lazy: Anzeige + Routing-Graph
    } else {
      renderListe();
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
