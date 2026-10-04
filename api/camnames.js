'use strict';
// Derive names only from the same bounded, cached public camera manifest.
// Do not probe user-list IDs or fan out to undocumented alternate endpoints.
const {getManifest}=require('../lib/udot-service');
module.exports=async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});return res.end();}
  try{
    const {data}=await getManifest(); const names=Object.create(null);
    for(const item of data.item2){if(/^\d{1,12}$/.test(String(item.itemId)) && typeof item.title==='string' && item.title.trim()) names[item.itemId]={location:item.title.slice(0,300),roadway:''};}
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=300'});res.end(JSON.stringify(names));
  }catch(_){res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Camera names unavailable'}));}
};
