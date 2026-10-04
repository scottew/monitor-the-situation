'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDERS, PREPARED_SOURCES, normalize511, create511Source } = require('../lib/keyed-511-cameras');
const row = (code = 'AZ') => ({ Id: 2056, Latitude: { AZ: 35.17, GA: 33.7, WI: 44.3 }[code],
  Longitude: { AZ: -114.56, GA: -84.4, WI: -88.4 }[code], Location: 'Example highway', Roadway: 'SR-95',
  Views: [{ Id: 960, Url: `https://${PROVIDERS[code].host}/map/Cctv/960`, Status: 'Enabled', Description: 'Northbound' }] });
const approvedFixture = { ...PROVIDERS.AZ, reuseApproved: true, sharedQuotaReady: true };
const fakeEnv = { MTS_AZ_511_API_KEY: 'SYNTHETIC_TEST_CREDENTIAL_NOT_REAL' };

test('all prepared providers remain gated without reading credentials or contacting sources', async () => {
  for (const code of ['AZ', 'GA', 'WI']) {
    assert.equal(PREPARED_SOURCES[code].isEnabled(), false);
    const env = new Proxy({}, { get() { throw new Error('Must not read env'); } });
    await assert.rejects(create511Source(PROVIDERS[code], { env }).load(() => assert.fail('Must not fetch')), { code: 'SOURCE_NOT_ENABLED' });
  }
  const source = create511Source({ ...PROVIDERS.AZ, reuseApproved: true }, { env: fakeEnv });
  await assert.rejects(source.load(() => assert.fail('Quota gate must block')), { code: 'SOURCE_NOT_ENABLED' });
});
test('missing key fails closed with no network or credential disclosure', async () => {
  await assert.rejects(create511Source(approvedFixture, { env: {} }).load(() => assert.fail('Must not fetch')), { code: 'SOURCE_NOT_CONFIGURED' });
});
test('documented AZ, GA and WI camera shapes yield stable snapshot view IDs only', () => {
  for (const code of ['AZ', 'GA', 'WI']) {
    const sample = row(code);
    sample.Views[0].VideoUrl = 'https://example.invalid/video.m3u8';
    const result = normalize511([sample, sample], PROVIDERS[code]);
    assert.equal(result.cameras.length, 1);
    assert.equal(result.cameras[0].id, `${code.toLowerCase()}-2056-960`);
    assert.equal(result.cameras[0].refreshSeconds, 300);
    assert.equal(JSON.stringify(result).includes('VideoUrl'), false);
  }
});
test('unsafe or credential-bearing media, invalid coordinates and disabled views are rejected', () => {
  for (const mutate of [
    r => r.Views[0].Url += '?key=secret', r => r.Views[0].Url += '#token',
    r => r.Views[0].Url = 'https://evil.example/map/Cctv/960',
    r => r.Views[0].Url = 'https://user:secret@az511.com/map/Cctv/960',
    r => r.Views[0].Url = 'http://az511.com/map/Cctv/960',
    r => r.Views[0].Url = 'https://az511.com/map/Cctv/961',
    r => r.Latitude = null, r => r.Longitude = 0,
    r => r.Views[0].Status = 'Disabled', r => r.Id = '../key',
    r => r.Views[0].Description = fakeEnv.MTS_AZ_511_API_KEY,
  ]) {
    const sample = row(); mutate(sample);
    assert.throws(() => normalize511([sample], PROVIDERS.AZ, fakeEnv.MTS_AZ_511_API_KEY), { code: 'SOURCE_UNAVAILABLE' });
  }
  assert.throws(() => normalize511({ error: 'bad key' }, PROVIDERS.AZ));
});
test('coalescing and five-minute success cache bound requests within one runtime', async () => {
  let calls = 0, at = 100000;
  const source = create511Source(approvedFixture, { env: fakeEnv, now: () => at });
  const fetcher = async raw => {
    calls++;
    const url = new URL(raw);
    assert.equal(url.origin, 'https://az511.com');
    assert.equal(url.pathname, '/api/v2/get/cameras');
    assert.equal(url.searchParams.get('key'), fakeEnv.MTS_AZ_511_API_KEY);
    return [row()];
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => source.load(fetcher)));
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(results).includes(fakeEnv.MTS_AZ_511_API_KEY), false);
  at += 299999; await source.load(fetcher); assert.equal(calls, 1);
  at += 1; await source.load(fetcher); assert.equal(calls, 2);
});
test('source failures are redacted and retries are throttled, including synchronous failures', async () => {
  let calls = 0, at = 100000;
  const source = create511Source(approvedFixture, { env: fakeEnv, now: () => at });
  const fail = () => { calls++; throw new Error(`https://az511.com/?key=${fakeEnv.MTS_AZ_511_API_KEY}`); };
  for (let i = 0; i < 3; i++) {
    await assert.rejects(source.load(fail), error => error.code === 'SOURCE_UNAVAILABLE' && !String(error).includes('key='));
  }
  assert.equal(calls, 1);
  at += 60000;
  await assert.rejects(source.load(fail)); assert.equal(calls, 2);
});
