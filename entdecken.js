/* ═══════════════════════════════════════════════════════════════
   ENTDECKEN — Sehenswürdigkeiten (entdecken.json). Kartenstil +
   Routing kommen aus schlei-map.js (window.SchleiMap).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const BUILD = document.querySelector('script[src^="entdecken.js"]')?.src.split('v=')[1] ?? 'dev';
  const $ = (s) => document.querySelector(s);
  const { esc, distM, fmtEntf, MAX_BOUNDS } = window.SchleiMap;

  const KAT = {
    wikinger: { name: 'Wikinger & Archäologie', einzel: 'Wikinger / Archäologie', farbe: '#d9a441' },
    kirche:   { name: 'Kirchen & Klöster',        einzel: 'Kirche / Kloster',       farbe: '#b48cf2' },
    schloss:  { name: 'Schlösser & Herrenhäuser', einzel: 'Schloss / Herrenhaus',   farbe: '#ff8f7a' },
    museum:   { name: 'Museen & Kultur',          einzel: 'Museum',                 farbe: '#45b1e2' },
    technik:  { name: 'Technik & Wahrzeichen',    einzel: 'Technik / Wahrzeichen',  farbe: '#7fd4a8' },
    denkmal:  { name: 'Denkmäler & Aussicht',     einzel: 'Denkmal / Aussicht',     farbe: '#9db4c0' },
  };

  const state = { orte: [], kat: 'alle', suche: '', tour: null, aktiv: null };
  let map = null;

  /* ── Themenrouten: kuratierte Ziel-Reihenfolgen, IDs = Slugs aus dem
     Bake (entdecken.json). Fahren der Route: Task 11. ────────────── */
  const ROUTEN = [
    { id: 'wikinger', name: '🛡 Wikinger & Welterbe',
      ziele: ['haithabu', 'wikinger-museum-haithabu', 'wikingerhaeuser-haithabu', 'danewerk', 'danevirke-museum'] },
    { id: 'kirchen', name: '⛪ Kirchen der Schlei',
      ziele: ['sankt-petri-dom-zu-schleswig', 'sankt-johannis-kloster-vor-schleswig', 'kirche-sieseby', 'kirche-karby', 'sankt-nikolai'] },
    { id: 'maritim', name: '⚓ Maritime Wahrzeichen',
      ziele: ['leuchtturm-schleimuende', 'museumshafen-kappeln', 'heringszaun-kappeln', 'amanda'] },
  ];

  /* ── Karte: seitengemeinsamer Stil aus schlei-map.js ─────────────── */
  const STYLE = window.SchleiMap.baseStyle(BUILD);

  /* ── Routing im gemeinsamen Modul (schlei-map.js): A* über das
     gebackene Wegenetz. `getMap` reicht die erst später erzeugte
     Karte spät nach — bindRoute() läuft schon zu Beginn von init(). */
  const router = window.SchleiMap.createRouting({ build: BUILD, getMap: () => map });
  const { route } = router;

  /* ── Filter + Datenfluss ─────────────────────────────────────── */
  function gefiltert() {
    const q = state.suche.trim().toLowerCase();
    return state.orte.filter((f) => {
      const p = f.properties;
      if (state.kat !== 'alle' && p.cat !== state.kat) return false;
      if (!q) return true;
      return [p.name, p.text].some((x) => x && x.toLowerCase().includes(q));
    });
  }

  function applyFilter() {
    map?.getSource('orte')?.setData({ type: 'FeatureCollection', features: gefiltert() });
    renderListe();
  }

  /* ── Liste (folgt dem Kartenausschnitt) ──────────────────────── */
  const MAX_KARTEN = 80;

  function renderListe() {
    if (state.tour) return;   // Tour steuert die Liste selbst (Task 10)
    const box = $('#cards');
    const alle = gefiltert();
    let vis = alle, hinweis = '';
    if (map) {
      const b = map.getBounds();
      const c = [map.getCenter().lng, map.getCenter().lat];
      vis = alle
        .filter((f) => b.contains(f.geometry.coordinates))
        .sort((x, y) => (y.properties.highlight ? 1 : 0) - (x.properties.highlight ? 1 : 0)
          || distM(c, x.geometry.coordinates) - distM(c, y.geometry.coordinates));
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
      li.dataset.id = p.id;
      li.style.setProperty('--dot', KAT[p.cat].farbe);
      const sub = [KAT[p.cat].einzel, p.kulturdenkmal ? '🛡 Kulturdenkmal' : '']
        .filter(Boolean).join(' · ');
      li.innerHTML = `
        <div class="ek-card-kopf"><span class="dot"></span>
          <h2>${p.highlight ? '★ ' : ''}${esc(p.name)}</h2>
          ${c ? `<span class="entf">${fmtEntf(distM(c, f.geometry.coordinates))}</span>` : ''}</div>
        <p class="ek-card-sub">${esc(sub)}</p>`;
      li.addEventListener('click', (e) => { if (!e.target.closest('a, button')) waehle(f, false); });
      box.appendChild(li);
    }
  }

  /* ── Auswahl: Karte ↔ Liste synchron, Detailkarte zeigt Foto + Text */
  function waehle(f, ausKarte) {
    state.aktiv = f;
    const p = f.properties, co = f.geometry.coordinates;
    map.getSource('wahl').setData({ type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: f.geometry }] });
    if (!ausKarte) map.flyTo({ center: co, zoom: Math.max(map.getZoom(), 13.6), duration: 700 });
    if (ausKarte) renderListe();
    document.querySelectorAll('.ek-card.aktiv').forEach((n) => n.classList.remove('aktiv'));
    const idx = $(`#cards li[data-id="${CSS.escape(p.id)}"]`);
    idx?.classList.add('aktiv');
    idx?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    zeigeDetail(f);
  }

  /* ── Detailkarte: Foto, Beschreibung, Attribution, Aktionen ─────── */
  function zeigeDetail(f) {
    const p = f.properties, el = $('#detail');
    const foto = p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : '';
    const credit = p.img && (p.img_credit || p.img_license)
      ? `<p class="ed-quelle">Foto: ${esc(p.img_credit || 'Wikimedia')}${p.img_license ? ' · ' + esc(p.img_license) : ''}</p>` : '';
    const badges = [KAT[p.cat].einzel, p.kulturdenkmal ? '🛡 geschütztes Kulturdenkmal' : '']
      .filter(Boolean).map((b) => `<span class="ed-badge">${esc(b)}</span>`).join('');
    const mehr = p.wiki_url || p.website;
    el.innerHTML = `
      <button class="ed-detail-x" id="detail-x" aria-label="Schließen">✕</button>
      ${foto}
      <div class="ed-detail-body">
        <h2>${esc(p.name)}</h2>
        <div>${badges}</div>
        ${p.text ? `<p>${esc(p.text)}</p>` : '<p>Für dieses Ziel liegt noch keine Beschreibung vor.</p>'}
        ${p.kulturdenkmal_text ? `<p class="ed-quelle">${esc(p.kulturdenkmal_text)}</p>` : ''}
        ${credit}
        ${p.text ? `<p class="ed-quelle">Text: ${esc(p.text_source || 'OpenStreetMap')}</p>` : ''}
        <div class="ek-card-akt">
          <button class="ek-akt ek-akt-route" data-id="${esc(p.id)}">→ Route hierher</button>
          ${mehr ? `<a class="ek-akt" target="_blank" rel="noopener" href="${esc(mehr)}">Mehr erfahren</a>` : ''}
        </div>
      </div>`;
    el.hidden = false;
    $('#detail-x').addEventListener('click', schliesseDetail);
  }
  function schliesseDetail() {
    $('#detail').hidden = true;
    state.aktiv = null;
    map?.getSource('wahl')?.setData({ type: 'FeatureCollection', features: [] });
    document.querySelectorAll('.ek-card.aktiv').forEach((n) => n.classList.remove('aktiv'));
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
      b.addEventListener('click', () => { state.tour = null; state.kat = id; renderChips(); applyFilter(); });
      box.appendChild(b);
    };
    mkChip('alle', 'Alle', null, state.orte.length);
    for (const [id, k] of Object.entries(KAT)) mkChip(id, k.name, k.farbe, zahl[id] ?? 0);
  }

  /* ── Themenrouten: Chipleiste, Hervorhebung auf der Karte, Liste ── */
  function renderTouren() {
    const box = $('#touren');
    box.innerHTML = '';
    for (const t of ROUTEN) {
      const b = document.createElement('button');
      b.className = 'ed-tour';
      b.setAttribute('aria-pressed', String(state.tour === t.id));
      b.textContent = t.name;
      b.addEventListener('click', () => waehleTour(state.tour === t.id ? null : t.id));
      box.appendChild(b);
    }
  }

  function tourZiele(t) {
    return t.ziele.map((id) => state.orte.find((o) => o.properties.id === id)).filter(Boolean);
  }

  function waehleTour(id) {
    state.tour = id;
    renderTouren();
    const src = map?.getSource('touren');
    if (!id) { src?.setData({ type: 'FeatureCollection', features: [] }); applyFilter(); return; }
    const t = ROUTEN.find((r) => r.id === id);
    const ziele = tourZiele(t);
    const feats = ziele.map((f, i) => ({ type: 'Feature',
      properties: { nr: String(i + 1) }, geometry: f.geometry }));
    if (ziele.length > 1) feats.push({ type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: ziele.map((f) => f.geometry.coordinates) } });
    src?.setData({ type: 'FeatureCollection', features: feats });
    renderTourListe(ziele, t);
    if (ziele.length) {
      const bb = new maplibregl.LngLatBounds();
      ziele.forEach((f) => bb.extend(f.geometry.coordinates));
      map.fitBounds(bb, { padding: 80, maxZoom: 13, duration: 700 });
    }
  }

  function renderTourListe(ziele, t) {
    const box = $('#cards');
    $('#count').textContent = `Tour „${t.name}" — ${ziele.length} Ziele in Reihenfolge`;
    box.innerHTML = '';
    ziele.forEach((f, i) => {
      const p = f.properties;
      const li = document.createElement('li');
      li.className = 'ek-card';
      li.style.setProperty('--dot', KAT[p.cat].farbe);
      li.innerHTML = `<div class="ek-card-kopf"><span class="dot"></span>
        <h2>${i + 1}. ${esc(p.name)}</h2></div>
        <p class="ek-card-sub">${esc(KAT[p.cat].einzel)}</p>`;
      li.addEventListener('click', () => waehle(f, false));
      box.appendChild(li);
    });
    box.insertAdjacentHTML('beforeend',
      `<li class="ek-leer"><button class="ek-akt ek-akt-tour" id="tour-fahren">🧭 Tour abfahren</button></li>`);
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
    router.bindRoute({ resolveZiel: (b) => state.orte.find((o) => o.properties.id === b.dataset.id) });
    const laden = fetch(`entdecken.json?v=${BUILD}`).then((r) => r.json());
    try {
      map = new maplibregl.Map({
        container: 'map', style: STYLE,
        center: [9.79, 54.585], zoom: 10.2, pitch: 42, bearing: 12,
        maxBounds: MAX_BOUNDS, minZoom: 9, maxZoom: 16,
        antialias: true, attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('moveend', renderListe);
      map.on('click', (e) => { if (route.pick) router.pickAt([e.lngLat.lng, e.lngLat.lat]); });
      map.on('click', 'orte-punkt', (e) => {
        if (route.pick) return;
        const f = state.orte.find((o) => o.properties.id === e.features[0].properties.id);
        if (f) waehle(f, true);
      });
      map.on('mouseenter', 'orte-punkt', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'orte-punkt', () => { map.getCanvas().style.cursor = ''; });
      /* Themen-Routen: eigene Quelle + Layer zur Laufzeit ergänzt — Linie
         unter orte-punkt (dezent), Nummern über orte-punkt (sonst deckt der
         opake POI-Punkt an derselben Koordinate die Ziffer zu). Beide
         überleben, da kein setStyle nötig. Befüllung: Task 10. */
      map.on('load', () => {
        map.addSource('touren', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'tour-linie', type: 'line', source: 'touren',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#d9a441', 'line-width': 3, 'line-dasharray': [1.5, 1.2] } }, 'orte-punkt');
        map.addLayer({ id: 'tour-num', type: 'symbol', source: 'touren',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: { 'text-field': ['get', 'nr'], 'text-font': ['noto'], 'text-size': 13,
            'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': '#0d1b22', 'text-halo-color': '#d9a441', 'text-halo-width': 9 } }, 'orte-name');
      });
    } catch (e) {
      console.warn('Karte nicht verfügbar:', e);
      map = null;
      $('#count').textContent = 'Karte nicht verfügbar — das Verzeichnis funktioniert trotzdem.';
    }
    const gj = await laden;
    // Farbe je Feature einbacken (Circle-Layer); id bleibt unverändert (Klick-Matching)
    gj.features.forEach((f) => { f.properties.farbe = KAT[f.properties.cat]?.farbe ?? '#9db4c0'; });
    state.orte = gj.features;
    renderChips();
    renderTouren();
    window.ENTDECKEN = { _map: map, _state: state, _route: route,
      _setStart: router.setStart, _zeigeRoute: router.zeigeRoutePanel };   // für Tests/Debugging
    if (map) {
      if (map.isStyleLoaded()) applyFilter();
      else map.once('load', applyFilter);
      map.once('idle', () => router.ladeGraph());   // Wegenetz lazy: Anzeige + Routing-Graph
    } else {
      renderListe();
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
