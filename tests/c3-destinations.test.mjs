import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveDestination} from '../public/destinations.mjs';
import {buildGraph,distanceMetres,routeRoads} from '../public/navigation.mjs';
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const graph=buildGraph(JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url))));
const south=atlas.maps.find(m=>m.id==='south');
const cases={
 IC3:{lower:['6986702466','2494511750'],upper:'1228590688',label:[51.30065780746,3.22703978581]},
 JC3:{lower:['6986702472','6986702466'],upper:'746582137',label:[51.29930807132,3.22814098664]},
 KC3:{lower:['6986702467','6986702472'],upper:'746582137',label:[51.29794861941,3.22924788287]},
 LC3:{lower:['6986702465','6986702467'],upper:'746582137',label:[51.29659613477,3.23034833906]}
};
test('JC3 and neighbouring I-L C3 references route along the actual continuation without saved positions',()=>{
 for(const [code,expected] of Object.entries(cases)){
  const parking=south.parkings.find(p=>p.code===code);
  const pin=resolveDestination({map:south,parking,line:'15'},{},catalogue);
  assert.ok(pin,code+' must have a built-in road destination');
  assert.equal(pin.automatic,true);assert.equal(pin.exactLine,false);
  assert.equal(pin.roadWay,'746582089',code+' uses the real I-L continuation, not the G/H-only road');
  assert.deepEqual(pin.roadSegment,expected.lower,code+' ends beside its own parking column');
  assert.deepEqual(pin.labelPosition.boundaryWays,['746582089',expected.upper]);
  assert.ok(distanceMetres([pin.labelPosition.lat,pin.labelPosition.lon],expected.label)<.2,code+' stays in its own matched C3 strip');
  assert.equal(pin.labelPosition.edgeEstimate,false);
  const start=catalogue.destinations['south:CD1'];
  assert.equal(routeRoads(graph,[start.lat,start.lon],[pin.lat,pin.lon]).available,true,code+' has a connected allowed driving route');
 }
});
