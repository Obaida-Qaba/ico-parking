import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCourseTracker,courseBetween,screenHeading} from '../public/heading.mjs';
const fix=(lat,lon,heading,speed=3,timestamp=1000,accuracy=5)=>({lat,lon,heading,speed,timestamp,accuracy});
test('uses the reported driving course and handles the north wrap correctly',()=>{
 const tracker=createCourseTracker();
 assert.equal(tracker.update(fix(51.3,3.23,90)),90);
 assert.equal(tracker.update(fix(51.3,3.23,180,3,2000)),180);
 assert.equal(tracker.update(fix(51.3,3.23,360,3,3000)),0);
 assert.equal(screenHeading(359,1),0);
 assert.ok(Math.abs(courseBetween([51.3,3.23],[51.3,3.24])-90)<.1);
});
test('stationary drift, poor accuracy and out-of-order fixes do not spin the map',()=>{
 const tracker=createCourseTracker();tracker.update(fix(51.3,3.23,90));
 assert.equal(tracker.update(fix(51.30001,3.23,180,0,2000)),90);
 assert.equal(tracker.update(fix(51.30001,3.23,270,4,3000,90)),90);
 assert.equal(tracker.update(fix(51.30001,3.23,270,4,500)),90);
});
test('derives course from meaningful movement when the phone gives no GPS heading',()=>{
 const tracker=createCourseTracker();
 assert.equal(tracker.update(fix(51.3,3.23,null,null)),null);
 assert.equal(tracker.update(fix(51.300001,3.230001,null,null,2000)),null);
 assert.ok(Math.abs(tracker.update(fix(51.3,3.2303,null,null,3000))-90)<.1);
 assert.ok(Math.abs(tracker.update(fix(51.3001,3.2303,null,0,4000))-90)<.1);
});
test('a missing heading is not treated as north, and stopping holds the last direction',()=>{
 const tracker=createCourseTracker();
 assert.equal(tracker.update(fix(51.3,3.23,NaN,0)),null);
 tracker.update(fix(51.3,3.23,270,3,2000));
 assert.equal(tracker.update(fix(51.3,3.23,null,0,3000)),270);
});
