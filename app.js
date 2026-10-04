/* ═══════════════════════════════════════════════
   MONITOR THE SITUATION — app.js
   UDOT Traffic Camera Monitor
   ═══════════════════════════════════════════════ */

// Always route through the server-side proxy (resolves CORS on UDOT API)
const PROXY_PFX = '/api/proxy';
const IMG_BASE  = `${PROXY_PFX}/map/Cctv`;

// Default home: Temple Square, SLC
const currentState = window.MTSStates?.resolve(location.hostname, location.search);
const HOME = currentState?.home || { lat: 40.7705, lng: -111.8910, zoom: 14, count: 25 };
const utils = window.MTSCameraUtils;

// ── State ──────────────────────────────────────
const state = {
  cameras:      [],   // all cameras from UDOT
  filtered:     [],   // after filters applied
  map:          null,
  markers:      [],
  useDefault:       true,  // show 25 closest to Temple Square until user navigates
  programmaticMove: false, // suppress moveend during setView calls we initiated
  fitAfterFilter:   false, // fit map bounds to grid results on next renderGrid call
  gridSize:         5,     // N in the current N×N display
  refreshTimer:  null,
  refreshRate:   Math.max(60000, (currentState?.minRefreshSeconds || 0) * 1000),
  cols:          5,
  modalIdx:     -1,
  modalCam:     null,
  listView: window.innerWidth <= 600,
  modalHistoryPushed: false,
  modalReturnFocus: null,
  refreshCache: {},   // cameraId → timestamp
};

// ── Init ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  initDarkMode();
  startClock();
  initStateControls();
  initMap();
  initResizer();
  initModalTouch();
  bindControls();
  state.gridSize = utils.defaultGridSize(window.innerWidth);
  updateListView();
  window.addEventListener('popstate', openSharedCamera);
  await loadCameras();
  startRefreshCycle();
  // startPresence();
}

// ── Clock ──────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleTimeString('en-US', {
      hour12: false, timeZone: currentState?.timezone || 'America/Denver',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ── Sidebar Resizer ────────────────────────────
function initResizer() {
  // Map height drag — bottom-right corner handle
  const sidebar      = document.getElementById('sidebar');
  const mapResizer   = document.getElementById('map-resizer');
  const mapContainer = document.getElementById('map-container');

  mapResizer.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startX      = e.clientX;
    const startY      = e.clientY;
    const startHeight = mapContainer.offsetHeight;
    const startWidth  = sidebar.offsetWidth;

    mapResizer.classList.add('dragging');
    document.body.style.cursor     = 'nwse-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const h = Math.max(80,  Math.min(window.innerHeight * 0.75, startHeight + e.clientY - startY));
      const w = Math.max(160, Math.min(640,                        startWidth  + e.clientX - startX));
      mapContainer.style.height = h + 'px';
      sidebar.style.width = w + 'px';
      sidebar.style.flex  = `0 0 ${w}px`;
      if (state.map) state.map.invalidateSize();
    }
    function onUp() {
      mapResizer.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (state.map) state.map.invalidateSize();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Map ────────────────────────────────────────
function notify(message) {
  const node = document.getElementById('app-notice');
  node.textContent = message;
  node.hidden = !message;
}

function mapStatus(message) {
  const node = document.getElementById('map-status');
  node.textContent = message;
  node.hidden = !message;
}

function initStateControls() {
  const select = document.getElementById('state-select');
  const entries = window.MTSStates?.states || [];
  Object.values(entries).forEach(item => {
    const option = document.createElement('option');
    option.value = item.code;
    const ready = ['ready', 'existing'].includes(item.status);
    const canonicalHost = location.hostname.endsWith('.monitorit.app');
    option.disabled = !ready || (canonicalHost && !item.deployed && item.code !== currentState?.code);
    option.textContent = item.name + (['ready', 'existing'].includes(item.status) ? '' : ' — not connected');
    option.selected = item.code === currentState?.code;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    const next = window.MTSStates.get(select.value);
    const url = new URL(location.href);
    url.searchParams.delete('camera');
    // State query links work on the existing host while new subdomains await DNS.
    // Canonical state hosts remain authoritative; route through the root path preview.
    if (location.hostname.endsWith('.monitorit.app')) {
      url.hostname = next.slug + '.monitorit.app';
      url.searchParams.delete('state');
    } else url.searchParams.set('state', next.code);
    location.assign(url.href);
  });
  const source = document.getElementById('source-link');
  if (currentState?.sourceUrl) source.href = currentState.sourceUrl;
  else source.hidden = true;
  source.textContent = currentState?.sourceName || 'Camera source';
  const credit = document.getElementById('source-credit');
  credit.textContent = `Images provided by ${currentState?.sourceName || currentState?.name || 'the official source'}. Image age and availability vary.`;
  document.querySelector('.logo-sub').textContent = currentState?.code === 'OR' ? '// TRIPCHECK COVERAGE' : `// ${currentState?.name || 'UNKNOWN STATE'} TRAFFIC CAMERAS`;
  document.getElementById('clock-zone').textContent = currentState?.code || 'MT';
  document.title = `${currentState?.name || 'Monitor the Situation'} traffic cameras | Monitor the Situation`;
  document.getElementById('coverage-note').hidden = currentState?.code !== 'OR';
  document.getElementById('region-section').hidden = currentState?.code !== 'UT';
  const refresh = document.getElementById('refresh-rate');
  [...refresh.options].forEach(option => { option.disabled = Number(option.value) > 0 && Number(option.value) < (currentState?.minRefreshSeconds || 0) * 1000; });
  refresh.value = String(state.refreshRate);
}

function initMap() {
  if (!window.L) {
    mapStatus('Map unavailable. Camera list and sharing still work.');
    return;
  }
  const map = L.map('map', {
    center: [HOME.lat, HOME.lng], zoom: HOME.zoom, maxZoom: 19,
    zoomControl: true, attributionControl: true,
  });
  state.map = map;
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>');
  // One event per completed move; programmatic fits are synchronous and suppressed.
  map.on('moveend', onMapChange);
  new ResizeObserver(() => {
    const container = map.getContainer();
    if (container.clientWidth && container.clientHeight) moveMap(() => map.invalidateSize({ pan: false }));
  }).observe(document.getElementById('map'));
  loadBasemap();
}

async function loadBasemap() {
  mapStatus('Loading map…');
  const timer = setTimeout(() => mapStatus('Map is taking longer to load. Camera list is still available.'), 15000);
  let layer;
  try {
    // Check before attaching the bridge: failed WebGL setup otherwise leaves
    // Leaflet move handlers pointing at an uninitialized renderer.
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('WebGL2 is unavailable');
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const gl = await import('./vendor/maplibre/maplibre-gl.mjs');
    gl.setWorkerUrl(new URL('./vendor/maplibre/maplibre-gl-worker.mjs', location.href).href);
    window.maplibregl = gl;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/maplibre/leaflet-maplibre-gl.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    layer = L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron', attributionControl: false });
    layer.addTo(state.map);
    const renderer = layer.getMaplibreMap();
    let hadMapError = false;
    renderer.on('error', () => { hadMapError = true; mapStatus('Some map tiles are unavailable. Camera list and sharing still work.'); });
    renderer.on('idle', () => { clearTimeout(timer); if (!hadMapError) mapStatus(''); });
    renderer.on('webglcontextlost', () => mapStatus('Map graphics unavailable. Camera list and sharing still work.'));
  } catch (err) {
    clearTimeout(timer);
    if (layer && state.map.hasLayer(layer)) {
      // The bridge's normal removal expects a renderer, even when onAdd failed.
      if (!layer.getMaplibreMap()) layer.onRemove = () => layer.getContainer()?.remove();
      state.map.removeLayer(layer);
    }
    console.warn('[MTS] Basemap unavailable:', err.message || err);
    loadRasterFallback();
  }
}


function loadRasterFallback() {
  // OSM standard tiles: only the active viewport, normal browser caching, and
  // a valid origin Referer. No offline storage, proxy, prefetch or cache buster.
  mapStatus('Loading basic map…');
  let failed = false;
  const raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
  });
  raster.on('tileerror', () => {
    failed = true;
    mapStatus('Some basic map tiles are unavailable. Camera list and sharing still work.');
  });
  raster.on('load', () => { if (!failed) mapStatus('Basic map · limited community service'); });
  raster.addTo(state.map);
}

function moveMap(action) {
  if (!state.map) return;
  state.programmaticMove = true;
  try { action(); } finally { state.programmaticMove = false; }
}

function onMapChange() {
  if (state.programmaticMove || !state.map?.getContainer().clientWidth || !state.map?.getContainer().clientHeight) return;
  if (state.cameras.length) {
    state.useDefault = false;
    applyFilters();
  }
}

// ── Load Cameras ───────────────────────────────
async function loadCameras(attempt) {
  attempt = attempt || 1;
  const MAX = 3;

  setStatus(
    attempt === 1 ? 'FETCHING CAMERA MANIFEST...' : `RETRYING... (${attempt}/${MAX})`,
    10 * attempt
  );

  try {
    if (!currentState) throw new Error('This state subdomain is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let r1;
    let iconData;
    try {
      const endpoint = currentState.code === 'UT'
        ? `${PROXY_PFX}/map/mapIcons/Cameras`
        : `/api/cameras?state=${encodeURIComponent(currentState.code)}`;
      r1 = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: controller.signal });
      iconData = await r1.json();
    } finally { clearTimeout(timeout); }
    if (!r1.ok || iconData.error) throw new Error(iconData.error || `Camera service returned HTTP ${r1.status}`);
    const items = currentState.code === 'UT' ? (iconData.item2 || []).map(item => ({
      id: item.itemId, lat: item.location?.[0], lng: item.location?.[1],
      location: item.title || `CAM-${item.itemId}`, roadway: '', imgUrl: `${IMG_BASE}/${item.itemId}`,
    })) : iconData.cameras;
    const cameras = utils.normaliseCameras(items);
    if (!cameras.length) throw new Error('No camera positions are available from the source. Please try again later.');
    if (iconData.source?.attribution) document.getElementById('source-credit').textContent = iconData.source.attribution + (iconData.source.licenseUrl ? ' Camera data filtered and reformatted for this viewer.' : '');
    const license = document.getElementById('source-license');
    if (iconData.source?.licenseUrl?.startsWith('https://')) {
      license.href = iconData.source.licenseUrl; license.hidden = false;
    } else license.hidden = true;
    const directoryStale = iconData.stale || r1.headers?.get('X-Cache') === 'STALE';
    notify(iconData.partial ? 'Some districts are temporarily unavailable. Showing available cameras.' : directoryStale ? 'Showing an older camera directory. Image age and availability vary.' : '');

    setStatus(`ESTABLISHING ${cameras.length} FEEDS...`, 70);
    state.cameras = cameras;

    // Add map markers
    addMapMarkers(cameras);

    // Initial render: apply viewport filter immediately
    // (avoids loading 2000+ images at once)
    state.filtered = [...cameras];
    applyFilters();

    setStatus('CAMERA NETWORK ONLINE', 100);
    setTimeout(hideLoading, 400);

    updateStats();
    openSharedCamera();
  } catch (err) {
    console.error(`[MTS] Attempt ${attempt} failed:`, err.message);
    if (attempt < MAX && currentState && ['ready', 'existing'].includes(currentState.status)) {
      setStatus(`RETRYING... (${attempt + 1}/${MAX})`, 20);
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return loadCameras(attempt + 1);
    }
    setStatus('CAMERA SERVICE UNAVAILABLE', 100);
    loadDemoFallback(err.message);
    setTimeout(hideLoading, 600);
  }
}

// Icons defined at module scope so highlight/unhighlight can reference them
const camIconNormal = () => L.divIcon({
  className: 'cam-marker',
  html: `<svg width="11" height="11" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
    <line x1="5.5" y1="0" x2="5.5" y2="4"   stroke="#000000" stroke-width="1.5"/>
    <line x1="5.5" y1="7" x2="5.5" y2="11"  stroke="#000000" stroke-width="1.5"/>
    <line x1="0"   y1="5.5" x2="4"   y2="5.5" stroke="#000000" stroke-width="1.5"/>
    <line x1="7"   y1="5.5" x2="11"  y2="5.5" stroke="#000000" stroke-width="1.5"/>
    <rect x="3.5" y="3.5" width="4" height="4" fill="#000000" fill-opacity="0.8"/>
  </svg>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

const camIconHot = () => L.divIcon({
  className: '',
  html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;filter:drop-shadow(0 0 5px #ff6b35) drop-shadow(0 0 10px #ff3300)">
    <line x1="11" y1="0"  x2="11" y2="7"  stroke="#ff6b35" stroke-width="2.5"/>
    <line x1="11" y1="15" x2="11" y2="22" stroke="#ff6b35" stroke-width="2.5"/>
    <line x1="0"  y1="11" x2="7"  y2="11" stroke="#ff6b35" stroke-width="2.5"/>
    <line x1="15" y1="11" x2="22" y2="11" stroke="#ff6b35" stroke-width="2.5"/>
    <rect x="6" y="6" width="10" height="10" fill="#ff6b35"/>
    <rect x="8" y="8" width="6"  height="6"  fill="#ffaa44"/>
  </svg>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

function highlightMarker(camId) {
  const m = state.markers.find(m => String(m.camId) === String(camId));
  if (!m) return;
  m.setIcon(camIconHot());
  m.setZIndexOffset(1000);
}

function unhighlightMarker(camId) {
  const m = state.markers.find(m => String(m.camId) === String(camId));
  if (!m) return;
  m.setIcon(camIconNormal());
  m.setZIndexOffset(0);
}

function addMapMarkers(cameras) {
  state.markers.forEach(m => m.remove());
  state.markers = [];

  if (!state.map) return;
  cameras.forEach(cam => {
    const m = L.marker([cam.lat, cam.lng], { icon: camIconNormal() })
      .addTo(state.map)
      .on('click', () => openModal(cam))
      .on('mouseover', () => {
        highlightMarker(cam.id);
        const cell = document.querySelector(`.cam-cell[data-id="${CSS.escape(String(cam.id))}"]`);
        if (cell) cell.classList.add('map-hover');
      })
      .on('mouseout', () => {
        unhighlightMarker(cam.id);
        const cell = document.querySelector(`.cam-cell[data-id="${CSS.escape(String(cam.id))}"]`);
        if (cell) cell.classList.remove('map-hover');
      });
    m.camId = cam.id;
    state.markers.push(m);
  });
}

// ── Filter / Render ────────────────────────────

function applyFilters() {
  // Preserve the chosen density while moving the map or searching.
  let cams = [...state.cameras];
  const query = document.getElementById('camera-search').value.trim().toLowerCase();
  if (query) cams = cams.filter(c => `${c.id} ${c.location} ${c.roadway}`.toLowerCase().includes(query));

  // Default view: 25 closest cameras to Temple Square
  if (state.useDefault) {
    cams = [...cams].sort((a, b) =>
      haversine(HOME.lat, HOME.lng, a.lat, a.lng) -
      haversine(HOME.lat, HOME.lng, b.lat, b.lng)
    );
    state.filtered = cams;
    renderGrid(cams);
    updateStats();
    return;
  }

  // Viewport filter
  const bounds = state.map?.getBounds();
  if (bounds) {
    cams = cams.filter(c =>
      c.lat >= bounds.getSouth() &&
      c.lat <= bounds.getNorth() &&
      c.lng >= bounds.getWest() &&
      c.lng <= bounds.getEast()
    );
  }

  state.filtered = cams;
  renderGrid(cams);
  updateStats();
}

function syncMarkerVisibility() {
  const shown = state.filtered.slice(0, state.gridSize * state.gridSize);
  const activeIds = new Set(shown.map(c => String(c.id)));
  state.markers.forEach(m => m.setOpacity(activeIds.has(String(m.camId)) ? 1 : 0.15));
}

function fitToGrid(cams) {
  if (!cams.length || !state.map) return;
  const bounds = L.latLngBounds(cams.map(c => [c.lat, c.lng]));
  moveMap(() => state.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16, animate: false }));
}

function renderGrid(cameras) {
  const grid  = document.getElementById('camera-grid');
  const noRes = document.getElementById('no-results');

  // Reset all marker icons before rebuilding — mouseleave won't fire on
  // destroyed cells, so markers can get stuck in the hot state otherwise.
  state.markers.forEach(m => { m.setIcon(camIconNormal()); m.setZIndexOffset(0); });

  if (!cameras.length) {
    grid.innerHTML = '';
    noRes.style.display = 'flex';
    applyAutoLayout();
    syncMarkerVisibility();
    return;
  }
  noRes.style.display = 'none';

  const maxShow = state.gridSize * state.gridSize;
  const slice   = cameras.slice(0, maxShow);

  const frag = document.createDocumentFragment();
  slice.forEach((cam, idx) => {
    frag.appendChild(makeCamCell(cam, idx));
  });

  grid.innerHTML = '';
  grid.appendChild(frag);
  applyAutoLayout();
  updateStats();
  syncMarkerVisibility();

  // Fit map to exactly the cameras shown in the grid when in default mode,
  // or whenever a region / filter change produces a new set of results
  if (state.useDefault || state.fitAfterFilter) {
    state.fitAfterFilter = false;
    fitToGrid(slice);
  }
}

function makeCamCell(cam, idx) {
  const cell = document.createElement('div');
  cell.className = 'cam-cell';
  cell.dataset.id  = cam.id;
  cell.dataset.idx = idx;

  const cacheBreak = state.refreshCache[cam.id] || Date.now();
  state.refreshCache[cam.id] = cacheBreak;

  const name = cam.location && !cam.location.startsWith('CAM-')
    ? cam.location
    : `CAM-${cam.id}`;

  const image = document.createElement('img');
  image.className = 'cam-img';
  image.src = utils.imageUrl(cam.imgUrl, cacheBreak, location.href);
  image.loading = 'lazy'; image.alt = name; image.draggable = false;
  const status = document.createElement('div'); status.className = 'cam-status';
  const caption = document.createElement('div'); caption.className = 'cam-caption';
  caption.textContent = name;
  cell.append(image, status, caption);
  cell.tabIndex = 0;
  cell.setAttribute('role', 'button');
  cell.setAttribute('aria-label', `Open ${name}`);
  cell.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(cam); }
  });

  cell.addEventListener('mouseenter', () => highlightMarker(cam.id));
  cell.addEventListener('mouseleave', () => unhighlightMarker(cam.id));

  const img = cell.querySelector('.cam-img');
  const dot = cell.querySelector('.cam-status');

  img.onerror = () => {
    cell.classList.add('error');
    dot.classList.add('err');
  };
  img.onload = () => {
    cell.classList.remove('error');
    dot.classList.remove('err');
  };

  cell.addEventListener('click', () => openModal(cam));

  return cell;
}

// ── Modal ──────────────────────────────────────
function openModal(cam, historyMode = 'auto') {
  const alreadyOpen = !!state.modalCam;
  if (!alreadyOpen) state.modalReturnFocus = document.activeElement;
  if (historyMode === 'auto') {
    const url = utils.cameraUrl(location.href, cam.id);
    if (alreadyOpen) history.replaceState(history.state, '', url);
    else {
      history.pushState({ mtsCamera: true }, '', url);
      state.modalHistoryPushed = true;
    }
  }
  document.getElementById('share-panel').hidden = true;
  document.getElementById('share-status').textContent = '';
  state.modalCam = cam;
  state.modalIdx = state.filtered.indexOf(cam);

  const overlay = document.getElementById('modal-overlay');
  const img     = document.getElementById('modal-img');
  const title   = document.getElementById('modal-title');
  const idEl    = document.getElementById('modal-id');
  const road    = document.getElementById('modal-road');
  const coords  = document.getElementById('modal-coords');
  const ts      = document.getElementById('modal-timestamp');

  const name = cam.location && !cam.location.startsWith('CAM-')
    ? cam.location : `CAM-${cam.id}`;
  title.textContent = name;
  idEl.textContent  = `#${cam.id}`;
  road.textContent  = cam.roadway || '';
  coords.textContent = cam.lat ? `${cam.lat.toFixed(5)}, ${cam.lng.toFixed(5)}` : '';

  showModalSpinner();
  img.onload  = () => { hideModalSpinner(); ts.textContent = 'Loaded ' + new Date().toLocaleTimeString(); };
  img.onerror = () => { hideModalSpinner(); ts.textContent = 'FEED UNAVAILABLE'; };
  img.src = utils.imageUrl(cam.imgUrl, Date.now(), location.href);

  overlay.style.display = 'flex';
  if (!alreadyOpen) document.getElementById('btn-modal-close').focus();
  document.addEventListener('keydown', onModalKey);

  // Brief swipe hint on touch devices
  if ('ontouchstart' in window) {
    const wrap = document.getElementById('modal-img-wrap');
    const old  = wrap.querySelector('.swipe-hint');
    if (old) old.remove();
    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = '◀  swipe to navigate  ▶';
    wrap.appendChild(hint);
    setTimeout(() => hint.remove(), 2100);
  }
}

window.closeModal = function(updateHistory = true) {
  if (_fsActive) exitFsMode();
  document.getElementById('modal-overlay').style.display = 'none';
  document.removeEventListener('keydown', onModalKey);
  state.modalCam = null;
  document.getElementById('share-panel').hidden = true;
  if (state.modalReturnFocus?.isConnected) state.modalReturnFocus.focus();
  if (updateHistory) {
    if (state.modalHistoryPushed) { state.modalHistoryPushed = false; history.back(); }
    else { const url = new URL(location.href); url.searchParams.delete('camera'); history.replaceState(history.state, '', url); }
  }
};

window.refreshModal = function() {
  if (!state.modalCam) return;
  const img = document.getElementById('modal-img');
  const ts  = document.getElementById('modal-timestamp');
  showModalSpinner();
  img.onload  = () => { hideModalSpinner(); ts.textContent = 'Loaded ' + new Date().toLocaleTimeString(); };
  img.onerror = () => { hideModalSpinner(); ts.textContent = 'FEED UNAVAILABLE'; };
  img.src = utils.imageUrl(state.modalCam.imgUrl, Date.now(), location.href);
};

window.gotoOnMap = function() {
  const cam = state.modalCam;
  if (!cam || !state.map) return;
  closeModal();
  setMobileView('map');
  state.useDefault = false;
  moveMap(() => state.map.setView([cam.lat, cam.lng], 14, { animate: false }));
  applyFilters();
};

function navModal(dir) {
  const cameras = state.filtered.length ? state.filtered : state.cameras;
  if (!cameras.length) return;
  const current = cameras.indexOf(state.modalCam);
  openModal(cameras[(current + dir + cameras.length) % cameras.length]);
}

function onModalKey(e) {
  if (e.key === 'Tab') {
    const controls = [...document.querySelectorAll('#modal button, #modal input, #modal a[href]')].filter(el => !el.disabled && !el.closest('[hidden]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  if (e.key === 'Escape')      closeModal();
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'ArrowRight')  navModal(1);
  if (e.key === 'ArrowLeft')   navModal(-1);
  if (e.key === 'r')           refreshModal();
}

function showModalSpinner() {
  const s = document.getElementById('modal-spinner');
  s.style.display = 'flex';
}
function hideModalSpinner() {
  document.getElementById('modal-spinner').style.display = 'none';
}

// ── Refresh Cycle ──────────────────────────────
function startRefreshCycle() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  const rate = state.refreshRate;
  if (!rate) return;
  state.refreshTimer = setInterval(() => refreshAllVisible(false), rate);
}

function refreshAllVisible(force = true) {
  const now = Date.now();
  document.querySelectorAll('.cam-cell').forEach(cell => {
    const id  = cell.dataset.id;
    const img = cell.querySelector('.cam-img');
    if (!img) return;
    const cam = state.cameras.find(c => String(c.id) === String(id));
    if (cam) {
      const minAge = Math.max(cam.refreshSeconds || 0, currentState?.minRefreshSeconds || 0) * 1000;
      if (!force && now - (state.refreshCache[id] || 0) < minAge) return;
      state.refreshCache[id] = now;
      img.src = utils.imageUrl(cam.imgUrl, now, location.href);
    }
  });
}

// ── Controls ───────────────────────────────────
function bindControls() {
  document.getElementById('camera-search').addEventListener('input', () => {
    state.useDefault = true;
    applyFilters();
  });
  document.getElementById('btn-list-toggle').addEventListener('click', () => {
    state.listView = !state.listView; updateListView();
  });
  document.getElementById('btn-share-camera').addEventListener('click', shareCamera);
  document.getElementById('btn-copy-link').addEventListener('click', copyCameraLink);


  // Mobile view toggle: MAP ↔ FEEDS
  const mapToggleBtn = document.getElementById('btn-map-toggle');
  if (mapToggleBtn) {
    // Set initial label: we start on the map, so button leads to feeds
    if (window.innerWidth <= 600) {
      mapToggleBtn.textContent = '⊞ FEEDS';
      mapToggleBtn.title = 'View camera feeds';
    }
    mapToggleBtn.addEventListener('click', () => setMobileView(
      document.getElementById('grid-panel').classList.contains('mobile-visible') ? 'map' : 'feeds'
    ));
  }

  // Region buttons — on mobile, auto-switch to feeds after selecting a city
  document.querySelectorAll('.btn-region').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat  = parseFloat(btn.dataset.lat);
      const lng  = parseFloat(btn.dataset.lng);
      const zoom = parseInt(btn.dataset.zoom);
      state.useDefault = false;
      if (state.map) {
        moveMap(() => state.map.setView([lat, lng], zoom, { animate: false }));
      } else {
        state.cameras.sort((a,b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
      }
      applyFilters();
      if (window.innerWidth <= 600) setMobileView('feeds');
    });
  });

  // More / Fewer cameras
  document.getElementById('btn-more').addEventListener('click', () => {
    state.gridSize = Math.min(20, state.gridSize + 1);
    renderGrid(state.filtered);
  });
  document.getElementById('btn-fewer').addEventListener('click', () => {
    state.gridSize = Math.max(1, state.gridSize - 1);
    renderGrid(state.filtered);
  });

  // View All — set grid size to fit every filtered camera
  document.getElementById('btn-view-all').addEventListener('click', () => {
    const total = state.filtered.length;
    if (!total) return;
    state.gridSize = Math.min(20, Math.ceil(Math.sqrt(total)));
    renderGrid(state.filtered);
  });

  // Re-apply layout on panel resize (keeps cols correct, CSS handles cell size)
  new ResizeObserver(() => {
    if (state.filtered.length) applyAutoLayout();
  }).observe(document.getElementById('grid-panel'));

  // Refresh rate
  document.getElementById('refresh-rate').addEventListener('change', e => {
    const selected = Number(e.target.value);
    state.refreshRate = selected === 0 ? 0 : Math.max(selected || 60000, (currentState?.minRefreshSeconds || 0) * 1000);
    e.target.value = String(state.refreshRate);
    startRefreshCycle();
  });
  document.getElementById('btn-refresh-now').addEventListener('click', refreshAllVisible);

  // Modal nav
  document.getElementById('btn-modal-prev').addEventListener('click', () => navModal(-1));
  document.getElementById('btn-modal-next').addEventListener('click', () => navModal(1));
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && _fsActive) exitFsMode();
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement && _fsActive) exitFsMode();
  });

  // Keyboard global shortcuts
  document.addEventListener('keydown', e => {
    if (document.getElementById('modal-overlay').style.display !== 'none' || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target.isContentEditable) return;
    if (e.key === 'Escape') { resetFilters(); }
    if (e.key === 'r')      { refreshAllVisible(); }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); setMobileView('feeds'); document.getElementById('camera-search').focus(); }
  });
}


// ── Auto Layout ────────────────────────────────
// Columns = state.gridSize (N×N square). CSS aspect-ratio handles height.
function applyAutoLayout() {
  const n    = state.gridSize;
  const grid = document.getElementById('camera-grid');
  grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;

  const total = state.filtered.length;
  const shown = Math.min(n * n, total);
  const info  = document.getElementById('grid-info');
  if (info) {
    info.textContent = total > shown
      ? `${n}×${n}  ·  ${shown} of ${total}`
      : `${n}×${n}`;
  }
}

function resetFilters() {
  state.useDefault       = true;
  document.getElementById('camera-search').value = '';
  state.gridSize = utils.defaultGridSize(window.innerWidth);
  moveMap(() => state.map.setView([HOME.lat, HOME.lng], HOME.zoom, { animate: false }));
  applyFilters();
}

// ── Loading / Stats ────────────────────────────
function setStatus(msg, pct) {
  const label = document.getElementById('loading-status');
  const bar = document.getElementById('loading-bar');
  if (label) label.textContent = msg;
  if (bar) bar.style.width = `${pct}%`;
}

function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (!ls) return;
  ls.style.opacity = '0';
  ls.style.transition = 'opacity .3s';
  setTimeout(() => ls.remove(), 300);
}

function updateStats() {
  document.getElementById('stat-total').textContent    = state.cameras.length;
  document.getElementById('stat-active').textContent   = state.filtered.length;
}

// ── Helpers ────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Presence counter ───────────────────────────
function startPresence() {
  const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const el = document.getElementById('presence-count');

  async function heartbeat() {
    try {
      const r = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const { count } = await r.json();
      if (el) el.textContent = count;
    } catch (_) {}
  }

  heartbeat();
  setInterval(heartbeat, 30000);
}

// ── Dark mode ──────────────────────────────────
function initDarkMode() {
  // Restore saved preference before first paint
  try { if (localStorage.getItem('mts-dark') === '1') applyDark(true); } catch (_) {}

  document.getElementById('btn-dark-toggle')
    .addEventListener('click', () => applyDark(!document.body.classList.contains('dark')));
}

function applyDark(on) {
  document.body.classList.toggle('dark', on);
  try { localStorage.setItem('mts-dark', on ? '1' : '0'); } catch (_) {}
  // Leaflet needs a tile refresh after the CSS filter changes
  if (state.map) state.map.invalidateSize();
}

// ── Mobile two-view layout ─────────────────────
// On mobile: MAP view (sidebar) ↔ FEEDS view (grid-panel)
function setMobileView(view) {
  if (window.innerWidth > 600) return;
  const sidebar   = document.getElementById('sidebar');
  const gridPanel = document.getElementById('grid-panel');
  const btn       = document.getElementById('btn-map-toggle');

  if (view === 'feeds') {
    sidebar.classList.add('mobile-hidden');
    gridPanel.classList.add('mobile-visible');
    if (btn) { btn.textContent = '← MAP'; btn.classList.add('active'); }
  } else {
    sidebar.classList.remove('mobile-hidden');
    gridPanel.classList.remove('mobile-visible');
    if (btn) { btn.textContent = '⊞ FEEDS'; btn.classList.remove('active'); }
    if (state.map) setTimeout(() => moveMap(() => state.map.invalidateSize({ pan: false })), 50);
  }
}

// ── Modal touch: swipe + fullscreen ───────────
let _touchStartX = 0;
let _touchStartY = 0;
let _touchStartT = 0;
let _fsActive    = false;

function initModalTouch() {
  const wrap = document.getElementById('modal-img-wrap');

  // Swipe left/right to navigate cameras
  wrap.addEventListener('touchstart', e => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
    _touchStartT = Date.now();
  }, { passive: true });

  wrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _touchStartX;
    const dy = e.changedTouches[0].clientY - _touchStartY;
    const dt = Date.now() - _touchStartT;
    // Quick, primarily horizontal gesture
    if (dt < 400 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) navModal(1);   // swipe left  → next
      else        navModal(-1);  // swipe right → prev
    }
  }, { passive: true });
}

function toggleFullscreen() {
  _fsActive ? exitFsMode() : enterFsMode();
}

function enterFsMode() {
  const overlay = document.getElementById('modal-overlay');
  const req = overlay.requestFullscreen
            || overlay.webkitRequestFullscreen
            || overlay.mozRequestFullScreen;

  if (req) {
    req.call(overlay)
      .then(lockLandscape)
      .catch(() => enableCssFs(overlay));
  } else {
    enableCssFs(overlay);
  }
  _fsActive = true;
  document.getElementById('btn-fullscreen').classList.add('active');
}

function enableCssFs(overlay) {
  overlay.classList.add('fs-active');
  lockLandscape();
}

function exitFsMode() {
  const overlay = document.getElementById('modal-overlay');
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }
  overlay.classList.remove('fs-active');
  unlockOrientation();
  _fsActive = false;
  const btn = document.getElementById('btn-fullscreen');
  if (btn) btn.classList.remove('active');
}

function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('landscape').catch(function() {});
    }
  } catch (_) {}
}

function unlockOrientation() {
  try {
    if (screen.orientation && typeof screen.orientation.unlock === 'function') {
      screen.orientation.unlock();
    }
  } catch (_) {}
}

// Camera failure remains visible in the list; never fabricate camera feeds.
function loadDemoFallback(errMsg) {
  const grid = document.getElementById('camera-grid');
  grid.replaceChildren();
  document.getElementById('no-results').style.display = 'none';
  const note = document.createElement('div'); note.className = 'camera-error';
  const title = document.createElement('h2'); title.textContent = 'Camera data unavailable';
  const message = document.createElement('p'); message.textContent = errMsg || 'Please try again later.';
  const retry = document.createElement('button'); retry.className = 'btn-ghost'; retry.textContent = 'RETRY';
  retry.addEventListener('click', async () => { retry.disabled = true; await loadCameras(); retry.disabled = false; });
  note.append(title, message, retry);
  if (currentState?.sourceUrl) {
    const link = document.createElement('a'); link.href = currentState.officialViewerUrl || currentState.sourceUrl;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open official camera source'; note.append(link);
  }
  grid.appendChild(note);
  setMobileView('feeds');
}

function updateListView() {
  document.getElementById('camera-grid').classList.toggle('camera-list', state.listView);
  const button = document.getElementById('btn-list-toggle');
  button.textContent = state.listView ? 'GRID' : 'LIST';
  button.setAttribute('aria-pressed', String(state.listView));
  button.title = state.listView ? 'Show camera grid' : 'Show camera list';
}

function openSharedCamera() {
  const id = new URL(location.href).searchParams.get('camera');
  if (!id) { if (state.modalCam) closeModal(false); state.modalHistoryPushed = false; return; }
  if (!state.cameras.length) return;
  const cam = state.cameras.find(c => String(c.id) === id);
  if (!cam) { notify('This camera is no longer in the current source. Choose another camera below.'); return; }
  openModal(cam, 'none');
}

async function shareCamera() {
  if (!state.modalCam) return;
  const cam = state.modalCam;
  const url = utils.cameraUrl(location.href, cam.id);
  if (navigator.share) {
    try { await navigator.share({ title: `${currentState?.name || ''} traffic camera: ${cam.location}`, url }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  document.getElementById('share-panel').hidden = false;
  document.getElementById('share-url').value = url;
  await copyCameraLink();
}

async function copyCameraLink() {
  const input = document.getElementById('share-url');
  const status = document.getElementById('share-status');
  if (!input.value && state.modalCam) input.value = utils.cameraUrl(location.href, state.modalCam.id);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard not available');
    await navigator.clipboard.writeText(input.value);
    status.textContent = 'Link copied';
  } catch (_) {
    input.focus(); input.select();
    status.textContent = 'Select and copy this link';
  }
}
