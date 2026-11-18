import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';
import {resolveDestination} from '../public/destinations.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const atlas=JSON.parse(readFileSync('public/data.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const fixtures=[];
for(const [mapId,code] of [['north','BB'],['south','BB1'],['toyota','A01'],['hanze','H61'],['bastenaken','GA1']]){
 const map=atlas.maps.find(m=>m.id===mapId),parking=map.parkings.find(p=>p.code===code);
 const point=resolveDestination({map,parking},{},catalogue);
 assert.ok(point,mapId+':'+code+' must offer a road route');
 const end=[point.lat,point.lon];let start,expected;
 for(const candidate of graph.nodes.values()){
  const distance=distanceMetres(candidate,end);if(distance<150||distance>350)continue;
  const route=routeRoads(graph,candidate,end);
  if(route.available&&route.distance>100&&route.distance<1400){start=candidate;expected=route.distance;break;}
 }
 assert.ok(start,'connected start road for '+mapId+':'+code);
 fixtures.push({mapId,code,start,expected});
}
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(fixtures=>{
 const params=new URLSearchParams(location.search),fixture=fixtures.find(f=>f.mapId===params.get('map')&&f.code===params.get('parking'))||fixtures[0];
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:fixture.start[0],longitude:fixture.start[1],accuracy:3,speed:0,heading:null}});return 88;};
 navigator.geolocation.clearWatch=()=>{};
},fixtures);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 for(const fixture of fixtures){
  await page.goto(`${base}/?map=${fixture.mapId}&parking=${fixture.code}&line=15`);
  await page.locator('.destination-code').waitFor();
  assert.match(await page.locator('#route-button').innerText(),/Start route/,fixture.mapId+':'+fixture.code+' starts navigation directly');
  await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),0,'no request to record the parking position');
  assert.match(await page.locator('#navigation-detail').innerText(),new RegExp(fixture.code+' parking (?:area )?approach.*Line 15 remains a reference'));
  const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
  assert.ok(Math.abs(metres-fixture.expected)<(text.includes('km')?55:2),'distance matches connected roads for '+fixture.code);
  assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
  if(fixture.code==='BB')await page.screenshot({path:'test-results/bb-north-direct-route.png',fullPage:true});
 }
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await context.setOffline(true);
 await page.goto(base+'/?map=north&parking=BB&line=15');
 await page.locator('.destination-code').waitFor();await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS built-in road navigation across five supported plans, North BB on a fresh device, line reference preserved, and BB offline');
}finally{await browser.close();}
