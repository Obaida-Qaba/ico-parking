import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const start=[51.303453,3.2249525],crossing=[51.3028818,3.2254166];
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(position=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:3,heading:153,speed:3}});return 37;};
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[],tileRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(/https?:\/\/[^/]*tile[^/]*\.openstreetmap\.org\//.test(request.url()))tileRequests.push(request.url());});

async function navigate(){
 await page.goto(base+'/?map=south&parking=HC3');
 await page.locator('.destination-code').waitFor();
 await page.evaluate(()=>{const original=L.map;L.map=function(...args){const m=original.apply(this,args);window.__cleanMap=m;return m;};});
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
}

async function verifyCleanMap(bearing){
 await page.evaluate(({position,bearing})=>{const m=window.__cleanMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(bearing);m.setView(position,18,{animate:false});},{position:crossing,bearing});
 const result=await page.evaluate(()=>{
  const map=window.__cleanMap,route=document.querySelector('.road-route'),css=getComputedStyle(route);
  let tiles=0,polylines=0;map.eachLayer(layer=>{if(layer instanceof L.TileLayer)tiles++;if(layer instanceof L.Polyline)polylines++;});
  return {tiles,polylines,gridPaths:document.querySelectorAll('.mapped-road-fill,.mapped-road-outline,.corrected-road-ground').length,routeLength:route.getTotalLength(),routeStroke:css.stroke,routeOpacity:Number(css.strokeOpacity)*Number(css.opacity),rotating:map.getPane('overlayPane').contains(route),background:getComputedStyle(map.getContainer()).backgroundColor};
 });
 assert.equal(result.tiles,0,`${bearing}° driving map has no default raster tile layer`);
 assert.equal(await page.locator('.leaflet-tile').count(),0,`${bearing}° default map grid images are absent`);
 assert.equal(result.gridPaths,0,`${bearing}° default road grid and former correction patches are absent`);
 assert.equal(result.polylines,2,`${bearing}° only the navigation route and its outline are drawn`);
 assert.ok(result.routeLength>40&&result.routeOpacity>.9&&result.routeStroke==='rgb(20, 120, 233)',`${bearing}° blue HC3 route remains visible`);
 assert.ok(result.rotating,`${bearing}° route retains geographic rotation`);
 assert.notEqual(result.background,'rgba(0, 0, 0, 0)',`${bearing}° clean map has an opaque background`);
 assert.equal(await page.locator('.driving-arrow').count(),1,'GPS position remains visible');
 assert.ok(await page.locator('.nearby-parking').count()>1,'other parking codes remain available');
 assert.equal(await page.locator('#navigation-destination').innerText(),'HC3');
}

try{
 await navigate();
 for(const bearing of [0,90,270])await verifyCleanMap(bearing);
 assert.deepEqual(tileRequests,[],'driving map makes no external default-tile requests');
 await page.screenshot({path:'test-results/hc3-clean-navigation-map.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller);
 await context.setOffline(true);await navigate();await verifyCleanMap(90);
 assert.deepEqual(errors,[]);
 console.log('PASS clean driving map: no default tiles or road grid, GPS and parking labels retained, visible blue route, 0/90/270 rotation and offline');
}finally{await browser.close();}
