/* Independent Node smoke tests for raster-intake-v04.js. */
'use strict';
const assert=require('node:assert/strict');
const I=require('../app/raster-intake-v04.js');
function white(w,h){const data=new Uint8ClampedArray(w*h*4);data.fill(255);return {width:w,height:h,data};}
function dark(img,x,y){const p=(y*img.width+x)*4;img.data[p]=img.data[p+1]=img.data[p+2]=0;}
const im=white(120,100);for(let x=10;x<=105;x++){dark(im,x,10);dark(im,x,89)}for(let y=10;y<=89;y++){dark(im,10,y);dark(im,105,y)}
const r=I.lineCandidates(im,{x:0,y:0,w:120,h:100},{minLineLength:40});
assert.ok(r.candidates.filter(x=>x.orientation==='H').length>=2);
assert.ok(r.candidates.filter(x=>x.orientation==='V').length>=2);
assert.ok(r.candidates.every(x=>x.classification==='UNVERIFIED_WALL_CANDIDATE'));
assert.equal(I.lineCandidates(white(120,100),{x:0,y:0,w:120,h:100},{minLineLength:40}).candidates.length,0);
const anchors=[{axis:'X',pixels:100,millimeters:2000,evidence:'MEASURED',source_ref:'a'},{axis:'X',pixels:60,millimeters:1200,evidence:'DOCUMENTED_REFERENCE',source_ref:'b'},{axis:'Y',pixels:80,millimeters:1600,evidence:'MEASURED',source_ref:'c'},{axis:'Y',pixels:70,millimeters:1400,evidence:'DOCUMENTED_REFERENCE',source_ref:'d'}];
assert.equal(I.verifiedScale(anchors).status,'REVIEW');
assert.equal(I.verifiedScale(anchors.slice(0,2)).status,'HOLD');
assert.equal(I.verifiedScale(anchors.map(a=>a.axis==='Y'?{...a,millimeters:a.millimeters*1.2}:a)).status,'HOLD');
const p={source_id:'TEST',room_id:'BATH01',image_sha256:'a'.repeat(64),operator_review:'REVIEWED',polygon_px:[[10,10],[105,10],[105,89],[10,89]],anchors};
assert.equal(I.candidateHandoff(p).status,'HOLD');
assert.equal(I.candidateHandoff({...p,wall_height_mm:2300,wall_thickness_mm:100,door_host_id:'W1',door_width_mm:800,door_height_mm:2000,dimension_evidence:{wall_height_mm:'MEASURED',wall_thickness_mm:'MEASURED',door_width_mm:'MEASURED',door_height_mm:'MEASURED'}}).status,'REVIEW');
console.log('Raster intake v0.4: 9/9 checks passed; no official geometry approval issued.');
