import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
const graph=buildGraph(JSON.parse(readFileSync(new URL('../public/roads.json',import.meta.url))));
const target=catalogue.destinations['nissan:VA'];
const vh001=catalogue.destinations['nissan:VH001'];
const inside=vh001?[vh001.lat,vh001.lon]:[51.3187,3.2059];
const bb=catalogue.destinations['north:BB'],outside=[bb.lat,bb.lon];
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch(),errors=[];

async function device(position,saved=null){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(({position,saved})=>{
  window.__nissanInternalStarts=0;window.__nissanInternalStops=0;
  navigator.geolocation.watchPosition=ok=>{
   window.__nissanInternalStarts++;
   window.__nissanInternalEmit=point=>ok({timestamp:Date.now(),coords:{latitude:point[0],longitude:point[1],accuracy:3,heading:null,speed:0}});
   window.__nissanInternalEmit(position);return 78;
  };
  navigator.geolocation.clearWatch=()=>window.__nissanInternalStops++;
  if(saved)localStorage.setItem('portway-gps-pins',JSON.stringify(saved));
 },{position,saved});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/?map=nissan&parking=VA&line=15');await page.locator('.destination-code').waitFor();
 return {context,page};
}

async function internalRoute(page,label){
 assert.equal(await page.locator('.destination-code').innerText(),'VA');
 assert.equal((await page.locator('#route-button').innerText()).trim(),'Route inside Nissan',label+': button states the verified internal scope');
 assert.ok(target&&vh001,'VA and VH001 have built-in geographic approaches');
 assert.equal(target.routingScope,'terminal-internal');assert.equal(target.publicConnectionVerified,false);
 assert.match(await page.locator('.destination-meta').innerText(),/Within Nissan only/,label+': compact destination metadata states the scope');
 if(label==='Fresh Nissan VA'){
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('destination-card')).opacity)>.99);
  await page.screenshot({path:'test-results/nissan-va-internal-scope-card.png',fullPage:true});
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,'fresh Nissan routing requires no recorded GPS point');
 const expected=routeRoads(graph,inside,[target.lat,target.lon]);
 assert.ok(expected.available&&expected.distance>20&&expected.distance<1800,'VA is reachable from VH001 inside the verified private road component');
 await page.evaluate(()=>{
  const original=L.polyline;L.polyline=function(points,options){if(options?.className==='road-route')window.__nissanInternalPoints=points.map(point=>Array.from(point));return original.apply(this,arguments);};
 });
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'no GPS recording dialog');
 assert.equal(await page.locator('#navigation-destination').innerText(),'VA · line 15');
 assert.match(await page.locator('#navigation-detail').innerText(),/Within Nissan only/,'successful route details retain the internal scope');
 assert.match(await page.locator('#navigation-detail').innerText(),/Line 15 remains a reference/);
 const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
 assert.ok(Math.abs(metres-expected.distance)<(text.includes('km')?55:2),'internal driving distance follows connected roads');
 const painted=await page.locator('.road-route').evaluate(path=>({points:window.__nissanInternalPoints,stroke:getComputedStyle(path).stroke,opacity:Number(getComputedStyle(path).strokeOpacity),length:path.getTotalLength()}));
 assert.equal(painted.stroke,'rgb(20, 120, 233)');assert.ok(painted.opacity>.9&&painted.length>20,'internal route is visibly painted blue');
 assert.deepEqual(painted.points,expected.points,'painted VA route matches the private road component');
 assert.equal(await page.evaluate(()=>window.__nissanInternalStarts),1,'navigation reuses the live GPS watch');
 assert.equal(await page.evaluate(()=>window.__nissanInternalStops),0);
}

try{
 const fresh=await device(inside),page=fresh.page;
 await internalRoute(page,'Fresh Nissan VA');
 await page.screenshot({path:'test-results/nissan-va-internal-route.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await page.locator('#stop-navigation').click();
 await page.evaluate(position=>window.__nissanInternalEmit(position),outside);
 assert.equal(routeRoads(graph,outside,[target.lat,target.lon]).available,false,'no public-to-private gate connection is fabricated in the graph');
 await page.locator('#route-button').click();
 await page.waitForFunction(()=>document.getElementById('navigation-instruction').textContent==='No route from here');
 assert.match(await page.locator('#navigation-detail').innerText(),/reviewed roads inside Nissan.*Entrance and some onward connections are unconfirmed/,'route failure explains the reviewed internal scope and unconfirmed connections');
 assert.equal(await page.locator('.road-route').count(),0,'the former blue route is absent when starting outside the private component');
 assert.equal(await page.locator('#navigation-distance').innerText(),'—');
 assert.equal(await page.locator('dialog[open]').count(),0,'an outside start does not request a recorded GPS point');
 await page.screenshot({path:'test-results/nissan-va-outside-no-fake-gate.png',fullPage:true});
 await fresh.context.setOffline(true);await page.reload();await page.locator('.destination-code').waitFor();
 await internalRoute(page,'Offline Nissan VA');
 await page.screenshot({path:'test-results/nissan-va-internal-route-offline.png',fullPage:true});
 await fresh.context.close();

 // A user measurement is independent of the built-in private-island scope.
 let manualEnd,manualExpected;
 for(const candidate of graph.nodes.values()){
  const direct=distanceMetres(outside,candidate);if(direct<100||direct>250)continue;
  const route=routeRoads(graph,outside,candidate);if(route.available&&route.distance>80&&route.distance<1000){manualEnd=candidate;manualExpected=route;break;}
 }
 assert.ok(manualEnd,'connected ordinary-road fixture for a manual saved destination');
 const saved={'nissan:VA:parking':{lat:manualEnd[0],lon:manualEnd[1],accuracy:3,method:'gps'}};
 const manual=await device(outside,saved);
 assert.equal((await manual.page.locator('#route-button').innerText()).trim(),'Start route','saved user measurements retain the usual button');
 assert.doesNotMatch(await manual.page.locator('.destination-meta').innerText(),/Within Nissan only/,'the built-in scope is not imposed on a manual measurement');
 await manual.page.locator('#route-button').click();await manual.page.locator('.road-route').waitFor();
 assert.doesNotMatch(await manual.page.locator('#navigation-detail').innerText(),/Within Nissan only|entrance connection/i,'saved-point navigation retains its usual route details');
 const manualText=await manual.page.locator('#navigation-distance').innerText();
 assert.ok(Math.abs(parseFloat(manualText)-manualExpected.distance)<2,'saved-point route still follows its connected ordinary roads');
 assert.equal(await manual.page.locator('dialog[open]').count(),0);
 await manual.context.close();
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS Nissan internal routing: fresh VA from VH001, explicit internal scope, blue connected route, no fake public gate, offline repeat and unchanged manual saved-point behavior');
}finally{await browser.close();}
