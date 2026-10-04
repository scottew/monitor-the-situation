const test = require('node:test');
const assert = require('node:assert/strict');
const iowa = require('../lib/iowa-cameras');
const a = {ORG:'IADOT',device_id:1,latitude:41,longitude:-93,ImageURL:'https://atmsqf.iowadot.gov/test.jpg',Desc_:'Test fixture',Route:'I-35'};
test('Iowa only accepts DOT-owned HTTPS media with Iowa coordinates',()=>{
  const data={features:[{attributes:a}]};
  assert.equal(iowa.normalizeIowa(data).length,1);
  for(const patch of [{ORG:'City'},{latitude:0},{ImageURL:'https://evil.example/a.jpg'},{ImageURL:'http://atmsqf.iowadot.gov/a.jpg'}]) {
    assert.equal(iowa.normalizeIowa({features:[{attributes:{...a,...patch}}]}).length,0);
  }
});
test('Iowa distinct camera views survive shared device IDs with stable share IDs',()=>{
  const views=[{attributes:a},{attributes:{...a,ImageURL:'https://atmsqf.iowadot.gov/other.jpg'}},{attributes:a}];
  const result=iowa.normalizeIowa({features:views});assert.equal(result.length,2);assert.notEqual(result[0].id,result[1].id);
  assert.equal(result[0].id,iowa.normalizeIowa({features:[{attributes:{...a,FID:999}}]})[0].id);
});
test('Iowa handles pagination and ArcGIS errors without pretending completeness',async()=>{
  let calls=0;
  const result=await iowa.load(async url=>{
    assert.equal(new URL(url).searchParams.get('where'),"ORG='IADOT'");
    return {features:[{attributes:{...a,device_id:++calls}}],exceededTransferLimit:calls===1};
  });
  assert.equal(calls,2);assert.equal(result.cameras.length,2);
  await assert.rejects(iowa.load(async()=>({error:{message:'Unavailable'}})));
});
