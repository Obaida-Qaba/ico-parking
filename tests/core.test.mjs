import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDestination, searchParkings, routeStatus, terminalFromInput } from '../public/core.mjs';
import {resolveDestination} from '../public/destinations.mjs';

test('B5 finds the Toyota B05 source reference without inventing a GPS route',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
  const hits=searchParkings(maps,'Toyota B5 line 12','north');
  assert.equal(hits.length,1);
  assert.equal(hits[0].parking.code,'B05');
  assert.equal(hits[0].line,'12');
  assert.equal(hits[0].exactMatch,true,'a full numeric equivalent can be selected on submit');
  assert.equal(resolveDestination(hits[0],{},catalogue),null,'a successful name match is not geographic proof');
});

test('omitted leading zeroes never merge distinct official codes in one map',()=>{
  const maps=[{id:'toyota',name:'Toyota',parkings:[{code:'B5'},{code:'B05'},{code:'B50'}]}];
  assert.deepEqual(searchParkings(maps,'B5').map(h=>h.parking.code),['B5','B50']);
  assert.deepEqual(searchParkings(maps,'B05').map(h=>h.parking.code),['B05']);
  const alternatives=searchParkings([{id:'toyota',name:'Toyota',parkings:[{code:'B005'},{code:'B05'},{code:'B50'}]}],'B5');
  assert.equal(alternatives.filter(h=>h.exactMatch).length,2,'ambiguous padded codes remain explicit choices');
});

test('literal Toyota A01 and H01 remain exact even near North A1 or Hanze H1',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  for(const [query,preferredTerminal] of [['A01','north'],['H01','hanze']]){
    const hits=searchParkings(maps,query,'auto',{preferredTerminal});
    assert.deepEqual(hits.filter(hit=>hit.exactMatch).map(hit=>`${hit.map.id}:${hit.parking.code}`),[`toyota:${query}`]);
  }
});

test('a literal code outside an explicit terminal filter does not block its local numeric equivalent',()=>{
  const maps=[
    {id:'north',name:'North',parkings:[{code:'B5'}]},
    {id:'toyota',name:'Toyota',parkings:[{code:'B05'}]}
  ];
  assert.deepEqual(searchParkings(maps,'Toyota B5').filter(hit=>hit.exactMatch).map(hit=>`${hit.map.id}:${hit.parking.code}`),['toyota:B05']);
});

test('a terminal named in the search overrides a previous dropdown selection',()=>{
  const maps=[{id:'south',parkings:[{code:'HC1',terminal:'bastenaken'}]}];
  assert.equal(searchParkings(maps,'HC1 Bastenaken','north')[0]?.parking.code,'HC1');
});

test('accepts the real spoken destination and common Dutch variants', () => {
  for (const input of ['H61 line 15', 'parking H61 lijn 15', 'h 61 / 15', 'H61 rij 15']) {
    assert.deepEqual(parseDestination(input), { parking: 'H61', line: '15', error: null });
  }
});
test('preserves numeric codes, leading zeroes and compound parking names', () => {
  assert.equal(parseDestination('A01').parking, 'A01');
  assert.equal(parseDestination('H51 A line 2').parking, 'H51A');
  assert.equal(parseDestination('GE 1').parking, 'GE1');
  assert.equal(parseDestination('P 26 line 3').parking, 'P26');
});
test('rejects zero, negative and malformed line numbers rather than guessing', () => {
  for (const input of ['H61 line 0', 'H61 line -1', 'H61 line abc', 'H61 line 1.5']) {
    assert.ok(parseDestination(input).error, input);
  }
});
test('exact parking matches rank ahead of prefixes and duplicates remain distinguishable', () => {
  const maps = [{ id: 'south', name: 'South', parkings: [{ code:'H6' },{ code:'H61' }] }, { id:'hanze', name:'Hanze', parkings:[{ code:'H61' }] }];
  const found = searchParkings(maps, 'H61 line 15');
  assert.equal(found.length, 2);
  assert.equal(found[0].parking.code, 'H61');
  assert.equal(found[0].line, '15');
  assert.notEqual(found[0].map.id, found[1].map.id);
  assert.equal(searchParkings(maps, 'H6')[0].parking.code, 'H6');
  assert.equal(searchParkings(maps, 'H999').length, 0);
});
test('unverified routing never returns fabricated line or road guidance', () => {
  assert.equal(routeStatus({ code:'H61' }, '15').available, false);
  assert.equal(routeStatus({ code:'H61' }, null).available, false);
  assert.equal(routeStatus(null, '15').available, false);
});
test('all source labels lie inside their rendered plan, including H61', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url)));
  assert.equal(data.maps.length, 6);
  for (const map of data.maps) {
    assert.ok(map.parkings.length > 0, map.id);
    assert.ok(map.source.startsWith('https://'));
    assert.ok(map.width > 0 && map.height > 0);
    for (const p of map.parkings) {
      assert.ok(p.x >= 0 && p.x <= map.width, `${map.id}:${p.code} x`);
      assert.ok(p.y >= 0 && p.y <= map.height, `${map.id}:${p.code} y`);
    }
  }
  assert.ok(data.maps.find(m=>m.id==='south').parkings.some(p=>p.code==='H61'));
  const south=data.maps.find(m=>m.id==='south');
  assert.match(south.date,/2026/);
  for(const code of ['H53','H54','H71','H73','H80','H85','CH24','AA1','AA2'])assert.ok(south.parkings.some(p=>p.code===code),code);
});

test('North single-letter destinations use parking labels rather than fragments of warehouse text',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  const north=maps.find(m=>m.id==='north');
  assert.equal(north.parkings.find(p=>p.code==='L').points.length,1);
  assert.equal(north.parkings.find(p=>p.code==='P').points.length,1);
  assert.equal(north.parkings.find(p=>p.code==='W').points.length,1);
  assert.ok(north.parkings.find(p=>p.code==='L').y<1000,'the actual L block is in the upper paired grid');
});

test('POS is searchable in Bastenaken with every actual repeated source label',()=>{
 const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
 const south=maps.find(m=>m.id==='south'),pos=south.parkings.find(p=>p.code==='POS');
 assert.ok(pos,'the printed POS reference is indexed');
 assert.equal(pos.points.length,3,'three printed labels across the two POS compounds');
 assert.equal(searchParkings(maps,'POS','bastenaken')[0].parking.code,'POS');
 assert.equal(south.parkings.some(p=>p.code==='POS01'),false,'the small edge annotation is not invented as a separate parking compound');
});

test('Toyota includes the printed extra parking blocks and its row markers stay in their source rows',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  const toyota=maps.find(m=>m.id==='toyota');
  for(const code of ['A09','F00','G00','P02','P03','P04','P05'])assert.ok(toyota.parkings.some(p=>p.code===code),code);
  for(const [code,expected] of Object.entries({H01:[195,183],F14:[1086,1239],I17:[597,1995],P04:[1246.5,579.9]})){
    const point=toyota.parkings.find(p=>p.code===code);
    assert.ok(Math.hypot(point.x-expected[0],point.y-expected[1])<1,code+' uses its actual source row');
  }
});

test('Bastenaken searches include current HC1, rather than only the sparse older plan',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  const hits=searchParkings(maps,'HC1','bastenaken');
  assert.ok(hits.length>0);
  assert.equal(hits[0].map.id,'south');
  assert.equal(hits[0].parking.code,'HC1');
  assert.equal(hits[0].parking.terminal,'bastenaken');
  assert.equal(hits[0].matchedTerminal,'bastenaken');
  assert.ok(hits.every(h=>h.map.id!=='north'));
});

test('Hanze searches resolve current H61 and keep other terminal filters isolated',()=>{
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  assert.equal(searchParkings(maps,'H61 line 15','hanze')[0].map.id,'south');
  assert.equal(searchParkings(maps,'H61','bastenaken').length,0);
  assert.equal(searchParkings(maps,'HC1','hanze').length,0);
  assert.equal(searchParkings(maps,'HC1','north').length,0);
});

test('accepts terminal names before or after a parking without changing the parking code',()=>{
  for(const input of ['HC1 Bastenaken','Bastenaken HC1','Bastenaken HC1 line 15','HC1 line 15 Bastenaken']){
    const parsed=parseDestination(input);
    assert.equal(parsed.parking,'HC1');assert.equal(parsed.error,null);
  }
  const {maps}=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
  const hits=searchParkings(maps,'HC1 Bastenaken');
  assert.equal(hits[0].map.id,'south');
  assert.equal(hits[0].parking.code,'HC1');
  assert.equal(searchParkings(maps,'Hanze H61 line 15')[0].line,'15');
});

const nearbyMaps=[
  {id:'north',name:'North',parkings:[{code:'A01'},{code:'A02'},{code:'N12'}]},
  {id:'toyota',name:'Toyota',historical:true,parkings:[{code:'A01'},{code:'A03'},{code:'12'}]},
  {id:'south',name:'South',parkings:[{code:'HC1',terminal:'bastenaken'},{code:'H61',terminal:'hanze'}]},
  {id:'bastenaken',name:'Older Bastenaken',historical:true,parkings:[{code:'HC1'}]},
  {id:'hanze',name:'Older Hanze',historical:true,parkings:[{code:'H61'}]}
];

test('automatic terminal preference puts Toyota parking first while retaining other terminal matches',()=>{
  const hits=searchParkings(nearbyMaps,'A0','auto',{preferredTerminal:'toyota'});
  assert.deepEqual(hits.map(h=>`${h.map.id}:${h.parking.code}`),['toyota:A01','toyota:A03','north:A01','north:A02']);
  assert.deepEqual(hits.map(h=>h.preferred),[true,true,false,false]);
  const duplicates=searchParkings(nearbyMaps,'A01','all',{preferredTerminal:'toyota'});
  assert.equal(duplicates[0].map.id,'toyota','a current outside-terminal duplicate must not outrank the local Toyota reference');
  assert.equal(duplicates[1].map.id,'north');
});

test('automatic search falls back to other terminals when the local terminal has no match',()=>{
  const hits=searchParkings(nearbyMaps,'N12','auto',{preferredTerminal:'toyota'});
  assert.equal(hits.length,1);
  assert.equal(hits[0].map.id,'north');
  assert.equal(hits[0].preferred,false);
});

test('manual and typed terminal choices override the automatic location preference',()=>{
  const manual=searchParkings(nearbyMaps,'A01','north',{preferredTerminal:'toyota'});
  assert.deepEqual(manual.map(h=>h.map.id),['north']);
  assert.equal(manual[0].preferred,false);
  const typed=searchParkings(nearbyMaps,'Toyota A01','north',{preferredTerminal:'north'});
  assert.deepEqual(typed.map(h=>h.map.id),['toyota']);
  assert.equal(typed[0].preferred,false);
});

test('regional automatic preferences use the current South plan ahead of older regional plans',()=>{
  for(const [terminal,code] of [['bastenaken','HC1'],['hanze','H61']]){
    const hits=searchParkings(nearbyMaps,code,'auto',{preferredTerminal:terminal});
    assert.equal(hits[0].map.id,'south');
    assert.equal(hits[0].matchedTerminal,terminal);
    assert.equal(hits[0].preferred,true);
    assert.equal(hits[1].map.id,terminal);
    assert.equal(hits[1].preferred,true);
  }
});

test('missing or unknown location preference preserves normal all-terminal results',()=>{
  const normal=searchParkings(nearbyMaps,'A01');
  for(const preferredTerminal of [null,'unknown-terminal']){
    const hits=searchParkings(nearbyMaps,'A01','auto',{preferredTerminal});
    assert.deepEqual(hits.map(h=>h.map.id),normal.map(h=>h.map.id));
    assert.ok(hits.every(h=>h.preferred===false));
  }
});

test('terminal aliases keep Toyota numeric parking codes and line numbers intact',()=>{
  for(const [input,terminal,code] of [['Toyota 12 line 3','toyota','12'],['Nissan 12 line 3','nissan','12'],['North A01 line 3','north','A01'],['South A01 line 3','south','A01']]){
    assert.equal(terminalFromInput(input),terminal);
    assert.deepEqual(parseDestination(input),{parking:code,line:'3',error:null});
  }
});
