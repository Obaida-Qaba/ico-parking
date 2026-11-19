import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';
import {resolveDestination,isAreaEntry} from '../public/destinations.mjs';

const cwd=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const atlas=read('../public/data.json'),roads=read('../public/roads.json');
const published=read('../public/destinations.json').destinations;
const legacy=read('../scripts/bastenaken-source-points.json');
const groups=[
 {id:'gh',letters:'GH',node:'2494511748',point:[51.3012256,3.2253311],segment:['2494511754','2494511748'],corners:['2494511748','2494511766','6986702618','6986702620'],ways:['746582074','241873299','1228590688','746582127']},
 {id:'i',letters:'I',node:'6986702455',point:[51.299944,3.2263845],segment:['2494511748','6986702455'],corners:['6986702455','2494511748','6986702620','6986702621'],ways:['746582074','746582127','1228590688','746582086']},
 {id:'j',letters:'J',node:'6986702471',point:[51.2986587,3.2274307],segment:['6986702455','6986702471'],corners:['6986702471','6986702455','6986702621','6986702622'],ways:['746582074','746582086','746582137','746582091']},
 {id:'k',letters:'K',node:'6986702462',point:[51.2973626,3.2284856],segment:['6986702471','6986702462'],corners:['6986702462','6986702471','6986702622','6986702623'],ways:['746582074','746582091','746582137','746582088']},
 {id:'l',letters:'L',node:'6986702386',point:[51.2962242,3.2294123],segment:['6986702462','6986702386'],corners:['6986702386','6986702462','6986702623','6986702617'],ways:['746582074','746582088','746582137','746582075']},
];
const codes=letters=>[...letters].flatMap(letter=>[1,2,3,4].map(n=>letter+'D'+n));
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_d_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:5e6}));

for(const group of groups)test(group.letters+' D references share their own confirmed whole-field entrance, never an inferred row',()=>{
 for(const map of ['south','bastenaken'])for(const code of codes(group.letters)){
  const pin=published[map+':'+code];assert.ok(pin,`${map}:${code} must have its reviewed area entrance`);
  assert.equal(pin.precision,'area-entry-only');assert.equal(pin.individualParkingVerified,false);
  assert.equal(pin.lineExact,false);assert.equal(pin.scope,'parking-group-approach');
  assert.equal(pin.name,code+' · area entrance');assert.equal(pin.arrivalNode,group.node);
  assert.deepEqual([pin.lat,pin.lon],group.point);assert.deepEqual(pin.roadSegment,group.segment);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],group.point,'label remains at the confirmed entry, not a guessed D-row interior');
  assert.equal(pin.labelPosition.precision,'area-entry-only');assert.equal(pin.labelPosition.individualParkingVerified,false);
  assert.equal(pin.historical,map==='bastenaken');assert.match(pin.basis,/four.*three/i);
 }
});

test('five individually bounded fields follow actual road nodes and retain the existing E/C3 controls',()=>{
 const graph=buildGraph(roads),proposal=candidate();
 assert.equal(proposal.regions.length,10,'five current and five historical source field groups');
 assert.equal(Object.keys(proposal.destinations).length,48);
 assert.deepEqual(Object.keys(proposal.destinations).sort(),['south','bastenaken'].flatMap(map=>codes('GHIJKL').map(code=>map+':'+code)).sort(),'builder must not overwrite E, C3 or unrelated destinations');
 for(const group of groups){
  const pin=proposal.destinations['south:'+codes(group.letters)[0]];
  assert.deepEqual(pin.junctionMatch.cornerNodes,group.corners);
  assert.deepEqual(pin.junctionMatch.boundaryLanes.map(b=>b.way),group.ways);
  assert.deepEqual(pin.junctionMatch.boundaryLanes.map(b=>b.oneway),[false,false,true,false]);
  for(const boundary of pin.junctionMatch.boundaryLanes){
   const road=roads.ways.find(w=>w.id===boundary.way);
   assert.equal(road.oneway,boundary.oneway);
   boundary.nodes.forEach(node=>assert.ok(road.nodes.includes(node)));
   for(let i=1;i<boundary.nodes.length;i++)assert.equal(Math.abs(road.nodes.indexOf(boundary.nodes[i])-road.nodes.indexOf(boundary.nodes[i-1])),1,'a boundary cannot skip or invent a roadway segment');
  }
  const road=roads.ways.find(w=>w.id===pin.roadWay),index=road.nodes.indexOf(group.segment[0]);
  assert.equal(pin.roadWay,'746582074');assert.deepEqual(road.nodes.slice(index,index+2),group.segment);
  assert.deepEqual(graph.nodes.get(group.node),group.point);assert.ok(nearestRoad(graph,group.point).distance<.1);
  assert.ok(roads.ways.find(w=>w.id===group.ways[3]).nodes.includes(group.node),'entry is a real junction with this field western boundary');
  for(const origin of ['south:CD1','south:HC1','south:H61',`south:${group.letters.at(-1)}C3`]){
   const start=published[origin];assert.ok(start,origin+' exists');
   const route=routeRoads(graph,[start.lat,start.lon],group.point);
   assert.equal(route.available,true,origin+' reaches '+group.letters+' D field');assert.ok(route.endOffset<.1);
  }
 }
 assert.equal(new Set(groups.map(g=>JSON.stringify(g.point))).size,5,'unrelated D fields are not all sent to one generic gate');
});

test('every original source reference and current PDF glyph fits its explicitly named field',()=>{
 const proposal=candidate();
 for(const map of ['south','bastenaken'])for(const code of codes('GHIJKL')){
  const pin=proposal.destinations[map+':'+code],parking=atlas.maps.find(m=>m.id===map).parkings.find(p=>p.code===code);
  const expected=map==='south'?parking.points.map(p=>[p.x/3,p.y/3]):legacy.points[code];
  assert.equal(pin.sourcePage,map==='south'?1:23);assert.equal(pin.sourcePointUnits,'uncropped original PDF points');
  assert.equal(pin.sourcePoints.length,expected.length);
  expected.forEach((point,i)=>point.forEach((v,j)=>assert.ok(Math.abs(pin.sourcePoints[i][j]-v)<.00011)));
  const [x0,y0,x1,y1]=pin.sourceBounds;
  for(const [x,y] of pin.sourcePoints)assert.ok(x>=x0&&x<=x1&&y>=y0&&y<=y1,`${map}:${code} source reference lies inside its own field bounds`);
  if(map==='south')for(const [a,b,c,d] of pin.sourceGlyphBounds)assert.ok(a>=x0&&c<=x1&&b>=y0&&d<=y1,'full printed text extent is retained, not just its centre');
  assert.match(pin.mappedArea.boundaryLimitation,/individual|partition/i);
  assert.equal(pin.flightEvidence.flightDate,'2026-03-05');assert.equal(pin.flightEvidence.imageryLayer,'OFW');
 }
});

test('current and historical searches resolve a usable area entrance without claiming an exact line',()=>{
 const proposal=candidate();
 for(const mapid of ['south','bastenaken'])for(const code of codes('GHIJKL')){
  const map=atlas.maps.find(m=>m.id===mapid),parking=map.parkings.find(p=>p.code===code);
  const point=resolveDestination({map,parking,line:'99'},{},{destinations:published});
  assert.ok(point,`${mapid}:${code} resolves directly`);assert.equal(point.automatic,true);
  assert.equal(isAreaEntry(point),true);assert.equal(point.exactLine,false);assert.equal(point.lineExact,false);
  const expected=proposal.destinations[mapid+':'+code];
  assert.deepEqual([point.lat,point.lon],[expected.lat,expected.lon]);assert.equal(point.scope,'parking-group-approach');
 }
});

test('source displacement, changed boundary geometry, direction and closures force a new review',()=>{
 const result=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_d_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text(encoding='utf-8'))
atlas=json.loads(Path('public/data.json').read_text(encoding='utf-8'))
results=[]
for change in ['geometry','oneway','blocked','excluded','source','legacy-source']:
 roads=copy.deepcopy(base);source=copy.deepcopy(atlas)
 way=next(w for w in roads['ways'] if w['id']=='746582074')
 if change=='geometry':way['points'][way['nodes'].index('6986702455')][0]+=.0001
 if change=='oneway':way['oneway']=True
 if change=='blocked':way['blocked']=['6986702455']
 if change=='excluded':way['excludedSegments']=[['2494511748','6986702455']]
 if change in ['source','legacy-source']:
  mapid='south' if change=='source' else 'bastenaken'
  next(p for m in source['maps'] if m['id']==mapid for p in m['parkings'] if p['code']=='ID1')['points'][0]['x']=0
 try:
  build(source,roads);results.append({'change':change,'rejected':False})
 except ValueError as error:results.append({'change':change,'rejected':True,'reason':str(error)})
print(json.dumps(results))`],{cwd,encoding:'utf8',maxBuffer:5e6}));
 for(const item of result)assert.equal(item.rejected,true,item.change+' cannot silently retain the reviewed geographic association');
});
