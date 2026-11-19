import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const map=id=>atlas.maps.find(m=>m.id===id);
const parking=(id,code)=>map(id).parkings.find(p=>p.code===code);
test('older Bastenaken uses the actual printed codes and complete visible grid',()=>{
 for(const code of ['BDA','AH2','BH2','CH1','TES','DB4','LB1','LA1','KD4','FE4','GE4','CLT1','CLT2','TP9','POS'])assert.ok(parking('bastenaken',code),'printed '+code);
 for(const code of ['AHH','BDH','HA2','T15','DB1'])assert.equal(parking('bastenaken',code),undefined,'misread '+code+' removed');
 assert.equal(parking('bastenaken','BDA').points.length,3);
 assert.equal(parking('bastenaken','POS').points.length,3);
 assert.equal(map('bastenaken').parkings.length,168);
});
test('the older Hanze label H69 is retained instead of the misread H65',()=>{
 assert.ok(parking('hanze','H69'));
 assert.equal(parking('hanze','H65'),undefined);
 assert.ok(parking('south','H65'),'the distinct current code remains on the current plan');
});
test('North joins rotated A/Q fragments and includes its real lane references',()=>{
 for(const code of ['A1','A46','B','Q9','Q10','DRU','DRQ','DRA001','DRA002','DRA003'])assert.ok(parking('north',code),code);
 for(const code of ['A6','Q'])assert.equal(parking('north',code),undefined,'a text fragment is not a separate code');
 assert.equal(parking('nissan','V').points.length,3,'all three V bands are indexed');
});
test('Toyota includes the visible Y bays, staging rows and perimeter references',()=>{
 for(const code of ['Y02','Y34','Y35','Y38','W01','W06','X02','X04','X06','P10','P70','R01','Z01','Z05'])assert.ok(parking('toyota',code),code);
 assert.equal(parking('toyota','R01').points.length,3);
});

test('Toyota Z perimeter preserves the repeated Z01 label and excludes the capacity 234 annotation',()=>{
 assert.equal(parking('toyota','Z02'),undefined,'the right-edge glyph reads Z01, not a separate Z02');
 assert.equal(parking('toyota','Z01').points.length,3);
 const z04=parking('toyota','Z04');assert.equal(z04.points.length,1);
 assert.ok(Math.abs(z04.y/3+90-501)<.1,'Z04 is the actual lower-corner label, not the vertical capacity 234');
});
test('overpainted GE1 text is excluded in favour of the one visible current label',()=>{
 const point=parking('south','GE1');
 assert.equal(point.points.length,1);
 assert.ok(Math.abs(point.x/3-679.82)<.1);
});
