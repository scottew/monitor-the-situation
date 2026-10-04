'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const fixture = Array.from({length: 30}, (_, i) => ({ itemId: 100 + i, title: i === 0 ? '<img src=x onerror=alert(1)>' : `Main St ${i}`, location: [40.77 + i / 1000, -111.89] }));

async function app({ url = 'https://utah.monitorit.app/', width = 390, cameras = fixture, status = 200, response, withLeaflet = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'), 'utf8'), {url, runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve));
  Object.defineProperty(w, 'innerWidth', { value: width, writable:true });
  w.ResizeObserver = class { observe() {} };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.setInterval = () => 1;
  let timerId = 0;
  const timers = new Set();
  w.setTimeout = (fn, delay) => { const id = ++timerId; timers.add(id); if (delay < 18000) queueMicrotask(() => { if (timers.delete(id)) fn(); }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.fetch = async () => ({ok:status < 400,status,json:async()=>response || {item2:cameras}});
  w.console.error = () => {};
  w.console.warn = () => {};
  if (withLeaflet) {
    w.eval(fs.readFileSync(path.join(root, 'vendor/leaflet/leaflet.js'), 'utf8'));
    const node=w.document.getElementById('map');
    Object.defineProperty(node,'clientWidth',{value:280,configurable:true});
    Object.defineProperty(node,'clientHeight',{value:240,configurable:true});
  }
  w.eval(fs.readFileSync(path.join(root,'state-config.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'camera-utils.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8') + '\nwindow.testApp = { init, state, applyFilters, openModal, openSharedCamera, shareCamera, resetFilters, copyCameraLink };');
  await w.testApp.init();
  return {w,dom,a:w.testApp,d:w.document};
}

test('camera list works without mapping library; mobile keeps chosen density', async () => {
  const {w,dom,a,d} = await app();
  assert.equal(a.state.cameras.length,30);
  assert.equal(d.querySelectorAll('.cam-cell').length,4);
  assert.equal(d.querySelector('#camera-grid').classList.contains('camera-list'),true);
  assert.match(d.querySelector('#map-status').textContent,/Map unavailable/);
  d.querySelector('#btn-more').click(); a.applyFilters();
  assert.equal(a.state.gridSize,3);
  assert.equal(d.querySelectorAll('.cam-cell').length,9);
  d.querySelector('#camera-search').value='Main St 29';
  d.querySelector('#camera-search').dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.cam-cell').length,1);
  dom.window.close();
});
test('remote camera names are text, never executable HTML', async () => {
  const {dom,d} = await app();
  assert.equal(d.querySelectorAll('.cam-cell img').length,4);
  assert.equal(d.querySelectorAll('[onerror]').length,0);
  assert.match([...d.querySelectorAll('.cam-caption')].map(x=>x.textContent).join(' '),/<img/);
  dom.window.close();
});
test('deep link opens correct camera outside initial grid; closing removes camera URL', async () => {
  const {w,dom,a,d} = await app({url:'https://utah.monitorit.app/?camera=129'});
  assert.equal(a.state.modalCam.id,'129');
  assert.equal(d.querySelector('#modal-overlay').style.display,'flex');
  assert.equal(d.activeElement.id,'btn-modal-close');
  w.closeModal();
  assert.equal(new URL(w.location.href).searchParams.has('camera'),false);
  assert.equal(a.state.modalCam,null);
  dom.window.close();
});
test('share fallback displays copyable direct URL when clipboard is unavailable', async () => {
  const {dom,a,d} = await app({url:'https://utah.monitorit.app/?camera=129'});
  await a.shareCamera();
  assert.equal(d.querySelector('#share-panel').hidden,false);
  assert.equal(d.querySelector('#share-url').value,'https://utah.monitorit.app/?camera=129');
  assert.match(d.querySelector('#share-status').textContent,/Select and copy/);
  dom.window.close();
});
test('share success and cancellation do not show fallback or alter camera', async () => {
  const {w,dom,a,d} = await app({url:'https://utah.monitorit.app/?camera=129'});
  let received;
  w.navigator.share = async data => { received = data; };
  await a.shareCamera(); assert.equal(received.url,w.location.href); assert.equal(d.querySelector('#share-panel').hidden,true);
  w.navigator.share = async () => { const e = new Error('cancel'); e.name='AbortError'; throw e; };
  await a.shareCamera(); assert.equal(d.querySelector('#share-panel').hidden,true); assert.equal(a.state.modalCam.id,'129');
  dom.window.close();
});
test('California direct camera link retains state in preview and loads normalized schema', async () => {
  const cameras=[{id:'ca-3-1',lat:38.5,lng:-121.4,location:'Sacramento',roadway:'I-5',imgUrl:'https://cwwp2.dot.ca.gov/a.jpg?x=1'}];
  const {dom,a,d}=await app({url:'https://preview.vercel.app/?state=CA&camera=ca-3-1',response:{cameras,partial:true}});
  assert.equal(a.state.modalCam.id,'ca-3-1'); assert.equal(d.querySelector('#region-section').hidden,true); assert.match(d.querySelector('#app-notice').textContent,/districts/);
  await a.shareCamera(); assert.match(d.querySelector('#share-url').value,/state=CA&camera=ca-3-1/);
  dom.window.close();
});
test('unknown camera yields an honest notice rather than fabricated feed', async()=>{
  const {dom,a,d}=await app({url:'https://utah.monitorit.app/?camera=missing'});
  assert.equal(a.state.modalCam,null); assert.match(d.querySelector('#app-notice').textContent,/no longer/);
  dom.window.close();
});
test('empty and HTTP-error manifests produce recoverable camera error, not online status', async()=>{
  for(const options of [{cameras:[]},{status:503,response:{error:'Source temporarily unavailable'}}]) {
    const {dom,a,d}=await app(options);
    assert.equal(a.state.cameras.length,0); assert.match(d.querySelector('.camera-error').textContent,/Camera data unavailable/);
    assert.equal(d.querySelectorAll('.cam-cell').length,0);
    dom.window.close();
  }
});


test('real Leaflet viewport changes preserve density without recursive fits', async()=>{
  const {dom,a,d}=await app({width:1200,withLeaflet:true});
  assert.equal(a.state.cameras.length,30);
  assert.equal(a.state.programmaticMove,false);
  d.querySelector('#btn-more').click();
  assert.equal(a.state.gridSize,6);
  a.state.map.setView([41.2,-111.9],10,{animate:false});
  assert.equal(a.state.useDefault,false);
  assert.equal(a.state.gridSize,6);
  d.querySelector('[data-lat="40.7608"]').click();
  assert.equal(a.state.programmaticMove,false);
  assert.equal(a.state.useDefault,false);
  assert.ok(a.state.filtered.length);
  a.resetFilters();
  assert.equal(a.state.useDefault,true);
  assert.equal(a.state.gridSize,5);
  dom.window.close();
});
test('opening and navigating modal uses one history entry; back closes and forward restores', async()=>{
  const {w,dom,a,d}=await app();
  const before=w.history.length;
  a.openModal(a.state.cameras[0]);
  a.openModal(a.state.cameras[1]);
  assert.equal(w.history.length,before+1);
  assert.equal(new URL(w.location.href).searchParams.get('camera'),'101');
  const back=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));
  w.history.back(); await back;
  assert.equal(a.state.modalCam,null);
  const forward=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));
  w.history.forward(); await forward;
  assert.equal(a.state.modalCam.id,'101');
  assert.equal(d.querySelector('#modal-overlay').style.display,'flex');
  dom.window.close();
});
test('undeployed state options cannot send live visitors to nonexistent domains',async()=>{
  const {dom,d}=await app();
  assert.equal(d.querySelector('option[value="CA"]').disabled,true);
  assert.equal(d.querySelector('option[value="UT"]').disabled,false);
  assert.equal(d.querySelector('option[value="WI"]').disabled,true);
  dom.window.close();
});


test('Oregon default and user-selected refresh respect five-minute source floor', async()=>{
  const cameras=[{id:'or-1',lat:45.5,lng:-122.6,location:'Portland',imgUrl:'https://www.tripcheck.com/a.jpg'}];
  const {w,dom,a,d}=await app({url:'https://preview.vercel.app/?state=OR',response:{cameras,source:{attribution:'Camera courtesy of ODOT'}}});
  assert.equal(a.state.refreshRate,300000);
  assert.equal(d.querySelector('#refresh-rate').value,'300000');
  assert.equal(d.querySelector('#refresh-rate option[value="60000"]').disabled,true);
  d.querySelector('#refresh-rate').value='30000';
  d.querySelector('#refresh-rate').dispatchEvent(new w.Event('change'));
  assert.equal(a.state.refreshRate,300000);
  d.querySelector('#refresh-rate').value='0';
  d.querySelector('#refresh-rate').dispatchEvent(new w.Event('change'));
  assert.equal(a.state.refreshRate,0);
  assert.equal(d.querySelector('#source-credit').textContent,'Camera courtesy of ODOT');
  dom.window.close();
});
test('Iowa attribution includes license and discloses transformation',async()=>{
  const cameras=[{id:'ia-1',lat:42,lng:-93,location:'Iowa camera',imgUrl:'https://iowadot.gov/a.jpg'}];
  const {dom,d}=await app({url:'https://preview.vercel.app/?state=IA',response:{cameras,source:{attribution:'Iowa DOT',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}}});
  assert.equal(d.querySelector('#source-license').hidden,false);
  assert.equal(d.querySelector('#source-license').href,'https://creativecommons.org/licenses/by/4.0/');
  assert.match(d.querySelector('#source-credit').textContent,/filtered and reformatted/);
  dom.window.close();
});

test('missing WebGL2 never attaches a broken basemap or interrupts camera fitting', async () => {
  const {dom,a,d} = await app({withLeaflet:true});
  assert.equal(a.state.cameras.length,30);
  assert.match(d.querySelector('#map-status').textContent,/Loading basic map/);
  const tiles = Object.values(a.state.map._layers).filter(layer => layer instanceof dom.window.L.TileLayer);
  assert.equal(tiles.length,1);
  assert.equal(tiles[0].options.keepBuffer,0);
  assert.equal(tiles[0].options.referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(tiles[0]._url,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(d.querySelector('script[src*=leaflet-maplibre]'),null);
  assert.doesNotThrow(() => a.state.map.setView([40.78,-111.89],12));
  assert.ok(d.querySelectorAll('.cam-cell').length > 0);
  a.openModal(a.state.cameras[0]);
  assert.equal(a.state.modalCam.id,'100');
  dom.window.close();
});

test('hiding the mobile map does not replace camera feeds with an empty viewport', async () => {
  const {dom,a,d} = await app({withLeaflet:true});
  const before = a.state.filtered.map(c => c.id).join(',');
  const container = a.state.map.getContainer();
  Object.defineProperty(container,'clientWidth',{value:0});
  Object.defineProperty(container,'clientHeight',{value:0});
  a.state.map.invalidateSize({pan:false});
  a.state.map.fire('moveend');
  assert.equal(a.state.filtered.map(c => c.id).join(','),before);
  assert.ok(d.querySelectorAll('.cam-cell').length > 0);
  dom.window.close();
});
