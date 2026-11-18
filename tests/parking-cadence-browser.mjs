import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {observeMap} from './observe-map.mjs';
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__cadenceMap');
await context.addInitScript(()=>{navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:51.3074,longitude:3.221,accuracy:3,speed:0}});return 41;};navigator.geolocation.clearWatch=()=>{};});
const page=await context.newPage();
try{
 await page.goto(base);await page.locator('.mapped-road-fill').waitFor();
 await page.evaluate(()=>{const m=window.__cadenceMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(0);m.setView([51.3074,3.221],16,{animate:false});});
 await page.waitForTimeout(200);
 const result=await page.evaluate(async()=>{
  const m=window.__cadenceMap,toolbar=document.querySelector('.map-top'),read=toolbar.getBoundingClientRect;let layouts=0;
  toolbar.getBoundingClientRect=function(...args){layouts++;return read.apply(this,args);};
  const started=performance.now();
  for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);m.panBy([1,0],{animate:false,noMoveStart:true});}
  const duration=performance.now()-started;await new Promise(resolve=>setTimeout(resolve,120));toolbar.getBoundingClientRect=read;
  return {layouts,duration,labels:document.querySelectorAll('.nearby-parking').length};
 });
 assert.ok(result.layouts<=Math.ceil(result.duration/80)+4,'continuous camera moveend events must respect the 80 ms parking collision-layout budget: '+JSON.stringify(result));
 assert.ok(result.labels>0,'parking labels stay available while panning');
 console.log('PASS continuous camera movement respects parking-layout cadence: '+JSON.stringify(result));
}finally{await browser.close();}
