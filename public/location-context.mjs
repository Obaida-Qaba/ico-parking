import {validPin} from './navigation.mjs';

function contains(point,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function edgeDistance(point,polygon){
  const scale=[111195,111195*Math.cos(point[0]*Math.PI/180)];
  let best=Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j].map((x,k)=>(x-point[k])*scale[k]),b=polygon[i].map((x,k)=>(x-point[k])*scale[k]);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/length)):0;
    best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));
  }
  return best;
}
const result=region=>region?{id:region.id,name:region.name,mapId:region.mapId,confidence:'approximate-area'}:null;

/** Approximate search context only; never destination coordinates or access rules. */
export function detectTerminal(fix,data,{previous=null}={}){
  if(!validPin(fix)||!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>(data?.maxAccuracyMetres??60))return null;
  if(fix.timestamp!==undefined&&(!Number.isFinite(fix.timestamp)||Date.now()-fix.timestamp>(data?.maxAgeMilliseconds??30000)||fix.timestamp>Date.now()+15000))return null;
  const point=[fix.lat,fix.lon];
  const areas=(data?.regions||[]).filter(r=>Array.isArray(r.polygon)&&r.polygon.length>=3).map(region=>({region,inside:contains(point,region.polygon),edge:edgeDistance(point,region.polygon),margin:fix.accuracy+(region.boundaryUncertaintyMetres||0)}));
  const confident=areas.filter(a=>a.inside&&a.edge>a.margin).sort((a,b)=>(b.region.priority||0)-(a.region.priority||0));
  const previousId=typeof previous==='string'?previous:previous?.id;
  const last=areas.find(a=>a.region.id===previousId);
  const best=confident[0];
  // Hold an established specific context through the uncertainty band, rather
  // than alternating between adjacent terminals as the GPS dot jitters.
  if(last&&(last.inside||last.edge<=last.margin+(data?.hysteresisMetres??20))&&(!best||(last.region.priority||0)>=(best.region.priority||0)))return result(last.region);
  if(!best)return null;
  const peers=confident.filter(a=>(a.region.priority||0)===(best.region.priority||0));
  if(peers.length>1)return result(confident.find(a=>(a.region.priority||0)<(best.region.priority||0))?.region);
  return result(best.region);
}
