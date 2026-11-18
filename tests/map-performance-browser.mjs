import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
try{
 await page.goto(base+'/vendor/leaflet.css');
 await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+base+'/vendor/leaflet.css"><style>html,body,#fixture{margin:0;width:100%;height:100%}</style></head><body><div id="fixture"></div></body></html>');
 await page.addScriptTag({url:base+'/vendor/leaflet.js'});
 await page.addScriptTag({url:base+'/vendor/leaflet-rotate.js'});
 const result=await page.evaluate(async({baseline,base})=>{
  const asset=name=>base+'/'+name;
  const map=L.map('fixture',{rotate:true,zoomControl:false,rotateControl:false,touchRotate:false,zoomSnap:.25});
  if(!baseline&&((await fetch(asset('map-performance.mjs'))).ok)){
   const {optimizeDrivingMap}=await import(asset('map-performance.mjs'));optimizeDrivingMap(map);
  }
  window.__performanceFixture=map;
  map.setView([51.3019,3.2270544],17,{animate:false});map.setBearing(90);
  const {buildGraph,routeRoads}=await import(asset('navigation.mjs')),{createRoadMap}=await import(asset('road-map.mjs'));
  const graph=buildGraph(await(await fetch(asset('roads.json'))).json());createRoadMap(map,graph);
  const catalogue=await(await fetch(asset('destinations.json'))).json(),target=catalogue.destinations['south:HC1'];
  const route=routeRoads(graph,[51.3019,3.2270544],[target.lat,target.lon],{maxSnap:50,heading:90,accuracy:3});
  if(!route.available)throw Error('fixture route unavailable: '+route.reason);
  const line=L.polyline(route.points,{className:'audit-route',color:'#1478e9',weight:6,interactive:false}).addTo(map);
  const marker=L.marker([51.3019,3.2270544],{icon:L.divIcon({className:'audit-position',html:'GPS',iconSize:[30,20],iconAnchor:[15,10]})}).addTo(map);
  await new Promise(requestAnimationFrame);
  const before=map.getCenter(),point=L.latLng(51.3021,3.2273),screenBefore=map.latLngToContainerPoint(point),center=map.getSize().divideBy(2);
  map.panBy([83,-57],{animate:false});const panned=map.getCenter(),pixel=map.latLngToContainerPoint(point);map.setBearing(137);
  const centerError=map.distance(panned,map.getCenter()),pixelError=pixel.subtract(center).rotate(47*Math.PI/180).add(center).distanceTo(map.latLngToContainerPoint(point));
  let resets=0,roadProjects=0,pathUpdates=0;
  const reset=map._resetView;map._resetView=function(...args){resets++;return reset.apply(this,args);};
  const project=L.Polyline.prototype._project,update=L.Polyline.prototype._updatePath;
  L.Polyline.prototype._project=function(...args){if(this.options.className?.includes('mapped-road'))roadProjects++;return project.apply(this,args);};
  L.Polyline.prototype._updatePath=function(...args){pathUpdates++;return update.apply(this,args);};
  const routeModel=line.getLatLngs();
  for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);map.panBy([1,0],{animate:false,noMoveStart:true});map.setBearing(137+i*1.3);}
  const motion={resets,roadProjects,pathUpdates,routeUnchanged:routeModel===line.getLatLngs()};
  map.setBearing(0);resets=0;pathUpdates=0;
  for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);map.panBy([1,0],{animate:false,noMoveStart:true});}
  const northUp={resets,pathUpdates};
  const clipped=[];const verifyViewport=()=>{
   const size=map.getSize();map.eachLayer(layer=>{if(layer instanceof L.Renderer)for(const corner of [[0,0],[size.x,0],[size.x,size.y],[0,size.y]])if(!layer._bounds.contains(map.containerPointToLayerPoint(corner)))clipped.push({zoom:map.getZoom(),bearing:map.getBearing(),corner});});
  };
  for(const zoom of [15,17,18.5])for(const bearing of [0,1,17,45,89,137,179,224,270,315,359]){map.setZoom(zoom,{animate:false});map.setBearing(bearing);map.panBy([22,-13],{animate:false});verifyViewport();}
  map.setView([51.3019,3.2270544],17,{animate:false});map.setBearing(73);
  const mapBox=map.getContainer().getBoundingClientRect(),markerBox=marker.getElement().getBoundingClientRect(),markerPixel=map.latLngToContainerPoint(marker.getLatLng());
  const markerError=L.point(markerBox.left-mapBox.left+15,markerBox.top-mapBox.top+10).distanceTo(markerPixel);
  const svg=Object.values(map._layers).filter(l=>l instanceof L.Renderer).map(l=>({width:+l._container.getAttribute('width'),height:+l._container.getAttribute('height')}));
  const routePixel=map.latLngToContainerPoint(line.getLatLngs()[0]),routeLocal=new DOMPoint(routePixel.x+mapBox.x,routePixel.y+mapBox.y).matrixTransform(line.getElement().getScreenCTM().inverse());
  const routeAtGeography=line.getElement().isPointInStroke(routeLocal);
  document.getElementById('fixture').style.height='500px';map.invalidateSize({pan:false});await new Promise(requestAnimationFrame);verifyViewport();
  const resized=map.getSize();
  const planContainer=document.createElement('div');planContainer.style.cssText='width:300px;height:200px';document.body.append(planContainer);
  const plan=L.map(planContainer,{crs:L.CRS.Simple,zoomControl:false});if(!baseline&&((await fetch(asset('map-performance.mjs'))).ok)){const {optimizeDrivingMap}=await import(asset('map-performance.mjs'));optimizeDrivingMap(plan);}plan.setView([100,100],0);const planPath=L.polyline([[0,0],[100,100]]).addTo(plan),planRenderer=planPath._renderer;
  return {centerError,pixelError,markerError,motion,northUp,clipped,svg,routeAtGeography,resized:{x:resized.x,y:resized.y},planSize:{x:planRenderer._bounds.getSize().x,y:planRenderer._bounds.getSize().y}};
 },{baseline:process.env.PORTWAY_TEST_BASELINE==='1',base});
 console.log(JSON.stringify(result,null,2));
 assert.ok(result.motion.resets<2,'continuous pan plus heading must not reset/reproject the map every frame');
 assert.ok(result.motion.roadProjects<4,'buffered road geometry is not reprojected on each heading frame');
 assert.ok(result.motion.pathUpdates<25,'buffered SVG avoids rebuilding all road and route paths on each pan');
 assert.equal(result.northUp.resets,0,'north-up camera pans do not reset the view');
 assert.ok(result.northUp.pathUpdates<15,'north-up movement also reuses the SVG surface while its viewport fits');
 assert.ok(result.centerError<.001,'bearing changes preserve geographic map center after panning');
 assert.ok(result.pixelError<.001,'geographic points rotate around the viewport center');
 assert.ok(result.markerError<.1,'upright position marker stays on the same geographic point');
 assert.equal(result.motion.routeUnchanged,true,'camera movement preserves the route model');
 assert.equal(result.routeAtGeography,true,'route stroke is aligned with its geographic coordinate');
 assert.deepEqual(result.clipped,[],'all viewport corners stay within the road/route render area during pan, heading, zoom and resize');
 assert.ok(result.svg.every(s=>s.width<1300&&s.height<1300),'rotating view uses a diagonal-sized SVG buffer instead of a 3720px surface');
 assert.deepEqual(result.resized,{x:390,y:500});
 assert.deepEqual(result.planSize,{x:360,y:240},'CRS.Simple terminal plan retains normal Leaflet renderer padding');
 assert.deepEqual(errors,[]);
 mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/mobile-map-performance.png'});
 console.log('PASS rotating map: no per-frame resets, buffered paths, geographic alignment, all-bearing clipping, resize and unchanged terminal plan rendering');
}finally{await browser.close();}
