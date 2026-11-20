import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url),builder=new URL('../scripts/build_toyota_de_area_destinations.py',import.meta.url);
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const atlas=read('../public/data.json'),roads=read('../public/roads.json');
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_toyota_de_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:3e6}));
const codes=['D','E'].flatMap(letter=>Array.from({length:5},(_,i)=>letter+String(i+9).padStart(2,'0')));

test('the lower Toyota D/E field has its own independently bounded area builder',()=>{
 assert.ok(existsSync(builder),'a distinct D/E field must not reuse another area without review');
});

test('only the ten lower D/E references share the real northwest boundary-road approach',{skip:!existsSync(builder)},()=>{
 const result=candidate();
 assert.deepEqual(Object.keys(result.destinations).sort(),codes.map(code=>'toyota:'+code).sort());
 for(const code of codes){
  const pin=result.destinations['toyota:'+code];
  assert.equal(pin.precision,'area-approach-only');assert.equal(pin.scope,'parking-group-approach');
  assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);assert.equal(pin.historical,true);
  assert.equal(pin.areaName,'Toyota lower D/E field');assert.equal(pin.arrivalNode,'2494477523');
  assert.deepEqual([pin.lat,pin.lon],[51.3014846,3.2413383]);
  assert.equal(pin.roadWay,'241869968');assert.deepEqual(pin.roadSegment,['2494477510','2494477523']);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.labelPosition.precision,'area-approach-only');
  assert.match(pin.areaAccessNote,/gate.*not.*confirmed/i);
 }
 for(const code of ['D00','D08','D14','E00','E08','E14','Y02','F09','R01'])assert.equal(result.destinations['toyota:'+code],undefined);
 const boundaries=result.regions[0].boundaryLanes;
 assert.deepEqual(boundaries.map(b=>b.way),['746744858','241869962','241869913','241869952','241869968']);
 boundaries.forEach((boundary,i)=>assert.equal(boundary.nodes.at(-1),boundaries[(i+1)%boundaries.length].nodes[0]));
 assert.deepEqual(boundaries[2].nodes,['2494477539','2494477537','2494477536']);
 assert.equal(boundaries[2].oneway,true);
});

test('all ten old source glyphs remain evidence, not individual geographic destinations',{skip:!existsSync(builder)},()=>{
 const result=candidate(),toyota=atlas.maps.find(map=>map.id==='toyota'),ys=[436,449,462,476,489];
 for(const code of codes){
  const pin=result.destinations['toyota:'+code],parking=toyota.parkings.find(p=>p.code===code);
  assert.deepEqual(pin.sourcePoint,[code.startsWith('D')?240:320,ys[Number(code.slice(1))-9]]);
  assert.ok(Math.abs(pin.sourcePoint[0]-(parking.x/3+45))<.001&&Math.abs(pin.sourcePoint[1]-(parking.y/3+90))<.001);
  assert.equal(pin.sourcePointUnits,'uncropped original PDF points');assert.equal(pin.sourcePage,25);
  assert.equal(pin.imageryEvidence.flightDate,undefined);
  assert.match(pin.basis,/Y field/);assert.match(pin.basis,/R01/);assert.match(pin.basis,/F\/G/);
  assert.match(pin.mappedArea.boundaryLimitation,/D00|D01|D08/);
 }
 assert.equal(new Set(Object.values(result.destinations).map(pin=>JSON.stringify(pin.sourcePoint))).size,10);
});

test('the shared lower D/E approach remains on an actual connected boundary-road junction',{skip:!existsSync(builder)},()=>{
 const pin=candidate().destinations['toyota:D09'],target=[pin.lat,pin.lon],graph=buildGraph(roads);
 assert.ok(nearestRoad(graph,target).distance<.1);
 const crossroad=roads.ways.find(w=>w.id==='746744858');assert.ok(crossroad.nodes.includes(pin.arrivalNode));
 for(const origin of [[51.3019547,3.2428032],[51.32706215,3.2180946]]){
  const route=routeRoads(graph,origin,target);assert.ok(route.available);assert.ok(route.endOffset<.1);
  assert.deepEqual(route.points.at(-1),target);assert.ok(route.distance>100&&route.distance<7000);
 }
});

test('changed field boundaries, directions, closures, access or any source identity require review',{skip:!existsSync(builder)},()=>{
 const results=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_toyota_de_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text());atlas=json.loads(Path('public/data.json').read_text())
out=[]
for ident in ['746744858','241869962','241869913','241869952','241869968']:
 for change in ['geometry','oneway','private','blocked','excluded']:
  roads=copy.deepcopy(base);way=next(w for w in roads['ways'] if w['id']==ident)
  if change=='geometry':way['points'][0][0]+=.0001
  if change=='oneway':way['oneway']=not way['oneway']
  if change=='private':way['private']=False
  if change=='blocked':way['blocked']=[way['nodes'][0]]
  if change=='excluded':way['excludedSegments']=[way['nodes'][:2]]
  try:build(atlas,roads);out.append({'id':ident+':'+change,'rejected':False})
  except ValueError:out.append({'id':ident+':'+change,'rejected':True})
for letter in 'DE':
 for number in range(9,14):
  source=copy.deepcopy(atlas);code=letter+str(number).zfill(2)
  next(p for m in source['maps'] if m['id']=='toyota' for p in m['parkings'] if p['code']==code)['points'][0]['x']+=3
  try:build(source,base);out.append({'id':code,'rejected':False})
  except ValueError:out.append({'id':code,'rejected':True})
print(json.dumps(out))`],{cwd,encoding:'utf8',maxBuffer:3e6}));
 assert.equal(results.length,35);
 for(const result of results)assert.equal(result.rejected,true,result.id+' requires a fresh source/geographic review');
});
