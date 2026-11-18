"""Match the eleven north-perimeter South compounds to their road-cell ladder.

The curved west end, railway sidings at RE1 and the DRL eastern turn distinguish
this row from the central C-grid. No central-grid affine transform is extended
into it. Source labels are parking areas; arrival points stay on bordering roads.
"""
from pathlib import Path
import json, math

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'public/data.json').read_text(encoding='utf-8'))
ROADS=json.loads((ROOT/'public/roads.json').read_text(encoding='utf-8'))
WAYS={w['id']:w for w in ROADS['ways']}
NODES={n:p for w in ROADS['ways'] for n,p in zip(w['nodes'],w['points'])}
SOURCE=next(m for m in DATA['maps'] if m['id']=='south')
OUT={}

def chain(way_id,start,end):
    way=WAYS[way_id]
    i,j=way['nodes'].index(start),way['nodes'].index(end)
    nodes=way['nodes'][min(i,j):max(i,j)+1]
    if i>j:nodes=nodes[::-1]
    excluded={tuple(sorted(p)) for p in way.get('excludedSegments',[])}
    if any(n in way.get('blocked',[]) for n in nodes) or any(tuple(sorted(p)) in excluded for p in zip(nodes,nodes[1:])):
        raise ValueError('Perimeter road match is no longer drivable: '+way_id)
    return nodes

def length(a,b):
    return math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*69800)

def add(code,north,south,north_way,south_way='897960053'):
    top=chain(north_way,*north);bottom=chain(south_way,*south)
    a,b=max(zip(bottom,bottom[1:]),key=lambda pair:length(NODES[pair[0]],NODES[pair[1]]))
    approach=[(x+y)/2 for x,y in zip(NODES[a],NODES[b])]
    corners=[north[0],north[1],south[0],south[1]]
    label=[sum(NODES[n][axis] for n in corners)/4 for axis in [0,1]]
    source=next(p for p in SOURCE['parkings'] if p['code']==code)
    OUT['south:'+code]={
        'lat':approach[0],'lon':approach[1],'parking':code,'method':'landmark-junction-match',
        'scope':'parking-approach','sourceMap':'south','sourceRevision':'V1.09-2026',
        'sourcePoint':[source['x']/3,source['y']/3],
        'roadWay':south_way,'roadSegment':[a,b],'lineExact':False,
        'region':'south-north-perimeter-row',
        'basis':'Individually matched eleven-cell row between the curved western perimeter, railway sidings and eastern DRL turn. Parking access-road approach only; not a surveyed entrance or exact line.',
        'junctionMatch':{'landmarks':['curved western perimeter','railway sidings at RE1','DRL eastern turn'],
                         'northWay':north_way,'northNodes':top,'southWay':south_way,'southNodes':bottom,'cornerNodes':corners},
        'labelPosition':{'lat':label[0],'lon':label[1],'method':'matched-junction-block-centre','scope':'parking-block-label'}
    }

# Ordered west -> east. Source widths are schematic; the actual junction ladder
# establishes every cell independently of the drawing's horizontal spacing.
cells=[
 ('WE1',('6986702403','12880754237'),('6986702407','12880754263'),'1349890088'),
 ('VE1',('12880754237','12487521009'),('12880754263','12880754238'),'1349890088'),
 ('UE1',('12487521009','6986702402'),('12880754238','12880754239'),'1349890088'),
 ('TE1',('6986702402','12487521018'),('12880754239','12880754240'),'1349890088'),
 ('SE1',('12487521018','12487520921'),('12880754240','6986702399'),'1349890088'),
 ('RE1',('12487521019','12487520902'),('6986702399','12880754241'),'1349890064'),
 ('QE1',('12487520902','12880754243'),('12880754241','12880754242'),'1349890064'),
 ('PE1',('12880754243','12880754245'),('12880754242','12880754244'),'1349890064'),
 ('OE1',('12880754245','12880754252'),('12880754244','12880754251'),'1349890064'),
 ('NE1',('12880754252','12487520903'),('12880754251','12880754246'),'1349890064'),
 ('ME1',('12487520903','6986702436'),('12880754246','6986702441'),'1349890064'),
]
for code,top,bottom,way in cells:add(code,top,bottom,way)

# DRL is the complete access corridor beside the western compound, rather than
# a parking stall. Follow its identified physical lane to a central approach.
lane=chain('746582075','12487520973','6986702441')
segments=[(a,b,length(NODES[a],NODES[b])) for a,b in zip(lane,lane[1:])]
remaining=sum(d for _,_,d in segments)/2
for a,b,d in segments:
    if remaining<=d:break
    remaining-=d
t=remaining/d
p=[x+t*(y-x) for x,y in zip(NODES[a],NODES[b])]
source=next(p for p in SOURCE['parkings'] if p['code']=='DRL')
OUT['south:DRL']={'lat':p[0],'lon':p[1],'parking':'DRL','method':'landmark-junction-match',
    'scope':'parking-group-approach','sourceMap':'south','sourceRevision':'V1.09-2026','sourcePoint':[source['x']/3,source['y']/3],
    'roadWay':'746582075','roadSegment':[a,b],'lineExact':False,'region':'south-western-drl-corridor',
    'basis':'The named DRL corridor borders the western compound and joins the perimeter parking ladder to the quay. Approach is halfway along the actual lane; no internal parking shortcut or line location.',
    'junctionMatch':{'laneNodes':lane}}

output=ROOT/'scripts/geo/perimeter-destinations.json';output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'destinations':OUT,'regions':[{'id':'south-north-perimeter-row','codes':[c[0] for c in cells],'source':'ICO SIT V1.09-2026','method':'eleven individually matched road cells'}]},indent=2),encoding='utf-8')
print(len(OUT),'perimeter and DRL approaches')
