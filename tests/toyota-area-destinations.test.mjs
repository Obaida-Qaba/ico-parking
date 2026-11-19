import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const roads=read('../public/roads.json'),atlas=read('../public/data.json');
const published=read('../public/destinations.json').destinations;
const candidate=JSON.parse(execFileSync('python',['scripts/build_toyota_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:4e6}));
const ys=Array.from({length:17},(_,i)=>`Y${String((i+1)*2).padStart(2,'0')}`).concat(['Y35','Y36','Y37','Y38']);
const expected=[...ys,'R01','Z01','Z03','Z04','Z05'];
const toyota=atlas.maps.find(m=>m.id==='toyota');

test('all 26 references publish honest shared-area arrivals with the display label at that arrival',()=>{
 for(const code of expected){
  const pin=published['toyota:'+code];assert.ok(pin,`${code}: reviewed shared-area arrival must be published`);
  const proposal=candidate.destinations['toyota:'+code];
  assert.equal(pin.precision,'area-entry-only');assert.equal(pin.scope,'parking-group-approach');
  assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);
  assert.equal(pin.name,`${code} · area entrance`);assert.equal(pin.areaName,proposal.areaName);
  assert.deepEqual([pin.lat,pin.lon],[proposal.lat,proposal.lon]);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],[pin.lat,pin.lon],'no guessed bay position behind the area label');
 }
 assert.equal(new Set(ys.map(code=>JSON.stringify([published['toyota:'+code].lat,published['toyota:'+code].lon]))).size,1,'all Y codes share one confirmed entrance');
});

test('actual historical source glyphs are preserved, including all three R01 strips',()=>{
 assert.deepEqual(Object.keys(candidate.destinations).sort(),expected.map(c=>'toyota:'+c).sort());
 for(const code of expected){
  const pin=candidate.destinations['toyota:'+code],parking=toyota.parkings.find(p=>p.code===code);
  assert.equal(pin.sourcePage,25);assert.equal(pin.sourcePointUnits,'uncropped original PDF points');
  assert.equal(pin.sourcePoints.length,parking.points.length);
  parking.points.forEach((p,i)=>{
   assert.ok(Math.abs(pin.sourcePoints[i][0]-(p.x/3+45))<.0001);
   assert.ok(Math.abs(pin.sourcePoints[i][1]-(p.y/3+90))<.0001);
  });
  assert.equal(pin.flightEvidence.flightDate,'2026-03-05');assert.equal(pin.flightEvidence.queryLayer,'OFW_vdc');
  assert.equal(pin.flightEvidence.query.infoFormat,'application/geo+json');
  assert.ok(pin.mappedArea.boundaryReferences.length);assert.match(pin.mappedArea.boundaryLimitation,/not|no precise/i);
 }
 assert.deepEqual(candidate.destinations['toyota:R01'].sourcePoints,[[157,502],[229,502],[315,502]]);
 assert.equal(new Set(ys.map(code=>JSON.stringify(candidate.destinations['toyota:'+code].sourcePoint))).size,21,'distinct printed bays are retained as source evidence, not conflated geographically');
 assert.equal(candidate.notAdded.length,24);
 for(const code of ['A01PPO','A05','A06','A07','A08','A09','P04','P05','W01','X02','P10','Z02'])assert.equal(candidate.destinations['toyota:'+code],undefined);
});

test('the two entrances are real junctions with road-connected routes on the correct side of the railway',()=>{
 const graph=buildGraph(roads);
 const areas=[
  ['Y02','746744858',['2494477538','6988020209'],[51.3019547,3.2428032]],
  ['R01','241869952',['2494477511','6988020210'],[51.301143,3.2434641]],
 ];
 for(const [code,wayId,segment,position] of areas){
  const pin=candidate.destinations['toyota:'+code],way=roads.ways.find(w=>w.id===wayId);
  assert.deepEqual([pin.lat,pin.lon],position);assert.equal(pin.roadWay,wayId);assert.deepEqual(pin.roadSegment,segment);
  const i=way.nodes.indexOf(segment[0]);assert.deepEqual(way.nodes.slice(i,i+2),segment);
  assert.deepEqual(way.points[i+1],position);assert.equal(way.oneway,false);
  const branch=roads.ways.find(w=>w.id==='746744859');assert.ok(branch.nodes.includes(pin.arrivalNode));
  const snap=nearestRoad(graph,position);assert.ok(snap.distance<.1);assert.equal(snap.segment.way,wayId);
  for(const origin of ['north:BB','toyota:B05']){
   const from=published[origin],route=routeRoads(graph,[from.lat,from.lon],position);
   assert.ok(route.available,`${origin} reaches ${code} entrance through actual graph roads`);assert.ok(route.endOffset<.1);
   assert.ok(route.distance>100&&route.distance<6500,'existing network provides a reasonable connected approach');
  }
 }
 assert.notEqual(candidate.destinations['toyota:R01'].roadWay,'241869960','the railway cannot be silently crossed to the parallel road');
});

test('changed geometry, direction, closures, or source glyphs invalidate the reviewed association',()=>{
 const response=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
module=runpy.run_path('scripts/build_toyota_area_destinations.py');build=module['build']
base=json.loads(Path('public/roads.json').read_text(encoding='utf-8'))
atlas=json.loads(Path('public/data.json').read_text(encoding='utf-8'))
results=[]
for change in ['geometry','oneway','blocked','excluded','source']:
 roads=copy.deepcopy(base);source=copy.deepcopy(atlas)
 way=next(w for w in roads['ways'] if w['id']=='241869952')
 if change=='geometry':way['points'][way['nodes'].index('6988020210')][0]+=.0001
 if change=='oneway':way['oneway']=True
 if change=='blocked':way['blocked']=['6988020210']
 if change=='excluded':way['excludedSegments']=[['2494477511','6988020210']]
 if change=='source':next(p for m in source['maps'] if m['id']=='toyota' for p in m['parkings'] if p['code']=='R01')['points'][0]['y']=0
 try:
  build(source,roads);results.append({'change':change,'rejected':False})
 except ValueError as error:results.append({'change':change,'rejected':True,'reason':str(error)})
print(json.dumps(results))`],{cwd,encoding:'utf8',maxBuffer:4e6}));
 for(const result of response)assert.equal(result.rejected,true,result.change+' must require geographic re-review');
});

test('four valid Z references distinguish the inner G perimeter from the outer rail-side apron',()=>{
 const entries={Z01:[51.3044417,3.2487316],Z03:[51.3039583,3.2490302],Z04:[51.3039583,3.2490302],Z05:[51.3039583,3.2490302]};
 for(const [code,position] of Object.entries(entries)){
  const pin=published['toyota:'+code];assert.ok(pin,code+' area entrance must be published');
  assert.deepEqual([pin.lat,pin.lon],position);assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],position);
  assert.equal(pin.precision,'area-entry-only');assert.equal(pin.individualParkingVerified,false);
  assert.equal(pin.roadWay,'241869964');assert.equal(pin.name,code+' · area entrance');
  if(code!=='Z01')assert.match(pin.areaAccessNote,/railway-crossing approach; onward roads inside the apron are not mapped/);
 }
 assert.equal(candidate.destinations['toyota:Z02'],undefined,'Z02 was a misread repeated Z01 glyph');
 assert.equal(published['toyota:Z02'],undefined);
 assert.equal(candidate.destinations['toyota:Z01'].sourcePoints.length,3);
 assert.deepEqual(candidate.destinations['toyota:Z04'].sourcePoints,[[546,501]],'capacity234 is not another parking glyph');
 const graph=buildGraph(roads),from=published['north:BB'];
 for(const position of Object.values(entries)){
  assert.ok(nearestRoad(graph,position).distance<.1);
  const route=routeRoads(graph,[from.lat,from.lon],position);assert.ok(route.available);assert.ok(route.distance>5500&&route.distance<6500);assert.ok(route.endOffset<.1);
 }
 assert.ok(!roads.ways.some(w=>/toyota.*(?:crossing|apron)|(?:crossing|apron).*toyota/i.test(w.id)),'no unreviewed graph join is invented over the rail or inside the apron');
});

test('Z perimeter geometry and corrected source labels cannot silently drift',()=>{
 const results=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_toyota_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text(encoding='utf-8'));atlas=json.loads(Path('public/data.json').read_text(encoding='utf-8'))
out=[]
for change in ['perimeter','crosslane','outerFence','falseZ02','capacity234']:
 roads=copy.deepcopy(base);source=copy.deepcopy(atlas);toyota=next(m for m in source['maps'] if m['id']=='toyota')
 if change=='perimeter':next(w for w in roads['ways'] if w['id']=='241869964')['blocked']=['2494477580']
 if change=='crosslane':next(w for w in roads['ways'] if w['id']=='746744860')['points'][-1][0]+=.0001
 if change=='outerFence':next(w for w in roads['ways'] if w['id']=='87379708')['points'][12][1]+=.0001
 if change=='falseZ02':toyota['parkings'].append({'code':'Z02','points':[{'x':1560,'y':843}]})
 if change=='capacity234':next(p for p in toyota['parkings'] if p['code']=='Z04')['points'].append({'x':1560,'y':924})
 try:
  build(source,roads);out.append({'change':change,'rejected':False})
 except ValueError as error:out.append({'change':change,'rejected':True,'reason':str(error)})
print(json.dumps(out))`],{cwd,encoding:'utf8',maxBuffer:4e6}));
 for(const result of results)assert.equal(result.rejected,true,result.change+' invalidates the reviewed area');
});
