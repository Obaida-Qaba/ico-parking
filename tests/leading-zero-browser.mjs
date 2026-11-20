import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
  navigator.geolocation.watchPosition=ok=>{
    window.__parkingSearchFix=ok;
    ok({timestamp:Date.now(),coords:{latitude:51.303807294158645,longitude:3.237569105534317,accuracy:4,heading:null,speed:0}});
    return 1;
  };
  navigator.geolocation.clearWatch=()=>{};
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(base);
  await page.locator('.map-card').last().waitFor({state:'attached'});
  await page.locator('#destination').fill('B5 line 12');
  await page.locator('.find-button').click();
  await page.locator('.destination-code').waitFor({timeout:5000});
  assert.equal(await page.locator('.destination-code').innerText(),'B05');
  assert.match(await page.locator('.destination-line').innerText(),/12/);
  assert.match(await page.locator('#route-button').innerText(),/View ICO plan/);
  assert.match(await page.locator('.destination-meta').innerText(),/Plan only.*GPS position unverified/);
  assert.equal(new URL(page.url()).searchParams.get('parking'),'B05','links retain the catalogue code');
  assert.equal(new URL(page.url()).searchParams.get('line'),'12','links retain the requested line');
  assert.equal(await page.locator('.nearby-parking[data-parking="B05"]').count(),0,'unverified B05 is not placed on the GPS map');
  await page.locator('#route-button').click();
  await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
  assert.ok(await page.locator('.destination-marker').count()>0,'B05 remains highlighted on its indexed Toyota plan');
  assert.equal(await page.locator('.road-route').count(),0,'an unverified historical fit is never used as a GPS route');
  assert.equal(await page.locator('.gps-target').count(),0);
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,'plan fallback never records a GPS point');
  await page.screenshot({path:'test-results/b5-to-b05-plan-only.png',fullPage:true});
  for(const [position,area,code] of [
    [[51.326,3.213],'Noordelijke','A01'],
    [[51.29689,3.24508],'Hanze','H01']
  ]){
    await page.goto(base);await page.locator('.map-card').last().waitFor({state:'attached'});
    await page.evaluate(p=>window.__parkingSearchFix({timestamp:Date.now(),coords:{latitude:p[0],longitude:p[1],accuracy:4,heading:null,speed:0}}),position);
    await page.waitForFunction(name=>document.getElementById('location-context').textContent.includes(name),area);
    await page.locator('#destination').fill(code);
    await page.locator('.find-button').click();
    await page.locator('.destination-code').waitFor();
    assert.equal(await page.locator('.destination-code').innerText(),code,'a literal code keeps its leading zero');
    assert.match(await page.locator('.destination-meta').innerText(),/Toyota/,'a nearby numeric alias must not override the literal destination');
  }
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
  await context.setOffline(true);
  await page.goto(base);
  await page.locator('.map-card').last().waitFor({state:'attached'});
  await page.locator('#destination').fill('Toyota B5 line 12');
  await page.locator('.find-button').click();
  await page.locator('.destination-code').waitFor();
  assert.equal(await page.locator('.destination-code').innerText(),'B05');
  assert.match(await page.locator('#route-button').innerText(),/View ICO plan/);
  await page.locator('#route-button').click();
  await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
  assert.ok(await page.locator('.destination-marker').count()>0);
  assert.equal(await page.locator('.road-route').count(),0);
  assert.equal(await page.locator('dialog[open]').count(),0);
  // An independent on-site measurement remains an explicit device-only refinement.
  await page.evaluate(()=>localStorage.setItem('portway-gps-pins',JSON.stringify({'toyota:B05:parking':{lat:51.3019547,lon:3.2428032,method:'gps',accuracy:3}})));
  await page.reload();await page.locator('.destination-code').waitFor();
  assert.equal(await page.locator('.destination-code').innerText(),'B05');
  assert.match(await page.locator('.destination-line').innerText(),/12/);
  assert.match(await page.locator('#route-button').innerText(),/Start route/,'a saved measurement can independently enable B05 routing');
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  assert.match(await page.locator('#navigation-destination').innerText(),/B05.*line 12/);
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS B5 keeps canonical B05/line 12 and honest source-plan fallback online/offline; only a saved measurement enables its GPS route');
}finally{await browser.close();}
