import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/vendor/leaflet.css');
 await page.setContent('<html><head><link rel="stylesheet" href="'+base+'/vendor/leaflet.css"><style>html,body,#fixture{margin:0;width:100%;height:100%}</style></head><body><div id="fixture"></div></body></html>');
 await page.addScriptTag({url:base+'/vendor/leaflet.js'});
 await page.addScriptTag({url:base+'/vendor/leaflet-rotate.js'});
 const results=await page.evaluate(async base=>{
  const {optimizeDrivingMap}=await import(base+'/map-performance.mjs'),results=[];
  for(const bearing of [0,73]){
   const map=L.map('fixture',{rotate:true,rotateControl:false,zoomControl:false,zoomSnap:.25});
   optimizeDrivingMap(map);map.setView([51.3019,3.227],17);map.setBearing(bearing);
   const point=[51.3219,3.227];
   const line=L.polyline([point,[point[0]+.0002,point[1]]],{weight:6}).addTo(map);
   const marker=L.marker(point,{icon:L.divIcon({html:'GPS',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);
   const alignment=()=>{
    const path=line.getElement(),local=path.getPointAtLength(0);
    const screen=new DOMPoint(local.x,local.y).matrixTransform(path.getScreenCTM()),box=marker.getElement().getBoundingClientRect();
    return Math.hypot(screen.x-box.left-10,screen.y-box.top-10);
   };
   // Same-zoom setView resets the map's geographic pixel origin while leaving
   // viewport layer coordinates inside the numerically unchanged SVG bounds.
   map.setView(point,17,{animate:false});await new Promise(requestAnimationFrame);
   const before=alignment();
   map.setZoom(18,{animate:true});
   await new Promise(resolve=>setTimeout(resolve,100));
   const during={error:alignment(),animating:map._animatingZoom};
   await new Promise(resolve=>setTimeout(resolve,350));
   const after=alignment();
   results.push({bearing,before,during,after});map.remove();
  }
  return results;
 },base);
 console.log(JSON.stringify(results,null,2));
 for(const result of results){
  assert.ok(result.before<1,'route starts on its geographic marker after a same-zoom view reset');
  assert.equal(result.during.animating,true,'alignment is observed during the animated zoom');
  assert.ok(result.during.error<2,`${result.bearing}°: route stays aligned during zoom after the geographic origin changes (${result.during.error.toFixed(1)} px drift)`);
  assert.ok(result.after<1,'route stays on its geographic marker after zoom');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS renderer origin: same-zoom recenter keeps road geometry aligned during animated zoom in north-up and heading-up views');
}finally{await browser.close();}
