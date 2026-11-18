export function distanceMetres(a,b) {
  const rad=Math.PI/180, x=(b[1]-a[1])*rad*Math.cos((a[0]+b[0])*rad/2),y=(b[0]-a[0])*rad;
  return Math.hypot(x,y)*6371008.8;
}
export function validPin(pin) {return !!pin && Number.isFinite(pin.lat)&&Number.isFinite(pin.lon)&&Math.abs(pin.lat)<=90&&Math.abs(pin.lon)<=180;}
export function parkingKey(hit) {return `${['south','hanze','bastenaken'].includes(hit.map.id)?'south':hit.map.id}:${hit.parking.code}:${hit.line||'parking'}`;}
export function buildGraph(data) {
  const graph={nodes:new Map(),edges:new Map(),segments:[],restrictions:new Map()};
  for(const w of data.ways) {
    const blocked=new Set(w.blocked||[]);
    for(let i=0;i<w.nodes.length;i++){graph.nodes.set(w.nodes[i],w.points[i]);if(!graph.edges.has(w.nodes[i]))graph.edges.set(w.nodes[i],[]);}
    for(let i=1;i<w.nodes.length;i++) {
      const a=w.nodes[i-1],b=w.nodes[i],pa=w.points[i-1],pb=w.points[i];
      if(blocked.has(a)||blocked.has(b))continue;
      const segment={id:`${w.id}:${i}`,a,b,pa,pb,way:w.id,name:w.name,oneway:w.oneway||false,distance:distanceMetres(pa,pb)};
      if(segment.distance<.01)continue;graph.segments.push(segment);
      if(w.oneway!==-1)graph.edges.get(a).push({to:b,way:w.id,distance:segment.distance,name:w.name});
      if(!w.oneway||w.oneway===-1)graph.edges.get(b).push({to:a,way:w.id,distance:segment.distance,name:w.name});
    }
  }
  for(const r of data.restrictions||[]) {if(!graph.restrictions.has(r.via))graph.restrictions.set(r.via,[]);graph.restrictions.get(r.via).push(r);}
  return graph;
}
export function nearestRoad(graph,p) {
  let best=null;
  for(const s of graph.segments) {
    const c=Math.cos(p[0]*Math.PI/180),ax=(s.pa[1]-p[1])*c,ay=s.pa[0]-p[0],bx=(s.pb[1]-p[1])*c,by=s.pb[0]-p[0],dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy)));
    const point=[s.pa[0]+t*(s.pb[0]-s.pa[0]),s.pa[1]+t*(s.pb[1]-s.pa[1])],distance=distanceMetres(p,point);
    if(!best||distance<best.distance)best={segment:s,t,point,distance};
  }
  return best;
}
function allowed(graph,node,from,to,previous,next) {
  for(const r of graph.restrictions.get(node)||[]) {
    if(r.from!==from)continue;
    if(r.type==='no_u_turn'&&r.to===to){if(previous===next)return false;continue;}
    if(r.type.startsWith('only_')&&r.to!==to)return false;
    if(r.type.startsWith('no_')&&r.to===to)return false;
  }
  return true;
}
class Heap {
  items=[];
  push(x){const a=this.items;a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].cost<=x.cost)break;a[i]=a[p];i=p;}a[i]=x;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].cost<a[j].cost)j++;if(a[j].cost>=last.cost)break;a[i]=a[j];i=j;}a[i]=last;}return top;}
}
export function routeRoads(graph,start,end,{maxSnap=50}={}) {
  const s=nearestRoad(graph,start),g=nearestRoad(graph,end);
  if(!s||!g||s.distance>maxSnap||g.distance>maxSnap)return {available:false,reason:'No mapped drivable road close enough to the GPS position or destination. No cross-parking shortcut has been drawn.'};
  let best=null,finish=null;
  if(s.segment.id===g.segment.id && ((g.t>=s.t&&s.segment.oneway!==-1)||(g.t<=s.t&&s.segment.oneway!==true))) {
    best=Math.abs(g.t-s.t)*s.segment.distance;finish={direct:true};
  }
  const heap=new Heap(),dist=new Map(),records=new Map();
  const add=(node,way,previous,cost,parent)=>{
    const key=`${node}|${way}|${previous??''}`;
    if(cost>=(dist.get(key)??Infinity))return;
    dist.set(key,cost);records.set(key,{node,way,previous,parent,cost});heap.push({key,cost});
  };
  if(s.segment.oneway!==-1)add(s.segment.b,s.segment.way,s.segment.a,(1-s.t)*s.segment.distance,null);
  if(!s.segment.oneway||s.segment.oneway===-1)add(s.segment.a,s.segment.way,s.segment.b,s.t*s.segment.distance,null);
  const goals=[];
  if(g.segment.oneway!==-1)goals.push({node:g.segment.a,cost:g.t*g.segment.distance,next:g.segment.b});
  if(!g.segment.oneway||g.segment.oneway===-1)goals.push({node:g.segment.b,cost:(1-g.t)*g.segment.distance,next:g.segment.a});
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
