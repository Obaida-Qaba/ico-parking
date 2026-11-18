import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {observeMap} from './observe-map.mjs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__roadMap');
await context.addInitScript(()=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:51.3071,longitude:3.2215,accuracy:3,heading:0,speed:0}});return 86;};
 navigator.geolocation.clearWatch=()=>{};
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.locator('.mapped-road-fill').waitFor();
 const model=await page.evaluate(()=>{
  const map=window.__roadMap;let fill;
  map.eachLayer(layer=>{if(layer.options?.className==='mapped-road-fill')fill=layer;});
  window.__testedRoadFill=fill;
  const lines=fill.getLatLngs();
  return {vertices:lines.reduce((sum,line)=>sum+line.length,0),lines:lines.length};
 });
 assert.ok(model.vertices<8000,'driving view projects local roads rather than all 19,578 network vertices');
 await page.evaluate(()=>{
  const m=window.__roadMap;m.fire('dragstart');m.stopHeadingUp();
  window.__roadGeometry=window.__testedRoadFill.getLatLngs();
  m.panBy([3,3],{animate:false});m.setBearing(90);m.setBearing(270);
 });
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.__roadGeometry===window.__testedRoadFill.getLatLngs()),true,'small movement and rotation reuse buffered road geometry');
 await page.evaluate(()=>window.__roadMap.setView([51.29689338,3.24508496],18,{animate:false}));
 await page.waitForFunction(()=>{
  const m=window.__roadMap,p=m.latLngToContainerPoint([51.29689338,3.24508496]),origin=m.getContainer().getBoundingClientRect(),path=document.querySelector('.mapped-road-fill');
  const local=new DOMPoint(p.x+origin.x,p.y+origin.y).matrixTransform(path.getScreenCTM().inverse());
  return path.isPointInStroke(local);
 });
 assert.ok(await page.evaluate(()=>window.__testedRoadFill.getLatLngs().reduce((n,line)=>n+line.length,0))<8000,'panning to Hanze loads its nearby roads without restoring the whole port model');
 assert.deepEqual(errors,[]);
 console.log('PASS road rendering: bounded local geometry, stable buffer during small movement/rotation, and roads refreshed after a large pan');
}finally{await browser.close();}
