"""One independently matched Toyota F/G FIELD entry, not thirty row positions.

The historical drawing's F/G columns share the distinctive curved rail-side
field east of Y and north of Bridgestone. The F13 wind turbine, western Y-side
spine, curved north/east perimeter and southern roundabout close the physical
field independently of any global drawing transform. Fresh official OFW
imagery retains that whole field and the open western cross-field junction.
Its internal rows differ from the old drawing. Only the shared field entry is
emitted; no F/G divider, numbered row, exact line or current permission is
inferred. No Google imagery is used to derive geographic data.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
REGION_ID = 'toyota-fg-shared-whole-field-entry'
ARRIVAL_NODE = '6988020211'
ARRIVAL_WAY = '241869962'
ARRIVAL_SEGMENT = ['2494477553', ARRIVAL_NODE]
SOURCE_ROWS = [314, 328, 341, 355, 369, 382, 396, 409, 423, 436, 450, 463, 477, 490, 503]
SOURCE_POINTS = {letter + f'{n:02}': [x, y] for letter, x in [('F', 407), ('G', 480)]
                 for n, y in enumerate(SOURCE_ROWS)}
SOURCE_BOUNDS = [387, 304, 560, 507]
ROAD_GUARDS = {
    '241869962': ('604b73b7d4d2731604eb92595ad6f45930613dd283dfef91fea1c324192e52a6', False),
    '241869964': ('6aed3e73b461d10dda791b2fb8cc9afd60f525c3af759d508afb55f2bd698052', False),
    '241869913': ('eb82bfd55709466ee077dca11192afcf1cfc3203f54e1ce66e0f80837653b14b', True),
    '746744860': ('1078e07bd23a6ac19b14e795160987fd20521c17b6aa7ed3dd97602b08bcb75e', False),
    '241869917': ('29fd55c80ed84a918813793f2178fd4d887a1addcbbf8d2cc6965178bdd737b9', False),
}


def guarded_ways(roads):
    ways = {way['id']: way for way in roads['ways']}
    for ident, (expected, direction) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not direction or way.get('private') is not True:
            raise ValueError('Reviewed Toyota F/G field direction/access changed: ' + ident)
        geometry = json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':'))
        if hashlib.sha256(geometry.encode()).hexdigest() != expected:
            raise ValueError('Reviewed Toyota F/G field geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed Toyota F/G field road is closed: ' + ident)
    return ways


def chain(ways, ident, start, end, role):
    way = ways[ident]
    a = way['nodes'].index(start)
    endings = [i for i, node in enumerate(way['nodes']) if node == end]
    b = next((i for i in endings if i >= a), endings[0]) if way['oneway'] else endings[0]
    step = 1 if b >= a else -1
    if way['oneway'] and step < 0:
        raise ValueError('Toyota F/G boundary reversed the real roundabout: ' + ident)
    return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
            'oneway': way['oneway'], 'role': role}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    toyota = next(m for m in atlas['maps'] if m['id'] == 'toyota')
    if toyota.get('source') != SOURCE_URL or toyota.get('page') != 25 or toyota.get('historical') is not True:
        raise ValueError('Toyota F/G source revision needs review')
    parkings = {p['code']: p for p in toyota['parkings']}
    boundaries = [
        chain(ways, '241869962', '2494477539', '2494477590', 'western field boundary beside the separately matched Y field'),
        chain(ways, '241869964', '2494477590', '2494477533', 'northern and curved eastern perimeter INSIDE the railway, above Bridgestone'),
        chain(ways, '241869913', '2494477533', '2494477539', 'actual southern roundabout arc; mapped one-way direction retained'),
    ]
    for i, boundary in enumerate(boundaries):
        if boundary['nodes'][-1] != boundaries[(i + 1) % len(boundaries)]['nodes'][0]:
            raise ValueError('Reviewed Toyota F/G whole-field boundary no longer closes')
    crosslane = chain(ways, '746744860', ARRIVAL_NODE, '6988020212', 'real western field entry continuing through the F/G field to the inner curved perimeter')
    axis = chain(ways, '241869917', '2494477546', '2494477646', 'independent internal field spine connecting the northern and southern curved boundary')
    way = ways[ARRIVAL_WAY]
    index = way['nodes'].index(ARRIVAL_SEGMENT[0])
    if way['nodes'][index:index + 2] != ARRIVAL_SEGMENT or ARRIVAL_NODE not in ways['746744860']['nodes']:
        raise ValueError('Reviewed Toyota F/G western field entry changed')
    position = way['points'][way['nodes'].index(ARRIVAL_NODE)]
    if position != [51.3030006, 3.2442476]:
        raise ValueError('Reviewed Toyota F/G field arrival moved')
    points = {node: point for road in ways.values() for node, point in zip(road['nodes'], road['points'])}
    polygon = [points[node] for boundary in boundaries for node in boundary['nodes'][:-1]]
    polygon.append(polygon[0])
    imagery = {
        'service': OFW_URL, 'imageryLayer': 'OFW', 'reviewed': '2026-11-20',
        'method': 'Fresh official OFW WMS aerial review of the closed rail-side storage field, western spine/Y neighbour, F13 turbine and Bridgestone warehouse. No Google imagery measurements.',
        'reviewImageRequest': {'service': 'WMS', 'version': '1.1.1', 'request': 'GetMap',
                               'layers': 'OFW', 'srs': 'EPSG:4326',
                               'bboxLonLat': [3.2428, 51.3014, 3.2495, 51.3058],
                               'width': 1400, 'height': 1400, 'format': 'image/png'},
        'limitation': 'The whole field and real western entry junction are identifiable. Capture date, current gate operations, numbered row positions and exact lines are not established.',
    }
    landmark = {'sourceParking': 'F13', 'sourcePoint': [429.4, 489.0],
                'sourceUnits': 'uncropped original PDF points; turbine symbol, not the F13 label',
                'osmNode': '5147482728', 'geoLatLon': [51.3022612, 3.2465473],
                'role': 'Independent turbine landmark inside the southern part of the shared F/G field; never a parking arrival or a transform fitted to all thirty rows.'}
    association = ('The historical F00-F14 and G00-G14 columns form the common field east of the Y area, '
                   'inside the distinctive curved railway perimeter and north of Bridgestone. The independently '
                   'identified turbine inside F13, the western Y-side road, continuous northern/eastern curve '
                   'and southern roundabout establish the WHOLE field without interpolating numbered strips. '
                   'Fresh official OFW imagery retains those surrounding features and the open cross-field '
                   'road junction6988020211 on the western boundary. All thirty references share that field '
                   'entry only; individual F/G divisions, row positions, exact lines and current access permission remain unverified.')
    limitation = ('This is one combined historical F/G field and its western entry. No individual F/G divider, '
                  'numbered parking row or precise line is mapped; the field also contains changed parking partitions. '
                  'The external Z apron, rail crossing and independently unresolved northern facilities are not included.')
    out = {}
    for code, expected in SOURCE_POINTS.items():
        parking = parkings.get(code)
        if not parking or len(parking.get('points', [])) != 1:
            raise ValueError('Reviewed Toyota F/G source reference count changed: ' + code)
        point = parking['points'][0]
        source = [round(point['x'] / 3 + 45, 4), round(point['y'] / 3 + 90, 4)]
        if any(abs(a - b) > .02 for a, b in zip(source, expected)) or any(
                abs(parking[axis] - point[axis]) > .02 for axis in ['x', 'y']):
            raise ValueError('Reviewed Toyota F/G source glyph identity changed: ' + code)
        out['toyota:' + code] = {
            'lat': position[0], 'lon': position[1], 'name': code + ' · area entrance',
            'parking': code, 'areaName': 'Toyota F/G field', 'region': REGION_ID,
            'method': 'source-topology-and-independent-landmark-shared-field-entry',
            'scope': 'parking-group-approach', 'precision': 'area-entry-only',
            'individualParkingVerified': False, 'lineExact': False, 'historical': True,
            'sourceMap': 'toyota', 'supportedMaps': ['toyota'], 'sourcePage': 25, 'sourceUrl': SOURCE_URL,
            'sourceRevision': 'Cewez historical source; combined F/G whole-field association independently reviewed with official OFW imagery',
            'sourcePoint': source, 'sourcePoints': [source],
            'sourcePointUnits': 'uncropped original PDF points',
            'sourcePointAtlasPixels': [parking['x'], parking['y']],
            'sourceBounds': SOURCE_BOUNDS, 'sourceBoundsUnits': 'uncropped original PDF points',
            'sourceBoundsBasis': 'Reviewed raster envelope of the thirty F/G source labels, not a geographic parking polygon or numbered row footprint.',
            'roadWay': ARRIVAL_WAY, 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL_NODE,
            'basis': association,
            'junctionMatch': {'arrivalNode': ARRIVAL_NODE, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': crosslane, 'boundaryLanes': boundaries,
                              'independentFieldAxis': axis},
            'mappedArea': {'areaName': 'Toyota F/G field', 'boundaryReferences': boundaries,
                           'polygon': polygon, 'boundaryLimitation': limitation,
                           'individualParkingVerified': False},
            'flightEvidence': imagery,
            'labelPosition': {'lat': position[0], 'lon': position[1], 'name': code + ' · area entrance',
                              'method': 'confirmed-combined-field-entry', 'scope': 'area-entrance-label',
                              'precision': 'area-entry-only', 'individualParkingVerified': False,
                              'basis': 'Display at the SAME real shared field entry; thirty numbered source rows are not interpolated onto the satellite image.'},
        }
    return {
        'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
        'source': 'Cewez page25 F/G common-field topology and independent turbine/rail/warehouse controls reviewed against official OFW imagery',
        'sourceUrls': [SOURCE_URL, OFW_URL],
        'regions': [{'id': REGION_ID, 'codes': list(SOURCE_POINTS), 'sourceMap': 'toyota', 'sourcePage': 25,
                     'sourceUrl': SOURCE_URL, 'areaName': 'Toyota F/G field', 'sourceBounds': SOURCE_BOUNDS,
                     'sourceBoundsUnits': 'uncropped original PDF points', 'sourcePoints': SOURCE_POINTS,
                     'boundaryLanes': boundaries, 'polygon': polygon,
                     'landmarkControl': landmark, 'independentFieldAxis': axis,
                     'arrivalNode': ARRIVAL_NODE, 'arrivalLatLon': position,
                     'basis': association, 'precision': 'area-entry-only',
                     'individualParkingVerified': False, 'imageryEvidence': imagery,
                     'boundaryLimitation': limitation}],
        'roadGuards': {ident: {'orderedGeometrySHA256': fingerprint, 'oneway': direction, 'private': True}
                       for ident, (fingerprint, direction) in ROAD_GUARDS.items()},
        'coverage': '30 historical F/G references share one independently matched WHOLE-FIELD entry. No individual numbered parking or exact line is located.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit JSON without writing a generated artifact.')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/toyota-fg-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('30 historical Toyota F/G references: ONE confirmed shared field entry; individual rows remain unverified.')
