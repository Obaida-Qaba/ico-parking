import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolveDestination,isAreaApproach} from '../public/destinations.mjs';
const atlas=JSON.parse(readFileSync('public/data.json'));
const catalogue=JSON.parse(readFileSync('public/destinations.json'));
test('BDR and BWH use the identified whole H-field road approach without locating separate boundary strips',()=>{
 const south=atlas.maps.find(m=>m.id==='south');
 for(const code of ['BDR','BWH']){
  const parking=south.parkings.find(p=>p.code===code),pin=resolveDestination({map:south,parking},{},catalogue);
  assert.ok(pin,code+' has a supported H field area approach');assert.equal(isAreaApproach(pin),true);
  assert.deepEqual([pin.lat,pin.lon],[51.3075696,3.2140528]);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.individualParkingVerified,false);assert.deepEqual(pin.supportedMaps,['south']);
  assert.deepEqual(pin.sourcePoints,parking.points.map(p=>[Math.round(p.x/3*1e4)/1e4,Math.round(p.y/3*1e4)/1e4]));
  assert.match(pin.basis,/outer perimeter|quay cap/);
 }
});

test('changed H boundary labels and the underlying field roads stop automatic regeneration',()=>{
 const results=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_h_boundary_area_destinations.py')['build']
a=json.loads(Path('public/data.json').read_text());r=json.loads(Path('public/roads.json').read_text());out=[]
for change in ['BDR','BWH','road']:
 atlas=copy.deepcopy(a);roads=copy.deepcopy(r)
 if change=='road':next(w for w in roads['ways'] if w['id']=='392480112')['points'][0][0]+=.0001
 else:next(p for m in atlas['maps'] if m['id']=='south' for p in m['parkings'] if p['code']==change)['points'][0]['x']+=3
 try:build(atlas,roads);out.append(False)
 except ValueError:out.append(True)
print(json.dumps(out))`],{encoding:'utf8'}));
 assert.deepEqual(results,[true,true,true]);
});
