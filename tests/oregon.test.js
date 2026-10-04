const test = require('node:test');
const assert = require('node:assert/strict');
const oregon = require('../lib/oregon-cameras');
const a={publishedImageId:392,cameraId:277,filename:'AstoriaUS101MeglerBrNB_pid392.jpg',latitude:46.18785,longitude:-123.85347,title:'Test fixture',route:'US101',videoId:123};
test('TripCheck uses published image ID and official static snapshot path only',()=>{
 const rows=oregon.normalizeOregon({features:[{attributes:a},{attributes:{...a,publishedImageId:393}}]});
 assert.equal(rows.length,2);assert.equal(rows[0].id,'or-392');assert.equal(rows[0].imgUrl,'https://www.tripcheck.com/roadcams/cams/AstoriaUS101MeglerBrNB_pid392.jpg');assert.equal(rows[0].videoId,undefined);assert.equal(rows[0].refreshSeconds,300);
});
test('TripCheck rejects invalid coordinates and unsafe path data',()=>{
 for(const patch of [{longitude:226},{filename:'../x.jpg'},{filename:'https://evil.example/a.jpg'},{filename:'a\\b.jpg'},{filename:'a.js'},{publishedImageId:'<x>'}])assert.equal(oregon.normalizeOregon({features:[{attributes:{...a,...patch}}]}).length,0);
 assert.throws(()=>oregon.normalizeOregon({}));
});
