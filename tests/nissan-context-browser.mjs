import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';

mkdirSync('test-results',{recursive:true});
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const codes=atlas.maps.find(map=>map.id==='nissan').parkings.map(parking=>parking.code).sort();
assert.equal(codes.length,14,'the reviewed Nissan source has fourteen indexed codes');
assert.ok(codes.includes('V'),'the repeated V source label is indexed');
const base=(process.env.PORTWAY_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch();
const errors=[];

async function freshDevice(position){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(position=>{
  window.__nissanStarts=0;window.__nissanStops=0;
  navigator.geolocation.watchPosition=ok=>{
   window.__nissanStarts++;
   window.__nissanEmit=point=>ok({timestamp:Date.now(),coords:{latitude:point[0],longitude:point[1],accuracy:3,heading:null,speed:0}});
   window.__nissanEmit(position);return 4070;
  };
  navigator.geolocation.clearWatch=()=>window.__nissanStops++;
 },position);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/');await page.locator('.map-card').last().waitFor({state:'attached'});
 await page.locator('.gps-dot').waitFor();
 assert.equal(await page.locator('#terminal-filter').inputValue(),'auto','fresh devices use automatic search context');
 return {context,page};
}

async function tracking(page,label){
 assert.equal(await page.evaluate(()=>window.__nissanStarts),1,label+': location/context changes keep one GPS watch');
 assert.equal(await page.evaluate(()=>window.__nissanStops),0,label+': GPS tracking is not stopped');
 assert.equal(await page.locator('dialog[open]').count(),0,label+': no GPS recording dialog');
 assert.equal(await page.evaluate(()=>localStorage.getItem('portway-gps-pins')),null,label+': no saved GPS point is needed for search context');
}

async function nissanContext(page,label){
 await page.waitForFunction(()=>document.getElementById('location-context').textContent==='Near Nissan');
 assert.equal(await page.locator('[data-map="nissan"]').getAttribute('aria-pressed'),'true',label+': the Nissan source map is current');
 assert.match(await page.locator('#terminal-filter option[value="auto"]').textContent(),/Nissan/,label+': automatic area names Nissan');
 await page.locator('#destination').fill('V');
 await page.waitForFunction(()=>{
  const first=document.querySelector('.result-row');
  return first?.dataset.terminal==='nissan'&&first.dataset.preferred==='true'&&Number(getComputedStyle(document.getElementById('search-results')).opacity)>.99;
 });
 const rows=await page.locator('.result-row').evaluateAll(rows=>rows.map(row=>({terminal:row.dataset.terminal,preferred:row.dataset.preferred,code:row.querySelector('strong').textContent})));
 assert.equal(rows[0].code,'V',label+': exact V is the first Nissan result');
 const local=rows.filter(row=>row.terminal==='nissan');
 assert.deepEqual([...new Set(local.map(row=>row.code))].sort(),codes,label+': all fourteen Nissan source codes are searchable');
 assert.ok(local.every(row=>row.preferred==='true'),label+': every Nissan result has local source preference');
 const firstOther=rows.findIndex(row=>row.terminal!=='nissan');
 assert.ok(firstOther<0||rows.slice(firstOther).every(row=>row.terminal!=='nissan'),label+': Nissan results precede matches from other maps');
 await tracking(page,label);
}

async function move(page,position){
 await page.evaluate(position=>window.__nissanEmit(position),position);
}

try{
 const west=await freshDevice([51.3187,3.2059]);
 await nissanContext(west.page,'Western ICO 4070 position');
 await west.page.screenshot({path:'test-results/nissan-west-context-mobile.png',fullPage:true});
 await move(west.page,[51.301,3.242]);
 await west.page.waitForFunction(()=>document.getElementById('location-context').textContent==='Near Toyota');
 assert.equal(await west.page.locator('[data-map="toyota"]').getAttribute('aria-pressed'),'true','moving to Toyota updates the current source map');
 await tracking(west.page,'Nissan to Toyota');
 await move(west.page,[51.3208,3.2044]);
 await nissanContext(west.page,'Returning to the northwestern ICO 4070 position');
 await move(west.page,[51.326,3.213]);
 await west.page.waitForFunction(()=>/Near Noordelijke/.test(document.getElementById('location-context').textContent));
 assert.equal(await west.page.locator('[data-map="north"]').getAttribute('aria-pressed'),'true','moving north updates the source map');
 await move(west.page,[51.317,3.2105]);
 await west.page.waitForFunction(()=>!document.getElementById('location-context').textContent.includes('Nissan'));
 assert.notEqual(await west.page.locator('[data-map="nissan"]').getAttribute('aria-pressed'),'true','the eastern BNFW position does not switch the current map to Nissan');
 await tracking(west.page,'Moving among terminal contexts');
 await west.context.close();

 const northwest=await freshDevice([51.3208,3.2044]);
 await nissanContext(northwest.page,'Fresh northwestern ICO 4070 position');
 await northwest.page.screenshot({path:'test-results/nissan-northwest-context-mobile.png',fullPage:true});
 await northwest.context.close();

 const east=await freshDevice([51.317,3.2105]);
 assert.doesNotMatch(await east.page.locator('#location-context').innerText(),/Nissan/,'a fresh eastern BNFW position is not reported as Nissan');
 assert.notEqual(await east.page.locator('[data-map="nissan"]').getAttribute('aria-pressed'),'true','a fresh eastern BNFW position does not select the Nissan map');
 await east.page.locator('#destination').fill('V');await east.page.locator('.result-row').first().waitFor();
 const preferred=await east.page.locator('.result-row[data-terminal="nissan"][data-preferred="true"]').count();
 assert.equal(preferred,0,'Nissan remains globally searchable without false local preference in BNFW');
 await tracking(east.page,'Fresh eastern BNFW position');
 await east.context.close();
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS Nissan context: both western ICO 4070 GPS fixtures, all14 source codes including V first, BNFW false-positive excluded, one continuous GPS watch and no recording dialog');
}finally{await browser.close();}
