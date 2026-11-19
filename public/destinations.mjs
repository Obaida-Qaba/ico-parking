import {parkingKey,validPin} from './navigation.mjs';

export const isAreaEntry=pin=>!!pin?.automatic&&pin.precision==='area-entry-only';

function builtIn(hit,catalogue) {
  const direct=catalogue?.destinations?.[`${hit.map.id}:${hit.parking.code}`];
  const point=validPin(direct)?direct:catalogue?.destinations?.[parkingKey({...hit,line:null,approach:null}).replace(/:parking$/,'')];
  if(point&&Object.hasOwn(point,'supportedMaps')&&(!Array.isArray(point.supportedMaps)||!point.supportedMaps.includes(hit.map.id)))return null;
  return point;
}

/** Repeated names in separate compounds need a stable, explicit area choice. */
export function destinationChoices(hit,catalogue={}) {
  if(!hit)return [];
  const point=builtIn(hit,catalogue);
  if(!point?.chooseApproach)return [hit];
  const options=(point.approaches||[]).filter(option=>validPin(option)&&option.id&&option.name);
  const selected=options.find(option=>option.id===hit.approach);
  return (selected?[selected]:options).map(option=>({...hit,approach:option.id,approachName:option.name,approachSourceIndices:option.sourceIndicesByMap?.[hit.map.id]||option.sourceIndices}));
}

/** Saved measurements can refine a built-in parking approach; PDF line labels are never treated as GPS fixes. */
export function resolveDestination(hit,saved={},catalogue={}) {
  if(!hit)return null;
  let point=builtIn(hit,catalogue);
  if(point?.chooseApproach){
    const option=point.approaches?.find(option=>option.id===hit.approach&&validPin(option));
    if(!option)return null;
    point={...point,...option,approachName:option.name};
  }
  const exactKey=parkingKey(hit),parkingKeyOnly=parkingKey({...hit,line:null});
  const exact=saved[exactKey];
  if(validPin(exact))return {...exact,automatic:false,exactLine:!!hit.line,scope:hit.line?'line':'parking'};
  const parking=saved[parkingKeyOnly];
  if(validPin(parking))return {...parking,automatic:false,exactLine:false,scope:'parking'};
  if(validPin(point))return {...point,automatic:true,exactLine:false,scope:point.scope==='parking-group-approach'?'parking-group-approach':'parking-approach'};
  return null;
}
