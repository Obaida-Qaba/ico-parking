"""Download OSM road geometry, strip contributor metadata, build offline driving data."""
from pathlib import Path
import xml.etree.ElementTree as ET
import json, math, requests

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'scripts'/'geo'
CACHE.mkdir(exist_ok=True)
SOURCES=[('osm-source.xml','3.21,51.28,3.26,51.315'),('osm-north.xml','3.18,51.31,3.23,51.35')]
ways={}; restrictions={}
motorways={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','living_street','road'}
for filename,bbox in SOURCES:
    file=CACHE/filename
    if not file.exists():
        response=requests.get('https://api.openstreetmap.org/api/0.6/map',params={'bbox':bbox},timeout=60,headers={'User-Agent':'Portway-map-research/0.2'})
        response.raise_for_status();file.write_bytes(response.content)
    root=ET.parse(file).getroot()
    points={n.attrib['id']:[float(n.attrib['lat']),float(n.attrib['lon'])] for n in root.findall('node')}
    blocked=set()
    for n in root.findall('node'):
        tags={t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}
        if tags.get('locked')=='yes' or tags.get('motor_vehicle')=='no' or tags.get('motorcar')=='no' or tags.get('access')=='no':blocked.add(n.attrib['id'])
    for w in root.findall('way'):
        tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
        if tags.get('highway') not in motorways:continue
        if tags.get('area')=='yes' or tags.get('access')=='no' or tags.get('motor_vehicle')=='no' or tags.get('motorcar')=='no' or tags.get('vehicle')=='no':continue
        ids=[n.attrib['ref'] for n in w.findall('nd')]
        if any(n not in points for n in ids):continue
        one=tags.get('oneway','yes' if tags.get('junction')=='roundabout' else 'no')
        ways[w.attrib['id']]={'id':w.attrib['id'],'nodes':ids,'points':[points[n] for n in ids],
          'oneway':-1 if one=='-1' else one in ['yes','1','true'],'name':tags.get('name','Terminal access road' if tags.get('highway')=='service' else 'Unnamed road'),
          'private':tags.get('access') in ['private','customers','destination'] or tags.get('vehicle')=='destination',
          'blocked':[n for n in ids if n in blocked]}
    for rel in root.findall('relation'):
        tags={t.attrib['k']:t.attrib['v'] for t in rel.findall('tag')}
        if tags.get('type')!='restriction':continue
        members={m.attrib['role']:m.attrib for m in rel.findall('member')}
        if all(x in members for x in ['from','via','to']) and members['via']['type']=='node':
            restrictions[rel.attrib['id']]={'from':members['from']['ref'],'via':members['via']['ref'],'to':members['to']['ref'],'type':tags.get('restriction:motorcar',tags.get('restriction:motor_vehicle',tags.get('restriction','')))}

rules=json.loads((ROOT/'scripts'/'terminal-road-rules.json').read_text(encoding='utf-8'))
for rule in rules['overrides']:
    way=ways.get(rule['way'])
    if way is None or way['nodes']!=rule['expectedNodes']:
        raise ValueError('Terminal traffic rule needs review after road geometry changed: '+rule['way'])
    way['osmOneway']=way['oneway']
    way['oneway']=rule['oneway']
    way['trafficOverride']={k:v for k,v in rule.items() if k not in ['way','expectedNodes','oneway']}

for rule in rules.get('segmentExclusions',[]):
    way=ways.get(rule['way'])
    if way is None or way['nodes']!=rule['expectedNodes']:
        raise ValueError('Terminal segment correction needs review after road geometry changed: '+rule['way'])
    adjacent={tuple(sorted(pair)) for pair in zip(way['nodes'],way['nodes'][1:])}
    if any(tuple(sorted(pair)) not in adjacent for pair in rule['excludedSegments']):
        raise ValueError('Excluded terminal segment is not an existing edge: '+rule['way'])
    way['excludedSegments']=rule['excludedSegments']
    way['geometryOverride']={k:v for k,v in rule.items() if k not in ['way','expectedNodes','excludedSegments']}

# The reviewed North quay aisle is visibly offset from two obsolete OSM links.
# Retain the original node arrays and exclude only the proven occupied rows.
def apply_reviewed_roads(filename):
    review=json.loads((ROOT/'scripts'/filename).read_text(encoding='utf-8'))
    for guard in review['guards']:
        way=ways.get(guard['way'])
        if way is None or way['nodes']!=guard['expectedNodes'] or way['oneway']!=guard['expectedOneway'] or way['private']!=guard['expectedPrivate']:
            raise ValueError('Reviewed terminal road anchor changed: '+guard['way'])
    existing_nodes={node:point for way in ways.values() for node,point in zip(way['nodes'],way['points'])}
    for node,expected in review['anchorCoordinates'].items():
        if node not in existing_nodes or any(abs(a-b)>1e-10 for a,b in zip(existing_nodes[node],expected)):
            raise ValueError('Reviewed terminal junction moved: '+node)
    for rule in review.get('segmentExclusions',[]):
        way=ways.get(rule['way'])
        if way is None or way['nodes']!=rule['expectedNodes'] or way['oneway']!=rule['expectedOneway']:
            raise ValueError('Reviewed terminal lane alignment changed: '+rule['way'])
        adjacent={tuple(sorted(pair)) for pair in zip(way['nodes'],way['nodes'][1:])}
        if any(tuple(sorted(pair)) not in adjacent for pair in rule['excludedSegments']):
            raise ValueError('Terminal exclusion is not an existing segment: '+rule['way'])
        way['excludedSegments']=way.get('excludedSegments',[])+rule['excludedSegments']
        way['geometryOverride']={k:v for k,v in rule.items() if k not in ['way','expectedNodes','expectedOneway','excludedSegments']}
    for addition in review['additions']:
        if review.get('mustNotConnectToExternalNodes') and any(not node.startswith('portway-nissan-') for node in addition['nodes']):
            raise ValueError('Nissan internal island must not acquire an unverified public connection.')
        if addition['id'] in ways or len(addition['nodes'])!=len(addition['points']) or len(addition['nodes'])<2:
            raise ValueError('Invalid reviewed terminal road: '+addition['id'])
        for node,point in zip(addition['nodes'],addition['points']):
            if len(point)!=2 or not all(math.isfinite(x) for x in point) or not (51.31<point[0]<51.35 and 3.18<point[1]<3.23):
                raise ValueError('Invalid reviewed terminal coordinate: '+node)
            if node in existing_nodes and any(abs(a-b)>1e-10 for a,b in zip(existing_nodes[node],point)):
                raise ValueError('Reviewed terminal junction does not coincide: '+node)
            existing_nodes[node]=point
        ways[addition['id']]={**addition,'blocked':[],
            'geometrySource':{'source':review.get('source',review.get('sourcePlan',{}).get('url')),'imagery':review['imagery'],'trafficEvidence':review['trafficEvidence'],'reviewed':review['reviewed'],'surveyed':False}}

apply_reviewed_roads('north-road-corrections.json')
apply_reviewed_roads('nissan-road-corrections.json')

patches=[]
for recipe in rules.get('mapPatches',[]):
    cross=ways[recipe['crossingWay']];along=ways[recipe['alongWay']]
    if not cross.get('excludedSegments'):
        raise ValueError('Map patch requires an explicit road correction: '+recipe['id'])
    if tuple(recipe['alongNodes']) not in list(zip(along['nodes'],along['nodes'][1:])):
        raise ValueError('Map patch aisle direction needs review: '+recipe['id'])
    a,b=[cross['points'][cross['nodes'].index(n)] for n in recipe['betweenNodes']]
    c,d=[along['points'][along['nodes'].index(n)] for n in recipe['alongNodes']]
    origin=[(a[0]+b[0])/2,(a[1]+b[1])/2]
    degree=6371008.8*math.pi/180
    lon_scale=degree*math.cos(math.radians(origin[0]))
    project=lambda p: [(p[1]-origin[1])*lon_scale,(p[0]-origin[0])*degree]
    unproject=lambda p: [origin[0]+p[1]/degree,origin[1]+p[0]/lon_scale]
    unit=lambda v: [x/math.hypot(*v) for x in v]
    pa,pb,pc,pd=map(project,[a,b,c,d])
    across=unit([pb[i]-pa[i] for i in range(2)])
    direction=unit([pd[i]-pc[i] for i in range(2)])
    lower=[pa[i]-across[i]*recipe['capMetres'] for i in range(2)]
    upper=[pb[i]+across[i]*recipe['capMetres'] for i in range(2)]
    polygon=[unproject([end[i]+sign*direction[i]*recipe['halfLengthMetres'] for i in range(2)]) for end,sign in [(lower,-1),(upper,-1),(upper,1),(lower,1)]]
    patches.append({'id':recipe['id'],'polygon':polygon,'fill':recipe['fill'],'reason':recipe['reason'],'source':recipe['source']})

data={'source':'OpenStreetMap contributors with ICO terminal directions, scoped corrections and reviewed terminal-aisle alignment from official Flemish orthophoto','license':'ODbL 1.0','sourceUrl':'https://www.openstreetmap.org/copyright','retrieved':'2026-11-18',
      'alignmentSource':{'name':'Digitaal Vlaanderen orthophoto','url':'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms','flightDate':'2025-02-23','reviewed':'2026-11-18','scope':'North quay correction and Nissan internal aisles. Nissan public entrance transfer is unverified; not surveyed or live operational access.'},
      'trafficRevision':rules['revision'],
      'mapPatches':patches,
      'bounds':[[51.28,3.18],[51.35,3.26]],'ways':list(ways.values()),'restrictions':list(restrictions.values()),
      'note':'Mapped road geometry only. No inferred road links. Private roads assume authorized terminal access. Operational changes are not live.'}
(ROOT/'public'/'roads.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
print(len(ways),'motorable OSM ways,',len(restrictions),'node turn restrictions')
print(len(rules['overrides']),'ICO traffic direction corrections and',len(rules.get('segmentExclusions',[]))+1,'scoped segment corrections applied')
