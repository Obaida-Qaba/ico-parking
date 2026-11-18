import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDestination} from '../public/destinations.mjs';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,distanceMetres,validPin} from '../public/navigation.mjs';
const hit={map:{id:'bastenaken'},parking:{code:'HC1'},line:null};
const automatic={destinations:{'south:HC1':{lat:51.301,lon:3.225,method:'source-road-match',scope:'parking-approach'}}};
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
  const upper=key.endsWith('1')?'746582136':key.endsWith('3')?'1228590688':/^south:[GH]/.test(key)?'241873297':'746582089';
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
