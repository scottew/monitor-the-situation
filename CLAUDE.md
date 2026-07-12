# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Monitor the Situation (MTS)** — a dashboard and CLI for monitoring UDOT (Utah DOT) traffic cameras. Vanilla HTML/CSS/JS frontend (no framework, no build step, no `node_modules`), plain Node.js (>=18) CLI and serverless functions. Deployed to Vercel. Data comes from UDOT's public traffic API at `udottraffic.utah.gov` (no API key).

`BUILD-NOTES.md` is the authoritative reference: architecture decisions, the full UDOT API reference (section 5), Vercel deployment lessons (section 6), and a "Pitfalls to Avoid" list (section 8). Read it before making non-trivial changes.

## Commands

There is no build step, no linter, and no test suite.

```bash
# Run the app locally (local dev server + UDOT proxy) — then open http://localhost:8080
node cli/mts-cli.js serve        # or: npm start / npm run serve

# CLI queries
node cli/mts-cli.js cameras --area slc [--route I-15] [--limit 20] [--json]
node cli/mts-cli.js cameras --lat 40.76 --lng -111.89 --radius 5
node cli/mts-cli.js weather --area i80
node cli/mts-cli.js show <cameraId> [--open] [--save cam.jpg]
node cli/mts-cli.js ask "cameras near ogden"   # natural-language agent mode
```

`api/test.js` is a diagnostic endpoint (`/api/test` when deployed) that reports whether UDOT is reachable and how the proxy parsed the request.

## Architecture

Two parallel stacks share the same UDOT endpoints and the same `/api/proxy` URL prefix:

```
Browser (index.html + app.js + style.css)
  → /api/proxy/<path>
    → local dev:  http server inside cli/mts-cli.js `serve`
    → production: vercel.json rewrite → api/udot.js serverless function
      → https://www.udottraffic.utah.gov/<path>

CLI (cli/mts-cli.js) → hits UDOT directly server-side (no CORS problem)
```

- **The proxy is mandatory for the browser.** UDOT sends no CORS headers; direct browser fetches fail. `cli/mts-cli.js serve` replicates Vercel's routing locally so the frontend constant `PROXY_PFX = '/api/proxy'` works identically in both environments.
- **vercel.json rewrite** passes the UDOT path as a query param (`/api/proxy/:path*` → `/api/udot?p=/:path*`) because Vercel functions don't get catch-all path params cleanly.
- **Key UDOT endpoints** (the only unauthenticated ones): `GET /map/mapIcons/Cameras` (manifest of ~2,000 cameras, positions in the `item2` array) and `GET /map/Cctv/{id}` (JPEG snapshot, refreshes ~30s). Camera names come separately from `/Camera/GetUserCameras?listId={n}`, aggregated by `api/camnames.js` — `item2[].title` is always empty, don't use it.
- **api/udot.js resilience**: sends full browser-like headers (including `sec-fetch-site: same-origin` — UDOT's WAF checks them); validates that responses actually start with `{`/`[` before JSON-parsing (the WAF returns HTTP 200 with an HTML body); module-level cache with 10-min TTL / 60-min stale-while-revalidate serves stale data on WAF blocks. Images are proxied directly and never cached server-side (memory).
- **app.js** is a single file with all state in one module-level `state` object (no browser module system). Flow: `init()` → `loadCameras()` (with retries — the manifest occasionally returns zero cameras) → `renderGrid()` N×N grid + `addMapMarkers()` on a Leaflet map (CartoDB Positron tiles, dark theme via CSS `filter: invert(1) hue-rotate(180deg)`). Viewport/circle/route/text filtering runs through `applyFilters()`; camera-name enrichment is fire-and-forget in the background.
- **api/presence.js**: live-viewer counter via Upstash Redis REST (needs `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars; degrades to no-op without them).
- **cli/mts-openclaw-tool.js**: exports `TOOL_SCHEMA` (Claude `tool_use` format), `executeTool`, and `formatCameraResult` for agent integration; it shells out to `mts-cli.js`.
- Known area keys (slc, ogden, provo, stgeorge, logan, moab, parkcity, i15, i80, i84, i70, wasatch, utah) are defined in `cli/mts-cli.js` and documented in README.md.

## Pitfalls (condensed from BUILD-NOTES.md section 8)

- Never trust UDOT HTTP status for JSON detection — check `text.trimStart().startsWith('{')`.
- Retry an empty `item2` manifest (up to 3 times, backoff) — valid-but-empty responses happen.
- Don't cache camera images server-side; use `loading="lazy"` on grid images; cache-bust with `?_t={timestamp}`.
- Leaflet: guard programmatic `setView`/`fitBounds` with the `programmaticMove` flag or `moveend` handlers loop infinitely; call `map.invalidateSize()` (with ~50ms delay) after any layout change, including mobile view toggles.
- Radius filtering uses `haversine()`, not a bounding box.
