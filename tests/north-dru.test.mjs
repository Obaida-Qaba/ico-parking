import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildGraph,nearestRoad,routeRoads} from '../public/navigation.mjs';

const cwd=new URL('../',import.meta.url);
const run=code=>JSON.parse(execFileSync('python',['-c',code],{cwd,encoding:'utf8'}));
const result=()=>run("import json,runpy;print(json.dumps(runpy.run_path('scripts/build_north_remaining_destinations.py')['RESULT']))");
const roads=JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url)));
const published=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url))).destinations;

test('DRU resolves its named outer U-side lane on the existing road, with2026 evidence',()=>{
 const p=result().destinations['north:DRU'];assert.ok(p,'reviewed DRU lane reference must be emitted');
 assert.equal(p.roadWay,'241878055');assert.deepEqual(p.roadSegment,['2494558928','2494558936']);
 assert.equal(p.destinationKind,'parking-lane-reference');assert.equal(p.scope,'parking-group-approach');
 assert.equal(p.lineExact,false);assert.equal(p.provenance.imageryFlightDate,'2026-03-05');
 assert.equal(p.provenance.imageryLayer,'OFW');
 const original=[[49.0156,541.4828],[45.2179,682.2490]];
 assert.equal(p.sourcePoints.length,2);
 for(let i=0;i<2;i++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(p.sourcePoints[i][axis]-original[i][axis])<.01,'atlas rounding preserves the actual PDF label');
 const graph=buildGraph(roads),point=[p.lat,p.lon],snap=nearestRoad(graph,point);
 assert.equal(snap.segment.way,p.roadWay);assert.ok(snap.distance<.1);
 const from=published['north:BB'],route=routeRoads(graph,[from.lat,from.lon],point);
 assert.ok(route.available,'the named lane has a real North-terminal driving connection');assert.ok(route.endOffset<.1);
});

test('a closed DRU boundary segment cannot silently retain an automatic target',()=>{
 const response=run(`import json,runpy
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();raw=Path.read_text;roads=json.loads(raw(root/'public/roads.json'))
next(w for w in roads['ways'] if w['id']=='241878055')['blocked']=['2494558928']
def read(path,*args,**kwargs):return json.dumps(roads) if path==root/'public/roads.json' else raw(path,*args,**kwargs)
try:
 with patch.object(Path,'read_text',read):runpy.run_path('scripts/build_north_remaining_destinations.py')
 print(json.dumps({'rejected':False}))
except ValueError as error:print(json.dumps({'rejected':True,'reason':str(error)}))`);
 assert.equal(response.rejected,true,'closed approach invalidates the reviewed source-road match');
});
