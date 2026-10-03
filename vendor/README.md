# Vendored map libraries

Exact npm release files, checked in so a CDN outage cannot prevent the camera UI from starting:

- leaflet 1.9.4 (BSD-2-Clause), dist/leaflet.js, CSS and images.
- maplibre-gl 6.11.2 (BSD-3-Clause), production ES modules, worker and CSS.
- @maplibre/maplibre-gl-leaflet 0.1.4 (ISC), UMD Leaflet bridge.

Source: official npm registry packages. Licenses accompany each directory. No build step required.

Basemap data: OpenFreeMap Positron, https://tiles.openfreemap.org/styles/positron.
Provider supports commercial use without an account/key or per-view cap, but has no SLA.
Terms: https://openfreemap.org/tos/ . Attribution to OpenMapTiles and OpenStreetMap remains visible on the map.
