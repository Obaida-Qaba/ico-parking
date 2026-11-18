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
  const {optimizeDrivingMap,panDrivingMap}=await import(base+'/map-performance.mjs');
  const map=L.map('fixture',{rotate:true,rotateControl:false,zoomControl:false,zoomSnap:.25});optimizeDrivingMap(map);
  const point=[51.3019,3.2270544],pans=[],inertia=[];
  for(const bearing of [0,73,270])for(const offset of [[.125,-.75],[1000,0],[-1000,0]]){
   map.setView(point,17,{animate:false});map.setBearing(bearing);
   const before=map.latLngToContainerPoint(point),delta=L.point(offset);
   panDrivingMap(map,delta);
   pans.push({bearing,offset,error:map.latLngToContainerPoint(point).distanceTo(before.subtract(delta))});
  }
  for(const offset of [[.25,.25],[1000,0]]){
   map.setView(point,17,{animate:false});map.setBearing(73);
   map.panBy([80,0],{animate:true,duration:1});
   await new Promise(resolve=>setTimeout(resolve,35));
   panDrivingMap(map,offset);const held=map.getCenter();
   await new Promise(resolve=>setTimeout(resolve,80));
   inertia.push({offset,drift:map.distance(held,map.getCenter()),animating:map._panAnim?._inProgress});
  }
  map.remove();return {pans,inertia};
 },base);
 console.log(JSON.stringify(results,null,2));
 for(const pan of results.pans)assert.ok(pan.error<(Math.abs(pan.offset[0])<1?.01:2),`${pan.bearing}° pan ${pan.offset}: screen offset stays geographically correct (${pan.error.toFixed(2)} px error)`);
 for(const pan of results.inertia){
  assert.equal(pan.animating,false,'a GPS recenter stops existing pan inertia');
  assert.ok(pan.drift<.01,`existing inertia does not move a recentered map (${pan.drift.toFixed(2)} m drift)`);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS driving pan: fractional motion, large rotated offsets and recentering during existing pan inertia preserve map geography');
}finally{await browser.close();}
