const drivingMaps=new WeakSet(),rendererViews=new WeakMap();
let installed=false;

function installRendererBuffer(){
  if(installed)return;installed=true;
  const updateBounds=L.Renderer.prototype._update,updateSVG=L.SVG.prototype._update;
  L.Renderer.prototype._update=function(){
    const map=this._map;
    if(!drivingMaps.has(map)||!map._bearing)return updateBounds.call(this);
    // The screen diagonal covers every heading. An extra 15% provides a pan
    // buffer without allocating the rotate plugin's four-diagonal surface.
    const size=map.getSize(),center=map.containerPointToLayerPoint(size.divideBy(2));
    const radius=Math.ceil(Math.hypot(size.x,size.y)*.65);
    this._bounds=L.bounds(center.subtract([radius,radius]).round(),center.add([radius,radius]).round());
    this._center=map.getCenter();this._zoom=map.getZoom();
    this._boundsMinLatLng=map.layerPointToLatLng(this._bounds.min);
  };
  L.SVG.prototype._update=function(){
    const map=this._map;
    if(!drivingMaps.has(map))return updateSVG.call(this);
    const size=map.getSize(),previous=rendererViews.get(this),bounds=this._bounds;
    const origin=map.getPixelOrigin();
    if(bounds&&previous?.size.equals(size)&&previous.origin.equals(origin)&&previous.rotated===Boolean(map._bearing)&&this._zoom===map.getZoom()){
      const corners=[[0,0],[size.x,0],[size.x,size.y],[0,size.y]];
      // Keep the SVG viewBox and paths stable until the viewport approaches a
      // buffer edge. Merely moving the existing surface is handled by CSS.
      if(corners.every(corner=>{
        const point=map.containerPointToLayerPoint(corner);
        return bounds.contains(point.subtract([24,24]))&&bounds.contains(point.add([24,24]));
      }))return;
    }
    rendererViews.set(this,{size:size.clone(),origin:origin.clone(),rotated:Boolean(map._bearing)});
    return updateSVG.call(this);
  };
}

/** Keep continuous driving pans and heading changes on existing map surfaces. */
export function optimizeDrivingMap(map){
  if(!map.options.rotate||drivingMaps.has(map))return map;
  installRendererBuffer();drivingMaps.add(map);
  const setBearing=map.setBearing,commitPan=map._commitRotatePan;
  let changingBearing=false;
  map._commitRotatePan=function(...args){if(!changingBearing)return commitPan.apply(this,args);};
  map.setBearing=function(bearing){
    if(!isFinite(bearing))return setBearing.call(this,bearing);
    const previous=this.getBearing(),next=(bearing%360+360)%360;
    if(next!==previous){
      const pan=this._getMapPanePos();
      // Rotating the existing translation keeps the same geographic center.
      // Resetting the view here would project and rebuild every vector path.
      if(pan&&(pan.x||pan.y))L.DomUtil.setPosition(this._mapPane,pan.rotate((next-previous)*Math.PI/180));
    }
    changingBearing=true;
    try{return setBearing.call(this,bearing);}finally{changingBearing=false;}
  };
  return map;
}

/** Leaflet's ordinary pan rounds to whole CSS pixels. Driving frames retain
 * fractional pixels so a slow-moving map still moves on every display frame. */
export function panDrivingMap(map,offset){
  let delta=L.point(offset);
  if(Math.abs(delta.x)<.01&&Math.abs(delta.y)<.01)return map;
  if(!drivingMaps.has(map))return map.panBy(delta,{animate:false,noMoveStart:true});
  if(map._panAnim?._inProgress){
    const previous=map._getMapPanePos().clone();map.stop();
    delta=delta.add(map._getMapPanePos().subtract(previous));
  }
  if(!map.getSize().contains(delta)){
    const projected=map.project(map.getCenter()).add(delta.rotate(-map.getBearing()*Math.PI/180));
    return map.setView(map.unproject(projected),map.getZoom(),{animate:false});
  }
  map._rawPanBy(delta);
  return map.fire('move').fire('moveend');
}
