'use strict';
const service = require('../lib/udot-service');
function createHandler(upstream=service) {
  return async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    const error=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
    if(req.method!=='GET'){res.setHeader('Allow','GET');return error(405,'Method not allowed');}
    const path=req.query && req.query.p;
    if(typeof path!=='string' || (path!==service.MANIFEST && !service.IMAGE_PATH.test(path))) return error(400,'Unsupported camera path');
    try {
      if(path===service.MANIFEST){
        const result=await upstream.getManifest();
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30, s-maxage=60','X-Cache':result.stale?'STALE':'FRESH'});
        return res.end(result.body);
      }
      const result=await upstream.getImage(path);
      res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'public, max-age=30'});res.end(result.body);
    }catch(_){return error(502,'UDOT camera service is temporarily unavailable');}
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
