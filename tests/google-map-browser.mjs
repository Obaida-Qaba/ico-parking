import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

// Exercise the restricted production browser key against local candidate code.
// No Google requests are mocked; only Portway's own static assets are served locally.
const base='https://obaida-qaba.github.io/ico-parking/';
const live=process.env.PORTWAY_GOOGLE_LIVE==='1';
const root=path.resolve('public');
const catalogue=JSON.parse(await readFile('public/destinations.json','utf8')).destinations;
const start=[catalogue['south:CD1'].lat,catalogue['south:CD1'].lon];
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
// The bundled headless Chromium uses software-only WebGL on this Windows host.
// Installed Edge exposes the actual GPU required by Google's vector renderer.
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:live?'allow':'block'});
await context.addInitScript(start=>{
 navigator.geolocation.watchPosition=ok=>{window.__gpsCallback=ok;window.__gpsStarts=(window.__gpsStarts||0)+1;ok({timestamp:Date.now(),coords:{latitude:start[0],longitude:start[1],accuracy:3,speed:0,heading:null}});return 701;};
 navigator.geolocation.clearWatch=()=>{};
 document.addEventListener('load',event=>{
  if(event.target.tagName==='SCRIPT'&&event.target.src?.endsWith('/vendor/leaflet.js')){
   const original=L.map;L.map=(...args)=>{const map=original(...args);window.__leafletMap=map;return map;};
  }
 },true);
 // Observe the real SDK constructor without adding a production test hook.
 const append=Node.prototype.appendChild;
 Node.prototype.appendChild=function(node){
  if(node.tagName==='SCRIPT'&&node.src?.startsWith('https://maps.googleapis.com/maps/api/js')){
   const callback=new URL(node.src).searchParams.get('callback'),done=window[callback];
   if(callback&&typeof done==='function')window[callback]=(...args)=>{
    const Original=google.maps.Map;
    google.maps.Map=new Proxy(Original,{construct(Target,args){const instance=Reflect.construct(Target,args);window.__googleMap=instance;window.__googleConstructs=(window.__googleConstructs||0)+1;return instance;}});
    return done(...args);
   };
  }
  return append.call(this,node);
 };
},start);
if(!live)await context.route(base+'**',async route=>{
 const url=new URL(route.request().url());
 const relative=decodeURIComponent(url.pathname.slice('/ico-parking/'.length))||'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep))return route.abort();
 try{
  let body=await readFile(file);
  if(relative==='google-config.mjs'){
   const key=(process.env.PORTWAY_GOOGLE_MAPS_BROWSER_KEY||await readFile('test-results/google-browser-key.txt','utf8')).trim();
   body=Buffer.from('export const GOOGLE_MAPS=Object.freeze('+JSON.stringify({apiKey:key,siteOrigin:new URL(base).origin})+');');
  }
  await route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body});
 }catch{await route.fulfill({status:404,body:'Not found'});}
});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message.replace(/AIza[\w-]+/g,'[redacted]')));
page.on('console',message=>{if(/Google Maps JavaScript API error|WebGL|vector|map ID|RenderingType/i.test(message.text()))console.log(message.text().replace(/AIza[\w-]+/g,'[redacted]'));});
page.on('request',request=>requests.push(request.url()));
await mkdir('test-results',{recursive:true});
try{
 await page.goto(base+'?map=south&parking=AH4&line=15');
 await page.locator('#google-map').waitFor({state:'attached',timeout:5000});
 await page.waitForFunction(()=>document.body.classList.contains('google-satellite-active'),{timeout:40000});
 assert.equal(await page.evaluate(()=>window.__googleConstructs),1);
 assert.equal(await page.evaluate(()=>window.__googleMap.getMapTypeId()),'satellite');
 assert.equal(await page.evaluate(()=>window.__googleMap.getRenderingType()),'VECTOR');
 await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
 assert.equal(await page.locator('.gps-dot').isVisible(),true);
 assert.equal(await page.locator('.gps-target span').isVisible(),true);
 assert.equal(await page.locator('.mapped-road-fill').isVisible(),false,'drawn background roads stay hidden over photos');
 assert.match(await page.locator('#navigation-destination').innerText(),/AH4.*line 15.*area entrance/i);
 await page.evaluate(()=>{
  const overlay=new google.maps.OverlayView();overlay.onAdd=()=>{};overlay.draw=()=>{};overlay.onRemove=()=>{};overlay.setMap(window.__googleMap);window.__googleProjection=overlay;
  window.__leafletMap.fire('dragstart');
 });
 await page.waitForFunction(()=>window.__googleProjection.getProjection());
 for(const heading of [0,90,180,270]){
  await page.evaluate(heading=>{const map=window.__leafletMap;map.stopHeadingUp();map.setView([51.305,3.217],18.25,{animate:false});map.setBearing(-heading);},heading);
  await page.waitForFunction(heading=>Math.abs(((window.__googleMap.getHeading()||0)-heading+540)%360-180)<.1&&Math.abs(window.__googleMap.getZoom()-18.25)<.001,heading);
  await page.waitForFunction(()=>{const point=window.__googleProjection.getProjection().fromLatLngToContainerPixel(new google.maps.LatLng(51.305,3.217)),size=window.__leafletMap.getSize();return Math.hypot(point.x-size.x/2,point.y-size.y/2)<1.5;});
  // Google updates its model before its next rendered projection frame.
  await page.waitForFunction(()=>{
   const projection=window.__googleProjection.getProjection(),map=window.__leafletMap;
   return [[51.305,3.217],[51.3053,3.218],[51.3046,3.2165]].every(point=>{const a=projection.fromLatLngToContainerPixel(new google.maps.LatLng(...point)),b=map.latLngToContainerPoint(point);return Math.hypot(a.x-b.x,a.y-b.y)<2.5;});
  },null,{timeout:5000});
  const difference=await page.evaluate(()=>{
   const points=[[51.305,3.217],[51.3053,3.218],[51.3046,3.2165]],native=window.__googleProjection.getProjection(),leaflet=window.__leafletMap;
   return Math.max(...points.map(point=>{const a=native.fromLatLngToContainerPixel(new google.maps.LatLng(...point)),b=leaflet.latLngToContainerPoint(point);return Math.hypot(a.x-b.x,a.y-b.y);}));
  });
  assert.ok(difference<2.5,'native imagery and route projection align at '+heading+' degrees: '+difference);
 }
 const beforeDrag=await page.evaluate(()=>window.__googleMap.getCenter().toJSON());
 await page.mouse.move(160,350);await page.mouse.down();await page.mouse.move(245,435,{steps:10});await page.mouse.up();
 await page.waitForFunction(before=>{
  const native=window.__googleMap.getCenter(),leaflet=window.__leafletMap,point=[native.lat(),native.lng()];
  const a=window.__googleProjection.getProjection().fromLatLngToContainerPixel(native),b=leaflet.latLngToContainerPoint(point);
  return Math.hypot(native.lat()-before.lat,native.lng()-before.lng)>.00001&&Math.hypot(a.x-b.x,a.y-b.y)<2.5;
 },beforeDrag);
 await page.mouse.click(160,350);
 await page.evaluate(start=>{
  window.__photosReady=false;google.maps.event.addListenerOnce(window.__googleMap,'tilesloaded',()=>window.__photosReady=true);
  window.__gpsCallback({timestamp:Date.now()+1000,coords:{latitude:start[0],longitude:start[1],accuracy:3,speed:3,heading:0}});
 },start);
 await page.locator('#locate').click();
 await page.waitForFunction(()=>window.__photosReady);
 await page.screenshot({path:'test-results/google-satellite-navigation.png',fullPage:true});
 await page.locator('#stop-navigation').click();await page.locator('#view-plan-button').click();await page.locator('.leaflet-image-layer').waitFor();
 assert.equal(await page.evaluate(()=>document.body.classList.contains('google-satellite-active')),false);
 await page.locator('#map-options').click();await page.locator('#street-view').click();
 await page.waitForFunction(()=>document.body.classList.contains('google-satellite-active'));
 assert.equal(await page.evaluate(()=>window.__googleConstructs),1,'source previews reuse the native map');
 assert.equal(await page.evaluate(()=>window.__gpsStarts),1,'Google switching preserves one GPS watch');
 if(live){
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline-status').textContent==='Maps saved offline');
  const cachedOrigins=await page.evaluate(async()=>{const result=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())result.push(new URL(request.url).origin);return result;});
  assert.ok(cachedOrigins.length>0);assert.equal(cachedOrigins.every(origin=>origin===new URL(base).origin),true,'Google assets are not stored in PWA caches');
 }
 const branding=await page.locator('#google-map a[href*="maps.google.com"]').first().boundingBox();
 assert.ok(branding,'Google branding exists');
 assert.equal(await page.evaluate(({x,y,width,height})=>!!document.elementFromPoint(x+width/2,y+height/2)?.closest('#google-map'),branding),true,'Google branding remains clickable');
 await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await page.waitForFunction(()=>!document.body.classList.contains('google-satellite-active'));
 assert.equal(await page.locator('.mapped-road-fill').isVisible(),true,'offline keeps local roads');
 await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(()=>document.body.classList.contains('google-satellite-active'));
 assert.equal(await page.evaluate(()=>window.__googleConstructs),1);
 assert.equal(requests.some(url=>/\/(places|directions|routes|geocode|streetview)\//i.test(url)),false,'no extra billed services');
 assert.deepEqual(errors,[]);
 console.log('PASS real Google satellite: blue route/GPS/labels, projection parity at four headings and fractional zoom, one native map/GPS watch, branding and offline recovery');
}catch(error){
 console.log(await page.evaluate(()=>({status:document.getElementById('satellite-status')?.textContent,rendering:window.__googleMap?.getRenderingType(),constructs:window.__googleConstructs,canvas:document.querySelectorAll('#google-map canvas').length,webgl2:!!document.createElement('canvas').getContext('webgl2'),nativeCenter:window.__googleMap?.getCenter()?.toJSON(),leafletCenter:window.__leafletMap?.getCenter(),nativeZoom:window.__googleMap?.getZoom(),leafletZoom:window.__leafletMap?.getZoom()})));
 await page.screenshot({path:'test-results/google-satellite-failure.png',fullPage:true});
 throw error;
}finally{await browser.close();}
