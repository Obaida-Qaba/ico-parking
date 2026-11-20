import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleSatellite} from '../public/google-satellite.mjs';

// Google is an external browser SDK. These fakes expose its public camera and
// event contract; all scheduling, state and lifecycle logic is the real adapter.
function events(target={}){
 const listeners=new Map();
 target.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
 target.removeEventListener=(name,fn)=>listeners.get(name)?.delete(fn);
 target.emit=(name,event={})=>{for(const fn of [...listeners.get(name)||[]])fn({type:name,...event});};
 return target;
}
function fixture({key='test-key',preloaded=true,online=true}={}){
 const frames=new Map(),timers=new Map(),scripts=[],instances=[],states=[];
 let sequence=0;
 const win=events({navigator:{onLine:online},requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 class NativeMap{
  constructor(element,options){this.element=element;this.options=options;this.camera={center:{...options.center},zoom:options.zoom,heading:options.heading,tilt:0};this.kind='VECTOR';this.handlers=events();this.moves=[];instances.push(this);}
  addListener(name,fn){this.handlers.addEventListener(name,fn);return {remove:()=>this.handlers.removeEventListener(name,fn)};}
  emit(name,event){this.handlers.emit(name,event);}
  moveCamera(camera){this.camera={...camera,center:{...camera.center}};this.moves.push(this.camera);this.emit('bounds_changed');}
  getCenter(){return {lat:()=>this.camera.center.lat,lng:()=>this.camera.center.lng};}
  getZoom(){return this.camera.zoom;}
  getHeading(){return this.camera.heading;}
  getRenderingType(){return this.kind;}
 }
 const installSDK=()=>{win.google={maps:{Map:NativeMap,RenderingType:{VECTOR:'VECTOR',RASTER:'RASTER'},MapTypeId:{SATELLITE:'satellite'}}};};
 const doc={defaultView:win,createElement:()=>({remove(){this.removed=true;}}),head:{appendChild(script){scripts.push(script);}}};
 const element=events({ownerDocument:doc,replaceChildren(){this.cleared=true;}});
 if(preloaded)installSDK();
 const adapter=createGoogleSatellite({element,apiKey:key,onState:state=>states.push(state)});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();for(const [id,fn] of [...frames]){frames.delete(id);fn();}for(let i=0;i<8;i++)await Promise.resolve();};
 const runTimers=async()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}await flush();};
 const completeSDK=async()=>{installSDK();win[new URL(scripts.at(-1).src).searchParams.get('callback')]();await flush();};
 return {adapter,win,element,scripts,instances,states,frames,timers,flush,runTimers,completeSDK};
}
function leaflet(){
 const emitter=events(),map={center:{lat:51.302,lng:3.221},zoom:17,bearing:270,options:{zoomSnap:.25},views:[],fired:[],details:[]};
 map.getCenter=()=>map.center;map.getZoom=()=>map.zoom;map.getBearing=()=>map.bearing;
 map.on=(names,fn)=>{for(const name of names.split(' '))emitter.addEventListener(name,fn);return map;};
 map.off=(names,fn)=>{for(const name of names.split(' '))emitter.removeEventListener(name,fn);return map;};
 map.fire=(name,detail={})=>{map.fired.push(name);map.details.push({name,...detail});emitter.emit(name,detail);return map;};
 map.setView=(point,zoom,options)=>{map.center={lat:point[0],lng:point[1]};map.zoom=zoom;map.views.push({point,zoom,options});map.fire('move').fire('zoomend');return map;};
 map.setBearing=bearing=>{map.bearing=bearing;map.fire('rotate');return map;};
 return map;
}

test('missing Google key leaves the local map usable without an external request',async()=>{
 const f=fixture({key:'',preloaded:false});f.adapter.bind(leaflet(),true);await f.flush();
 assert.equal(f.adapter.state,'disabled');assert.equal(f.scripts.length,0);assert.equal(f.instances.length,0);
 f.adapter.bind(leaflet(),false);assert.equal(f.adapter.state,'plan');f.adapter.destroy();
});

test('satellite becomes ready only after vector rendering and photographed tiles are ready',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();
 const native=f.instances[0];assert.ok(native);assert.equal(f.adapter.state,'loading');
 assert.equal(native.options.mapTypeId,'satellite');assert.equal(native.options.renderingType,'VECTOR');
 assert.equal(native.options.tilt,0);assert.equal(native.options.isFractionalZoomEnabled,true);
 assert.equal(native.camera.heading,90);assert.equal(native.camera.zoom,17);
 native.kind='UNINITIALIZED';native.emit('tilesloaded');assert.equal(f.adapter.state,'loading');
 native.kind='VECTOR';native.emit('renderingtype_changed');assert.equal(f.adapter.state,'ready');
 assert.equal(map.options.zoomSnap,0);f.adapter.destroy();assert.equal(map.options.zoomSnap,.25);
});

test('searches, GPS movement, retries and source-plan visits reuse one SDK and one native map',async()=>{
 const f=fixture({preloaded:false}),map=leaflet();f.adapter.bind(map,true);await f.flush();assert.equal(f.scripts.length,1);
 const url=new URL(f.scripts[0].src);assert.equal(url.origin,'https://maps.googleapis.com');assert.equal(url.pathname,'/maps/api/js');
 assert.equal(url.searchParams.has('libraries'),false);await f.completeSDK();
 const native=f.instances[0];native.emit('tilesloaded');assert.equal(f.adapter.state,'ready');
 f.adapter.retry();f.adapter.bind(map,true);map.center={lat:51.303,lng:3.222};map.fire('move');await f.flush();
 f.adapter.bind(leaflet(),false);assert.equal(f.adapter.state,'plan');
 f.adapter.bind(leaflet(),true);await f.flush();native.emit('tilesloaded');
 assert.equal(f.scripts.length,1);assert.equal(f.instances.length,1);assert.equal(f.adapter.state,'ready');f.adapter.destroy();
});

test('driving changes coalesce into one camera update with the latest heading and position',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 const before=native.moves.length;
 for(let i=0;i<25;i++){map.center={lat:51.302+i*.00001,lng:3.221+i*.00002};map.bearing=i*7;map.fire('move').fire('rotate');}
 await f.flush();assert.equal(native.moves.length,before+1);assert.deepEqual(native.camera.center,map.center);
 assert.equal(native.camera.heading,(360-map.bearing)%360);map.fire('move');await f.flush();assert.equal(native.moves.length,before+1);f.adapter.destroy();
});

test('native pointer and wheel gestures suspend following and align the independent overlay without feedback',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 const before=native.moves.length;f.element.emit('pointerdown',{target:{closest:()=>null}});
 native.camera={center:{lat:51.305,lng:3.225},zoom:17.137,heading:123,tilt:0};native.emit('bounds_changed');await f.flush();
 assert.ok(map.fired.includes('dragstart'));assert.deepEqual(map.center,native.camera.center);assert.equal(map.zoom,17.137);assert.equal(map.bearing,237);
 assert.deepEqual(map.views.at(-1).options,{animate:false});assert.equal(native.moves.length,before);
 native.camera.center={lat:51.306,lng:3.226};native.emit('idle');assert.deepEqual(map.center,native.camera.center);
 f.element.emit('wheel',{target:{closest:()=>null}});assert.ok(map.fired.includes('zoomstart'));f.adapter.destroy();
});

test('a tap or cancelled pointer without a Google idle event cannot block later GPS or recenter changes',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 for(const ending of ['pointerup','pointercancel']){
  f.element.emit('pointerdown',{pointerId:7,target:{closest:()=>null}});
  native.emit('click',{latLng:{lat:()=>map.center.lat,lng:()=>map.center.lng}});
  f.win.emit(ending,{pointerId:7});
  map.setView([map.center.lat+.001,map.center.lng+.001],17,{animate:false});await f.flush();
  assert.deepEqual(native.camera.center,map.center,ending+' releases a camera that did not move');
 }
 f.adapter.destroy();
});

test('released touch inertia continues to align until idle or bounded quiet settling, and explicit follow wins immediately',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 f.element.emit('pointerdown',{pointerId:1,target:{closest:()=>null}});
 native.camera.center={lat:51.305,lng:3.225};native.emit('bounds_changed');await f.flush();f.win.emit('pointerup',{pointerId:1});
 native.camera.center={lat:51.306,lng:3.226};native.emit('bounds_changed');await f.flush();assert.deepEqual(map.center,native.camera.center,'momentum after finger release stays aligned');
 await f.runTimers();map.setView([51.307,3.227],17,{animate:false});await f.flush();assert.deepEqual(native.camera.center,map.center,'quiet settling releases gesture ownership without idle');
 f.element.emit('pointerdown',{pointerId:2,target:{closest:()=>null}});
 native.camera.center={lat:51.308,lng:3.228};native.emit('bounds_changed');await f.flush();f.win.emit('pointerup',{pointerId:2});
 map.setView([51.302,3.222],18,{animate:false});await f.flush();assert.deepEqual(native.camera.center,{lat:51.302,lng:3.222},'explicit follow overrides outstanding inertia');
 assert.equal(native.camera.zoom,18);assert.equal(f.instances.length,1);f.adapter.destroy();
});

test('wheel gestures that produce no camera change settle without idle and allow subsequent camera updates',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 f.element.emit('wheel',{target:{closest:()=>null}});await f.runTimers();
 map.setView([51.309,3.229],18,{animate:false});await f.flush();assert.deepEqual(native.camera.center,map.center);assert.equal(native.camera.zoom,18);f.adapter.destroy();
});

test('a late SDK response cannot construct a billable map for a detached plan view',async()=>{
 const f=fixture({preloaded:false}),old=leaflet();f.adapter.bind(old,true);await f.flush();f.adapter.bind(leaflet(),false);
 await f.completeSDK();assert.equal(f.instances.length,0);assert.equal(f.adapter.state,'plan');
 const current=leaflet();f.adapter.bind(current,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 const before=native.moves.length;old.fire('move').fire('rotate');await f.flush();assert.equal(native.moves.length,before);f.adapter.destroy();
});

test('native map clicks retain geographic selection for optional saved parking refinements',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.emit('tilesloaded');
 native.emit('click',{latLng:{lat:()=>51.304,lng:()=>3.224},domEvent:{type:'click'}});
 assert.deepEqual(map.details.at(-1),{name:'click',latlng:{lat:51.304,lng:3.224},originalEvent:{type:'click'}});
 f.adapter.bind(leaflet(),false);const count=map.details.length;
 native.emit('click',{latLng:{lat:()=>51.31,lng:()=>3.23}});assert.equal(map.details.length,count);f.adapter.destroy();
});

test('raster, authentication failure and offline state preserve a correctly aligned local fallback',async()=>{
 const f=fixture(),map=leaflet();f.adapter.bind(map,true);await f.flush();const native=f.instances[0];native.kind='RASTER';native.emit('tilesloaded');
 assert.equal(f.adapter.state,'fallback');assert.equal(map.options.zoomSnap,.25);
 native.kind='VECTOR';native.emit('renderingtype_changed');assert.equal(f.adapter.state,'ready');
 f.win.navigator.onLine=false;f.win.emit('offline');assert.equal(f.adapter.state,'fallback');assert.equal(map.options.zoomSnap,.25);
 f.win.navigator.onLine=true;f.win.emit('online');await f.flush();native.emit('tilesloaded');assert.equal(f.adapter.state,'ready');
 f.win.gm_authFailure();assert.equal(f.adapter.state,'fallback');native.emit('tilesloaded');f.adapter.retry();await f.flush();assert.equal(f.adapter.state,'fallback');
 assert.equal(f.instances.length,1);f.adapter.destroy();
});

test('offline startup waits for connectivity and a failed script retries only on explicit request',async()=>{
 const f=fixture({preloaded:false,online:false});f.adapter.bind(leaflet(),true);await f.flush();assert.equal(f.adapter.state,'fallback');assert.equal(f.scripts.length,0);
 f.win.navigator.onLine=true;f.win.emit('online');await f.flush();assert.equal(f.scripts.length,1);
 f.scripts[0].onerror();await f.flush();assert.equal(f.adapter.state,'fallback');assert.equal(f.scripts.length,1);
 f.win.emit('online');await f.flush();assert.equal(f.scripts.length,1,'online is not an automatic failed-script retry loop');
 f.adapter.retry();await f.flush();assert.equal(f.scripts.length,2);await f.completeSDK();f.instances[0].emit('tilesloaded');assert.equal(f.adapter.state,'ready');
 f.adapter.retry();await f.flush();assert.equal(f.scripts.length,2);assert.equal(f.instances.length,1);f.adapter.destroy();
});

test('destroy removes camera and browser listeners and ignores delayed initialization',async()=>{
 const f=fixture({preloaded:false}),map=leaflet();f.adapter.bind(map,true);await f.flush();f.adapter.destroy();await f.completeSDK();
 assert.equal(f.instances.length,0);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
 map.fire('move');f.win.emit('online');await f.flush();assert.equal(f.instances.length,0);
});
