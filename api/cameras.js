'use strict';
const { get } = require('../state-config');
const { SOURCES, fetchJson } = require('../lib/camera-adapters');
const cache = new Map();
const inFlight = new Map();
const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=30, s-maxage=60' : 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

module.exports = async function cameras(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  const selected = get(req.query && req.query.state);
  if (!selected) return send(res, 400, { error: 'A valid state code or slug is required.', code: 'INVALID_STATE' });
  const source = SOURCES[selected.code];
  if (!source || (source.isEnabled && !source.isEnabled())) return send(res, 503, {
    error: selected.status === 'restricted' ? 'This source is not enabled because its reuse terms restrict integration.' :
      'Camera integration for this state has not yet been verified and enabled.',
    code: 'SOURCE_NOT_ENABLED', state: selected.code, sourceUrl: selected.sourceUrl || null,
  });
  const candidate = cache.get(selected.code);
  const previous = candidate && (!candidate.data.expiresAt || Date.parse(candidate.data.expiresAt) > Date.now()) ? candidate : null;
  if (previous && Date.now() - previous.at < (source.cacheTtlMs || FRESH_MS)) return send(res, 200, { ...previous.data });
  try {
    if (!inFlight.has(selected.code)) {
      inFlight.set(selected.code, source.load(fetchJson).then(result => {
        const data = { state: selected.code, source: { name: source.name, url: source.url,
          termsUrl: source.termsUrl, licenseUrl: source.licenseUrl || null, attribution: source.attribution }, ...result,
          fetchedAt: result.sourceFetchedAt || new Date().toISOString(), stale: result.stale === true };
        cache.set(selected.code, { at: Date.now(), data });
        return data;
      }).finally(() => inFlight.delete(selected.code)));
    }
    return send(res, 200, await inFlight.get(selected.code));
  } catch (error) {
    if (previous && Date.now() - previous.at < (source.staleTtlMs || STALE_MS)) {
      return send(res, 200, { ...previous.data, stale: true, warning: 'Source unavailable; showing an older camera directory. Images may also be unavailable.' });
    }
    return send(res, 503, { error: 'The camera source is temporarily unavailable. Please try again later.',
      code: 'SOURCE_UNAVAILABLE', state: selected.code, sourceUrl: source.url });
  }
};
