'use strict';
const {execFileSync}=require('child_process');
function openUrl(value,run=execFileSync){
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported browser URL');
  // Argument arrays, never shell interpolation of upstream or agent input.
  try {run('open',[url.href],{stdio:'ignore',timeout:5000});}
  catch(_){run('xdg-open',[url.href],{stdio:'ignore',timeout:5000});}
}
module.exports={openUrl};
