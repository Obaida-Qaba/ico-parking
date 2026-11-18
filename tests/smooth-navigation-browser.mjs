import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {observeMap} from './observe-map.mjs';
mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const initial={lat:51.3019,lon:3.2270544},next={lat:51.30195,lon:3.2270544};
try{
 for(const reduced of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
  await observeMap(context,'__smoothMap');
  await context.addInitScript(initial=>{
   navigator.geolocation.watchPosition=ok=>{window.__smoothFix=ok;ok({timestamp:Date.now(),coords:{latitude:initial.lat,longitude:initial.lon,accuracy:3,heading:0,speed:6}});return 44;};
   navigator.geolocation.clearWatch=()=>{};
  },initial);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?map=south&parking=HC1');await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  await page.waitForTimeout(500);
  const immediate=await page.evaluate(next=>{
   const m=window.__smoothMap;window.__positionSamples=[];window.__panSamples=[];
   m.eachLayer(marker=>{if(marker.getElement?.()?.classList.contains('gps-dot'))window.__smoothMarker=marker;});
   window.__smoothFix({timestamp:Date.now(),coords:{latitude:next.lat,longitude:next.lon,accuracy:3,heading:0,speed:6}});
   const sample=()=>{window.__positionSamples.push(window.__smoothMarker.getLatLng().lat);window.__panSamples.push(L.DomUtil.getPosition(m.getPane('mapPane')).y);if(window.__positionSamples.length<45)requestAnimationFrame(sample);};requestAnimationFrame(sample);
   return window.__smoothMarker.getLatLng().lat;
  },next);
  if(reduced)assert.ok(Math.abs(immediate-next.lat)<1e-10,'reduced-motion preference keeps an immediate measured update');
  else{
   assert.ok(Math.abs(immediate-initial.lat)<1e-6,'new 1Hz GPS fix does not teleport the location marker');
   await page.waitForTimeout(250);
   const middle=await page.evaluate(()=>window.__smoothMarker.getLatLng().lat);
   assert.ok(middle>initial.lat&&middle<next.lat,'visible intermediate position during a real driving update');
  }
  await page.waitForFunction(target=>Math.abs(window.__smoothMarker.getLatLng().lat-target)<1e-9,next.lat);
  if(!reduced){
   const samples=await page.evaluate(()=>window.__positionSamples);
   assert.ok(new Set(samples.map(n=>n.toFixed(9))).size>=8,'position advances over multiple animation frames');
   assert.ok(samples.every(n=>n>=initial.lat-1e-10&&n<=next.lat+1e-10),'visual position never extrapolates beyond the measured fix');
   const pans=await page.evaluate(()=>window.__panSamples);
   assert.ok(new Set(pans.map(y=>y.toFixed(3))).size>=12,'the rendered road surface moves through fractional pixels, rather than only a few whole-pixel jumps');
  }
  await page.evaluate(()=>{const m=window.__smoothMap;m.fire('dragstart');m.panBy([45,0],{animate:false});window.__browsingCenter=m.getCenter();window.__smoothFix({timestamp:Date.now(),coords:{latitude:51.302,longitude:3.2270544,accuracy:3,heading:0,speed:6}});});
  await page.waitForTimeout(1050);
  assert.ok(await page.evaluate(()=>window.__smoothMap.getCenter().equals(window.__browsingCenter,1e-8)),'manual pan remains in control during smooth location updates');
  if(!reduced){
   await page.evaluate(()=>window.__smoothFix({timestamp:Date.now(),coords:{latitude:51.302,longitude:3.2270544,accuracy:3,heading:90,speed:6}}));
   await page.locator('#locate').click();
   await page.waitForFunction(()=>Math.abs(((window.__smoothMap.getBearing()-270+540)%360)-180)<1);
   await page.evaluate(()=>{const m=window.__smoothMap;m.fire('dragstart');m._rawPanBy(L.point(1000,0));m.fire('move').fire('moveend');});
   await page.locator('#locate').click();
   const anchor=await page.evaluate(()=>{const m=window.__smoothMap,p=m.latLngToContainerPoint(window.__smoothMarker.getLatLng()),s=m.getSize();return {x:p.x,y:p.y,targetX:s.x/2,targetY:s.y*.62};});
   assert.ok(Math.hypot(anchor.x-anchor.targetX,anchor.y-anchor.targetY)<2,'recenter after a large rotated drag uses geographic coordinates: '+JSON.stringify(anchor));
  }
  assert.equal(await page.locator('#navigation-destination').innerText(),'HC1');
  await page.screenshot({path:`test-results/smooth-navigation-${reduced?'reduced':'normal'}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS measured GPS motion across intermediate frames, reduced motion, bounded position, and manual browsing during navigation');
}finally{await browser.close();}
