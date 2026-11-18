import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph} from '../public/navigation.mjs';

let createRouteClient;
try{({createRouteClient}=await import('../public/route-client.mjs'));}catch{}

function workerFixture(){
 const listeners=new Map(),messages=[];
 return {
  messages,
  addEventListener(type,callback){listeners.set(type,callback);},
  removeEventListener(type){listeners.delete(type);},
  postMessage(message){messages.push(message);},
  terminate(){},
  receive(data){listeners.get('message')?.({data});},
  fail(message){listeners.get('error')?.({message,preventDefault(){}});}
 };
}
const graph=()=>buildGraph({ways:[{id:'road',nodes:['a','b'],points:[[51.3,3.23],[51.3,3.231]]}]});
function setup(){
 assert.equal(typeof createRouteClient,'function','the asynchronous route client is not implemented');
 const worker=workerFixture(),client=createRouteClient({workerFactory:()=>worker});
 client.loadGraph(graph());
 return {worker,client};
}
const routes=worker=>worker.messages.filter(message=>message.type==='route');

test('only the newest route can resolve with geometry when replies arrive out of order',async()=>{
 const {worker,client}=setup();
 const previous=client.route([51.3,3.23],[51.3,3.231],{heading:90,accuracy:3});
 const latest=client.route([51.3,3.2302],[51.3,3.231],{heading:90,accuracy:3});
 const [first,second]=routes(worker),wanted={available:true,points:[[51.3,3.2302],[51.3,3.231]],distance:55};
 worker.receive({type:'route',id:second.id,route:wanted});
 worker.receive({type:'route',id:first.id,route:{available:true,distance:70}});
 assert.equal(await previous,null,'superseded geometry is discarded');
 assert.deepEqual(await latest,wanted);
 client.dispose();
});

test('cancelling a route discards its late response and allows a fresh route',async()=>{
 const {worker,client}=setup();
 const pending=client.route([51.3,3.23],[51.3,3.231]);
 const cancelled=routes(worker).at(-1);
 client.cancel();
 assert.equal(await pending,null);
 const fresh=client.route([51.3,3.2305],[51.3,3.231]);
 const newest=routes(worker).at(-1);
 worker.receive({type:'route',id:cancelled.id,route:{available:true,distance:70}});
 worker.receive({type:'route',id:newest.id,route:{available:true,distance:35}});
 assert.equal((await fresh).distance,35);
 client.dispose();
});

test('worker execution failures reject the current route instead of returning geometry',async()=>{
 const {worker,client}=setup();
 const pending=client.route([51.3,3.23],[51.3,3.231]);
 const rejection=assert.rejects(pending,/road worker failed/);
 worker.fail('road worker failed');
 await rejection;
 await assert.rejects(client.route([51.3,3.23],[51.3,3.231]),/road worker failed/);
 client.dispose();
});

test('a reported route failure preserves its error and does not strand the next request',async()=>{
 const {worker,client}=setup();
 const pending=client.route([51.3,3.23],[51.3,3.231]);
 const request=routes(worker).at(-1),rejection=assert.rejects(pending,/Road graph unavailable/);
 worker.receive({type:'route',id:request.id,error:{name:'Error',message:'Road graph unavailable'}});
 await rejection;
 const next=client.route([51.3,3.23],[51.3,3.231]);
 worker.receive({type:'route',id:routes(worker).at(-1).id,route:{available:false,reason:'No allowed road connection'}});
 assert.deepEqual(await next,{available:false,reason:'No allowed road connection'});
 client.dispose();
});

test('disposing invalidates pending work and rejects later routing requests',async()=>{
 const {client}=setup();
 const pending=client.route([51.3,3.23],[51.3,3.231]);
 client.dispose();
 assert.equal(await pending,null);
 await assert.rejects(client.route([51.3,3.23],[51.3,3.231]),/disposed/i);
});

test('an environment without Workers can still route along a one-way road asynchronously',async()=>{
 assert.equal(typeof createRouteClient,'function','the asynchronous route client is not implemented');
 const client=createRouteClient();
 client.loadGraph(buildGraph({ways:[{id:'road',nodes:['a','b'],points:[[51.3,3.23],[51.3,3.231]],oneway:true}]}));
 const forward=await client.route([51.3,3.2302],[51.3,3.2308],{maxSnap:2});
 const backward=await client.route([51.3,3.2308],[51.3,3.2302],{maxSnap:2});
 assert.equal(forward.available,true);
 assert.ok(forward.distance>41&&forward.distance<42,'the route follows the measured 0.0006° road interval');
 assert.equal(backward.available,false,'fallback preserves one-way restrictions');
 client.dispose();
});
