import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchParkings} from '../public/core.mjs';
import {resolveDestination} from '../public/destinations.mjs';

const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const atlas=read('../public/data.json'),catalogue=read('../public/destinations.json');
const points=read('../scripts/toyota-source-points.json').points;
const previouslyRejected=new Set(['A01PPO','A05','A06','A07','A08','A09','P04','P05']);
const confirmedAreaCodes=new Set(['A01','A02','A03','A04']);
const sourceOnly=Object.keys(points).filter(code=>!confirmedAreaCodes.has(code)&&!previouslyRejected.has(code));
const toyota=atlas.maps.find(map=>map.id==='toyota');

test('all 113 unsupported Toyota similarity projections remain source references without GPS markers or routes',()=>{
 assert.equal(sourceOnly.length,113,'the full unsupported historical-fit inventory is reviewed');
 const gaps=new Map((catalogue.evidenceGaps||[]).map(gap=>[gap.key||gap.sourceMap+':'+gap.code,gap]));
 for(const code of sourceOnly){
  const key='toyota:'+code,parking=toyota.parkings.find(item=>item.code===code);
  assert.ok(parking,key+' stays on its indexed source plan');
  const hit=searchParkings(atlas.maps,code,'toyota').find(item=>item.parking.code===code);
  assert.ok(hit,key+' remains searchable by its exact printed code');
  assert.equal(catalogue.destinations[key],undefined,key+' has no unproved automatic arrival or labelPosition');
  assert.equal(catalogue.labels?.[key],undefined,key+' has no alternative GPS label');
  assert.equal(resolveDestination({...hit,line:'15'},{},catalogue),null,key+' opens its source plan instead of an invented GPS route');
  const gap=gaps.get(key);
  assert.ok(gap,key+' retains its unresolved geographic evidence');
  assert.ok(typeof gap.reason==='string'&&gap.reason.length>20,key+' explains why the historical drawing cannot locate an individual parking');
 }
});

test('withdrawing unsupported Toyota projections preserves independently measured parking and line refinements',()=>{
 const parkingPin={lat:51.3019547,lon:3.2428032,method:'gps',accuracy:3};
 for(const [code,line] of [['B05','12'],['H01',null],['F11','15']]){
  const parking=toyota.parkings.find(item=>item.code===code),hit={map:toyota,parking,line};
  assert.equal(resolveDestination(hit,{},catalogue),null,code+' starts without a claimed automatic location');
  const measured=resolveDestination(hit,{['toyota:'+code+':parking']:parkingPin},catalogue);
  assert.equal(measured.automatic,false);assert.equal(measured.exactLine,false);
  assert.deepEqual([measured.lat,measured.lon],[parkingPin.lat,parkingPin.lon]);
  if(line){
   const exactPin={...parkingPin,lon:3.2429};
   const exact=resolveDestination(hit,{['toyota:'+code+':parking']:parkingPin,['toyota:'+code+':'+line]:exactPin},catalogue);
   assert.equal(exact.automatic,false);assert.equal(exact.exactLine,true);
   assert.deepEqual([exact.lat,exact.lon],[exactPin.lat,exactPin.lon]);
  }
 }
});
