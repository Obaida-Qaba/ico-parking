import {parkingKey,validPin} from './navigation.mjs';

/** Saved measurements can refine a built-in parking approach; PDF line labels are never treated as GPS fixes. */
export function resolveDestination(hit,saved={},catalogue={}) {
  if(!hit)return null;
  const exactKey=parkingKey(hit),parkingKeyOnly=parkingKey({...hit,line:null});
  const exact=saved[exactKey];
  if(validPin(exact))return {...exact,automatic:false,exactLine:!!hit.line,scope:hit.line?'line':'parking'};
  const parking=saved[parkingKeyOnly];
  if(validPin(parking))return {...parking,automatic:false,exactLine:false,scope:'parking'};
  const point=catalogue?.destinations?.[parkingKeyOnly.replace(/:parking$/,'')];
  if(validPin(point))return {...point,automatic:true,exactLine:false,scope:'parking-approach'};
  return null;
}
