"""Two historical VPC references at one service-area entrance, not old facility coordinates.

The blue LOODS landmark, rail-fan forecourt and adjacent B/A parking ladder
identify the specific processing service area independently of label equality.
Fresh official imagery confirms the existing roof-side road junction. Only
VPC/VPC1 have this reviewed common-area association. Changed TES/PRE/CLT/DLT
partitions remain unresolved. No historical source point is transformed to GPS.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
AREA_NAME = 'VPC service area (older plan)'
REGION_ID = 'bastenaken-legacy-vpc-service-area-entry'
ARRIVAL_NODE = '6986702536'
ARRIVAL_SEGMENT = ['6986702539', '6986702536']
ROAD_GUARDS = {
    '746582117': ('d650222c3df776bfdbbd3afa655a5dd9571cbaf03a1c73e2c3a3e4e2c536dd0c', False),
    '1349890082': ('71d852a9c38b8497db90968aa495c08e128a2c9553a6f3f66cf2e69ee1c75f51', True),
    '931027303': ('e259f16fa4337012e68fde71036a146afec73fdbaf406387c253ef2f743b1d2a', False),
    '1349890083': ('7f0c0c189b21baa1327dd78542f69e849929118860f99e4c0ee4c3abbfbe0eac', True),
}
SOURCE_GLYPHS = {'VPC': [288.0, 328.3333], 'VPC1': [260.6667, 307.6667]}
SOURCE_BOUNDS = {'VPC': [277.0, 319.0, 299.0, 338.0],
                 'VPC1': [250.0, 299.0, 271.0, 316.0]}
NOT_ADDED = ['TES', 'PRE', 'CLT1', 'CLT2', 'DLT']
BASIS = (
    'The original VPC and VPC1 references adjoin the blue LOODS landmark in '
    'the processing service cluster, beside the distinctive rail-fan forecourt '
    'and B/A parking ladder. Those surrounding features identify the same '
    'specific current VPC service area independently of name equality. The '
    'official 5 March 2026 image confirms the roof, continuous paved service '
    'forecourt and actual roof-side corner junction6986702536, where road '
    '746582117 meets the one-way transverse road1349890082. The route reaches '
    'that common area entrance only. The old VPC/VPC1 facility positions, '
    'individual parking bays, exact lines and current operational access are '
    'not established. The changed TES/PRE/CLT/DLT partitions are not inherited.')


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = {w['id']: w for w in roads['ways']}
    for ident, (expected, oneway) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not oneway or way.get('private') is not True:
            raise ValueError('Reviewed legacy VPC boundary access/direction changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected:
            raise ValueError('Reviewed legacy VPC boundary geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed legacy VPC boundary road closed: ' + ident)

    def boundary(ident, start, end, role):
        way = ways[ident]
        a, b = way['nodes'].index(start), way['nodes'].index(end)
        step = 1 if b >= a else -1
        return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
                'oneway': way['oneway'], 'role': role}

    boundaries = [
        boundary('746582117', '6986702536', '12487521000', 'VPC roof-side service road and confirmed entrance corner'),
        boundary('1349890082', ARRIVAL_NODE, '2494511854', 'actual transverse road at the VPC roof corner; mapped one-way direction retained'),
        boundary('931027303', '2494511807', '12487520999', 'western rail-fan forecourt road control'),
        boundary('1349890083', '12487521000', '12487520999', 'southern forecourt cross-road control'),
    ]
    way = ways['746582117']
    index = way['nodes'].index(ARRIVAL_SEGMENT[0])
    if way['nodes'][index:index + 2] != ARRIVAL_SEGMENT or ARRIVAL_NODE not in ways['1349890082']['nodes']:
        raise ValueError('Reviewed legacy VPC common entrance junction changed.')
    point = way['points'][way['nodes'].index(ARRIVAL_NODE)]
    if point != [51.3082167, 3.2192177]:
        raise ValueError('Reviewed legacy VPC corner moved.')

    old = next(m for m in atlas['maps'] if m['id'] == 'bastenaken')
    parkings = {p['code']: p for p in old['parkings']}
    flight = {
        'service': OFW_URL, 'imageryLayer': 'OFW', 'queryLayer': 'OFW_vdc',
        'dataset': 'Orthofotowerkbestand2026.01', 'flightDate': '2026-03-05',
        'reportedFlightDate': '5/3/2026', 'featureId': '4', 'reviewed': '2026-11-19',
        'method': 'Official OFW_vdc GetFeatureInfo OpnDatum at the centre of the reviewed VPC imagery frame.',
        'query': {'version': '1.3.0', 'crs': 'EPSG:4326',
                  'bboxLatLon': [51.3067, 3.2183, 51.3092, 3.2210],
                  'width': 1600, 'height': 1600, 'i': 800, 'j': 800, 'infoFormat': 'text/html'},
        'limitation': 'Imagery confirms the common service area and physical road entrance, not historical facility interiors or current operating permissions.',
    }
    out = {}
    for code, expected in SOURCE_GLYPHS.items():
        parking = parkings[code]
        source = [[round(p['x'] / 3 + 45, 4), round(p['y'] / 3 + 90, 4)] for p in parking['points']]
        if len(source) != 1 or any(abs(a - b) > .02 for a, b in zip(source[0], expected)):
            raise ValueError('Reviewed legacy VPC source glyph moved or changed: ' + code)
        out['bastenaken:' + code] = {
            'lat': point[0], 'lon': point[1], 'parking': code, 'name': code + ' · area entrance',
            'areaName': AREA_NAME, 'region': REGION_ID,
            'method': 'source-landmark-and-2026-imagery-area-entrance',
            'scope': 'parking-group-approach', 'precision': 'area-entry-only',
            'historical': True, 'individualParkingVerified': False, 'lineExact': False,
            'sourceMap': 'bastenaken', 'sourcePage': 23, 'sourceUrl': SOURCE_URL,
            'sourceRevision': 'Cewez older plan; common service-area entrance reviewed with OFW2026',
            'sourcePoint': source[0], 'sourcePoints': source,
            'sourcePointUnits': 'uncropped original PDF points',
            'sourceBounds': SOURCE_BOUNDS[code], 'sourceBoundsScope': 'reviewed-raster-label-envelope',
            'sourceBoundsBasis': 'Visual envelope of the historical printed label, not a geographic parcel or projected bay.',
            'roadWay': '746582117', 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL_NODE,
            'basis': BASIS,
            'junctionMatch': {'arrivalNode': ARRIVAL_NODE, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': boundaries[1], 'boundaryLanes': boundaries},
            'mappedArea': {'areaName': AREA_NAME, 'boundaryReferences': boundaries,
                           'individualParkingVerified': False,
                           'boundaryLimitation': 'These roof/forecourt controls identify the common processing service area. They are not surveyed historical facility boundaries or individual parking parcels.'},
            'flightEvidence': flight,
            'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                              'method': 'confirmed-common-service-area-entrance', 'scope': 'area-entrance-label',
                              'precision': 'area-entry-only', 'individualParkingVerified': False,
                              'basis': 'Display at the confirmed entrance, never an invented historical facility or parking position.'},
        }
    return {
        'version': 1, 'reviewed': '2026-11-19', 'destinations': out,
        'source': 'Cewez page23, current VPC landmark/forecourt topology and official OFW2026 imagery',
        'sourceUrls': [SOURCE_URL, OFW_URL],
        'regions': [{'id': REGION_ID, 'sourceMap': 'bastenaken', 'sourcePage': 23,
                     'codes': list(SOURCE_GLYPHS), 'areaName': AREA_NAME,
                     'sourcePoints': SOURCE_GLYPHS, 'boundaryLanes': boundaries,
                     'arrivalNode': ARRIVAL_NODE, 'arrivalLatLon': point,
                     'basis': BASIS, 'flightEvidence': flight,
                     'precision': 'area-entry-only', 'individualParkingVerified': False}],
        'roadGuards': {way: {'orderedGeometrySHA256': h, 'oneway': direction, 'private': True}
                       for way, (h, direction) in ROAD_GUARDS.items()},
        'notAdded': NOT_ADDED,
        'limitation': 'Only VPC and VPC1 reach a confirmed common-area entrance. No individual historical facility/bay/line location is established. TES/PRE/CLT1/CLT2/DLT remain unresolved.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'scripts/geo/legacy-vpc-area-destinations.json')
    args = parser.parse_args()
    result = build()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('2 historical VPC references: confirmed common-area entrance only; other facility references remain unresolved.')
