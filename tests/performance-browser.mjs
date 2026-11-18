import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeMap} from './observe-map.mjs';
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__performanceMap');
await context.addInitScript(()=>{
 navigator.geolocation.watchPosition=ok=>{window.__performanceFix=ok;ok({timestamp:Date.now(),coords:{latitude:51.3074,longitude:3.221,accuracy:3,heading:153,speed:4}});return 81;};
 navigator.geolocation.clearWatch=()=>{};
});
const page=await context.newPage();
const cdp=await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
try{
 await page.goto(base);await page.locator('.gps-dot').waitFor();
 await page.locator('.mapped-road-fill').waitFor();
 const result=await page.evaluate(async catalogue=>{
  const map=window.__performanceMap;map.fire('dragstart');map.stopHeadingUp();map.setBearing(0);map.setView([51.3074,3.221],16,{animate:false});
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const parkingLayers=[];map.eachLayer(layer=>{if(layer.getElement?.()?.classList.contains('nearby-parking'))parkingLayers.push(layer);});
  const size=map.getSize(),withinBuffer=point=>point.x>=-64&&point.x<=size.x+64&&point.y>=-64&&point.y<=size.y+64;
  const parkingDOM={catalogue:Object.keys({...catalogue.destinations,...catalogue.labels}).length,attached:parkingLayers.length,offscreen:parkingLayers.filter(layer=>!withinBuffer(map.latLngToContainerPoint(layer.getLatLng()))).length};
  const stableParking=parkingLayers.find(layer=>{const point=map.latLngToContainerPoint(layer.getLatLng());return point.x>64&&point.x<size.x-64&&point.y>64&&point.y<size.y-64;});
  const stableParkingElement=stableParking?.getElement();
  for(let i=0;i<100;i++)map.fire('rotate');
  await new Promise(resolve=>setTimeout(resolve,100));
  const sameParkingLayer=stableParking&&map.hasLayer(stableParking)&&stableParkingElement===stableParking.getElement();
  map.setView([51.34,3.221],16,{animate:false});
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const parkingDetachedOffscreen=stableParking&&!map.hasLayer(stableParking);
  map.setView([51.3074,3.221],16,{animate:false});
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const parkingReusedAfterReturn=stableParking&&map.hasLayer(stableParking);
  const counts={roadProject:0,roadProjectMs:0,roadClip:0,roadClipMs:0,otherProject:0};
  for(const [method,count,time] of [['_project','roadProject','roadProjectMs'],['_clipPoints','roadClip','roadClipMs']]){
   const original=L.Polyline.prototype[method];
   L.Polyline.prototype[method]=function(...args){const road=/mapped-road/.test(this.options.className||'');const started=performance.now();const result=original.apply(this,args);if(road){counts[count]++;counts[time]+=performance.now()-started;}else if(method==='_project')counts.otherProject++;return result;};
  }
  const outline=document.querySelector('.mapped-road-outline');
  const model=[];map.eachLayer(layer=>{if(layer.options?.className==='mapped-road-fill'){const lines=layer.getLatLngs();model.push({segments:lines.length,vertices:lines.reduce((n,line)=>n+line.length,0)});}});
  const frames=[],actions=[];let previous=performance.now();
  for(let i=0;i<36;i++){
   await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;
   const started=performance.now();map.panBy([4,0],{animate:false});map.setBearing(i*3);actions.push(performance.now()-started);
  }
  const panning={...counts};
  const marker=document.querySelector('.gps-dot');let removed=0,added=0;
  const observer=new MutationObserver(records=>{for(const record of records){removed+=record.removedNodes.length;added+=record.addedNodes.length;}});
  observer.observe(map.getPane('markerPane'),{childList:true,subtree:true});
  const gpsTimes=[];
  for(let i=0;i<12;i++){
   const started=performance.now();window.__performanceFix({timestamp:Date.now()+i,coords:{latitude:51.3074+i*.000005,longitude:3.221,accuracy:3,heading:153,speed:4}});gpsTimes.push(performance.now()-started);await new Promise(requestAnimationFrame);
  }
  observer.disconnect();
  const sameGPSMarker=marker===document.querySelector('.gps-dot');
  document.getElementById('locate').click();
  await new Promise(resolve=>setTimeout(resolve,500));
  const beforeFollow={...counts},followingTimes=[];
  for(let i=0;i<12;i++){
   const started=performance.now();window.__performanceFix({timestamp:Date.now()+i,coords:{latitude:51.3075+i*.000005,longitude:3.221,accuracy:3,heading:153,speed:4}});followingTimes.push(performance.now()-started);await new Promise(requestAnimationFrame);
  }
  const followingCounts=Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,value-beforeFollow[key]]));
  map.setZoom(16,{animate:false});
  window.__performanceFix({timestamp:Date.now()+100,coords:{latitude:51.30756,longitude:3.221,accuracy:3,heading:153,speed:4}});
  const zoomAfterGPS=map.getZoom();
  const summarize=values=>({max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length,p95:[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)]});
  return {parkingDOM,sameParkingLayer,parkingDetachedOffscreen,parkingReusedAfterReturn,roadModel:model,roadPathCharacters:outline?.getAttribute('d')?.length,panning,totals:counts,panRotate:summarize(actions),frames:summarize(frames),gps:summarize(gpsTimes),followingGPS:summarize(followingTimes),followingCounts,markerMutations:{added,removed},sameGPSMarker,zoomAfterGPS};
 },catalogue);
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.parkingDOM.offscreen,0,'parking markers outside the viewport plus 64 px buffer are detached from the DOM');
 assert.ok(result.parkingDOM.attached<result.parkingDOM.catalogue/2,'the map attaches the local parking subset rather than the entire terminal catalogue');
 assert.equal(result.sameParkingLayer,true,'unchanged rotations preserve the cached in-view parking marker and its DOM element');
 assert.equal(result.parkingDetachedOffscreen,true,'panning away detaches a cached parking marker');
 assert.equal(result.parkingReusedAfterReturn,true,'returning to the same parking reattaches the same cached Leaflet marker');
 assert.equal(result.sameGPSMarker,true,'live GPS updates reuse the location marker instead of removing and rebuilding it');
 assert.equal(result.zoomAfterGPS,16,'manual zoom is preserved when the next GPS fix arrives');
 console.log('PASS movement rendering: stable GPS marker through repeated fixes and profiled pan/rotation');
}finally{await browser.close();}
