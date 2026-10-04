'use strict';

// Only explicitly reviewed sources belong in this registry. Public viewing alone
// does not establish permission to redistribute a camera feed.
const SOURCES = {
  ...require('./state-snapshots').SNAPSHOT_SOURCES,
  IA: require('./iowa-cameras'),
  OR: require('./oregon-cameras'),
  CA: {
    name: 'Caltrans',
    url: 'https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm',
    termsUrl: 'https://dot.ca.gov/conditions-of-use',
    attribution: 'Traffic camera images and data provided by Caltrans. Availability and image age vary.',
    async load(fetchJson) {
      const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => {
        const district = i + 1;
        return fetchJson(`https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${String(district).padStart(2, '0')}.json`)
          .then(data => normalizeCaltrans(data, district));
      }));
      const cameras = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      const unavailableDistricts = results.flatMap((r, i) => r.status === 'rejected' ? [i + 1] : []);
      if (!cameras.length) throw new Error('No in-service Caltrans camera images are currently available.');
      return { cameras, partial: unavailableDistricts.length > 0, unavailableDistricts };
    },
  },
};

function normalizeCaltrans(data, district) {
  if (!data || !Array.isArray(data.data)) throw new Error('Invalid Caltrans manifest.');
  const seen = new Set();
  return data.data.flatMap(row => {
    const c = row && row.cctv;
    if (!c || String(c.inService).toLowerCase() !== 'true') return [];
    const loc = c.location || {};
    const lat = Number(loc.latitude), lng = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 43 || lng < -125 || lng > -113) return [];
    const value = c.imageData && c.imageData.static && c.imageData.static.currentImageURL;
    let url;
    try { url = new URL(value); } catch (_) { return []; }
    // Caltrans-controlled HTTPS images only; no arbitrary upstream proxy.
    if (url.protocol !== 'https:' || url.username || url.password ||
        !(url.hostname === 'dot.ca.gov' || url.hostname.endsWith('.dot.ca.gov'))) return [];
    const index = String(c.index || '');
    if (!/^[\w-]+$/.test(index)) return [];
    const id = `ca-${district}-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const image = c.imageData.static;
    return [{ id, lat, lng, location: String(loc.locationName || `CAM-${id}`).slice(0, 300),
      roadway: String(loc.route || '').slice(0, 100), imgUrl: url.href,
      refreshSeconds: Math.max(15, Number(image.currentImageUpdateFrequency) || 60),
      source: 'Caltrans', district }];
  });
}

async function fetchJson(url, accept = 'application/json') {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: accept } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/json|text\/plain|(?:application|text)\/javascript/i.test(contentType)) throw new Error('Source did not return JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Source manifest exceeds size limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

module.exports = { SOURCES, normalizeCaltrans, fetchJson };
