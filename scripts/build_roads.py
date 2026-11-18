"""Download OSM road geometry, strip contributor metadata, build offline driving data."""
from pathlib import Path
import xml.etree.ElementTree as ET
import json, requests

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

data={'source':'OpenStreetMap contributors','license':'ODbL 1.0','sourceUrl':'https://www.openstreetmap.org/copyright','retrieved':'2026-11-18',
      'bounds':[[51.28,3.18],[51.35,3.26]],'ways':list(ways.values()),'restrictions':list(restrictions.values()),
      'note':'Mapped road geometry only. No inferred road links. Private roads assume authorized terminal access. Operational changes are not live.'}
(ROOT/'public'/'roads.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
print(len(ways),'motorable OSM ways,',len(restrictions),'node turn restrictions')
