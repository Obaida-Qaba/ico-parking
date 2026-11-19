import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildGraph,routeRoads,parkingKey} from '../public/navigation.mjs';
import {isAreaEntry,resolveDestination} from '../public/destinations.mjs';

const cwd=new URL('../',import.meta.url);
const run=code=>JSON.parse(execFileSync('python',['-c',code],{cwd,encoding:'utf8'}));
const build=()=>run("import json,runpy;print(json.dumps(runpy.run_path('scripts/build_legacy_vpc_area_destinations.py')['build']()))");
const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
const published=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));

test('only old VPC/VPC1 use the independently identified service-area junction',()=>{
 const data=build();assert.deepEqual(Object.keys(data.destinations).sort(),['bastenaken:VPC','bastenaken:VPC1']);
 const graph=buildGraph(roads),start=published.destinations['south:CD1'];
 for(const [code,expected] of [['VPC',[288,328.3333]],['VPC1',[260.6667,307.6667]]]){
  const p=data.destinations['bastenaken:'+code];assert.deepEqual([p.lat,p.lon],[51.3082167,3.2192177]);
  assert.equal(p.areaName,'VPC service area (older plan)');assert.equal(p.precision,'area-entry-only');
  assert.equal(p.historical,true);assert.equal(p.individualParkingVerified,false);assert.equal(p.lineExact,false);
  assert.equal(p.arrivalNode,'6986702536');assert.equal(p.roadWay,'746582117');
  assert.deepEqual(p.roadSegment,['6986702539','6986702536']);
  assert.deepEqual([p.labelPosition.lat,p.labelPosition.lon],[p.lat,p.lon]);
  for(let axis=0;axis<2;axis++)assert.ok(Math.abs(p.sourcePoint[axis]-expected[axis])<.01);
  assert.equal(p.flightEvidence.flightDate,'2026-03-05');assert.equal(p.flightEvidence.featureId,'4');
  const hit={map:{id:'bastenaken'},parking:{code},line:'15'};
  assert.equal(isAreaEntry(resolveDestination(hit,{},data)),true);
  const saved={[parkingKey({...hit,line:null})]:{lat:start.lat,lon:start.lon,method:'gps',accuracy:3}};
  assert.equal(isAreaEntry(resolveDestination(hit,saved,data)),false,'an on-site saved refinement retains ordinary routing');
  const route=routeRoads(graph,[start.lat,start.lon],[p.lat,p.lon]);assert.ok(route.available);assert.ok(route.endOffset<.1);
 }
 for(const code of ['TES','PRE','CLT1','CLT2','DLT'])assert.ok(data.notAdded.includes(code));
 assert.equal(data.regions[0].boundaryLanes.length,4);
});

test('a moved source glyph, changed entry junction, reversed one-way or closed approach requires review',()=>{
 for(const mutation of ['source','junction','direction','closure']){
  const response=run(`import copy,json,runpy
from pathlib import Path
m=runpy.run_path('scripts/build_legacy_vpc_area_destinations.py');root=Path.cwd()
atlas=json.loads((root/'public/data.json').read_text());roads=json.loads((root/'public/roads.json').read_text())
if '${mutation}'=='source':
 old=next(m for m in atlas['maps'] if m['id']=='bastenaken');next(p for p in old['parkings'] if p['code']=='VPC1')['points'][0]['y']+=12
elif '${mutation}'=='junction':next(w for w in roads['ways'] if w['id']=='746582117')['points'][2][0]+=.0001
elif '${mutation}'=='direction':next(w for w in roads['ways'] if w['id']=='1349890082')['oneway']=False
else:next(w for w in roads['ways'] if w['id']=='746582117')['excludedSegments']=[['6986702539','6986702536']]
try:m['build'](atlas,roads);print(json.dumps({'rejected':False}))
except ValueError as e:print(json.dumps({'rejected':True,'reason':str(e)}))`);
  assert.equal(response.rejected,true,mutation+' cannot silently retain the old-source match');
 }
});
