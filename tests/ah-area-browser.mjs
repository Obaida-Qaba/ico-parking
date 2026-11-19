import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads} from '../public/navigation.mjs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8')).destinations;
const start=[catalogue['south:CD1'].lat,catalogue['south:CD1'].lon];
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(start=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:start[0],longitude:start[1],accuracy:3,speed:0,heading:null}});return 71;};
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
mkdirSync('test-results',{recursive:true});
try{
 for(const code of ['AH1','AH2','AH3','AH4','AH5','AH6','BH1','BH2','BH3','BH4']){
  await page.goto(base);await page.locator('.map-card').last().waitFor({state:'attached'});
  await page.locator('#destination').fill(code+' line 15');await page.locator('.find-button').click();
  await page.locator('.destination-code').waitFor();
  assert.equal(await page.locator('.destination-code').innerText(),code);
  assert.equal(new URL(page.url()).searchParams.get('map'),'south','normal search uses the supported current source');
  assert.match(await page.locator('#route-button').innerText(),/Route to area/,'the selected H reference must offer a real route');
  assert.equal(await page.locator('.destination-routing-scope').isVisible(),true);
  assert.match(await page.locator('.destination-routing-scope').innerText(),/Area entrance/);
  await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  assert.ok(await page.locator('.mapped-road-fill').count()>0);
  assert.match(await page.locator('#navigation-destination').innerText(),new RegExp(code+'.*line 15.*area entrance','i'));
  assert.match(await page.locator('#navigation-detail').innerText(),/AH\/BH parking area.*individual parking position is not mapped/i);
  const pin=catalogue['south:'+code];assert.ok(pin);
  const expected=routeRoads(graph,start,[pin.lat,pin.lon]);assert.ok(expected.available);
  const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
  assert.ok(Math.abs(metres-expected.distance)<(text.includes('km')?55:2));
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,'no user GPS recording is needed');
  if(['AH1','AH4'].includes(code))await page.screenshot({path:'test-results/'+code.toLowerCase()+'-area-route.png',fullPage:true});
 }
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await context.setOffline(true);
 for(const [map,code] of [['south','AH4'],['bastenaken','AH1'],['bastenaken','AH2'],['bastenaken','BH1'],['bastenaken','BH2']]){
  await page.goto(base+'/?map='+map+'&parking='+code);await page.locator('.destination-code').waitFor();
  assert.match(await page.locator('#route-button').innerText(),/Route to area/);
  await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  assert.match(await page.locator('#navigation-destination').innerText(),/area entrance/i);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS AH1–AH6 and BH1–BH4: normal search, supported source, blue connected road route, area-only scope, no GPS recording, current/historical offline links');
}finally{await browser.close();}
