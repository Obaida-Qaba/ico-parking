"""One historical Toyota B/C MACRO-CORRIDOR road approach, never23 bay centres.

The old B and C columns are between the separate quay strip and the eastern
yard/Y corridor, below the A field and above the southern rail/R01 band. The
independent C11 turbine remains inside the closed six-road macro. Official
aerial imagery and Toyota5230 operator controls retain those whole-corridor
relationships while internal partitions have changed. No B/C split or current
FLUX-to-old-B-number equivalence is inferred. All labels stay at one actual
southwest road junction. No Google data or reflected source transform is used.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
PORT_URL = 'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/20'
REGION = 'toyota-historical-bc-whole-corridor-road-approach'
ARRIVAL = '2494477505'
ARRIVAL_SEGMENT = ['2494477505', '2494477514']
ROAD_GUARDS = {
    '241869964': ('6aed3e73b461d10dda791b2fb8cc9afd60f525c3af759d508afb55f2bd698052', False),
    '241869927': ('bdae5f88892b549ca2293dc37085fcbfb3db35fa7dfdad8de438afa482c4c559', True),
    '746744824': ('cc0ed740018c999c0fe05e828de836d46ee0652c8872e4a2ffe0cc503d02e9a9', False),
    '241869968': ('ba9384e204a574516a39abed33a4c332adb460482834f8d3202b7fdf9492aaed', False),
    '241869952': ('bbeb51d85d0c48efeeb93d378e00518902f14f8c3552217fcd3edb7dc419c1a0', False),
    '241869946': ('32c7e2bf5c85361086a372bbecb1f5e6976c28460124ff494c363c8b71c72ba9', False),
}
SOURCE_POINTS = {
    'B01': [[157, 190]], 'B02': [[157, 204]], 'B03': [[157, 218]],
    'B04': [[157, 232]], 'B05': [[157, 246]], 'B06': [[157, 259]],
    'B07': [[157, 273]], 'B08': [[157, 287]], 'B09': [[157, 301]],
    'B10': [[157, 314]], 'C01': [[157, 327]], 'C02': [[157, 340]],
    'C03': [[157, 354]], 'C04': [[157, 368]], 'C05': [[157, 382]],
    'C06': [[157, 396]], 'C07': [[157, 409]], 'C08': [[157, 422]],
    'C09': [[157, 436]], 'C10': [[157, 449]], 'C11': [[157, 463]],
    'C12': [[157, 476]], 'C13': [[157, 490]],
}


def guarded_ways(roads):
    ways = {w['id']: w for w in roads['ways']}
    for ident, (expected, oneway) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not oneway or way.get('private') is not True:
            raise ValueError('Reviewed Toyota B/C macro road direction/access changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected or way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed Toyota B/C macro geometry/closure changed: ' + ident)
    return ways


def chain(ways, ident, start, end, role):
    way = ways[ident]
    a, b = way['nodes'].index(start), way['nodes'].index(end)
    step = 1 if b >= a else -1
    if way['oneway'] and step < 0:
        raise ValueError('Reviewed Toyota B/C macro reversed a one-way control')
    return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
            'oneway': way['oneway'], 'role': role}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    source_map = next(m for m in atlas['maps'] if m['id'] == 'toyota')
    if source_map.get('source') != SOURCE_URL or source_map.get('page') != 25 or source_map.get('historical') is not True:
        raise ValueError('Reviewed historical Toyota B/C source changed')
    parkings = {p['code']: p for p in source_map['parkings']}
    if {code for code in parkings if code[0] in 'BC' and code[1:].isdigit()} != set(SOURCE_POINTS):
        raise ValueError('Reviewed historical Toyota B/C inventory changed')
    boundaries = [
        chain(ways, '241869964', '2494477622', '2494477658', 'northern cross-road; the separate A loop remains outside this macro'),
        chain(ways, '241869927', '2494477658', '2494477632', 'northeastern boundary; one-way direction retained'),
        chain(ways, '746744824', '2494477632', '2494477605', 'northern east-side service-road boundary'),
        chain(ways, '241869968', '2494477605', '2494477510', 'eastern corridor boundary; Y/D/E compounds remain outside'),
        chain(ways, '241869952', '2494477510', ARRIVAL, 'southern rail/R01-side boundary and actual southwest road approach'),
        chain(ways, '241869946', ARRIVAL, '2494477622', 'western distributor; separate H quay strips remain outside'),
    ]
    polygon = []
    for i, boundary in enumerate(boundaries):
        if boundary['nodes'][-1] != boundaries[(i+1) % len(boundaries)]['nodes'][0]:
            raise ValueError('Reviewed Toyota B/C macro boundaries no longer close')
        way = ways[boundary['way']]
        polygon.extend(way['points'][way['nodes'].index(node)] for node in boundary['nodes'][:-1])
    polygon.append(polygon[0])
    road = ways['241869946']
    if road['nodes'][:2] != ARRIVAL_SEGMENT or ARRIVAL not in ways['241869952']['nodes']:
        raise ValueError('Reviewed Toyota B/C southwest road junction changed')
    point = road['points'][0]
    if point != [51.3001203, 3.2402288]:
        raise ValueError('Reviewed Toyota B/C approach moved')
    controls = {
        'c11Turbine': {'osmNode': '5147481310', 'latLon': [51.3007641, 3.2406611],
                      'sourcePoint': [173.5, 460.3], 'sourcePointUnits': 'uncropped original PDF points',
                      'role': 'Independently identifiable turbine inside the printed C11 end of the whole corridor. Used as a macro landmark only, never to fit numbered bay centres.'},
        'sourceTopology': 'The old B01-B10 and C01-C13 columns form one western storage corridor below the A01-A04 field, east of DRAAD2 and the separate H quay strips, west of the processing/Y/D/E corridor and north of R01 plus the southern railway. Their B/C dividing row and all individual current partitions remain unlocated.',
        'ownerEvidence': {'dataset': PORT_URL, 'queried': '2026-11-20', 'company': 'TOYOTA MOTOR EUROPE',
                          'terminal': '5230', 'objectId': 33,
                          'pointsLonLat': [[3.2383, 51.3047], [3.2395, 51.303], [3.2405, 51.301], [3.2406611, 51.3007641]],
                          'limitation': 'Operator attribution supports the macro geography, not old code positions, current gate operation or driving permission.'},
        'separateAField': {'pointLonLat': [3.2363, 51.3055], 'company': 'ICO', 'terminal': '5250', 'objectId': 296,
                           'basis': 'Fresh Port layer20 query supports the separate northern A-loop control; it is not folded into the Toyota B/C macro.'},
        'imageryEvidence': {'service': OFW_URL, 'imageryLayer': 'OFW', 'reviewed': '2026-11-20',
                            'reviewImageRequest': {'version': '1.1.1', 'CRS': 'EPSG:4326',
                                                   'bboxLonLat': [3.234, 51.2995, 3.243, 51.306],
                                                   'width': 1400, 'height': 1450, 'format': 'image/png'},
                            'basis': 'Independent official aerial review retains the quay-side western distributor, cross-field northern road, eastern lane, southern railway and C11 turbine inside this road-bounded macro. No Google measurements.',
                            'limitation': 'Internal field divisions changed. The B/C split, numbered historical rows, exact gate and capture date were not independently confirmed.'},
    }
    limitation = ('The closed macro contains the broad historical B/C corridor and current service/cross-field subdivisions. '
                  'No B/C split, individual numbered parking position or precise operational gate is established. '
                  'Current FLUX callouts are not equated with any historical B or C code. '
                  'H quay strips, the northern A field and eastern Y/D/E areas are excluded.')
    basis = (controls['sourceTopology'] + ' The C11 turbine, retained road/rail/quay controls, official aerial imagery and Toyota5230 attribution support one combined macro-corridor road approach. '
             'Routing stops at the actual southwest distributor/rail-side road junction2494477505, not at an inferred numbered bay.')
    note = 'Route ends at the shared historical B/C area road approach. Historical numbered rows, the B/C split and exact gate remain unconfirmed; follow current terminal signs.'
    bounds, out = [139, 184, 209, 495], {}
    for code, expected in SOURCE_POINTS.items():
        parking = parkings[code]
        source = [[round(p['x']/3+45, 4), round(p['y']/3+90, 4)] for p in parking['points']]
        if len(source) != len(expected) or any(abs(a-b) > .00011 for p, q in zip(source, expected) for a, b in zip(p, q)):
            raise ValueError('Reviewed Toyota B/C source glyph changed: ' + code)
        if not all(bounds[0] <= p[0] <= bounds[2] and bounds[1] <= p[1] <= bounds[3] for p in source):
            raise ValueError('Reviewed Toyota B/C label left the source corridor: ' + code)
        out['toyota:'+code] = {
            'lat': point[0], 'lon': point[1], 'name': code+' · area approach',
            'parking': code, 'areaName': 'Historical Toyota B/C area', 'region': REGION,
            'method': 'source-topology-shared-area-road-approach', 'scope': 'parking-group-approach',
            'precision': 'area-approach-only', 'individualParkingVerified': False, 'lineExact': False,
            'historical': True, 'sourceMap': 'toyota', 'supportedMaps': ['toyota'],
            'sourcePage': 25, 'sourceUrl': SOURCE_URL, 'sourceRevision': 'Cewez historical page25; individual old numbering unverified',
            'sourcePoint': source[0], 'sourcePoints': source, 'sourcePointUnits': 'uncropped original PDF points',
            'sourcePointAtlasPixels': [parking['x'], parking['y']],
            'sourceBounds': bounds, 'sourceBoundsUnits': 'uncropped original PDF points',
            'sourceBoundsBasis': 'Whole historical B/C source column envelope, not a geographic parking footprint.',
            'roadWay': '241869946', 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL,
            'basis': basis, 'areaAccessNote': note,
            'junctionMatch': {'arrivalNode': ARRIVAL, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': boundaries[4], 'boundaryLanes': boundaries},
            'mappedArea': {'areaName': 'Historical Toyota B/C area', 'boundaryReferences': boundaries,
                           'boundaryPolygonLatLon': polygon, 'individualParkingVerified': False,
                           'boundaryLimitation': limitation},
            'independentControls': controls,
            'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code+' · area approach',
                              'method': 'shared-area-road-approach', 'scope': 'area-approach-label',
                              'precision': 'area-approach-only', 'individualParkingVerified': False,
                              'basis': 'Display at the SAME real macro-corridor road approach. No individual B/C centre, source-fit point or FLUX equivalence is emitted.'},
        }
    return {'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
            'regions': [{'id': REGION, 'codes': list(SOURCE_POINTS), 'sourceMap': 'toyota',
                         'sourceUrl': SOURCE_URL, 'sourcePage': 25, 'sourceBounds': bounds,
                         'areaName': 'Historical Toyota B/C area', 'precision': 'area-approach-only',
                         'individualParkingVerified': False, 'arrivalNode': ARRIVAL,
                         'arrivalLatLon': point, 'boundaryLanes': boundaries, 'boundaryPolygonLatLon': polygon,
                         'controls': controls, 'basis': basis, 'limitation': limitation}],
            'sourceUrls': [SOURCE_URL, OFW_URL, PORT_URL],
            'roadGuards': {ident: {'orderedGeometrySHA256': fingerprint, 'oneway': direction, 'private': True}
                           for ident, (fingerprint, direction) in ROAD_GUARDS.items()},
            'unresolved': [], 'coverage': '23 historical Toyota B/C references share one whole-corridor road approach. No individual row, B/C split, current FLUX equivalence or operating gate claimed.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/toyota-bc-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        print('23 historical Toyota B/C references; ONE macro-corridor road approach; B/C split and individual rows unverified')
