import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectTerminal} from '../public/location-context.mjs';

const data=JSON.parse(readFileSync(new URL('../public/terminals.json',import.meta.url)));
const fix=(lat,lon)=>({lat,lon,accuracy:5,timestamp:Date.now()});

test('Nissan context covers the source-matched western ICO car compound',()=>{
 for(const p of [[51.3187,3.2059],[51.3208,3.2044]]){
  assert.equal(detectTerminal(fix(...p),data)?.id,'nissan',`${p}: western ICO4070 compound`);
 }
});

test('the eastern BNFW4130 concession cannot select Nissan context',()=>{
 assert.notEqual(detectTerminal(fix(51.317,3.2105),data)?.id,'nissan');
});
