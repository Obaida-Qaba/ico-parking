export function distanceMetres(a,b) {
  const rad=Math.PI/180, x=(b[1]-a[1])*rad*Math.cos((a[0]+b[0])*rad/2),y=(b[0]-a[0])*rad;
  return Math.hypot(x,y)*6371008.8;
}
export function validPin(pin) {return !!pin && Number.isFinite(pin.lat)&&Number.isFinite(pin.lon)&&Math.abs(pin.lat)<=90&&Math.abs(pin.lon)<=180;}
export function parkingKey(hit) {return `${['south','hanze','bastenaken'].includes(hit.map.id)?'south':hit.map.id}:${hit.parking.code}${hit.approach?'@'+hit.approach:''}:${hit.line||'parking'}`;}
export function buildGraph(data) {
  const graph={nodes:new Map(),edges:new Map(),segments:[],restrictions:new Map(),mapPatches:data.mapPatches||[]};
  for(const w of data.ways) {
    const blocked=new Set(w.blocked||[]);
    const excluded=new Set((w.excludedSegments||[]).map(pair=>[...pair].sort().join('|')));
    for(let i=0;i<w.nodes.length;i++){graph.nodes.set(w.nodes[i],w.points[i]);if(!graph.edges.has(w.nodes[i]))graph.edges.set(w.nodes[i],[]);}
    for(let i=1;i<w.nodes.length;i++) {
      const a=w.nodes[i-1],b=w.nodes[i],pa=w.points[i-1],pb=w.points[i];
      if(blocked.has(a)||blocked.has(b)||excluded.has([a,b].sort().join('|')))continue;
      const segment={id:`${w.id}:${i}`,a,b,pa,pb,way:w.id,name:w.name,oneway:w.oneway||false,distance:distanceMetres(pa,pb)};
      if(segment.distance<.01)continue;graph.segments.push(segment);
      if(w.oneway!==-1)graph.edges.get(a).push({to:b,way:w.id,distance:segment.distance,name:w.name});
      if(!w.oneway||w.oneway===-1)graph.edges.get(b).push({to:a,way:w.id,distance:segment.distance,name:w.name});
    }
  }
  for(const r of data.restrictions||[]) {if(!graph.restrictions.has(r.via))graph.restrictions.set(r.via,[]);graph.restrictions.get(r.via).push(r);}
  return graph;
}
const courseDifference=(a,b)=>Math.abs(((a-b+540)%360)-180);
function segmentCourse(segment) {
  return Math.atan2((segment.pb[1]-segment.pa[1])*Math.cos((segment.pa[0]+segment.pb[0])*Math.PI/360),segment.pb[0]-segment.pa[0])*180/Math.PI;
}
function directionError(segment,heading) {
  const angle=segmentCourse(segment),difference=course=>courseDifference(heading,course);
  if(segment.oneway===-1)return difference(angle+180);
  if(segment.oneway)return difference(angle);
  return Math.min(difference(angle),difference(angle+180));
}
export function nearestRoad(graph,p,{heading,accuracy,maxDistance=Infinity}={}) {
  let best=null;
  const useCourse=Number.isFinite(heading)&&heading>=0&&heading<=360&&Number.isFinite(accuracy)&&accuracy>0;
  const candidates=useCourse?[]:null;
  for(const s of graph.segments) {
    const c=Math.cos(p[0]*Math.PI/180),ax=(s.pa[1]-p[1])*c,ay=s.pa[0]-p[0],bx=(s.pb[1]-p[1])*c,by=s.pb[0]-p[0],dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy)));
    const point=[s.pa[0]+t*(s.pb[0]-s.pa[0]),s.pa[1]+t*(s.pb[1]-s.pa[1])],distance=distanceMetres(p,point);
    const candidate={segment:s,t,point,distance};
    if(!best||distance<best.distance)best=candidate;
    if(candidates)candidates.push(candidate);
  }
  if(useCourse&&best){
    // Course can disambiguate lanes only inside the reported uncertainty radius.
    // It cannot select a far parallel road or create a link between the lanes.
    const radius=Math.min(maxDistance,Math.max(best.distance,accuracy));
    let score=best.distance+directionError(best.segment,heading)/180*radius*2;
    for(const candidate of candidates){
      if(candidate.distance>radius)continue;
      const next=candidate.distance+directionError(candidate.segment,heading)/180*radius*2;
      if(next<score){best=candidate;score=next;}
    }
  }
  return best;
}
function allowed(graph,node,from,to,previous,next) {
  for(const r of graph.restrictions.get(node)||[]) {
    if(r.from!==from)continue;
    if(r.type==='no_u_turn'&&r.to===to){if(r.from!==r.to||previous===next)return false;continue;}
    if(r.type.startsWith('only_')&&r.to!==to)return false;
    if(r.type.startsWith('no_')&&r.to===to)return false;
  }
  return true;
}
function incomingAt(graph,node,heading) {
  if(!Number.isFinite(heading)||heading<0||heading>360)return null;
  let best=null;
  for(const segment of graph.segments){
    let previous,course;
    if(segment.b===node&&segment.oneway!==-1){previous=segment.a;course=segmentCourse(segment);}
    else if(segment.a===node&&(!segment.oneway||segment.oneway===-1)){previous=segment.b;course=segmentCourse(segment)+180;}
    else continue;
    const error=courseDifference(heading,course);
    if(error<=60&&(!best||error<best.error))best={way:segment.way,previous,error};
  }
  return best;
}
class Heap {
  items=[];
  push(x){const a=this.items;a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].cost<=x.cost)break;a[i]=a[p];i=p;}a[i]=x;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].cost<a[j].cost)j++;if(a[j].cost>=last.cost)break;a[i]=a[j];i=j;}a[i]=last;}return top;}
}
export function routeRoads(graph,start,end,{maxSnap=50,heading,accuracy}={}) {
  const s=nearestRoad(graph,start,{heading,accuracy,maxDistance:maxSnap}),g=nearestRoad(graph,end);
  if(!s||!g||s.distance>maxSnap||g.distance>maxSnap)return {available:false,reason:'No mapped drivable road close enough to the GPS position or destination. No cross-parking shortcut has been drawn.'};
  const startNode=s.t<=1e-10?s.segment.a:1-s.t<=1e-10?s.segment.b:null;
  const incoming=startNode===null?null:incomingAt(graph,startNode,heading);
  let best=null,finish=null;
  const directAllowed=!incoming||Math.abs(g.t-s.t)*s.segment.distance<.01||allowed(graph,startNode,incoming.way,s.segment.way,incoming.previous,g.t>s.t?s.segment.b:s.segment.a);
  if(s.segment.id===g.segment.id && directAllowed && ((g.t>=s.t&&s.segment.oneway!==-1)||(g.t<=s.t&&s.segment.oneway!==true))) {
    best=Math.abs(g.t-s.t)*s.segment.distance;finish={direct:true};
  }
  const heap=new Heap(),dist=new Map(),records=new Map();
  const add=(node,way,previous,cost,parent)=>{
    const key=`${node}|${way}|${previous??''}`;
    if(cost>=(dist.get(key)??Infinity))return;
    dist.set(key,cost);records.set(key,{node,way,previous,parent,cost});heap.push({key,cost});
  };
  // Start at the actual junction instead of driving an arbitrary incident road.
  // A known arrival course retains the incoming road and its turn restrictions.
  if(startNode!==null)add(startNode,incoming?.way??null,incoming?.previous??null,0,null);
  else {
    if(s.segment.oneway!==-1)add(s.segment.b,s.segment.way,s.segment.a,(1-s.t)*s.segment.distance,null);
    if(!s.segment.oneway||s.segment.oneway===-1)add(s.segment.a,s.segment.way,s.segment.b,s.t*s.segment.distance,null);
  }
  const goals=[];
  if(g.segment.oneway!==-1)goals.push({node:g.segment.a,cost:g.t*g.segment.distance,next:g.segment.b});
  if(!g.segment.oneway||g.segment.oneway===-1)goals.push({node:g.segment.b,cost:(1-g.t)*g.segment.distance,next:g.segment.a});
  // Likewise, reaching the target node is arrival; no extra incident-road
  // traversal is required simply because that road supplied the snapped point.
  if(g.t<=1e-10)goals.push({node:g.segment.a,cost:0,next:null});
  if(1-g.t<=1e-10)goals.push({node:g.segment.b,cost:0,next:null});
  while(heap.items.length){
    const item=heap.pop();if(item.cost!==dist.get(item.key))continue;if(best!==null&&item.cost>best)break;
    const state=records.get(item.key);
    for(const goal of goals)if(state.node===goal.node&&(goal.cost<.01||allowed(graph,state.node,state.way,g.segment.way,state.previous,goal.next))){
      const cost=item.cost+goal.cost;if(best===null||cost<best){best=cost;finish={key:item.key};}
    }
    for(const edge of graph.edges.get(state.node)||[]) {
      if(!allowed(graph,state.node,state.way,edge.way,state.previous,edge.to))continue;
      add(edge.to,edge.way,state.node,item.cost+edge.distance,item.key);
    }
  }
  if(!finish)return {available:false,reason:'The mapped roads do not form an allowed driving connection to this destination. No missing road has been invented.'};
  const points=[s.point];
  if(!finish.direct){const reversed=[];let key=finish.key;while(key){const r=records.get(key);reversed.push(graph.nodes.get(r.node));key=r.parent;}points.push(...reversed.reverse());}
  points.push(g.point);
  return {available:true,points:points.filter((p,i,a)=>!i||distanceMetres(p,a[i-1])>.1),distance:best,startOffset:s.distance,endOffset:g.distance,source:'OSM road geometry'};
}
