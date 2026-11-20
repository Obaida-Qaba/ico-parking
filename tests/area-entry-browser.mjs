import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads} from '../public/navigation.mjs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const start=[catalogue.destinations['toyota:A01'].lat,catalogue.destinations['toyota:A01'].lon];
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(start=>{
 navigator.geolocation.watchPosition=ok=>{window.__areaFix=ok;ok({timestamp:Date.now(),coords:{latitude:start[0],longitude:start[1],accuracy:3,speed:0,heading:null}});return 17;};
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 for(const [map,code] of [['toyota','Y02'],['toyota','Y38'],['toyota','R01'],['south','GD1'],['south','ID4'],['south','JD3'],['south','KD2'],['south','LD1'],['bastenaken','LD4'],['bastenaken','VPC'],['bastenaken','VPC1'],['north','Q9'],['north','Q10'],['north','KB'],['toyota','Z01'],['toyota','Z03'],['toyota','Z04'],['toyota','Z05']]){
  await page.goto(base+'/?map='+map+'&parking='+code+'&line=15');
  await page.locator('.destination-code').waitFor();
  assert.match(await page.locator('#route-button').innerText(),/Route to area/,'a confirmed shared entrance offers an explicit area route');
  assert.match(await page.locator('.destination-meta').innerText(),/Area entrance/);
  const pin=catalogue.destinations[map+':'+code];assert.ok(pin);
  const expected=routeRoads(graph,start,[pin.lat,pin.lon]);assert.ok(expected.available);
  await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  assert.match(await page.locator('#navigation-destination').innerText(),/area entrance/i);
  assert.match(await page.locator('#navigation-detail').innerText(),/individual parking|individual bay/i);
  if(pin.areaAccessNote)assert.ok((await page.locator('#navigation-detail').innerText()).includes(pin.areaAccessNote),'the route explains any remaining gate/railway approach limitation');
  const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
  assert.ok(Math.abs(metres-expected.distance)<(text.includes('km')?55:2));
  await page.screenshot({path:'test-results/area-entry-'+map+'-'+code+'.png',fullPage:true});
  if(code==='Y02')await page.waitForFunction(pin=>{
   window.__areaFix({timestamp:Date.now(),coords:{latitude:pin.lat,longitude:pin.lon,accuracy:3,speed:0,heading:null}});
   return /area entrance/i.test(document.getElementById('navigation-instruction').textContent);
  },pin,{polling:350});
  assert.equal(await page.locator('dialog[open]').count(),0);
 }
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await context.setOffline(true);
 await page.goto(base+'/?map=toyota&parking=Y02');await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.match(await page.locator('#navigation-destination').innerText(),/area entrance/i);
 await page.evaluate(start=>localStorage.setItem('portway-gps-pins',JSON.stringify({'toyota:Y02:parking':{lat:start[0],lon:start[1],method:'gps',accuracy:3}})),start);
 await page.goto(base+'/?map=toyota&parking=Y02');await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/Start route/,'a saved precise refinement retains its ordinary route action');
 assert.doesNotMatch(await page.locator('.destination-meta').innerText(),/Area entrance/);
 assert.deepEqual(errors,[]);
 console.log('PASS shared area entrances: Toyota, current/historical D groups and North real connected routes, explicit scope, rail-approach detail, offline routing and saved GPS refinement');
}finally{await browser.close();}
