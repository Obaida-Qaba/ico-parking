import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';
import {resolveDestination,isAreaApproach} from '../public/destinations.mjs';

const cwd=new URL('../',import.meta.url),builder=new URL('../scripts/build_toyota_bc_area_destinations.py',import.meta.url);
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const roads=read('../public/roads.json'),atlas=read('../public/data.json'),toyota=atlas.maps.find(m=>m.id==='toyota');
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_toyota_bc_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:3e6}));
const codes=[...Array.from({length:10},(_,i)=>'B'+String(i+1).padStart(2,'0')),...Array.from({length:13},(_,i)=>'C'+String(i+1).padStart(2,'0'))];

test('the historical B/C macro corridor has a separate reviewed builder',()=>assert.ok(existsSync(builder)));

test('exactly23 B/C references share a whole-corridor approach without numbered centres or FLUX equivalences',{skip:!existsSync(builder)},()=>{
 const out=candidate();assert.deepEqual(Object.keys(out.destinations).sort(),codes.map(c=>'toyota:'+c).sort());
 assert.deepEqual(toyota.parkings.filter(p=>/^[BC]\d+$/.test(p.code)).map(p=>p.code).sort(),codes.sort(),'no B00 is invented');
 for(const code of codes){
  const pin=out.destinations['toyota:'+code],parking=toyota.parkings.find(p=>p.code===code);
  assert.equal(pin.precision,'area-approach-only');assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);assert.equal(pin.historical,true);
  assert.deepEqual([pin.lat,pin.lon],[51.3001203,3.2402288]);assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon]);
  assert.equal(pin.arrivalNode,'2494477505');assert.equal(pin.roadWay,'241869946');
  assert.deepEqual(pin.supportedMaps,['toyota']);assert.equal(pin.sourcePoints.length,parking.points.length);
  assert.match(pin.mappedArea.boundaryLimitation,/B.*C.*split|split.*B.*C/i);
  assert.match(pin.areaAccessNote,/historical.*number|number.*historical/i);
  assert.equal(isAreaApproach(resolveDestination({map:toyota,parking},{},out)),true);
 }
 for(const code of ['H01','H02','A01','A04','D09','Y02','DRFLX'])assert.equal(out.destinations['toyota:'+code],undefined,'adjoining areas are not folded into B/C');
 const boundaries=out.regions[0].boundaryLanes;
 assert.deepEqual(boundaries.map(b=>b.way),['241869964','241869927','746744824','241869968','241869952','241869946']);
 boundaries.forEach((b,i)=>assert.equal(b.nodes.at(-1),boundaries[(i+1)%boundaries.length].nodes[0],'the macro corridor closes on actual shared nodes'));
 assert.equal(boundaries[1].oneway,true);assert.equal(out.regions[0].controls.ownerEvidence.terminal,'5230');
 assert.equal(out.regions[0].controls.c11Turbine.osmNode,'5147481310');
});

test('the C11 control is inside the macro while quay, A-loop and Y controls are outside; arrival uses an actual road junction',{skip:!existsSync(builder)},()=>{
 const out=candidate(),region=out.regions[0],polygon=region.boundaryPolygonLatLon;
 const inside=([lat,lon])=>{let odd=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ay,ax]=polygon[i],[by,bx]=polygon[j];if((ay>lat)!==(by>lat)&&lon<(bx-ax)*(lat-ay)/(by-ay)+ax)odd=!odd;
 }return odd;};
 assert.equal(inside([51.3007641,3.2406611]),true,'independent C11 turbine stays inside the historical B/C whole corridor');
 for(const p of [[51.3039,3.2363],[51.3055,3.2363],[51.3028,3.2425]])assert.equal(inside(p),false,'separate quay, A and Y controls cannot enter this macro');
 const graph=buildGraph(roads),end=[51.3001203,3.2402288];assert.ok(nearestRoad(graph,end).distance<.1);
 assert.ok(roads.ways.find(w=>w.id==='241869952').nodes.includes('2494477505'));
 const route=routeRoads(graph,[51.3037181,3.2372862],end);assert.ok(route.available);assert.ok(route.endOffset<.1);assert.ok(route.distance>400&&route.distance<450);
 assert.deepEqual(route.points.at(-1),end);
 assert.equal(region.controls.imageryEvidence.flightDate,undefined,'no unqueried capture date is asserted');
});

test('every B/C glyph and all macro-boundary geometry/access changes require new review',{skip:!existsSync(builder)},()=>{
 const response=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
m=runpy.run_path('scripts/build_toyota_bc_area_destinations.py');build=m['build']
r=json.loads(Path('public/roads.json').read_text());a=json.loads(Path('public/data.json').read_text());out=[]
for ident in m['ROAD_GUARDS']:
 for change in ['geometry','direction','access','closure','excluded']:
  roads=copy.deepcopy(r);w=next(w for w in roads['ways'] if w['id']==ident)
  if change=='geometry':w['points'][0][0]+=.0001
  if change=='direction':w['oneway']=not w['oneway']
  if change=='access':w['private']=not w['private']
  if change=='closure':w['blocked']=[w['nodes'][0]]
  if change=='excluded':w['excludedSegments']=[w['nodes'][:2]]
  try:build(a,roads);out.append(False)
  except ValueError:out.append(True)
for code in m['SOURCE_POINTS']:
 atlas=copy.deepcopy(a);next(p for m in atlas['maps'] if m['id']=='toyota' for p in m['parkings'] if p['code']==code)['points'][0]['x']+=3
 try:build(atlas,r);out.append(False)
 except ValueError:out.append(True)
print(json.dumps(out))`],{cwd,encoding:'utf8',maxBuffer:3e6}));
 assert.equal(response.length,53);assert.ok(response.every(Boolean));
});
