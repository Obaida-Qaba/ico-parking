import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolveDestination} from '../public/destinations.mjs';
import {auditOrigins,auditChoices,auditInputHash} from '../scripts/lib/parking-audit.mjs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';
const files=Object.fromEntries(['data.json','destinations.json','roads.json'].map(name=>[name,readFileSync('public/'+name)]));
const digest=auditInputHash;
const inputSHA256=Object.fromEntries(Object.entries(files).map(([name,buffer])=>[name,digest(buffer)]));
const atlas=JSON.parse(files['data.json']),catalogue=JSON.parse(files['destinations.json']);
const graph=buildGraph(JSON.parse(files['roads.json'])),origins=auditOrigins(catalogue);
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
async function servedHashes(){
 return Object.fromEntries(await Promise.all(Object.keys(files).map(async name=>{
  const url=new URL(name,base+'/');url.searchParams.set('audit',Date.now());
  const response=await fetch(url,{cache:'no-store'});assert.equal(response.ok,true,'served audit input '+name);
  return [name,digest(Buffer.from(await response.arrayBuffer()))];
 })));
}
const servedInputSHA256=await servedHashes();
assert.deepEqual(servedInputSHA256,inputSHA256,'served catalogue/roads must match the complete local fixture inventory');
const fixtures=[];
for(const map of atlas.maps)for(const parking of map.parkings)for(const hit of auditChoices({map,parking,line:'15'},catalogue)){
 const pin=resolveDestination(hit,{},catalogue),choices=origins[map.id]||[];
 const origin=(choices.find(start=>!pin||distanceMetres(start.point,[pin.lat,pin.lon])>25)||choices[0])?.point||[51.30217,3.22683];
 fixtures.push({key:map.id+':'+parking.code+(hit.approach?'@'+hit.approach:''),map:map.id,code:parking.code,approach:hit.approach||null,approachName:hit.approachName||null,routingScope:pin?.routingScope||null,sourcePoints:hit.approachSourceIndices?.length||parking.points.length,origin,target:pin?[pin.lat,pin.lon]:null,expected:pin?routeRoads(graph,origin,[pin.lat,pin.lon]):null});
}
const limitArg=process.argv.find(arg=>arg.startsWith('--limit=')),limit=limitArg?Number(limitArg.split('=')[1]):fixtures.length;
const cases=fixtures.slice(0,limit),browser=await chromium.launch(),results=[];
let next=0;
mkdirSync('test-results',{recursive:true});
try{
 await Promise.all(Array.from({length:Math.min(3,cases.length)},async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(fixtures=>{
   const p=new URLSearchParams(location.search),key=p.get('map')+':'+p.get('parking')+(p.get('approach')?'@'+p.get('approach'):'');
   const fixture=fixtures.find(f=>f.key===key),origin=fixture?.origin||[51.30217,3.22683];
   navigator.geolocation.watchPosition=ok=>{ok({timestamp:Date.now(),coords:{latitude:origin[0],longitude:origin[1],accuracy:3,speed:0,heading:null}});return 701;};
   navigator.geolocation.clearWatch=()=>{};
  },cases);
  const page=await context.newPage();page.setDefaultTimeout(6500);
  let pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  while(next<cases.length){
   const item=cases[next++],result={key:item.key,hasBuiltInRoute:!!item.target,routingScope:item.routingScope,uiPassed:false};pageErrors=[];
   try{
    const url=new URL(base+'/');url.searchParams.set('map',item.map);url.searchParams.set('parking',item.code);url.searchParams.set('line','15');if(item.approach)url.searchParams.set('approach',item.approach);
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.locator('.destination-code').waitFor();assert.equal(await page.locator('.destination-code').innerText(),item.code);
    assert.equal(await page.locator('dialog[open]').count(),0,'no GPS-recording prompt');
    const button=await page.locator('#route-button').innerText();
    if(item.target){
     assert.match(button,item.routingScope==='terminal-internal'?/Route inside Nissan/:/Start route/);assert.equal(item.expected.available,true,'the tested origin has a connected route');
     await page.locator('#route-button').click();await page.locator('.road-route').waitFor();
     assert.equal(await page.locator('.mapped-road-fill').count()>0,true,'roads remain visible');
     const name=await page.locator('#navigation-destination').innerText();assert.ok(name.includes(item.code));assert.ok(name.includes('line 15'));if(item.approachName)assert.ok(name.includes(item.approachName));
     const text=await page.locator('#navigation-distance').innerText(),metres=parseFloat(text)*(text.includes('km')?1000:1);
     assert.ok(Math.abs(metres-item.expected.distance)<(text.includes('km')?55:2),'displayed distance matches the connected road route');
     result.distanceMetres=item.expected.distance;
    }else{
     assert.match(button,/View parking/);await page.locator('#route-button').click();
     await page.waitForFunction(()=>document.querySelector('.leaflet-image-layer')?.naturalWidth>0);
     assert.equal(await page.locator('.destination-marker').count(),item.sourcePoints,'every source position remains available');
     result.limitation='No confirmed geographic arrival point; source-plan fallback only';
    }
    assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null);
    assert.deepEqual(pageErrors,[]);result.uiPassed=true;
   }catch(error){result.error=error.message;await page.screenshot({path:'test-results/all-parking-failure-'+item.key.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true}).catch(()=>{});}
   results.push(result);if(results.length%40===0)console.log('Audited '+results.length+'/'+cases.length+' parking choices');
  }
  await context.close();
 }));
}finally{await browser.close();}
const servedFinalSHA256=await servedHashes(),inputStable=Object.keys(files).every(name=>servedFinalSHA256[name]===inputSHA256[name]);
const report={base,generatedAt:new Date().toISOString(),inputHashFormat:'SHA256 of JSON.stringify(JSON.parse(file)); whitespace and line endings ignored.',inputSHA256,servedInputSHA256,servedFinalSHA256,inputStable,allSourceReferences:atlas.maps.reduce((n,map)=>n+map.parkings.length,0),allChoices:fixtures.length,checked:results.length,completeRun:results.length===fixtures.length&&inputStable,uiFailures:results.filter(r=>!r.uiPassed).length,missingDestinations:results.filter(r=>!r.hasBuiltInRoute).length,limitedRoutingChoices:results.filter(r=>r.routingScope==='terminal-internal').length,results:results.sort((a,b)=>a.key.localeCompare(b.key))};
const host=['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)?'local':'live';
const path='test-results/all-parking-browser-'+host+(limitArg?'-smoke':'')+'.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checked:report.checked,total:report.allChoices,uiFailures:report.uiFailures,missingDestinations:report.missingDestinations,completeRun:report.completeRun,report:path}));
if(report.uiFailures||!inputStable||!process.argv.includes('--report-only')&&(report.missingDestinations||report.limitedRoutingChoices||!report.completeRun))process.exitCode=1;
