// Google remains the native, visible map. This adapter synchronizes our own
// Leaflet data; it never extracts Google's tiles, content or attribution DOM.
const realms=new WeakMap();
let callbackNumber=0;
const normalize=value=>((value%360)+360)%360;

function sdkRealm(win,doc){
 if(realms.has(win))return realms.get(win);
 const realm={promise:null,subscribers:new Set(),generation:0};
 const previous=win.gm_authFailure;
 win.gm_authFailure=()=>{
  for(const notify of realm.subscribers)notify();
  if(typeof previous==='function')previous();
 };
 realm.load=key=>{
  if(win.google?.maps?.Map)return Promise.resolve(win.google.maps);
  if(realm.promise)return realm.promise;
  const generation=++realm.generation,callback='__portwayGoogleMapsReady'+(++callbackNumber);
  realm.promise=new Promise((resolve,reject)=>{
   const script=doc.createElement('script');
   let settled=false;
   const finish=(error)=>{
    if(settled||generation!==realm.generation)return;settled=true;win.clearTimeout(timeout);
    if(error){script.remove();realm.promise=null;reject(new Error('Google Maps could not load.'));}
    else resolve(win.google.maps);
   };
   // Retain a harmless late callback after network failure: a removed script
   // can still finish, but must never initialize an obsolete map.
   win[callback]=()=>{if(win.google?.maps?.Map)finish(false);else finish(true);};
   const url=new URL('https://maps.googleapis.com/maps/api/js');
   url.search=new URLSearchParams({key,v:'weekly',loading:'async',callback,language:'en',region:'BE',auth_referrer_policy:'origin'});
   script.async=true;script.src=url.href;script.onerror=()=>finish(true);
   const timeout=win.setTimeout(()=>finish(true),20000);
   doc.head.appendChild(script);
  });
  return realm.promise;
 };
 realms.set(win,realm);return realm;
}

function leafletCamera(map){
 try{
  const point=map.getCenter(),zoom=map.getZoom(),bearing=map.getBearing?.()||0;
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||!Number.isFinite(zoom))return null;
  return {center:{lat:point.lat,lng:point.lng},zoom,heading:normalize(-bearing),tilt:0};
 }catch{return null;}
}
function sameCamera(a,b){
 return a&&b&&Math.abs(a.center.lat-b.center.lat)<1e-10&&Math.abs(a.center.lng-b.center.lng)<1e-10&&Math.abs(a.zoom-b.zoom)<1e-7&&Math.abs(a.heading-b.heading)<1e-6;
}

/** One native Google map per page; plans, searches and driving reuse it. */
export function createGoogleSatellite({element,apiKey,onState}){
 const key=typeof apiKey==='string'?apiKey.trim():'';
 const doc=element?.ownerDocument,win=doc?.defaultView;
 if(key&&(!doc||!win))throw new TypeError('Google satellite needs a map element.');
 const realm=key?sdkRealm(win,doc):null;
 let state,bound=null,geographic=false,disposed=false,generation=0,initializingFor=null;
 let native=null,lastCamera=null,tilesSeen=false,authFailed=false,offlineBlocked=false;
 let cameraFrame=null,nativeFrame=null,deadline=null,manual=false,applyingNative=false,savedZoomSnap;
 let gestureTimer=null,gestureMoved=false;
 const activePointers=new Set();
 const nativeListeners=[];
 const online=()=>win?.navigator?.onLine!==false;
 function restoreZoomSnap(){
  if(bound&&savedZoomSnap!==undefined){bound.options.zoomSnap=savedZoomSnap;savedZoomSnap=undefined;}
 }
 function setState(next){
  if(disposed)return;
  if(next!=='ready')finishGesture(false);
  if(next==='ready'&&bound?.options){if(savedZoomSnap===undefined)savedZoomSnap=bound.options.zoomSnap;bound.options.zoomSnap=0;}
  else restoreZoomSnap();
  if(state===next)return;state=next;onState?.(next);
 }
 function clearDeadline(){if(deadline!==null){win.clearTimeout(deadline);deadline=null;}}
 function waitForTiles(){
  clearDeadline();deadline=win.setTimeout(()=>{deadline=null;if(geographic&&state!=='ready')setState('fallback');},15000);
 }
 function evaluateReady(){
  if(disposed||!geographic||!bound||!native||authFailed||!online())return;
  const kind=native.getRenderingType();
  if(kind==='RASTER'){clearDeadline();setState('fallback');return;}
  if(kind==='VECTOR'&&tilesSeen){clearDeadline();setState('ready');}
 }
 function writeCamera(force=false){
  if(disposed||!geographic||!bound||!native||authFailed||!online()||manual)return false;
  const camera=leafletCamera(bound);if(!camera||!force&&sameCamera(camera,lastCamera))return false;
  if(state!=='ready')tilesSeen=false;
  lastCamera=camera;native.moveCamera(camera);return true;
 }
 function scheduleCamera(event={}){
  if(disposed||!geographic||applyingNative)return;
  // Native camera copies are guarded above. Any other Leaflet move is an
  // explicit application command (for example Follow), which owns the camera
  // immediately even if Google's inertial animation has not emitted idle.
  if(manual)finishGesture(false);
  if(cameraFrame!==null)return;
  cameraFrame=win.requestAnimationFrame(()=>{
   cameraFrame=null;if(!native){initialize();return;}
   writeCamera(event.type==='resize');
  });
 }
 function readNativeCamera(){
  if(disposed||!manual||!geographic||!bound||!native||state!=='ready')return;
  const point=native.getCenter(),zoom=native.getZoom(),heading=native.getHeading()||0;
  if(!point||!Number.isFinite(zoom))return;
  const lat=point.lat(),lng=point.lng();if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  const camera={center:{lat,lng},zoom,heading:normalize(heading),tilt:0};
  applyingNative=true;
  try{
   bound.setBearing?.(normalize(-heading));
   const previous=bound.getCenter();
   if(Math.abs(previous.lat-lat)>1e-10||Math.abs(previous.lng-lng)>1e-10||Math.abs(bound.getZoom()-zoom)>1e-7)bound.setView([lat,lng],zoom,{animate:false});
   lastCamera=camera;
  }finally{applyingNative=false;}
 }
 function scheduleNative(){
  if(!manual||disposed)return;
  gestureMoved=true;if(!activePointers.size)settleGesture();
  if(nativeFrame!==null)return;
  nativeFrame=win.requestAnimationFrame(()=>{nativeFrame=null;readNativeCamera();});
 }
 function clearGestureTimer(){if(gestureTimer!==null){win.clearTimeout(gestureTimer);gestureTimer=null;}}
 function finishGesture(sync=true){
  if(sync)readNativeCamera();
  manual=false;gestureMoved=false;activePointers.clear();clearGestureTimer();
  if(nativeFrame!==null){win.cancelAnimationFrame(nativeFrame);nativeFrame=null;}
 }
 function settleGesture(){
  clearGestureTimer();gestureTimer=win.setTimeout(()=>{
   gestureTimer=null;if(!activePointers.size)finishGesture();
  },200);
 }
 function endPointer(event){
  if(!manual)return;
  activePointers.delete(event.pointerId??0);
  if(activePointers.size)return;
  // A simple tap may never produce Google's idle event. Actual drags retain
  // ownership through momentum, bounded by idle or a quiet-camera timeout.
  if(!gestureMoved)finishGesture();else settleGesture();
 }
 function nativeIdle(){readNativeCamera();if(!activePointers.size)finishGesture(false);}
 function beginGesture(event){
  if(disposed||state!=='ready'||!geographic||!bound)return;
  if(event.target?.closest?.('a,button,input,[role="button"]'))return;
  if(!manual)gestureMoved=false;
  manual=true;clearGestureTimer();
  if(event.type==='pointerdown')activePointers.add(event.pointerId??0);
  else if(!activePointers.size)settleGesture();
  if(cameraFrame!==null){win.cancelAnimationFrame(cameraFrame);cameraFrame=null;}
  bound.fire(event.type==='wheel'?'zoomstart':'dragstart');
 }
 function keyboardGesture(event){
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key))beginGesture(event);
 }
 function authenticationFailed(){authFailed=true;clearDeadline();if(geographic)setState('fallback');}
 async function initialize(){
  if(disposed||!geographic||!bound)return;
  if(!key){setState('disabled');return;}
  if(authFailed){setState('fallback');return;}
  if(!online()){offlineBlocked=true;setState('fallback');return;}
  const activeGeneration=generation,activeMap=bound;
  if(initializingFor===activeGeneration)return;initializingFor=activeGeneration;
  setState('loading');
  try{
   const maps=await realm.load(key);
   if(disposed||generation!==activeGeneration||bound!==activeMap||!geographic||!online()||authFailed)return;
   const camera=leafletCamera(bound);if(!camera)return;
   if(!native){
    native=new maps.Map(element,{...camera,mapTypeId:'satellite',renderingType:'VECTOR',isFractionalZoomEnabled:true,disableDefaultUI:true,clickableIcons:false,streetViewControl:false,gestureHandling:'greedy',headingInteractionEnabled:false,tiltInteractionEnabled:false,minZoom:8,maxZoom:19});
    lastCamera=camera;
    nativeListeners.push(native.addListener('tilesloaded',()=>{tilesSeen=true;evaluateReady();}));
    nativeListeners.push(native.addListener('renderingtype_changed',evaluateReady));
    nativeListeners.push(native.addListener('bounds_changed',scheduleNative));
    nativeListeners.push(native.addListener('idle',nativeIdle));
    nativeListeners.push(native.addListener('click',event=>{
     if(disposed||!geographic||!bound||state!=='ready'||!event.latLng)return;
     bound.fire('click',{latlng:{lat:event.latLng.lat(),lng:event.latLng.lng()},originalEvent:event.domEvent});
    }));
   }else writeCamera();
   evaluateReady();if(state!=='ready'&&state!=='fallback')waitForTiles();
  }catch{if(!disposed&&generation===activeGeneration&&geographic)setState('fallback');}
  finally{if(initializingFor===activeGeneration)initializingFor=null;}
 }
 function cancelFrames(){
  if(cameraFrame!==null){win.cancelAnimationFrame(cameraFrame);cameraFrame=null;}
  if(nativeFrame!==null){win.cancelAnimationFrame(nativeFrame);nativeFrame=null;}
 }
 function detach(){
  restoreZoomSnap();bound?.off('move rotate zoomend resize',scheduleCamera);bound?.off('unload',unload);
  finishGesture(false);bound=null;clearDeadline();if(win)cancelFrames();
 }
 function unload(){detach();geographic=false;generation++;setState('plan');}
 function bind(map,isGeographic){
  if(disposed)return;
  if(bound===map&&geographic===Boolean(isGeographic)){if(isGeographic&&state==='ready')scheduleCamera();return;}
  detach();generation++;bound=map;geographic=Boolean(isGeographic);
  if(!geographic){setState('plan');return;}
  if(!key){setState('disabled');return;}
  bound.on('move rotate zoomend resize',scheduleCamera);bound.on('unload',unload);initialize();
 }
 function retry(){
  if(disposed||!geographic||!key)return;
  offlineBlocked=false;initialize();
 }
 function wentOffline(){
  if(!geographic)return;offlineBlocked=true;finishGesture(false);cancelFrames();clearDeadline();setState('fallback');
 }
 function wentOnline(){if(offlineBlocked){offlineBlocked=false;retry();}}
 function destroy(){
  if(disposed)return;detach();disposed=true;generation++;
  realm?.subscribers.delete(authenticationFailed);
  win?.removeEventListener('offline',wentOffline);win?.removeEventListener('online',wentOnline);
  win?.removeEventListener('pointerup',endPointer,true);win?.removeEventListener('pointercancel',endPointer,true);
  element?.removeEventListener('pointerdown',beginGesture,true);element?.removeEventListener('wheel',beginGesture,true);element?.removeEventListener('keydown',keyboardGesture,true);
  for(const listener of nativeListeners)listener.remove();
  if(native)element.replaceChildren();native=null;
 }
 if(key){
  realm.subscribers.add(authenticationFailed);
  win.addEventListener('offline',wentOffline);win.addEventListener('online',wentOnline);
  win.addEventListener('pointerup',endPointer,{capture:true,passive:true});win.addEventListener('pointercancel',endPointer,{capture:true,passive:true});
  element.addEventListener('pointerdown',beginGesture,{capture:true,passive:true});element.addEventListener('wheel',beginGesture,{capture:true,passive:true});element.addEventListener('keydown',keyboardGesture,true);
 }
 setState('disabled');
 return {bind,retry,destroy,get state(){return state;}};
}
