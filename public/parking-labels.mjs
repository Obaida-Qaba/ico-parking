import {validPin} from './navigation.mjs';

const region=id=>['bastenaken','hanze'].includes(id)?'south':id;
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const rectangle=(p,w,h)=>({left:p.x-w/2,right:p.x+w/2,top:p.y-h/2,bottom:p.y+h/2});
const svg=(name,attributes)=>{const element=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);return element;};

/** Geographic labels stay at their real points; crowded labels have explicit groups. */
export function createParkingLabels(map,catalogue){
  const layer=L.layerGroup().addTo(map),base=new Map(),markers=new Map(),clusters=new Map();
  for(const [key,pin] of Object.entries({...catalogue?.destinations,...catalogue?.labels})){
    const parts=key.split(':');if(parts.length!==2||!validPin(pin))continue;
    const display=validPin(pin.labelPosition)?pin.labelPosition:pin;
    base.set(`${region(parts[0])}:${parts[1]}`,{lat:display.lat,lon:display.lon,code:parts[1]});
  }
  const emptySaved={};
  let savedReference,activeKey=null,position=null,target=null,revision=0,signature='',frame=null,timer=null,lastLayout=0,disposed=false,popup=null;
  const hidden=(element,value)=>{if(element.hidden!==value)element.hidden=value;};
  function sync(saved){
    if(saved===savedReference)return;
    savedReference=saved;const points=new Map(base);
    for(const [key,pin] of Object.entries(saved)){
      const parts=key.split(':');if(parts.length!==3||parts[2]!=='parking'||!validPin(pin))continue;
      points.set(`${region(parts[0])}:${parts[1]}`,{lat:pin.lat,lon:pin.lon,code:parts[1]});
    }
    for(const [key,item] of markers)if(!points.has(key)){layer.removeLayer(item.marker);markers.delete(key);}
    for(const [key,pin] of points){
      let item=markers.get(key);
      if(!item){
        const text=document.createElement('span');text.textContent=pin.code;
        const marker=L.marker([pin.lat,pin.lon],{interactive:false,keyboard:false,zIndexOffset:-1000,title:pin.code+' · parking',icon:L.divIcon({className:'nearby-parking',html:text,iconSize:[30,18],iconAnchor:[15,9]})});
        item={key,code:pin.code,marker};markers.set(key,item);
      }else if(!item.marker.getLatLng().equals([pin.lat,pin.lon]))item.marker.setLatLng([pin.lat,pin.lon]);
    }
    revision++;
  }
  function showGroup(group){
    popup?.remove();
    map.fire('dragstart');map.stopHeadingUp?.();
    const size=map.getSize(),origin=map.getContainer().getBoundingClientRect(),safe={left:8,right:size.x-8,top:8,bottom:size.y-8};
    for(const selector of ['#search-form','.map-top','.map-controls','#navigation-panel','#destination-card']){
      const box=document.querySelector(selector)?.getBoundingClientRect();if(!box?.width||!box.height)continue;
      if(selector==='.map-controls')safe.right=Math.min(safe.right,box.left-origin.left-8);
      else if(selector==='#search-form'||selector==='.map-top')safe.top=Math.max(safe.top,box.bottom-origin.top+8);
      else safe.bottom=Math.min(safe.bottom,box.top-origin.top-8);
    }
    const content=document.createElement('div');content.style.cssText=`min-width:150px;max-height:${Math.max(44,Math.min(230,safe.bottom-safe.top-44))}px;overflow:auto`;
    const heading=document.createElement('strong');heading.textContent=group.members.length===1?'Parking nearby':`${group.members.length} parkings nearby`;content.append(heading);
    for(const member of group.members){
      const button=document.createElement('button');button.type='button';button.className='parking-group-item';button.textContent=member.code;
      button.setAttribute('aria-label','Show '+member.code+' on map');button.style.cssText='display:block;width:100%;min-height:44px;border:0;border-bottom:1px solid #e0e9e2;background:white;color:#244c43;text-align:left;font-size:14px;font-weight:600;font-family:inherit;padding:8px 4px;cursor:pointer';
      button.onclick=()=>{map.fire('dragstart');map.stopHeadingUp?.();map.setView(member.marker.getLatLng(),Math.min(map.getMaxZoom(),Math.max(18,map.getZoom()+1)),{animate:false});popup?.setLatLng(member.marker.getLatLng());};
      content.append(button);
    }
    const anchor=map.latLngToContainerPoint(group.marker.getLatLng()).add(group.displacement||[0,0]);
    popup=L.popup({autoPan:false,maxWidth:240,className:'parking-group-popup'}).setLatLng(map.containerPointToLatLng(anchor)).setContent(content).openOn(map);
    const box=popup.getElement().getBoundingClientRect(),left=box.left-origin.left,top=box.top-origin.top;
    const x=Math.max(safe.left,Math.min(safe.right-box.width,left))-left,y=Math.max(safe.top,Math.min(safe.bottom-box.height,top))-top;
    if(x||y)popup.setLatLng(map.containerPointToLatLng(anchor.add([x,y])));
  }
  function makeGroup(key,members,anchor){
    const root=document.createElement('div');root.style.cssText='position:relative;width:1px;height:1px;pointer-events:none';
    const leader=svg('svg',{width:'1',height:'1','aria-hidden':'true'});leader.style.cssText='position:absolute;overflow:visible;pointer-events:none';
    const line=svg('path',{fill:'none',stroke:'#698f7a','stroke-width':'1','stroke-dasharray':'2 3'}),dot=svg('circle',{cx:'0',cy:'0',r:'2.5',fill:'#698f7a'});leader.append(line,dot);root.append(leader);
    const button=document.createElement('button');button.type='button';button.className='parking-cluster-button';
    button.style.cssText='position:absolute;width:64px;height:44px;min-height:44px;border:1px solid #adc5b8;border-radius:14px;background:#fff;color:#285d47;box-shadow:0 2px 7px #163b3020;font:700 11px system-ui;white-space:nowrap;pointer-events:auto;cursor:pointer';root.append(button);
    const marker=L.marker(anchor.marker.getLatLng(),{interactive:false,keyboard:false,zIndexOffset:-800,icon:L.divIcon({className:'parking-cluster',html:root,iconSize:[1,1],iconAnchor:[0,0]})}).addTo(layer);
    const group={key,members,marker,button,line,dot,anchor:anchor.key};
    button.onclick=event=>{L.DomEvent.stop(event);showGroup(group);};L.DomEvent.disableClickPropagation(button);L.DomEvent.disableScrollPropagation(button);
    return group;
  }
  function layout(){
    frame=null;timer=null;if(disposed)return;
    const size=map.getSize(),center=map.getCenter(),zoom=map.getZoom();
    const next=[center.lat.toFixed(7),center.lng.toFixed(7),zoom,(map.getBearing?.()||0).toFixed(1),size.x,size.y,activeKey,position?.lat,position?.lon,target?.lat,target?.lon,revision].join('|');
    lastLayout=performance.now();if(next===signature)return;signature=next;
    const reserved=[],occupied=[],candidates=[],font=zoom>=18?11:10,height=zoom>=18?22:18;
    const reserve=(pin,w,h)=>{if(pin)reserved.push(rectangle(map.latLngToContainerPoint([pin.lat,pin.lon]),w,h));};
    reserve(position,44,50);reserve(target,84,44);
    const origin=map.getContainer().getBoundingClientRect();
    for(const selector of ['#search-form','.map-top','.map-controls','#navigation-panel','#destination-card']){
      const element=document.querySelector(selector);if(!element)continue;
      const box=element.getBoundingClientRect();if(box.width&&box.height)reserved.push({left:box.left-origin.left-2,right:box.right-origin.left+2,top:box.top-origin.top-2,bottom:box.bottom-origin.top+2});
    }
    for(const item of markers.values()){
      if(item.key===activeKey){if(layer.hasLayer(item.marker))layer.removeLayer(item.marker);continue;}
      const point=map.latLngToContainerPoint(item.marker.getLatLng());
      if(point.x<-64||point.x>size.x+64||point.y<-64||point.y>size.y+64){
        if(layer.hasLayer(item.marker))layer.removeLayer(item.marker);
        continue;
      }
      if(!layer.hasLayer(item.marker))item.marker.addTo(layer);
      const element=item.marker.getElement(),width=Math.max(28,Math.ceil(item.code.length*font*.64+8));
      if(item.element!==element||item.font!==font){
        item.element=element;item.font=font;element.dataset.parking=item.code;
        Object.assign(element.style,{width:width+'px',height:height+'px',marginLeft:-width/2+'px',marginTop:-height/2+'px',fontSize:font+'px',lineHeight:height-2+'px'});
      }
      const rect=rectangle(point,width+2,height+2);
      const visible=rect.right>0&&rect.left<size.x&&rect.bottom>0&&rect.top<size.y;
      if(visible)candidates.push({...item,point,rect});else hidden(element,true);
    }
    const parents=candidates.map((_,i)=>i),find=i=>parents[i]===i?i:(parents[i]=find(parents[i])),join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++)if(overlaps(candidates[i].rect,candidates[j].rect))join(i,j);
    for(const reserve of reserved){const near=candidates.map((c,i)=>overlaps(c.rect,reserve)?i:-1).filter(i=>i>=0);for(let i=1;i<near.length;i++)join(near[0],near[i]);}
    const groups=new Map();for(let i=0;i<candidates.length;i++){const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(candidates[i]);}
    const crowded=[];occupied.push(...reserved);
    for(const members of groups.values()){
      const grouped=members.length>1||reserved.some(r=>overlaps(members[0].rect,r));
      for(const item of members)hidden(item.marker.getElement(),grouped);
      if(grouped)crowded.push(members.sort((a,b)=>a.key.localeCompare(b.key)));else occupied.push(members[0].rect);
    }
    const used=new Set();crowded.sort((a,b)=>b.length-a.length||a[0].key.localeCompare(b[0].key));
    for(const members of crowded){
      const key=members.map(m=>m.key).join('|'),mean=members.reduce((p,m)=>p.add(m.point),L.point(0,0)).divideBy(members.length);
      const anchor=[...members].sort((a,b)=>a.point.distanceTo(mean)-b.point.distanceTo(mean)||a.key.localeCompare(b.key))[0];
      let group=clusters.get(key);if(!group){group=makeGroup(key,members,anchor);clusters.set(key,group);}group.members=members;used.add(key);
      if(!group.marker.getLatLng().equals(anchor.marker.getLatLng()))group.marker.setLatLng(anchor.marker.getLatLng());
      const point=anchor.point;let chosen=null;
      for(let radius=0;radius<=176&&!chosen;radius+=16)for(let step=0;step<(radius?12:1);step++){
        const p=point.add([radius*Math.cos(step*Math.PI/6),radius*Math.sin(step*Math.PI/6)]),rect=rectangle(p,68,46);
        if(rect.left>=3&&rect.right<=size.x-3&&rect.top>=3&&rect.bottom<=size.y-3&&!occupied.some(r=>overlaps(r,rect))){chosen=p;occupied.push(rect);break;}
      }
      if(!chosen){chosen=L.point(Math.max(36,Math.min(size.x-36,point.x)),Math.max(24,Math.min(size.y-24,point.y)));occupied.push(rectangle(chosen,68,46));}
      const x=Math.round(chosen.x-point.x),y=Math.round(chosen.y-point.y),offset=x+','+y;
      if(group.offset!==offset){group.offset=offset;group.displacement=[x,y];group.button.style.left=x-32+'px';group.button.style.top=y-22+'px';group.line.setAttribute('d',`M0 0L${x} ${y}`);group.line.style.display=x===0&&y===0?'none':'';}
      const codes=members.map(m=>m.code),codesJSON=JSON.stringify(codes);
      if(group.codes!==codesJSON){group.codes=codesJSON;group.button.dataset.parkingCodes=codesJSON;group.button.textContent=members.length===1?'1 parking':members.length+' parks';group.button.setAttribute('aria-label',members.length+' parkings: '+codes.join(', ')+'. Show parking list.');}
    }
    for(const [key,group] of clusters)if(!used.has(key)){layer.removeLayer(group.marker);clusters.delete(key);}
  }
  function schedule(force=false){
    if(disposed)return;
    if(frame!==null)return;
    if(timer!==null){if(!force)return;clearTimeout(timer);timer=null;}
    const delay=force?0:Math.max(0,80-(performance.now()-lastLayout));
    if(delay)timer=setTimeout(()=>{timer=null;frame=requestAnimationFrame(layout);},delay);else frame=requestAnimationFrame(layout);
  }
  const moving=()=>schedule(),settled=()=>schedule(true);
  // A following camera completes tiny pans every frame. Their moveend events
  // must keep the same cadence as movement instead of forcing full layouts.
  map.on('move moveend zoom rotate',moving);map.on('zoomend resize',settled);
  map.once('unload',()=>{disposed=true;if(frame!==null)cancelAnimationFrame(frame);if(timer!==null)clearTimeout(timer);map.off('move moveend zoom rotate',moving);map.off('zoomend resize',settled);});
  return {update({activeKey:nextActive=null,saved=emptySaved,gpsPosition=null,destination=null}={}){sync(saved);activeKey=nextActive;position=gpsPosition;target=destination;schedule(true);}};
}
