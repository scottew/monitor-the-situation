'use strict';
const https = require('https');
const zlib = require('zlib');
const MAX_BYTES = 8 * 1024 * 1024;
const MANIFEST = '/map/mapIcons/Cameras';
const IMAGE_PATH = /^\/map\/Cctv\/[0-9]{1,12}$/;
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
function requestUdot(targetPath, request = https.request, timeoutMs = 12000) {
  return new Promise((resolve,reject) => {
    let done=false, size=0; const chunks=[];
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const req=request({hostname:'www.udottraffic.utah.gov',port:443,path:targetPath,method:'GET',headers:{
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Accept:targetPath===MANIFEST?'application/json':'image/jpeg,image/png,image/webp',
      'Accept-Encoding':'identity',Referer:'https://www.udottraffic.utah.gov/map',
    }}, response=>{
      response.on('error',e=>finish(e));
      response.on('aborted',()=>finish(new Error('Upstream response aborted')));
      response.on('data',chunk=>{
        if (done) return;
        size+=chunk.length;
        if(size>MAX_BYTES){req.destroy(new Error('Upstream response too large'));return;}
        chunks.push(chunk);
      });
      response.on('end',()=>{
        if (done) return;
        try {
          let body=Buffer.concat(chunks);
          const encoding=(response.headers['content-encoding']||'identity').toLowerCase();
          const decompress={gzip:zlib.gunzipSync,deflate:zlib.inflateSync,br:zlib.brotliDecompressSync}[encoding];
          if(decompress) body=decompress(body,{maxOutputLength:MAX_BYTES});
          else if(encoding!=='identity') throw new Error('Unsupported upstream encoding');
          finish(null,{status:response.statusCode,type:(response.headers['content-type']||'').split(';')[0].toLowerCase(),body});
        }catch(error){finish(error);}
      });
    });
    const timer=setTimeout(()=>req.destroy(new Error('Upstream request timed out')),timeoutMs);
    req.on('error',e=>finish(e)); req.end();
  });
}
function createUdotService(fetch = requestUdot, now = Date.now) {
  let cache=null, inFlight=null;
  async function getManifest() {
    if(cache && now()-cache.at<600000) return {...cache,stale:false};
    if(!inFlight) inFlight=(async()=>{
      try {
        const result=await fetch(MANIFEST);
        if(result.status!==200) throw new Error('Upstream manifest unavailable');
        const data=JSON.parse(result.body.toString('utf8'));
        if(!data || !Array.isArray(data.item2) || !data.item2.length) throw new Error('Upstream manifest invalid or empty');
        cache={data,body:Buffer.from(JSON.stringify(data)),at:now()};
        return {...cache,stale:false};
      } catch(error) {
        if(cache && now()-cache.at<3600000) return {...cache,stale:true};
        throw error;
      } finally { inFlight=null; }
    })();
    return inFlight;
  }
  async function getImage(path) {
    if(!IMAGE_PATH.test(path)) throw new Error('Invalid camera path');
    const result=await fetch(path);
    if(result.status!==200 || !IMAGE_TYPES.has(result.type) || !result.body.length) throw new Error('Camera image unavailable');
    return result;
  }
  return {getManifest,getImage};
}
const service=createUdotService();
module.exports={...service,createUdotService,requestUdot,MANIFEST,IMAGE_PATH};
