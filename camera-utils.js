/* Shared, pure helpers for camera URLs and untrusted manifests. */
(function (root) {
  'use strict';
  const api = {
    imageUrl(url, timestamp, base = 'https://utah.monitorit.app/') {
      const result = new URL(url, base);
      if (!['http:', 'https:'].includes(result.protocol)) throw new Error('Invalid image URL');
      result.searchParams.set('_t', String(timestamp));
      return result.href;
    },
    cameraUrl(href, id) {
      const url = new URL(href);
      url.searchParams.set('camera', String(id));
      url.hash = '';
      return url.href;
    },
    normaliseCameras(items) {
      if (!Array.isArray(items)) throw new Error('Camera service returned an invalid manifest');
      const seen = new Set();
      return items.filter(cam => {
        if (!cam || cam.id == null || !String(cam.id) || seen.has(String(cam.id))) return false;
        if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lng) || Math.abs(cam.lat) > 90 || Math.abs(cam.lng) > 180) return false;
        try { if (!['http:', 'https:'].includes(new URL(cam.imgUrl, 'https://example.com').protocol)) return false; } catch (_) { return false; }
        seen.add(String(cam.id));
        return true;
      }).map(cam => ({ ...cam, id: String(cam.id), location: String(cam.location || `CAM-${cam.id}`), roadway: String(cam.roadway || '') }));
    },
    defaultGridSize(width) { return width <= 600 ? 2 : 5; },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTSCameraUtils = api;
})(typeof window === 'object' ? window : globalThis);
