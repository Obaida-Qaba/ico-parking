import { normalizeCode, parseDestination, searchParkings } from './core.mjs';
import { createGPS } from './gps.mjs';

const paths = {
  search:'m21 21-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrow:'M5 12h14 m-5-5 5 5-5 5', 'arrow-up':'M6 18 18 6 M6 6h12v12',
  layers:'m12 3 10 6-10 6L2 9 10 3 M2 14l10 6 10-6 M2 18l10 6 10-6',
  globe:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0 M2 12h20 M12 2c6 5 6 15 0 20-6-5-6-15 0-20',
  locate:'M12 2v3 m0 14v3 M2 12h3 m14 0h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  plus:'M12 5v14 M5 12h14', minus:'M5 12h14', expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
  external:'M14 3h7v7 M21 3 10 14 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  info:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0 M12 11v6 M12 7h.01',
  route:'M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4 M19 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4 M5 7v8a4 4 0 0 0 4 4h8 M19 17V9a4 4 0 0 0-4-4h-4',
  close:'m6 6 12 12 M6 18 18 6', check:'m5 12 4 4L19 6', clock:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0 M12 6v6l4 2', share:'M12 16V3 M7 8l5-5 5 5 M5 13v7h14v-7'
};
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] ?? paths.pin}"/></svg>`; }
function icons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>el.outerHTML=icon(el.dataset.icon)); }
icons();
let atlas, current, map, mapBounds, nodes, selectedLayers, selected=null, street=false, currentImage, fitZoom=0;
let recents = [];
try { const saved=JSON.parse(localStorage.getItem('portway-recents') || '[]'); recents=Array.isArray(saved)?saved.filter(x=>x && typeof x.code==='string' && typeof x.map==='string' && (x.line===null || /^[1-9]\d{0,3}$/.test(x.line))).slice(0,5):[]; } catch {}
let toastTimer, debounce;
const resizeObserver=new ResizeObserver(()=>map?.invalidateSize());
resizeObserver.observe($('map'));
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500); }
function dialog(html) { $('dialog-content').innerHTML=html; if (!$('info-dialog').open) $('info-dialog').showModal(); }
const gps=createGPS({getMap:()=>map,getSelected:()=>selected,showStreet:()=>{if(!street){street=true;renderMap();}},toast,dialog,escape:esc,onPinChanged:()=>{if(selected)renderGPSActions();}});
$('close-dialog').onclick=()=>$('info-dialog').close();
$('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')) {const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

function toLatLng(point) {return [current.height-point.y, point.x];}
function setViewButtons() {
  $('plan-view').classList.toggle('active',!street);$('street-view').classList.toggle('active',street);
  $('plan-view').setAttribute('aria-pressed',String(!street));$('street-view').setAttribute('aria-pressed',String(street));
  $('street-notice').hidden=!street;
}
function fit() {
  if(street) {map.fitBounds([[51.265,3.18],[51.33,3.265]],{padding:[35,100]});return;}
  const mobile=matchMedia('(max-width:680px)').matches;
  map.fitBounds(mapBounds,{paddingTopLeft:mobile?[15,90]:[25,125],paddingBottomRight:mobile?[55,130]:[65,185],animate:false});
  fitZoom=map.getZoom();updateNodes();
}
function renderMap(next=current, focus=null) {
  current=next; map?.remove();
  document.querySelector('.map-workspace').classList.toggle('street-mode',street);
  if (currentImage) {currentImage.onload=null;currentImage.onerror=null;}
  setViewButtons();
  $('map-title').textContent=street?'Port of Zeebrugge':current.name;
  $('map-subtitle').textContent=street?'GPS road map · local road network':`${current.parkings.length} parking references · ${current.historical?'older source plan':'ICO source plan'}`;
  $('map-date').textContent=street?'© OpenStreetMap contributors · mapped roads':`Plan: ${current.date}`;
  document.querySelectorAll('.map-card').forEach(b=>{b.classList.toggle('active',b.dataset.map===current.id);b.setAttribute('aria-pressed',String(b.dataset.map===current.id));});
  map=L.map('map',{crs:street?L.CRS.EPSG3857:L.CRS.Simple,zoomControl:false,minZoom:street?8:-5,maxZoom:street?19:2,zoomSnap:.25,zoomDelta:.5,attributionControl:street});
  nodes=L.layerGroup().addTo(map);selectedLayers=L.layerGroup().addTo(map);
    $('map-loading').hidden=street;
  if(street) {
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
    let warned=false;tiles.on('tileerror',()=>{if(!warned){toast('Street tiles need an internet connection. The terminal plans remain available offline.');warned=true;}});
    for(const t of [{name:'ICO · Zuidelijke Insteek',pos:[51.2946906,3.2413519]},{name:'ICO · Noordelijke Insteek',pos:[51.3218156,3.2131578]}]) {
      L.marker(t.pos,{icon:L.divIcon({className:'terminal-dot',iconSize:[16,16]}),title:t.name+' · approximate terminal location'}).addTo(map).bindTooltip(t.name+' · approximate terminal location');
    }
    fit();
  } else {
    mapBounds=[[0,0],[current.height,current.width]];
    map.setMaxBounds([[-current.height,-current.width],[current.height*2,current.width*2]]);
    fit();
    const image=L.imageOverlay(current.image,mapBounds,{interactive:false,alt:`${current.name} official source plan, ${current.date}`}).addTo(map);
    image.on('load',()=>{$('map-loading').hidden=true;});
    image.on('error',()=>{$('map-loading').textContent='Map could not load. Reconnect and reload to save it offline.';});
    currentImage=image.getElement();
    if(currentImage?.complete && currentImage.naturalWidth) $('map-loading').hidden=true;
    map.on('zoomend',updateNodes);fit();
    if(focus) highlight(focus);
  }
  gps.bind(map,street);
}
function updateNodes() {
  if(street || !nodes) return;
  nodes.clearLayers();
  const all=map.getZoom()>fitZoom+.6;
  const popular=['H61','H26','HA1','CH1','H60','A01','VA'];
  for(const parking of current.parkings) {
    if(!all && !popular.includes(parking.code))continue;
    for(const point of parking.points) {
      L.circleMarker(toLatLng(point),{radius:all?4:5,color:'#fff',weight:1.5,fillColor:'#244e47',fillOpacity:.85,bubblingMouseEvents:false})
        .addTo(nodes).bindTooltip(parking.code,{className:'parking-tip',direction:'top',offset:[0,-4]})
        .on('click',()=>choose({map:current,parking,line:null}));
    }
  }
}
function highlight(parking) {
  selectedLayers.clearLayers();
  const points=parking.points ?? [parking];
  for(const point of points) {
    L.circle(toLatLng(point),{radius:Math.max(18,current.width*.009),className:'destination-ring'}).addTo(selectedLayers);
    L.marker(toLatLng(point),{keyboard:false,interactive:false,icon:L.divIcon({className:'destination-marker',html:`<span class="destination-pin"><strong>${esc(parking.code)}</strong></span>`,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(selectedLayers);
  }
  const center=toLatLng(points[0]);
  const targetZoom=Math.min(1,fitZoom+1.9);
  map.setView(center,targetZoom,{animate:false});
}
function renderRecents() {
  $('recents-section').hidden=!recents.length;
  $('recent-list').replaceChildren();
  recents.forEach(item=>{
    const m=atlas.maps.find(m=>m.id===item.map),p=m?.parkings.find(p=>p.code===item.code);if(!m||!p)return;
    const b=document.createElement('button');b.className='recent-row';
    b.innerHTML=`<span class="result-icon">${icon('clock')}</span><span><strong>${esc(p.code)}${item.line?` · line ${esc(item.line)}`:''}</strong><small>${esc(m.name)}</small></span>${icon('arrow')}`;
    b.onclick=()=>choose({map:m,parking:p,line:item.line});$('recent-list').append(b);
  });
}
function saveRecent(hit) {
  recents=[{map:hit.map.id,code:hit.parking.code,line:hit.line ?? null},...recents.filter(r=>!(r.map===hit.map.id&&r.code===hit.parking.code&&r.line===(hit.line??null)))].slice(0,5);
  try {localStorage.setItem('portway-recents',JSON.stringify(recents));} catch {}
  renderRecents();
}
function choose(hit, remember=true) {
  clearTimeout(debounce);
  gps.clearRoute();
  document.body.classList.add('has-destination');
  selected=hit;street=false;
  $('search-results').hidden=true;$('welcome-content').hidden=true;
  $('destination').value=hit.parking.code;$('line').value=hit.line??'';
  renderMap(hit.map,hit.parking);
  $('destination-card').hidden=false;
  $('destination-card').innerHTML=`<div class="destination-top"><div><div class="destination-kicker">YOUR DESTINATION</div><div class="destination-code">${esc(hit.parking.code)}</div></div><button class="icon-button" id="clear-destination" aria-label="Clear destination">${icon('close')}</button></div>
    ${hit.line?`<div class="destination-line">Line ${esc(hit.line)} <span style="font-size:10px;color:#829176">· reference saved</span></div>`:''}
    <div class="destination-meta">${esc(hit.map.name)}<br><span class="destination-badge">${icon('check')} Parking located on source plan</span></div>
    <div class="destination-actions"><button class="primary" id="route-button">${icon('route')} Route coverage ${icon('arrow')}</button><button class="secondary" id="share-button" aria-label="Share destination">${icon('share')}</button></div>
    <div class="line-note">${hit.line?`Line ${esc(hit.line)} isn’t positioned on this source plan. The marker shows the parking label.`:'The marker shows a parking label, not a verified entrance. Internal road navigation is not available yet.'}${hit.parking.points.length>1?' This reference appears in multiple places on the plan.':''}</div>
    <button class="inline-button destination-source" id="destination-source">${icon('info')} View source & coverage</button>`;
  $('clear-destination').onclick=clearDestination;
  $('route-button').onclick=()=>gps.navigate(selected);
  $('share-button').onclick=shareDestination;
  $('destination-source').onclick=showSource;
  renderGPSActions();
  if(remember)saveRecent(hit);
  const url=new URL(location.href);url.search='';url.searchParams.set('map',hit.map.id);url.searchParams.set('parking',hit.parking.code);if(hit.line)url.searchParams.set('line',hit.line);history.replaceState(null,'',url);
}
function renderGPSActions(){
  if(!selected)return;
  const pin=gps.pinFor(selected);
  $('route-button').innerHTML=`${icon('route')} ${pin?'Start GPS route':'Set GPS destination'} ${icon('arrow')}`;
  let button=$('save-gps-button');
  if(!button){button=document.createElement('button');button.id='save-gps-button';button.className='inline-button destination-source';$('destination-card').append(button);}
  button.textContent=pin?'Manage saved GPS point':'Save this parking’s GPS location';button.onclick=()=>gps.setup(selected);
  if(pin){const note=$('destination-card').querySelector('.line-note');note.textContent=pin.method==='gps'?`GPS location saved on this device (±${Math.round(pin.accuracy)} m). Road routing uses this saved point.`:'Destination point selected on the road map. Road routing uses this saved point.';}
}
function clearDestination() {
  clearTimeout(debounce);
  gps.clearRoute();
  document.body.classList.remove('has-destination');
  selected=null;$('destination-card').hidden=true;$('welcome-content').hidden=false;$('search-results').hidden=true;$('destination').value='';$('line').value='';$('search-error').hidden=true;
  history.replaceState(null,'',location.pathname);if(!street){selectedLayers.clearLayers();fit();}
}
function query() {
  const parsed=parseDestination($('destination').value);
  const line=$('line').value.trim();
  if(line && !/^[1-9]\d{0,3}$/.test(line))return {error:'Enter a whole line number between 1 and 9999.'};
  if(parsed.error)return parsed;
  return {...parsed,line:parsed.line||line};
}
function showResults(submitted=false) {
  const parsed=query();$('search-error').hidden=!parsed.error;
  if(parsed.error){$('search-error').textContent=parsed.error;$('search-results').hidden=true;return;}
  if(!parsed.parking){if(submitted){$('search-error').hidden=false;$('search-error').textContent='Enter a parking reference, for example H61.';$('destination').focus();}return;}
  const results=searchParkings(atlas.maps,parsed.parking,$('terminal-filter').value).map(h=>({...h,line:parsed.line}));
  const exact=results.filter(r=>normalizeCode(r.parking.code)===parsed.parking);
  if(submitted && exact.length===1){choose(exact[0]);return;}
  if(submitted && exact.length>1 && exact.filter(r=>!r.map.historical).length===1){choose(exact.find(r=>!r.map.historical));return;}
  $('search-results').hidden=false;$('welcome-content').hidden=true;$('destination-card').hidden=true;
  $('result-count').textContent=results.length>40?`${results.length} matches · first 40`:`${results.length} found`;
  $('result-list').replaceChildren();
  if(!results.length){const p=document.createElement('p');p.className='result-list-note';p.textContent=`No indexed parking matches “${parsed.parking}”${$('terminal-filter').value!=='all'?' in this terminal':''}. Try another map or a shorter reference. The source plans remain available to browse.`;$('result-list').append(p);}
  for(const hit of results.slice(0,40)){
    const b=document.createElement('button');b.type='button';b.className='result-row';
    b.innerHTML=`<span class="result-icon">${icon('pin')}</span><span><strong>${esc(hit.parking.code)}${hit.line?` · line ${esc(hit.line)}`:''}</strong><small>${esc(hit.map.name)} · ${hit.map.historical?'older plan':'ICO plan'}</small></span>${icon('arrow')}`;
    b.onclick=()=>choose(hit);$('result-list').append(b);
  }
}
function showSource() {
  dialog(`<h2>${esc(current.name)}</h2><p>${esc(current.note)}</p><p><strong>Plan date:</strong> ${esc(current.date)}<br><strong>Source page:</strong> ${current.page}<br><strong>Indexed references:</strong> ${current.parkings.length}</p><h3>What the marker means</h3><p>Markers identify labels on the source drawing. They do not establish the precise entrance, current availability, an exact line position or a verified driving route. Older plans may differ from the current terminal layout.</p><a class="primary" href="${esc(current.source)}#page=${current.page}" target="_blank" rel="noopener">Open original PDF ${icon('external')}</a>`);
}
function showAbout() {
  dialog(`<h2>A clearer way around the port.</h2><p>Portway brings the public ICO Zeebrugge plans into one searchable, phone-friendly map library. This is an independent parking finder, not an official ICO navigation service.</p><h3>Available in this version</h3><p>Search parking labels, keep a line reference, browse six plans, share destinations and reopen downloaded plans offline. GPS is displayed on the street map only.</p><h3>Navigation coverage</h3><p>Live GPS updates as you move. Save a parking or line’s actual GPS point once, then route to it along the local OpenStreetMap road network. Routes respect mapped one-way roads and node turn restrictions. Missing road connections are reported. PDF labels are not assumed to be GPS coordinates. Saved destination points stay on this device; they are not included in shared links. Current terminal signs and access changes are not live data.</p><ul class="source-list">${atlas.maps.map(m=>`<li><a href="${esc(m.source)}#page=${m.page}" target="_blank" rel="noopener">${esc(m.name)} ${icon('external')}</a><br>${esc(m.date)} · page ${m.page}</li>`).join('')}</ul><p>Terminal location coordinates: ICO terminal pages. Street tiles: OpenStreetMap contributors. Source plans: ICO / Cewez.</p>`);
}
async function shareDestination() {
  const text=`ICO ${selected.map.name} · ${selected.parking.code}${selected.line?` · line ${selected.line}`:''}`;
  const url=location.href;
  if(navigator.share){try{await navigator.share({title:'Portway destination',text,url});return;}catch(e){if(e.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(url);toast('Destination link copied. It opens this parking and keeps the line reference.');}catch{dialog(`<h2>Share this destination</h2><p>${esc(text)}</p><p>Copy the link below. Other devices need access to the server hosting this app.</p><input aria-label="Destination link" readonly value="${esc(url)}" style="width:100%;padding:10px">`);}
}
async function offlineSetup() {
  if(!('serviceWorker' in navigator)){ $('offline-status').textContent='Offline maps not supported';return; }
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    $('offline-status').textContent=navigator.onLine?'Maps saved offline':'Offline · saved maps';
  } catch { $('offline-status').textContent='Offline download unavailable'; }
}
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};
window.addEventListener('online',()=>$('offline-status').textContent=navigator.serviceWorker?.controller?'Maps saved offline':'Online');
window.addEventListener('offline',()=>$('offline-status').textContent=navigator.serviceWorker?.controller?'Offline · saved maps':'Offline');

try {
  const response=await fetch('./data.json');if(!response.ok)throw new Error('catalogue');atlas=await response.json();
  current=atlas.maps[0];
  for(const m of atlas.maps){
    const option=document.createElement('option');option.value=m.id;option.textContent=m.name+(m.historical?' · older':'');$('terminal-filter').append(option);
    const b=document.createElement('button');b.className='map-card';b.dataset.map=m.id;b.title=m.name+' · '+m.date;
    b.innerHTML=`<img src="${esc(m.image)}" alt="" loading="lazy"><strong>${esc(m.name)}</strong><span>${m.historical?'Older source plan':m.id==='south'?'Updated Sep 2025':'ICO source plan'}</span>`;
    b.onclick=()=>{street=false;clearDestination();$('terminal-filter').value=m.id;renderMap(m);};$('map-library').append(b);
  }
  $('catalogue-count').textContent=`6 plans · ${atlas.maps.reduce((n,m)=>n+m.parkings.length,0)} references`;
  renderMap();renderRecents();
  $('search-form').onsubmit=e=>{e.preventDefault();showResults(true);};
  $('destination').oninput=()=>{clearTimeout(debounce);if(!$('destination').value){clearDestination();return;}debounce=setTimeout(()=>showResults(false),180);};
  $('line').oninput=()=>{if($('destination').value)showResults(false);};
  $('terminal-filter').onchange=()=>{if($('destination').value)showResults(false);};
  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{$('destination').value=b.dataset.quick;$('line').value='';$('terminal-filter').value='all';showResults(true);});
  $('clear-recents').onclick=()=>{recents=[];try{localStorage.removeItem('portway-recents');}catch{}renderRecents();};
  $('plan-view').onclick=()=>{if(street){street=false;renderMap(current,selected?.parking);}};
  $('street-view').onclick=()=>{if(!street){street=true;renderMap();}};
  $('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('fit-map').onclick=fit;$('locate').onclick=()=>gps.start();$('live-gps-start').onclick=()=>gps.start();
  $('source').onclick=showSource;$('about').onclick=showAbout;
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('destination').focus();}if(e.key==='Escape'&&!$('info-dialog').open)clearDestination();});
  const params=new URL(location.href).searchParams, m=atlas.maps.find(m=>m.id===params.get('map'));
  const p=m?.parkings.find(p=>p.code===params.get('parking'));
  if(m&&p){const line=params.get('line');choose({map:m,parking:p,line:/^[1-9]\d{0,3}$/.test(line??'')?line:null},false);}
  offlineSetup();
} catch(e) {
  console.error(e);$('map-loading').hidden=false;$('map-loading').textContent='Could not load the map library. Reconnect and reload.';$('offline-status').textContent='Map library unavailable';
}
