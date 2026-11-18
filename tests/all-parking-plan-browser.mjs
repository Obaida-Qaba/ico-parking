import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 window.__planStarts=0;window.__planStops=0;
 navigator.geolocation.watchPosition=ok=>{window.__planStarts++;ok({timestamp:Date.now(),coords:{latitude:51.3071,longitude:3.2215,accuracy:3,speed:0}});return 91;};
 navigator.geolocation.clearWatch=()=>window.__planStops++;
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.locator('.gps-dot').waitFor();
 assert.equal(await page.locator('#all-parkings').count(),1,'complete terminal plan is directly reachable on the map');
 await page.locator('#all-parkings').click();
 await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
 assert.equal(await page.locator('#all-parkings').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-map="south"]').getAttribute('aria-pressed'),'true','the current Bastenaken plan includes all printed source labels');
 assert.equal(await page.locator('.gps-dot').count(),0,'a schematic plan never pretends to be GPS aligned');
 await page.locator('#all-parkings').click();await page.locator('.gps-dot').waitFor();
 await page.locator('.mapped-road-fill').waitFor();
 assert.equal(await page.locator('.leaflet-image-layer').count(),0);
 assert.equal(await page.evaluate(()=>window.__planStarts),1);assert.equal(await page.evaluate(()=>window.__planStops),0);
 assert.deepEqual(errors,[]);
 console.log('PASS all-parking plan: one tap to the complete current terminal drawing and back to live GPS without restarting tracking');
}finally{await browser.close();}
