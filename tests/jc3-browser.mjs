import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres,nearestRoad} from '../public/navigation.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const roads=JSON.parse(readFileSync('public/roads.json','utf8'));
const aisle=roads.ways.find(way=>way.id==='746582089');
assert.ok(aisle,'the actual C3 aisle supplies the GPS fixture');
const start=aisle.points[aisle.nodes.indexOf('6986702466')];
assert.ok(start,'known C3 aisle node is present');
const graph=buildGraph(roads),aisleGraph=buildGraph({ways:[aisle]});
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const errors=[];

async function freshDevice(){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(position=>{
  window.__jc3GPSStarts=0;
  navigator.geolocation.watchPosition=ok=>{
   window.__jc3GPSStarts++;
   ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:3,heading:null,speed:0}});
   return 73;
  };
  navigator.geolocation.clearWatch=()=>{};
 },start);
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 return {context,page};
}

async function verifyRoute(page,label){
 assert.equal(await page.locator('.destination-code').innerText(),'JC3',label+': selected parking');
 assert.match(await page.locator('.destination-line').innerText(),/^Line 15\b/,label+': line reference selected');
 assert.match(await page.locator('#route-button').innerText(),/Start route/,label+': built-in JC3 approach starts navigation directly');
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,label+': no recorded GPS point is needed');

 const target=catalogue.destinations['south:JC3'];
 assert.ok(target,'JC3 has a built-in road approach');
 const end=[target.lat,target.lon],direct=distanceMetres(start,end),expected=routeRoads(graph,start,end);
 assert.ok(nearestRoad(aisleGraph,end).distance<.1,'JC3 approach lies on the actual C3 aisle');
 assert.ok(expected.available,'C3 aisle forms a connected route to JC3');
 assert.ok(direct>50&&direct<250,'JC3 is a short drive from the known nearby C3 aisle node');
 assert.ok(expected.distance>=direct-1&&expected.distance<direct+2,'JC3 uses the direct aisle without a parking-block detour');
 await page.evaluate(()=>{
  const original=L.polyline;
  L.polyline=function(points,options){
   if(options?.className==='road-route')window.__jc3RoutePoints=points.map(point=>Array.from(point));
   return original.apply(this,arguments);
  };
 });
 await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,label+': no GPS recording dialog');
 assert.equal(await page.locator('#navigation-destination').innerText(),'JC3 · line 15',label+': navigation retains JC3 and line 15');
 assert.match(await page.locator('#navigation-detail').innerText(),/JC3 parking (?:area )?approach.*Line 15 remains a reference/,label+': line is a reference inside JC3');
 const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
 assert.ok(Math.abs(metres-expected.distance)<2,label+': displayed distance matches the short connected road route');
 const painted=await page.locator('.road-route').evaluate(path=>{
  const css=getComputedStyle(path);
  return {stroke:css.stroke,opacity:Number(css.strokeOpacity)*Number(css.opacity),length:path.getTotalLength(),points:window.__jc3RoutePoints};
 });
 assert.equal(painted.stroke,'rgb(20, 120, 233)',label+': route is painted blue');
 assert.ok(painted.opacity>.9&&painted.length>40,label+': blue route has visible opacity and length');
 assert.equal(await page.locator('.road-route').isVisible(),true,label+': route is visible on the mobile map');
 assert.deepEqual(painted.points,expected.points,label+': painted geographic route matches connected roads');
 assert.ok(painted.points.every(point=>nearestRoad(aisleGraph,point).distance<.1),label+': no false crossing or shortcut leaves the actual C3 aisle');
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,label+': route does not create a saved GPS measurement');
 assert.equal(await page.evaluate(()=>window.__jc3GPSStarts),1,label+': one GPS watch serves navigation');
}

try{
 const linked=await freshDevice();
 await linked.page.goto(base+'/?map=south&parking=JC3&line=15');
 await linked.page.locator('.destination-code').waitFor();
 await verifyRoute(linked.page,'Fresh South JC3 deep link');
 await linked.page.screenshot({path:'test-results/jc3-direct-route-fresh-device.png',fullPage:true});
 await linked.page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await linked.context.setOffline(true);
 await linked.page.reload();
 await linked.page.locator('.destination-code').waitFor();
 await verifyRoute(linked.page,'Offline South JC3 deep link');
 await linked.page.screenshot({path:'test-results/jc3-direct-route-offline.png',fullPage:true});
 await linked.context.close();

 const searched=await freshDevice();
 await searched.page.goto(base);
 await searched.page.locator('.map-card').last().waitFor({state:'attached'});
 await searched.page.locator('#destination').fill('JC3');
 await searched.page.locator('#search-settings').evaluate(element=>element.open=true);
 await searched.page.locator('#line').fill('15');
 await searched.page.locator('.find-button').click();
 await searched.page.locator('.destination-code').waitFor();
 await verifyRoute(searched.page,'Fresh normal JC3 search');
 assert.equal(new URL(searched.page.url()).searchParams.get('map'),'south','normal search selects the current South plan');
 await searched.page.screenshot({path:'test-results/jc3-direct-route-normal-search.png',fullPage:true});
 await searched.context.close();
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS JC3 mobile navigation: fresh deep link and normal search, short connected C3 aisle route painted blue, line 15 reference, no GPS recording, and offline repeat');
}finally{await browser.close();}
