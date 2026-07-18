/* ═══════════════════════════════════════════════════════════════
   Gemeinsamer Kartenstil + Routing für Einkehr und Entdecken.
   Quelle war einkehr.js; Änderungen hier wirken auf beide Seiten.
   regatta.js ist (noch) eine eigenständige Kopie.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const $ = (s) => document.querySelector(s);

  const MAX_BOUNDS = [[9.35, 54.38], [10.35, 54.80]];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Nur sichere URL-Schemata als Link zulassen (OSM-Tags sind ungeprüft) — sonst toter Link.
  const sicherHref = (url) => /^(https?:|mailto:|tel:)/i.test((url || '').trim()) ? url : '#';
  const distM = (a, b) => Math.hypot(
    (b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (b[1] - a[1]) * 110540);

  /* ── Karte (Stil: schlanke hero3d-Kopie ohne Seezeichen/Tiefen) ── */
  function baseStyle(build) {
    return {
      version: 8,
      sources: {
        terrain: { type: 'raster-dem', tiles: [`terrain/{z}/{x}/{y}.png?v=${build}`],
                   encoding: 'terrarium', tileSize: 256, minzoom: 9, maxzoom: 13,
                   bounds: [9.30, 54.33, 10.45, 54.95],
                   attribution: 'Relief: BSH (DL-DE-BY-2.0) · Terrain Tiles' },
        water: { type: 'geojson', data: `water.geojson?v=${build}` },
        land: { type: 'geojson', data: `land.geojson?v=${build}` },
        orte: { type: 'geojson', data: { type: 'FeatureCollection', features: [] },
                attribution: 'Orte: © OSM-Mitwirkende' },
        wahl: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        wege: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        plabels: { type: 'geojson', data: `orte_labels.json?v=${build}` },
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

  const fmtDauer = (s) => {
    const min = Math.round(s / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
  };
  const fmtEntf = (m) => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

  /* Kartenstil + Routing sind seitengemeinsam; `getMap` reicht die
     (später erst erzeugte) Map spät nach — die Routing-Verdrahtung
     läuft bereits, bevor die Karte existiert. */
  function createRouting({ build, getMap }) {
    const route = { ziel: null, start: null, startName: '', profil: 'auto', pick: false };
    let graph = null, graphP = null;

    function ladeGraph() {
      graphP ??= fetch(`wege.json?v=${build}`).then((r) => r.json()).then((gj) => {
        getMap()?.getSource('wege')?.setData(gj);        // Anzeige gleich mit füttern
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
      graph = { xs, ys, adj, namen, comp: {}, haupt: {} };
      /* Zusammenhangskomponenten je Profil (Union-Find): Start/Ziel
         dürfen nur aufs Hauptnetz snappen — sonst landet z. B. ein
         Auto-Ziel auf einer Parkplatz-Zufahrt hinter der Fußgänger-
         zone (Insel im Graphen) und A* findet nie einen Weg. */
      for (const [pid, pr] of Object.entries(PROFILE)) {
        const parent = new Int32Array(xs.length);
        for (let i = 0; i < parent.length; i++) parent[i] = i;
        const find = (i) => {
          while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
          return i;
        };
        for (let a = 0; a < adj.length; a++) {
          const e = adj[a];
          for (let j = 0; j < e.length; j += 5) {
            if (pr.v[e[j + 2]] > 0) {
              const ra = find(a), rb = find(e[j]);
              if (ra !== rb) parent[rb] = ra;
            }
          }
        }
        const groesse = new Map();
        const root = new Int32Array(xs.length);
        for (let i = 0; i < xs.length; i++) {
          root[i] = find(i);
          groesse.set(root[i], (groesse.get(root[i]) ?? 0) + 1);
        }
        let haupt = -1, hn = -1;
        for (const [r, n2] of groesse) if (n2 > hn) { hn = n2; haupt = r; }
        graph.comp[pid] = root;
        graph.haupt[pid] = haupt;
      }
      return graph;
    }

    function nahKnoten(lon, lat, pid) {
      const { xs, ys } = graph;
      const comp = graph.comp[pid], haupt = graph.haupt[pid];
      const ml = 111320 * Math.cos(lat * Math.PI / 180);
      let best = -1, bd = Infinity;
      for (let i = 0; i < xs.length; i++) {
        if (comp[i] !== haupt) continue;
        const dx = (xs[i] - lon) * ml, dy = (ys[i] - lat) * 110540;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
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
        getMap()?.resize();
      }
      getMap()?.flyTo({ center: f.geometry.coordinates, zoom: Math.max(getMap().getZoom(), 12), duration: 600 });
      if (route.start) berechneRoute();
      else $('#route-status').textContent = 'Startpunkt wählen — per Standort oder Tipp auf die Karte.';
    }
    function schliesseRoute() {
      route.ziel = null; route.pick = false;
      document.body.classList.remove('pickmodus');
      $('#route-panel').hidden = true;
      getMap()?.getSource('route')?.setData({ type: 'FeatureCollection', features: [] });
      getMap()?.getSource('start')?.setData({ type: 'FeatureCollection', features: [] });
    }
    function setStart(pos, name) {
      route.start = pos; route.startName = name;
      getMap()?.getSource('start')?.setData({ type: 'FeatureCollection',
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
      const a = nahKnoten(route.start[0], route.start[1], route.profil);
      const b = nahKnoten(zielCo[0], zielCo[1], route.profil);
      const weg = a >= 0 && b >= 0 ? astar(a, b, v, route.profil === 'auto') : null;
      if (!weg) {
        status.innerHTML = `Keine Verbindung im Wegenetz gefunden —
          <a href="${g}" target="_blank" rel="noopener">Route in Google Maps öffnen</a>.`;
        getMap().getSource('route').setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      status.textContent = `Ab ${route.startName} · ${PROFILE[route.profil].name}`;
      getMap().getSource('route').setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: weg.coords } }] });
      const bb = new maplibregl.LngLatBounds();
      weg.coords.forEach((c) => bb.extend(c));
      getMap().fitBounds(bb, { padding: 80, maxZoom: 14.5, duration: 700 });
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
        getMap()?.resize();
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

    /* Startpunkt-Tipp im Pick-Modus: DOM aufräumen, Start setzen.
       `route.pick` wird bewusst deferred (setTimeout) zurückgesetzt —
       so sieht der später im selben Klick-Tick feuernde orte-punkt-
       Handler `route.pick === true` und unterdrückt die Ortsauswahl. */
    function pickAt(pos) {
      document.body.classList.remove('pickmodus');
      $('#route-pick').classList.remove('aktivmodus');
      $('#pick-hinweis').hidden = true;
      setStart(pos, 'Kartenpunkt');
      setTimeout(() => { route.pick = false; }, 0);
    }

    function bindRoute({ resolveZiel }) {
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
      /* Route-Knöpfe in Karten/Popups (delegiert) — Ziel seitenspezifisch */
      document.addEventListener('click', (e) => {
        const b = e.target.closest('.ek-akt-route');
        if (!b) return;
        e.stopPropagation();
        const f = resolveZiel(b);
        if (f) zeigeRoutePanel(f);
      });
    }

    return { route, PROFILE, ladeGraph, imGraph, nahKnoten, astar, wegbeschreibung,
      zeigeRoutePanel, schliesseRoute, setStart, berechneRoute, pickAt, bindRoute };
  }

  window.SchleiMap = { esc, sicherHref, distM, fmtDauer, fmtEntf, MAX_BOUNDS, GRAPH_BBOX, baseStyle, createRouting };
})();
