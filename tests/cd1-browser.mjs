import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 window.__cdGPSStarts=0;window.__cdGPSStops=0;
 navigator.geolocation.watchPosition=ok=>{window.__cdGPSStarts++;ok({timestamp:Date.now(),coords:{latitude:51.3091943,longitude:3.2199584,accuracy:3,speed:0}});return 64;};
 navigator.geolocation.clearWatch=()=>window.__cdGPSStops++;
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.locator('.map-card').last().waitFor({state:'attached'});
 await page.locator('#destination').fill('CD1 line 15');await page.locator('.find-button').click();
 assert.equal(await page.locator('.destination-code').innerText(),'CD1');
 assert.match(await page.locator('#route-button').innerText(),/Start route/,'CD1 has a built-in road approach, not a locate-yourself action');
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'no CD1 recording prompt');
 const distance=parseFloat(await page.locator('#navigation-distance').innerText());
 assert.ok(distance>40&&distance<60,'CD1 uses the actual short shared access road beside the VPC');
 assert.match(await page.locator('#navigation-destination').innerText(),/CD1.*15/);
 assert.match(await page.locator('#navigation-detail').innerText(),/CD1 parking approach.*Line 15 remains a reference/);
 assert.ok(await page.locator('.mapped-road-fill').count()>0,'surrounding roads remain visible');
 await page.screenshot({path:'test-results/cd1-direct-route-no-recording.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await context.setOffline(true);await page.reload();await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 assert.equal(await page.evaluate(()=>window.__cdGPSStarts),1);
 assert.equal(await page.evaluate(()=>window.__cdGPSStops),0);
 assert.deepEqual(errors,[]);
 console.log('PASS CD1 direct navigation: fresh device, source-matched VPC access, no recording prompt, line reference, visible roads and offline route');
}finally{await browser.close();}
