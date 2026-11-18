import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';
const source=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
test('HC1 access road follows the current ICO two-way arrows with recorded provenance',()=>{
 const way=source.ways.find(w=>w.id==='746582135');
 assert.equal(way.oneway,false);
 assert.equal(way.osmOneway,true);
 assert.match(way.trafficOverride.source,/icoterminals\.com/);
 assert.match(way.trafficOverride.reason,/two-way/);
});
test('HC1 approach can be reached directly from the other direction of its two-way lane',()=>{
 const end=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url))).destinations['south:HC1'];
 const start=[51.3019,3.2270544],target=[end.lat,end.lon];
 const now=routeRoads(buildGraph(source),start,target);
 const old=structuredClone(source);old.ways.find(w=>w.id==='746582135').oneway=true;
 const before=routeRoads(buildGraph(old),start,target);
 assert.ok(now.available&&before.available);
 assert.ok(Math.abs(now.distance-distanceMetres(start,target))<2,'direct mapped lane, no loop');
 assert.ok(before.distance>now.distance+50,'the old restriction caused a substantial unnecessary loop');
});
