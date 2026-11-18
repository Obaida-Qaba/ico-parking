import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectTerminal} from '../public/location-context.mjs';

const data=JSON.parse(readFileSync(new URL('../public/terminals.json',import.meta.url)));
const fix=(lat,lon,accuracy=5)=>({lat,lon,accuracy,timestamp:Date.now()});

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
