import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8')).destinations;
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:51.3024748,longitude:3.2405348,accuracy:3,speed:0,heading:null}});return 23;};
 navigator.geolocation.clearWatch=()=>{};
 document.addEventListener('load',event=>{
  if(event.target.src?.endsWith('/vendor/leaflet.js')){
   const create=L.map;L.map=(...args)=>{window.__map=create(...args);return window.__map;};
  }
 },true);
});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
mkdirSync('test-results',{recursive:true});
try{
 const fixtures=[...['A01','A02','A03','A04','B05','C13','D09','E13','F00','G14'].map(code=>['toyota',code]),
  ...['DRTOY','DRWWL','DRFLX','CH1','CH24','BDR','BWH'].map(code=>['south',code])];
 for(const [map,code] of fixtures){
  const pin=catalogue[map+':'+code];
  await page.goto(`${base}/?map=${map}&parking=${code}&line=15`);
  await page.locator('.destination-code').waitFor();
  assert.match(await page.locator('#route-button').innerText(),/Route to area/);
  const approach=pin.precision==='area-approach-only',scope=approach?'Area approach':'Area entrance';
  assert.ok((await page.locator('.destination-meta').innerText()).includes(scope));
  await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  assert.ok((await page.locator('#navigation-destination').innerText()).includes(scope.toLowerCase()));
  if(approach)assert.match(await page.locator('#navigation-detail').innerText(),/exact gate and individual parking position are not mapped/);
  await page.evaluate(pin=>{window.__map.fire('dragstart');window.__map.setView([pin.lat,pin.lon],18,{animate:false});window.__map.setBearing(0);},pin);
  await page.waitForFunction(pin=>{
   const marker=Array.from(Object.values(window.__map._layers)).find(layer=>layer.getElement?.()?.classList.contains('gps-target'));
   return marker&&marker.getLatLng().equals([pin.lat,pin.lon]);
  },pin);
  const labels=await page.locator('.nearby-parking').evaluateAll(nodes=>nodes.map(node=>node.dataset.parking));
  assert.ok(!labels.some(code=>['H01','H02','I01','DRALD'].includes(code)),'unsupported historical positions cannot leak into the GPS labels');
  if(['A01','DRTOY','CH1','B05'].includes(code))await page.screenshot({path:`test-results/reviewed-${code}-area-route.png`,fullPage:true});
 }
 await page.goto(`${base}/?map=south&parking=DRALD`);await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/Show on map/);
 assert.match(await page.locator('.destination-meta').innerText(),/Location unverified/);
 await page.locator('#route-button').click();
 await page.waitForFunction(()=>document.getElementById('street-view').getAttribute('aria-pressed')==='true');
 assert.equal(await page.locator('.leaflet-image-layer').count(),0,'an unverified ALD location keeps the live map visible');
 assert.equal(await page.locator('.gps-target').count(),0,'ALD is not silently positioned at the FLUX approach');
 assert.equal(await page.locator('.road-route').count(),0);
 assert.equal(await page.locator('.destination-marker').count(),0,'no schematic ALD label is used as a live-map destination');
 assert.deepEqual(errors,[]);
 console.log('PASS reviewed A/B-C/lowerD-E/F-G/CH/H-boundary/FLUX area routes: actual road arrivals, explicit scope, unsupported GPS labels absent, unmapped ALD stays on the live map');
}finally{await browser.close();}
