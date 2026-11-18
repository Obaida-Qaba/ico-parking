function inside(point,polygon){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersects(a,b,polygon){
  if(inside(a,polygon)||inside(b,polygon))return true;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const c=polygon[j],d=polygon[i];
    if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.min(a[0],b[0])>Math.max(c[0],d[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.min(a[1],b[1])>Math.max(c[1],d[1]))continue;
    if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return true;
  }
  return false;
}

/** Replace inaccurate raster roads only inside documented local corrections. */
export function createRoadMap(map,graph){
  const parent=map.getPane('overlayPane');
  for(const [name,depth] of [['correctedGround',-2],['mappedRoads',-1]]){
    if(!map.getPane(name))map.createPane(name,parent);
    map.getPane(name).style.zIndex=String(depth);
  }
  const layer=L.layerGroup().addTo(map),patches=graph.mapPatches||[];
  for(const patch of patches){
    const ground=L.polygon(patch.polygon,{pane:'correctedGround',stroke:false,fillColor:patch.fill,fillOpacity:1,interactive:false,className:'corrected-road-ground'}).addTo(layer);
    ground.getElement().dataset.correction=patch.id;
  }
  const line=(segment,options)=>{
    const path=L.polyline([segment.pa,segment.pb],{pane:'mappedRoads',interactive:false,...options}).addTo(layer);
    const element=path.getElement();element.dataset.segment=segment.id;element.dataset.way=segment.way;
  };
  const corrected=[];
  for(const segment of graph.segments){
    if(patches.some(p=>intersects(segment.pa,segment.pb,p.polygon)))corrected.push(segment);
    else line(segment,{color:'#427b76',weight:2,opacity:.42});
  }
  // Draw complete casing before road fill so valid junctions stay connected.
  for(const segment of corrected)line(segment,{color:'#72968a',weight:7,opacity:1,className:'mapped-road-outline'});
  for(const segment of corrected)line(segment,{color:'#fff',weight:4,opacity:1,className:'mapped-road-fill'});
  return layer;
}
