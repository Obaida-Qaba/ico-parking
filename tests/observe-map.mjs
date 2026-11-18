/** Observe initial map creation without adding test hooks to the application. */
export async function observeMap(context,property='__map'){
  await context.addInitScript(name=>{
    let leaflet;
    Object.defineProperty(window,'L',{configurable:true,enumerable:true,get:()=>leaflet,set(api){
      leaflet=api;let factory;
      const wrap=fn=>function(...args){const map=fn.apply(this,args);window[name]=map;return map;};
      if(api.map)factory=wrap(api.map);
      Object.defineProperty(api,'map',{configurable:true,enumerable:true,get:()=>factory,set(fn){factory=wrap(fn);}});
    }});
  },property);
}
