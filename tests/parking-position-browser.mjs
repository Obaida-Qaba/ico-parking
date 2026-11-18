import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {observeMap} from './observe-map.mjs';
mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const target=catalogue.destinations['south:HC2'];
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__positionMap');
await context.addInitScript(()=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:51.3017018,longitude:3.2268128,accuracy:3,heading:300,speed:0}});return 31;};
 navigator.geolocation.clearWatch=()=>{};
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/?map=south&parking=HC2');await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.ok(target.labelPosition,'HC2 has an interior display point independent of its approach');
 for(const bearing of [0,90,270]){
  await page.evaluate(({label,bearing})=>{const m=window.__positionMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(bearing);m.setView([label.lat,label.lon],18,{animate:false});},{label:target.labelPosition,bearing});
  const geometry=await page.evaluate(({label,approach,neighbor})=>{
   const m=window.__positionMap,origin=m.getContainer().getBoundingClientRect(),expected=m.latLngToContainerPoint([label.lat,label.lon]);
   const badge=document.querySelector('.gps-target span').getBoundingClientRect();
   const endpoint=document.querySelector('.route-endpoint')?.getBoundingClientRect(),road=m.latLngToContainerPoint([approach.lat,approach.lon]);
   const nearby=document.querySelector('.nearby-parking[data-parking="HC3"]').getBoundingClientRect(),neighborPoint=m.latLngToContainerPoint([neighbor.lat,neighbor.lon]);
   return {badgeError:Math.hypot(badge.x+badge.width/2-origin.x-expected.x,badge.y+badge.height/2-origin.y-expected.y),endpointError:endpoint?Math.hypot(endpoint.x+endpoint.width/2-origin.x-road.x,endpoint.y+endpoint.height/2-origin.y-road.y):Infinity,nearbyError:Math.hypot(nearby.x+nearby.width/2-origin.x-neighborPoint.x,nearby.y+nearby.height/2-origin.y-neighborPoint.y)};
  },{label:target.labelPosition,approach:target,neighbor:catalogue.destinations['south:HC3'].labelPosition});
  assert.ok(geometry.badgeError<2,`HC2 badge stays at its parking centre at bearing ${bearing}, not floating into HC1/HC3`);
  assert.ok(geometry.endpointError<2,`road arrival point is separately marked at bearing ${bearing}`);
  assert.ok(geometry.nearbyError<2,`HC3 label stays inside HC3 at bearing ${bearing}`);
 }
 await page.screenshot({path:'test-results/hc2-correct-parking-label-position.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS HC2 parking-block label stays geographically centred at 0/90/270 degrees; road arrival point remains distinct');
}finally{await browser.close();}
