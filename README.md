# [MTS] — Monitor the Situation

A command-center dashboard and CLI for monitoring UDOT traffic cameras across Utah.

## Quick Start

```bash
cd monitor-the-situation
node cli/mts-cli.js serve
```

Then open http://localhost:8080

> The web app requires the local proxy server to resolve CORS restrictions on the UDOT API.

---

## Web UI Features

- Utah map (Leaflet / OpenFreeMap) with live camera pins
- **Browse mode**: pan/zoom to filter cameras by viewport
- **Quick select**: SLC, Ogden, Provo, St. George, Logan, All Utah
- **Route / text search** filters
- **Grid controls**: 1–20 columns (up to 20×20 = 400 feeds), plus a readable list view
- **Pop-out modal**: click any camera; `←` `→` arrow keys to navigate, `ESC` to close
- **Auto-refresh**: 30s / 60s / 2m / 5m intervals
- **Keyboard shortcuts**: `F` focus search · `R` refresh all · `ESC` reset

---

## CLI Usage

```bash
# List cameras by area
node cli/mts-cli.js cameras --area slc
node cli/mts-cli.js cameras --area wasatch --limit 20
node cli/mts-cli.js cameras --area slc --route I-15

# By coordinates + radius
node cli/mts-cli.js cameras --lat 40.76 --lng -111.89 --radius 5

# Visual weather assessment
node cli/mts-cli.js weather --area slc
node cli/mts-cli.js weather --area i80

# Show/open a specific camera
node cli/mts-cli.js show 55982 --open
node cli/mts-cli.js show 55982 --save cam.jpg

# JSON output (for scripting/agents)
node cli/mts-cli.js cameras --area provo --json

# Natural language (agent mode)
node cli/mts-cli.js ask "show me webcam weather on I-15 near Salt Lake"
node cli/mts-cli.js ask "cameras near ogden"
```

### Known Areas

| Key       | Name              |
|-----------|-------------------|
| slc       | Salt Lake City    |
| ogden     | Ogden             |
| provo     | Provo/Orem        |
| stgeorge  | St. George        |
| logan     | Logan             |
| moab      | Moab              |
| parkcity  | Park City         |
| i15       | I-15 Corridor     |
| i80       | I-80 Corridor     |
| i84       | I-84 Corridor     |
| i70       | I-70 Corridor     |
| wasatch   | Wasatch Front     |
| utah      | All Utah          |

---

## openclaw Agent Integration

`cli/mts-openclaw-tool.js` exports a tool schema (Claude `tool_use` format) and executor for openclaw agents.

```javascript
const { TOOL_SCHEMA, executeTool, formatCameraResult } = require('./cli/mts-openclaw-tool');

const result = executeTool({ query_type: 'weather', area: 'slc' });
console.log(formatCameraResult(result));
```

Agent natural language examples:
- `"what do road conditions look like on I-15 right now"`
- `"show me cameras near Provo"`
- `"I-80 weather conditions"`

---

## Data Source

UDOT public traffic API at [udottraffic.utah.gov](https://www.udottraffic.utah.gov). No API key required.

- Camera positions: `/map/mapIcons/Cameras` (~2,000+ cameras statewide)
- Camera images: `/map/Cctv/{id}` (JPEG, ~1280×720, refreshed every ~60s)

---

## Project Structure

```
monitor-the-situation/
├── index.html
├── style.css
├── app.js
├── package.json
└── cli/
    ├── mts-cli.js            CLI (cameras, weather, show, serve, ask)
    ├── mts-openclaw-tool.js  openclaw agent integration
    └── package.json
```

## Map, mobile and camera sharing update

- Basemap: OpenFreeMap Positron through MapLibre and Leaflet. No account, key, or paid plan is needed. Required OpenMapTiles / OpenStreetMap attribution is visible. The service is free including commercial use, but provided without an availability guarantee: [provider](https://openfreemap.org/), [terms](https://openfreemap.org/tos/).
- Mapping libraries are vendored with their licenses so external script-CDN outages cannot stop the camera list. If WebGL or tiles fail, the list, search and camera sharing remain usable.
- Phones start with a readable camera list, preserve grid density while moving the map, and use larger controls. The MAP / FEEDS button switches views.
- Open a camera and choose SHARE. Supported devices use their native share sheet; other browsers offer copy-link with a selectable URL fallback. A URL with `?camera=ID` opens the camera after its state's manifest loads. Browser Back closes the camera; Forward restores it.
- Camera names, roads and IDs are searchable. Image timestamps marked “Loaded” show browser retrieval time, not verified source freshness.
- The state registry and California, Iowa and Oregon adapters are described in [state rollout](docs/STATE-ROLLOUT.md). New subdomain links remain disabled until hosting/DNS is verified.

### Development checks

Node 18+ is required by the application. Install test-only dependencies and run:

```sh
npm install
npm test
npm run check
```

Tests use a DOM environment and real Leaflet viewport events. They cover camera sharing/history, mobile density, safe rendering, unavailable-map fallbacks, malformed or empty manifests and state isolation. These checks do not replace visual checks in a WebGL-capable browser against a deployed preview.

### Server security boundaries

Local `serve` binds to `127.0.0.1` by default. To intentionally expose the viewer to your network, supply an explicit IP with `--host` (for example `--host 0.0.0.0`). This is a public camera viewer, not an authenticated administration service. Local static serving is restricted to app assets; hidden files, repository metadata, source/configuration files and symlinks are denied, with no wildcard CORS.

The Utah proxy accepts only the camera manifest and numeric camera-image paths, permits GET only, bounds response size and elapsed request time, validates status/content, and coalesces manifest requests. Compressed responses have a decompressed-size cap. Historical public diagnostics are disabled; camera names reuse the public manifest rather than probing user lists. Browser-launch commands use argument arrays instead of a shell.

Automated tests cover these boundaries, but are not a penetration-test guarantee. Deployment protection, platform permissions, provider availability and a browser-level visual check remain separate requirements.

### Basic map fallback

When WebGL2 is unavailable or the vector renderer cannot initialize, a Leaflet raster layer requests only the current viewport from OpenStreetMap's standard tile service. It uses the canonical HTTPS tile URL, visible attribution, an origin Referer, and normal browser HTTP caching. It has no tile proxy, cache-busting, offline download, bulk download, or prefetch feature; the retained tile buffer is zero. This community service has limited capacity and no SLA. Heavy usage may be blocked without notice, so a larger deployment should arrange a suitable provider before relying on it. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and [OSMF terms](https://wiki.osmfoundation.org/wiki/Terms_of_Use).
