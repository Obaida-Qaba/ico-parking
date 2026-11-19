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
  assert.match(await page.locator('#route-button').innerText(),/Start route/);
  assert.equal(new URL(page.url()).searchParams.get('parking'),'B05','links retain the catalogue code');
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  const metres=parseFloat(await page.locator('#navigation-distance').innerText());
  assert.ok(metres>30&&metres<500,'a nonzero road route is displayed');
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.screenshot({path:'test-results/b5-to-b05-route.png',fullPage:true});
  await page.locator('#stop-navigation').click();
  for(const [position,area,code] of [
    [[51.326,3.213],'Noordelijke','A01'],
    [[51.29689,3.24508],'Hanze','H01']
  ]){
    await page.locator('#clear-destination').click();
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
  await page.locator('#destination').fill('Toyota B5');
  await page.locator('.find-button').click();
  await page.locator('.destination-code').waitFor();
  assert.equal(await page.locator('.destination-code').innerText(),'B05');
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS B5 search selects Toyota B05, retains line 12, shares canonical code and shows its road route online and offline');
}finally{await browser.close();}
