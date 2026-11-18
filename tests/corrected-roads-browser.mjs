import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
// Actual HC3 aisle, about 178 m from its road approach. The three lateral
// fragments below cross the C rows but were reported absent on site.
const start=[51.303453,3.2249525],crossing=[51.3028818,3.2254166];
const falseArms=[
 [[51.3030934,3.2260797],[51.3029911,3.225759]],
 [[51.3029911,3.225759],[51.3028818,3.2254166]],
 [[51.3028818,3.2254166],[51.3027863,3.2251174]]
].map(([a,b])=>[(a[0]+b[0])/2,(a[1]+b[1])/2]);
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(position=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:3,heading:153,speed:3}});return 37;};
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));

async function navigate(){
 await page.goto(base+'/?map=south&parking=HC3');
 await page.locator('.destination-code').waitFor();
 await page.evaluate(()=>{const original=L.map;L.map=function(...args){const m=original.apply(this,args);window.__correctedRoadMap=m;return m;};});
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
}

async function verifyPatch(bearing){
 await page.evaluate(({position,bearing})=>{const m=window.__correctedRoadMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(bearing);m.setView(position,18,{animate:false});},{position:crossing,bearing});
 const result=await page.evaluate(ghosts=>{
  const map=window.__correctedRoadMap,container=map.getContainer().getBoundingClientRect();
  const grounds=[...document.querySelectorAll('.corrected-road-ground')];
  const roads=[...document.querySelectorAll('.mapped-road-fill,.mapped-road-outline')];
  const route=document.querySelector('.road-route');
  const groundAt=p=>grounds.find(path=>{
   const local=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM().inverse());
   const css=getComputedStyle(path);
   return path.isPointInFill(local)&&Number(css.fillOpacity)===1&&Number(css.opacity)===1&&css.fill!=='none';
  });
  const paneOf=path=>path.closest('.leaflet-pane');
  const paneDepth=path=>{const pane=paneOf(path);return pane===map.getPane('overlayPane')?0:Number(getComputedStyle(pane).zIndex);};
  const samples=ghosts.map(position=>{
   const p=map.latLngToContainerPoint(position),screen=new DOMPoint(p.x+container.x,p.y+container.y),ground=groundAt(screen);
   let roadDistance=Infinity;
   for(const path of roads){
    const bounds=path.getBoundingClientRect();
    if(screen.x<bounds.left-10||screen.x>bounds.right+10||screen.y<bounds.top-10||screen.y>bounds.bottom+10)continue;
    const matrix=path.getScreenCTM(),length=path.getTotalLength();
    for(let distance=0;distance<=length;distance+=3){const point=path.getPointAtLength(distance),q=new DOMPoint(point.x,point.y).matrixTransform(matrix);roadDistance=Math.min(roadDistance,Math.hypot(q.x-screen.x,q.y-screen.y));}
   }
   return {covered:!!ground,groundDepth:ground?paneDepth(ground):Infinity,roadDistance};
  });
  const routeCSS=getComputedStyle(route),length=route.getTotalLength(),midpoint=route.getPointAtLength(length/2),screenMid=new DOMPoint(midpoint.x,midpoint.y).matrixTransform(route.getScreenCTM());
  const routeGround=groundAt(screenMid),overlay=map.getPane('overlayPane');
  return {samples,roadCount:roads.length,roadDepth:roads.length?paneDepth(roads[0]):Infinity,routeDepth:paneDepth(route),routeAboveGround:!!routeGround&&paneDepth(route)>paneDepth(routeGround),routeInRotatingOverlay:overlay.contains(route)&&grounds.every(path=>overlay.contains(path)),routeLength:length,routeStroke:routeCSS.stroke,routeOpacity:Number(routeCSS.strokeOpacity)*Number(routeCSS.opacity)};
 },falseArms);
 assert.ok(result.roadCount>0,'corrected road geometry is rendered over the patch');
 for(const sample of result.samples){
  assert.ok(sample.covered,`${bearing}° opaque geographic patch hides the old raster crossing`);
  assert.ok(sample.roadDistance>8,`${bearing}° nonexistent lateral arm is absent from rendered road geometry`);
  assert.ok(sample.groundDepth<result.roadDepth,`${bearing}° corrected roads remain above the ground patch`);
 }
 assert.ok(result.routeAboveGround&&result.routeDepth>result.roadDepth,`${bearing}° blue route paints above the opaque patch and base roads`);
 assert.ok(result.routeInRotatingOverlay,`${bearing}° patch and route share geographic rotation`);
 assert.ok(result.routeLength>40&&result.routeOpacity>.9&&result.routeStroke==='rgb(20, 120, 233)',`${bearing}° visible blue HC3 route is preserved`);
}

try{
 await navigate();
 assert.ok(await page.locator('.corrected-road-ground').count()>0,'the reported nonexistent crossing is removed from the raster display, as well as routing');
 for(const bearing of [0,90,270])await verifyPatch(bearing);
 await page.screenshot({path:'test-results/hc3-corrected-crossing.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller);
 await context.setOffline(true);await navigate();await verifyPatch(90);
 assert.equal(await page.locator('#navigation-destination').innerText(),'HC3');
 assert.deepEqual(errors,[]);
 console.log('PASS corrected HC3 road view: nonexistent lateral arms absent, raster crossing covered, blue route above map, 0/90/270 rotation and offline');
}finally{await browser.close();}
