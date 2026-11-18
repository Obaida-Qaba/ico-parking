import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,routeRoads,nearestRoad} from '../public/navigation.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const rules=read('../scripts/nissan-road-corrections.json'),roads=read('../public/roads.json');
const catalogue=read('../public/destinations.json').destinations,graph=buildGraph(roads);
const expected=['V','VA','VAX','VC','VD','VE','VH001','VH002','VK','VZ001','VZ002'];

test('Nissan roads form the reviewed private island without an invented public gate',()=>{
 for(const addition of rules.additions){
  const actual=roads.ways.find(w=>w.id===addition.id);assert.ok(actual,addition.id);
  assert.deepEqual(actual.nodes,addition.nodes);assert.deepEqual(actual.points,addition.points);
  assert.ok(actual.nodes.every(n=>n.startsWith('portway-nissan-')),'no external/public junction is borrowed');
 }
 assert.ok(!roads.ways.some(w=>w.id==='portway-nissan-v-divider'||w.id==='portway-nissan-south-cross'),'rejected storage/shadow crossings are absent');
});

test('eleven source codes retain internal-only scope and V has three real choices',()=>{
 for(const code of expected){
  const p=catalogue['nissan:'+code];assert.ok(p,code);assert.equal(p.routingScope,'terminal-internal');
  assert.equal(p.publicConnectionVerified,false);assert.equal(p.lineExact,false);
 }
 const v=catalogue['nissan:V'];assert.equal(v.chooseApproach,true);assert.equal(v.approaches.length,3);
 assert.deepEqual(v.approaches.flatMap(a=>a.sourceIndices).sort(),[0,1,2]);
 for(const code of ['VB','VF','VG'])assert.equal(catalogue['nissan:'+code],undefined,'unmatched northern geometry stays explicit');
});

test('VA and VH001 can reach every reviewed Nissan arrival while North BB cannot',()=>{
 const destinations=expected.flatMap(code=>{const p=catalogue['nissan:'+code];return p?.chooseApproach?p.approaches:[p];});
 for(const origin of ['nissan:VA','nissan:VH001']){
  const s=catalogue[origin];assert.ok(s,origin);
  for(const p of destinations){
   assert.ok(p);assert.ok(nearestRoad(graph,[p.lat,p.lon]).distance<.1);
   const route=routeRoads(graph,[s.lat,s.lon],[p.lat,p.lon]);assert.ok(route.available,`${origin} to ${p.parking}/${p.id||''}`);
   assert.ok(route.endOffset<.1);
  }
 }
 const outside=catalogue['north:BB'];
 for(const p of destinations)assert.equal(routeRoads(graph,[outside.lat,outside.lon],[p.lat,p.lon]).available,false,'no cross-port certification through an unproved gate');
});
