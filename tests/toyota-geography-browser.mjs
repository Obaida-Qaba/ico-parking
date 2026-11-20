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
 for(const code of ['A01','A02','A03','A04','DRTOY','DRWWL','DRFLX']){
  const map=code.startsWith('A')?'toyota':'south',pin=catalogue[map+':'+code];
  await page.goto(`${base}/?map=${map}&parking=${code}&line=15`);
  await page.locator('.destination-code').waitFor();
  assert.match(await page.locator('#route-button').innerText(),/Route to area/);
  const approach=code.startsWith('DR'),scope=approach?'Area approach':'Area entrance';
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
  assert.ok(!labels.some(code=>['B01','B05','H01','H02','DRALD'].includes(code)),'unsupported historical positions cannot leak into the GPS labels');
  if(['A01','DRTOY'].includes(code))await page.screenshot({path:`test-results/reviewed-${code}-area-route.png`,fullPage:true});
 }
 await page.goto(`${base}/?map=south&parking=DRALD`);await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/View ICO plan/);
 assert.match(await page.locator('.destination-meta').innerText(),/position unverified/);
 await page.locator('#route-button').click();
 await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
 assert.equal(await page.locator('.road-route').count(),0);
 assert.equal(await page.locator('.destination-marker').count(),1,'the separate ALD source callout stays available');
 assert.deepEqual(errors,[]);
 console.log('PASS Toyota A field and FLUX shared approach: exact reviewed road arrivals, explicit scope, unsupported GPS labels absent, separate ALD source fallback');
}finally{await browser.close();}
