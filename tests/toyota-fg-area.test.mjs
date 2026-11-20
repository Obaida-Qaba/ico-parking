import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url),builder=new URL('../scripts/build_toyota_fg_area_destinations.py',import.meta.url);
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const atlas=read('../public/data.json'),roads=read('../public/roads.json');
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_toyota_fg_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:4e6}));
const codes=['F','G'].flatMap(letter=>Array.from({length:15},(_,n)=>letter+String(n).padStart(2,'0')));

test('Toyota F/G has an independent whole-field builder instead of restoring raw similarity points',()=>{
 assert.ok(existsSync(builder),'the whole-field match needs its own reviewed builder');
});

test('all 30 F/G references share one real whole-field entry without individual row coordinates',{skip:!existsSync(builder)},()=>{
 const result=candidate();
 assert.deepEqual(Object.keys(result.destinations).sort(),codes.map(code=>'toyota:'+code).sort());
 for(const code of codes){
  const pin=result.destinations['toyota:'+code];
  assert.equal(pin.precision,'area-entry-only');assert.equal(pin.scope,'parking-group-approach');
  assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);assert.equal(pin.historical,true);
  assert.equal(pin.areaName,'Toyota F/G field');assert.equal(pin.arrivalNode,'6988020211');
  assert.equal(pin.roadWay,'241869962');assert.deepEqual(pin.roadSegment,['2494477553','6988020211']);
  assert.deepEqual([pin.lat,pin.lon],[51.3030006,3.2442476]);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.labelPosition.precision,'area-entry-only');
  assert.match(pin.mappedArea.boundaryLimitation,/individual.*F\/G|F\/G.*individual/i);
  assert.equal(pin.flightEvidence.flightDate,undefined,'no unqueried aerial capture date is claimed');
 }
 for(const code of ['Y02','Z01','P02','P03','F15','G15'])assert.equal(result.destinations['toyota:'+code],undefined);
 const boundaries=result.regions[0].boundaryLanes;
 assert.deepEqual(boundaries.map(b=>b.way),['241869962','241869964','241869913']);
 boundaries.forEach((boundary,i)=>assert.equal(boundary.nodes.at(-1),boundaries[(i+1)%boundaries.length].nodes[0]));
 assert.equal(boundaries.at(-1).oneway,true,'the actual roundabout keeps its mapped direction');
 assert.deepEqual(boundaries.at(-1).nodes,['2494477533','6847409132','2494477539']);
});

test('the physical field match preserves every source glyph separately from its shared geographic entry',{skip:!existsSync(builder)},()=>{
 const result=candidate(),toyota=atlas.maps.find(map=>map.id==='toyota');
 const ys=[314,328,341,355,369,382,396,409,423,436,450,463,477,490,503];
 for(const code of codes){
  const pin=result.destinations['toyota:'+code],parking=toyota.parkings.find(p=>p.code===code);
  assert.deepEqual(pin.sourcePoint,[code.startsWith('F')?407:480,ys[Number(code.slice(1))]]);
  assert.equal(pin.sourcePoints.length,1);assert.equal(pin.sourcePage,25);
  assert.ok(Math.abs(pin.sourcePoint[0]-(parking.x/3+45))<.001&&Math.abs(pin.sourcePoint[1]-(parking.y/3+90))<.001);
  assert.equal(pin.sourcePointUnits,'uncropped original PDF points');
 }
 assert.equal(new Set(Object.values(result.destinations).map(pin=>JSON.stringify(pin.sourcePoint))).size,30);
 assert.deepEqual(result.regions[0].landmarkControl.geoLatLon,[51.3022612,3.2465473]);
 assert.equal(result.regions[0].landmarkControl.sourceParking,'F13');
 assert.match(result.regions[0].basis,/Bridgestone/);
 assert.ok(result.regions[0].imageryEvidence.reviewImageRequest.bboxLonLat);
});

test('independent terminal origins reach the actual western field entry on existing roads',{skip:!existsSync(builder)},()=>{
 const pin=candidate().destinations['toyota:F00'],target=[pin.lat,pin.lon],graph=buildGraph(roads);
 assert.ok(nearestRoad(graph,target).distance<.1);
 for(const origin of [[51.3019547,3.2428032],[51.32706215,3.2180946]]){
  const route=routeRoads(graph,origin,target);assert.ok(route.available);assert.ok(route.endOffset<.1);
  assert.deepEqual(route.points.at(-1),target);assert.ok(route.distance>150&&route.distance<7000);
 }
 const entry=candidate().destinations['toyota:G14'].junctionMatch;
 assert.deepEqual(entry.adjoiningLane.nodes,['6988020211','6988020213','6988020212']);
});

test('every field-boundary/access change and any of the 30 source identities requires re-review',{skip:!existsSync(builder)},()=>{
 const results=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_toyota_fg_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text());atlas=json.loads(Path('public/data.json').read_text())
out=[]
for ident in ['241869962','241869964','241869913','746744860','241869917']:
 for change in ['geometry','oneway','private','blocked','excluded']:
  roads=copy.deepcopy(base);way=next(w for w in roads['ways'] if w['id']==ident)
  if change=='geometry':way['points'][0][0]+=.0001
  if change=='oneway':way['oneway']=not way['oneway']
  if change=='private':way['private']=False
  if change=='blocked':way['blocked']=[way['nodes'][0]]
  if change=='excluded':way['excludedSegments']=[way['nodes'][:2]]
  try:build(atlas,roads);out.append({'id':ident+':'+change,'rejected':False})
  except ValueError:out.append({'id':ident+':'+change,'rejected':True})
for letter in 'FG':
 for number in range(15):
  source=copy.deepcopy(atlas);code=letter+str(number).zfill(2)
  next(p for m in source['maps'] if m['id']=='toyota' for p in m['parkings'] if p['code']==code)['points'][0]['x']+=3
  try:build(source,base);out.append({'id':code,'rejected':False})
  except ValueError:out.append({'id':code,'rejected':True})
print(json.dumps(out))`],{cwd,encoding:'utf8',maxBuffer:4e6}));
 assert.equal(results.length,55);
 for(const result of results)assert.equal(result.rejected,true,result.id+' must invalidate the reviewed association');
});
