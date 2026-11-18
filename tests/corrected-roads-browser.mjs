import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {observeMap} from './observe-map.mjs';

mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const start=[51.303453,3.2249525],crossing=[51.3028818,3.2254166];
const falseArms=[
 [[51.3030934,3.2260797],[51.3029911,3.225759]],
 [[51.3029911,3.225759],[51.3028818,3.2254166]],
 [[51.3028818,3.2254166],[51.3027863,3.2251174]]
].map(([a,b])=>[(a[0]+b[0])/2,(a[1]+b[1])/2]);
const actualAisles=[[51.3030934,3.2260797],[51.3029911,3.225759],[51.3027863,3.2251174]];
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__cleanMap');
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
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
}

async function verifyVisibleRoads(bearing){
 await page.evaluate(({position,bearing})=>{const m=window.__cleanMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(bearing);m.setView(position,18,{animate:false});},{position:crossing,bearing});
 const result=await page.evaluate(({ghosts,aisles})=>{
  const map=window.__cleanMap,route=document.querySelector('.road-route'),css=getComputedStyle(route);
  const bounds=map.getContainer().getBoundingClientRect(),roads=[...document.querySelectorAll('.mapped-road-fill')],outlines=[...document.querySelectorAll('.mapped-road-outline')];
  const roadPane=roads[0]?.closest('.leaflet-pane'),overlay=map.getPane('overlayPane');
  const painted=(paths,position,radius=0)=>{
   const p=map.latLngToContainerPoint(position),screen=new DOMPoint(p.x+bounds.x,p.y+bounds.y);
   for(const path of paths){
    const css=getComputedStyle(path);if(css.stroke==='none'||Number(css.strokeOpacity)<=.5)continue;
    const inverse=path.getScreenCTM().inverse();
    for(const r of radius?[0,4,8]:[0])for(let i=0;i<(r?16:1);i++){
     const probe=new DOMPoint(screen.x+r*Math.cos(i*Math.PI/8),screen.y+r*Math.sin(i*Math.PI/8)).matrixTransform(inverse);
     if(path.isPointInStroke(probe))return true;
    }
   }
   return false;
  };
  const visibleAisles=aisles.map(p=>painted(roads,p));
  const ghostPaint=ghosts.map(p=>painted(outlines,p,8));
  const subpaths=roads.reduce((sum,path)=>sum+(path.getAttribute('d').match(/M/g)||[]).length,0);
  let tiles=0,polylines=0;map.eachLayer(layer=>{if(layer instanceof L.TileLayer)tiles++;if(layer instanceof L.Polyline)polylines++;});
  return {tiles,polylines,roadCount:roads.length,subpaths,visibleAisles,ghostPaint,roadsBelowRoute:!!roadPane&&overlay.contains(roadPane)&&Number(getComputedStyle(roadPane).zIndex)<0&&route.closest('.leaflet-pane')===overlay,routeLength:route.getTotalLength(),routeStroke:css.stroke,routeOpacity:Number(css.strokeOpacity)*Number(css.opacity),rotating:overlay.contains(route),background:getComputedStyle(map.getContainer()).backgroundColor};
 },{ghosts:falseArms,aisles:actualAisles});
 assert.equal(result.tiles,0,`${bearing}° driving map has no default raster tile layer`);
 assert.equal(await page.locator('.leaflet-tile').count(),0,`${bearing}° default map grid images are absent`);
 assert.ok(result.roadCount>0&&result.subpaths>5,`${bearing}° corrected road network is drawn around the navigation route`);
 assert.ok(result.visibleAisles.every(Boolean),`${bearing}° actual surrounding aisles are visibly painted at their geographic positions`);
 assert.ok(result.ghostPaint.every(painted=>!painted),`${bearing}° no road is painted within eight pixels of a removed lateral arm`);
 assert.ok(result.roadsBelowRoute,`${bearing}° road network shares geographic rotation and paints below the blue route`);
 assert.ok(result.routeLength>40&&result.routeOpacity>.9&&result.routeStroke==='rgb(20, 120, 233)',`${bearing}° blue HC3 route remains visible`);
 assert.ok(result.rotating,`${bearing}° route retains geographic rotation`);
 assert.notEqual(result.background,'rgba(0, 0, 0, 0)',`${bearing}° clean map has an opaque background`);
 assert.equal(await page.locator('.driving-arrow').count(),1,'GPS position remains visible');
 assert.ok(await page.locator('.nearby-parking').count()>1,'other parking codes remain available');
 assert.equal(await page.locator('#navigation-destination').innerText(),'HC3');
}

try{
 await navigate();
 for(const bearing of [0,90,270])await verifyVisibleRoads(bearing);
 assert.deepEqual(tileRequests,[],'driving map makes no external default-tile requests');
 await page.screenshot({path:'test-results/hc3-visible-road-network.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller);
 await context.setOffline(true);await navigate();await verifyVisibleRoads(90);
 assert.deepEqual(errors,[]);
 console.log('PASS visible corrected roads: surrounding road network, excluded crossing absent, blue route/GPS/labels, 0/90/270 rotation and offline, no raster tiles');
}finally{await browser.close();}
