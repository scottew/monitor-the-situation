'use strict';
const { PROVIDERS, normalize511 } = require('./keyed-511-cameras');
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const SNAPSHOT_ROOT = 'https://raw.githubusercontent.com/scottew/monitor-the-situation/camera-data';

function validateLedger(value, code, now) {
  if (!PROVIDERS[code] || !Number.isSafeInteger(now) || now <= 0 || value?.schemaVersion !== 1 || !value.states) throw new Error('Invalid refresh ledger.');
  const previous = value.states[code]?.lastAttemptMs;
  if (!Number.isSafeInteger(previous) || previous < 0 || previous > now) throw new Error('Invalid refresh clock or ledger.');
  if (previous && now - previous < INTERVAL_MS) throw new Error('Refresh interval has not elapsed.');
  // Copy only known fields. No request, provider or credential metadata belongs here.
  const states = {};
  for (const state of Object.keys(PROVIDERS)) {
    const at = value.states[state]?.lastAttemptMs;
    if (!Number.isSafeInteger(at) || at < 0 || at > now) throw new Error('Invalid refresh ledger.');
    states[state] = { lastAttemptMs: state === code ? now : at };
  }
  return { schemaVersion: 1, states };
}

async function refreshSnapshot({ code, store, fetchJson, env, now = Date.now }) {
  const provider = PROVIDERS[code];
  if (!provider?.reuseApproved) throw new Error('Source reuse is not enabled.');
  return refreshApprovedSnapshot({ provider, store, fetchJson, env, now });
}

// The store must implement compare-and-swap writes. The real implementation uses
// non-forced Git pushes; the workflow also serializes all source jobs.
async function refreshApprovedSnapshot({ provider, store, fetchJson, env, now = Date.now }) {
  if (!provider.reuseApproved) throw new Error('Source reuse is not enabled.');
  const credential = env?.[provider.env];
  if (typeof credential !== 'string' || !credential.trim() || credential.length > 1024) throw new Error('Source is not configured.');
  const started = now();
  const previous = await store.read();
  const ledger = validateLedger(previous.ledger, provider.code, started);
  const reservation = await store.reserve(previous.version, ledger);
  if (!reservation) throw new Error('Could not reserve source refresh.');
  if (now() < started || now() - started > 60000) throw new Error('Refresh clock changed.');
  const { create511Source } = require('./keyed-511-cameras');
  const source = create511Source({ ...provider, sharedQuotaReady: true }, { env, now });
  const result = await source.load(fetchJson);
  if (now() < started) throw new Error('Refresh clock changed.');
  const snapshot = { schemaVersion: 1, state: provider.code, fetchedAt: new Date(now()).toISOString(), cameras: result.cameras };
  const key = env[provider.env];
  if (key && JSON.stringify(snapshot).includes(key)) throw new Error('Snapshot rejected.');
  await store.publish(reservation, provider.code, snapshot);
  return { state: provider.code, count: snapshot.cameras.length };
}

function normalizeSnapshot(value, provider, now = Date.now()) {
  const at = Date.parse(value?.fetchedAt);
  if (value?.schemaVersion !== 1 || value.state !== provider.code || !Number.isFinite(at) || at > now || now - at > MAX_AGE_MS || !Array.isArray(value.cameras)) throw new Error('Camera directory unavailable.');
  const rows = value.cameras.flatMap(camera => {
    const match = String(camera?.id || '').match(new RegExp(`^${provider.code.toLowerCase()}-([0-9]+)-([0-9]+)$`));
    if (!match) return [];
    return [{ Id: match[1], Latitude: camera.lat, Longitude: camera.lng, Roadway: camera.roadway, Location: camera.location,
      Views: [{ Id: match[2], Status: 'Enabled', Url: camera.imgUrl, Description: camera.location }] }];
  });
  const result = normalize511(rows, provider);
  return { ...result, sourceFetchedAt: value.fetchedAt, expiresAt: new Date(at + MAX_AGE_MS).toISOString(), stale: now - at > INTERVAL_MS };
}
const SNAPSHOT_SOURCES = Object.fromEntries(Object.entries(PROVIDERS).map(([code, provider]) => [code, {
  name: provider.name, url: provider.url, termsUrl: provider.url,
  attribution: `Camera images and data provided by ${provider.name}. Availability and image age vary.`,
  cacheTtlMs: 60000, staleTtlMs: 5 * 60000,
  isEnabled: () => provider.reuseApproved && provider.sharedQuotaReady,
  async load(fetchJson) { return normalizeSnapshot(await fetchJson(`${SNAPSHOT_ROOT}/${code}.json`), provider); },
}]));
module.exports = { INTERVAL_MS, MAX_AGE_MS, validateLedger, refreshSnapshot, refreshApprovedSnapshot, normalizeSnapshot, SNAPSHOT_SOURCES };
