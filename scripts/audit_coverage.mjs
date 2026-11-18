import {readFileSync} from 'node:fs';
import {resolveDestination,destinationChoices} from '../public/destinations.mjs';
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
let total=0,unlocated=0;
for(const map of atlas.maps){
 const missing=map.parkings.filter(parking=>{
   const choices=destinationChoices({map,parking},catalogue);
   return !choices.length||choices.some(hit=>!resolveDestination(hit,{},catalogue));
 }).map(p=>p.code);
 total+=map.parkings.length;unlocated+=missing.length;
 console.log(`${map.id}: ${map.parkings.length-missing.length}/${map.parkings.length} references have a road approach`);
 if(missing.length)console.log('  Unlocated: '+missing.join(', '));
}
console.log(`${total-unlocated}/${total} source references routable. ${unlocated} remain unlocated.`);
if(unlocated)process.exitCode=1;
