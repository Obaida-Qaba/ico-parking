import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildGraph,routeRoads,distanceMetres} from '../public/navigation.mjs';

mkdirSync('test-results',{recursive:true});
const catalogue=JSON.parse(readFileSync('public/destinations.json','utf8'));
const graph=buildGraph(JSON.parse(readFileSync('public/roads.json','utf8')));
const target=catalogue.destinations['south:HC1'];
assert.ok(target,'HC1 built-in destination exists');
const end=[target.lat,target.lon];
let start;
for(const point of graph.nodes.values()){
  const direct=distanceMetres(point,end);
  if(direct<150||direct>300)continue;
  const route=routeRoads(graph,point,end);
  if(route.available&&route.distance<1000){start=point;break;}
}
assert.ok(start,'connected geographic road fixture near HC1');
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const errors=[];

async function fixture(viewport,{mobile=false,forceFallback=false}={}){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(({position,forceFallback})=>{
    window.__gpsStarts=0;
    window.__gpsStops=0;
    navigator.geolocation.watchPosition=ok=>{
      window.__gpsStarts++;
      window.__gpsFix=ok;
      ok({timestamp:Date.now(),coords:{latitude:position[0],longitude:position[1],accuracy:5,heading:35,speed:2}});
      return 29;
    };
    navigator.geolocation.clearWatch=()=>window.__gpsStops++;
    if(forceFallback){
      Object.defineProperty(Element.prototype,'requestFullscreen',{
        configurable:true,
        value:()=>Promise.reject(new DOMException('Fullscreen unavailable in test browser','NotAllowedError'))
      });
    }
  },{position:start,forceFallback});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(base+'/?map=south&parking=HC1&line=15');
  await page.locator('.destination-code').waitFor();
  // Observe geographic route vertices, rather than SVG pixel coordinates that change on resize.
  await page.evaluate(()=>{
    const original=L.polyline;
    L.polyline=function(points,options){
      if(options?.className==='road-route')window.__routePoints=points.map(p=>Array.from(p));
      return original.apply(this,arguments);
    };
  });
  return {context,page};
}

async function snapshot(page){
  return page.evaluate(()=>({
    destination:document.getElementById('navigation-destination').textContent,
    distance:document.getElementById('navigation-distance').textContent,
    points:window.__routePoints,
    starts:window.__gpsStarts,
    stops:window.__gpsStops
  }));
}

async function assertMapViewport(page,message){
  const dimensions=await page.evaluate(()=>{
    const map=document.getElementById('map').getBoundingClientRect();
    return {left:map.left,top:map.top,right:map.right,bottom:map.bottom,
      area:map.width*map.height,viewport:innerWidth*innerHeight,
      noOverflow:document.documentElement.scrollWidth<=innerWidth};
  });
  assert.ok(dimensions.area/dimensions.viewport>.85,message+' uses over 85% of viewport for map');
  assert.ok(dimensions.noOverflow,message+' has no horizontal page overflow');
  assert.ok(dimensions.left>=-1&&dimensions.right<=await page.evaluate(()=>innerWidth+1),message+' map stays in viewport width');
}

async function startNavigation(page){
  await page.locator('#route-button').click();
  await page.locator('.road-route').waitFor();
  await page.waitForFunction(()=>document.body.classList.contains('navigating'));
  assert.equal(await page.locator('.topbar').isVisible(),false,'branding is hidden while navigating');
  assert.equal(await page.locator('.sidebar').isVisible(),false,'destination sidebar is hidden while navigating');
  assert.equal(await page.locator('#map-options-panel').isVisible(),false,'map options are initially closed');
  assert.equal(await page.locator('#navigation-detail').isVisible(),false,'long route explanation is not on the driving map');
  assert.ok(await page.locator('#map-options-panel').evaluate(el=>el.contains(document.getElementById('navigation-detail'))),'route details live inside map options');
  await assertMapViewport(page,'Navigation');
}

async function testOptions(page){
  await page.locator('#map-options').click();
  await page.locator('#map-options-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('#plan-view').isVisible(),true,'plan switch remains reachable in options');
  assert.equal(await page.locator('#street-view').isVisible(),true,'street switch remains reachable in options');
  assert.equal(await page.locator('#map-library').isVisible(),true,'terminal library remains reachable in options');
  await page.locator('#map-options').click();
  await page.locator('#map-options-panel').waitFor({state:'hidden'});
}

try{
  const mobile=await fixture({width:390,height:844},{mobile:true,forceFallback:true});
  const mp=mobile.page;
  await startNavigation(mp);
  const original=await snapshot(mp);
  assert.ok(original.points?.length>1,'route geographic vertices captured');
  await testOptions(mp);
  await mp.locator('#map-fullscreen').click();
  await mp.waitForFunction(()=>document.body.classList.contains('map-fullscreen'));
  assert.equal(await mp.evaluate(()=>document.fullscreenElement===null),true,'forced rejection uses CSS fallback');
  assert.match(await mp.locator('#map-fullscreen').innerText(),/Exit full screen/i);
  await assertMapViewport(mp,'Mobile fullscreen fallback');
  await testOptions(mp);
  assert.deepEqual(await snapshot(mp),original,'entering fallback and opening options preserve GPS and route vertices');
  await mp.screenshot({path:'test-results/mobile-map-fullscreen-simulated-gps.png',fullPage:true});
  await mp.setViewportSize({width:844,height:390});
  await assertMapViewport(mp,'Landscape fullscreen fallback');
  assert.ok((await mp.locator('#map').boundingBox()).height<=391,'landscape has no minimum-height overflow');
  await mp.screenshot({path:'test-results/landscape-map-fullscreen-simulated-gps.png',fullPage:true});
  await mp.setViewportSize({width:390,height:844});
  await mp.locator('#map-fullscreen').click();
  await mp.waitForFunction(()=>!document.body.classList.contains('map-fullscreen'));
  assert.deepEqual(await snapshot(mp),original,'explicit fullscreen exit preserves destination/GPS/route');
  await assertMapViewport(mp,'Navigation after fullscreen exit');
  await mp.locator('#map-fullscreen').click();
  await mp.waitForFunction(()=>document.body.classList.contains('map-fullscreen'));
  await mp.keyboard.press('Escape');
  await mp.waitForFunction(()=>!document.body.classList.contains('map-fullscreen'));
  assert.deepEqual(await snapshot(mp),original,'Escape exits fallback without clearing destination or route');
  await testOptions(mp);
  await mobile.context.close();
  console.log('PASS mobile map UI: compact navigation, >85% map viewport, fullscreen rejection fallback, explicit/Escape exit, accessible options, unchanged GPS and route');

  const desktop=await fixture({width:1280,height:900});
  const dp=desktop.page;
  await startNavigation(dp);
  const desktopOriginal=await snapshot(dp);
  await dp.locator('#map-fullscreen').click();
  await dp.waitForFunction(()=>document.body.classList.contains('map-fullscreen'));
  await dp.waitForFunction(()=>['native','fallback'].includes(document.body.dataset.fullscreenMode));
  const native=await dp.evaluate(()=>!!document.fullscreenElement);
  await assertMapViewport(dp,'Desktop fullscreen');
  await testOptions(dp);
  await dp.locator('#map-options').click();await dp.locator('#source').click();
  await dp.locator('dialog[open]').waitFor();
  assert.equal(await dp.locator('#info-dialog').isVisible(),true,'source dialog remains visible in document fullscreen');
  await dp.locator('#close-dialog').click();
  await dp.locator('#map-options').click();
  await dp.locator('#map-fullscreen').click();
  await dp.waitForFunction(()=>!document.body.classList.contains('map-fullscreen')&&!document.fullscreenElement);
  assert.deepEqual(await snapshot(dp),desktopOriginal,'desktop fullscreen enter/exit preserves GPS and route');
  await desktop.context.close();
  console.log(`PASS desktop map UI: ${native?'native':'fallback'} fullscreen, exit and route state preserved`);
  assert.deepEqual(errors,[],'no uncaught browser errors');
}finally{await browser.close();}
