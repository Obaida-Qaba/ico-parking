import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDestination, searchParkings, routeStatus } from '../public/core.mjs';

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
  for(const code of ['H53','H54','H71','H73','H80','H85','CH24'])assert.ok(south.parkings.some(p=>p.code===code),code);
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
