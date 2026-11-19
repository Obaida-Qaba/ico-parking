"""Build bounded parking-road approach matches for the current ICO southern plan.

This is NOT a global affine fit of the schematic drawing, and provides no line
coordinates. Regions are matched separately to distinctive physical landmarks.
Each result is projected onto an explicitly identified OSM road, never an
invented line across a parking block. Review these matches when layouts change.
Dependencies: numpy (only when rebuilding; browser has no dependency).
"""
from pathlib import Path
import json
import subprocess
import sys
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

def add_block_label(code,source,coeff,lower_way,upper_way):
    """Label the parking strip, not the access road shared with the next row."""
    raw=np.array([*source,1])@coeff
    lower=on_road(raw,lower_way);upper=on_road(raw,upper_way)
    scale=np.array([69800,111320])
    width=float(np.linalg.norm((upper[1]-lower[1])*scale))
    if max(lower[0],upper[0])>35 or not 15<width<35:
        raise ValueError('Parking label boundary match needs review: '+code)
    point=(lower[1]+upper[1])/2
    edge=False
    for result,wayid in [(lower,lower_way),(upper,upper_way)]:
        way=next(w for w in ROADS['ways'] if w['id']==wayid)
        if any(np.allclose(result[1],np.array(p[::-1]),atol=1e-12,rtol=0) for p in [way['points'][0],way['points'][-1]]):edge=True
    out['south:'+code]['labelPosition']={
        'lat':float(point[1]),'lon':float(point[0]),'method':'matched-aisle-midpoint',
        'scope':'parking-block-label','sourcePoint':[round(x,4) for x in source],
        'boundaryWays':[lower_way,upper_way],'boundaryWidthMetres':round(width,2),'edgeEstimate':edge,
        'basis':'The ICO parking row lies between these matched OSM aisles. Display label only; road routing retains its separate approach point. Not surveyed.'
    }

def require_road_chain(wayid,nodes,oneway):
    """Require the individually identified lane and real adjacent junctions."""
    way=next((w for w in ROADS['ways'] if w['id']==wayid),None)
    if way is None or way['oneway']!=oneway:
        raise ValueError('Curated parking lane direction needs review: '+wayid)
    directed=way['nodes'][::-1] if oneway==-1 else way['nodes']
    chains=[directed[i:i+len(nodes)] for i in range(len(directed)-len(nodes)+1)]
    if nodes not in chains and (oneway or nodes[::-1] not in chains):
        raise ValueError('Curated parking junction chain needs review: '+wayid)
    excluded={tuple(sorted(pair)) for pair in way.get('excludedSegments',[])}
    if any(n in way.get('blocked',[]) for n in nodes) or any(tuple(sorted(pair)) in excluded for pair in zip(nodes,nodes[1:])):
        raise ValueError('Curated parking approach is no longer drivable: '+wayid)
    return {n:np.array(way['points'][way['nodes'].index(n)][::-1]) for n in nodes}

def add_junction_match(code,source_bounds,approach_way,approach_nodes,corners,lanes,approach_oneway=False,source_index=0):
    """Match a bounded VPC-side block by lane topology, without an affine fit."""
    anchors={}
    for wayid,nodes,oneway in lanes:anchors.update(require_road_chain(wayid,nodes,oneway))
    access=require_road_chain(approach_way,approach_nodes,approach_oneway)
    point=(access[approach_nodes[0]]+access[approach_nodes[1]])/2
    label=np.mean([anchors[n] for n in corners],axis=0)
    parking=next(p for p in CURRENT['parkings'] if p['code']==code)
    source=parking['points'][source_index]
    label_source=[source['x']/3,source['y']/3]
    out['south:'+code]={
        'lat':float(point[1]),'lon':float(point[0]),'method':'landmark-junction-match',
        'scope':'parking-group-approach' if len(parking['points'])>1 else 'parking-approach','parking':code,'sourceMap':'south','sourceRevision':'V1.09-2026',
        'roadWay':approach_way,'roadSegment':approach_nodes,'sourcePoint':[round(x,4) for x in label_source],
        'sourceBounds':source_bounds,'sourcePoints':[[round(p['x']/3,4),round(p['y']/3,4)] for p in parking['points']],
        'lineExact':False,'region':'bastenaken-vpc-compound',
        'basis':'The named VPC landmark and the directions/topology of its surrounding access lanes identify this parking strip. Approach is a midpoint of actual adjacent road junctions; no global affine extrapolation. Repeated-code groups use the individually matched sub-block, not every group entrance. Not surveyed; exact lines are unverified.',
        'junctionMatch':{'landmark':'Vehicle Processing Center','landmarkWay':'221621684','cornerNodes':corners,
                         'boundaryLanes':[{'way':way,'nodes':nodes,'oneway':oneway} for way,nodes,oneway in lanes]},
        'labelPosition':{'lat':float(label[1]),'lon':float(label[0]),'method':'matched-junction-block-centre',
                         'scope':'parking-block-label','sourcePoint':[round(x,4) for x in label_source],
                         'basis':'Centre of the bounded parking strip between the individually matched VPC-side lanes. Display label only; routing ends on its separate access-road segment. Not surveyed.'}
    }

bc=fit(BASTENAKEN_CONTROLS)
# Narrow C-row blocks: each bottom access lane corresponds to an identifiable
# continuous OSM parking aisle. Do not reuse this mapping for changed E/F blocks,
# A/B blocks or other terminal regions with different schematic scales.
rows={1:(357.07,'746582135'),2:(346.53,'746582136'),3:(337.10,'241873297')}
# The G/H C3 lane ends at H's western junction. I-L use its real continuation;
# their upper boundary also continues on a different way after the I strip.
C3_CONTINUATIONS={
    'I':{'lowerNodes':['6986702466','2494511750'],'upperWay':'1228590688','upperNodes':['6986702620','6986702621'],'sideWays':['746582086','746582127'],'sourceBounds':[564.69,328.86,606.32,335.91]},
    'J':{'lowerNodes':['6986702472','6986702466'],'upperWay':'746582137','upperNodes':['6986702621','6986702622'],'sideWays':['746582091','746582086'],'sourceBounds':[513.06,328.86,554.69,335.91]},
    'K':{'lowerNodes':['6986702467','6986702472'],'upperWay':'746582137','upperNodes':['6986702622','6986702623'],'sideWays':['746582088','746582091'],'sourceBounds':[461.44,328.86,503.07,335.91]},
    'L':{'lowerNodes':['6986702465','6986702467'],'upperWay':'746582137','upperNodes':['6986702623','6986702617'],'sideWays':['746582075','746582088'],'sourceBounds':[409.81,328.86,451.44,335.91]},
}
for p in CURRENT['parkings']:
    code=p['code']
    if len(code)==3 and code[0] in 'LGKHJI' and code[1]=='C' and code[2] in '123':
        n=int(code[2]);y,way=rows[n]
        continuation=C3_CONTINUATIONS.get(code[0]) if n==3 else None
        if continuation:
            way='746582089'
            require_road_chain(way,continuation['lowerNodes'],False)
            require_road_chain(continuation['upperWay'],continuation['upperNodes'],True)
            for side,top,bottom in zip(continuation['sideWays'],continuation['upperNodes'][::-1],continuation['lowerNodes']):
                require_road_chain(side,[top,bottom],False)
        add(code,[p['x']/3,y],bc,way,'bastenaken-central-c-rows')
        if 'south:'+code in out:
            upper=continuation['upperWay'] if continuation else '746582136' if n==1 else '1228590688' if n==3 else '241873297' if code[0] in 'GH' else '746582089'
            add_block_label(code,[p['x']/3,p['y']/3],bc,way,upper)
            if continuation:
                point=out['south:'+code]
                if point['roadSegment']!=continuation['lowerNodes']:
                    raise ValueError('C3 approach left its individually matched parking column: '+code)
                point['sourceBounds']=continuation['sourceBounds']
                point['junctionMatch']={'lowerWay':way,'lowerNodes':continuation['lowerNodes'],'upperWay':upper,'upperNodes':continuation['upperNodes'],'sideWays':continuation['sideWays']}

# H61 is reached at its north access lane in the current revised H zone.
add('H61',[250.6,628],fit(HANZE_CONTROLS),'746744831','hanze-h61')

# CD1/CD2 are the two strips directly east of the named VPC compound. The
# schematic spacing differs here, so do not extrapolate the C-row affine fit.
# Directions independently agree: the VPC east lane is one-way southbound in
# the drawing; the middle, outer and shared north/south lanes are two-way.
add_junction_match('CD1',[899.26,290.01,912.91,315.35],'1349890081',
    ['2494511854','12431454000'],['6986702536','2494511854','12431454000','6986702539'],[
        ('1349890082',['6986702536','2494511854'],True),
        ('746582113',['12431454000','6986702539'],False),
        ('746582117',['6986702539','6986702536'],False),
        ('1349890081',['2494511854','12431454000'],False)])
add_junction_match('CD2',[916.77,290.28,929.01,315.55],'1349890081',
    ['12431454000','12487520998'],['6986702539','12431454000','12487520998','6986702535'],[
        ('746582113',['12431454000','6986702539'],False),
        ('241873267',['6986702535','2494511865','12487520998'],False),
        ('746582117',['6986702535','6986702539'],False),
        ('1349890081',['12431454000','12487520998'],False)])
add_junction_match('DD1',[820.15,290.37,835.68,315.77],'746582118',
    ['6986702543','6986702544'],['6986702540','6986702545','6986702544','6986702543'],[
        ('746582117',['6986702545','6986702540'],False),
        ('241873296',['6986702540','11393709897','2494511786','11393709900','6986702595','6986702597','6986702543'],False),
        ('746582119',['6986702544','6986702545'],False),
        ('746582118',['6986702544','6986702543'],False)])
# DC2 and CC2 each repeat across adjacent source sub-blocks. These bounded
# approaches identify one confirmed part of each code group, not every line.
add_junction_match('DC2',[819.87,319.19,837.62,343.45],'746582120',
    ['6986702547','12487521006'],['6986702543','6986702544','12487521006','6986702547'],[
        ('746582118',['6986702544','6986702543'],False),
        ('241873296',['6986702543','2494511793','6986702599','6986702547'],False),
        ('1349890087',['6986702544','12487521006'],True),
        ('746582120',['6986702547','12487521006'],False)],source_index=1)
add_junction_match('CC2',[881.71,319.19,896.19,343.45],'241873275',
    ['2494511854','12431453998'],['12431453998','2494511854','6986702537','12431453999'],[
        ('241873275',['2494511854','12431453998'],True),
        ('1349890063',['12431453999','12431453998'],False),
        ('746582110',['2494511854','6986702537'],False),
        ('746582120',['12431453999','6986702537'],False)],approach_oneway=True)
# Independent schematic regions have independent topology matches. Preserve the
# existing checked C-row/VPC points when merging the wider source catalogue.
# Fitting controls are deliberately distinct from the actual printed glyphs.
# Keep both; adjusted C-row controls must not be serialized as source labels.
for key,point in out.items():
    if point.get('method')!='source-road-match':continue
    parking=next(p for p in CURRENT['parkings'] if p['code']==key.split(':')[1])
    actual=[round(parking['x']/3,4),round(parking['y']/3,4)]
    if max(abs(a-b) for a,b in zip(point['sourcePoint'],actual))>.01:
        point['matchModelPoint']=point['sourcePoint']
        point['sourcePoint']=actual
        point['matchModelPointScope']='Local fitted-row control, not a printed source-label position.'
        if 'labelPosition' in point:
            label=point['labelPosition'];label['matchModelPoint']=label['sourcePoint'];label['sourcePoint']=actual
regions=[]
evidence_gaps=[]
for builder,filename in [
    ('build_perimeter_destinations.py','perimeter-destinations.json'),
    ('build_north_destinations.py','north-destinations.json'),
    ('build_south_west_destinations.py','south-west-destinations.json'),
    ('build_south_east_destinations.py','south-east-destinations.json'),
    ('build_central_destinations.py','central-destinations.json'),
    ('build_os_destinations.py','os-destinations.json'),
    ('build_pos_destinations.py','pos-destinations.json'),
    ('build_de_destinations.py','de-destinations.json'),
    ('build_north_remaining_destinations.py','north-remaining-destinations.json'),
    ('build_central_remaining_destinations.py','central-remaining-destinations.json'),
    ('build_nissan_destinations.py','nissan-destinations.json'),
    ('build_toyota_area_destinations.py','toyota-area-destinations.json'),
    ('build_d_area_destinations.py','d-area-destinations.json'),
    ('build_legacy_vpc_area_destinations.py','legacy-vpc-area-destinations.json'),
    ('build_h_area_destinations.py','h-area-destinations.json'),
]:
    subprocess.run([sys.executable,str(ROOT/'scripts'/builder)],check=True,cwd=ROOT)
    extra=json.loads((ROOT/'scripts/geo'/filename).read_text(encoding='utf-8'))
    for key,point in extra['destinations'].items():
        if key not in out:out[key]=point
    regions.extend(extra.get('regions',[]))
    evidence_gaps.extend(extra.get('unresolved',[]))

# A later independently reviewed builder may resolve an earlier producer's gap.
evidence_gaps=list({gap.get('key',gap.get('sourceMap','south')+':'+gap.get('code','')):gap for gap in evidence_gaps if gap.get('key',gap.get('sourceMap','south')+':'+gap.get('code','')) not in out}.values())

audit={}
for source_map in DATA['maps']:
    target_map='south' if source_map['id'] in ['bastenaken','hanze'] else source_map['id']
    missing=[p['code'] for p in source_map['parkings'] if target_map+':'+p['code'] not in out and source_map['id']+':'+p['code'] not in out]
    audit[source_map['id']]={'total':len(source_map['parkings']),'routable':len(source_map['parkings'])-len(missing),'missing':missing}

result={
 'version':6,'source':'ICO terminal plans, matched geographic approaches and explicitly labelled shared-area entrances',
 'sourceUrl':'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
 'lineExact':False,'coverage':'Matched road approaches and explicitly labelled shared-area entrances; no global schematic georeference or site validation claimed.',
 'coverageDefinition':'coverageAudit counts built-in approaches, shared-area entrances and restricted within-terminal networks. parking-audit.json separately checks connectivity, missing destinations and individual-parking limitations.',
 'controlPoints':{'bastenaken':BASTENAKEN_CONTROLS,'hanze':HANZE_CONTROLS},
 'destinations':out,'regions':regions,'coverageAudit':audit,'evidenceGaps':evidence_gaps
}
(ROOT/'public/destinations.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(len(out),'matched parking-road approaches')
for code in ['south:HC1','south:H61']:
 p=out[code];print(code,p['lat'],p['lon'],'road',p['roadWay'],'match distance',p['matchDistanceMetres'])
