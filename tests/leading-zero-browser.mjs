import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {buildGraph,routeRoads} from '../public/navigation.mjs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const area=catalogue.destinations['toyota:B05'];
assert.equal(area?.precision,'area-approach-only','B05 has a reviewed whole B/C field road approach, not an inferred numbered bay');
assert.equal(area.individualParkingVerified,false);
const expected=routeRoads(buildGraph(JSON.parse(readFileSync('public/roads.json','utf8'))),[51.303807294158645,3.237569105534317],[area.lat,area.lon]);
assert.ok(expected.available,'the published shared field approach is connected to the test origin');
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
  window.__searchWatchStarts=0;window.__searchWatchStops=0;
  navigator.geolocation.watchPosition=ok=>{
    window.__searchWatchStarts++;
    window.__parkingSearchFix=ok;
    ok({timestamp:Date.now(),coords:{latitude:51.303807294158645,longitude:3.237569105534317,accuracy:4,heading:null,speed:0}});
    return 1;
  };
  navigator.geolocation.clearWatch=()=>window.__searchWatchStops++;
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
  assert.match(await page.locator('#route-button').innerText(),/Route to area/);
  assert.match(await page.locator('.destination-meta').innerText(),/Area approach/);
  assert.equal(new URL(page.url()).searchParams.get('parking'),'B05','links retain the catalogue code');
  assert.equal(new URL(page.url()).searchParams.get('line'),'12','links retain the requested line');
  assert.equal(await page.locator('.nearby-parking[data-parking="B05"]').count(),0,'the selected B05 approach is not duplicated as a nearby bay marker');
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  assert.equal(await page.locator('#street-view').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.leaflet-image-layer').count(),0,'the shared area route stays on the geographic map');
  assert.match(await page.locator('#navigation-destination').innerText(),/B05.*line 12.*area approach/i);
  assert.match(await page.locator('#navigation-detail').innerText(),/individual parking position.*not mapped/i);
  const distanceText=await page.locator('#navigation-distance').innerText(),metres=parseFloat(distanceText)*(distanceText.includes('km')?1000:1);
  assert.ok(Math.abs(metres-expected.distance)<(distanceText.includes('km')?55:2),'displayed distance follows the actual shared field approach road');
  assert.equal(await page.locator('.destination-marker').count(),0,'the route does not use a schematic destination marker');
  assert.equal(await page.evaluate(()=>window.__searchWatchStarts),1);
  assert.equal(await page.evaluate(()=>window.__searchWatchStops),0,'the live map retains its original GPS watch');
  assert.equal(await page.locator('.gps-target').count(),1,'the label identifies the explicitly scoped shared road approach');
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,'shared area routing does not invent a saved on-site measurement');
  await page.screenshot({path:'test-results/b5-to-b05-area-route.png',fullPage:true});
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
  assert.match(await page.locator('#route-button').innerText(),/Route to area/);
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  assert.equal(await page.locator('#street-view').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.leaflet-image-layer').count(),0,'offline area routing keeps the geographic map');
  assert.match(await page.locator('#navigation-destination').innerText(),/B05.*line 12.*area approach/i);
  assert.match(await page.locator('#navigation-detail').innerText(),/individual parking position.*not mapped/i);
  assert.equal(await page.locator('.destination-marker').count(),0);
  assert.equal(await page.locator('.gps-target').count(),1);
  assert.equal(await page.evaluate(()=>window.__searchWatchStarts),1);
  assert.equal(await page.evaluate(()=>window.__searchWatchStops),0);
  assert.equal(await page.locator('.road-route').count(),1);
  assert.equal(await page.locator('dialog[open]').count(),0);
  // An independent on-site measurement remains an explicit device-only refinement.
  await page.evaluate(()=>localStorage.setItem('portway-gps-pins',JSON.stringify({'toyota:B05:parking':{lat:51.3019547,lon:3.2428032,method:'gps',accuracy:3}})));
  await page.reload();await page.locator('.destination-code').waitFor();
  assert.equal(await page.locator('.destination-code').innerText(),'B05');
  assert.match(await page.locator('.destination-line').innerText(),/12/);
  assert.match(await page.locator('#route-button').innerText(),/Start route/,'a saved measurement refines B05 and retains its ordinary routing action');
  assert.doesNotMatch(await page.locator('.destination-meta').innerText(),/Area approach/,'a saved on-site refinement has its own precision');
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  assert.match(await page.locator('#navigation-destination').innerText(),/B05.*line 12/);
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS B5 keeps canonical B05/line 12, routes to the reviewed B/C area road approach online/offline with individual-bay limits, and preserves saved GPS refinements');
}finally{await browser.close();}
