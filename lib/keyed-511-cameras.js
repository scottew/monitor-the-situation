'use strict';

// Prepared integrations only. API access does not itself establish image reuse
// permission. AZ/GA documentation invites camera traffic apps; WI needs written
// consent. All shared-quota/live-activation gates remain closed.
const PROVIDERS = Object.freeze({
  AZ: { code: 'AZ', name: 'Arizona DOT', host: 'az511.com', env: 'MTS_AZ_511_API_KEY', bounds: [31, 38, -115, -108], reuseApproved: true, sharedQuotaReady: false,
    url: 'https://www.az511.gov/help/endpoint/cameras' },
  GA: { code: 'GA', name: 'Georgia DOT', host: '511ga.org', env: 'MTS_GA_511_API_KEY', bounds: [30, 36, -86, -80], reuseApproved: true, sharedQuotaReady: false,
    url: 'https://511ga.org/help/endpoint/cameras' },
  WI: { code: 'WI', name: 'Wisconsin DOT', host: '511wi.gov', env: 'MTS_WI_511_API_KEY', bounds: [42, 48, -94, -86], reuseApproved: false, sharedQuotaReady: false,
    url: 'https://511wi.gov/help/endpoint/cameras' },
});
const FRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
function unavailable(code) {
  const error = new Error('Camera source is not available.');
  error.code = code;
  return error;
}
function id(value) { return /^(0|[1-9][0-9]{0,11})$/.test(String(value)) ? String(value) : null; }

function normalize511(data, provider, credential = '') {
  if (!Array.isArray(data) || data.length > 20000) throw unavailable('SOURCE_UNAVAILABLE');
  const seen = new Set();
  const cameras = [];
  for (const row of data) {
    if (!row || row.Latitude == null || row.Longitude == null || !id(row.Id)) continue;
    const lat = Number(row.Latitude), lng = Number(row.Longitude);
    const [south, north, west, east] = provider.bounds;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < south || lat > north || lng < west || lng > east) continue;
    for (const view of Array.isArray(row.Views) ? row.Views.slice(0, 100) : []) {
      if (!view || view.Status !== 'Enabled' || !id(view.Id)) continue;
      let url;
      try { url = new URL(view.Url); } catch (_) { continue; }
      // No userinfo, query tokens, fragments, alternate ports, videos or arbitrary
      // hosts. Do not strip credentials and hope the remaining URL is public.
      if (url.protocol !== 'https:' || url.hostname !== provider.host || url.port || url.username || url.password || url.search || url.hash ||
          url.pathname !== `/map/Cctv/${view.Id}`) continue;
      const camera = { id: `${provider.code.toLowerCase()}-${row.Id}-${view.Id}`, lat, lng,
        location: String(view.Description || row.Location || row.Name || `Camera ${row.Id}`).slice(0, 300),
        roadway: String(row.Roadway || '').slice(0, 100), imgUrl: url.href,
        refreshSeconds: 300, source: provider.name };
      // Guard against a provider reflecting the API key into otherwise public fields.
      if (credential && JSON.stringify(camera).includes(credential)) continue;
      if (seen.has(camera.id)) continue;
      seen.add(camera.id); cameras.push(camera);
    }
  }
  if (!cameras.length) throw unavailable('SOURCE_UNAVAILABLE');
  return { cameras, partial: false };
}

function create511Source(provider, { env = process.env, now = Date.now } = {}) {
  let cached, inFlight, nextAttempt = 0;
  return {
    name: provider.name, url: provider.url, termsUrl: provider.url,
    attribution: `Camera images and data provided by ${provider.name}. Availability and image age vary.`,
    cacheTtlMs: FRESH_MS, staleTtlMs: 30 * 60 * 1000,
    isEnabled: () => provider.reuseApproved === true && provider.sharedQuotaReady === true,
    async load(fetchJson) {
      if (!provider.reuseApproved || !provider.sharedQuotaReady) throw unavailable('SOURCE_NOT_ENABLED');
      const key = env[provider.env];
      if (typeof key !== 'string' || !key.trim() || key.length > 1024) throw unavailable('SOURCE_NOT_CONFIGURED');
      if (cached && now() - cached.at < FRESH_MS) return cached.result;
      if (inFlight) return inFlight;
      if (now() < nextAttempt) {
        throw unavailable('SOURCE_UNAVAILABLE');
      }
      nextAttempt = now() + RETRY_MS;
      inFlight = Promise.resolve().then(async () => {
        try {
          const url = new URL(`https://${provider.host}/api/v2/get/cameras`);
          url.searchParams.set('key', key); url.searchParams.set('format', 'json');
          const result = normalize511(await fetchJson(url.href), provider, key);
          cached = { at: now(), result };
          return result;
        } catch (_) {
          // Never expose transport messages, URLs, response bodies or credentials.
          throw unavailable('SOURCE_UNAVAILABLE');
        } finally { inFlight = null; }
      });
      return inFlight;
    },
  };
}
const PREPARED_SOURCES = Object.fromEntries(Object.entries(PROVIDERS).map(([code, provider]) => [code, create511Source(provider)]));
module.exports = { PROVIDERS, PREPARED_SOURCES, create511Source, normalize511 };
