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
try{
 await page.goto(base+'/?map=toyota&parking=A01&line=15');
 await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/View parking/,'an unmapped GPS approach offers the actual parking plan rather than a setup flow');
 await page.locator('#route-button').click();
 await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
 assert.equal(await page.locator('dialog[open]').count(),0,'primary action never asks the user to record parking GPS');
 assert.equal(await page.locator('#capture-parking').count(),0);
 assert.equal(await page.locator('.destination-code').innerText(),'A01');
 assert.match(await page.locator('.destination-line').innerText(),/Line 15/);
 assert.equal(await page.locator('#plan-view').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-map="toyota"]').getAttribute('aria-pressed'),'true','the correct Toyota source plan is selected');
 assert.ok(await page.locator('.destination-marker').count()>0,'parking label is highlighted on the source plan');
 assert.equal(await page.locator('.road-route').count(),0,'no road route is fabricated for an unmapped point');
 assert.equal(await page.evaluate(()=>window.__unmappedStarts),1);
 assert.equal(await page.evaluate(()=>window.__unmappedStops),0,'viewing a source plan keeps GPS tracking active');
 await page.screenshot({path:'test-results/unmapped-parking-plan-no-prompt.png',fullPage:true});
 await page.locator('#clear-destination').click();
 await page.locator('#destination').fill('HC1 line 15');await page.locator('.find-button').click();
 assert.match(await page.locator('#route-button').innerText(),/Start route/);
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'known HC1 approach still starts navigation directly');
 assert.match(await page.locator('#navigation-destination').innerText(),/HC1.*15/);
 assert.equal(await page.evaluate(()=>window.__unmappedStarts),1,'switching to a known parking does not restart GPS');
 assert.equal(await page.evaluate(()=>window.__unmappedStops),0);
 assert.deepEqual(errors,[]);
 console.log('PASS unmapped parking opens its highlighted source plan without a GPS-recording prompt; known parking still routes and tracking/line remain intact');
}finally{await browser.close();}
