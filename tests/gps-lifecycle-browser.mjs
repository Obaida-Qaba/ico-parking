import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const roads=readFileSync(new URL('../public/roads.json',import.meta.url),'utf8');
const browser=await chromium.launch();
try{
 for(const action of ['denied','stopped','cleared','worker-failed']){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(workerFailed=>{
   window.__gpsLifecycleRouteRequests=0;
   const BrowserWorker=window.Worker;
   window.Worker=class extends BrowserWorker{
    constructor(...args){if(workerFailed)throw new Error('Simulated worker construction failure');super(...args);}
    postMessage(message,...args){
     if(message?.type==='init')window.__gpsLifecycleGraphInitialized=true;
     if(message?.type==='route')window.__gpsLifecycleRouteRequests++;
     return super.postMessage(message,...args);
    }
   };
   navigator.geolocation.watchPosition=(ok,fail)=>{
    window.__gpsLifecycleFail=fail;
    ok({timestamp:Date.now(),coords:{latitude:51.3019,longitude:3.2270544,accuracy:3,heading:0,speed:6}});
    return 72;
   };
   navigator.geolocation.clearWatch=()=>{};
  },action==='worker-failed');
  let releaseRoads,requested=false;
  const roadGate=new Promise(resolve=>{releaseRoads=resolve;});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/roads.json',async request=>{
   requested=true;await roadGate;
   await request.fulfill({status:200,contentType:'application/json',body:roads});
  });
  try{
   await page.goto(base+'/?map=south&parking=HC1');
   await page.locator('#route-button').click();
   assert.ok(requested,'navigation is waiting for the intercepted road graph');
   if(action==='denied'){
    await page.evaluate(()=>window.__gpsLifecycleFail({code:1}));
    assert.equal(await page.locator('#navigation-instruction').innerText(),'Allow GPS to navigate');
   }else if(action==='stopped')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   else if(action==='cleared')await page.locator('#stop-navigation').click();
   releaseRoads();
   await page.locator('.mapped-road-fill').waitFor({state:'attached'});
   assert.equal(await page.evaluate(()=>window.__gpsLifecycleRouteRequests),0,`${action}: graph completion must not start routing after cancellation`);
   assert.equal(await page.locator('.road-route').count(),0,`${action}: delayed graph must not restore a cancelled route`);
   if(action==='denied'){
    assert.equal(await page.locator('#navigation-instruction').innerText(),'Allow GPS to navigate','permission denial survives a pending graph load');
    assert.equal(await page.locator('#gps-toggle').innerText(),'Start GPS');
   }else if(action==='worker-failed'){
    await page.waitForFunction(()=>document.getElementById('navigation-instruction').textContent==='Road data unavailable');
    assert.ok(await page.locator('.mapped-road-fill').isVisible(),'worker failure preserves rendered roads');
    assert.ok(await page.locator('.gps-dot').isVisible(),'worker failure preserves the GPS marker');
    assert.ok((await page.locator('#gps-text').innerText()).startsWith('GPS live'),'worker failure preserves live GPS status');
   }else assert.equal(await page.locator('#navigation-panel').isVisible(),false,`${action}: navigation remains closed`);
   assert.deepEqual(errors,[]);
  }finally{releaseRoads();await context.close();}
 }
 console.log('PASS GPS lifecycle: cancelled GPS/navigation stay cancelled after a delayed graph; failed routing worker preserves roads and live location');
}finally{await browser.close();}
