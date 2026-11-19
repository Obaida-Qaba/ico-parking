import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as auditApi from '../scripts/lib/parking-audit.mjs';
const p=x=>[51.3,3.23+x*.0001];
const map={id:'south',name:'South',width:100,height:100,parkings:[{code:'A',x:5,y:5,points:[{x:5,y:5}]},{code:'B',x:10,y:10,points:[{x:10,y:10}]}]};
const road={id:'one',nodes:['a','b','c'],points:[p(0),p(5),p(10)],oneway:false};
const pin={lat:p(8)[0],lon:p(8)[1],roadWay:'one',roadSegment:['b','c'],sourceMap:'south',sourcePoint:[5,5],sourceBounds:[0,0,10,10],scope:'parking-approach',basis:'Independently matched block boundary',lineExact:false};
const run=(destinations,extra={})=>auditApi.auditParkings({atlas:{maps:[map]},catalogue:{destinations},roads:{ways:[road]},origins:{south:[{name:'west',point:p(1)}]},...extra});

test('full audit never treats a missing reference as a passing parking',()=>{
 const report=run({'south:A':pin});
 assert.equal(report.rows.length,2);
 assert.equal(report.summary.references,2);
 assert.equal(report.summary.routeReady,1);
 assert.equal(report.summary.complete,false);
 assert.deepEqual(report.rows.find(r=>r.code==='B').issues,['missing-destination']);
 assert.equal(report.rows.find(r=>r.code==='A').routeReady,true);
 assert.equal(report.rows.find(r=>r.code==='A').surveyedDestination,false,'a connected road does not establish surveyed accuracy');
});
test('audit verifies the declared arrival lane, not just any nearby drivable road',()=>{
 const report=run({'south:A':{...pin,roadWay:'nonexistent'}});
 const row=report.rows.find(r=>r.code==='A');
 assert.ok(row.issues.includes('arrival-road-mismatch'));
 assert.equal(row.routeReady,false);
});
test('every explicit area is audited and shared or historical approaches retain their precision limits',()=>{
 const report=run({'south:A':{...pin,chooseApproach:true,approaches:[{...pin,id:'first',name:'First'},{...pin,id:'second',name:'Second',scope:'parking-group-approach',historical:true}]}});
 const rows=report.rows.filter(r=>r.code==='A');
 assert.equal(rows.length,2);
 assert.equal(report.summary.references,2,'choices do not inflate the number of source references');
 assert.equal(report.summary.targets,2);
 assert.deepEqual(rows.map(r=>r.approach),['first','second']);
 assert.equal(rows[1].precision,'historical-area-approach');
 assert.equal(rows[1].surveyedDestination,false);
 assert.equal(report.summary.surveyedDestinations,0);
});
test('source metadata outside its own declared drawing bounds is reported separately from route connectivity',()=>{
 const report=run({'south:A':{...pin,sourcePoint:[25,5]}});
 const row=report.rows.find(r=>r.code==='A');
 assert.ok(row.issues.includes('source-outside-bounds'));
 assert.equal(row.locationEvidenceConsistent,false);
 assert.equal(row.routeReady,true,'the report distinguishes connectivity from geographic evidence');
});

test('a connected shared entrance retains its unverified individual-parking status in the audit',()=>{
 const report=run({'south:A':{...pin,scope:'parking-group-approach',precision:'area-entry-only',individualParkingVerified:false,historical:true}});
 const row=report.rows.find(row=>row.code==='A');
 assert.equal(row.routeReady,true,'the road route reaches the shared entrance');
 assert.equal(row.precision,'area-entry-only','historical and group metadata must not hide the entrance-only limitation');
 assert.equal(row.individualParkingVerified,false);
 assert.equal(report.summary.areaEntranceReferences,1);
 assert.equal(report.summary.complete,false);
});
test('a disconnected destination fails the full audit even when it lies exactly on a real road',()=>{
 const far={id:'far',nodes:['x','y'],points:[[51.31,3.24],[51.31,3.241]],oneway:false};
 const report=run({'south:A':{...pin,lat:51.31,lon:3.2405,roadWay:'far',roadSegment:['x','y']}},{roads:{ways:[road,far]}});
 const row=report.rows.find(r=>r.code==='A');
 assert.equal(row.routeReady,false);
 assert.ok(row.issues.includes('route-unavailable'));
 assert.equal(row.routes[0].available,false);
});
test('closed road loops accept the last segment even when its end node also starts the way',()=>{
 const loop={id:'loop',nodes:['a','b','c','a'],points:[p(0),p(5),[51.301,3.231],p(0)],oneway:false};
 const point={...pin,lat:51.3005,lon:3.2305,roadWay:'loop',roadSegment:['c','a']};
 const row=run({'south:A':point},{roads:{ways:[loop]},includeNearby:false}).rows[0];
 assert.equal(row.arrivalRoadConsistent,true);
});
test('an arrival on the wrong segment of the right road fails the audit',()=>{
 const row=run({'south:A':{...pin,roadSegment:['a','b']}}).rows[0];
 assert.equal(row.arrivalRoadConsistent,false);
 assert.ok(row.issues.includes('arrival-road-mismatch'));
});
test('target-lane endpoint probes cannot certify an isolated destination without an independent terminal origin',()=>{
 const row=run({'south:A':pin},{origins:{}}).rows[0];
 assert.equal(row.routes.every(route=>route.available),true,'local endpoints alone can produce plausible routes');
 assert.equal(row.routeReady,false);
 assert.ok(row.issues.includes('no-confirmed-test-origin'));
});
test('invalid declared compound areas remain failed audit rows instead of disappearing through the UI filter',()=>{
 const report=run({'south:A':{...pin,chooseApproach:true,approaches:[{...pin,id:'good',name:'Good'},{...pin,id:'broken',name:'Broken',lat:null}]}});
 const rows=report.rows.filter(row=>row.code==='A');
 assert.equal(rows.length,2);
 assert.equal(rows.find(row=>row.approach==='broken').routeReady,false);
 assert.ok(rows.find(row=>row.approach==='broken').issues.includes('missing-destination'));
 assert.equal(report.summary.routeReady,0,'one good area cannot certify the whole repeated reference');
});
test('audit input fingerprints survive Git line-ending conversion while detecting changed data',()=>{
 assert.equal(auditApi.auditInputHash('{\r\n"value": 1\r\n}'),auditApi.auditInputHash('{\n"value": 1\n}'));
 assert.notEqual(auditApi.auditInputHash('{"value":1}'),auditApi.auditInputHash('{"value":2}'));
});
test('an internal-only road island can pass its local routes without passing the inter-terminal route',()=>{
 const far={id:'far',nodes:['x','y'],points:[[51.31,3.24],[51.31,3.241]],oneway:false};
 const report=run({'south:A':{...pin,routingScope:'terminal-internal'}},{roads:{ways:[road,far]},origins:{south:[{name:'inside',point:p(1)},{name:'other-terminal',point:far.points[0],scope:'inter-terminal'}]}});
 const row=report.rows[0];
 assert.equal(row.withinTerminalReady,true);
 assert.equal(row.routeReady,false);
 assert.equal(report.summary.withinTerminalRouteReady,1);
 assert.equal(report.summary.routeReady,0);
});
