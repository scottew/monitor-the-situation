'use strict';
const ENDPOINT = 'https://www.tripcheck.com/Scripts/map/data/cctvinventory.js';
function normalizeOregon(data) {
  if (!data || !Array.isArray(data.features)) throw new Error('Invalid TripCheck camera inventory.');
  const seen = new Set();
  return data.features.flatMap(feature => {
    const a = feature && feature.attributes;
    if (!a || a.latitude == null || a.longitude == null || a.latitude === '' || a.longitude === '') return [];
    const lat = Number(a.latitude), lng = Number(a.longitude);
    // TripCheck includes some neighboring-state road views; preserve the official
    // inventory without claiming every camera is physically inside Oregon.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
    const filename = a.filename;
    if (typeof filename !== 'string' || !filename || filename.length > 255 || /[\\/]/.test(filename) || filename.includes('..') || !/\.(jpe?g|png)$/i.test(filename)) return [];
    const value = String(a.publishedImageId ?? '');
    if (!/^\d+$/.test(value)) return [];
    const id = `or-${value}`;
    if (seen.has(id)) return [];
    seen.add(id);
    // This URL construction is explicitly used by the official TripCheck map template.
    const imgUrl = `https://www.tripcheck.com/roadcams/cams/${encodeURIComponent(filename)}`;
    return [{id,lat,lng,location:String(a.title || `CAM-${id}`).slice(0,300),roadway:String(a.route || '').trim().slice(0,100),
      imgUrl,source:'ODOT TripCheck',refreshSeconds:300}];
  });
}
module.exports = {
  name:'ODOT TripCheck', url:'https://www.tripcheck.com/Pages/Custom-Cameras',
  termsUrl:'https://www.tripcheck.com/Pages/Frequently-Asked-Questions',
  attribution:'Camera courtesy of ODOT. TripCheck includes some adjoining-state road views. Image age and availability vary.',
  cacheTtlMs:24*60*60*1000,staleTtlMs:48*60*60*1000,
  async load(fetchJson) {
    // The .js response is strict JSON, never evaluated as executable JavaScript.
    const cameras=normalizeOregon(await fetchJson(ENDPOINT, 'application/javascript, application/json;q=0.9, */*;q=0.5'));
    if(!cameras.length)throw new Error('No TripCheck camera snapshots currently available.');
    return {cameras,partial:false,unavailableDistricts:[]};
  },
  normalizeOregon,
};
