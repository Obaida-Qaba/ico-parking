import {distanceMetres} from './navigation.mjs';
import {courseBetween} from './heading.mjs';
const delta=(to,from)=>((to-from+540)%360)-180;

export function nextInstruction(points,{heading=null}={}){
  const clean=[];
  for(const [i,p] of points.entries())if(!clean.length||distanceMetres(p,clean.at(-1))>.2||i===points.length-1&&distanceMetres(p,clean.at(-1))>.001)clean.push(p);
  if(clean.length<2)return 'Follow the highlighted road';
  if(Number.isFinite(heading)){
    const ahead=clean.find((p,i)=>i&&distanceMetres(clean[0],p)>=5);
    if(ahead&&Math.abs(delta(courseBetween(clean[0],ahead),heading))>145)return 'Turn around to follow the route';
  }
  let travelled=0;
  for(let i=1;i<clean.length-1;i++){
    travelled+=distanceMetres(clean[i-1],clean[i]);
    const turn=delta(courseBetween(clean[i],clean[i+1]),courseBetween(clean[i-1],clean[i]));
    if(Math.abs(turn)>145)return `Turn around in ${Math.max(5,Math.round(travelled/5)*5)} m`;
    if(Math.abs(turn)>35)return `${turn>0?'Right':'Left'} turn in ${Math.max(5,Math.round(travelled/5)*5)} m`;
  }
  return 'Follow the highlighted road';
}
