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

test('the reported HC3 crossing cannot route sideways through the C-row parking blocks',()=>{
 const graph=buildGraph(source),cross='2494511760';
 assert.ok(graph.nodes.has(cross),'keep the real point on the longitudinal HC3 aisle');
 assert.deepEqual([...new Set(graph.edges.get(cross).map(edge=>edge.way))],['241873297'],'only the real through aisle remains at this crossing');
 for(const [a,b] of [['6986702605','6986702612'],['6986702612','2494511760'],['2494511760','6986702619']]){
  assert.ok(graph.nodes.has(a)&&graph.nodes.has(b),'do not remove shared nodes on valid aisles');
  assert.equal(graph.edges.get(a).some(edge=>edge.to===b&&edge.way==='241873269'),false,'excluded cross-parking segment has no forward edge');
  assert.equal(graph.edges.get(b).some(edge=>edge.to===a&&edge.way==='241873269'),false,'excluded cross-parking segment has no reverse edge');
 }
 assert.ok(graph.edges.get('6986702619').some(edge=>edge.to==='6986702626'&&edge.way==='241873269'),'unrelated segment beyond the scoped C-row correction is retained');
 const target=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url))).destinations['south:HC3'];
 const start=graph.nodes.get('2494511767'),end=[target.lat,target.lon],route=routeRoads(graph,start,end);
 assert.ok(route.available,'the actual through aisle still reaches HC3');
 assert.ok(Math.abs(route.distance-distanceMetres(start,end))<1,'HC3 remains a straight route without an invented diversion');
 assert.ok(route.points.some(point=>distanceMetres(point,graph.nodes.get(cross))<.1),'straight travel passes through the retained road node');
});

test('the incorrect HC/GC C-row tile area has a bounded map patch shared with the graph',()=>{
 const patch=source.mapPatches?.find(p=>p.id==='hc-gc-c-rows');
 assert.ok(patch,'publish the same corrected area for the driving map');
 const contains=point=>{
  let inside=false;
  for(let i=0,j=patch.polygon.length-1;i<patch.polygon.length;j=i++){
   const a=patch.polygon[i],b=patch.polygon[j];
   if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
 };
 for(const point of [[51.3030934,3.2260797],[51.3029911,3.225759],[51.3028818,3.2254166],[51.3027863,3.2251174]])assert.ok(contains(point),'cover the full removed C-row crossing');
 assert.equal(contains([51.31,3.23]),false,'do not mask unrelated terminal areas');
 assert.ok(buildGraph(source).mapPatches.some(p=>p.id===patch.id),'expose correction geometry to the actual driving renderer');
});
