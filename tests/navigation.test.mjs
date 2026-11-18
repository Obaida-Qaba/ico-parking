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
