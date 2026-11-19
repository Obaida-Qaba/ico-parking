import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads} from '../public/navigation.mjs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8')).destinations;
const origin=catalogue['north:BB'],start=[origin.lat,origin.lon];
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(start=>{
 navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:start[0],longitude:start[1],accuracy:3,speed:0,heading:null}});return 18;};
 navigator.geolocation.clearWatch=()=>{};
},start);
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base+'/?map=north&parking=DRU&line=5');await page.locator('.destination-code').waitFor();
 assert.match(await page.locator('#route-button').innerText(),/Start route/);
 const point=catalogue['north:DRU'];assert.ok(point);
 const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8'))),expected=routeRoads(graph,start,[point.lat,point.lon]);
 assert.ok(expected.available);
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.match(await page.locator('#navigation-destination').innerText(),/DRU.*line 5/);
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
 const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
 assert.ok(Math.abs(metres-expected.distance)<(text.includes('km')?55:2));
 mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/north-dru-route.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
 await context.setOffline(true);await page.goto(base+'/?map=north&parking=DRU');await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS DRU named-lane routing: fresh device, connected North BB origin, line reference and offline route');
}finally{await browser.close();}
