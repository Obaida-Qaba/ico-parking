import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as destinations from '../public/destinations.mjs';
import {parkingKey} from '../public/navigation.mjs';
const hit={map:{id:'bastenaken'},parking:{code:'POS'},line:'15'};
const catalogue={destinations:{'south:POS':{lat:51.30,lon:3.22,chooseApproach:true,scope:'parking-group-approach',approaches:[
 {id:'ge2',name:'Near GE2',lat:51.301,lon:3.221,sourceIndices:[2]},
 {id:'ee1-de1',name:'Near EE1 / DE1',lat:51.305,lon:3.224,sourceIndices:[0,1]}
]}}};
test('ambiguous POS must offer both source-supported areas and never route to an arbitrary default',()=>{
 assert.equal(destinations.resolveDestination(hit,{},catalogue),null);
 assert.equal(typeof destinations.destinationChoices,'function');
 const choices=destinations.destinationChoices(hit,catalogue);
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(h=>h.approach),['ge2','ee1-de1']);
 assert.deepEqual(choices.map(h=>h.approachSourceIndices),[[2],[0,1]]);
 for(const [i,choice] of choices.entries()){
  const point=destinations.resolveDestination(choice,{},catalogue);
  assert.equal(point.lat,catalogue.destinations['south:POS'].approaches[i].lat);
  assert.equal(point.approachName,choice.approachName);
  assert.equal(point.exactLine,false);
  assert.equal(point.automatic,true);
  assert.equal(point.scope,'parking-group-approach');
  assert.deepEqual(destinations.destinationChoices(choice,catalogue),[choice]);
 }
});
test('invalid POS approach links reopen choices and cannot resolve as the default bank',()=>{
 const invalid={...hit,approach:'unknown'};
 assert.equal(destinations.resolveDestination(invalid,{},catalogue),null);
 assert.equal(destinations.destinationChoices(invalid,catalogue).length,2);
 const normal={map:{id:'south'},parking:{code:'HC1'}};
 assert.deepEqual(destinations.destinationChoices(normal,catalogue),[normal]);
});
test('an old unscoped POS measurement cannot bypass choosing the destination area',()=>{
 const saved={'south:POS:parking':{lat:51.302,lon:3.222,method:'gps'}};
 assert.equal(destinations.resolveDestination(hit,saved,catalogue),null);
 assert.equal(destinations.resolveDestination({...hit,approach:'unknown'},saved,catalogue),null);
});
test('POS choices have separate saved keys and a measured line only overrides its chosen area',()=>{
 const west={...hit,approach:'ge2'},east={...hit,approach:'ee1-de1'};
 assert.equal(parkingKey(west),'south:POS@ge2:15');
 assert.equal(parkingKey({...west,line:null}),'south:POS@ge2:parking');
 assert.notEqual(parkingKey(west),parkingKey(east));
 const saved={[parkingKey(west)]:{lat:51.302,lon:3.222,method:'gps'}};
 assert.equal(destinations.resolveDestination(west,saved,catalogue).exactLine,true);
 assert.equal(destinations.resolveDestination(east,saved,catalogue).lat,51.305);
});
