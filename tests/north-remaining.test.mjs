import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,routeRoads,nearestRoad,distanceMetres} from '../public/navigation.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const corrections=read('../scripts/north-road-corrections.json');
const roads=read('../public/roads.json'),catalogue=read('../public/destinations.json');
const ways=new Map(roads.ways.map(w=>[w.id,w])),graph=buildGraph(roads);
const key=pair=>[...pair].sort().join('|');

test('reviewed North correction removes only the two occupied109 alignments',()=>{
 const rule=corrections.segmentExclusions[0],way=ways.get(rule.way);
 assert.deepEqual(way.nodes,rule.expectedNodes,'original OSM junction guard remains intact');
 const excluded=new Set((way.excludedSegments||[]).map(key));
 for(const pair of rule.excludedSegments)assert.ok(excluded.has(key(pair)),`occupied row crossing ${pair} must be excluded`);
 assert.ok(!graph.segments.some(s=>s.way===rule.way),'neither stored-car crossing is a drivable edge');
 const corner=ways.get('241878076');
 for(const pair of [['2494558932','2494558931'],['2494558931','2494558930']]){
  assert.ok(graph.segments.some(s=>s.way===corner.id&&key([s.a,s.b])===key(pair)),'verified shadowed exterior road is retained');
 }
});

test('the digitized quay aisle uses its verified joins and a terminal Q2 point',()=>{
 for(const expected of corrections.additions){
  const actual=ways.get(expected.id);assert.ok(actual,`reviewed road ${expected.id} must be present`);
  assert.deepEqual(actual.nodes,expected.nodes);assert.deepEqual(actual.points,expected.points);
  assert.equal(actual.private,true);assert.equal(actual.oneway,false);
 }
 const main=ways.get('portway-nit-quay-west-aisle');
 assert.equal(main.nodes[0],'2984583057','north joins the real125 quay crossing');
 assert.equal(graph.edges.get(main.nodes.at(-1)).length,1,'the reviewed Q2 end has no invented southern connection');
 const link=ways.get('portway-nit-q2-divider-link');
 assert.equal(link.nodes[0],'2494558948','lateral join extends the actual113 divider');
 assert.equal(graph.edges.get('portway-nit-quay-divider').length,3,'the independently imaged crossing joins north, south and the divider');
});

test('P and Q2 arrive on different verified quay segments instead of stored cars',()=>{
 const p=catalogue.destinations['north:P'],q=catalogue.destinations['north:Q2'];
 for(const point of [p,q]){
  assert.equal(point.roadWay,'portway-nit-quay-west-aisle');
  assert.equal(point.lineExact,false);
  assert.equal(nearestRoad(graph,[point.lat,point.lon]).segment.way,point.roadWay);
 }
 assert.notDeepEqual(p.roadSegment,q.roadSegment,'separate source parcels keep separate physical arrival segments');
 assert.ok(distanceMetres([p.lat,p.lon],[q.lat,q.lon])>80);
 assert.equal(q.scope,'parking-group-approach','Q2 is an explicit access-side compound approach');
 const start=catalogue.destinations['north:E'];
 for(const destination of [p,q]){
  const route=routeRoads(graph,[start.lat,start.lon],[destination.lat,destination.lon]);
  assert.ok(route.available,'existing North road graph connects to the actual quay aisle');
  assert.ok(route.endOffset<.1,'arrival stays on the reviewed road rather than snapping across stored cars');
 }
});
