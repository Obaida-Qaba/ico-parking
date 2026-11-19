import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolveDestination,isAreaEntry} from '../public/destinations.mjs';
import {buildGraph,nearestRoad,routeRoads,distanceMetres} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const atlas=read('../public/data.json'),roads=read('../public/roads.json');
const published=read('../public/destinations.json');
const codes=['AH1','AH2','AH3','AH4','AH5','AH6','BH1','BH2','BH3','BH4'];
const position=[51.3075696,3.2140528],arrival='2494511819';
const candidate=()=>JSON.parse(execFileSync('python',['scripts/build_h_area_destinations.py','--stdout'],{cwd,encoding:'utf8',maxBuffer:4e6}));

test('all ten CURRENT H references publish the same real area entrance with no inferred numbered position',()=>{
 for(const code of codes){
  const pin=published.destinations['south:'+code];assert.ok(pin,code+' must have its confirmed whole-field entrance');
  assert.equal(pin.name,code+' · area entrance');assert.equal(pin.areaName,'AH/BH parking area');
  assert.equal(pin.precision,'area-entry-only');assert.equal(pin.individualParkingVerified,false);assert.equal(pin.lineExact,false);
  assert.equal(pin.scope,'parking-group-approach');assert.equal(pin.arrivalNode,arrival);
  assert.deepEqual([pin.lat,pin.lon],position);assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],position);
  assert.equal(pin.labelPosition.precision,'area-entry-only');assert.equal(pin.labelPosition.individualParkingVerified,false);
 }
});

test('the curved outer H boundary is independently distinguished from the straight G/H divider',()=>{
 const proposal=candidate(),pin=proposal.destinations['south:AH1'];
 assert.deepEqual(pin.junctionMatch.cornerNodes,['2494511819','2494511887','2494511892','2494511830']);
 const bounds=pin.junctionMatch.boundaryLanes;
 assert.deepEqual(bounds.map(b=>b.way),['392480112','392480112','241873290','241873267']);
 assert.deepEqual(bounds[0].nodes,['2494511819','12487520989','12487520990','12487520991','12487520992','9803568813','2494511887']);
 assert.deepEqual(bounds[2].nodes,['2494511830','2494511867','2494511882','2494511892']);
 for(const boundary of bounds){
  const road=roads.ways.find(w=>w.id===boundary.way);assert.equal(road.oneway,false);assert.equal(boundary.oneway,false);
  for(let i=1;i<boundary.nodes.length;i++)assert.equal(Math.abs(road.nodes.indexOf(boundary.nodes[i])-road.nodes.indexOf(boundary.nodes[i-1])),1);
 }
 const proof=proposal.independentControls;
 assert.equal(proof.cf1VpcAnchor.forecourtWay,'931027303');
 assert.deepEqual(proof.cf1VpcAnchor.sourceSouthY,[264.9,265.1]);
 assert.deepEqual(proof.cf1VpcAnchor.neighbouringJunctions,['2494511860','2494511857']);
 const graph=buildGraph(roads);
 assert.ok(distanceMetres(graph.nodes.get('2494511860'),graph.nodes.get('2494511857'))<5,'same source cross road aligns beside the independently named VPC forecourt');
 assert.deepEqual(proof.correctedUpperRows.map(r=>[r.row,r.north,r.south]),[
  ['H','392480112','241873290'],['G','241873290','241873292'],['F','241873292','241873282'],['E','241873282','241873278'],['D','241873278','746582112/746641410'],
 ]);
 assert.match(pin.basis,/CF1|VPC/);assert.match(pin.basis,/individual/i);
});

test('all current printed H glyphs retain their actual source positions inside the reviewed whole-field outline',()=>{
 const proposal=candidate(),south=atlas.maps.find(m=>m.id==='south');
 assert.deepEqual(Object.keys(proposal.destinations).filter(k=>k.startsWith('south:')).sort(),codes.map(c=>'south:'+c).sort());
 assert.equal(proposal.regions.filter(r=>r.sourceMap==='south').length,1);
 for(const code of codes){
  const pin=proposal.destinations['south:'+code],p=south.parkings.find(p=>p.code===code),[x0,y0,x1,y1]=pin.sourceBounds;
  assert.deepEqual(pin.sourceBounds,[946,138,1059,201]);assert.equal(pin.sourcePage,1);
  assert.equal(pin.sourcePointUnits,'uncropped original PDF points');
  assert.ok(Math.abs(pin.sourcePoint[0]-p.x/3)<.00011);assert.ok(Math.abs(pin.sourcePoint[1]-p.y/3)<.00011);
  assert.equal(pin.sourceGlyphBounds.length,1);
  for(const [a,b,c,d] of pin.sourceGlyphBounds)assert.ok(a>=x0&&b>=y0&&c<=x1&&d<=y1,code+' entire glyph remains inside its whole field');
  assert.equal(pin.flightEvidence.flightDate,'2026-03-05');assert.equal(pin.flightEvidence.queryLayer,'OFW_vdc');
  assert.equal(pin.flightEvidence.query.infoFormat,'application/geo+json');
 }
});

test('H searches resolve an honest area arrival, and historical sources require their own confirmed support',()=>{
 const proposal=candidate();
 for(const code of codes){
  const map=atlas.maps.find(m=>m.id==='south'),parking=map.parkings.find(p=>p.code===code);
  const pin=resolveDestination({map,parking,line:'99'},{},published);
  assert.ok(pin,code+' directly resolves');assert.equal(isAreaEntry(pin),true);assert.equal(pin.exactLine,false);assert.deepEqual([pin.lat,pin.lon],position);
 }
 const map=atlas.maps.find(m=>m.id==='bastenaken');
 for(const code of ['AH1','AH2','BH1','BH2']){
  const parking=map.parkings.find(p=>p.code===code),pin=resolveDestination({map,parking},{},published);
  if(proposal.destinations['bastenaken:'+code]){
   assert.ok(pin);assert.equal(pin.sourceMap,'bastenaken');assert.equal(pin.historical,true);assert.equal(isAreaEntry(pin),true);
  }else assert.equal(pin,null,'current-source name equality must not silently assign '+code+' to an unconfirmed historical area');
 }
});

test('the four historical H references retain explicit original source controls and source-specific support',()=>{
 const proposal=candidate(),manifest=read('../scripts/bastenaken-source-points.json');
 assert.equal(Object.keys(proposal.destinations).length,14);
 assert.deepEqual(Object.keys(proposal.destinations).filter(k=>k.startsWith('bastenaken:')).sort(),['AH1','AH2','BH1','BH2'].map(c=>'bastenaken:'+c));
 for(const code of ['AH1','AH2','BH1','BH2']){
  const pin=proposal.destinations['bastenaken:'+code],p=atlas.maps.find(m=>m.id==='bastenaken').parkings.find(p=>p.code===code);
  assert.equal(pin.sourcePage,23);assert.equal(pin.historical,true);assert.deepEqual(pin.supportedMaps,['bastenaken']);
  assert.deepEqual(pin.sourcePoints,manifest.points[code]);assert.match(pin.historicalAssociation,/Independent|independent/);
  assert.ok(Math.abs(pin.sourcePoint[0]-(p.x/3+45))<.00011);assert.ok(Math.abs(pin.sourcePoint[1]-(p.y/3+90))<.00011);
  const [x0,y0,x1,y1]=pin.sourceBounds,[x,y]=pin.sourcePoint;assert.ok(x0<x&&x<x1&&y0<y&&y<y1);
  assert.deepEqual([pin.labelPosition.lat,pin.labelPosition.lon],position);assert.equal(pin.individualParkingVerified,false);
 }
});

test('unsupported sources cannot inherit a current H area through a canonical map alias',()=>{
 const proposal=candidate();
 for(const mapid of ['hanze','north','nissan','toyota'])for(const code of ['AH1','AH4','BH1']){
  const pin=resolveDestination({map:{id:mapid},parking:{code}},{},proposal);
  assert.equal(pin,null,mapid+':'+code+' has no independently reviewed H field association');
 }
 for(const code of codes)assert.deepEqual(proposal.destinations['south:'+code].supportedMaps,['south']);
});

test('the shared arrival is an actual drivable junction reached from local and distant road origins',()=>{
 const proposal=candidate(),pin=proposal.destinations['south:AH4'],graph=buildGraph(roads);
 assert.equal(pin.roadWay,'241873267');assert.deepEqual(pin.roadSegment,['12487520988','2494511819']);
 assert.deepEqual(graph.nodes.get(arrival),position);assert.ok(nearestRoad(graph,position).distance<.1);
 assert.ok(roads.ways.find(w=>w.id==='392480112').nodes.includes(arrival));
 for(const key of ['south:CD1','south:CF1','south:HC1','south:H61']){
  const start=published.destinations[key],route=routeRoads(graph,[start.lat,start.lon],position);
  assert.equal(route.available,true,key+' reaches the real H field junction');assert.ok(route.endOffset<.1);
 }
});

test('changed source glyphs, roads, directions and closures invalidate the H association',()=>{
 const result=JSON.parse(execFileSync('python',['-c',`import copy,json,runpy
from pathlib import Path
build=runpy.run_path('scripts/build_h_area_destinations.py')['build']
base=json.loads(Path('public/roads.json').read_text(encoding='utf-8'));atlas=json.loads(Path('public/data.json').read_text(encoding='utf-8'));results=[]
for change in ['geometry','oneway','blocked','excluded','source','legacy-source','vpc-control']:
 roads=copy.deepcopy(base);source=copy.deepcopy(atlas);way=next(w for w in roads['ways']if w['id']=='392480112')
 if change=='geometry':way['points'][0][0]+=.0001
 if change=='oneway':way['oneway']=True
 if change=='blocked':way['blocked']=['2494511819']
 if change=='excluded':way['excludedSegments']=[['2494511819','12487520989']]
 if change=='source':next(p for m in source['maps']if m['id']=='south'for p in m['parkings']if p['code']=='AH4')['points'][0]['x']=0
 if change=='legacy-source':next(p for m in source['maps']if m['id']=='bastenaken'for p in m['parkings']if p['code']=='AH2')['points'][0]['x']=0
 if change=='vpc-control':next(w for w in roads['ways']if w['id']=='931027303')['points'][0][0]+=.0001
 try:build(source,roads);results.append({'change':change,'rejected':False})
 except ValueError as e:results.append({'change':change,'rejected':True,'reason':str(e)})
print(json.dumps(results))`],{cwd,encoding:'utf8',maxBuffer:4e6}));
 for(const item of result)assert.equal(item.rejected,true,item.change+' must require renewed field review');
});
