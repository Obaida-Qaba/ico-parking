import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextInstruction} from '../public/guidance.mjs';
const p=(x,y)=>[51.3+y/111195,3.23+x/(111195*Math.cos(51.3*Math.PI/180))];
test('warns about an initial reversal rather than telling an east-facing driver to go straight west',()=>{
 assert.match(nextInstruction([p(60,0),p(10,0)],{heading:90}),/Turn around/);
});
test('does not skip a real turn because the GPS position is one metre from its junction',()=>{
 assert.match(nextInstruction([p(0,0),p(1,0),p(1,20),p(1,40)]),/Left turn in 5 m/);
});
test('ignores duplicate points without losing the next turn',()=>{
 assert.match(nextInstruction([p(0,0),p(0,0),p(10,0),p(10,-20)]),/Right turn in 10 m/);
});
test('a straight road has no invented turn',()=>{
 assert.equal(nextInstruction([p(0,0),p(10,0),p(20,0)],{heading:90}),'Follow the highlighted road');
});

test('densely sampled road geometry retains its next turn',()=>{
 const points=[...Array.from({length:101},(_,i)=>p(i/10,0)),...Array.from({length:100},(_,i)=>p(10,(i+1)/10))];
 assert.match(nextInstruction(points),/Left turn in 10 m/);
});
