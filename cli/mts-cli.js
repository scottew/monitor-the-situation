#!/usr/bin/env node
/* ═══════════════════════════════════════════════
   MTS — MONITOR THE SITUATION CLI
   For use standalone or as an openclaw agent tool

   Usage:
     mts cameras [--area SLC] [--route I-15] [--lat LAT --lng LNG --radius MILES]
     mts weather [--area SLC]
     mts show <camera-id>
     mts serve [--port 8080]
   ═══════════════════════════════════════════════ */

'use strict';

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

const UDOT_BASE = 'https://www.udottraffic.utah.gov';

// ── ANSI Colors ────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};

// Disable colors for non-interactive / explicit no-color
if (
  !process.stdout.isTTY ||
  process.env.NO_COLOR !== undefined ||
  process.argv.includes('--no-color')
) {
  for (const key of Object.keys(C)) C[key] = '';
}

const c = (color, str) => `${C[color]}${str}${C.reset}`;

// ── Known regions ──────────────────────────────
const REGIONS = {
  'slc':       { lat: 40.7608,  lng: -111.8910, radius: 20,  name: 'Salt Lake City'  },
  'ogden':     { lat: 41.2230,  lng: -111.9738, radius: 15,  name: 'Ogden'            },
  'provo':     { lat: 40.2338,  lng: -111.6585, radius: 15,  name: 'Provo/Orem'       },
  'stgeorge':  { lat: 37.0965,  lng: -113.5684, radius: 15,  name: 'St. George'       },
  'logan':     { lat: 41.7370,  lng: -111.8338, radius: 12,  name: 'Logan'            },
  'moab':      { lat: 38.5733,  lng: -109.5498, radius: 20,  name: 'Moab'             },
  'parkcity':  { lat: 40.6461,  lng: -111.4980, radius: 12,  name: 'Park City'        },
  'i15':       { route: 'I-15',                              name: 'I-15 Corridor'    },
  'i80':       { route: 'I-80',                              name: 'I-80 Corridor'    },
  'i84':       { route: 'I-84',                              name: 'I-84 Corridor'    },
  'i70':       { route: 'I-70',                              name: 'I-70 Corridor'    },
  'wasatch':   { lat: 40.5,     lng: -111.8,    radius: 60,  name: 'Wasatch Front'   },
  'utah':      { lat: 39.5,     lng: -111.5,    radius: 400, name: 'All Utah'         },
};

// ── HTTP helper ────────────────────────────────
function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${UDOT_BASE}${endpoint}`;
    https.get(fullUrl, {
      headers: {
        'User-Agent': 'MTS-CLI/1.0',
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function fetchBuffer(endpoint) {
  return new Promise((resolve, reject) => {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${UDOT_BASE}${endpoint}`;
    https.get(fullUrl, {
      headers: { 'User-Agent': 'MTS-CLI/1.0' }
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        type: res.headers['content-type'] || 'image/jpeg',
        status: res.statusCode,
      }));
    }).on('error', reject);
  });
}

// ── Haversine distance (meters) ────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Camera Data ────────────────────────────────
async function getAllCameras() {
  process.stderr.write(c('dim', 'Fetching camera manifest...\n'));
  const data = await fetchJson('/map/mapIcons/Cameras');
  const items = data.item2 || [];

  return items.map(item => ({
    id:       item.itemId,
    lat:      item.location[0],
    lng:      item.location[1],
    location: item.title || `CAM-${item.itemId}`,
    roadway:  '',
    imgUrl:   `${UDOT_BASE}/map/Cctv/${item.itemId}`,
  }));
}

async function enrichCameras(cameras) {
  try {
    const json = await fetchJson('/Camera/GetUserCameras?listId=0');
    const data = Array.isArray(json) ? json : (json.data || []);
    if (!Array.isArray(data)) return cameras;
    const map = {};
    data.forEach(c => { if (c.id) map[String(c.id)] = { location: c.location || '', roadway: c.roadway || '' }; });
    cameras.forEach(cam => {
      const info = map[String(cam.id)];
      if (info) {
        if (info.location) cam.location = info.location;
        if (info.roadway)  cam.roadway  = info.roadway;
      }
    });
  } catch (_) {}
  return cameras;
}

function filterByArea(cameras, opts) {
  let out = [...cameras];

  // By lat/lng radius
  if (opts.lat !== undefined && opts.lng !== undefined) {
    const r = (opts.radius || 20) * 1609.34;
    out = out.filter(c => haversine(opts.lat, opts.lng, c.lat, c.lng) <= r);
  }

  // By route
  if (opts.route) {
    const q = opts.route.toLowerCase();
    const routeFiltered = out.filter(c =>
      c.roadway.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q)
    );
    if (routeFiltered.length > 0) {
      out = routeFiltered;
    } else {
      // Fallback: strip prefix (I-, SR-, US-, HWY) and retry as bare number
      const bare = q.replace(/^(i-?|sr-?|us-?|hwy\s?)/i, '');
      if (bare && bare !== q) {
        out = out.filter(c =>
          c.roadway.toLowerCase().includes(bare) ||
          c.location.toLowerCase().includes(bare)
        );
      }
    }
  }

  // By area name
  if (opts.area) {
    const key = opts.area.toLowerCase().replace(/[\s-]/g, '');
    const region = REGIONS[key];
    if (region) {
      if (region.lat !== undefined) {
        const r = (region.radius || 20) * 1609.34;
        out = out.filter(c => haversine(region.lat, region.lng, c.lat, c.lng) <= r);
      }
      if (region.route) {
        const q = region.route.toLowerCase();
        out = out.filter(c =>
          c.roadway.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q)
        );
      }
    } else {
      // Free-text match
      const q = opts.area.toLowerCase();
      out = out.filter(c => c.location.toLowerCase().includes(q));
    }
  }

  // By search
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter(c =>
      c.location.toLowerCase().includes(q) ||
      c.roadway.toLowerCase().includes(q)
    );
  }

  return out;
}

// ── Print helpers ──────────────────────────────
function printCameraTable(cameras, opts = {}) {
  const limit = opts.limit || 20;
  const show  = cameras.slice(0, limit);

  console.log(c('cyan', '┌─────────────────────────────────────────────────────────────┐'));
  console.log(c('cyan', '│') + c('bold', '  MONITOR THE SITUATION — UDOT CAMERA RESULTS') + c('cyan', '                 │'));
  console.log(c('cyan', '├──────────┬──────────────────────────────┬──────────┬─────────┤'));
  console.log(
    c('cyan', '│') + c('gray', '  CAM ID  ') +
    c('cyan', '│') + c('gray', '  LOCATION                    ') +
    c('cyan', '│') + c('gray', '  ROAD    ') +
    c('cyan', '│') + c('gray', '  COORDS ') +
    c('cyan', '│')
  );
  console.log(c('cyan', '├──────────┼──────────────────────────────┼──────────┼─────────┤'));

  show.forEach((cam, i) => {
    const id   = String(cam.id).padEnd(8);
    const loc  = (cam.location || '').slice(0, 28).padEnd(28);
    const road = (cam.roadway  || '').slice(0, 8).padEnd(8);
    const lat  = cam.lat ? cam.lat.toFixed(3) : '?';
    const lng  = cam.lng ? cam.lng.toFixed(3) : '?';
    const coords = `${lat},${lng}`.slice(0, 9).padEnd(9);

    console.log(
      c('cyan', '│') + c('green',  `  ${id}`) +
      c('cyan', '│') + c('white',  `  ${loc}`) +
      c('cyan', '│') + c('yellow', `  ${road}`) +
      c('cyan', '│') + c('dim',    `  ${coords}`) +
      c('cyan', '│')
    );
  });

  console.log(c('cyan', '└──────────┴──────────────────────────────┴──────────┴─────────┘'));
  console.log(c('dim', `  Showing ${show.length} of ${cameras.length} cameras`));
  if (cameras.length > limit) {
    console.log(c('dim', `  Use --limit ${cameras.length} to see all`));
  }
  console.log('');
  console.log(c('dim', '  Image URLs:'));
  show.slice(0, 5).forEach(cam => {
    console.log(c('dim', '    ') + c('cyan', `${cam.imgUrl}`));
  });
}

function printCameraJson(cameras, opts = {}) {
  const limit = opts.limit || cameras.length;
  console.log(JSON.stringify(cameras.slice(0, limit), null, 2));
}

// ── Commands ───────────────────────────────────

async function cmdCameras(args) {
  const opts  = parseArgs(args);
  const all   = await getAllCameras();
  let cameras = await enrichCameras(all);

  cameras = filterByArea(cameras, opts);

  if (opts.json) {
    printCameraJson(cameras, opts);
  } else {
    printCameraTable(cameras, opts);
  }
}

async function cmdWeather(args) {
  // Weather context via visual inspection of camera feeds
  const opts  = parseArgs(args);
  const all   = await getAllCameras();
  let cameras = await enrichCameras(all);
  cameras = filterByArea(cameras, opts);

  if (!cameras.length) {
    console.log(c('yellow', 'No cameras found for this area.'));
    return;
  }

  console.log(c('cyan', '\n[MTS] WEBCAM WEATHER REPORT'));
  console.log(c('dim', `Area: ${opts.area || 'all Utah'} | Cameras found: ${cameras.length}`));
  console.log(c('dim', '─'.repeat(60)));
  console.log('');
  console.log(c('yellow', 'Camera feeds for visual weather assessment:'));
  console.log('');

  const show = cameras.slice(0, 10);
  show.forEach((cam, i) => {
    console.log(
      c('green',  `  [${String(i+1).padStart(2)}]`) + ' ' +
      c('white',  (cam.location || `CAM-${cam.id}`).padEnd(40)) +
      c('cyan',   cam.imgUrl)
    );
  });

  if (!opts.json) {
    console.log('');
    console.log(c('dim', '  Open these URLs in a browser for live visual conditions.'));
    console.log(c('dim', '  Run with --open to launch in browser.'));
  }

  if (opts.open) {
    const urls = show.map(c => c.imgUrl);
    try {
      execSync(`open "${show[0].imgUrl}"`); // macOS
    } catch (_) {
      try { execSync(`xdg-open "${show[0].imgUrl}"`); } catch (_) {}
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ cameras: show.map(c => ({
      id: c.id, location: c.location, roadway: c.roadway,
      lat: c.lat, lng: c.lng, imgUrl: c.imgUrl,
    }))}, null, 2));
  }
}

async function cmdShow(args) {
  const [cameraId, ...rest] = args;
  const opts = parseArgs(rest);

  if (!cameraId) {
    console.error(c('red', 'Usage: mts show <camera-id>'));
    process.exit(1);
  }

  const imgUrl = `${UDOT_BASE}/map/Cctv/${cameraId}`;
  console.log(c('cyan', `[MTS] Camera ${cameraId}`));
  console.log(c('dim', `Feed: ${imgUrl}`));

  if (opts.save) {
    const outPath = opts.save === true ? `cam-${cameraId}.jpg` : opts.save;
    process.stderr.write(c('dim', `Saving image to ${outPath}...\n`));
    const { buffer, status } = await fetchBuffer(imgUrl);
    if (status === 200) {
      fs.writeFileSync(outPath, buffer);
      console.log(c('green', `  Saved: ${outPath} (${buffer.length} bytes)`));
    } else {
      console.error(c('red', `  HTTP ${status}: Feed unavailable`));
    }
  } else {
    if (opts.open || (!opts.json && process.stdout.isTTY)) {
      try {
        execSync(`open "${imgUrl}"`);
      } catch (_) {
        try { execSync(`xdg-open "${imgUrl}"`); } catch (_) {}
      }
      console.log(c('green', `  Opened in browser.`));
    }
    if (opts.json) {
      console.log(JSON.stringify({ id: cameraId, imgUrl }, null, 2));
    }
  }
}

// ── Camera Name Cache ──────────────────────────
// Aggregates names from multiple UDOT list endpoints + mapIcons fields
let _camNamesCache   = null;
let _camNamesFetched = false;

async function fetchCamNamesFromUDOT() {
  const merged = {}; // id → { location, roadway }

  // Helper: parse a GetUserCameras-style response
  function absorb(json) {
    const items = Array.isArray(json) ? json : (json.data || json.cameras || []);
    if (!Array.isArray(items)) return;
    items.forEach(c => {
      const id = String(c.id || c.cameraId || c.itemId || '');
      if (!id) return;
      const loc = c.location || c.name || c.description || c.title || '';
      const rd  = c.roadway  || c.road  || '';
      if (loc && !merged[id]) merged[id] = { location: loc, roadway: rd };
    });
  }

  // 1. Try GetUserCameras with listId 0-19 in parallel
  const listFetches = [];
  for (let i = 0; i <= 19; i++) {
    listFetches.push(
      fetchJson(`/Camera/GetUserCameras?listId=${i}`)
        .then(absorb)
        .catch(() => {})
    );
  }

  // 2. Also try some alternate endpoint patterns
  const altFetches = [
    '/Camera/GetAllCameras',
    '/Camera/GetCameras',
    '/api/cameras',
    '/map/mapData/Cameras',
  ].map(ep =>
    fetchJson(ep).then(absorb).catch(() => {})
  );

  // 3. Pull any name fields from mapIcons (title is usually empty but check anyway)
  const mapIconsFetch = fetchJson('/map/mapIcons/Cameras').then(data => {
    const items = data.item2 || data.data || [];
    items.forEach(item => {
      const id  = String(item.itemId || '');
      const loc = item.title || item.name || item.description || item.label || '';
      const rd  = item.roadway || item.route || '';
      if (id && loc && !merged[id]) merged[id] = { location: loc, roadway: rd };
    });
  }).catch(() => {});

  await Promise.all([...listFetches, ...altFetches, mapIconsFetch]);
  return merged;
}

async function serveCamNames(res) {
  if (!_camNamesCache) {
    if (!_camNamesFetched) {
      _camNamesFetched = true;
      process.stderr.write('[MTS] Fetching camera names from UDOT...\n');
      try {
        _camNamesCache = await fetchCamNamesFromUDOT();
        process.stderr.write(`[MTS] Camera names loaded: ${Object.keys(_camNamesCache).length} named\n`);
      } catch (e) {
        _camNamesCache = {};
      }
    }
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=300',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(_camNamesCache || {}));
}

// ── Proxy/Serve Mode ───────────────────────────
// Serves the web app + proxies UDOT API to solve CORS
function cmdServe(args) {
  const opts = parseArgs(args);
  const PORT = opts.port ? parseInt(opts.port) : 8080;
  const WEB_DIR = path.join(__dirname, '..');

  const server = http.createServer((req, res) => {
    const parsed   = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Normalized, allowlisted state camera adapters (same route as Vercel).
    if (pathname === '/api/cameras') {
      req.query = Object.fromEntries(parsed.searchParams);
      require('../api/cameras')(req, res);
      return;
    }

    // Camera name aggregation endpoint
    if (pathname === '/api/camnames') {
      serveCamNames(res);
      return;
    }

    // Proxy UDOT API — handles both /api/proxy/* and legacy /proxy/*
    if (pathname.startsWith('/api/proxy/') || pathname.startsWith('/proxy/')) {
      const targetPath = pathname.replace(/^\/(api\/)?proxy/, '');
      const queryStr   = parsed.search || '';  // WHATWG URL .search includes '?'
      const options    = {
        hostname: 'www.udottraffic.utah.gov',
        port: 443,
        path: targetPath + queryStr,
        method: req.method,
        headers: {
          'User-Agent': 'MTS-Proxy/1.0',
          'Accept': req.headers.accept || '*/*',
          'Referer': 'https://www.udottraffic.utah.gov/',
        }
      };

      const proxyReq = https.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      });
      proxyReq.on('error', e => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: e.message }));
      });
      req.pipe(proxyReq);
      return;
    }

    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const fullPath = path.join(WEB_DIR, filePath);

    // Path traversal guard
    const resolved = path.resolve(fullPath);
    const webRoot  = path.resolve(WEB_DIR);
    if (!resolved.startsWith(webRoot + path.sep) && resolved !== webRoot) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(resolved);
      const types = {
        '.html': 'text/html',
        '.css':  'text/css',
        '.js':   'application/javascript',
        '.mjs':  'text/javascript',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.svg':  'image/svg+xml',
        '.json': 'application/json',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(data);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(c('cyan', '┌─────────────────────────────────────────────┐'));
    console.log(c('cyan', '│') + c('bold', '  MONITOR THE SITUATION — SERVER ONLINE') + c('cyan', '       │'));
    console.log(c('cyan', '├─────────────────────────────────────────────┤'));
    console.log(c('cyan', '│') + c('green', `  http://localhost:${PORT}`) + ' '.repeat(27 - String(PORT).length) + c('cyan', '│'));
    console.log(c('cyan', '│') + c('dim',   '  UDOT proxy: /proxy/<path>') + '                  ' + c('cyan', '│'));
    console.log(c('cyan', '│') + c('dim',   '  Press Ctrl+C to stop') + '                       ' + c('cyan', '│'));
    console.log(c('cyan', '└─────────────────────────────────────────────┘'));
    console.log('');

    // Auto-open browser (only in TTY unless --open forces it)
    const shouldOpen = opts.open || (process.stdout.isTTY && !opts['no-open']);
    if (shouldOpen && !process.env.NO_OPEN) {
      try { execSync(`open http://localhost:${PORT}`); }
      catch (_) {
        try { execSync(`xdg-open http://localhost:${PORT}`); } catch (_) {}
      }
    }
  });
}

// ── openclaw Agent Integration ─────────────────
// When invoked as an openclaw tool, parse the NL query
async function cmdAgent(args) {
  const query = args.join(' ').toLowerCase();

  // Route to appropriate command
  const opts = {};

  // Detect route mentions first (takes priority over area)
  const routeMatch = query.match(/\b(i-?\d+|sr-?\d+|us-?\d+|hwy\s?\d+)\b/i);
  if (routeMatch) {
    opts.route = routeMatch[0];
  } else {
    // Detect area mentions only if no route
    for (const [key, region] of Object.entries(REGIONS)) {
      if (query.includes(key) || query.includes(region.name.toLowerCase())) {
        opts.area = key;
        break;
      }
    }
  }

  // Detect weather intent
  const isWeather = /weather|condition|snow|fog|visibility|road\s?condition|icy|wet/i.test(query);

  // Detect specific camera
  const camMatch = query.match(/camera\s*#?(\d+)/i);
  if (camMatch) {
    await cmdShow([camMatch[1], '--json']);
    return;
  }

  if (isWeather) {
    await cmdWeather(['--json', ...Object.entries(opts).map(([k, v]) => `--${k}=${v}`)]);
  } else {
    await cmdCameras(['--json', ...Object.entries(opts).map(([k, v]) => `--${k}=${v}`)]);
  }
}

// ── Arg Parser ─────────────────────────────────
function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [key, ...val] = a.slice(2).split('=');
      if (val.length) {
        opts[key] = val.join('=');
      } else if (args[i+1] && !args[i+1].startsWith('--')) {
        opts[key] = args[++i];
      } else {
        opts[key] = true;
      }
    }
  }
  return opts;
}

// ── Help ───────────────────────────────────────
function printHelp() {
  console.log(`
${c('cyan', '[MTS]')} ${c('bold', 'UDOT Traffic Camera CLI')}

${c('dim', 'COMMANDS')}

  ${c('green', 'cameras')}  ${c('dim', '[options]')}
    List traffic cameras. Filter by area, route, or coordinates.

  ${c('green', 'weather')}  ${c('dim', '[options]')}
    Show webcam feeds for visual weather assessment.

  ${c('green', 'show')}  ${c('yellow', '<camera-id>')}  ${c('dim', '[options]')}
    Show a specific camera. --save <file> to save image.

  ${c('green', 'serve')}  ${c('dim', '[--port 8080]')}
    Launch web UI with CORS proxy at http://localhost:8080

  ${c('green', 'ask')}  ${c('yellow', '"<natural language query>"')}
    Agent mode: parse a natural language request.

${c('dim', 'OPTIONS')}

  ${c('yellow', '--area')}       Area name: slc, ogden, provo, stgeorge, logan, moab,
                parkcity, i15, i80, i84, i70, wasatch, utah
  ${c('yellow', '--route')}      Road/highway: I-15, SR-201, US-6, etc.
  ${c('yellow', '--lat')}        Latitude (decimal)
  ${c('yellow', '--lng')}        Longitude (decimal)
  ${c('yellow', '--radius')}     Search radius in miles (default: 20)
  ${c('yellow', '--search')}     Free-text location search
  ${c('yellow', '--limit')}      Max cameras to show (default: 20)
  ${c('yellow', '--json')}       Output as JSON (for agent/script use)
  ${c('yellow', '--open')}       Open images in browser
  ${c('yellow', '--save')} FILE  Save camera image to file
  ${c('yellow', '--no-color')}    Disable colored output (also: NO_COLOR env var)
  ${c('yellow', '--no-open')}     Suppress auto-opening browser (serve command)

${c('dim', 'EXAMPLES')}

  mts cameras --area slc
  mts cameras --area slc --route I-15 --limit 10
  mts weather --area wasatch
  mts cameras --lat 40.76 --lng -111.89 --radius 5
  mts show 55982 --open
  mts ask "show me webcam weather on I-15 near Salt Lake"
  mts serve --port 8080

${c('dim', 'OPENCLAW AGENT USE')}

  When invoked by an openclaw agent, use the 'ask' command with
  the user's natural language query. The CLI will parse it and
  return structured JSON output.

  Example tool call from agent:
    mts ask "what does traffic look like on I-80 right now"
`);
}

// ── Main ───────────────────────────────────────
async function main() {
  const [,, cmd, ...args] = process.argv;

  switch (cmd) {
    case 'cameras': await cmdCameras(args); break;
    case 'weather': await cmdWeather(args); break;
    case 'show':    await cmdShow(args);    break;
    case 'serve':   cmdServe(args);         break;
    case 'ask':     await cmdAgent(args);   break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
  }
}

main().catch(err => {
  console.error(c('red', `[ERROR] ${err.message}`));
  process.exit(1);
});
