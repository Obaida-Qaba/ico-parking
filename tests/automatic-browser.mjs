import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres,nearestRoad} from '../public/navigation.mjs';
import {courseBetween} from '../public/heading.mjs';
mkdirSync('test-results',{recursive:true});
const data=JSON.parse(readFileSync('public/destinations.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const target=data.destinations['south:HC1'];assert.ok(target,'HC1 builtin location');
const end=[target.lat,target.lon];
assert.ok(nearestRoad(graph,end).distance<1,'HC1 approach lies on an actual mapped road');
let start,expected;
for(const point of graph.nodes.values()){
 const direct=distanceMetres(point,end);if(direct<150||direct>300)continue;
 const route=routeRoads(graph,point,end);if(route.available&&route.distance<1000){start=point;expected=route;break;}
}
assert.ok(start,'connected starting road near HC1');
const browser=await chromium.launch();
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(p=>{
 navigator.geolocation.watchPosition=ok=>{
   const fixture=JSON.parse(sessionStorage.getItem('portway-test-gps')||'null')||{position:p,accuracy:6,heading:40,speed:2};
   ok({timestamp:Date.now(),coords:{latitude:fixture.position[0],longitude:fixture.position[1],accuracy:fixture.accuracy,heading:fixture.heading,speed:fixture.speed}});return 8;
 };
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);
 await page.locator('.map-card').last().waitFor({state:'attached'});
 await page.locator('#destination').fill('HC1');
 await page.locator('#search-settings').evaluate(el=>el.open=true);
 await page.locator('#terminal-filter').selectOption('bastenaken');
 await page.locator('#line').fill('15');
 await page.locator('.find-button').click();
 assert.equal(await page.locator('.destination-code').innerText(),'HC1');
 assert.match(await page.locator('.destination-meta').innerText(),/Bastenaken/);
 assert.match(await page.locator('#route-button').innerText(),/Start route/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'no record-GPS prompt');
 assert.match(await page.locator('#navigation-detail').innerText(),/HC1 parking approach.*Line 15 remains a reference/);
 const text=await page.locator('#navigation-distance').innerText();
 const metres=parseFloat(text)*(text.includes('km')?1000:1);
 assert.ok(Math.abs(metres-expected.distance)<3);
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 await page.screenshot({path:'test-results/hc1-automatic-route-simulated-gps.png',fullPage:true});
 // The HC1 lane is two-way on the current ICO plan. Starting just southeast
 // of the approach should use this lane directly rather than circle the block.
 const laneStart=[51.3019,3.2270544],laneHeading=courseBetween(laneStart,end);
 await page.evaluate(({p,heading})=>sessionStorage.setItem('portway-test-gps',JSON.stringify({position:p,accuracy:3,heading,speed:2})),{p:laneStart,heading:laneHeading});
 await page.goto(base+'/?map=south&parking=HC1');
 await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 const laneMetres=parseFloat(await page.locator('#navigation-distance').innerText());
 assert.ok(Math.abs(laneMetres-distanceMetres(laneStart,end))<2,'HC1 uses the short direct two-way lane');
 await page.screenshot({path:'test-results/hc1-short-route-simulated-gps.png',fullPage:true});
 const h61=data.destinations['south:H61'];assert.ok(h61,'H61 builtin location');
 const hEnd=[h61.lat,h61.lon];let hStart;
 for(const point of graph.nodes.values()){
   const distance=distanceMetres(point,hEnd);if(distance<100||distance>250)continue;
   const candidate=routeRoads(graph,point,hEnd);if(candidate.available&&candidate.distance<1000){hStart=point;break;}
 }
 assert.ok(hStart,'connected H61 starting road');
 await page.evaluate(p=>sessionStorage.setItem('portway-test-gps',JSON.stringify({position:p,accuracy:6,heading:null,speed:null})),hStart);
 await page.goto(base+'/?map=south&parking=H61&line=15');
 await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.match(await page.locator('#navigation-detail').innerText(),/H61 parking approach/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 assert.deepEqual(errors,[]);
 console.log('PASS HC1 Bastenaken and H61 Hanze: fresh device, no saved pins, automatic routes, direct HC1 two-way access without a loop, line references retained');
}finally{await browser.close();}
