/** Draw the corrected road network independently of external background tiles. */
export function createRoadMap(map,graph){
  const pane=map.getPane('mappedRoads')||map.createPane('mappedRoads',map.getPane('overlayPane'));
  pane.style.zIndex='-1';
  const layer=L.layerGroup().addTo(map);
  // Independent segments remain separate subpaths, including at excluded links.
  // Two SVG paths keep the complete network inexpensive on phones.
  const roads=graph.segments.map(segment=>[segment.pa,segment.pb]);
  const outline=L.polyline(roads,{pane:'mappedRoads',color:'#719386',opacity:1,weight:6,interactive:false,className:'mapped-road-outline'}).addTo(layer);
  const fill=L.polyline(roads,{pane:'mappedRoads',color:'#fff',opacity:1,weight:3.5,interactive:false,className:'mapped-road-fill'}).addTo(layer);
  function resize(){
    const zoom=map.getZoom(),weights=zoom>=18?[8,5]:zoom>=16?[6,3.5]:zoom>=14?[3.5,1.5]:[2,1];
    outline.setStyle({weight:weights[0]});fill.setStyle({weight:weights[1]});
  }
  map.on('zoomend',resize);map.once('unload',()=>map.off('zoomend',resize));resize();
  return layer;
}
