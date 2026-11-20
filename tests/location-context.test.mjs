import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectTerminal,destinationOverview} from '../public/location-context.mjs';

const data=JSON.parse(readFileSync(new URL('../public/terminals.json',import.meta.url)));
const fix=(lat,lon,accuracy=5)=>({lat,lon,accuracy,timestamp:Date.now()});

test('unlocated destinations have terminal overview bounds without inventing a parking point',()=>{
 for(const [map,terminal,expected] of [['south','bastenaken','bastenaken'],['bastenaken',null,'bastenaken'],['toyota','toyota','toyota'],['north',null,'north']]){
  const area=destinationOverview({map:{id:map},parking:{code:'UNKNOWN',terminal}},data);
  assert.equal(area.id,expected);assert.equal(area.precision,'terminal-overview-only');assert.equal(area.routable,false);
  assert.equal(area.lat,undefined);assert.equal(area.lon,undefined);
  const polygon=data.regions.find(r=>r.id===expected).polygon;
  assert.deepEqual(area.bounds,[[Math.min(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1]))],[Math.max(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[1]))]]);
 }
 assert.equal(destinationOverview({map:{id:'missing'},parking:{code:'X'}},data),null,'no made-up viewport for an unknown source');
});

test('real terminal interiors choose their own local search context',()=>{
 for(const [lat,lon,id] of [[51.301,3.242,'toyota'],[51.29689,3.24508,'hanze'],[51.30217,3.22683,'bastenaken'],[51.326,3.213,'north'],[51.3187,3.2059,'nissan']]){
  const terminal=detectTerminal(fix(lat,lon),data);
  assert.equal(terminal?.id,id,`${lat}, ${lon}`);
  assert.equal(terminal.mapId,['bastenaken','hanze'].includes(id)?'south':id,'southern regions select the current combined plan');
 }
});

test('outside the port and unrelated nearby industrial sites do not select a terminal',()=>{
 for(const p of [[50.85,4.35],[51.33,3.18],[51.3008,3.2496],[51.307,3.242],[51.3218156,3.2131578]])assert.equal(detectTerminal(fix(...p),data),null);
});

test('invalid, poor and stale GPS fixes cannot guess a local terminal',()=>{
 for(const value of [null,{lat:51.301,lon:3.242},{lat:'51.301',lon:3.242,accuracy:5},fix(95,3.242),fix(51.301,3.242,120),{...fix(51.301,3.242),timestamp:Date.now()-60000}])assert.equal(detectTerminal(value,data),null);
});

test('an uncertain Toyota Hanze boundary does not flip a previously established area',()=>{
 const boundary=fix(51.29968,3.244);
 assert.equal(detectTerminal(boundary,data,{previous:{id:'toyota'}})?.id,'toyota');
 assert.equal(detectTerminal(boundary,data,{previous:'hanze'})?.id,'hanze');
 assert.equal(detectTerminal(boundary,data)?.id,'south','broad southern context is safer than inventing a precise area');
 assert.equal(detectTerminal(fix(51.29689,3.24508),data,{previous:'toyota'})?.id,'hanze','a clear move to another terminal still changes the context');
});
