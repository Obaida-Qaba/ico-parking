import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDestination,isAreaEntry,isAreaApproach,destinationEvidenceGap} from '../public/destinations.mjs';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,distanceMetres,validPin} from '../public/navigation.mjs';
const hit={map:{id:'bastenaken'},parking:{code:'HC1'},line:null};
const automatic={destinations:{'south:HC1':{lat:51.301,lon:3.225,method:'source-road-match',scope:'parking-approach'}}};

test('a shared boundary-road approach is distinct from a confirmed area entrance',()=>{
 const approach=resolveDestination(hit,{}, {destinations:{'south:HC1':{lat:51.301,lon:3.225,precision:'area-approach-only',scope:'parking-group-approach'}}});
 assert.equal(isAreaApproach(approach),true);assert.equal(isAreaEntry(approach),false);
 assert.equal(isAreaApproach({...approach,automatic:false}),false,'saved refinements retain their own precision');
 assert.equal(isAreaApproach({...approach,precision:'area-entry-only'}),false);
});

test('source-only reasons resolve on their own source or a canonical South alias',()=>{
 const gap={sourceMap:'south',code:'HC1',reason:'Named parking position is not independently matched.'};
 assert.equal(destinationEvidenceGap(hit,{evidenceGaps:[gap]}),gap);
 assert.equal(destinationEvidenceGap({...hit,parking:{code:'HC2'}},{evidenceGaps:[gap]}),null);
 const exact={sourceMap:'bastenaken',code:'HC1',reason:'Older source only'};
 assert.equal(destinationEvidenceGap(hit,{evidenceGaps:[gap,exact]}),exact);
});
test('known parking navigates immediately without asking user to record GPS',()=>{
 const point=resolveDestination(hit,{},automatic);
 assert.ok(point);assert.equal(point.lat,51.301);assert.equal(point.automatic,true);
});
test('line reference falls back to parking road approach without pretending to locate exact line',()=>{
 const point=resolveDestination({...hit,line:'15'},{},automatic);
 assert.ok(point);assert.equal(point.scope,'parking-approach');assert.equal(point.exactLine,false);
});
test('saved exact line or parking points can improve the built-in location',()=>{
 const exact={lat:51.302,lon:3.226,method:'gps'};
 const points={'south:HC1:15':exact};
 assert.equal(resolveDestination({...hit,line:'15'},points,automatic).lat,exact.lat);
 assert.equal(resolveDestination({...hit,line:'15'},points,automatic).exactLine,true);
 assert.equal(resolveDestination({...hit,line:'16'},points,automatic).automatic,true);
 const parking={'south:HC1:parking':exact};
 assert.equal(resolveDestination({...hit,line:'16'},parking,automatic).lat,exact.lat);
 assert.equal(resolveDestination({...hit,line:'16'},parking,automatic).exactLine,false);
});
test('unmapped parking stays unavailable; invalid coordinates are rejected',()=>{
 assert.equal(resolveDestination({...hit,parking:{code:'UNKNOWN'}},{},automatic),null);
 assert.equal(resolveDestination(hit,{}, {destinations:{'south:HC1':{lat:NaN,lon:3.225}}}),null);
});

test('an explicitly matched historical-only block resolves without inventing a current code',()=>{
 const point={lat:51.295,lon:3.242,method:'bounded-landmark-road-match',scope:'parking-group-approach'};
 const found=resolveDestination({map:{id:'hanze'},parking:{code:'H24'},line:'15'},{},{destinations:{'hanze:H24':point}});
 assert.ok(found,'the selected source map has its own recorded approach');
 assert.equal(found.lat,point.lat);assert.equal(found.exactLine,false);assert.equal(found.scope,'parking-group-approach');
});

test('published automatic approaches are real map references and lie on motorable roads',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
 const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
 const graph=buildGraph(JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url))));
 assert.ok(catalogue.destinations['south:HC1']);assert.ok(catalogue.destinations['south:H61']);
 for(const [key,point] of Object.entries(catalogue.destinations)){
   const [mapId,code]=key.split(':');
   assert.ok(atlas.maps.find(m=>m.id===mapId)?.parkings.some(p=>p.code===code),key);
   assert.ok(nearestRoad(graph,[point.lat,point.lon]).distance<1,key+' must lie on road geometry');
   assert.equal(point.lineExact,false);
 }
});

test('C-row parking names sit inside their own blocks, separately from the shared access roads',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
 const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
 for(const [key,pin] of Object.entries(catalogue.destinations).filter(([key])=>/^south:[G-L]C[123]$/.test(key))){
  const label=pin.labelPosition;
  assert.ok(validPin(label),key+' has a separate geographic parking label');
  const lower=pin.roadWay;
  const upper=key.endsWith('1')?'746582136':key.endsWith('3')?(/^south:[G-I]/.test(key)?'1228590688':'746582137'):/^south:[GH]/.test(key)?'241873297':'746582089';
  const distances=[lower,upper].map(id=>nearestRoad(buildGraph({ways:roads.ways.filter(w=>w.id===id)}),[label.lat,label.lon]).distance);
  assert.ok(distances.every(d=>d>5&&d<20),key+' label must be between its actual bounding aisles, not on a shared boundary');
 }
 const hc2=catalogue.destinations['south:HC2'];
 for(const [code,expected] of Object.entries({HC1:[51.3021440213,3.2266532807],HC2:[51.3020698614,3.2262957722],HC3:[51.3019997650,3.2259460208]})){
  const label=catalogue.destinations['south:'+code].labelPosition;
  assert.ok(distanceMetres([label.lat,label.lon],expected)<.2,code+' matches the independently checked source row and geographic aisle midpoint');
 }
 assert.ok(distanceMetres([hc2.lat,hc2.lon],[51.3021079235,3.2264808579])<.1,'HC2 route still ends on its own access road');
 assert.ok(distanceMetres([hc2.lat,hc2.lon],[hc2.labelPosition.lat,hc2.labelPosition.lon])>8,'parking label is not the access-road endpoint');
});

test('VPC parking approaches start navigation without recording a GPS point',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
 const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
 const access=buildGraph({ways:roads.ways.filter(w=>['1349890081','746582118','746582120','241873275'].includes(w.id))});
 const cases={
  CD1:{approach:[51.30879865,3.2202856],label:[51.3086017,3.21967515],way:'1349890081',segment:['2494511854','12431454000']},
  CD2:{approach:[51.3091943,3.2199584],label:[51.30899795,3.21934995],way:'1349890081',segment:['12431454000','12487520998']},
  DD1:{approach:[51.30697285,3.22177475],label:[51.306777,3.2211593],way:'746582118',segment:['6986702543','6986702544']},
  DC2:{approach:[51.30725745,3.2226664],label:[51.30711515,3.222220575],way:'746582120',segment:['6986702547','12487521006'],group:2},
  CC2:{approach:[51.3083677,3.22063935],label:[51.308508125,3.221085575],way:'241873275',segment:['2494511854','12431453998'],group:3}
 };
 for(const [code,expected] of Object.entries(cases)){
  const found=resolveDestination({map:{id:'south'},parking:{code},line:null},{},catalogue);
  assert.ok(found,code+' has a built-in destination');
  assert.equal(found.automatic,true,code+' does not require a saved GPS pin');
  assert.equal(found.roadWay,expected.way);
  assert.deepEqual(found.roadSegment,expected.segment,code+' uses its own segment beside the VPC');
  assert.ok(distanceMetres([found.lat,found.lon],expected.approach)<.1,code+' matches the independently checked access segment');
  assert.ok(nearestRoad(access,[found.lat,found.lon]).distance<.1);
  assert.ok(validPin(found.labelPosition));
  assert.ok(distanceMetres([found.labelPosition.lat,found.labelPosition.lon],expected.label)<.1,code+' label is in its own parking strip');
  assert.ok(distanceMetres([found.lat,found.lon],[found.labelPosition.lat,found.labelPosition.lon])>30,'large parking block label remains separate from road arrival point');
  if(expected.group){
   assert.equal(catalogue.destinations['south:'+code].scope,'parking-group-approach');
   assert.equal(found.sourcePoints.length,expected.group,code+' records all repeated source labels rather than pretending to locate every sub-block');
  }
 }
});
