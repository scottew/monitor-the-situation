const test = require('node:test');
const assert = require('node:assert/strict');
const routing = require('../state-config');
const { normalizeCaltrans } = require('../lib/camera-adapters');
const handler = require('../api/cameras');

test('all 50 distinct states exist without invented camera records', () => {
  assert.equal(routing.states.length, 50);
  assert.equal(new Set(routing.states.map(s => s.code)).size, 50);
  assert.equal(new Set(routing.states.map(s => s.slug)).size, 50);
  assert.equal(routing.states.filter(s => s.status === 'ready').length, 3);
});
test('host routing is exact and preserves Utah', () => {
  assert.equal(routing.resolve('utah.monitorit.app', '?state=CA').code, 'UT');
  assert.equal(routing.resolve('california.monitorit.app', '').code, 'CA');
  assert.equal(routing.resolve('new-york.monitorit.app', '').code, 'NY');
  assert.equal(routing.resolve('localhost:8080', '?state=CA').code, 'CA');
  assert.equal(routing.resolve('test.vercel.app', '').code, 'UT');
  assert.equal(routing.resolve('evil.monitorit.app', ''), null);
  assert.equal(routing.resolve('utah.monitorit.app.evil.example', ''), null);
  assert.equal(routing.resolve('monitorit.app', '?state=nonsense'), null);
});
const row = { cctv: { index: '123', inService: 'true', location: { latitude: '38', longitude: '-121', locationName: 'Test fixture', route: 'I-5' }, imageData: { static: { currentImageURL: 'https://cwwp2.dot.ca.gov/test.jpg' } } } };
test('normalizer accepts expected schema and rejects invalid, off-service or unsafe images', () => {
  const rows = normalizeCaltrans({data:[row,row]},1);
  assert.equal(rows.length,1); assert.equal(rows[0].id,'ca-1-123');
  for (const modify of [r=>r.cctv.inService='false',r=>r.cctv.location.latitude='NaN',r=>r.cctv.imageData.static.currentImageURL='https://evil.example/x.jpg',r=>r.cctv.imageData.static.currentImageURL='javascript:alert(1)']) {
    const c = structuredClone(row); modify(c); assert.deepEqual(normalizeCaltrans({data:[c]},1),[]);
  }
  assert.throws(()=>normalizeCaltrans({},1));
});
function request(query, method = 'GET') {
  return new Promise(resolve => {
    const res = {setHeader(){},writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,data:JSON.parse(body)});}};
    handler({method,query},res);
  });
}
test('unknown, restricted and unverified states fail closed without Utah cameras',async()=>{
  assert.equal((await request({state:'ZZ'})).status,400);
  for (const state of ['NY','AR','AL','ND']) {
    const r=await request({state}); assert.equal(r.status,503); assert.equal(r.data.code,'SOURCE_NOT_ENABLED'); assert.equal(r.data.cameras,undefined);
  }
  assert.equal((await request({state:'CA'},'POST')).status,405);
});
test('district failures are disclosed and do not discard healthy records',async()=>{
  const {SOURCES}=require('../lib/camera-adapters');
  const result=await SOURCES.CA.load(async url=>{
    if(url.includes('/d2/'))throw new Error('offline');
    return {data:[row]};
  });
  assert.equal(result.cameras.length,11); assert.equal(result.partial,true);
  assert.deepEqual(result.unavailableDistricts,[2]);
  await assert.rejects(SOURCES.CA.load(async()=>{throw new Error('offline');}));
});
test('API caches successful manifests and retains source provenance',async()=>{
  const {SOURCES}=require('../lib/camera-adapters');
  const original=SOURCES.CA.load; let calls=0;
  SOURCES.CA.load=async()=>{calls++; return {cameras:normalizeCaltrans({data:[row]},1),partial:false,unavailableDistricts:[]};};
  try {
    const [a,b]=await Promise.all([request({state:'CA'}),request({state:'california'})]);
    assert.equal(a.status,200); assert.equal(b.status,200); assert.equal(calls,1);
    assert.equal(a.data.state,'CA'); assert.equal(a.data.source.name,'Caltrans');
    assert.equal(a.data.stale,false); assert.ok(a.data.fetchedAt);
    assert.equal((await request({state:'CA'})).status,200); assert.equal(calls,1);
  } finally {SOURCES.CA.load=original;}
});
