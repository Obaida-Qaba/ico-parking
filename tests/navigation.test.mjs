import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, routeRoads, distanceMetres, parkingKey, validPin} from '../public/navigation.mjs';
const point=(x,y)=>[51.3+y*.0001,3.23+x*.0001];
function network(oneway=false,restrictions=[]) {
 return buildGraph({ways:[
 {id:'top',nodes:['a','b','c'],points:[point(0,0),point(1,0),point(2,0)],oneway,name:'Top'},
 {id:'around',nodes:['a','d','e','c'],points:[point(0,0),point(0,2),point(2,2),point(2,0)],name:'Around'}],restrictions});
}
test('routes along connected road geometry, not a straight line through a block',()=>{
 const graph=network();const route=routeRoads(graph,point(0,1),point(2,1),{maxSnap:4});
 assert.ok(route.available);assert.ok(route.points.length>=4);
 assert.ok(route.distance>distanceMetres(point(0,1),point(2,1)));
 assert.ok(route.points.some(p=>Math.abs(p[0]-point(0,2)[0])<1e-8));
});
test('honours one way directions, including two endpoints on the same road',()=>{
 const graph=network(true);
 const forward=routeRoads(graph,point(.2,0),point(1.8,0),{maxSnap:3});
 const backward=routeRoads(graph,point(1.8,0),point(.2,0),{maxSnap:3});
 assert.ok(forward.available&&backward.available);assert.ok(backward.distance>forward.distance*2);
});
test('reports missing road coverage and disconnected networks without fabricating connections',()=>{
 assert.equal(routeRoads(network(),point(100,100),point(0,0),{maxSnap:20}).available,false);
 const graph=buildGraph({ways:[{id:'a',nodes:['a','b'],points:[point(0,0),point(1,0)]},{id:'b',nodes:['c','d'],points:[point(4,0),point(5,0)]}]});
 assert.equal(routeRoads(graph,point(0,0),point(5,0),{maxSnap:2}).available,false);
});
test('turn restrictions remove forbidden transitions',()=>{
 const graph=buildGraph({ways:[{id:'one',nodes:['a','b'],points:[point(0,0),point(1,0)]},{id:'two',nodes:['b','c'],points:[point(1,0),point(1,1)]}],restrictions:[{from:'one',via:'b',to:'two',type:'no_right_turn'}]});
 assert.equal(routeRoads(graph,point(.2,0),point(1,.8),{maxSnap:2}).available,false);
});
test('parking keys distinguish terminals and exact line destinations',()=>{
 assert.equal(parkingKey({map:{id:'hanze'},parking:{code:'H61'},line:'15'}),'south:H61:15');
 assert.equal(parkingKey({map:{id:'south'},parking:{code:'H61'},line:null}),'south:H61:parking');
 assert.notEqual(parkingKey({map:{id:'north'},parking:{code:'H61'}}),parkingKey({map:{id:'south'},parking:{code:'H61'}}));
});
test('only genuine finite, bounded saved coordinates can become navigation targets',()=>{
 assert.ok(validPin({lat:51.3,lon:3.23,method:'gps',accuracy:8}));
 for(const pin of [{lat:null,lon:3.23},{lat:Infinity,lon:3},{lat:95,lon:3},{lat:51.3,lon:200},{lat:'51.3',lon:3.2}])assert.equal(validPin(pin),false);
});

test('a moving driver already entering a junction still obeys its turn restriction',()=>{
 const graph=buildGraph({ways:[
   {id:'incoming',nodes:['a','j'],points:[point(0,0),point(10,0)],oneway:true},
   {id:'north',nodes:['j','c'],points:[point(10,0),point(10,10)]},
   {id:'detour',nodes:['j','d','e','c'],points:[point(10,0),point(20,0),point(20,10),point(10,10)]}
 ],restrictions:[{from:'incoming',via:'j',to:'north',type:'no_left_turn'}]});
 const route=routeRoads(graph,point(10,0),point(10,10),{heading:90,accuracy:3});
 assert.ok(route.available);
 assert.ok(route.distance>distanceMetres(point(10,0),point(10,10))*2,'use permitted detour rather than forgetting the incoming road');
});

test('a junction direct-segment shortcut cannot bypass the incoming turn restriction',()=>{
 const graph=buildGraph({ways:[
  {id:'outgoing',nodes:['j','c'],points:[point(10,0),point(20,0)],oneway:true},
  {id:'incoming',nodes:['a','j'],points:[point(0,0),point(10,0)],oneway:true}
 ],restrictions:[{from:'incoming',via:'j',to:'outgoing',type:'no_straight_on'}]});
 assert.equal(routeRoads(graph,point(10,0),point(18,0),{heading:90,accuracy:3}).available,false);
});

test('a no-u-turn restriction between separate ways blocks that transition',()=>{
 const graph=buildGraph({ways:[
  {id:'in',nodes:['a','j'],points:[point(0,0),point(10,0)],oneway:true},
  {id:'out',nodes:['j','b'],points:[point(10,0),point(0,1)],oneway:true}
 ],restrictions:[{from:'in',via:'j',to:'out',type:'no_u_turn'}]});
 assert.equal(routeRoads(graph,point(2,0),point(2,.8)).available,false);
});

const metrePoint=(x,y)=>[51.3+y/111195,3.23+x/(111195*Math.cos(51.3*Math.PI/180))];
test('starting at a one-way junction allows other legal outgoing roads immediately',()=>{
 const a=metrePoint(0,0),b=metrePoint(100,0),c=metrePoint(0,10);
 const graph=buildGraph({ways:[
  {id:'first',nodes:['a','b'],points:[a,b],oneway:true},
  {id:'short',nodes:['a','c'],points:[a,c]},
  {id:'around',nodes:['b','c'],points:[b,c]}
 ]});
 const route=routeRoads(graph,a,c,{maxSnap:1});
 assert.ok(route.available);
 assert.ok(Math.abs(route.distance-distanceMetres(a,c))<.01,'choose 10 m outgoing road rather than a 200 m loop');
 assert.equal(route.points.length,2);
});
test('arriving at the final node of a one-way road does not require driving that road first',()=>{
 const a=metrePoint(0,0),b=metrePoint(100,0),d=metrePoint(100,10);
 const graph=buildGraph({ways:[
  {id:'first',nodes:['a','b'],points:[a,b],oneway:true},
  {id:'short',nodes:['d','b'],points:[d,b]},
  {id:'around',nodes:['d','a'],points:[d,a]}
 ]});
 const route=routeRoads(graph,d,b,{maxSnap:1});
 assert.ok(route.available);
 assert.ok(Math.abs(route.distance-distanceMetres(d,b))<.01,'arrive at junction by direct 10 m road rather than a 200 m loop');
 assert.equal(route.points.length,2);
});
function parallelLanes(){
 return buildGraph({ways:[
  {id:'east',nodes:['a','b'],points:[metrePoint(0,0),metrePoint(100,0)],oneway:true},
  {id:'west',nodes:['c','d'],points:[metrePoint(100,10),metrePoint(0,10)],oneway:true},
  {id:'right',nodes:['b','c'],points:[metrePoint(100,0),metrePoint(100,10)],oneway:true},
  {id:'left',nodes:['d','a'],points:[metrePoint(0,10),metrePoint(0,0)],oneway:true}
 ]});
}
test('travel course disambiguates nearby opposite one-way lanes inside GPS uncertainty',()=>{
 const graph=parallelLanes(),start=metrePoint(40,6),end=metrePoint(90,0);
 const route=routeRoads(graph,start,end,{maxSnap:15,heading:90,accuracy:8});
 assert.ok(route.available);
 assert.ok(route.distance<51,'east-facing GPS selects the plausible eastbound lane instead of a wrong-way loop');
 assert.ok(distanceMetres(route.points[0],metrePoint(40,0))<.01);
});
test('course matching never reaches a different road beyond reported GPS uncertainty',()=>{
 const graph=parallelLanes();
 const route=routeRoads(graph,metrePoint(40,6),metrePoint(90,0),{maxSnap:15,heading:90,accuracy:3});
 assert.ok(route.available);
 assert.ok(distanceMetres(route.points[0],metrePoint(40,10))<.01,'road 6 m away must not replace the nearest road when uncertainty is only 3 m');
 assert.ok(route.distance>100,'one-way law is preserved even when the chosen lane disagrees with course');
});
