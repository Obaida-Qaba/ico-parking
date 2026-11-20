import {searchParkings} from '../../public/core.mjs';
import {resolveDestination,isAreaEntry,isAreaApproach,destinationEvidenceGap} from '../../public/destinations.mjs';
import {buildGraph,distanceMetres,nearestRoad,routeRoads,validPin} from '../../public/navigation.mjs';
import {createHash} from 'node:crypto';

export function auditInputHash(json){return createHash('sha256').update(JSON.stringify(JSON.parse(json))).digest('hex');}

const xy=pin=>[pin.lat,pin.lon];
const rounded=value=>Math.round(value*100)/100;
const canonical=id=>['bastenaken','hanze'].includes(id)?'south':id;

/** The audit retains declared failures that the safe UI intentionally filters. */
export function auditChoices(hit,catalogue){
  const entry=catalogue.destinations?.[hit.map.id+':'+hit.parking.code]??catalogue.destinations?.[canonical(hit.map.id)+':'+hit.parking.code];
  if(!entry?.chooseApproach)return [hit];
  if(!entry.approaches?.length)return [hit];
  return entry.approaches.map((option,index)=>({...hit,approach:option.id||'invalid-area-'+index,approachName:option.name||'Unlabelled area '+(index+1),approachSourceIndices:option.sourceIndicesByMap?.[hit.map.id]||option.sourceIndices,auditIssues:entry.approaches.filter(other=>other.id===option.id).length>1?['duplicate-approach-id']:[]}));
}

export function auditOrigins(catalogue){
  const names={south:['south:CD1','south:HC1','south:H61','north:BB'],north:['north:BB','north:P','north:X','south:CD1'],toyota:['toyota:A01','toyota:Y02','toyota:R01','north:BB'],hanze:['south:H61','south:H1','south:H52','north:BB'],bastenaken:['south:CD1','south:HC1','south:LA1','north:BB'],nissan:['nissan:VA','nissan:VH001','north:BB']};
  return Object.fromEntries(Object.entries(names).map(([id,keys])=>[id,keys.map(key=>({name:key,point:catalogue.destinations[key],scope:key.startsWith('north:')&&id!=='north'||id==='north'&&key.startsWith('south:')?'inter-terminal':'terminal'})).filter(p=>validPin(p.point)).map(p=>({...p,point:xy(p.point)}))]));
}

/** Every source reference is retained, including failures and each explicit area choice.
 * This is a software/data audit, not a field survey or a live access guarantee. */
export function auditParkings({atlas,catalogue,roads,origins=auditOrigins(catalogue),includeNearby=true}){
  const graph=buildGraph(roads),ways=new Map(roads.ways.map(w=>[w.id,w])),rows=[],byReference=new Map();
  for(const map of atlas.maps)for(const parking of map.parkings){
    const reference=map.id+':'+parking.code,hit={map,parking,line:'15'};
    const choices=auditChoices(hit,catalogue),sourceHits=searchParkings(atlas.maps,parking.code,map.id);
    const searchable=sourceHits.some(h=>h.map.id===map.id&&h.parking.code===parking.code);
    const sourceIndexed=parking.points?.length>0&&parking.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=map.width&&p.y<=map.height);
    const records=[];byReference.set(reference,records);
    for(const choice of choices.length?choices:[hit]){
      const pin=resolveDestination(choice,{},catalogue),issues=[...(choice.auditIssues||[])];
      const row={reference,map:map.id,mapName:map.name,code:parking.code,approach:choice.approach||null,approachName:choice.approachName||null,historicalPlan:!!map.historical,source:map.source||null,sourceDate:map.date||null,sourceIndexed,searchable,routeReady:false,withinTerminalReady:false,locationEvidenceConsistent:false,surveyedDestination:false,precision:'unlocated',routes:[],issues};
      rows.push(row);records.push(row);
      if(!sourceIndexed)issues.push('source-index-invalid');
      if(!searchable)issues.push('not-searchable');
      if(!pin){issues.push('missing-destination');const gap=destinationEvidenceGap(choice,catalogue);if(gap)row.locationLimitation=gap.reason;continue;}
      row.target={lat:pin.lat,lon:pin.lon,roadWay:pin.roadWay||null,roadSegment:pin.roadSegment||null};
      row.routingScope=pin.routingScope||'connected-road-network';
      row.precision=isAreaEntry(pin)?'area-entry-only':isAreaApproach(pin)?'area-approach-only':pin.historical||map.historical||pin.sourceRevision?.includes('historical')?'historical-area-approach':pin.scope==='parking-group-approach'?'shared-area-approach':'source-matched-parking-approach';
      row.individualParkingVerified=isAreaEntry(pin)||isAreaApproach(pin)?false:null;
      row.evidence={sourceMap:pin.sourceMap||null,revision:pin.sourceRevision||null,method:pin.method||null,region:pin.region||null,basis:pin.basis||null,scope:pin.scope||null};
      row.exactLine=!!pin.exactLine;
      const nearby=nearestRoad(graph,xy(pin));row.roadOffsetMetres=nearby?rounded(nearby.distance):null;
      const way=ways.get(pin.roadWay),laneGraph=way?buildGraph({ways:[way]}):null,lane=laneGraph?nearestRoad(laneGraph,xy(pin)):null;
      const segment=pin.roadSegment,segmentValid=Array.isArray(segment)&&segment.length>=2&&way&&way.nodes.some((_,i)=>[segment,[...segment].reverse()].some(order=>order.every((node,j)=>way.nodes[i+j]===node)));
      const declared=segmentValid?nearestRoad(buildGraph({ways:[{...way,nodes:segment,points:segment.map(node=>way.points[way.nodes.indexOf(node)])}]}),xy(pin)):null;
      row.arrivalRoadConsistent=!!(lane&&lane.distance<1&&declared&&declared.distance<1);
      if(!row.arrivalRoadConsistent)issues.push('arrival-road-mismatch');
      if(!nearby||nearby.distance>=1)issues.push('arrival-off-road');
      const sourcePoint=pin.sourcePoint,bounds=pin.sourceBounds;
      const sourceInside=!Array.isArray(bounds)||bounds.length!==4||Array.isArray(sourcePoint)&&sourcePoint[0]>=bounds[0]-.02&&sourcePoint[0]<=bounds[2]+.02&&sourcePoint[1]>=bounds[1]-.02&&sourcePoint[1]<=bounds[3]+.02;
      if(!sourceInside)issues.push('source-outside-bounds');
      if(!pin.basis||!pin.sourceMap)issues.push('source-evidence-missing');
      row.locationEvidenceConsistent=sourceInside&&!!pin.basis&&!!pin.sourceMap;
      const starts=[...(origins[map.id]||origins[canonical(map.id)]||[])];
      const hasIndependentOrigin=starts.some(start=>distanceMetres(start.point,xy(pin))>=10);
      const hasIndependentLocalOrigin=starts.some(start=>start.scope!=='inter-terminal'&&distanceMetres(start.point,xy(pin))>=10);
      if(includeNearby&&laneGraph){
        // Both ends of the declared lane exercise local one-way approaches too.
        for(const node of [way.nodes[0],way.nodes.at(-1)]){
          const point=graph.nodes.get(node);if(point&&distanceMetres(point,xy(pin))>10&&!starts.some(s=>distanceMetres(s.point,point)<1))starts.push({name:'arrival-lane:'+node,point});
        }
      }
      for(const start of starts){
        const route=routeRoads(graph,start.point,xy(pin),{maxSnap:20});
        const arrivalError=route.available?distanceMetres(route.points.at(-1),xy(pin)):null;
        const available=!!route.available&&arrivalError<1;
        row.routes.push({origin:start.name,scope:start.scope||'terminal',start:start.point,available,distanceMetres:route.available?rounded(route.distance):null,arrivalErrorMetres:arrivalError===null?null:rounded(arrivalError),reason:route.reason||null});
      }
      if(!hasIndependentOrigin)issues.push('no-confirmed-test-origin');
      if(row.routes.some(route=>!route.available))issues.push('route-unavailable');
      const local=row.routes.filter(route=>route.scope!=='inter-terminal');
      row.withinTerminalReady=sourceIndexed&&searchable&&row.arrivalRoadConsistent&&hasIndependentLocalOrigin&&local.length>0&&local.every(route=>route.available);
      row.routeReady=sourceIndexed&&searchable&&!issues.includes('duplicate-approach-id')&&hasIndependentOrigin&&row.arrivalRoadConsistent&&!!nearby&&nearby.distance<1&&row.routes.length>0&&row.routes.every(route=>route.available);
    }
  }
  const summary={references:byReference.size,targets:rows.filter(r=>r.target).length,routeReady:[...byReference.values()].filter(group=>group.length&&group.every(r=>r.routeReady)).length,withinTerminalRouteReady:[...byReference.values()].filter(group=>group.length&&group.every(r=>r.withinTerminalReady)).length,missing:[...byReference.values()].filter(group=>group.some(r=>r.issues.includes('missing-destination'))).length,evidenceInconsistent:rows.filter(r=>r.target&&!r.locationEvidenceConsistent).length,surveyedDestinations:rows.filter(r=>r.surveyedDestination).length,routeCases:rows.reduce((n,r)=>n+r.routes.length,0),routeFailures:rows.flatMap(r=>r.routes).filter(r=>!r.available).length};
  summary.areaEntranceReferences=[...byReference.values()].filter(group=>group.some(row=>row.precision==='area-entry-only')).length;
  summary.areaApproachReferences=[...byReference.values()].filter(group=>group.some(row=>row.precision==='area-approach-only')).length;
  summary.complete=summary.routeReady===summary.references&&summary.evidenceInconsistent===0&&rows.every(r=>r.precision==='surveyed-destination');
  return {schemaVersion:1,scope:'Every indexed reference in every supplied terminal plan, including historical plans and explicit compound choices.',verification:'Routes are simulated on the corrected road graph. Source matches and shared-area approaches are not surveyed entrances or parking-line coordinates. No field-accuracy or current gate-access claim is made.',summary,terminals:Object.fromEntries(atlas.maps.map(map=>{const groups=[...byReference.values()].filter(group=>group[0]?.map===map.id);return [map.id,{references:groups.length,routeReady:groups.filter(g=>g.every(r=>r.routeReady)).length,missing:groups.filter(g=>g.some(r=>r.issues.includes('missing-destination'))).length}];})),rows};
}
