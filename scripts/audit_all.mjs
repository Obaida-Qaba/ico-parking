import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {auditParkings,auditInputHash} from './lib/parking-audit.mjs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url));
const files=Object.fromEntries(['data.json','destinations.json','roads.json'].map(name=>[name,read(name)]));
const report=auditParkings({atlas:JSON.parse(files['data.json']),catalogue:JSON.parse(files['destinations.json']),roads:JSON.parse(files['roads.json'])});
report.generatedAt=new Date().toISOString();
report.inputHashFormat='SHA256 of JSON.stringify(JSON.parse(file)); authored key order retained, whitespace and line endings ignored.';
report.inputSHA256=Object.fromEntries(Object.entries(files).map(([key,buffer])=>[key,auditInputHash(buffer)]));
const output=new URL('../test-results/',import.meta.url);mkdirSync(output,{recursive:true});
if(process.argv.includes('--verify-published')){
 const published=JSON.parse(readFileSync(new URL('../public/parking-audit.json',import.meta.url)));
 assert.deepEqual(published.inputSHA256,report.inputSHA256,'published report inputs must match this catalogue and road network');
 assert.deepEqual(published.summary,report.summary,'published audit totals must match the full current audit');
 assert.deepEqual(published.rows,report.rows,'every published reference must retain its actual checks, target and unresolved status');
 const browser=JSON.parse(readFileSync(new URL('../public/parking-browser-audit.json',import.meta.url)));
 assert.deepEqual(browser.inputSHA256,report.inputSHA256,'browser sweep must use the same published data');
 assert.equal(browser.completeRun,true,'browser sweep must cover the complete inventory');
 assert.equal(browser.checked,report.rows.length,'every source reference and area choice must be exercised');
 assert.equal(browser.uiFailures,0,'unexpected UI failures cannot be published as passing checks');
 const expectedKeys=new Set(report.rows.map(row=>row.reference+(row.approach?'@'+row.approach:'')));
 assert.equal(expectedKeys.size,report.rows.length,'declared area identifiers must be unique');
 assert.deepEqual(new Set(browser.results.map(row=>row.key)),expectedKeys,'no parking may disappear from the browser sweep');
 console.log('PASS published full-audit snapshot matches every current reference and input fingerprint.');
}
writeFileSync(new URL('all-parking-audit.json',output),JSON.stringify(report,null,2)+'\n');
const columns=['map','code','approachName','precision','routingScope','sourceIndexed','searchable','routeReady','withinTerminalReady','locationEvidenceConsistent','surveyedDestination','issues'];
const csv=value=>'"'+String(Array.isArray(value)?value.join('; '):value??'').replaceAll('"','""')+'"';
writeFileSync(new URL('all-parking-audit.csv',output),[columns.join(','),...report.rows.map(row=>columns.map(key=>csv(row[key])).join(','))].join('\n')+'\n');
if(process.argv.includes('--publish-report')){
 const destination=new URL('../public/',import.meta.url);
 writeFileSync(new URL('parking-audit.json',destination),JSON.stringify(report,null,2)+'\n');
 writeFileSync(new URL('parking-audit.csv',destination),[columns.join(','),...report.rows.map(row=>columns.map(key=>csv(row[key])).join(','))].join('\n')+'\n');
}
for(const [terminal,result] of Object.entries(report.terminals))console.log(`${terminal}: ${result.routeReady}/${result.references} route checks pass; ${result.missing} missing destinations`);
console.log(JSON.stringify(report.summary));
console.log('Written test-results/all-parking-audit.json and .csv. Accurate individual destinations are NOT established by road connectivity alone.');
if(!report.summary.complete&&!process.argv.includes('--report-only'))process.exitCode=1;
