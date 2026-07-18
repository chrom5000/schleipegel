/* ═══════════════════════════════════════════════════════════════
   EINKEHR — freies OSM-Verzeichnis (einkehr.json, gebacken via
   scripts/bake_einkehr.py) als Split-View: Liste folgt der Karte,
   Karte folgt der Liste. Bewertungen bewusst extern (Deep-Links
   zu Google/Booking) — keine Schlüssel, keine Fremd-Rankings.
   Kartenstil + Routing liegen im gemeinsamen Modul schlei-map.js.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {
  const BUILD = document.querySelector('script[src^="einkehr.js"]')?.src.split('v=')[1] ?? 'dev';
  const $ = (s) => document.querySelector(s);
  const { esc, sicherHref, distM, fmtEntf, MAX_BOUNDS } = window.SchleiMap;

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

  /* ── Karte: seitengemeinsamer Stil aus schlei-map.js ─────────────── */
  const STYLE = window.SchleiMap.baseStyle(BUILD);

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

  /* ── Routing im gemeinsamen Modul (schlei-map.js): A* über das
     gebackene Wegenetz. `getMap` reicht die erst später erzeugte
     Karte spät nach — bindRoute() läuft schon zu Beginn von init(). */
  const router = window.SchleiMap.createRouting({ build: BUILD, getMap: () => map });
  const { route } = router;

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

  function aktionen(p) {
    const ziel = `${p.name}, ${p.adresse ? p.adresse + ', ' : ''}${p.ort || 'Schlei'}`;
    const a = [`<button class="ek-akt ek-akt-route" data-idx="${p.idx}">→ Route</button>`,
      `<a class="ek-akt ek-akt-google" target="_blank" rel="noopener"
      href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ziel)}">★ Google</a>`];
    if (p.cat === 'schlafen' || p.cat === 'camping') {
      a.push(`<a class="ek-akt ek-akt-booking" target="_blank" rel="noopener"
        href="https://www.booking.com/searchresults.de.html?ss=${encodeURIComponent(`${p.name} ${p.ort || 'Schlei'}`)}">Booking</a>`);
    }
    if (p.website) a.push(`<a class="ek-akt" target="_blank" rel="noopener" href="${esc(sicherHref(p.website))}">Website</a>`);
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
    router.bindRoute({ resolveZiel: (b) => state.orte[+b.dataset.idx] });
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
      map.on('click', (e) => { if (route.pick) router.pickAt([e.lngLat.lng, e.lngLat.lat]); });
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
      _setStart: router.setStart, _zeigeRoute: router.zeigeRoutePanel };  // für Tests/Debugging
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
