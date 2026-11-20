"""Current CH1-CH24 share a reviewed WHOLE-AREA ROAD APPROACH.

The source CH band is southeast of the AH/BH staff-side end, not the tempting
WWL grid on the opposite side of Koffieweg. Official aerial imagery preserves
the long storage corridor, northern staff/service junction, rail/MVO-side lane
and rounded southern redevelopment. Port company polygons independently put
this corridor in ICO5210. These controls support the common area association,
not 24 individual CH locations, an operating gate or internal lane divisions.
No Google imagery, source ordinal interpolation or new graph road is used.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
OLDER_SOURCE_URL = 'https://www.icoterminals.com/sites/default/files/2023-11/Zuidelijk%20insteekdok%20Zeebrugge.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
PORT_URL = 'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/20'
ARRIVAL_NODE = '12487520977'
ARRIVAL_WAY = '241873267'
ARRIVAL_SEGMENT = ['2494511830', ARRIVAL_NODE]
REGION = 'south-ch-whole-area-road-approach'
ROAD_GUARDS = {
    '241873267': ('bfbadabcb9b853ede9acf2c473420e5c9012ea12b3ed0524a0615b25ff035a37', True),
    '562258752': ('e58fefd71357708ba13c4d6003801e58800549d5995308c893d057e60dea3897', True),
    '562258755': ('8947a22dd446a46f3d63c6fd0e0817b6f07f306f4addb260cadce5e837a17283', True),
    '1067857541': ('0d966bbc23c4f0e6945d656903173c172233cf1b4594cb8128c348d0bd82449b', True),
    '455288624': ('4004221012fdd4cfd9ecccdee63872b247dc76fc613900ee5660eeeb53e95dc5', False),
    '1082745638': ('1dce3eb11556192f436f6f8f4d5109a00dc35bebaf1b80305503d4a8d0e80f2d', False),
    '505944301': ('551a5156f56e6b9a94651767c5edcf4a1db2a152c2ba9fcb241dd89229b27b34', False),
}
# Reviewed printed source reference positions, in original page1 PDF points.
# CH24 is printed at two edges. These positions are retained only as evidence.
SOURCE_POINTS = {
    'CH1': [[905.7867, 169.5567]], 'CH2': [[896.49, 169.8867]],
    'CH3': [[887.2733, 170.32]], 'CH4': [[877.2067, 170.4267]],
    'CH5': [[867.2767, 170.5367]], 'CH6': [[858.2633, 170.6433]],
    'CH7': [[848.2867, 170.32]], 'CH8': [[838.5233, 170.7533]],
    'CH9': [[828.99, 170.6433]], 'CH10': [[817.76, 169.38]],
    'CH11': [[808.1, 169.52]], 'CH12': [[797.8867, 169.41]],
    'CH13': [[788.18, 169.3033]], 'CH14': [[777.96, 169.41]],
    'CH15': [[767.4, 169.2]], 'CH16': [[757.5667, 169.1967]],
    'CH17': [[747.2167, 169.1967]], 'CH18': [[736.6267, 169.7367]],
    'CH19': [[725.9833, 169.7367]], 'CH20': [[714.17, 169.1767]],
    'CH21': [[703.64, 168.9667]], 'CH22': [[693.1867, 169.14]],
    'CH23': [[682.7467, 168.98]],
    'CH24': [[670.67, 182.56], [670.7067, 131.0133]],
}


def guarded_ways(roads):
    ways = {w['id']: w for w in roads['ways']}
    for ident, (expected, private) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not False or way.get('private') is not private:
            raise ValueError('Reviewed CH corridor road direction/access changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected or way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed CH corridor geometry/closure changed: ' + ident)
    return ways


def chain(ways, ident, start, end, role):
    way = ways[ident]
    a, b = way['nodes'].index(start), way['nodes'].index(end)
    step = 1 if b >= a else -1
    return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
            'oneway': False, 'role': role}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    south = next(m for m in atlas['maps'] if m['id'] == 'south')
    if south.get('source') != SOURCE_URL or south.get('page') != 1 or south.get('historical') is not False:
        raise ValueError('Reviewed CH current source revision changed')
    parkings = {p['code']: p for p in south['parkings']}
    road = ways[ARRIVAL_WAY]
    start = road['nodes'].index(ARRIVAL_SEGMENT[0])
    if road['nodes'][start:start + 2] != ARRIVAL_SEGMENT or ways['562258752']['nodes'][0] != ARRIVAL_NODE:
        raise ValueError('Reviewed CH northern service-lane junction changed')
    point = road['points'][road['nodes'].index(ARRIVAL_NODE)]
    if point != [51.3081761, 3.2159818]:
        raise ValueError('Reviewed CH approach moved')
    controls = {
        'sourceTopology': 'Current CH1-CH24 form the long band beyond the AH/BH staff parking and REPBC, beside railway tracks21-24 and Margareta van Oostenrijkstraat. The source curved far end and the long field between the western road and rail-side service lane distinguish the common corridor. No individual source strip is projected to GPS.',
        'olderSource': {'url': OLDER_SOURCE_URL, 'page': 1, 'revision': '08/02/2023',
                        'basis': 'The official 2023 source already names CH1 and adjacent DH1 beyond the staff/REPBC end. This supports corridor continuity only; neither old CH1 nor DH1 is emitted as a current alias.'},
        'ownerEvidence': {'dataset': PORT_URL, 'queried': '2026-11-20',
                          'objectId': 365, 'company': 'ICO', 'terminal': '5210',
                          'pointsLonLat': [[3.2155, 51.306], [3.2165, 51.304], [3.2175, 51.302], [3.2182, 51.3047]],
                          'limitation': 'Company polygons support the geographic corridor, not current access rights or the CH internal subdivisions.'},
        'rejectedWWL': {'dataset': PORT_URL, 'queried': '2026-11-20', 'objectId': 282,
                        'terminal': '5010', 'company': 'WALLENIUS WILHELMSEN LOGISTICS ZEEBRUGGE',
                        'pointsLonLat': [[3.209, 51.309], [3.211, 51.310], [3.211, 51.308], [3.212, 51.306]],
                        'basis': 'The storage grid WEST of Koffieweg belongs to WWL in this dataset. It is excluded; CH association uses the ICO corridor EAST of Koffieweg.'},
        'imageryEvidence': {'service': OFW_URL, 'imageryLayer': 'OFW', 'reviewed': '2026-11-20',
                            'reviewImageRequest': {'version': '1.1.1', 'CRS': 'EPSG:4326',
                                                   'bboxLonLat': [3.212, 51.300, 3.222, 51.308],
                                                   'width': 1400, 'height': 1500, 'format': 'image/png'},
                            'basis': 'Independent official aerial review retains the long ICO-side vehicle-storage corridor, northern staff/service approach, rail-side lane and rounded southern redevelopment. No Google imagery measurements.',
                            'limitation': 'The exact capture date, numbered internal CH boundaries and operating gate were not independently confirmed.'},
    }
    boundaries = [
        chain(ways, '241873267', '12487520987', ARRIVAL_NODE, 'northern staff-side distributor and reviewed shared area road approach'),
        chain(ways, '562258752', ARRIVAL_NODE, '5420487866', 'existing northern rail-side service lane; not a claim that every onward CH aisle is mapped'),
        chain(ways, '1067857541', '12487520987', '1496916936', 'Koffieweg western corridor control; WWL grid across this road is excluded'),
        chain(ways, '455288624', '1496916930', '5420487868', 'Margareta van Oostenrijkstraat eastern rail-side corridor control'),
        chain(ways, '1082745638', '1496916936', '4957626341', 'southern public-road landmark beside the rounded redevelopment'),
        chain(ways, '505944301', '4957626341', '1496916930', 'southern public junction control; not an invented parking entry'),
    ]
    limitation = ('These surrounding controls identify the whole CH corridor and its real northern road approach, not a precise CH parking polygon. '
                  'Individual CH strips, exact line positions, the operating gate and current access permissions are not confirmed. '
                  'The southern redevelopment and internal onward roads are not separately positioned or connected by invented graph edges.')
    basis = (controls['sourceTopology'] + ' Official aerial and ICO5210 operator controls independently support this common corridor east of Koffieweg. '
             'Routing ends at the actual northern distributor/service-lane junction12487520977. This is a whole-area road approach, not an individually verified CH parking or gate.')
    note = 'Route ends at the CH area road approach; the exact gate and individual CH strips remain unconfirmed. Follow current terminal signs inside the area.'
    out = {}
    bounds = [660, 98, 915, 209]
    for code, expected in SOURCE_POINTS.items():
        parking = parkings.get(code)
        if not parking:
            raise ValueError('Reviewed CH source reference removed: ' + code)
        source = [[round(p['x'] / 3, 4), round(p['y'] / 3, 4)] for p in parking['points']]
        if len(source) != len(expected) or any(abs(a-b) > .00011 for p, q in zip(source, expected) for a, b in zip(p, q)):
            raise ValueError('Reviewed CH source identity changed: ' + code)
        if not all(bounds[0] <= p[0] <= bounds[2] and bounds[1] <= p[1] <= bounds[3] for p in source):
            raise ValueError('Reviewed CH label left source area: ' + code)
        out['south:' + code] = {
            'lat': point[0], 'lon': point[1], 'name': code + ' · area approach',
            'parking': code, 'areaName': 'CH parking area', 'region': REGION,
            'method': 'source-topology-shared-area-road-approach', 'scope': 'parking-group-approach',
            'precision': 'area-approach-only', 'individualParkingVerified': False, 'lineExact': False,
            'sourceMap': 'south', 'supportedMaps': ['south'], 'historical': False,
            'sourcePage': 1, 'sourceUrl': SOURCE_URL, 'sourceRevision': 'V1.09-2026',
            'sourcePoint': source[0], 'sourcePoints': source, 'sourcePointUnits': 'uncropped original PDF points',
            'sourcePointAtlasPixels': [parking['x'], parking['y']],
            'sourceBounds': bounds, 'sourceBoundsUnits': 'uncropped original PDF points',
            'sourceBoundsBasis': 'Whole source CH-band drawing envelope, not a geographic polygon or individual parking footprint.',
            'roadWay': ARRIVAL_WAY, 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL_NODE,
            'basis': basis, 'areaAccessNote': note,
            'junctionMatch': {'arrivalNode': ARRIVAL_NODE, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': boundaries[1], 'boundaryLanes': boundaries},
            'mappedArea': {'areaName': 'CH parking area', 'boundaryReferences': boundaries,
                           'individualParkingVerified': False, 'boundaryLimitation': limitation},
            'independentControls': controls,
            'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area approach',
                              'method': 'shared-area-road-approach', 'scope': 'area-approach-label',
                              'precision': 'area-approach-only', 'individualParkingVerified': False,
                              'basis': 'Display at the SAME real northern area road approach. No numbered CH centre or gate coordinate is inferred.'},
        }
    return {'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
            'regions': [{'id': REGION, 'codes': list(SOURCE_POINTS), 'sourceMap': 'south',
                         'sourceUrl': SOURCE_URL, 'sourcePage': 1, 'sourceBounds': bounds,
                         'areaName': 'CH parking area', 'precision': 'area-approach-only',
                         'individualParkingVerified': False, 'arrivalNode': ARRIVAL_NODE,
                         'arrivalLatLon': point, 'boundaryLanes': boundaries, 'controls': controls,
                         'basis': basis, 'limitation': limitation}],
            'sourceUrls': [SOURCE_URL, OLDER_SOURCE_URL, OFW_URL, PORT_URL],
            'roadGuards': {ident: {'orderedGeometrySHA256': fingerprint, 'oneway': False, 'private': private}
                           for ident, (fingerprint, private) in ROAD_GUARDS.items()},
            'unresolved': [], 'coverage': '24 current CH references share one whole-area ROAD APPROACH. No individual CH position, exact gate or historical alias is claimed.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/ch-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('24 current CH references; ONE shared whole-area road approach; individual strips and gate unconfirmed')
