import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';
import {resolveDestination,isAreaApproach,isAreaEntry} from '../public/destinations.mjs';

const cwd=new URL('../',import.meta.url),builder=new URL('../scripts/build_ch_area_destinations.py',import.meta.url);
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const roads=read('../public/roads.json'),atlas=read('../public/data.json');
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_ch_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:3e6}));

test('current CH whole-area association has its own reviewed builder',()=>assert.ok(existsSync(builder)));

test('24 current CH references share only the real northern area road approach',{skip:!existsSync(builder)},()=>{
 const out=candidate(),south=atlas.maps.find(m=>m.id==='south');
 assert.equal(Object.keys(out.destinations).length,24);
 for(let n=1;n<=24;n++){
  const code='CH'+n,pin=out.destinations['south:'+code],parking=south.parkings.find(p=>p.code===code);
  assert.ok(pin);assert.equal(pin.precision,'area-approach-only');assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);
  assert.equal(pin.method,'source-topology-shared-area-road-approach');assert.equal(pin.scope,'parking-group-approach');
  assert.deepEqual([pin.lat,pin.lon],[51.3081761,3.2159818]);assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.arrivalNode,'12487520977');assert.equal(pin.roadWay,'241873267');
  assert.deepEqual(pin.supportedMaps,['south']);
  assert.equal(pin.sourcePoints.length,parking.points.length);assert.equal(pin.sourcePoints.length,n===24?2:1,'both actual CH24 edge labels survive');
  assert.match(pin.areaAccessNote,/gate.*unconfirmed/i);assert.match(pin.mappedArea.boundaryLimitation,/individual.*not|not.*individual/i);
  const resolved=resolveDestination({map:south,parking},{},out);assert.equal(isAreaApproach(resolved),true);assert.equal(isAreaEntry(resolved),false);
  assert.equal(resolveDestination({map:{id:'bastenaken'},parking:{code}},{},out),null,'an old equal name is not a current source alias');
 }
 assert.equal(out.destinations['bastenaken:CH1'],undefined);
 assert.deepEqual(out.regions[0].controls.rejectedWWL.terminal,'5010');
 assert.equal(out.regions[0].controls.ownerEvidence.objectId,365);
 assert.equal(out.regions[0].controls.ownerEvidence.company,'ICO');
});

test('the CH approach is a real distributor junction reachable without crossing storage bays',{skip:!existsSync(builder)},()=>{
 const out=candidate(),point=[51.3081761,3.2159818],graph=buildGraph(roads);
 assert.ok(nearestRoad(graph,point).distance<.1);
 const shared=roads.ways.find(w=>w.id==='241873267'),branch=roads.ways.find(w=>w.id==='562258752');
 assert.ok(shared.nodes.includes('12487520977'));assert.equal(branch.nodes[0],'12487520977');
 const route=routeRoads(graph,[51.3075696,3.2140528],point);
 assert.ok(route.available);assert.ok(route.endOffset<.1);assert.ok(route.distance>140&&route.distance<200);
 assert.deepEqual(route.points.at(-1),point);
 assert.ok(route.points.every(p=>shared.points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8)),'approach follows the existing distributor');
 assert.equal(out.regions[0].controls.imageryEvidence.flightDate,undefined,'no capture date is invented');
});

test('every CH source identity and guarded corridor road rejects unreviewed drift',{skip:!existsSync(builder)},()=>{
 const response=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
m=runpy.run_path('scripts/build_ch_area_destinations.py');build=m['build']
roads=json.loads(Path('public/roads.json').read_text());atlas=json.loads(Path('public/data.json').read_text())
out=[]
for ident in m['ROAD_GUARDS']:
 for change in ['geometry','direction','access','closure','excluded']:
  r=copy.deepcopy(roads);w=next(w for w in r['ways'] if w['id']==ident)
  if change=='geometry':w['points'][0][0]+=.0001
  if change=='direction':w['oneway']=not w['oneway']
  if change=='access':w['private']=not w['private']
  if change=='closure':w['blocked']=[w['nodes'][0]]
  if change=='excluded':w['excludedSegments']=[w['nodes'][:2]]
  try:build(atlas,r);out.append(False)
  except ValueError:out.append(True)
for n in range(1,25):
 a=copy.deepcopy(atlas);next(p for m in a['maps'] if m['id']=='south' for p in m['parkings'] if p['code']=='CH'+str(n))['points'][0]['x']+=3
 try:build(a,roads);out.append(False)
 except ValueError:out.append(True)
print(json.dumps(out))`],{cwd,encoding:'utf8',maxBuffer:2e6}));
 assert.ok(response.length>=49);assert.ok(response.every(Boolean),'source or road changes require a fresh geographic review');
});
