import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const target=catalogue.destinations['south:HC1'];
assert.ok(target,'HC1 built-in destination');
let start;
for(const point of graph.nodes.values()){
  const direct=distanceMetres(point,[target.lat,target.lon]);
  if(direct<150||direct>300)continue;
  const route=routeRoads(graph,point,[target.lat,target.lon]);
  if(route.available&&route.distance<1000){start=point;break;}
}
assert.ok(start,'connected HC1 starting road');
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(position=>{
  window.__gpsStarts=0;window.__gpsStops=0;
  navigator.geolocation.watchPosition=ok=>{
    window.__gpsStarts++;window.__headingFix=ok;
    ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:5,heading:90,speed:4}});
    return 43;
  };
  navigator.geolocation.clearWatch=()=>window.__gpsStops++;
  Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:()=>Promise.reject(new DOMException('Use fixed viewport test fallback','NotAllowedError'))});
},start);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));

async function sendHeading(heading){
  await page.evaluate(({position,heading})=>window.__headingFix({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:5,heading,speed:4}}),{position:start,heading});
}
async function waitBearing(degrees){
  await page.waitForFunction(expected=>{
    const map=window.__headingMap;
    if(typeof map?.getBearing!=='function')return false;
    const delta=((map.getBearing()-expected+540)%360)-180;
    return Math.abs(delta)<2;
  },((degrees%360)+360)%360,{timeout:8000});
}
async function assertHeadingUp(course){
  await waitBearing(-course);
  const geometry=await page.evaluate(({position,course})=>{
    const map=window.__headingMap,rad=course*Math.PI/180;
    const forward=[position[0]+60*Math.cos(rad)/111195,position[1]+60*Math.sin(rad)/(111195*Math.cos(position[0]*Math.PI/180))];
    const here=map.latLngToContainerPoint(position),ahead=map.latLngToContainerPoint(forward),size=map.getSize();
    const arrow=document.querySelector('.driving-arrow');
    let arrowAngle=null;
    if(arrow){
      let sum=0;
      for(let element=arrow;element&&element!==document.body;element=element.parentElement){
        const transform=getComputedStyle(element).transform;
        if(transform&&transform!=='none'){const matrix=new DOMMatrixReadOnly(transform);sum+=Math.atan2(matrix.b,matrix.a)*180/Math.PI;}
      }
      arrowAngle=((sum+540)%360)-180;
    }
    const result={dx:ahead.x-here.x,dy:ahead.y-here.y,yFraction:here.y/size.y,xFraction:here.x/size.x,arrowAngle};
    // Verify the rendered navigation overlay, without restoring a basemap grid.
    const inspect=pane=>{
      const line=L.polyline([position,forward],{pane,color:'#000',weight:3,interactive:false}).addTo(map);
      const path=line.getElement(),matrix=path.getScreenCTM(),a=path.getPointAtLength(0),b=path.getPointAtLength(path.getTotalLength());
      const pa=new DOMPoint(a.x,a.y).matrixTransform(matrix),pb=new DOMPoint(b.x,b.y).matrixTransform(matrix);
      line.remove();return {dx:pb.x-pa.x,dy:pb.y-pa.y};
    };
    result.overlay=inspect('overlayPane');
    return result;
  },{position:start,course});
  for(const [name,vector] of [['geographic conversion',geometry],['navigation vector',geometry.overlay]]){
    assert.ok(vector.dy<-10,`${course}° ${name} points toward top of screen`);
    assert.ok(Math.abs(vector.dx)<Math.max(4,Math.abs(vector.dy)*.08),`${course}° ${name} is nearly vertical: ${JSON.stringify(vector)}`);
  }
  assert.ok(geometry.yFraction>=.55&&geometry.yFraction<=.72,`${course}° location leaves road visible ahead (${geometry.yFraction.toFixed(3)} of map height)`);
  assert.ok(geometry.xFraction>=.43&&geometry.xFraction<=.57,`${course}° location stays horizontally centred`);
  assert.ok(geometry.arrowAngle!==null&&Math.abs(geometry.arrowAngle)<3,`${course}° blue driving arrow points forward/up (${geometry.arrowAngle}°)`);
}

try{
  await page.goto(base+'/?map=south&parking=HC1&line=15');
  await page.locator('.destination-code').waitFor();
  // Capture map objects as app switches from the source plan to the street view.
  await page.evaluate(()=>{
    const original=L.map;
    L.map=function(...args){const map=original.apply(this,args);window.__headingMap=map;return map;};
  });
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  await page.locator('.driving-arrow').waitFor();
  await assertHeadingUp(90);
  await sendHeading(180);await assertHeadingUp(180);
  await sendHeading(270);await assertHeadingUp(270);
  await page.screenshot({path:'test-results/mobile-heading-up-simulated-gps.png',fullPage:true});

  await page.locator('#north-up').click();
  await waitBearing(0);
  await sendHeading(270);
  await page.waitForTimeout(350);
  await waitBearing(0);
  await page.locator('#locate').click();
  await assertHeadingUp(270);

  // A user pan temporarily suspends the following camera until recenter is selected.
  await page.evaluate(()=>{const map=window.__headingMap;map.fire('dragstart');map.panBy([50,0],{animate:false});});
  const browsingBearing=await page.evaluate(()=>window.__headingMap.getBearing());
  await sendHeading(45);await page.waitForTimeout(350);
  const heldBearing=await page.evaluate(()=>window.__headingMap.getBearing());
  assert.ok(Math.abs(((heldBearing-browsingBearing+540)%360)-180)<2,'manual browsing suspends heading-up camera');
  await page.locator('#locate').click();await assertHeadingUp(45);

  const before=await page.locator('#navigation-destination').innerText();
  await page.locator('#map-fullscreen').click();
  await page.waitForFunction(()=>document.body.classList.contains('map-fullscreen'));
  await sendHeading(90);await assertHeadingUp(90);
  await page.locator('#map-fullscreen').click();
  await page.waitForFunction(()=>!document.body.classList.contains('map-fullscreen'));
  await sendHeading(180);await assertHeadingUp(180);
  assert.equal(await page.locator('#navigation-destination').innerText(),before,'fullscreen preserves destination');
  assert.equal(await page.locator('.road-route').count(),1,'route remains visible after camera changes');
  assert.equal(await page.evaluate(()=>window.__gpsStarts),1,'camera modes do not restart GPS tracking');
  assert.equal(await page.evaluate(()=>window.__gpsStops),0,'camera modes do not stop GPS tracking');
  assert.deepEqual(errors,[],'no uncaught browser errors');
  console.log('PASS heading-up: 90/180/270 courses rotate navigation geometry toward top, blue arrow points forward, lower-centred position, north-up/recenter, manual-pan suspension, fullscreen and GPS state preserved');
}finally{await browser.close();}
