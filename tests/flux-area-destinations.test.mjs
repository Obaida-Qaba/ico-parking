import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url);
const builder=new URL('../scripts/build_flux_area_destinations.py',import.meta.url);
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_flux_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:2e6}));
const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const codes=['DRTOY','DRWWL','DRFLX'];

test('FLUX references have a builder for a shared road approach',()=>{
 assert.ok(existsSync(builder),'the reviewed FLUX area approach must have its own builder');
});

test('three FLUX callouts share the real boundary junction without invented interior locations',{skip:!existsSync(builder)},()=>{
 const result=candidate();
 assert.deepEqual(Object.keys(result.destinations).sort(),codes.map(code=>'south:'+code).sort());
 for(const code of codes){
  const pin=result.destinations['south:'+code];
  assert.equal(pin.areaName,'FLUX area');assert.equal(pin.precision,'area-approach-only');
  assert.equal(pin.scope,'parking-group-approach');assert.equal(pin.individualParkingVerified,false);
  assert.equal(pin.lineExact,false);assert.equal(pin.name,code+' · area approach');
  assert.deepEqual([pin.lat,pin.lon],[51.3037181,3.2372862]);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.labelPosition.precision,'area-approach-only');
  assert.equal(pin.arrivalNode,'2494477575');assert.equal(pin.roadWay,'241869946');
  assert.match(pin.areaAccessNote,/gate.*not.*confirmed/i);
 }
 assert.equal(result.destinations['south:DRALD'],undefined,'ALD must not be folded into the separate FLUX compound');
 assert.equal(result.unresolved[0].key,'south:DRALD');
 assert.equal(result.unresolved[0].sourceMap,'south');
 assert.equal(result.regions.length,1);
 const boundaries=result.regions[0].boundaryLanes;
 assert.deepEqual(boundaries.map(b=>b.way),['241869964','241869927','746744824','241869944','241869946']);
 boundaries.forEach((b,i)=>assert.equal(b.nodes.at(-1),boundaries[(i+1)%boundaries.length].nodes[0],'boundary chains close without any invented graph connection'));
 assert.equal(boundaries.find(b=>b.way==='241869927').oneway,true);
});

test('source leader labels remain distinct source evidence and are never used as geographic positions',{skip:!existsSync(builder)},()=>{
 const result=candidate(),south=atlas.maps.find(m=>m.id==='south');
 const sourcePositions=new Set();
 for(const code of codes){
  const pin=result.destinations['south:'+code],source=south.parkings.find(p=>p.code===code);
  assert.equal(pin.sourceRevision,'V1.09-2026');assert.equal(pin.sourcePage,1);
  assert.equal(pin.sourcePointUnits,'uncropped original PDF points');
  assert.ok(Math.abs(pin.sourcePoint[0]-source.x/3)<.02&&Math.abs(pin.sourcePoint[1]-source.y/3)<.02);
  sourcePositions.add(JSON.stringify(pin.sourcePoint));
  assert.equal(pin.sourceLeader.geographicPosition,false);
  assert.equal(pin.sourceLeader.references,'FLUX compound');
  assert.equal(pin.sourceAreaBoundsBasis,'Drawing outline only; not a geographic polygon.');
  assert.ok(pin.imageryEvidence.reviewImageRequest.bboxLonLat);
  assert.equal(pin.imageryEvidence.flightDate,undefined,'an unqueried capture date cannot be asserted');
 }
 assert.equal(sourcePositions.size,3,'three distinct printed callouts are retained despite one shared geographic approach');
 assert.notDeepEqual(result.unresolved[0].sourcePoint,result.destinations['south:DRTOY'].sourcePoint);
});

test('the shared approach is reached on existing road geometry',{skip:!existsSync(builder)},()=>{
 const result=candidate(),graph=buildGraph(roads),way=roads.ways.find(w=>w.id==='241869946');
 const origin=way.points[way.nodes.indexOf('2494477505')];
 for(const pin of Object.values(result.destinations)){
  const position=[pin.lat,pin.lon],snap=nearestRoad(graph,position),route=routeRoads(graph,origin,position);
  assert.ok(snap.distance<.1);assert.ok(route.available);assert.ok(route.endOffset<.1);
  assert.ok(route.distance>350&&route.distance<500,'the connected south distributor supplies the actual approach');
  assert.deepEqual(route.points.at(-1),position);
  assert.ok(route.points.every(point=>way.points.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-8)),
   'this approach follows the reviewed distributor instead of crossing parking cells');
 }
});

test('each boundary geometry, access, direction, closure and actual source identity must be reviewed after changes',{skip:!existsSync(builder)},()=>{
 const response=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_flux_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text(encoding='utf-8'));atlas=json.loads(Path('public/data.json').read_text(encoding='utf-8'))
results=[]
for ident in ['241869946','241869944','241869964','241869927','746744824']:
 for change in ['geometry','oneway','private','blocked','excluded']:
  roads=copy.deepcopy(base);source=copy.deepcopy(atlas);way=next(w for w in roads['ways'] if w['id']==ident)
  if change=='geometry':way['points'][0][0]+=.0001
  if change=='oneway':way['oneway']=not way['oneway']
  if change=='private':way['private']=False
  if change=='blocked':way['blocked']=[way['nodes'][0]]
  if change=='excluded':way['excludedSegments']=[way['nodes'][:2]]
  try:build(source,roads);results.append({'change':ident+':'+change,'rejected':False})
  except ValueError:results.append({'change':ident+':'+change,'rejected':True})
for code in ['DRTOY','DRWWL','DRFLX','DRALD']:
 roads=copy.deepcopy(base);source=copy.deepcopy(atlas)
 next(p for m in source['maps'] if m['id']=='south' for p in m['parkings'] if p['code']==code)['points'][0]['x']+=3
 try:build(source,roads);results.append({'change':'source:'+code,'rejected':False})
 except ValueError:results.append({'change':'source:'+code,'rejected':True})
print(json.dumps(results))`],{cwd,encoding:'utf8',maxBuffer:2e6}));
 assert.equal(response.length,29);
 for(const result of response)assert.equal(result.rejected,true,result.change+' requires a new geographic/source review');
});
