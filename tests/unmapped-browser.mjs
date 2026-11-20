import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 window.__unmappedStarts=0;window.__unmappedStops=0;
 navigator.geolocation.watchPosition=ok=>{window.__unmappedStarts++;window.__unmappedFix=ok;ok({timestamp:Date.now(),coords:{latitude:51.3019,longitude:3.2270544,accuracy:3,speed:0}});return 71;};
 navigator.geolocation.clearWatch=()=>window.__unmappedStops++;
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
// Exercise corrupt/incomplete catalogue recovery explicitly even when the
// published catalogue covers A01. Do not require a real parking to stay broken.
await page.route('**/destinations.json',async route=>{
 const response=await route.fetch(),catalogue=await response.json();
 delete catalogue.destinations['toyota:A01'];
 await route.fulfill({response,json:catalogue});
});
try{
 await page.goto(base+'/?map=toyota&parking=A01&line=15');
 await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/Show on map/,'an unmapped GPS approach stays on the geographic map');
 assert.match(await page.locator('.line-note').innerText(),/position.*(?:unverified|not.*confirmed)|(?:unverified|not.*confirmed).*position/i,'the selected destination explicitly identifies its unverified position');
 assert.equal(await page.locator('.destination-routing-scope').isVisible(),true);
 assert.match(await page.locator('.destination-routing-scope').innerText(),/Location unverified/);
 await page.locator('#route-button').click();
 await page.waitForFunction(()=>document.getElementById('street-view').getAttribute('aria-pressed')==='true');
 assert.equal(await page.locator('dialog[open]').count(),0,'primary action never asks the user to record parking GPS');
 assert.equal(await page.locator('#capture-parking').count(),0);
 assert.equal(await page.locator('.destination-code').innerText(),'A01');
 assert.match(await page.locator('.destination-line').innerText(),/Line 15/);
 assert.equal(await page.locator('#plan-view').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('.leaflet-image-layer').count(),0,'no ICO drawing replaces the geographic map');
 assert.equal(await page.locator('[data-map="toyota"]').getAttribute('aria-pressed'),'true','the selected terminal context remains Toyota');
 assert.equal(await page.locator('.destination-marker').count(),0,'no schematic marker is displayed as a live-map location');
 assert.equal(await page.locator('.gps-target').count(),0,'an unknown location has no precise destination marker');
 assert.equal(await page.locator('.gps-dot').count(),1,'the live GPS position remains visible');
 assert.equal(await page.locator('.road-route').count(),0,'no road route is fabricated for an unmapped point');
 assert.equal(await page.evaluate(()=>window.__unmappedStarts),1);
 assert.equal(await page.evaluate(()=>window.__unmappedStops),0,'viewing the terminal area keeps GPS tracking active');
 await page.screenshot({path:'test-results/unmapped-parking-live-map-no-prompt.png',fullPage:true});
 await page.locator('#clear-destination').click();
 await page.locator('#destination').fill('HC1 line 15');await page.locator('.find-button').click();
 assert.match(await page.locator('#route-button').innerText(),/Start route/);
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'known HC1 approach still starts navigation directly');
 assert.match(await page.locator('#navigation-destination').innerText(),/HC1.*15/);
 assert.equal(await page.evaluate(()=>window.__unmappedStarts),1,'switching to a known parking does not restart GPS');
 assert.equal(await page.evaluate(()=>window.__unmappedStops),0);
 assert.deepEqual(errors,[]);
 console.log('PASS unmapped parking stays on the live geographic map without a false destination or ICO plan; known routes, GPS tracking and line remain intact');
}finally{await browser.close();}
