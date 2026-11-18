import {distanceMetres} from './navigation.mjs';

/** Animate only between measured positions. Routing always uses the raw fix. */
export function createPositionMotion({onFrame,now=()=>performance.now(),requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id)}={}){
 let position=null,tween=null,frame=null;
 const sample=time=>{
  if(!tween)return position;
  const t=Math.max(0,Math.min(1,(time-tween.started)/tween.duration));
  return t===1?{...tween.to}:{lat:tween.from.lat+(tween.to.lat-tween.from.lat)*t,lon:tween.from.lon+(tween.to.lon-tween.from.lon)*t};
 };
 function cancel(){
  if(frame!==null)cancelFrame(frame);
  frame=null;tween=null;
 }
 function tick(){
  frame=null;if(!tween)return;
  const time=now();position=sample(time);
  const finished=time>=tween.started+tween.duration;
  if(finished)tween=null;
  onFrame?.(position);
  if(tween)frame=requestFrame(tick);
 }
 function set(next,{duration=800}={}){
  if(!next||!Number.isFinite(next.lat)||!Number.isFinite(next.lon))return;
  const time=now(),from=sample(time),to={lat:next.lat,lon:next.lon};
  cancel();position=from;
  const distance=from?distanceMetres([from.lat,from.lon],[to.lat,to.lon]):Infinity;
  if(!from||duration<=0||distance<.3||distance>80){position=to;onFrame?.(position);return;}
  tween={from,to,started:time,duration:Math.min(1000,Math.max(100,duration))};
  frame=requestFrame(tick);
 }
 return {get position(){return position;},set,cancel};
}
