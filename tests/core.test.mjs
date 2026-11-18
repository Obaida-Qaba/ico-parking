import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDestination, searchParkings, routeStatus } from '../public/core.mjs';

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
});
