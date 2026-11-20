import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const north=JSON.parse(readFileSync('public/terminals.json')).regions.find(r=>r.id==='north');
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 window.__planStarts=0;window.__planStops=0;
 navigator.geolocation.watchPosition=ok=>{window.__planStarts++;ok({timestamp:Date.now(),coords:{latitude:51.3071,longitude:3.2215,accuracy:3,speed:0}});return 91;};
 navigator.geolocation.clearWatch=()=>window.__planStops++;
 document.addEventListener('load',event=>{
  if(event.target.src?.endsWith('/vendor/leaflet.js')){const create=L.map;L.map=(...args)=>{window.__overviewMap=create(...args);return window.__overviewMap;};}
 },true);
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.locator('.gps-dot').waitFor();
 assert.equal(await page.locator('#all-parkings').count(),1,'all parking areas remain directly reachable on the live map');
 await page.locator('#all-parkings').click();
 await page.locator('.gps-dot').waitFor();
 assert.equal(await page.locator('#street-view').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.leaflet-image-layer').count(),0,'the all-parking action never opens an ICO drawing');
 assert.equal(await page.locator('[data-map="south"]').getAttribute('aria-pressed'),'true');
 await page.locator('#all-parkings').click();
 await page.locator('.mapped-road-fill').waitFor();
 assert.equal(await page.locator('.leaflet-image-layer').count(),0);
 await page.locator('#terminal-filter').selectOption('north',{force:true});
 assert.equal(await page.locator('[data-map="north"]').getAttribute('aria-pressed'),'true');
 await page.locator('#all-parkings').click();
 assert.equal(await page.evaluate(points=>points.every(p=>window.__overviewMap.getBounds().contains(p)),north.polygon),true,'manual North overview must not be replaced by the nearby Bastenaken GPS context');
 assert.equal(await page.evaluate(()=>window.__planStarts),1);assert.equal(await page.evaluate(()=>window.__planStops),0);
 assert.deepEqual(errors,[]);
 console.log('PASS all-parking overview: live geographic map, roads and GPS stay visible without opening an ICO drawing or restarting tracking');
}finally{await browser.close();}
