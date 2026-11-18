const indexes=new WeakMap(),CELL=.002;

function roadIndex(graph){
  if(indexes.has(graph))return indexes.get(graph);
  const cells=new Map(),points=new Map();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const point=(id,coordinates)=>{
    if(!points.has(id))points.set(id,L.latLng(coordinates));
    return points.get(id);
  };
  const records=graph.segments.map(segment=>({...segment,coordinates:[point(segment.a,segment.pa),point(segment.b,segment.pb)],
    south:Math.min(segment.pa[0],segment.pb[0]),north:Math.max(segment.pa[0],segment.pb[0]),
    west:Math.min(segment.pa[1],segment.pb[1]),east:Math.max(segment.pa[1],segment.pb[1])}));
  records.forEach((record,id)=>{
    minX=Math.min(minX,Math.floor(record.west/CELL));maxX=Math.max(maxX,Math.floor(record.east/CELL));
    minY=Math.min(minY,Math.floor(record.south/CELL));maxY=Math.max(maxY,Math.floor(record.north/CELL));
    for(let y=Math.floor(record.south/CELL);y<=Math.floor(record.north/CELL);y++)for(let x=Math.floor(record.west/CELL);x<=Math.floor(record.east/CELL);x++){
      const key=`${y}:${x}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);
    }
  });
  const index={select(bounds){
    const south=bounds.getSouth(),north=bounds.getNorth(),west=bounds.getWest(),east=bounds.getEast(),ids=new Set();
    for(let y=Math.max(minY,Math.floor(south/CELL));y<=Math.min(maxY,Math.floor(north/CELL));y++)for(let x=Math.max(minX,Math.floor(west/CELL));x<=Math.min(maxX,Math.floor(east/CELL));x++){
      for(const id of cells.get(`${y}:${x}`)||[])ids.add(id);
    }
    const lines=[];let previous=null,current=null;
    for(const id of [...ids].sort((a,b)=>a-b)){
      const record=records[id];
      if(record.north<south||record.south>north||record.east<west||record.west>east)continue;
      // Join only consecutive real segments of the same way. Excluded edges
      // leave different endpoints, so their gaps can never become new roads.
      if(previous?.way===record.way&&previous.b===record.a)current.push(record.coordinates[1]);
      else{current=[...record.coordinates];lines.push(current);}
      previous=record;
    }
    return lines;
  }};
  indexes.set(graph,index);return index;
}

/** Draw buffered nearby roads instead of reprojecting the whole port each frame. */
export function createRoadMap(map,graph){
  const pane=map.getPane('mappedRoads')||map.createPane('mappedRoads',map.getPane('overlayPane'));
  pane.style.zIndex='-1';
  const layer=L.layerGroup().addTo(map),index=roadIndex(graph);
  const outline=L.polyline([],{pane:'mappedRoads',color:'#719386',opacity:1,weight:6,interactive:false,smoothFactor:.8,className:'mapped-road-outline'}).addTo(layer);
  const fill=L.polyline([],{pane:'mappedRoads',color:'#fff',opacity:1,weight:3.5,interactive:false,smoothFactor:.8,className:'mapped-road-fill'}).addTo(layer);
  let coverage=null,frame=null,force=false,lastWeight='',removed=false;
  function refresh(){
    frame=null;if(removed)return;
    const zoom=map.getZoom(),size=map.getSize();if(!size.x||!size.y)return;
    if(force||!coverage||!coverage.contains(map.getBounds())){
      // A square based on the screen diagonal covers every heading plus a pan
      // margin. Ordinary camera movement reuses this geometry unchanged.
      const centre=map.project(map.getCenter(),zoom),radius=Math.hypot(size.x,size.y)*.8;
      coverage=L.latLngBounds(map.unproject(centre.subtract([radius,radius]),zoom),map.unproject(centre.add([radius,radius]),zoom));
      const roads=index.select(coverage);outline.setLatLngs(roads);fill.setLatLngs(roads);force=false;
    }
    const weights=zoom>=18?[8,5]:zoom>=16?[6,3.5]:zoom>=14?[3.5,1.5]:[2,1];
    const key=weights.join(':');if(key!==lastWeight){lastWeight=key;outline.setStyle({weight:weights[0]});fill.setStyle({weight:weights[1]});}
  }
  function schedule(event){
    if(event.type==='zoomend'||event.type==='resize')force=true;
    if(frame===null)frame=requestAnimationFrame(refresh);
  }
  map.on('move rotate zoomend resize',schedule);
  map.once('unload',()=>{removed=true;map.off('move rotate zoomend resize',schedule);if(frame!==null)cancelAnimationFrame(frame);});
  refresh();return layer;
}
