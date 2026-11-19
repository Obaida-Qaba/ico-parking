import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads,distanceMetres} from '../public/navigation.mjs';
import {resolveDestination,isAreaEntry} from '../public/destinations.mjs';

const cwd=new URL('../',import.meta.url);
const run=code=>JSON.parse(execFileSync('python',['-c',code],{cwd,encoding:'utf8'}));
const result=()=>run("import json,runpy;print(json.dumps(runpy.run_path('scripts/build_north_remaining_destinations.py')['RESULT']))");
const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));

test('Q9/Q10 and KB reach their separately identified compound entrances, without claiming individual bays',()=>{
 const output=result(),graph=buildGraph(roads),origin=catalogue.destinations['north:BB'];
 for(const [code,way,nodes,point] of [
  ['Q9','241878076',['2494558944','2494558932'],[51.3224706,3.2084415]],
  ['Q10','241878076',['2494558944','2494558932'],[51.3224706,3.2084415]],
  ['KB','241878055',['2494558929','2494558928'],[51.3193662,3.2080204]],
 ]){
  const p=output.destinations['north:'+code];assert.ok(p,code+' has an independently bounded area entrance');
  assert.equal(p.roadWay,way);assert.deepEqual(p.roadSegment,nodes);assert.deepEqual([p.lat,p.lon],point);
  assert.equal(p.precision,'area-entry-only');assert.equal(p.individualParkingVerified,false);
  assert.equal(p.lineExact,false);assert.match(p.name,/area entrance/i);
  assert.equal(p.provenance.imageryFlightDate,'2026-03-05');
  assert.ok(p.sourcePoint[0]>=p.sourceBounds[0]&&p.sourcePoint[0]<=p.sourceBounds[2]);
  assert.ok(p.sourcePoint[1]>=p.sourceBounds[1]&&p.sourcePoint[1]<=p.sourceBounds[3]);
  const resolved=resolveDestination({map:{id:'north'},parking:{code},line:'15'},{},{destinations:output.destinations});
  assert.equal(isAreaEntry(resolved),true);
  const snap=nearestRoad(graph,point);assert.ok(snap.distance<.1);
  const route=routeRoads(graph,[origin.lat,origin.lon],point);assert.ok(route.available);assert.ok(route.endOffset<.1);
  const region=output.regions.find(r=>r.id===p.region);assert.ok(region.polygon.length>=4);assert.ok(region.boundaryControls.length>=3);
 }
 assert.ok(distanceMetres([output.destinations['north:Q9'].lat,output.destinations['north:Q9'].lon],[output.destinations['north:KB'].lat,output.destinations['north:KB'].lon])>300,'separate compounds never share a generic gate');
 for(const code of ['P','Q2','DRU'])assert.deepEqual(output.destinations['north:'+code],catalogue.destinations['north:'+code],'existing reviewed '+code+' is preserved');
 for(const code of ['KA','KE'])assert.ok(output.unresolved.some(row=>row.key==='north:'+code),'an unverified opposite warehouse-side strip stays unresolved');
});

test('changed printed references and closed area approaches invalidate the match',()=>{
 for(const mutation of ['source','closure']){
  const response=run(`import json,runpy
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();raw=Path.read_text;data=json.loads(raw(root/'public/data.json'));roads=json.loads(raw(root/'public/roads.json'))
if '${mutation}'=='source':
 m=next(m for m in data['maps'] if m['id']=='north');next(p for p in m['parkings'] if p['code']=='Q9')['points'][0]['x']+=15
else:next(w for w in roads['ways'] if w['id']=='241878076')['excludedSegments']=[['2494558944','2494558932']]
def read(path,*args,**kwargs):
 if path==root/'public/data.json':return json.dumps(data)
 if path==root/'public/roads.json':return json.dumps(roads)
 return raw(path,*args,**kwargs)
try:
 with patch.object(Path,'read_text',read):runpy.run_path('scripts/build_north_remaining_destinations.py')
 print(json.dumps({'rejected':False}))
except ValueError as error:print(json.dumps({'rejected':True,'reason':str(error)}))`);
  assert.equal(response.rejected,true,mutation+' cannot silently retain an area entrance');
 }
});
