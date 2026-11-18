"""Build bounded parking-road approach matches for the current ICO southern plan.

This is NOT a global affine fit of the schematic drawing, and provides no line
coordinates. Regions are matched separately to distinctive physical landmarks.
Each result is projected onto an explicitly identified OSM road, never an
invented line across a parking block. Review these matches when layouts change.
Dependencies: numpy (only when rebuilding; browser has no dependency).
"""
from pathlib import Path
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'public/data.json').read_text(encoding='utf-8'))
ROADS=json.loads((ROOT/'public/roads.json').read_text(encoding='utf-8'))
CURRENT=next(m for m in DATA['maps'] if m['id']=='south')

# PDF points in the current Sept2026 drawing; coordinates are [longitude, latitude].
# Building matches use identifiable MBZ / ZOUT warehouse and VPC footprints.
BASTENAKEN_CONTROLS=[
    {'source':[622.57,260.965],'geo':[3.22399553,51.30117167],'osmWay':'1349890098','landmark':'MBZ warehouse footprint'},
    {'source':[623.91,285.15],'geo':[3.22475433,51.30135505],'osmWay':'1349890062','landmark':'ZOUT warehouse footprint'},
    {'source':[868.91,302.9],'geo':[3.22036,51.30795537],'osmWay':'221621684','landmark':'Vehicle Processing Center footprint'},
]
# The H zone is a different schematic scale and needs its own local fit.
HANZE_CONTROLS=[
    {'source':[191,555],'geo':[3.2430322,51.2949252],'osmWay':'87646848','landmark':'Southern basin east-bank corner'},
    {'source':[191,425],'geo':[3.2379006,51.2932967],'osmWay':'87646848','landmark':'Southern basin west-bank corner'},
    {'source':[357.435,608.755],'geo':[3.24281056,51.29857674],'osmWay':'655330274','landmark':'Natie1 building footprint'},
]

def fit(controls):
    return np.linalg.solve(np.array([[*c['source'],1] for c in controls]),np.array([c['geo'] for c in controls]))

def on_road(point,wayid):
    way=next(w for w in ROADS['ways'] if w['id']==wayid)
    # Published road points are [latitude, longitude].
    best=None
    for i in range(1,len(way['points'])):
        a=np.array(way['points'][i-1][::-1]);b=np.array(way['points'][i][::-1]);scale=np.array([69800,111320])
        v=(b-a)*scale; p=(point-a)*scale
        if np.dot(v,v)<1e-6:continue
        t=max(0,min(1,np.dot(p,v)/np.dot(v,v)));matched=a+t*(b-a)
        distance=float(np.linalg.norm((matched-point)*scale))
        if best is None or distance<best[0]:best=(distance,matched,[way['nodes'][i-1],way['nodes'][i]])
    return best

out={}
def add(code,source,coeff,way,region):
    point=np.array([*source,1])@coeff
    distance,matched,segment=on_road(point,way)
    # Do not silently extrapolate into a road far from the matched source lane.
    if distance>30:return
    out['south:'+code]={
        'lat':float(matched[1]),'lon':float(matched[0]),'method':'source-road-match',
        'scope':'parking-approach','parking':code,'sourceMap':'south','sourceRevision':'V1.09-2026',
        'roadWay':way,'roadSegment':segment,'sourcePoint':[round(x,4) for x in source],
        'matchDistanceMetres':round(distance,2),'lineExact':False,'region':region,
        'basis':'Local ICO parking-block and landmark geometry matched to an identified OSM service-road lane. Parking approach only; exact line positions and current site operations are not verified.'
    }

bc=fit(BASTENAKEN_CONTROLS)
# Narrow C-row blocks: each bottom access lane corresponds to an identifiable
# continuous OSM parking aisle. Do not reuse this mapping for changed E/F blocks,
# A/B blocks or other terminal regions with different schematic scales.
rows={1:(357.07,'746582135'),2:(346.53,'746582136'),3:(337.10,'241873297')}
for p in CURRENT['parkings']:
    code=p['code']
    if len(code)==3 and code[0] in 'LGKHJI' and code[1]=='C' and code[2] in '123':
        n=int(code[2]);y,way=rows[n]
        add(code,[p['x']/3,y],bc,way,'bastenaken-central-c-rows')

# H61 is reached at its north access lane in the current revised H zone.
add('H61',[250.6,628],fit(HANZE_CONTROLS),'746744831','hanze-h61')
result={
 'version':2,'source':'ICO SIT terminalplan V1.09-2026 and OpenStreetMap road/landmark geometry',
 'sourceUrl':'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
 'lineExact':False,'coverage':'Bounded individually matched regions only; no global schematic georeference or site validation claimed.',
 'controlPoints':{'bastenaken':BASTENAKEN_CONTROLS,'hanze':HANZE_CONTROLS},
 'destinations':out
}
(ROOT/'public/destinations.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(len(out),'matched parking-road approaches')
for code in ['south:HC1','south:H61']:
 p=out[code];print(code,p['lat'],p['lon'],'road',p['roadWay'],'match distance',p['matchDistanceMetres'])
