'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateLedger, refreshApprovedSnapshot, normalizeSnapshot, SNAPSHOT_SOURCES, INTERVAL_MS, MAX_AGE_MS } = require('../lib/state-snapshots');
const { PROVIDERS } = require('../lib/keyed-511-cameras');
const provider = { ...PROVIDERS.AZ, reuseApproved: true };
const env = { MTS_AZ_511_API_KEY: 'SYNTHETIC_SNAPSHOT_TEST_KEY' };
const ledger = () => ({ schemaVersion: 1, states: { AZ: { lastAttemptMs: 0 }, GA: { lastAttemptMs: 0 }, WI: { lastAttemptMs: 0 } } });
const rows = [{ Id: 1, Latitude: 35, Longitude: -112, Location: 'Example', ContactEmail: 'not-for-publication@example.invalid', Views: [{ Id: 2, Status: 'Enabled', Url: 'https://az511.com/map/Cctv/2', Description: 'View' }] }];
function memoryStore() {
  let version = 0, value = ledger(), published;
  return {
    async read() { return { version, ledger: structuredClone(value) }; },
    async reserve(expected, next) { if (expected !== version) throw new Error('Conflict'); value = next; return ++version; },
    async publish(expected, state, snapshot) { assert.equal(expected,version); published = snapshot; },
    snapshot: () => published,
  };
}
test('ledger rejects missing state, invalid clocks, future attempts and too-frequent requests', () => {
  assert.throws(() => validateLedger({}, 'AZ', 1000));
  assert.throws(() => validateLedger(ledger(), 'ZZ', 1000));
  assert.throws(() => validateLedger(ledger(), 'AZ', NaN));
  const recent = ledger(); recent.states.AZ.lastAttemptMs = 10000;
  assert.throws(() => validateLedger(recent, 'AZ', 9999));
  assert.throws(() => validateLedger(recent, 'AZ', 10001));
  assert.equal(validateLedger(recent, 'AZ', 10000 + INTERVAL_MS).states.AZ.lastAttemptMs,10000 + INTERVAL_MS);
});
test('failed durable reservation prevents all keyed API calls', async () => {
  const store = memoryStore(); store.reserve = async () => { throw new Error('Write failed'); };
  await assert.rejects(refreshApprovedSnapshot({ provider, env, store, now: () => 100000000, fetchJson: () => assert.fail('No fetch before reservation') }));
  assert.equal(store.snapshot(),undefined);
});
test('concurrent refreshes share a durable reservation and only one reaches provider', async () => {
  const store = memoryStore(); let calls = 0;
  const options = { provider, env, store, now: () => 100000000, fetchJson: async () => { calls++; return rows; } };
  const results = await Promise.allSettled([refreshApprovedSnapshot(options),refreshApprovedSnapshot(options)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(calls,1);
  assert.equal(JSON.stringify(store.snapshot()).includes('ContactEmail'),false);
  assert.equal(JSON.stringify(store.snapshot()).includes(env.MTS_AZ_511_API_KEY),false);
  await assert.rejects(refreshApprovedSnapshot(options)); assert.equal(calls,1);
});
test('source failure consumes the durable attempt window without publishing', async () => {
  const store = memoryStore(); let calls = 0;
  const options = { provider, env, store, now: () => 100000000, fetchJson: async () => { calls++; throw new Error('Unavailable'); } };
  await assert.rejects(refreshApprovedSnapshot(options));
  await assert.rejects(refreshApprovedSnapshot(options));
  assert.equal(calls,1); assert.equal(store.snapshot(),undefined);
});
test('clock change after reservation fails closed before source fetch', async () => {
  const ticks=[100000000,99999999];
  await assert.rejects(refreshApprovedSnapshot({provider,env,store:memoryStore(),now:()=>ticks.shift(),fetchJson:()=>assert.fail('Must not fetch')}));
});
test('public snapshot read uses no credential and preserves actual source timestamp/staleness', async () => {
  const store=memoryStore();
  await refreshApprovedSnapshot({provider,env,store,now:()=>100000000,fetchJson:async()=>rows});
  const snapshot=store.snapshot();
  const result=normalizeSnapshot(snapshot,provider,100000001);
  assert.equal(result.stale,false); assert.equal(result.sourceFetchedAt,snapshot.fetchedAt);
  assert.equal(normalizeSnapshot(snapshot,provider,100000000+INTERVAL_MS+1).stale,true);
  assert.throws(()=>normalizeSnapshot(snapshot,provider,100000000+MAX_AGE_MS+1));
  assert.throws(()=>normalizeSnapshot(snapshot,provider,99999999));
  snapshot.cameras[0].imgUrl+='?key=secret';
  assert.throws(()=>normalizeSnapshot(snapshot,provider,100000001));
  for(const source of Object.values(SNAPSHOT_SOURCES)) assert.equal(source.isEnabled(),false);
});
