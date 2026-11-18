import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveDestination} from '../public/destinations.mjs';
import {buildGraph,distanceMetres,nearestRoad,routeRoads} from '../public/navigation.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url)));
const atlas=read('data.json'),catalogue=read('destinations.json'),roads=read('roads.json');
const graph=buildGraph(roads),south=atlas.maps.find(map=>map.id==='south');
const position=p=>[p.lat,p.lon];
const columns={
 I:{west:'746582086',east:'746582127',westNodes:['6986702454','6986702580','6986702640','6986702455'],eastNodes:['6986702468','6986702579','6986702638','2494511748']},
 J:{west:'746582091',east:'746582086',westNodes:['6986702470','6986702581','6986702641','6986702471'],eastNodes:['6986702454','6986702580','6986702640','6986702455']},
 K:{west:'746582088',east:'746582091',westNodes:['6986702461','6986702582','6986702642','6986702462'],eastNodes:['6986702470','6986702581','6986702641','6986702471']},
 L:{west:'746582075',east:'746582088',westNodes:['6986702441','6986702572','6986702639','6986702386'],eastNodes:['6986702461','6986702582','6986702642','6986702462']},
};
const rows=[{number:3,north:'897960053',south:'746582126'},{number:2,north:'746582126',south:'746582140'},{number:1,north:'746582140',south:'746582074'}];

function inside(point,polygon){
 let result=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[0]>point[0])!==(b[0]>point[0])&&point[1]<(b[1]-a[1])*(point[0]-a[0])/(b[0]-a[0])+a[1])result=!result;
 }
 return result;
}

function checkArrival(code,expectedWay,corners){
 const parking=south.parkings.find(p=>p.code===code);
 const point=resolveDestination({map:south,parking,line:'15'},{},catalogue);
 assert.ok(point,code+' has an independently matched boundary-road approach');
 assert.equal(point.automatic,true);assert.equal(point.exactLine,false);assert.equal(point.lineExact,false);
 assert.equal(point.roadWay,expectedWay);
 assert.deepEqual(point.junctionMatch.cornerNodes,corners);
 assert.ok(nearestRoad(graph,position(point)).distance<.1,'arrival stays on real drivable geometry');
 const road=roads.ways.find(w=>w.id===point.roadWay),[a,b]=point.roadSegment;
 assert.equal(Math.abs(road.nodes.indexOf(a)-road.nodes.indexOf(b)),1,'arrival is on an adjacent actual road edge');
 const [x0,y0,x1,y1]=point.sourceBounds,[x,y]=point.sourcePoint;
 assert.ok(x>x0&&x<x1&&y>y0&&y<y1,'source label stays in its own printed footprint');
 assert.ok(inside(position(point.labelPosition),corners.map(n=>graph.nodes.get(n))),'display label is inside its actual cell');
 for(const boundary of point.junctionMatch.boundaryLanes){
  const way=roads.ways.find(w=>w.id===boundary.way);
  assert.equal(way.oneway,boundary.oneway);
  for(let i=1;i<boundary.nodes.length;i++){
   const a=boundary.nodes[i-1],b=boundary.nodes[i];
   assert.equal(Math.abs(way.nodes.indexOf(a)-way.nodes.indexOf(b)),1,'boundary follows actual adjacent nodes');
   assert.ok(graph.edges.get(a).some(e=>e.to===b&&e.way===way.id)||graph.edges.get(b).some(e=>e.to===a&&e.way===way.id),'boundary remains drivable');
  }
 }
 const start=catalogue.destinations['south:CD1'];
 assert.equal(routeRoads(graph,position(start),position(point)).available,true,'arrival is connected from the VPC road network');
 return point;
}

for(const [letter,column] of Object.entries(columns))for(const [i,row] of rows.entries())test(letter+'E'+row.number+' matches its own lane cell beside the ZOUT warehouse',()=>{
 const code=letter+'E'+row.number;
 const corners=[column.westNodes[i],column.eastNodes[i],column.eastNodes[i+1],column.westNodes[i+1]];
 const point=checkArrival(code,row.south,corners);
 assert.deepEqual(point.junctionMatch.boundaryLanes.map(b=>b.way),[row.north,column.east,row.south,column.west]);
 assert.deepEqual(point.junctionMatch.boundaryLanes.map(b=>b.oneway),[i>0,false,i<2,false]);
 const p=south.parkings.find(p=>p.code===code);
 assert.deepEqual(point.sourcePoint,[p.x/3,p.y/3]);
 const midpoint=column.westNodes.slice(i+1,i+2).map(n=>graph.nodes.get(n))[0].map((value,axis)=>(value+graph.nodes.get(column.eastNodes[i+1])[axis])/2);
 assert.ok(distanceMetres(position(point),midpoint)<6,'arrival stays near the centre of its own southern lane');
});

test('GE2 uses the real curved northern forecourt and GE1 uses the southern ZOUT-side road',()=>{
 const ge2=checkArrival('GE2','931027303',['6986702548','2494511763','6986702591','6986702589']);
 const ge1=checkArrival('GE1','746582074',['6986702589','6986702591','2494511766','2494511754']);
 assert.deepEqual(ge2.junctionMatch.boundaryLanes.map(b=>b.way),['931027303','241873299','746582130','746582128']);
 assert.deepEqual(ge1.junctionMatch.boundaryLanes.map(b=>b.way),['746582130','241873299','746582074','746582130']);
 assert.ok(distanceMetres(position(ge1),position(ge2))>50,'the GE blocks retain different independently matched arrivals');
 assert.ok(ge1.sourcePoint[1]>286,'GE1 uses the visible bold lower label, not the overpainted old GE1 text under GE2');
 assert.equal(ge1.scope,'parking-approach','invisible old text must not invent a repeated parking group');
});
