'use strict';
const { createHash } = require('node:crypto');
const ENDPOINT = 'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query';

function normalizeIowa(data) {
  if (!data || data.error || !Array.isArray(data.features)) throw new Error('Invalid Iowa DOT camera directory.');
  const seen = new Set();
  return data.features.flatMap(feature => {
    const a = feature && feature.attributes;
    // The dataset may later include municipal/partner media: never enable those implicitly.
    if (!a || a.ORG !== 'IADOT') return [];
    const lat = Number(a.latitude), lng = Number(a.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40.3 || lat > 43.6 || lng < -96.7 || lng > -90.1) return [];
    let image;
    try { image = new URL(a.ImageURL); } catch (_) { return []; }
    if (image.protocol !== 'https:' || image.username || image.password || image.port ||
      !(image.hostname === 'iowadot.gov' || image.hostname.endsWith('.iowadot.gov'))) return [];
    const value = String(a.device_id ?? '');
    if (!/^\d+$/.test(value)) return [];
    const view = createHash('sha256').update(image.href).digest('hex').slice(0,16);
    const id = `ia-${value}-${view}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, lat, lng, location: String(a.Desc_ || a.ImageName || `CAM-${id}`).slice(0,300),
      roadway: String(a.Route || '').slice(0,100), imgUrl: image.href, source: 'Iowa DOT', refreshSeconds: 60 }];
  });
}

module.exports = {
  name: 'Iowa DOT',
  url: 'https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/about',
  termsUrl: 'https://iowadot.gov/policies-statements/terms-use',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Iowa DOT traffic camera data, CC BY 4.0. Camera directory filtered and reformatted by Monitor the Situation. Iowa DOT-owned sources only; no endorsement implied.',
  cacheTtlMs: 24 * 60 * 60 * 1000,
  staleTtlMs: 48 * 60 * 60 * 1000,
  async load(fetchJson) {
    const cameras = [];
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ where: "ORG='IADOT'", outFields: 'device_id,Desc_,ImageName,ImageURL,ORG,latitude,longitude,Route',
        returnGeometry: 'false', orderByFields: 'FID', resultOffset: String(page * 2000), resultRecordCount: '2000', f: 'json' });
      const data = await fetchJson(`${ENDPOINT}?${query}`);
      cameras.push(...normalizeIowa(data));
      if (!data.exceededTransferLimit) {
        const unique = [...new Map(cameras.map(c => [c.id,c])).values()];
        if (!unique.length) throw new Error('No Iowa DOT-owned camera images currently available.');
        return { cameras: unique, partial: false, unavailableDistricts: [] };
      }
    }
    throw new Error('Iowa DOT camera directory exceeded the pagination limit.');
  },
  normalizeIowa,
};
