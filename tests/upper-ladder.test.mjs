import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildGraph,distanceMetres,nearestRoad,routeRoads} from '../public/navigation.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url)));
const catalogue=read('destinations.json').destinations,roads=read('roads.json');
const graph=buildGraph(roads),id=n=>String(n).length<8?'249451'+n:String(n);
const expected=[
 ['G',[1830,1892,6986702477,1842],['241873290','392480112',null,'241873267']],
 ['F',[1842,6986702477,1913,1857],[null,'392480112','241873282','241873267']],
 ['E',[1857,1913,1921,1865],['241873282','392480112','241873278','241873267']],
 ['D',[1865,1921,1933,1869],['241873278','392480112',null,'241873267']],
];

test('the upper A/B ladder follows the independent CF1/VPC cross-road anchor, leaving the outer H field free',()=>{
 const cf1=catalogue['south:CF1'];
 assert.ok(Math.abs(cf1.sourceBounds[3]-264.9)<.01);
 assert.ok(distanceMetres(graph.nodes.get(id(1860)),graph.nodes.get(id(1857)))<10,'CF1 south edge and F south edge meet at the same physical cross-road');
 for(const [row,corners,boundaries] of expected)for(const letter of 'AB'){
  const point=catalogue['south:'+letter+row+'1'];assert.ok(point);
  assert.deepEqual(point.junctionMatch.cornerNodes,corners.map(id),row+' cannot borrow the next field north');
  assert.deepEqual(point.junctionMatch.boundaryLanes.map(lane=>lane.way),boundaries);
  assert.equal(point.lineExact,false);
  for(const start of ['south:CD1','south:HC1','north:BB']){
   const origin=catalogue[start],route=routeRoads(graph,[origin.lat,origin.lon],[point.lat,point.lon]);
   assert.ok(route.available,start+' reaches corrected '+letter+row+'1');assert.ok(route.endOffset<.1);
  }
 }
 const f=catalogue['south:BF1'];assert.ok(Math.abs(f.sourceBounds[3]-cf1.sourceBounds[3])<.3,'printed F/CF1 southern edges coincide');
 assert.equal(f.junctionMatch.cornerNodes[3],id(1857),'the shared source edge must use its VPC-adjacent physical junction');
});

test('quay bands move with the corrected D/E/F/G field ladder',()=>{
 const way=roads.ways.find(way=>way.id==='392480112');
 for(const [code,first,last] of [['BWD',1921,1933],['BWE',1913,1921],['BWF',1892,1913],['MAX',1892,1913]]){
  const point=catalogue['south:'+code],boundary=point.junctionMatch.boundaryLanes[0];
  assert.equal(boundary.nodes[0],id(first),code+' starts beside its actual field');
  assert.equal(boundary.nodes.at(-1),id(last),code+' ends beside its actual field');
  const a=way.nodes.indexOf(id(first)),b=way.nodes.indexOf(id(last));
  const lane={...way,nodes:way.nodes.slice(a,b+1),points:way.points.slice(a,b+1)};
  assert.ok(nearestRoad(buildGraph({ways:[lane]}),[point.lat,point.lon]).distance<.1,'arrival stays on the corrected quay band');
 }
});

test('changed ladder geometry, traffic direction, closures or source labels stop regeneration',()=>{
 for(const mutation of ['geometry','direction','closure','source']){
  const result=JSON.parse(execFileSync('python',['-c',`import json,runpy
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();raw=Path.read_text;roads=json.loads(raw(root/'public/roads.json'));atlas=json.loads(raw(root/'public/data.json'))
road=next(w for w in roads['ways'] if w['id']=='241873278')
if '${mutation}'=='geometry':road['points'][0][1]+=.0003
elif '${mutation}'=='direction':road['oneway']=True
elif '${mutation}'=='closure':road['blocked']=[road['nodes'][0]]
else:
 parking=next(p for m in atlas['maps'] if m['id']=='south' for p in m['parkings'] if p['code']=='AF1');parking['points'][0]['x']+=5000
def read(path,*args,**kwargs):
 if path==root/'public/roads.json':return json.dumps(roads)
 if path==root/'public/data.json':return json.dumps(atlas)
 return raw(path,*args,**kwargs)
try:
 with patch.object(Path,'read_text',read):runpy.run_path('scripts/build_south_east_destinations.py')
 print(json.dumps({'rejected':False}))
except ValueError as error:print(json.dumps({'rejected':True,'reason':str(error)}))`],{cwd:new URL('../',import.meta.url),encoding:'utf8'}));
  assert.equal(result.rejected,true,mutation+' must not silently retain the checked field alignment');
 }
});
