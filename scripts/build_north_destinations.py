"""Reproduce individually matched NIT / Nissan parking approaches.

The source drawings are schematic. This module matches bounded row topology to
real OSM lanes instead of applying a terminal-centre or global affine fallback.
It writes an intermediate file; build_destinations.py owns the published merge.
"""
from pathlib import Path
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
ATLAS=json.loads((ROOT/'public/data.json').read_text(encoding='utf-8'))
ROADS=json.loads((ROOT/'public/roads.json').read_text(encoding='utf-8'))
WAYS={w['id']:w for w in ROADS['ways']}
MAPS={m['id']:m for m in ATLAS['maps']}
OUT={}
REGIONS=[]

def chain(wayid,nodes,oneway=False):
    way=WAYS.get(wayid)
    if way is None or way['oneway']!=oneway:raise ValueError('Road direction changed: '+wayid)
    directed=way['nodes'][::-1] if oneway==-1 else way['nodes']
    if not any(directed[i:i+len(nodes)]==nodes for i in range(len(directed)-len(nodes)+1)):
        if oneway or not any(directed[i:i+len(nodes)]==nodes[::-1] for i in range(len(directed)-len(nodes)+1)):
            raise ValueError('Road junction chain changed: '+wayid)
    excluded={tuple(sorted(pair)) for pair in way.get('excludedSegments',[])}
    if any(n in way.get('blocked',[]) for n in nodes) or any(tuple(sorted(pair)) in excluded for pair in zip(nodes,nodes[1:])):
        raise ValueError('Parking lane no longer routable: '+wayid)
    return {n:np.array(way['points'][way['nodes'].index(n)]) for n in nodes}

def source_point(mapid,p):
    # Return coordinates on the original PDF page, before the app crop/rotation.
    if mapid=='north':return [p['y']/3+30,(2340-p['x'])/3+30]
    if mapid=='nissan':return [p['x']/3+30,p['y']/3+200]
    raise ValueError(mapid)

def add_block(mapid,code,lower,upper=None,source_bounds=None,group=None):
    wayid,nodes=lower
    a=chain(wayid,nodes);approach=np.mean([a[n] for n in nodes],axis=0)
    corners=list(a.values());boundaries=[{'way':wayid,'nodes':nodes,'oneway':False}]
    if upper:
        upway,upnodes=upper;u=chain(upway,upnodes)
        corners+=list(u.values());boundaries.append({'way':upway,'nodes':upnodes,'oneway':False})
    parking=next(p for p in MAPS[mapid]['parkings'] if p['code']==code)
    center=np.mean(corners,axis=0)
    OUT[mapid+':'+code]={
        'lat':float(approach[0]),'lon':float(approach[1]),'method':'landmark-junction-match',
        'scope':'parking-group-approach' if len(parking['points'])>1 else 'parking-approach',
        'parking':code,'sourceMap':mapid,'sourceRevision':MAPS[mapid]['date'],
        'roadWay':wayid,'roadSegment':nodes,'sourcePoint':[round(v,4) for v in source_point(mapid,parking)],
        'lineExact':False,'region':group or mapid+'-matched-row-grid',
        'basis':'The labelled ICO row is matched by its ordered neighbouring aisles and distinctive local warehouse/dock topology. The approach is on the explicitly identified OSM lane; no terminal-centre fallback or schematic extrapolation. Not surveyed; exact line positions and live site operations are unverified.',
        'junctionMatch':{'boundaryLanes':boundaries,'rowGroup':group or mapid+'-matched-row-grid'},
        'labelPosition':{'lat':float(center[0]),'lon':float(center[1]),'method':'matched-junction-block-centre' if upper else 'matched-parking-access-side-reference',
                         'scope':'parking-block-label','basis':'Centre between matched bounding road junctions. Display label only, separate from the drivable access approach.' if upper else 'Access-side reference on the individually matched road. This code identifies the adjoining parking area; it is not a surveyed interior block centre.'}
    }
    if source_bounds:OUT[mapid+':'+code]['sourceImageBounds']=source_bounds
    return OUT[mapid+':'+code]

# NIT: E and the distinctive paired HLN/SUI warehouse compound establish the
# start of the long east/west aisle ladder. The exact row ordering in the PDF
# is E, DC, DB, DA, CC, CB, CA, BC, BB, BA. Counting from E is essential: the
# drawing stretches the rows, and a whole-map affine fit shifts BB by one row.
NORTH_LOWER_BOUNDARIES=[
    ('241878102',['2494559001','2494559051']), # below E / above DC
    ('241878069',['2494559004','2494559055']), # below DC
    ('241878066',['2494559012','2494559059']), # below DB
    ('241878082',['2494559017','2494559064']), # below DA
    ('241878061',['2494559020','2494559072']), # below CC
    ('241878063',['2494559024','2494559078']), # below CB
    ('241878052',['2494559027','2494559081']), # below CA
    ('241878070',['2494559030','2494559085']), # below BC
    ('241878068',['2494559034','2494559094']), # below BB
    ('241878119',['2494559037','2494559100']), # below BA
]
codes=['E','DC','DB','DA','CC','CB','CA','BC','BB','BA']
for i,code in enumerate(codes):
    add_block('north',code,NORTH_LOWER_BOUNDARIES[i],NORTH_LOWER_BOUNDARIES[i-1] if i else None,
              group='nit-hln-sui-lower-row-ladder')
REGIONS.append({'id':'nit-hln-sui-lower-row-ladder','codes':codes,
    'sourceOrder':codes,'landmarks':['HLN warehouse OSM241878536','SUI warehouse OSM241878537','Kiwiweg terminal gate'],
    'sourceMap':'north','matching':'Individual OSM road-junction pairs and ordered aisle count; no affine residual claimed.',
    'boundaryWays':[x[0] for x in NORTH_LOWER_BOUNDARIES]})

# NIT upper right grid: the four paired blocks M/L, K/J, I/H, G/F occupy
# consecutive aisles from the corner beside dock408 down to dock405 / HLN.
UPPER_ROWS=[
    ('M',('241878084',['2494558991','2494559021'])),
    ('L',('241878084',['2494559021','2494559088'])),
    ('K',('241878100',['2494558996','2494559026'])),
    ('J',('241878100',['2494559026','2494559090'])),
    ('I',('241878121',['2494559000','2494559033'])),
    ('H',('241878121',['2494559033','2984595059'])),
    ('G',('241878050',['2494559013','2494559040'])),
    ('F',('241878050',['2494559040','2494559063'])),
]
for code,access in UPPER_ROWS:add_block('north',code,access,group='nit-dock405-408-paired-grid')
REGIONS.append({'id':'nit-dock405-408-paired-grid','sourceMap':'north','codes':[x[0] for x in UPPER_ROWS],
    'landmarks':['Dock408 north corner','Dock405 west corner','HLN warehouse'],
    'matching':'The four paired rows are individually associated with their recorded crossing aisle; not globally transformed.'})

# Narrow dock-side strips have their own approach on the adjacent real lane;
# do not substitute the centre of the neighbouring M/K/I/G block.
for code,nodes in [('KCB',['2494558991','2494558996']),('KCA',['2494558996','2494559000']),('HHN',['2984603496','2494559013'])]:
    add_block('north',code,('241878125',nodes),group='nit-dock405-side-strips')

# P is bounded by the four identifiable junctions beside the dock408 corner.
add_block('north','P',('241878109',['2494558948','2494558983']),
          ('241878076',['2494558944','2494558973','2494558978']),group='nit-dock408-p-o-compound')
add_block('north','Q2',('241878109',['2494558935','2494558948']),group='nit-looods-c-q2-compound')
add_block('north','O',('241878125',['2494558978','2494558983']),group='nit-dock408-p-o-compound')
add_block('north','N',('241878071',['2494559014','2494559082']),
          ('241878098',['2494559008','2984583110','2494559079']),group='nit-north-eastern-outer-blocks')
add_block('north','R',('241878098',['2494559008','2984583110','2494559079']),
          ('241878079',['2494559029','2984583121']),group='nit-north-eastern-outer-blocks')
add_block('north','S',('241878079',['2494559029','2984583121']),
          ('241878076',['2494559057','2494559053']),group='nit-north-eastern-outer-blocks')

# Truck-parking / outer curb references are themselves lanes, not lot centres.
# Each is attached to its own source-matched part of the continuous perimeter.
CURBS=[
    ('X','241878055',['2494558949','2494558956']),
    ('Y','241878055',['2494558992','2494558998']),
    ('Z04','241878055',['2494558956','2494558970']),
    ('Z06','241878076',['2494558978','2494559005']),
    ('Z03','241878079',['2494559079','2494559082']),
    ('Z02','241878079',['2494559088','2494559089']),
    ('Z01','241878079',['2494559108','2494559110']),
    ('W','241878079',['2494559099','2494559101']),
    ('U','241878055',['2494558928','2494558936']),
]
for code,way,nodes in CURBS:
    add_block('north',code,(way,nodes),group='nit-individually-matched-perimeter-sections')
    if code.startswith('Z') or code=='W':OUT['north:'+code]['labelPosition']['scope']='parking-lane-reference'
REGIONS.append({'id':'nit-individually-matched-perimeter-sections','sourceMap':'north',
    'codes':[x[0] for x in CURBS],
    'matching':'Each named source curb / truck-parking strip is associated with its own real perimeter-lane segment. U represents the shared access to its repeated-code group, not a verified entrance to every U sub-lot.'})

# The named source AA carpark lies immediately below BA and above the smaller
# gate-side P carpark. Keep it on the dedicated cross-lane, not the Kiwiweg gate.
add_block('north','AA',('241878087',['2494559054','2494559105']),
          ('241878119',['2494559037','2494559100']),group='nit-aa-carpark')

# APZ is the narrow strip between SUI's east side and the DC/DB aisle ladder.
add_block('north','APZ',('241878057',['2494559004','2494559012']),group='nit-sui-east-side-strip')
add_block('north','HHO',('241878050',['2494558942','2494558975']),group='nit-hln-frontage')
add_block('north','KD',('241878125',['2494558991','2494558996']),group='nit-dock405-inner-access-strip')

# A/B numbering refers to positions within their common broad block. These
# approaches stop on that block's boundary lane, not on an invented exact line.
for code in ['B1','B23','B46']:
    item=add_block('north',code,('241878057',['2494559020','2494559024']),group='nit-b-numbered-parking-area')
    item['scope']='parking-group-approach'
    item['basis']='A shared road approach to the B numbered parking area, identified beside the middle of the C-row ladder. The numeric suffix is a source area/line reference; its exact individual position is not claimed.'
add_block('north','A23',('241878057',['2494559030','2494559034']),group='nit-a-numbered-parking-area')['scope']='parking-group-approach'

# PL and PL2 are the two stacked lots west of HLN. Their shared western access
# is one continuous recorded segment; source order separates their approaches.
for code,fraction in [('PL',.25),('PL2',.75)]:
    item=add_block('north',code,('241878050',['2494558933','2494558934']),group='nit-pl-stacked-lots')
    ps=chain('241878050',['2494558933','2494558934'])
    p=ps['2494558933']+fraction*(ps['2494558934']-ps['2494558933'])
    item.update(lat=float(p[0]),lon=float(p[1]),roadFraction=fraction)
    item['labelPosition'].update(lat=float(p[0]),lon=float(p[1]),scope='parking-access-side-reference')
    item['basis']='The two source PL/PL2 lots have a common continuous west-side access lane. The north/south quarter-points distinguish their approaches, not exact parking lines. Not surveyed.'

# SL is the small separate warehouse immediately west of SUI; the recorded
# west-side lane terminates at its frontage. This is a building approach.
add_block('north','SL',('241878050',['2494569907','2494569916']),group='nit-sl-warehouse-frontage')

result={'version':1,'source':'ICO northern / Nissan source plans and OpenStreetMap road topology',
        'sourceUrl':'https://www.icoterminals.com/upload/ico_safety_regulations.pdf',
        'lineExact':False,'destinations':OUT,'regions':REGIONS,
        'coverage':{'north':len([k for k in OUT if k.startswith('north:')]),'nissan':len([k for k in OUT if k.startswith('nissan:')])},
        'unsupported':{mapid:[p['code'] for p in MAPS[mapid]['parkings'] if mapid+':'+p['code'] not in OUT] for mapid in ['north','nissan']}}
# This independent imagery comparison is kept as a rejected alignment audit,
# not used to fabricate Nissan destinations. The source app-drawing coords are
# the PDF crop [30,200,1130,740] at 1x; photo coordinates refer to the exact WMS
# request below. Layout orientation agrees, but global residuals are too large.
nissan_source=np.array([[40,15,1],[40,540,1],[870,85,1],[1100,540,1]],float)
nissan_photo=np.array([[405,1305],[850,1245],[280,695],[650,650]],float)
nissan_fit=np.linalg.lstsq(nissan_source,nissan_photo,rcond=None)[0]
result['nissanAlignmentAudit']={
    'usedForRouting':False,
    'imagerySource':'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms',
    'imageryRequest':{'service':'WMS','request':'GetMap','version':'1.3.0','layers':'Ortho','styles':'','crs':'EPSG:4326','bbox':'51.314,3.2,51.327,3.213','width':1300,'height':1600,'format':'image/jpeg'},
    'retrieved':'2026-11-18','flightDate':'Not independently resolved from imagery metadata',
    'hypothesisControls':[{'sourceCropPoint':s[:2].tolist(),'photoPixel':p.tolist()} for s,p in zip(nissan_source,nissan_photo)],
    'rejectedAffineResidualPixels':[round(float(v),2) for v in np.linalg.norm(nissan_source@nissan_fit-nissan_photo,axis=1)],
    'reason':'OSM does not contain the Nissan internal three-band aisle network. The schematic-to-orthophoto corner fit has 32–50 pixel errors. The exact public/private gate connection is not yet individually confirmed. No invented road connection or terminal-centre target is exported.'
}
path=ROOT/'scripts/geo/north-destinations.json';path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result['coverage']))
print('north:BB',OUT['north:BB']['lat'],OUT['north:BB']['lon'],OUT['north:BB']['roadWay'])
