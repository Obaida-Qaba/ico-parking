import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const context=await browser.newContext({serviceWorkers:'block'});
const page=await context.newPage();
const cdp=await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
try{
 await page.goto(base);
 const result=await page.evaluate(async()=>{
  let createRouteClient;
  try{({createRouteClient}=await import('./route-client.mjs'));}catch{}
  if(typeof createRouteClient!=='function')return {implemented:false};
  const {buildGraph,routeRoads}=await import('./navigation.mjs');
  const data=await fetch('./roads.json').then(response=>response.json());
  const catalogue=await fetch('./destinations.json').then(response=>response.json());
  const graph=buildGraph(data),client=createRouteClient();
  client.loadGraph(graph);
  const keys=['north:BB','south:H61','south:H31'],checks=[],timings=[];
  for(const from of keys)for(const to of keys){
   if(from===to||(!from.startsWith('north:')&&!to.startsWith('north:')))continue;
   const a=catalogue.destinations[from],b=catalogue.destinations[to],start=[a.lat,a.lon],end=[b.lat,b.lon];
   for(const heading of [undefined,90,270]){
    const options={maxSnap:50,accuracy:3,heading},expected=routeRoads(graph,start,end,options);
    let timerBeforeReply=false;
    const before=performance.now(),pending=client.route(start,end,options),dispatchMs=performance.now()-before;
    const timer=setTimeout(()=>{timerBeforeReply=true;},0);
    const actual=await pending;
    clearTimeout(timer);
    checks.push(JSON.stringify(actual)===JSON.stringify(expected));
    timings.push({from,to,heading:heading??null,dispatchMs,timerBeforeReply,elapsedMs:performance.now()-before});
   }
  }
  const a=catalogue.destinations['north:BB'],b=catalogue.destinations['south:H31'];
  const first=client.route([a.lat,a.lon],[b.lat,b.lon],{heading:90,accuracy:3});
  const second=client.route([b.lat,b.lon],[a.lat,a.lon],{heading:270,accuracy:3});
  const rapid={stale:await first,latest:await second};
  const cancelled=client.route([a.lat,a.lon],[b.lat,b.lon]);client.cancel();
  const cancellation=await cancelled;
  client.dispose();
  // A fresh worker with a synthetic junction must retain incoming-road turn rules.
  const point=(x,y)=>[51.3+y*.0001,3.23+x*.0001];
  const rules=createRouteClient();rules.loadGraph(buildGraph({ways:[
   {id:'incoming',nodes:['a','j'],points:[point(0,0),point(10,0)],oneway:true},
   {id:'outgoing',nodes:['j','c'],points:[point(10,0),point(20,0)],oneway:true}
  ],restrictions:[{from:'incoming',via:'j',to:'outgoing',type:'no_straight_on'}]}));
  const forbidden=await rules.route(point(10,0),point(18,0),{heading:90,accuracy:3});
  rules.dispose();
  return {implemented:true,checks,timings,rapid,cancellation,forbidden};
 });
 assert.equal(result.implemented,true,'the asynchronous route client is not implemented');
 assert.ok(result.checks.every(Boolean),'worker transfer preserves complete shortest-road results and heading options');
 assert.equal(result.rapid.stale,null,'superseded route cannot overwrite the newest fix');
 assert.equal(result.rapid.latest.available,true);
 assert.equal(result.cancellation,null,'cancelled destination cannot reappear after the worker reply');
 assert.equal(result.forbidden.available,false,'incoming heading keeps the junction turn restriction');
 assert.ok(result.timings.every(item=>item.timerBeforeReply),'the UI event loop can run while long routes calculate');
 assert.ok(Math.max(...result.timings.map(item=>item.dispatchMs))<25,'dispatching a route does not synchronously execute the long graph search');
 console.log(JSON.stringify({routingWorker:result.timings},null,2));
 console.log('PASS routing worker: exact road routes, headings and turn rules; latest request, cancellation and responsive main thread at 4× CPU');
}finally{await browser.close();}
