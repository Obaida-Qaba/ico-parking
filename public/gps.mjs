import {buildGraph,distanceMetres,parkingKey,validPin} from './navigation.mjs';
import {resolveDestination} from './destinations.mjs';
import {createCourseTracker,screenHeading} from './heading.mjs';
import {nextInstruction} from './guidance.mjs';
import {createParkingLabels} from './parking-labels.mjs';
import {createRoadMap} from './road-map.mjs';
import {createRouteClient} from './route-client.mjs';
import {createPositionMotion} from './position-motion.mjs';
import {panDrivingMap} from './map-performance.mjs';

export function createGPS({getMap,getSelected,getCatalogue,showStreet,toast,dialog,onPinChanged,onLocation,onLocationState,onUnmapped,escape:esc}) {
  let watch=null,fix=null,layer=null,boundMap=null,street=false,following=true,active=null,graph=null,graphPromise=null,route=null,pending=null,lastRouteAt=0;
  const course=createCourseTracker();
  let headingUp=true,adjustingCamera=false;
  let movingCamera=false;
  let cameraReady=false,headingCommand=null;
  let parkingLabels=null;
  let quietErrors=false;
  let accuracyCircle=null,positionMarker=null,targetMarker=null,routeHalo=null,routeLine=null,arrivalMarker=null;
  let markerMode=null,accuracyState=null,targetCode=null,routeGeometry=null;
  const routeClient=createRouteClient();
  const positionMotion=createPositionMotion({onFrame:()=>{drawPosition();followView();}});
  let pins={};
  try{const value=JSON.parse(localStorage.getItem('portway-gps-pins')||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))pins=Object.fromEntries(Object.entries(value).filter(([,p])=>validPin(p)));}catch{}
  const $=id=>document.getElementById(id);
  function pinFor(hit){return resolveDestination(hit,pins,getCatalogue?.());}
  function label(hit){return hit.parking.code+(hit.line?' · line '+hit.line:'');}
  async function loadGraph(){
    if(graph)return graph;
    if(!graphPromise)graphPromise=fetch('./roads.json').then(r=>{if(!r.ok)throw Error('roads');return r.json();}).then(data=>{graph=buildGraph(data);return graph;}).catch(e=>{graphPromise=null;throw e;});
    return graphPromise;
  }
  function status(message){
    $('gps-text').textContent=message;
    const healthy=message.startsWith('GPS live'),off=message.startsWith('GPS stopped')||message==='GPS is off';
    $('gps-summary').hidden=off;
    $('gps-summary').textContent=healthy?'GPS':message.startsWith('Connecting')?'GPS…':'GPS';
    $('gps-summary').title=message;$('gps-summary').setAttribute('aria-label',message);
    $('gps-summary').classList.toggle('weak',!healthy);
    $('gps-status-alert').hidden=healthy||off||message.startsWith('Connecting');
    $('gps-status-alert').textContent=message;
  }
  function navigationLayout(value){
    document.body.classList.toggle('navigating',value);
    $('navigation-panel').hidden=!value;
    requestAnimationFrame(()=>getMap()?.invalidateSize({pan:false}));
  }
  function setPanel(visible){$('gps-panel').hidden=!visible;}
  function save(hit,pin){
    const key=parkingKey(hit),next={...pins,[key]:pin};
    try{localStorage.setItem('portway-gps-pins',JSON.stringify(next));pins=next;onPinChanged(hit);return true;}
    catch{toast('The browser could not save this GPS point. Free storage or allow site storage and try again.');return false;}
  }
  function usable(){return fix&&Date.now()-fix.timestamp<15000&&fix.accuracy<=35;}
  function arrowAngle(){return headingUp&&following?0:screenHeading(course.heading,getMap()?.getBearing?.()||0);}
  function updateArrow(){const arrow=document.querySelector('.driving-arrow');if(arrow)arrow.style.transform=`rotate(${arrowAngle()}deg)`;}
  function anchorAhead(){
    if(adjustingCamera||!street||!following||!usable()||watch===null)return;
    const m=getMap();if(m!==boundMap)return;
    const visual=positionMotion.position||fix;
    const yFraction=headingUp&&Number.isFinite(course.heading) ? .62 : .5;
    const projected=m.project([visual.lat,visual.lon]).subtract(m.getPixelOrigin());
    const size=m.getSize(),position=m.layerPointToContainerPoint(projected),target=L.point(size.x/2,size.y*yFraction),offset=position.subtract(target);
    if(Math.abs(offset.x)<.01&&Math.abs(offset.y)<.01)return;
    adjustingCamera=true;panDrivingMap(m,offset);adjustingCamera=false;
  }
  function followView(){
    if(!street||!following||!usable()||watch===null||getMap()!==boundMap)return;
    const m=getMap();
    movingCamera=true;
    try{
    if(headingUp&&Number.isFinite(course.heading)){if(headingCommand!==course.heading||!m.getHeadingUp()){m.setHeading(course.heading,{ease:.3,deadzone:.8});headingCommand=course.heading;}}
    else{m.stopHeadingUp();if(!headingUp)m.setBearing(0);}
    if(!cameraReady||m.getZoom()<17){const visual=positionMotion.position||fix;m.setView([visual.lat,visual.lon],Math.max(m.getZoom(),17),{animate:false});cameraReady=true;}
    anchorAhead();updateArrow();
    $('north-up').setAttribute('aria-pressed',String(!headingUp));
    $('north-up').classList.toggle('active',!headingUp);
    }finally{movingCamera=false;}
  }
  function drawPosition(){
    if(!street||!layer||boundMap!==getMap())return;
    const move=(item,position)=>{const previous=item.getLatLng();if(previous.lat!==position[0]||previous.lng!==position[1])item.setLatLng(position);};
    if(fix){
      const visual=positionMotion.position||fix;
      const position=[visual.lat,visual.lon],stale=Date.now()-fix.timestamp>15000;
      const color=stale?'#8c969b':'#1683e8';
      if(!accuracyCircle)accuracyCircle=L.circle(position,{radius:fix.accuracy,color,weight:1,fillOpacity:.09,interactive:false}).addTo(layer);
      else{move(accuracyCircle,position);if(accuracyCircle.getRadius()!==fix.accuracy)accuracyCircle.setRadius(fix.accuracy);if(accuracyState!==stale)accuracyCircle.setStyle({color});}
      accuracyState=stale;
      const hasCourse=Number.isFinite(course.heading);
      const mode=hasCourse?'arrow':'dot';
      if(!positionMarker||markerMode!==mode){
        const html=hasCourse?`<svg class="driving-arrow" viewBox="0 0 32 38" aria-hidden="true"><path d="M16 3 29 32 16 26 3 32Z" fill="#1683e8" stroke="white" stroke-width="2.5" stroke-linejoin="round"/></svg>`:'';
        const icon=L.divIcon({className:'gps-dot'+(hasCourse?' heading-arrow':''),html,iconSize:hasCourse?[32,38]:[18,18],iconAnchor:hasCourse?[16,19]:[9,9]});
        if(positionMarker)positionMarker.setIcon(icon);
        else positionMarker=L.marker(position,{icon}).addTo(layer);
        markerMode=mode;
      }
      move(positionMarker,position);
      const element=positionMarker.getElement();element.classList.toggle('stale',stale);element.title=stale?'Last GPS position · signal stale':'Your live GPS position';updateArrow();
    }
  }
  function draw(){
    if(!street||!layer||boundMap!==getMap())return;
    drawPosition();
    const move=(item,position)=>{const previous=item.getLatLng();if(previous.lat!==position[0]||previous.lng!==position[1])item.setLatLng(position);};
    const hit=active||getSelected(),pin=pinFor(hit);
    const display=pin?.automatic&&validPin(pin.labelPosition)?pin.labelPosition:pin;
    parkingLabels?.update({activeKey:hit?parkingKey({...hit,line:null}).replace(/:parking$/,''):null,saved:pins,gpsPosition:fix,destination:display});
    if(display){
      const position=[display.lat,display.lon],code=hit.parking.code;
      if(!targetMarker)targetMarker=L.marker(position,{icon:L.divIcon({className:'gps-target',html:`<span>${esc(code)}</span>`,iconSize:[0,0]})}).addTo(layer);
      else{move(targetMarker,position);if(targetCode!==code)targetMarker.getElement().querySelector('span').textContent=code;}
      targetCode=code;targetMarker.getElement().title=label(hit)+(display!==pin?' · parking area':pin.automatic?' · mapped parking approach':' · saved GPS point');
    }else if(targetMarker){layer.removeLayer(targetMarker);targetMarker=null;targetCode=null;}
    if(active&&route?.available&&usable()){
      if(!routeLine){
        routeHalo=L.polyline(route.points,{color:'#fff',weight:10,opacity:.95,interactive:false}).addTo(layer);
        routeLine=L.polyline(route.points,{color:'#1478e9',weight:6,opacity:1,className:'road-route',interactive:false}).addTo(layer);
        arrivalMarker=L.circleMarker(route.points.at(-1),{radius:5,color:'#fff',weight:2,fillColor:'#1478e9',fillOpacity:1,className:'route-endpoint',interactive:false}).addTo(layer);
      }else if(routeGeometry!==route){routeHalo.setLatLngs(route.points);routeLine.setLatLngs(route.points);move(arrivalMarker,route.points.at(-1));}
      routeGeometry=route;
    }else if(routeLine){
      for(const item of [routeHalo,routeLine,arrivalMarker])layer.removeLayer(item);
      routeHalo=routeLine=arrivalMarker=routeGeometry=null;
    }
  }
  async function calculate(force=false){
    if(!active||!fix||watch===null)return;
    if(!usable()){
      route=null;$('navigation-instruction').textContent=fix.accuracy>35?'Waiting for more accurate GPS':'GPS signal lost · route paused';$('navigation-distance').textContent='—';draw();return;
    }
    if(!force&&Date.now()-lastRouteAt<2000){draw();return;}lastRouteAt=Date.now();
    const hit=active,pin=pinFor(hit);if(!pin)return;
    try{
      const g=await loadGraph();if(active!==hit||watch===null)return;if(!usable())return calculate(true);
      routeClient.loadGraph(g);
      const firstRoute=!route?.available,calculationFix=fix;
      const travelHeading=Number.isFinite(calculationFix.speed)&&calculationFix.speed<.7?null:course.heading;
      const computed=await routeClient.route([calculationFix.lat,calculationFix.lon],[pin.lat,pin.lon],{maxSnap:50,heading:travelHeading,accuracy:calculationFix.accuracy});
      if(!computed||active!==hit||watch===null)return;
      if(fix!==calculationFix||!usable())return calculate(true);
      route=computed;
      $('navigation-destination').textContent=label(hit);
      if(!route.available){$('navigation-instruction').textContent='No connected road route';$('navigation-detail').textContent=route.reason;$('navigation-distance').textContent='—';}
      else{
        $('navigation-distance').textContent=route.distance>=1000?(route.distance/1000).toFixed(1)+' km':Math.round(route.distance)+' m';
        const near=distanceMetres([fix.lat,fix.lon],[pin.lat,pin.lon])<=Math.max(12,fix.accuracy);
        $('navigation-instruction').textContent=near?(pin.automatic?'You are near the parking approach':'You are near your saved destination'):nextInstruction(route.points,{heading:travelHeading});
        const area=pin.scope==='parking-group-approach';
        const targetNote=pin.automatic?`Route to ${hit.parking.code} parking ${area?'area ':''}approach.${area?' Shared area access; exact entrance is not mapped.':''}${hit.line?' Line '+hit.line+' remains a reference inside the parking.':''}`:(!pin.exactLine&&hit.line?`Route to ${hit.parking.code} parking; line ${hit.line} is not separately positioned.`:'Route follows mapped roads.');
        $('navigation-detail').textContent=targetNote+(route.endOffset>10?` Road ends ${Math.round(route.endOffset)} m from the point.`:'')+' Follow current terminal signs.';
      }
      draw();
      if(firstRoute&&route.available&&street&&following)followView();
    }catch{if(active!==hit||watch===null)return;$('navigation-instruction').textContent='Road data unavailable';$('navigation-detail').textContent='Reconnect once to download the local road network. GPS tracking can still continue.';}
  }
  function onFix(pos){
    if(watch===null)return;
    const c=pos.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<0)return;
    const timestamp=pos.timestamp||Date.now();if(fix&&timestamp<fix.timestamp)return;
    const interval=fix?timestamp-fix.timestamp:1000;
    fix={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,heading:c.heading,speed:c.speed,timestamp};
    course.update(fix);
    onLocation?.(fix);
    const speed=Number.isFinite(c.speed)?` · ${Math.round(c.speed*3.6)} km/h`:'';
    status(`GPS live · ±${Math.round(c.accuracy)} m${speed}`);
    $('gps-panel').classList.toggle('weak',c.accuracy>35);$('gps-toggle').textContent='Stop GPS';
    if(c.accuracy>35){$('gps-summary').classList.add('weak');$('gps-status-alert').hidden=false;$('gps-status-alert').textContent='Weak GPS signal · waiting for a more accurate position';}
    const animate=street&&fix.accuracy<=35&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    positionMotion.set(fix,{duration:animate?Math.max(300,Math.min(900,interval*.8)):0});
    followView();
    draw();calculate();
  }
  function onError(err){
    const messages={1:'GPS permission denied. Allow location for this site in browser settings.',2:'GPS position unavailable. Waiting for a location signal.',3:'GPS timed out. Waiting for a new location update.'};
    status(messages[err.code]||'GPS error');if(!quietErrors)toast(messages[err.code]||'Could not read GPS.');
    if(quietErrors&&!active)$('gps-status-alert').hidden=true;
    onLocationState?.(err.code===1?'denied':'unavailable');
    if(err.code===1){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;routeClient.cancel();positionMotion.cancel();getMap()?.stopHeadingUp?.();$('gps-toggle').textContent='Start GPS';route=null;if(active)$('navigation-instruction').textContent='Allow GPS to navigate';draw();}
  }
  function start({quiet=false}={}){
    quietErrors=quiet;
    document.body.classList.add('gps-active');
    setPanel(true);
    if(!window.isSecureContext){status('GPS requires HTTPS');onLocationState?.('unsupported');if(!quiet)toast('Open the HTTPS GitHub Pages link on your phone for GPS.');return;}
    if(!navigator.geolocation){status('GPS is not supported in this browser');onLocationState?.('unsupported');return;}
    following=true;headingUp=true;showStreet();
    if(watch!==null){followView();draw();return;}
    status('Connecting to live GPS…');onLocationState?.('locating');watch=-1;
    const id=navigator.geolocation.watchPosition(onFix,onError,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
    if(watch!==null)watch=id;
    $('gps-toggle').textContent=watch===null?'Start GPS':'Stop GPS';$('follow-gps').hidden=false;
    loadGraph().catch(()=>{});
  }
  function stop(){
    document.body.classList.remove('gps-active');
    if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;active=null;route=null;routeClient.cancel();positionMotion.cancel();if(fix)positionMotion.set(fix,{duration:0});getMap()?.stopHeadingUp?.();
    onLocationState?.('stopped');
    $('gps-toggle').textContent='Start GPS';navigationLayout(false);status(fix?'GPS stopped · last position shown':'GPS is off');draw();
  }
  function navigate(hit){
    if(!hit){toast('Choose a parking first.');return;}
    const pin=pinFor(hit);
    if(!pin){clearRoute();onUnmapped?.(hit);return;}
    routeClient.cancel();active=hit;route=null;navigationLayout(true);$('map-options-panel').hidden=true;$('map-options').setAttribute('aria-expanded','false');$('navigation-destination').textContent=label(hit);$('navigation-instruction').textContent='Waiting for live GPS…';$('navigation-distance').textContent='—';$('navigation-detail').textContent=pin.automatic?'Using the built-in parking approach. The route follows mapped roads.':'Using your saved destination point. The route follows mapped roads.';
    start();calculate(true);
  }
  function setup(hit){
    const name=label(hit),existing=pinFor(hit);
    dialog(`<h2>${existing?'Destination location':'Locate '+esc(name)}</h2><p>${existing?(existing.automatic?'A built-in road approach is available for this parking. You can optionally refine it with an on-site GPS measurement.':'This destination has a GPS point saved on this device.'):'This reference is not yet in the built-in destination catalogue. You can optionally add its actual location here.'}</p>${existing?`<p>${esc(name)}<br>${existing.lat.toFixed(6)}, ${existing.lon.toFixed(6)}<br>${existing.automatic?'Matched from the ICO terminal plan to the geographic road layout':existing.method==='gps'?'Recorded on site · accuracy ±'+Math.round(existing.accuracy)+' m':'Point selected on the geographic road map'}</p>`:''}<button class="primary" id="capture-parking">I’m at ${esc(name)} · save GPS</button><p>Use this while you are at the named parking${hit.line?' and line '+esc(hit.line):''}. The point is stored on this device.</p><button class="secondary" id="pick-parking">Choose its location on the GPS map</button>${existing&&!existing.automatic?'<button class="inline-button" id="forget-pin" style="margin-top:20px">Remove saved point</button>':''}`);
    $('capture-parking').onclick=()=>capture(hit);
    $('pick-parking').onclick=()=>{
      $('info-dialog').close();pending=hit;showStreet();setPanel(true);status(`Tap the real location of ${name} on the GPS map`);$('cancel-pin').hidden=false;
      if(fix)getMap().setView([fix.lat,fix.lon],18);else getMap().setView(hit.map.id==='north'?[51.322,3.21]:hit.map.id==='nissan'?[51.334,3.2]:[51.300,3.235],16);
    };
    if(existing&&!existing.automatic)$('forget-pin').onclick=()=>{const next={...pins};delete next[parkingKey(hit)];if(!existing.exactLine&&hit.line)delete next[parkingKey({...hit,line:null})];try{localStorage.setItem('portway-gps-pins',JSON.stringify(next));pins=next;if(active&&parkingKey(active)===parkingKey(hit)){active=null;route=null;navigationLayout(false);}onPinChanged(hit);$('info-dialog').close();draw();toast('Saved GPS point removed.');}catch{toast('Could not update saved points.');}};
  }
  function capture(hit){
    if(!window.isSecureContext||!navigator.geolocation){toast('Saving GPS requires the HTTPS app and location permission.');return;}
    const button=$('capture-parking');button.disabled=true;button.textContent='Reading accurate GPS…';
    navigator.geolocation.getCurrentPosition(pos=>{
      if(pos.coords.accuracy>25){button.disabled=false;button.textContent='Try GPS again';toast(`GPS accuracy is ±${Math.round(pos.coords.accuracy)} m. Wait for ±25 m or better before saving this destination.`);return;}
      const pin={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,method:'gps',savedAt:new Date().toISOString()};
      if(!validPin(pin)){button.disabled=false;return;}
      if(save(hit,pin)){ $('info-dialog').close();toast(`${label(hit)} GPS location saved on this device.`);navigate(hit); }
      else{button.disabled=false;button.textContent='Try saving again';}
    },err=>{button.disabled=false;button.textContent='Try GPS again';toast(err.code===1?'Location permission was denied.':'Could not capture an accurate GPS location. Try again outdoors.');},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  function bind(m,isStreet){
    positionMotion.cancel();cameraReady=false;headingCommand=null;
    boundMap=m;street=isStreet;layer=isStreet?L.layerGroup().addTo(m):null;
    accuracyCircle=positionMarker=targetMarker=routeHalo=routeLine=arrivalMarker=null;
    markerMode=accuracyState=targetCode=routeGeometry=null;
    parkingLabels=isStreet?createParkingLabels(m,getCatalogue?.()):null;
    $('north-up').hidden=!isStreet;
    if(!isStreet)return;
    m.on('dragstart',()=>{following=false;m.stopHeadingUp();updateArrow();$('follow-gps').classList.remove('following');});
    m.on('zoomstart',()=>{if(movingCamera||adjustingCamera)return;following=false;m.stopHeadingUp();updateArrow();$('follow-gps').classList.remove('following');});
    m.on('rotate',()=>{anchorAhead();updateArrow();});
    m.on('resize',()=>requestAnimationFrame(()=>{if(getMap()===m)followView();}));
    m.on('click',event=>{
      if(!pending)return;
      const hit=pending,pin={lat:event.latlng.lat,lon:event.latlng.lng,accuracy:null,method:'map',savedAt:new Date().toISOString()};
      dialog(`<h2>Use this point for ${esc(label(hit))}?</h2><p>${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)}</p><p>Choose the actual parking or line location. This point comes from your map selection; it is not supplied by ICO.</p><button class="primary" id="confirm-map-pin">Save this destination point</button>`);
      $('confirm-map-pin').onclick=()=>{if(save(hit,pin)){pending=null;$('cancel-pin').hidden=true;$('info-dialog').close();navigate(hit);}};
    });
    if(fix)positionMotion.set(fix,{duration:0});
    draw();followView();
    loadGraph().then(g=>{if(boundMap===m&&street){createRoadMap(m,g);draw();}}).catch(()=>{});
  }
  function clearRoute(){routeClient.cancel();active=null;route=null;pending=null;$('cancel-pin').hidden=true;navigationLayout(false);draw();}
  function fitRoute(){if(!street||!active||!route?.available)return false;following=false;getMap().stopHeadingUp();getMap().fitBounds(L.latLngBounds(route.points),{paddingTopLeft:[28,85],paddingBottomRight:[75,165],maxZoom:18,animate:false});updateArrow();return true;}
  $('gps-toggle').onclick=()=>watch===null?start():stop();
  $('follow-gps').onclick=()=>{following=true;headingUp=true;$('follow-gps').classList.add('following');showStreet();followView();};
  $('north-up').onclick=()=>{headingUp=false;getMap().stopHeadingUp();getMap().setBearing(0);$('north-up').setAttribute('aria-pressed','true');$('north-up').classList.add('active');if(following)followView();updateArrow();};
  $('stop-navigation').onclick=clearRoute;
  $('cancel-pin').onclick=()=>{pending=null;$('cancel-pin').hidden=true;status(watch===null?'GPS is off':'GPS tracking active');};
  const timer=setInterval(()=>{
    if(watch!==null&&fix&&Date.now()-fix.timestamp>15000){status('GPS signal lost · last position shown');onLocationState?.('stale');if(active){route=null;$('navigation-instruction').textContent='GPS signal lost · route paused';draw();}}
  },3000);
  window.addEventListener('pagehide',stop);
  return {start,stop,bind,navigate,setup,pinFor,draw,loadGraph,clearRoute,fitRoute};
}
