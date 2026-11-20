import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveDestination,destinationChoices} from '../public/destinations.mjs';
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
test('historical Toyota extrapolations into fenced gas facilities cannot remain automatic parking targets',()=>{
 for(const code of ['A05','A06','A07','A08','A09','A01PPO','P04','P05']){
  const map=atlas.maps.find(m=>m.id==='toyota'),parking=map.parkings.find(p=>p.code===code);
  assert.ok(parking,'the source reference stays searchable');
  assert.equal(resolveDestination({map,parking},{},catalogue),null,code+' has no independently supported current parking target');
 }
 assert.equal(catalogue.destinations['toyota:A01']?.precision,'area-entry-only','A01 retains the independently confirmed shared area entrance, without claiming an individual bay');
});
test('current fitted C-row and H61 metadata retain the actual source glyph separately from fitting controls',()=>{
 const map=atlas.maps.find(m=>m.id==='south');
 for(const code of ['IC3','JC3','KC3','LC3','H61']){
  const parking=map.parkings.find(p=>p.code===code),pin=catalogue.destinations['south:'+code];
  assert.ok(Math.hypot(pin.sourcePoint[0]-parking.x/3,pin.sourcePoint[1]-parking.y/3)<.02,code+' actual source position');
  assert.ok(pin.matchModelPoint,code+' keeps the fitting control without calling it a source glyph');
 }
});
test('older POS source focus uses the older plan ordering of its repeated labels',()=>{
 const map=atlas.maps.find(m=>m.id==='bastenaken'),parking=map.parkings.find(p=>p.code==='POS');
 const choices=destinationChoices({map,parking},catalogue);
 assert.deepEqual(choices.find(h=>h.approach==='ge2').approachSourceIndices,[0]);
 assert.deepEqual(choices.find(h=>h.approach==='ee1-de1').approachSourceIndices,[1,2]);
});
