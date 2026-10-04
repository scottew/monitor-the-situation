'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../camera-utils');

test('camera links preserve state, encode camera ID, remove unrelated fragment', () => {
  assert.equal(utils.cameraUrl('https://california.monitorit.app/?state=CA#old', 'ca-1-3 & x'), 'https://california.monitorit.app/?state=CA&camera=ca-1-3+%26+x');
});
test('image refresh preserves existing query and replaces cache buster', () => {
  assert.equal(utils.imageUrl('https://example.org/image?a=1&_t=2', 3), 'https://example.org/image?a=1&_t=3');
  assert.equal(utils.imageUrl('/api/proxy/map/Cctv/123', 4, 'https://utah.monitorit.app/?camera=123'), 'https://utah.monitorit.app/api/proxy/map/Cctv/123?_t=4');
  assert.throws(() => utils.imageUrl('javascript:alert(1)', 1));
});
test('invalid or duplicate camera data never creates broken markers', () => {
  const good = { id: 1, lat: 0, lng: 0, imgUrl: '/image.jpg' };
  const rows = utils.normaliseCameras([good,good,null,{...good,id:2,lat:NaN},{...good,id:3,imgUrl:'data:x'},{...good,id:4,lat:91}]);
  assert.equal(rows.length,1); assert.equal(rows[0].id,'1'); assert.equal(rows[0].location,'CAM-1');
});
test('phone grid starts at two columns', () => {
  assert.equal(utils.defaultGridSize(390),2); assert.equal(utils.defaultGridSize(600),2); assert.equal(utils.defaultGridSize(601),5);
});

test('prepared state camera shares retain routing but never propagate arbitrary URL credentials', () => {
  for (const code of ['AZ','GA','WI']) {
    const id = `${code.toLowerCase()}-2056-960`;
    const link = utils.cameraUrl(`https://preview.vercel.app/?state=${code}&key=synthetic&token=synthetic#debug`,id);
    assert.equal(link,`https://preview.vercel.app/?state=${code}&camera=${id}`);
  }
});
