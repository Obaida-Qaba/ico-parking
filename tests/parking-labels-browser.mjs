import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {observeMap} from './observe-map.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const hc1=catalogue.destinations['south:HC1'],gc1=catalogue.destinations['south:GC1'];
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await observeMap(context,'__parkingMap');
await context.addInitScript(()=>{
 window.__gpsStarts=0;window.__gpsStops=0;
 navigator.geolocation.watchPosition=ok=>{
  window.__gpsStarts++;window.__sendParkingFix=ok;
  ok({timestamp:Date.now(),coords:{latitude:51.3019,longitude:3.2270544,accuracy:3,heading:90,speed:2}});return 21;
 };
 navigator.geolocation.clearWatch=()=>window.__gpsStops++;
 Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:()=>Promise.reject(new DOMException('Use mobile fallback','NotAllowedError'))});
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/?map=south&parking=HC1');
 await page.locator('.destination-code').waitFor();
 await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 await page.waitForTimeout(500);
 assert.ok(await page.locator('.nearby-parking').count()>1,'other parking labels are drawn while HC1 navigation is active');
 assert.equal(await page.locator('.nearby-parking[data-parking="HC1"]').count(),0,'destination has one distinct label');
 await page.evaluate(({a,b})=>{const m=window.__parkingMap;m.fire('dragstart');m.stopHeadingUp();m.setBearing(0);m.fitBounds([[a.lat,a.lon],[b.lat,b.lon]],{padding:[60,60],maxZoom:18,animate:false});},{a:hc1,b:gc1});
 await page.waitForTimeout(100);
 const nearby=page.locator('.nearby-parking[data-parking="GC1"]');
 assert.ok(await nearby.isVisible(),'GC1 is visible beside HC1');
 const assertReadable=async()=>{
  const boxes=await page.locator('.nearby-parking').evaluateAll(elements=>elements.filter(el=>!el.hidden).map(el=>{
   const b=el.getBoundingClientRect();let angle=0;
   for(let current=el;current&&current!==document.body;current=current.parentElement){const transform=getComputedStyle(current).transform;if(transform!=='none'){const m=new DOMMatrixReadOnly(transform);angle+=Math.atan2(m.b,m.a)*180/Math.PI;}}
   return {x:b.x,y:b.y,w:b.width,h:b.height,angle:((angle+540)%360)-180};
  }));
  for(const b of boxes)assert.ok(Math.abs(b.angle)<1,'parking text remains upright');
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'parking labels do not overlap');}
 };
 await assertReadable();
 await page.screenshot({path:'test-results/mobile-nearby-parking-labels.png',fullPage:true});
 await page.evaluate(()=>window.__parkingMap.setBearing(270));
 await page.waitForTimeout(100);await assertReadable();
 await page.locator('#map-fullscreen').click();
 assert.ok(await page.locator('.nearby-parking').count()>1,'labels remain in fullscreen');
 await page.evaluate(()=>window.__sendParkingFix({timestamp:Date.now(),coords:{latitude:51.30191,longitude:3.22705,accuracy:3,heading:180,speed:2}}));
 assert.equal(await page.locator('#navigation-destination').innerText(),'HC1');
 assert.equal(await page.locator('.road-route').count(),1);
 assert.ok(await page.locator('.nearby-parking').count()>1,'GPS redraw keeps other parking labels');
 assert.equal(await page.evaluate(()=>window.__gpsStarts),1);
 assert.equal(await page.evaluate(()=>window.__gpsStops),0);
 // Around the VPC, the old collision pass silently dropped half the known
 // parking names. Every in-view point must have a label or an explicit group.
 await page.evaluate(()=>{
  const m=window.__parkingMap;m.fire('dragstart');m.stopHeadingUp();
  window.__sendParkingFix({timestamp:Date.now(),coords:{latitude:51.3071,longitude:3.2215,accuracy:3,heading:333,speed:2}});
  m.setBearing(27);m.setView([51.3071,3.2215],16,{animate:false});
 });
 await page.waitForTimeout(150);
 const coverage=await page.evaluate(catalogue=>{
  const m=window.__parkingMap,size=m.getSize(),expected=[],shown=new Set();
  for(const [key,pin] of Object.entries({...catalogue.destinations,...catalogue.labels})){
   const point=pin.labelPosition||pin;if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||key==='south:HC1')continue;
   const p=m.latLngToContainerPoint([point.lat,point.lon]);if(p.x>=0&&p.x<=size.x&&p.y>=0&&p.y<=size.y)expected.push(key.split(':')[1]);
  }
  for(const el of document.querySelectorAll('.nearby-parking'))if(!el.hidden)shown.add(el.dataset.parking);
  for(const button of document.querySelectorAll('.parking-cluster-button'))if(!button.closest('[hidden]'))for(const code of JSON.parse(button.dataset.parkingCodes))shown.add(code);
  return {expected,shown:[...shown]};
 },catalogue);
 assert.ok(coverage.expected.length>=8,'fixture includes the VPC compounds and adjacent C rows');
 assert.deepEqual(coverage.expected.filter(code=>!coverage.shown.includes(code)),[],'known parking points are represented by a readable label or explicit group instead of disappearing');
 const group=page.locator('.parking-cluster-button').first();
 assert.ok(await group.isVisible(),'crowded parkings have a visible count control');
 await page.screenshot({path:'test-results/mobile-parking-groups-overview.png',fullPage:true});
 const members=JSON.parse(await group.getAttribute('data-parking-codes'));
 await group.click();
 await page.waitForTimeout(350);
 const popupBounds=await page.locator('.parking-group-popup').boundingBox();
 assert.ok(popupBounds.x>=0&&popupBounds.y>=0&&popupBounds.x+popupBounds.width<=390&&popupBounds.y+popupBounds.height<=844,'parking list stays inside the screen: '+JSON.stringify(popupBounds));
 await page.screenshot({path:'test-results/mobile-parking-group-list.png',fullPage:true});
 for(const code of members)assert.ok(await page.getByRole('button',{name:'Show '+code+' on map',exact:true}).isVisible(),'the group exposes '+code);
 const lastMember=page.getByRole('button',{name:'Show '+members.at(-1)+' on map',exact:true});
 await lastMember.scrollIntoViewIfNeeded();
 const lastBounds=await lastMember.boundingBox();
 assert.ok(lastBounds.y>=popupBounds.y&&lastBounds.y+lastBounds.height<=popupBounds.y+popupBounds.height,'the last member is reachable by scrolling the parking list');
 await page.getByRole('button',{name:'Show '+members[0]+' on map',exact:true}).click();
 assert.equal(await page.locator('#navigation-destination').innerText(),'HC1','inspecting a parking group does not change the current route');
 await page.locator('.leaflet-popup-close-button').click();
 const writes=await page.evaluate(async()=>{
  let count=0;const observer=new MutationObserver(records=>count+=records.length);
  for(const el of document.querySelectorAll('.nearby-parking'))observer.observe(el,{attributes:true,attributeFilter:['hidden']});
  for(let i=0;i<100;i++)window.__parkingMap.fire('rotate');
  await new Promise(resolve=>setTimeout(resolve,120));observer.disconnect();return count;
 });
 assert.ok(writes<40,'unchanged rotation events do not repeatedly rewrite every label visibility attribute');
 await page.screenshot({path:'test-results/mobile-parking-groups-no-missing-labels.png',fullPage:true});
 await context.setOffline(true);await page.reload();
 await page.locator('.destination-code').waitFor();await page.locator('#route-button').click();
 await page.locator('.road-route').waitFor();
 assert.ok(await page.locator('.nearby-parking').count()>1,'nearby labels also work offline');
 assert.deepEqual(errors,[]);
 console.log('PASS nearby parking codes during navigation: distinct destination, GC1 visible, upright spaced labels, rotation, GPS redraw, fullscreen and offline');
}finally{await browser.close();}
