import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as destinationApi from '../public/destinations.mjs';
import {buildGraph,distanceMetres,nearestRoad,routeRoads,parkingKey} from '../public/navigation.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url)));
const atlas=read('data.json'),catalogue=read('destinations.json'),roads=read('roads.json');
const graph=buildGraph(roads),ways=new Map(roads.ways.map(w=>[w.id,w]));
const south=atlas.maps.find(m=>m.id==='south');
const hitFor=code=>({map:south,parking:south.parkings.find(p=>p.code===code),line:'15'});
const position=point=>[point.lat,point.lon];
const nodePosition=id=>graph.nodes.get(id);
const edgeKey=(a,b)=>[a,b].sort().join('|');

function inside(point,polygon){
 let result=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[0]>point[0])!==(b[0]>point[0])&&point[1]<(b[1]-a[1])*(point[0]-a[0])/(b[0]-a[0])+a[1])result=!result;
 }
 return result;
}

function assertDrivableBoundaries(boundaries){
 for(const boundary of boundaries){
  const way=ways.get(boundary.way);
  assert.ok(way,'a matched boundary is an existing road');
  assert.equal(way.oneway,boundary.oneway,'boundary preserves the published road direction');
  for(const [index,id] of boundary.nodes.entries()){
   assert.ok(way.nodes.includes(id),'boundary node belongs to the declared way');
   assert.ok(!way.blocked.includes(id),'boundary node is drivable');
   if(!index)continue;
   const previous=boundary.nodes[index-1];
   assert.equal(Math.abs(way.nodes.indexOf(previous)-way.nodes.indexOf(id)),1,'boundary follows adjacent road nodes');
   assert.ok(!(way.excludedSegments||[]).some(pair=>edgeKey(...pair)===edgeKey(previous,id)),'boundary avoids a closed edge');
  }
 }
}

function assertRoadArrival(point,expected){
 assert.equal(point.roadWay,expected.way);
 assert.deepEqual(point.roadSegment,expected.segment);
 assert.ok(distanceMetres(position(point),expected.approach)<.2,'arrival stays beside its own parking compound');
 const way=ways.get(point.roadWay),[a,b]=point.roadSegment;
 assert.equal(Math.abs(way.nodes.indexOf(a)-way.nodes.indexOf(b)),1,'arrival segment joins adjacent actual nodes');
 const start=nodePosition(a),end=nodePosition(b),arrival=position(point);
 assert.ok(Math.abs(distanceMetres(start,arrival)+distanceMetres(arrival,end)-distanceMetres(start,end))<.02,'arrival lies on its declared boundary segment');
 assert.ok(nearestRoad(graph,arrival).distance<.1,'arrival is on the drivable graph');
 assert.equal(point.lineExact,false);
 assert.equal(point.sourceMap,'south');
 assert.equal(point.sourceRevision,'V1.09-2026');
 assert.equal(point.method,'landmark-junction-match');
 assertDrivableBoundaries(point.junctionMatch.boundaryLanes);
}

const osCases={
 IOS:{approach:[51.30027193324427,3.225050069215693],label:[51.30008138998497,3.2244520683884756],way:'897960053',segment:['8345226650','8345226649'],corners:['6986702453','6986702430','6986702452','6986702454'],boundaryWays:['746582127','746582084','897960053','746582086'],bounds:[560,237,607.5,271.7]},
 JOS:{approach:[51.29908756377935,3.2260121099857226],label:[51.298899080704956,3.225423167136053],way:'897960053',segment:['6987015286','6987015288'],corners:['6986702431','6986702453','6986702454','6986702470'],boundaryWays:['746582127','746582086','897960053','746582091'],bounds:[508,237,555.5,271.7]},
 KOS:{approach:[51.297800346110854,3.2270588567143896],label:[51.29763269548085,3.2265342289034664],way:'897960053',segment:['6987012163','6987012165'],corners:['6986702432','6986702431','6986702470','6986702461'],boundaryWays:['746582127','746582091','897960053','746582088'],bounds:[456.4,237,504,271.7]},
 LOS:{approach:[51.296780244504916,3.2278880602763063],label:[51.29664647765557,3.227455427851564],way:'897960053',segment:['6987012145','6987012147'],corners:['6986702448','6986702432','6986702461','12487521007'],boundaryWays:['746582127','746582088','897960053','746582127'],bounds:[404.5,237,452.5,271.7]},
};

for(const [code,expected] of Object.entries(osCases))test(code+' resolves to its own source-matched northern car bank',()=>{
 const hit=hitFor(code),point=destinationApi.resolveDestination(hit,{},catalogue);
 assert.ok(point,code+' has a built-in approach without a saved GPS position');
 assert.equal(point.automatic,true);assert.equal(point.exactLine,false);
 assertRoadArrival(point,expected);
 assert.deepEqual(point.sourceBounds,expected.bounds);
 assert.deepEqual(point.sourcePoint,[hit.parking.x/3,hit.parking.y/3]);
 assert.deepEqual(point.junctionMatch.cornerNodes,expected.corners);
 assert.deepEqual(point.junctionMatch.boundaryLanes.map(b=>b.way),expected.boundaryWays);
 assert.deepEqual(point.junctionMatch.boundaryLanes.map(b=>b.oneway),code==='IOS'?[false,true,false,false]:[false,false,false,false]);
 assert.ok(distanceMetres(position(point.labelPosition),expected.label)<.2,'display label stays in its own OS bank');
 assert.ok(inside(position(point.labelPosition),expected.corners.map(nodePosition)),'label is interior to the actual parking cell');
 assert.ok(distanceMetres(position(point),position(point.labelPosition))>20,'road arrival and parking label are separate');
 for(const mapId of ['south','bastenaken']){
  const alias=destinationApi.resolveDestination({...hit,map:{id:mapId}},{},catalogue);
  assert.ok(alias);assert.ok(distanceMetres(position(alias),expected.approach)<.2,'Bastenaken uses the current South road match');
 }
 for(const origin of [catalogue.destinations['south:CD1'],catalogue.destinations['south:'+code[0]+'C3']]){
  assert.ok(origin,'comparison start exists');
  assert.equal(routeRoads(graph,position(origin),position(point)).available,true,code+' is reachable from CD1 and its nearby C3 aisle');
 }
});

const posCases={
 ge2:{name:'Near GE2',approach:[51.302794,3.2226073],label:[51.30259982681613,3.2219943635839208],way:'931027303',segment:['6987015338','2494511763'],sourceIndices:[2],bounds:[647.5,239.2,709.8,265.5],nodes:['6987015338','12487521075','12487521076','6986702550','2494511761','2494511763','6987015338'],boundaryWays:['746582122','241873299','931027303']},
 'ee1-de1':{name:'Near EE1 / DE1',approach:[51.3053671,3.22051275],label:[51.30490686729568,3.2201081032845362],way:'931027303',segment:['2494511770','2494511782'],sourceIndices:[0,1],bounds:[719.4,239.2,846.9,265.5],nodes:['2494511761','2494511768','2494511787','2494511789','2494511796','12487521003','2494511782','2494511770','2494511763','2494511761'],boundaryWays:['746582122','931027303','241873299']},
};

test('three printed POS labels represent exactly two explicitly chosen road-boundary compounds',()=>{
 const hit=hitFor('POS');
 assert.ok(hit.parking,'POS is indexed from the current South source');
 assert.equal(hit.parking.points.length,3,'retain all three printed labels');
 const group=catalogue.destinations['south:POS'];
 assert.ok(group,'publish the reviewed POS compounds');
 assert.equal(group.chooseApproach,true);
 assert.deepEqual(group.sourcePoints,hit.parking.points.map(p=>[p.x/3,p.y/3]));
 assert.equal(group.approaches.length,2,'repeated eastern POS labels do not invent a third compound');
 assert.equal(destinationApi.resolveDestination(hit,{},catalogue),null,'generic POS must not silently select the west compound');
 assert.equal(destinationApi.resolveDestination({...hit,approach:'unknown'},{},catalogue),null,'unknown choice must not fall back to an arbitrary coordinate');
 const indices=group.approaches.flatMap(a=>a.sourceIndices).sort();
 assert.deepEqual(indices,[0,1,2],'every source label belongs to exactly one compound');
 assert.ok(distanceMetres(position(group.approaches[0]),position(group.approaches[1]))>250,'the two compounds have genuinely different road arrivals');
});

test('POS exposes two selectable hits and keeps selected parking keys distinct',()=>{
 assert.equal(typeof destinationApi.destinationChoices,'function','resolver exports the explicit-choice helper');
 const hit=hitFor('POS'),choices=destinationApi.destinationChoices(hit,catalogue);
 assert.deepEqual(choices.map(choice=>choice.approach).sort(),['ee1-de1','ge2']);
 const keys=choices.map(choice=>parkingKey(choice));
 assert.equal(new Set(keys).size,2,'saved positions and recents cannot mix the two approaches');
 for(const choice of choices){
  const selected=destinationApi.resolveDestination(choice,{},catalogue);
  assert.ok(selected,'a selected helper hit resolves directly');
  assert.equal(choice.line,'15','the choice preserves the entered line reference');
  assert.equal(selected.exactLine,false);
 }
});

for(const [id,expected] of Object.entries(posCases))test('POS '+expected.name+' follows its actual polygon, source labels and approach road',()=>{
 const point=destinationApi.resolveDestination({...hitFor('POS'),approach:id},{},catalogue);
 assert.ok(point,'selected POS compound resolves without a saved GPS position');
 assert.equal(point.automatic,true);assert.equal(point.exactLine,false);
 assertRoadArrival(point,expected);
 assert.deepEqual(point.sourceIndices,expected.sourceIndices);
 assert.deepEqual(point.sourceBounds,expected.bounds);
 assert.deepEqual(point.junctionMatch.boundaryNodes,expected.nodes);
 assert.deepEqual(point.junctionMatch.boundaryLanes.map(b=>b.way),expected.boundaryWays);
 assert.deepEqual(point.polygon,expected.nodes.map(nodePosition),'polygon is built from actual boundary-road coordinates');
 assert.ok(inside(position(point.labelPosition),point.polygon),'POS label stays inside its own physical compound');
 assert.ok(distanceMetres(position(point.labelPosition),expected.label)<.2,'POS label is tied to its own road-boundary polygon');
 const sources=expected.sourceIndices.map(i=>hitFor('POS').parking.points[i]).map(p=>[p.x/3,p.y/3]);
 assert.deepEqual(point.sourcePoints,sources);
 const [x0,y0,x1,y1]=point.sourceBounds;
 for(const [x,y] of sources)assert.ok(x>x0&&x<x1&&y>y0&&y<y1,'each repeated label belongs to the selected source footprint');
 assert.deepEqual(point.labelPosition.sourceIndices,expected.sourceIndices);
 for(const origin of [catalogue.destinations['south:CD1'],nodePosition('2494511763'),nodePosition('2494511782')]){
  const start=Array.isArray(origin)?origin:position(origin);
  assert.equal(routeRoads(graph,start,position(point)).available,true,'selected POS road arrival is reachable from CD1 and both nearby boundary junctions');
 }
});
