import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {distanceMetres} from '../public/navigation.mjs';

const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));

test('South BK quay-band labels stay at the quay boundary rather than inside A-row parking',()=>{
 const misplaced=[];
 for(const letter of 'ABCDEFGHIJKL'){
  const key='south:BK'+letter,point=catalogue.destinations[key];
  assert.ok(point,key+' has a matched quay approach');
  assert.ok(point.sourceBounds[1]>=417,key+' source label belongs to the narrow quay band below the A row');
  assert.ok(point.labelPosition,key+' retains a geographic display label');
  const offset=distanceMetres([point.lat,point.lon],[point.labelPosition.lat,point.labelPosition.lon]);
  if(offset>5)misplaced.push({key,offsetMetres:Math.round(offset)});
 }
 assert.deepEqual(misplaced,[],'quay labels must not be mapped into the neighboring A-row parcel');
});
