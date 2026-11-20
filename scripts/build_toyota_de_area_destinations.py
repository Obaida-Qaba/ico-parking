"""One lower Toyota D09-D13/E09-E13 FIELD road approach, never ten rows.

The independently reviewed Y southern road, F/G western spine and R01/railway
side road bound this separate field. Fresh official OFW imagery shows the
retained outer junctions and paved storage field. Only its northwest road
junction is positioned. The D/E divider, numbered strips and actual compound
gate remain unverified. No D00-D08/E00-E08 reference is inferred.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
REGION_ID = 'toyota-lower-de-shared-field-road-approach'
ARRIVAL_NODE = '2494477523'
ARRIVAL_WAY = '241869968'
ARRIVAL_SEGMENT = ['2494477510', ARRIVAL_NODE]
SOURCE_POINTS = {letter + f'{n:02}': [x, y] for letter, x in [('D', 240), ('E', 320)]
                 for n, y in zip(range(9, 14), [436, 449, 462, 476, 489])}
SOURCE_BOUNDS = [210, 428, 385, 497]
ROAD_GUARDS = {
    '746744858': ('7cd47acefb4b29c25132e3a19809384d68f9fa96cba4b2b7eb8a74dff2a70025', False),
    '241869962': ('604b73b7d4d2731604eb92595ad6f45930613dd283dfef91fea1c324192e52a6', False),
    '241869913': ('eb82bfd55709466ee077dca11192afcf1cfc3203f54e1ce66e0f80837653b14b', True),
    '241869952': ('bbeb51d85d0c48efeeb93d378e00518902f14f8c3552217fcd3edb7dc419c1a0', False),
    '241869968': ('ba9384e204a574516a39abed33a4c332adb460482834f8d3202b7fdf9492aaed', False),
}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = {way['id']: way for way in roads['ways']}
    for ident, (expected, direction) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not direction or way.get('private') is not True:
            raise ValueError('Reviewed Toyota lower D/E direction/access changed: ' + ident)
        geometry = json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':'))
        if hashlib.sha256(geometry.encode()).hexdigest() != expected:
            raise ValueError('Reviewed Toyota lower D/E geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed Toyota lower D/E boundary road is closed: ' + ident)

    def chain(ident, start, end, role):
        way = ways[ident]
        a = way['nodes'].index(start)
        endings = [i for i, node in enumerate(way['nodes']) if node == end]
        b = next((i for i in endings if i >= a), endings[0]) if way['oneway'] else endings[0]
        step = 1 if b >= a else -1
        if way['oneway'] and step < 0:
            raise ValueError('Toyota lower D/E boundary reversed the real roundabout')
        return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
                'oneway': way['oneway'], 'role': role}

    boundaries = [
        chain('746744858', ARRIVAL_NODE, '2494477553', 'north boundary: the separately reviewed Y field southern road'),
        chain('241869962', '2494477553', '2494477539', 'east boundary: the independently matched F/G field western spine'),
        chain('241869913', '2494477539', '2494477536', 'actual northeast roundabout arc, with its mapped one-way direction'),
        chain('241869952', '2494477536', '2494477510', 'south boundary: confirmed R01 staging road NORTH of the railway'),
        chain('241869968', '2494477510', ARRIVAL_NODE, 'western distributor boundary and shared northwest approach'),
    ]
    for i, boundary in enumerate(boundaries):
        if boundary['nodes'][-1] != boundaries[(i + 1) % len(boundaries)]['nodes'][0]:
            raise ValueError('Reviewed Toyota lower D/E boundary no longer closes')
    road = ways[ARRIVAL_WAY]
    i = road['nodes'].index(ARRIVAL_SEGMENT[0])
    if road['nodes'][i:i + 2] != ARRIVAL_SEGMENT or ARRIVAL_NODE not in ways['746744858']['nodes']:
        raise ValueError('Reviewed Toyota lower D/E shared approach junction changed')
    position = road['points'][road['nodes'].index(ARRIVAL_NODE)]
    if position != [51.3014846, 3.2413383]:
        raise ValueError('Reviewed Toyota lower D/E road approach moved')
    nodes = {node: point for way in ways.values() for node, point in zip(way['nodes'], way['points'])}
    polygon = [nodes[node] for boundary in boundaries for node in boundary['nodes'][:-1]]
    polygon.append(polygon[0])
    imagery = {
        'service': OFW_URL, 'imageryLayer': 'OFW', 'reviewed': '2026-11-20',
        'method': 'Fresh official OFW WMS imagery review of the paved lower field between the reviewed Y southern road, F/G western spine and R01 north-of-railway road. No Google imagery measurements.',
        'reviewImageRequest': {'service': 'WMS', 'request': 'GetMap', 'version': '1.1.1',
                               'layers': 'OFW', 'srs': 'EPSG:4326',
                               'bboxLonLat': [3.2408, 51.3005, 3.2457, 51.3028],
                               'width': 1400, 'height': 1100, 'format': 'image/png'},
        'limitation': 'Whole-field outer roads and their connected junction only. Capture date, individual D/E strips, exact gate and current operational access are not established.',
    }
    basis = ('The historical lower D09-D13/E09-E13 field lies immediately below the independently '
             'matched Y field and west of the separately matched F/G field. The reviewed R01 staging '
             'road and railway form its southern side. These three independent surrounding controls '
             'and the western distributor close the whole lower field. Fresh official OFW imagery '
             'retains its paved storage area and outer-road junctions. The route stops on the actual '
             'northwest boundary-road junction2494477523; no D/E divider or individual numbered row is inferred.')
    limitation = ('Only the combined LOWER D09-D13/E09-E13 field and its northwest road approach are '
                  'positioned. Individual rows, the D/E divider and the operational gate are unverified. '
                  'No D00-D08/E00-E08 bay or any part of the Y field is inferred under these codes.')
    access_note = 'Route stops at the lower D/E field road approach; the exact gate and individual numbered parking positions are not confirmed.'
    toyota = next(m for m in atlas['maps'] if m['id'] == 'toyota')
    if toyota.get('source') != SOURCE_URL or toyota.get('page') != 25 or toyota.get('historical') is not True:
        raise ValueError('Toyota lower D/E source revision needs review')
    parkings = {p['code']: p for p in toyota['parkings']}
    out = {}
    for code, expected in SOURCE_POINTS.items():
        parking = parkings.get(code)
        if not parking or len(parking.get('points', [])) != 1:
            raise ValueError('Reviewed Toyota lower D/E source reference count changed: ' + code)
        point = parking['points'][0]
        source = [round(point['x'] / 3 + 45, 4), round(point['y'] / 3 + 90, 4)]
        if any(abs(a - b) > .02 for a, b in zip(source, expected)) or any(
                abs(parking[axis] - point[axis]) > .02 for axis in ['x', 'y']):
            raise ValueError('Reviewed Toyota lower D/E source glyph identity changed: ' + code)
        out['toyota:' + code] = {
            'lat': position[0], 'lon': position[1], 'name': code + ' · area approach',
            'parking': code, 'areaName': 'Toyota lower D/E field', 'region': REGION_ID,
            'method': 'source-topology-shared-lower-field-road-approach',
            'scope': 'parking-group-approach', 'precision': 'area-approach-only',
            'individualParkingVerified': False, 'lineExact': False, 'historical': True,
            'sourceMap': 'toyota', 'supportedMaps': ['toyota'], 'sourcePage': 25, 'sourceUrl': SOURCE_URL,
            'sourceRevision': 'Cewez historical source; whole lower D/E field independently reviewed with official OFW imagery',
            'sourcePoint': source, 'sourcePoints': [source], 'sourcePointUnits': 'uncropped original PDF points',
            'sourcePointAtlasPixels': [parking['x'], parking['y']],
            'sourceBounds': SOURCE_BOUNDS, 'sourceBoundsUnits': 'uncropped original PDF points',
            'sourceBoundsBasis': 'Reviewed raster envelope of the ten LOWER D/E labels, not a geographic parking polygon or numbered row footprint.',
            'roadWay': ARRIVAL_WAY, 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL_NODE,
            'basis': basis, 'areaAccessNote': access_note,
            'junctionMatch': {'arrivalNode': ARRIVAL_NODE, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': boundaries[0], 'boundaryLanes': boundaries},
            'mappedArea': {'areaName': 'Toyota lower D/E field', 'boundaryReferences': boundaries,
                           'polygon': polygon, 'boundaryLimitation': limitation,
                           'individualParkingVerified': False},
            'imageryEvidence': imagery,
            'labelPosition': {'lat': position[0], 'lon': position[1], 'name': code + ' · area approach',
                              'method': 'shared-lower-field-road-approach', 'scope': 'area-approach-label',
                              'precision': 'area-approach-only', 'individualParkingVerified': False,
                              'basis': 'Display at the SAME real shared road approach; ten old numbered rows are not placed onto the satellite image.'},
        }
    return {
        'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
        'source': 'Cewez page25 lower D/E field, independently reviewed Y/F-G/R01 controls and fresh official OFW imagery',
        'sourceUrls': [SOURCE_URL, OFW_URL],
        'regions': [{'id': REGION_ID, 'codes': list(SOURCE_POINTS), 'sourceMap': 'toyota', 'sourcePage': 25,
                     'sourceUrl': SOURCE_URL, 'areaName': 'Toyota lower D/E field',
                     'sourceBounds': SOURCE_BOUNDS, 'sourceBoundsUnits': 'uncropped original PDF points',
                     'boundaryLanes': boundaries, 'polygon': polygon,
                     'arrivalNode': ARRIVAL_NODE, 'arrivalLatLon': position,
                     'basis': basis, 'precision': 'area-approach-only', 'individualParkingVerified': False,
                     'boundaryLimitation': limitation, 'imageryEvidence': imagery}],
        'roadGuards': {ident: {'orderedGeometrySHA256': fingerprint, 'oneway': direction, 'private': True}
                       for ident, (fingerprint, direction) in ROAD_GUARDS.items()},
        'coverage': 'Only ten LOWER D09-D13/E09-E13 references share one reviewed field-road approach. No individual row, D/E division, exact gate or upper D/E bay is positioned.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit JSON without writing a generated artifact.')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/toyota-de-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('10 historical Toyota lower D/E references: ONE shared field road approach; individual rows/gate unverified.')
