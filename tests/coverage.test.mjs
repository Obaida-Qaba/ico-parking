import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveDestination,destinationChoices} from '../public/destinations.mjs';
import {buildGraph,nearestRoad,routeRoads,distanceMetres} from '../public/navigation.mjs';

const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
const graph=buildGraph(JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url))));

test('BB in the North terminal starts a road route without any saved GPS point',()=>{
  const map=atlas.maps.find(m=>m.id==='north'),parking=map.parkings.find(p=>p.code==='BB');
  const destination=resolveDestination({map,parking,line:null},{},catalogue);
  assert.ok(destination,'BB must have a geographic road approach, not only a source-plan label');
  assert.equal(destination.automatic,true);
  assert.equal(destination.exactLine,false);
  const end=[destination.lat,destination.lon];
  assert.ok(nearestRoad(graph,end).distance<1,'BB lies on an actual drivable road');
  const starts=[...graph.nodes.values()].filter(p=>{const d=distanceMetres(p,end);return d>300&&d<700;});
  assert.ok(starts.some(p=>{const route=routeRoads(graph,p,end);return route.available&&route.distance>250&&route.distance<2500;}),'BB is reachable along connected terminal roads');
});

test('the coverage audit lists every missing parking and validates every available road approach',()=>{
  const missing={};
  for(const map of atlas.maps)for(const parking of map.parkings){
    missing[map.id]??=[];
    const points=destinationChoices({map,parking,line:'15'},catalogue).map(hit=>resolveDestination(hit,{},catalogue));
    if(!points.length||points.some(point=>!point)){missing[map.id].push(parking.code);continue;}
    for(const point of points){
      assert.equal(point.automatic,true);
      assert.equal(point.exactLine,false,'line 15 remains a reference inside '+parking.code);
      assert.ok(nearestRoad(graph,[point.lat,point.lon]).distance<1,map.id+':'+parking.code+' must end on road geometry');
      assert.ok(point.basis,map.id+':'+parking.code+' records the source for its approach');
    }
  }
  for(const map of atlas.maps){
    assert.deepEqual(catalogue.coverageAudit[map.id].missing,missing[map.id]);
    assert.equal(catalogue.coverageAudit[map.id].total,map.parkings.length);
    assert.equal(catalogue.coverageAudit[map.id].routable,map.parkings.length-missing[map.id].length);
  }
});

test('every offered built-in approach is reachable from its connected terminal road network',()=>{
  const disconnected=[];
  for(const [key,entry] of Object.entries(catalogue.destinations))for(const point of entry.chooseApproach?entry.approaches:[entry]){
    const start=catalogue.destinations[key.startsWith('north:')?'north:BB':'south:CD1'];
    const route=routeRoads(graph,[start.lat,start.lon],[point.lat,point.lon]);
    if(!route.available)disconnected.push(key);
  }
  assert.deepEqual(disconnected,[],'a Start route button must not end on an unreachable directed lane');
});
