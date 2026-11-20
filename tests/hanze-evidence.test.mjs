import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {distanceMetres} from '../public/navigation.mjs';

const catalogue=JSON.parse(readFileSync(new URL('../public/destinations.json',import.meta.url)));
const atlas=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const south=atlas.maps.find(map=>map.id==='south');
const point=code=>catalogue.destinations['south:'+code];
const position=p=>[p.lat,p.lon];

test('H65 identifies the supported shared H64 corner without placing its label on the railway',()=>{
 const h65=point('H65'),h64=point('H64');
 assert.ok(h65&&h64);
 assert.equal(h65.scope,'parking-group-approach');
 assert.equal(h65.labelPosition.sharedParking,'H64');
 assert.ok(distanceMetres(position(h65.labelPosition),position(h64.labelPosition))<.2,'use the supported H64 compound reference, not an invented individual H65 strip');
 assert.ok(distanceMetres(position(h65.labelPosition),[51.29467034248107,3.248289227668598])>30,'the label leaves the railway side of the fence');
 assert.ok(distanceMetres(position(h65),[51.2947685,3.2480711])<.2,'keep the existing actual access-road arrival');
 assert.equal(h65.roadWay,'746744790');
 assert.match(h65.basis,/callout.*H64|H64.*callout/i);
 assert.equal(h65.lineExact,false);
});

test('Hanze records distinguish the matched local plane from actual printed source label bounds',()=>{
 const reviewed=Object.entries(catalogue.destinations).filter(([key,p])=>key.startsWith('south:')&&p.region?.startsWith('hanze-')&&p.matchModelBounds);
 assert.equal(reviewed.length,64,'the four unsupported DR model boxes are no longer emitted');
 for(const code of ['DRALD','DRTOY','DRWWL','DRFLX'])assert.equal(point(code)?.matchModelBounds,undefined,'source callouts must not acquire invented parking cells');
 for(const [key,p] of reviewed){
  assert.equal(p.matchModelCoordinates.space,'hanze-local-landmark-plane');
  assert.match(p.matchModelCoordinates.basis,/not.*PDF|different.*PDF/i);
  assert.equal(p.sourceBoundsScope,'printed-parking-label-glyph');
  assert.match(p.sourceBoundsBasis,/not.*parking.*footprint/i);
  const [x0,y0,x1,y1]=p.sourceBounds,[x,y]=p.sourcePoint;
  assert.ok(x>=x0&&x<=x1&&y>=y0&&y<=y1,key+' retains the actual PDF label point inside its verified glyph bounds');
  const parking=south.parkings.find(q=>q.code===p.parking);
  assert.ok(parking,key+' is a current indexed source reference');
  assert.ok(Math.abs(x-parking.x/3)<.003&&Math.abs(y-parking.y/3)<.003,key+' preserves the actual indexed source point');
 }
 const h1=point('H1');
 assert.deepEqual(h1.matchModelBounds,[638,553,668,577],'keep its independently matched physical cell plane');
 assert.ok(Math.abs(h1.sourceBounds[0]-581.7603)<.01&&Math.abs(h1.sourceBounds[1]-568.5419)<.01,'H1 source bounds come from its actual visible text glyph');
 assert.ok(h1.sourcePoint[0]<h1.matchModelBounds[0],'a mixed-plane comparison must not move the correctly ordered H1 road cell');
 assert.ok(distanceMetres(position(h1),[51.303165,3.2364432])<.2,'the metadata repair does not change the existing H1 arrival');
});
