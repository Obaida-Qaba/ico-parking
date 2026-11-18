const normalize=degrees=>((degrees%360)+360)%360;
export function screenHeading(course,mapBearing){return normalize(course+mapBearing);}
export function courseBetween(a,b){
  const rad=Math.PI/180,lat1=a[0]*rad,lat2=b[0]*rad,dlon=(b[1]-a[1])*rad;
  return normalize(Math.atan2(Math.sin(dlon)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlon))/rad);
}
function distance(a,b){
  const rad=Math.PI/180,x=(b.lon-a.lon)*rad*Math.cos((a.lat+b.lat)*rad/2),y=(b.lat-a.lat)*rad;
  return Math.hypot(x,y)*6371008.8;
}
/** Use a reliable travel course; retain it through stops and reject GPS drift. */
export function createCourseTracker(){
  let heading=null,anchor=null,timestamp=-Infinity;
  return {
    get heading(){return heading;},
    update(fix){
      if(!fix||!Number.isFinite(fix.lat)||!Number.isFinite(fix.lon)||!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>35||fix.timestamp<timestamp)return heading;
      timestamp=fix.timestamp;
      if(Number.isFinite(fix.speed)&&fix.speed<.7){anchor=fix;return heading;}
      if(Number.isFinite(fix.heading)&&fix.heading>=0&&fix.heading<=360){heading=normalize(fix.heading);anchor=fix;return heading;}
      if(!anchor){anchor=fix;return heading;}
      const threshold=Math.max(5,Math.min(20,(anchor.accuracy+fix.accuracy)*.6));
      if(distance(anchor,fix)>=threshold&&fix.timestamp-anchor.timestamp>=500){heading=courseBetween([anchor.lat,anchor.lon],[fix.lat,fix.lon]);anchor=fix;}
      return heading;
    }
  };
}
