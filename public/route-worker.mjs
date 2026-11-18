import {routeRoads} from './navigation.mjs';

let graph=null;
self.addEventListener('message',event=>{
  const message=event.data;
  if(message?.type==='init'){graph=message.graph;return;}
  if(message?.type!=='route')return;
  const {id,start,end,options}=message;
  try{
    if(!graph)throw new Error('Road graph has not been loaded');
    self.postMessage({type:'route',id,route:routeRoads(graph,start,end,options)});
  }catch(error){
    self.postMessage({type:'route',id,error:{name:error.name,message:error.message}});
  }
});
