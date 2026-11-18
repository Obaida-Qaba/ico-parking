import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolveDestination,destinationChoices} from '../public/destinations.mjs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';
import {observeMap} from './observe-map.mjs';

mkdirSync('test-results',{recursive:true});
const atlas=JSON.parse(readFileSync('public/data.json','utf8'));
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const south=atlas.maps.find(map=>map.id==='south');
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const errors=[];
const names={ge2:'Near GE2','ee1-de1':'Near EE1 / DE1'};

async function freshDevice(){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await observeMap(context,'__posMap');
 await context.addInitScript(()=>{
  navigator.geolocation.watchPosition=ok=>{
   window.__posSetGPS=position=>ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:3,heading:null,speed:0}});
   window.__posSetGPS([51.30217,3.22683]);return 77;
  };
  navigator.geolocation.clearWatch=()=>{};
  navigator.share=async payload=>{window.__posShared=payload;};
 });
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 return {context,page};
}

async function choices(page,label){
 assert.equal(await page.locator('.result-row').count(),2,label+': POS offers two explicit area choices');
 for(const name of Object.values(names))assert.equal(await page.locator('.result-row').filter({hasText:name}).count(),1,label+': '+name);
 assert.equal(await page.locator('dialog[open]').count(),0,label+': no fallback or GPS recording dialog');
}

function fixture(code,approach){
 const parking=south.parkings.find(parking=>parking.code===code);
 const hit=destinationChoices({map:south,parking,line:'15',approach},catalogue).find(hit=>hit.approach===approach)||{map:south,parking,line:'15',approach};
 const target=resolveDestination(hit,{},catalogue);
 assert.ok(target,code+' '+(approach||'')+' has a built-in route');
 const end=[target.lat,target.lon];
 for(const point of graph.nodes.values()){
  const distance=distanceMetres(point,end);if(distance<100||distance>250)continue;
  const route=routeRoads(graph,point,end);
  if(route.available&&route.distance>80&&route.distance<1200)return {hit,target,start:point,route};
 }
 assert.fail('connected road fixture for '+code+' '+(approach||''));
}

async function route(page,code,approach){
 const expected=fixture(code,approach);
 assert.equal(await page.locator('.destination-code').innerText(),code);
 if(approach)assert.match(await page.locator('.destination-meta').innerText(),new RegExp(names[approach]));
 assert.match(await page.locator('#route-button').innerText(),/Start route/,code+' starts a built-in route');
 await page.evaluate(position=>window.__posSetGPS(position),expected.start);
 await page.evaluate(()=>{
  const original=L.polyline;
  L.polyline=function(points,options){if(options?.className==='road-route')window.__posRoute=points.map(point=>Array.from(point));return original.apply(this,arguments);};
 });
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'no fallback or GPS recording modal');
 const destination=await page.locator('#navigation-destination').innerText();
 assert.ok(destination.includes(code)&&destination.includes('line 15'),'route retains destination and line reference');
 if(approach)assert.ok(destination.includes(names[approach]),'route names the selected POS area');
 const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
 assert.ok(Math.abs(metres-expected.route.distance)<(text.includes('km')?55:2),'displayed distance follows connected roads');
 const painted=await page.locator('.road-route').evaluate(path=>({points:window.__posRoute,stroke:getComputedStyle(path).stroke,length:path.getTotalLength()}));
 assert.equal(painted.stroke,'rgb(20, 120, 233)','connected road route is painted blue');
 assert.ok(painted.length>20,'blue route has visible length');
 assert.deepEqual(painted.points,expected.route.points,'painted route uses actual connected road vertices');
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,'no user GPS measurement is required');
 return expected;
}

async function search(page,value){
 await page.locator('#destination').fill(value+' line 15');await page.locator('.find-button').click();
}

async function verifyPlan(page,approach){
 const expected=fixture('POS',approach).hit;
 await page.locator('#view-plan-button').click();
 const points=await page.evaluate(()=>{
  const points=[];window.__posMap.eachLayer(layer=>{if(layer.options?.icon?.options?.className==='destination-marker'){const point=layer.getLatLng();points.push([point.lat,point.lng]);}});return points;
 });
 assert.deepEqual(points,expected.approachSourceIndices.map(index=>{const point=expected.parking.points[index];return [expected.map.height-point.y,point.x];}),'source plan highlights only the chosen POS area labels');
 if(!await page.locator('#map-options-panel').isVisible())await page.locator('#map-options').click();
 await page.locator('#street-view').click();
}

try{
 const searched=await freshDevice(),page=searched.page;
 await page.goto(base);await page.locator('.map-card').last().waitFor({state:'attached'});
 await search(page,'POS');
 await choices(page,'Fresh normal POS search');
 assert.equal(await page.locator('#destination-card').isVisible(),false,'generic POS is not silently selected');
 const arrivals=[];
 for(const approach of ['ge2','ee1-de1']){
  await page.locator('.result-row').filter({hasText:names[approach]}).click();
  assert.equal(new URL(page.url()).searchParams.get('approach'),approach,'URL retains explicit POS area');
  await verifyPlan(page,approach);
  await page.locator('#share-button').click();
  const shared=await page.evaluate(()=>window.__posShared);
  assert.equal(new URL(shared.url).searchParams.get('approach'),approach,'shared URL retains explicit POS area');
  assert.ok(shared.text.includes(names[approach]),'share text identifies the area');
  await page.reload();await page.locator('.destination-code').waitFor();
  const expected=await route(page,'POS',approach);arrivals.push([expected.target.lat,expected.target.lon]);
  await page.screenshot({path:`test-results/pos-${approach}-mobile-route.png`,fullPage:true});
  const previous=await page.locator('#navigation-destination').innerText();
  await search(page,'POS');await choices(page,'POS search while navigating');
  assert.equal(await page.locator('#navigation-destination').innerText(),previous,'generic search preserves the selected route until an explicit choice');
  assert.equal(await page.locator('.road-route').count(),1,'generic search preserves the painted active route');
 }
 assert.ok(distanceMetres(...arrivals)>50,'POS choices route to different actual areas');
 const recents=await page.evaluate(()=>JSON.parse(localStorage.getItem('portway-recents')));
 assert.deepEqual(recents.filter(item=>item.code==='POS').map(item=>item.approach).sort(),['ee1-de1','ge2'],'recents distinguish both POS areas');
 await page.goto(base);await page.locator('.map-card').last().waitFor({state:'attached'});await page.locator('#destination').click();await page.locator('.recent-row').first().waitFor();
 for(const name of Object.values(names))assert.equal(await page.locator('.recent-row').filter({hasText:name}).count(),1,'recent label includes '+name);
 await page.locator('.recent-row').filter({hasText:names['ee1-de1']}).click();
 await route(page,'POS','ee1-de1');
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await searched.context.setOffline(true);await page.reload();await page.locator('.destination-code').waitFor();
 await route(page,'POS','ee1-de1');
 await page.screenshot({path:'test-results/pos-explicit-area-offline.png',fullPage:true});
 await searched.context.close();

 const linked=await freshDevice();
 for(const suffix of ['','&approach=invalid']){
  await linked.page.goto(base+'/?map=south&parking=POS&line=15'+suffix);
  await linked.page.locator('.map-card').last().waitFor({state:'attached'});
  await choices(linked.page,'Generic or invalid POS deep link');
  assert.equal(await linked.page.locator('#destination-card').isVisible(),false,'deep link requires an explicit area choice');
 }
 await linked.page.locator('.result-row').filter({hasText:names.ge2}).click();await route(linked.page,'POS','ge2');
 await linked.context.close();

 const os=await freshDevice();
 for(const code of ['IOS','JOS','KOS','LOS']){
  await os.page.goto(base);await os.page.locator('.map-card').last().waitFor({state:'attached'});
  await search(os.page,code);await os.page.locator('.destination-code').waitFor();
  assert.equal(new URL(os.page.url()).searchParams.get('map'),'south','OS search selects the current source plan');
  await route(os.page,code);
  await os.page.goto(base+'/?map=bastenaken&parking='+code+'&line=15');await os.page.locator('.destination-code').waitFor();
  await route(os.page,code);
 }
 await os.page.screenshot({path:'test-results/os-mobile-route.png',fullPage:true});
 await os.context.close();
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS POS explicit areas: search/deep-link choice, distinct connected blue routes, source focus, share/reload/recents/offline; IOS/JOS/KOS/LOS and historical-map aliases');
}finally{await browser.close();}
