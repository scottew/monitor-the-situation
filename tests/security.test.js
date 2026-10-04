'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {EventEmitter}=require('node:events');
const {createLocalServer}=require('../lib/local-server');
const {createUdotService,requestUdot,MANIFEST}=require('../lib/udot-service');
const {createHandler}=require('../api/udot');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(body){this.body=body;}};}
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mts-security-'));
  await fs.mkdir(path.join(root,'vendor'));
  await fs.mkdir(path.join(root,'.git'));
  await fs.writeFile(path.join(root,'index.html'),'public fixture');
  await fs.writeFile(path.join(root,'.git/HEAD'),'fixture only');
  await fs.writeFile(path.join(root,'.env'),'fixture only');
  await fs.writeFile(path.join(root,'vendor/.private.js'),'fixture only');
  await fs.symlink(path.join(root,'.env'),path.join(root,'vendor/linked.js'));
  const server=createLocalServer({root,cameras:(_,res)=>{res.end('camera');},udot:(_,res)=>{res.end('udot');},camnames:(_,res)=>res.end('names')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  const port=server.address().port;
  return (target,headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:target,headers,method},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});
    req.on('error',reject);req.end();
  });
}
test('local server serves public assets without CORS and denies hidden/source/symlink paths',async t=>{
  const get=await setup(t);
  const publicResult=await get('/');assert.equal(publicResult.status,200);assert.equal(publicResult.headers['access-control-allow-origin'],undefined);
  for(const url of ['/.git/HEAD','/.env','/%2eenv','/vendor/.private.js','/vendor/%2eprivate.js','/vendor/linked.js','/app.js/../.env','/api/udot.js','/package.json','/node_modules/jsdom/package.json','/docs/STATE-ROLLOUT.md']) {
    const r=await get(url);assert.equal(r.status,404,url);assert.doesNotMatch(r.body,/fixture only/);
  }
});
test('local server rejects DNS-rebinding host, foreign origin and writes',async t=>{
  const get=await setup(t);
  assert.equal((await get('/',{Host:'evil.example'})).status,421);
  assert.equal((await get('/',{Origin:'https://evil.example'})).status,403);
  assert.equal((await get('/api/proxy/map/Cctv/1',{},'POST')).status,405);
  assert.equal((await get('/api/cameras?state=CA',{},'DELETE')).status,405);
});
test('UDOT allows only exact public read paths and rejects query/array/path abuse',async()=>{
  let calls=0;const handler=createHandler({getManifest:async()=>{calls++;return{body:Buffer.from('{}')};},getImage:async()=>{calls++;return{type:'image/jpeg',body:Buffer.from('image')};}});
  for(const p of ['/', '/map/Cctv/1/../../page','/page/Cctv/1','/map/Cctv/1?x=1','/map/mapIcons/Cameras?a=1','https://evil.example', ['a','b'],undefined]){
    const res=response();await handler({method:'GET',query:{p}},res);assert.equal(res.status,400);
  }
  const post=response();await handler({method:'POST',query:{p:MANIFEST}},post);assert.equal(post.status,405);assert.equal(calls,0);
  const image=response();await handler({method:'GET',query:{p:'/map/Cctv/123'}},image);assert.equal(image.status,200);assert.equal(image.headers['X-Content-Type-Options'],'nosniff');
});
test('UDOT rejects HTML images, redirects, error statuses and malformed/empty manifests',async()=>{
  for(const result of [{status:200,type:'text/html',body:Buffer.from('<script>bad</script>')},{status:302,type:'image/jpeg',body:Buffer.from('redirect')},{status:500,type:'image/jpeg',body:Buffer.from('bad')}]){
    const service=createUdotService(async()=>result);await assert.rejects(service.getImage('/map/Cctv/1'));
  }
  for(const data of ['{not-json','{"item2":[]}','{"unexpected":true}']){
    const service=createUdotService(async()=>({status:200,body:Buffer.from(data)}));await assert.rejects(service.getManifest());
  }
});
test('UDOT coalesces concurrent manifests, caches one route and discloses bounded stale fallback',async()=>{
  let calls=0,time=0,fail=false;
  const service=createUdotService(async()=>{calls++;await new Promise(r=>setImmediate(r));if(fail)throw new Error('offline');return{status:200,body:Buffer.from('{"item2":[{"itemId":1}]}')};},()=>time);
  const results=await Promise.all([service.getManifest(),service.getManifest(),service.getManifest()]);
  assert.equal(calls,1);assert.equal(results[0].stale,false);
  await service.getManifest();assert.equal(calls,1);
  time=700000;fail=true;assert.equal((await service.getManifest()).stale,true);
  time=4000000;await assert.rejects(service.getManifest());
});
test('UDOT transport destroys oversized response before buffering unbounded bytes',async()=>{
  let destroyed=false;
  const request=(_options,callback)=>{
    const req=new EventEmitter();req.destroy=error=>{destroyed=true;req.emit('error',error);};
    req.end=()=>process.nextTick(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'image/jpeg'};callback(res);res.emit('data',Buffer.alloc(8*1024*1024+1));});return req;
  };
  await assert.rejects(requestUdot('/map/Cctv/1',request),/too large/);assert.equal(destroyed,true);
});
test('public diagnostic endpoint does not reflect request or upstream details',async()=>{
  const res=response();await require('../api/test')({query:{secret:'fixture'},url:'/api/test?secret=fixture'},res);
  assert.equal(res.status,404);assert.doesNotMatch(res.body,/fixture|upstream/i);
});

test('UDOT transport bounds elapsed request time',async()=>{
  const request=()=>{const req=new EventEmitter();req.end=()=>{};req.destroy=e=>req.emit('error',e);return req;};
  await assert.rejects(requestUdot(MANIFEST,request,5),/timed out/);
});
test('UDOT decodes gzip without allowing decompression bombs',async()=>{
  const zlib=require('node:zlib');
  const requestFor=body=>(_options,callback)=>{
    const req=new EventEmitter();req.destroy=e=>req.emit('error',e);req.end=()=>process.nextTick(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json','content-encoding':'gzip'};callback(res);res.emit('data',body);res.emit('end');});return req;
  };
  const result=await requestUdot(MANIFEST,requestFor(zlib.gzipSync(Buffer.from('{"item2":[1]}'))));
  assert.equal(result.body.toString(),'{"item2":[1]}');
  await assert.rejects(requestUdot(MANIFEST,requestFor(zlib.gzipSync(Buffer.alloc(9*1024*1024)))));
});
test('CLI browser opening passes hostile strings as data without a shell',()=>{
  const {openUrl}=require('../lib/open-url');let call;
  openUrl('https://example.org/$(echo-danger)',(...args)=>{call=args;});
  assert.equal(call[0],'open');assert.deepEqual(call[1],['https://example.org/$(echo-danger)']);
  assert.equal(call[2].shell,undefined);
  assert.throws(()=>openUrl('javascript:alert(1)',()=>assert.fail('must not run')));
});
test('CLI rejects untrusted camera IDs before opening a URL',()=>{
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(process.execPath,[path.join(__dirname,'../cli/mts-cli.js'),'show','1$(echo-danger)','--open'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Usage/);
});
