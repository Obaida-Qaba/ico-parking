"""A shared FLUX area ROAD APPROACH, never three invented DR parking cells.

The current South plan has three external leaders pointing to edges of one
FLUX compound. ALD is separately named above it. Official OFW aerial imagery
supports the retained quay/storage/gas-site topology and surrounding roads.
The southwest boundary-road junction is an actual graph point, but neither
the operational gate nor any individual DR location is confirmed. All three
labels therefore remain at that same road approach. No road is added.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
REGION_ID = 'south-flux-shared-area-road-approach'
ARRIVAL_NODE = '2494477575'
ARRIVAL_WAY = '241869946'
ARRIVAL_SEGMENT = ['2494477514', ARRIVAL_NODE]
CODES = ['DRTOY', 'DRWWL', 'DRFLX']

# Original page1 text rectangles. The text and its leader remain source
# evidence; they are not fitted controls or geographic parking coordinates.
SOURCE_GLYPHS = {
    'DRTOY': [565.715271, 625.419617, 583.279358, 632.414734],
    'DRWWL': [685.033325, 587.813721, 705.39209, 594.808838],
    'DRFLX': [621.026917, 630.862915, 637.62561, 637.858032],
    'DRALD': [679.338379, 563.819031, 697.156616, 570.814148],
}
SOURCE_LEADERS = {
    'DRTOY': {'from': [578.09, 625.59], 'to': [602.09, 601.59], 'side': 'west'},
    'DRWWL': {'from': [683.95, 591.99], 'to': [665.29, 592.06], 'side': 'east'},
    'DRFLX': {'from': [629.03, 630.93], 'to': [629.03, 616.82], 'side': 'south'},
}
SOURCE_AREA_BOUNDS = [600.33, 566, 667.35, 618.41]

# Whole ordered geometries, node identities, access and directions are guarded.
# The northern road extends beyond the reviewed field; hashing the complete
# way prevents its node/geometry changes silently altering the source match.
ROAD_GUARDS = {
    '241869946': ('32c7e2bf5c85361086a372bbecb1f5e6976c28460124ff494c363c8b71c72ba9', False),
    '241869944': ('28e0e09fd38bdf7004e978ac1824cb731e0eed86b93cfe1eaa4dcb5f2245d3a3', False),
    '241869964': ('6aed3e73b461d10dda791b2fb8cc9afd60f525c3af759d508afb55f2bd698052', False),
    '241869927': ('bdae5f88892b549ca2293dc37085fcbfb3db35fa7dfdad8de438afa482c4c559', True),
    '746744824': ('cc0ed740018c999c0fe05e828de836d46ee0652c8872e4a2ffe0cc503d02e9a9', False),
}


def guarded_ways(roads):
    ways = {way['id']: way for way in roads['ways']}
    for ident, (expected, direction) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not direction or way.get('private') is not True:
            raise ValueError('Reviewed FLUX boundary direction/access changed: ' + ident)
        geometry = json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':'))
        if hashlib.sha256(geometry.encode()).hexdigest() != expected:
            raise ValueError('Reviewed FLUX boundary geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed FLUX boundary road is closed: ' + ident)
    return ways


def chain(ways, ident, start, end, role):
    way = ways[ident]
    a, b = way['nodes'].index(start), way['nodes'].index(end)
    step = 1 if b >= a else -1
    if way['oneway'] and step < 0:
        raise ValueError('FLUX boundary reference reversed a one-way road: ' + ident)
    return {'way': ident, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
            'oneway': way['oneway'], 'role': role}


def source_records(atlas):
    south = next(m for m in atlas['maps'] if m['id'] == 'south')
    if south.get('source') != SOURCE_URL or south.get('page') != 1 or south.get('historical') is not False:
        raise ValueError('FLUX source revision needs review')
    records = {}
    for code, glyph in SOURCE_GLYPHS.items():
        matches = [p for p in south['parkings'] if p['code'] == code]
        if len(matches) != 1 or len(matches[0].get('points', [])) != 1:
            raise ValueError('Reviewed FLUX/ALD source glyph count changed: ' + code)
        parking = matches[0]
        point = parking['points'][0]
        source = [point['x'] / 3, point['y'] / 3]
        centre = [(glyph[0] + glyph[2]) / 2, (glyph[1] + glyph[3]) / 2]
        if any(abs(a - b) > .02 for a, b in zip(source, centre)) or any(
                abs(parking[axis] - point[axis]) > .02 for axis in ['x', 'y']):
            raise ValueError('Reviewed FLUX/ALD source glyph identity changed: ' + code)
        records[code] = {'parking': parking, 'point': [round(p, 4) for p in source]}
    return records


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways, source = guarded_ways(roads), source_records(atlas)
    boundaries = [
        chain(ways, '241869964', '2494477622', '2494477658', 'northern cross-road beside the gas-site end'),
        chain(ways, '241869927', '2494477658', '2494477632', 'northeastern boundary; mapped one-way direction retained'),
        chain(ways, '746744824', '2494477632', '2494477605', 'eastern field boundary'),
        chain(ways, '241869944', '2494477605', ARRIVAL_NODE, 'southern cross-road and shared road approach'),
        chain(ways, '241869946', ARRIVAL_NODE, '2494477622', 'western distributor beside the separate quay strip'),
    ]
    for index, boundary in enumerate(boundaries):
        if boundary['nodes'][-1] != boundaries[(index + 1) % len(boundaries)]['nodes'][0]:
            raise ValueError('Reviewed FLUX boundary chains no longer close')
    road = ways[ARRIVAL_WAY]
    start = road['nodes'].index(ARRIVAL_SEGMENT[0])
    if road['nodes'][start:start + 2] != ARRIVAL_SEGMENT or ARRIVAL_NODE not in ways['241869944']['nodes']:
        raise ValueError('Reviewed FLUX boundary junction changed')
    point = road['points'][road['nodes'].index(ARRIVAL_NODE)]
    if point != [51.3037181, 3.2372862]:
        raise ValueError('Reviewed FLUX shared approach moved')
    imagery = {
        'service': OFW_URL, 'imageryLayer': 'OFW', 'reviewed': '2026-11-20',
        'method': 'Official OFW WMS aerial review of the quay, storage field, gas facility and retained surrounding roads; no Google imagery measurements.',
        'reviewImageRequest': {'service': 'WMS', 'version': '1.1.1', 'request': 'GetMap',
                               'layers': 'OFW', 'srs': 'EPSG:4326',
                               'bboxLonLat': [3.2335, 51.3027, 3.241, 51.3075],
                               'width': 1100, 'height': 1100, 'format': 'image/png'},
        'limitation': 'Imagery supports surrounding field/road topology. No capture date, operational gate, individual DR position or current driving permission is certified.',
    }
    basis = ('The current South plan has three separate callout leaders to edges of one FLUX compound beyond H1, '
             'with ALD separately named on its quay side. The retained quay, gas-site/storage-field and surrounding-road '
             'topology supports one shared road approach at the southwest boundary junction of roads241869946 and241869944. '
             'This is an area road approach, not a verified operational gate or an individual DR parking position.')
    access_note = 'Route ends at the FLUX area road approach; the exact compound gate and individual DR positions are not confirmed.'
    out = {}
    for code in CODES:
        record = source[code]
        leader = {**SOURCE_LEADERS[code], 'references': 'FLUX compound', 'geographicPosition': False,
                  'units': 'uncropped original PDF points',
                  'basis': 'External source callout to the common compound edge; not a parking-cell centre or a gate coordinate.'}
        out['south:' + code] = {
            'lat': point[0], 'lon': point[1], 'name': code + ' · area approach',
            'parking': code, 'areaName': 'FLUX area', 'region': REGION_ID,
            'method': 'source-topology-shared-area-road-approach', 'scope': 'parking-group-approach',
            'precision': 'area-approach-only', 'individualParkingVerified': False, 'lineExact': False,
            'historical': False, 'sourceMap': 'south', 'supportedMaps': ['south'],
            'sourcePage': 1, 'sourceUrl': SOURCE_URL, 'sourceRevision': 'V1.09-2026',
            'sourcePoint': record['point'], 'sourcePoints': [record['point']],
            'sourcePointUnits': 'uncropped original PDF points',
            'sourcePointAtlasPixels': [record['parking']['x'], record['parking']['y']],
            'sourceBounds': SOURCE_GLYPHS[code], 'sourceGlyphBounds': [SOURCE_GLYPHS[code]],
            'sourceBoundsUnits': 'uncropped original PDF points',
            'sourceBoundsBasis': 'Actual printed external callout glyph; not a geographic parking footprint.',
            'sourceLeader': leader, 'sourceAreaBounds': SOURCE_AREA_BOUNDS,
            'sourceAreaBoundsBasis': 'Drawing outline only; not a geographic polygon.',
            'roadWay': ARRIVAL_WAY, 'roadSegment': ARRIVAL_SEGMENT, 'arrivalNode': ARRIVAL_NODE,
            'basis': basis, 'areaAccessNote': access_note,
            'junctionMatch': {'arrivalNode': ARRIVAL_NODE, 'entrySegment': ARRIVAL_SEGMENT,
                              'adjoiningLane': boundaries[3], 'boundaryLanes': boundaries},
            'mappedArea': {'areaName': 'FLUX area', 'boundaryReferences': boundaries,
                           'individualParkingVerified': False,
                           'boundaryLimitation': 'Road boundaries identify the common field. Individual DR partitions, the ALD strip and the operational gate are not geographically positioned.'},
            'imageryEvidence': imagery,
            'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area approach',
                              'method': 'shared-area-road-approach', 'scope': 'area-approach-label',
                              'precision': 'area-approach-only', 'individualParkingVerified': False,
                              'basis': 'Display at the SAME real boundary-road approach; no separate interior DR positions are inferred.'},
        }
    return {
        'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
        'source': 'Current ICO South source callout leaders and official OFW field/road topology',
        'sourceUrls': [SOURCE_URL, OFW_URL],
        'regions': [{'id': REGION_ID, 'sourceMap': 'south', 'sourcePage': 1,
                     'sourceUrl': SOURCE_URL, 'sourceRevision': 'V1.09-2026', 'codes': CODES,
                     'areaName': 'FLUX area', 'sourceAreaBounds': SOURCE_AREA_BOUNDS,
                     'sourceLeaders': SOURCE_LEADERS, 'boundaryLanes': boundaries,
                     'arrivalNode': ARRIVAL_NODE, 'arrivalLatLon': point, 'basis': basis,
                     'precision': 'area-approach-only', 'individualParkingVerified': False,
                     'areaAccessNote': access_note, 'imageryEvidence': imagery}],
        'roadGuards': {ident: {'orderedGeometrySHA256': fingerprint, 'oneway': direction, 'private': True}
                       for ident, (fingerprint, direction) in ROAD_GUARDS.items()},
        'unresolved': [{'key': 'south:DRALD', 'sourceMap': 'south', 'code': 'DRALD',
                        'sourcePage': 1, 'sourceUrl': SOURCE_URL, 'sourceRevision': 'V1.09-2026',
                        'sourcePoint': source['DRALD']['point'], 'sourceGlyphBounds': [SOURCE_GLYPHS['DRALD']],
                        'sourcePointUnits': 'uncropped original PDF points',
                        'reason': 'ALD is separately named on the current source. Its exact geographic strip and road approach have not been independently established; it must not share a fabricated FLUX interior position.'}],
        'limitation': access_note + ' ALD remains source-only pending an independently matched approach.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit candidate JSON without writing an artifact.')
    parser.add_argument('--output', type=Path, default=ROOT / 'scripts/geo/flux-area-destinations.json')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('3 FLUX source callouts: one shared boundary-road approach; exact gate/individual positions unconfirmed; ALD unresolved.')
