import {test} from 'node:test';
import assert from 'node:assert/strict';
let createPositionMotion;
try{({createPositionMotion}=await import('../public/position-motion.mjs'));}catch{}

function fixture(){
 assert.equal(typeof createPositionMotion,'function','bounded GPS position animation is not implemented');
 let time=0,id=0;const pending=new Map(),positions=[];
 const motion=createPositionMotion({now:()=>time,requestFrame:fn=>{pending.set(++id,fn);return id;},cancelFrame:id=>pending.delete(id),onFrame:p=>positions.push({...p})});
 const advance=ms=>{time+=ms;const frames=[...pending.values()];pending.clear();for(const fn of frames)fn(time);};
 return {motion,positions,advance,pending};
}
test('the first measured GPS position appears immediately without an idle animation loop',()=>{
 const f=fixture();f.motion.set({lat:51.3,lon:3.22});
 assert.deepEqual(f.positions.at(-1),{lat:51.3,lon:3.22});assert.equal(f.pending.size,0);
});
test('a normal driving fix moves through intermediate measured positions instead of jumping',()=>{
 const f=fixture();f.motion.set({lat:51.3,lon:3.22});
 f.motion.set({lat:51.30009,lon:3.22},{duration:800});
 f.advance(200);assert.ok(f.motion.position.lat>51.3&&f.motion.position.lat<51.30009);
 f.advance(200);assert.ok(Math.abs(f.motion.position.lat-51.300045)<1e-10);
 f.advance(400);assert.deepEqual(f.motion.position,{lat:51.30009,lon:3.22});assert.equal(f.pending.size,0);
 f.advance(1000);assert.equal(f.positions.length,4,'no extrapolation or perpetual work after reaching the measured fix');
});
test('a newer fix retargets the current visible position without snapping backwards',()=>{
 const f=fixture();f.motion.set({lat:51.3,lon:3.22});f.motion.set({lat:51.30009,lon:3.22},{duration:800});
 f.advance(400);const before=f.motion.position.lat;
 f.motion.set({lat:51.30018,lon:3.22},{duration:800});assert.equal(f.motion.position.lat,before);
 f.advance(200);assert.ok(f.motion.position.lat>before&&f.motion.position.lat<51.30018);
 f.advance(600);assert.equal(f.motion.position.lat,51.30018);assert.equal(f.pending.size,0);
});
test('large relocations and reduced-motion updates snap, and cancelled tracking stops all frames',()=>{
 const f=fixture();f.motion.set({lat:51.3,lon:3.22});f.motion.set({lat:51.33,lon:3.22},{duration:800});
 assert.equal(f.motion.position.lat,51.33);assert.equal(f.pending.size,0,'do not animate across the port');
 f.motion.set({lat:51.33005,lon:3.22},{duration:0});assert.equal(f.motion.position.lat,51.33005);
 f.motion.set({lat:51.3301,lon:3.22},{duration:800});f.advance(200);
 const before=f.motion.position;f.motion.cancel();f.advance(800);assert.deepEqual(f.motion.position,before);assert.equal(f.pending.size,0);
});
