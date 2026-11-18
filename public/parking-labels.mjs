import {validPin} from './navigation.mjs';

const region=id=>['bastenaken','hanze'].includes(id)?'south':id;
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

/** Matched parking areas and approaches only. Never project uncalibrated PDF labels. */
export function createParkingLabels(map,catalogue){
  const layer=L.layerGroup().addTo(map);
  let markers=[],signature='',position=null,target=null;
  function layout(){
    const size=map.getSize(),occupied=[];
    const reserve=(pin,width,height,offset=0)=>{
      if(!pin)return;
      const p=map.latLngToContainerPoint([pin.lat,pin.lon]);
      occupied.push({left:p.x-width/2,right:p.x+width/2,top:p.y-height/2+offset,bottom:p.y+height/2+offset});
    };
    reserve(position,44,50);reserve(target,84,44);
    const candidates=markers.map(item=>({...item,point:map.latLngToContainerPoint(item.marker.getLatLng())}));
    candidates.sort((a,b)=>a.point.distanceTo(size.divideBy(2))-b.point.distanceTo(size.divideBy(2))||a.key.localeCompare(b.key));
    for(const {marker,point,width} of candidates){
      const rect={left:point.x-width/2-2,right:point.x+width/2+2,top:point.y-13,bottom:point.y+13};
      const visible=rect.right>0&&rect.left<size.x&&rect.bottom>0&&rect.top<size.y&&!occupied.some(other=>overlaps(rect,other));
      marker.getElement().hidden=!visible;
      if(visible)occupied.push(rect);
    }
  }
  function update({activeKey=null,saved={},gpsPosition=null,destination=null}={}){
    position=gpsPosition;target=destination;
    const points=new Map();
    for(const [key,pin] of Object.entries(catalogue?.destinations||{})){
      const parts=key.split(':');if(parts.length!==2||!validPin(pin))continue;
      const display=validPin(pin.labelPosition)?pin.labelPosition:pin;
      points.set(`${region(parts[0])}:${parts[1]}`,{...pin,lat:display.lat,lon:display.lon,code:parts[1]});
    }
    for(const [key,pin] of Object.entries(saved)){
      const parts=key.split(':');if(parts.length!==3||parts[2]!=='parking'||!validPin(pin))continue;
      points.set(`${region(parts[0])}:${parts[1]}`,{...pin,code:parts[1]});
    }
    points.delete(activeKey);
    const entries=[...points].sort(([a],[b])=>a.localeCompare(b));
    const next=JSON.stringify(entries.map(([key,p])=>[key,p.lat,p.lon]));
    if(next!==signature){
      signature=next;layer.clearLayers();markers=[];
      for(const [key,pin] of entries){
        const text=document.createElement('span');text.textContent=pin.code;
        const width=Math.max(40,pin.code.length*8+12);
        const marker=L.marker([pin.lat,pin.lon],{interactive:false,keyboard:false,zIndexOffset:-1000,
          title:pin.code+' · parking approach',icon:L.divIcon({className:'nearby-parking',html:text,iconSize:[width,22],iconAnchor:[width/2,11]})}).addTo(layer);
        marker.getElement().dataset.parking=pin.code;
        markers.push({key,marker,width});
      }
    }
    layout();
  }
  map.on('move zoom rotate resize',layout);
  map.once('unload',()=>map.off('move zoom rotate resize',layout));
  return {update};
}
