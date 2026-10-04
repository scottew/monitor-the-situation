'use strict';
// Historical diagnostics are intentionally unavailable on public deployments.
module.exports=(_req,res)=>{
  res.writeHead(404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify({error:'Not found'}));
};
