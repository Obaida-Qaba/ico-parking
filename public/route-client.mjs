import {routeRoads} from './navigation.mjs';

/** Keep the unchanged road search off the UI thread. Older browsers without
 * Workers retain the same routing rules through an asynchronous local fallback. */
export function createRouteClient({workerFactory}={}) {
  let worker=null,graph=null,pending=null,sequence=0,disposed=false,failure=null;
  const asError=value=>{
    const error=new Error(value?.message||String(value||'Road worker failed'));
    if(value?.name)error.name=value.name;
    return error;
  };
  function cancel(){
    if(pending){pending.resolve(null);pending=null;}
  }
  function fail(value){
    failure=asError(value);
    if(pending){pending.reject(failure);pending=null;}
    worker?.terminate();
  }
  function receive(event){
    const message=event.data;
    if(message?.type!=='route'||message.id!==pending?.id)return;
    const request=pending;pending=null;
    if(message.error)request.reject(asError(message.error));
    else request.resolve(message.route);
  }
  function onError(event){event.preventDefault?.();fail(event);}
  function onMessageError(){fail(new Error('Road worker response could not be read'));}
  if(workerFactory||typeof Worker==='function'){
    try{
      worker=workerFactory?workerFactory():new Worker(new URL('./route-worker.mjs',import.meta.url),{type:'module',name:'portway-route'});
      worker.addEventListener('message',receive);
      worker.addEventListener('error',onError);
      worker.addEventListener('messageerror',onMessageError);
    }catch(error){fail(error);}
  }
  function loadGraph(nextGraph){
    if(disposed)throw new Error('Route client disposed');
    if(failure)throw failure;
    if(graph===nextGraph)return;
    cancel();graph=nextGraph;
    try{worker?.postMessage({type:'init',graph});}catch(error){fail(error);throw failure;}
  }
  function route(start,end,options={}){
    if(disposed)return Promise.reject(new Error('Route client disposed'));
    if(failure)return Promise.reject(failure);
    if(!graph)return Promise.reject(new Error('Road graph has not been loaded'));
    cancel();
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      pending={id,resolve,reject};
      if(worker){
        try{worker.postMessage({type:'route',id,start,end,options});}catch(error){fail(error);}
      }else{
        // A microtask also lets a newer fix or cancellation invalidate this work
        // before the compatibility fallback begins its synchronous search.
        Promise.resolve().then(()=>{
          if(pending?.id!==id)return;
          try{receive({data:{type:'route',id,route:routeRoads(graph,start,end,options)}});}
          catch(error){receive({data:{type:'route',id,error}});}
        });
      }
    });
  }
  function dispose(){
    if(disposed)return;
    disposed=true;cancel();graph=null;
    worker?.removeEventListener('message',receive);
    worker?.removeEventListener('error',onError);
    worker?.removeEventListener('messageerror',onMessageError);
    worker?.terminate();
  }
  return {loadGraph,route,cancel,dispose};
}
