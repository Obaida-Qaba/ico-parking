"""Five confirmed D FIELD entrances; no inferred D1/D2/D3/D4 positions.

ZOUT/MBZ identify the E1 southern distributor 746582074. The independently
matched C3 upper roads identify the opposite boundary. Actual column spines
close five whole fields: joint G/H, I, J, K and L. The 2026-03-05 official OFW
image supports those outer fields and their real junctions. FOUR source D
strips versus THREE physical bands remains unresolved; it is not necessary
to identify any individual D strip to route to its confirmed whole-field entry.

Historical page23 retains the E1/D/C3 order and same outer column controls.
Its internal G/H divider is not transferred to current geometry: both remain
one larger reviewed area. Every GPS point AND display label stays at a real
field-boundary junction. No exact row, line, gate, survey or access permission
is asserted. This isolated builder cannot overwrite any E or C3 arrival.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
CURRENT_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
LEGACY_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'

# Ordered geometry, node identity, access and direction all require review if
# changed. The longer side spines are intentionally guarded in their entirety.
ROAD_GUARDS = {
    '746582074': ('f798d853555e5dea33cb469ce5bdd419b420cdc1d12caa7275f8a5889e319a2e', False),
    '1228590688': ('92900d53f763b1a054347e7361fe5a8a38227590819fe121851670656c749c50', True),
    '746582137': ('efaf27d35070a8a2defbbee3cd9ef5a73fa72ceebc3f5203f717cad16971782c', True),
    '746582127': ('c4c164b655376864418a3e705331e95b55729326f6b52034c59c852bc1366e92', False),
    '241873299': ('6295dfca68b7c381a384267199e5f0d1f10989e498e8189c00aab5b6fb93a8c6', False),
    '746582086': ('537901047de69d2eab71c4bf6663af1d9e697699ede6871d63f8af9f1988d8e9', False),
    '746582091': ('79d82e2d22dd4cd63c59bb6f2a9bf1552a8056ffb4158ef8e36e3fb634eb53a7', False),
    '746582088': ('b26539d50b2615c69e73aca4efc291bf12ca009257f2b3064954820d5bceb6ce', False),
    '746582075': ('ecb5b3cc89b0027b20c623e2adbb192b55630b78f3ccb33657195539bee9644e', False),
}

# Direct PyMuPDF text bounds from source page1, visually checked against the
# rendered grey fields. Includes full glyph height, not only the indexed centre.
# Each tuple is x0,x1 plus D4,D3,D2,D1 y0; height is the extracted 6.195 PDFpt.
GLYPH_COLUMNS = {
    'G': (678.8882, 689.5632, [298.2017, 305.2717, 312.3517, 319.4317]),
    'H': (632.3032, 643.0132, [298.2868, 305.3568, 312.4368, 319.5168]),
    'I': (581.9331, 590.6231, [298.3122, 305.3821, 312.4622, 319.5422]),
    'J': (529.9419, 539.2619, [298.3825, 305.4525, 312.5325, 319.6125]),
    'K': (477.8442, 488.1792, [298.3981, 305.4681, 312.5481, 319.6281]),
    'L': (426.4077, 436.2277, [298.3796, 305.4495, 312.5295, 319.6096]),
}
SOURCE_GLYPHS = {}
for letter, (x0, x1, ys) in GLYPH_COLUMNS.items():
    for number, y0 in zip('4321', ys):
        a, b = (417.5877, 427.4077) if letter == 'L' and number == '1' else (x0, x1)
        SOURCE_GLYPHS[letter + 'D' + number] = [a, y0, b, round(y0 + 6.195, 4)]

GROUPS = [
    dict(id='gh', letters='GH', areaName='G/H D parking field',
         corners=['2494511748', '2494511766', '6986702618', '6986702620'],
         ways=['746582074', '241873299', '1228590688', '746582127'],
         segment=['2494511754', '2494511748'],
         southBounds=[611.2, 297.1, 719.4, 327.7], legacyBounds=[315, 455, 360, 550]),
    dict(id='i', letters='I', areaName='I D parking field',
         corners=['6986702455', '2494511748', '6986702620', '6986702621'],
         ways=['746582074', '746582127', '1228590688', '746582086'],
         segment=['2494511748', '6986702455'],
         southBounds=[560.0, 297.1, 611.2, 327.7], legacyBounds=[315, 555, 360, 605]),
    dict(id='j', letters='J', areaName='J D parking field',
         corners=['6986702471', '6986702455', '6986702621', '6986702622'],
         ways=['746582074', '746582086', '746582137', '746582091'],
         segment=['6986702455', '6986702471'],
         southBounds=[508.0, 297.1, 560.0, 327.7], legacyBounds=[315, 606, 360, 652]),
    dict(id='k', letters='K', areaName='K D parking field',
         corners=['6986702462', '6986702471', '6986702622', '6986702623'],
         ways=['746582074', '746582091', '746582137', '746582088'],
         segment=['6986702471', '6986702462'],
         southBounds=[456.4, 297.1, 508.0, 327.7], legacyBounds=[315, 653, 360, 700]),
    dict(id='l', letters='L', areaName='L D parking field',
         corners=['6986702386', '6986702462', '6986702623', '6986702617'],
         ways=['746582074', '746582088', '746582137', '746582075'],
         segment=['6986702462', '6986702386'],
         southBounds=[404.5, 297.1, 456.4, 327.7], legacyBounds=[315, 701, 360, 750]),
]


def guarded_ways(roads):
    ways = {w['id']: w for w in roads['ways']}
    for ident, (expected, oneway) in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not oneway or way.get('private') is not True:
            raise ValueError('Reviewed D field direction/access changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected:
            raise ValueError('Reviewed D field geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed D field boundary closed: ' + ident)
    return ways


def chain(ways, ident, start, end, role):
    road = ways[ident]
    a, b = road['nodes'].index(start), road['nodes'].index(end)
    step = 1 if b >= a else -1
    nodes = [road['nodes'][i] for i in range(a, b + step, step)]
    return {'way': ident, 'nodes': nodes, 'oneway': road['oneway'], 'role': role}


def flight_evidence(point):
    lat, lon = point
    return {'service': OFW_URL, 'imageryLayer': 'OFW', 'queryLayer': 'OFW_vdc',
            'dataset': 'Orthofotowerkbestand 2026.01', 'flightDate': '2026-03-05',
            'reportedFlightDate': '5/3/2026', 'featureId': '4', 'reviewed': '2026-11-19',
            'query': {'version': '1.3.0', 'CRS': 'EPSG:4326',
                      'bboxLatLon': [lat - .0001, lon - .0001, lat + .0001, lon + .0001],
                      'width': 500, 'height': 500, 'i': 250, 'j': 250,
                      'infoFormat': 'application/geo+json'},
            'method': 'Official OFW_vdc GetFeatureInfo OpnDatum, independently queried at each of the five entrances on 2026-11-19.',
            'reviewImageRequest': {'version': '1.3.0', 'CRS': 'EPSG:4326',
                                   'bboxLatLon': [51.2958, 3.2227, 51.3047, 3.231], 'width': 1200, 'height': 2000},
            'limitation': 'Whole fields and boundary-road junctions only. Individual revised D strips and current access permission are not established.'}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    legacy = json.loads((ROOT / 'scripts/bastenaken-source-points.json').read_text(encoding='utf-8'))
    maps = {m['id']: {p['code']: p for p in m['parkings']} for m in atlas['maps']}
    out, regions = {}, []
    for group in GROUPS:
        nw, ne, se, sw = group['corners']
        north, east, south, west = group['ways']
        boundaries = [chain(ways, north, nw, ne, 'confirmed E1/D outer boundary'),
                      chain(ways, east, ne, se, 'confirmed eastern column spine'),
                      chain(ways, south, sw, se, 'confirmed D/C3 outer boundary'),
                      chain(ways, west, nw, sw, 'confirmed western column spine')]
        road = ways[north]
        start = road['nodes'].index(group['segment'][0])
        if road['nodes'][start:start + 2] != group['segment'] or nw not in group['segment']:
            raise ValueError('Reviewed D field entry segment changed: ' + group['id'])
        point = road['points'][road['nodes'].index(nw)]
        association = ('The ' + group['areaName'] + ' lies between the source E1 band above and C3 band below, '
                       'closed by its separately matched column spines. ZOUT/MBZ and the existing E1/C3 road controls '
                       'identify the outer field independently of schematic spacing. The real northwest boundary junction '
                       'is its shared approach. FOUR printed D strips versus THREE physical road bands remains unresolved. '
                       'Only this whole-field entrance is positioned; no individual D row, line or current access permission is established.')
        if group['id'] == 'gh':
            association += ' G and H are deliberately one larger field group; no internal historical divider is promoted to a current G/H boundary.'
        limitation = ('The confirmed outer field supports an area arrival, not four individually matched D partitions. '
                      'The internal roads 1228590689/746582139 and 746582138 are not used to invent a fourth row. '
                      'Existing E1 and C3 approaches remain separate and unchanged.')
        for mapid in ['south', 'bastenaken']:
            historical = mapid == 'bastenaken'
            bounds = group['legacyBounds'] if historical else group['southBounds']
            region_id = mapid + '-d-' + group['id'] + '-shared-field-entrance'
            source_url = LEGACY_URL if historical else CURRENT_URL
            page = 23 if historical else 1
            for letter in group['letters']:
                for number in '1234':
                    code = letter + 'D' + number
                    parking = maps[mapid][code]
                    source = [[round(p['x'] / 3 + (45 if historical else 0), 4),
                               round(p['y'] / 3 + (90 if historical else 0), 4)] for p in parking['points']]
                    x0, y0, x1, y1 = bounds
                    if not all(x0 < x < x1 and y0 < y < y1 for x, y in source):
                        raise ValueError('Source reference left reviewed D field: ' + mapid + ':' + code)
                    if historical:
                        if len(source) != len(legacy['points'][code]) or any(abs(v - legacy['points'][code][i][j]) > .00011 for i, p in enumerate(source) for j, v in enumerate(p)):
                            raise ValueError('Historical D source control changed: ' + code)
                    else:
                        glyph = SOURCE_GLYPHS[code]
                        centre = [(glyph[0] + glyph[2]) / 2, (glyph[1] + glyph[3]) / 2]
                        if len(source) != 1 or any(abs(source[0][i] - centre[i]) > .02 for i in [0, 1]):
                            raise ValueError('Current D source glyph changed: ' + code)
                        if not (x0 <= glyph[0] <= glyph[2] <= x1 and y0 <= glyph[1] <= glyph[3] <= y1):
                            raise ValueError('Full current D glyph left reviewed bounds: ' + code)
                    record = {
                        'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                        'parking': code, 'areaName': group['areaName'], 'region': region_id,
                        'method': 'source-topology-shared-area-entrance', 'scope': 'parking-group-approach',
                        'precision': 'area-entry-only', 'individualParkingVerified': False,
                        'lineExact': False, 'historical': historical,
                        'sourceMap': mapid, 'sourcePage': page, 'sourceUrl': source_url,
                        'sourceRevision': 'Cewez historical page23' if historical else 'V1.09-2026',
                        'sourcePoint': source[0], 'sourcePoints': source,
                        'sourcePointUnits': 'uncropped original PDF points',
                        'sourcePointAtlasPixels': [parking['x'], parking['y']],
                        'sourceBounds': bounds, 'sourceBoundsUnits': 'uncropped original PDF points',
                        'sourceBoundsBasis': 'Visually reviewed whole D field and complete code glyph extents; source drawing bounds are not a georeferenced parking polygon.',
                        'roadWay': north, 'roadSegment': group['segment'], 'arrivalNode': nw,
                        'basis': association,
                        'junctionMatch': {'cornerNodes': group['corners'], 'arrivalNode': nw,
                                          'entrySegment': group['segment'], 'boundaryLanes': boundaries},
                        'mappedArea': {'areaName': group['areaName'], 'boundaryReferences': boundaries,
                                       'boundaryLimitation': limitation, 'individualParkingVerified': False},
                        'flightEvidence': flight_evidence(point),
                        'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                                          'method': 'confirmed-shared-area-entrance', 'scope': 'area-entrance-label',
                                          'precision': 'area-entry-only', 'individualParkingVerified': False,
                                          'basis': 'Display at the SAME confirmed whole-field entrance, not an inferred location of this D row.'},
                    }
                    if not historical:
                        record['sourceGlyphBounds'] = [SOURCE_GLYPHS[code]]
                    else:
                        record['historicalAssociation'] = 'Same outer E1/D/C3 band and ordered column spines; individual old D partitions are not claimed to survive. Shared whole-field entrance only.'
                    out[mapid + ':' + code] = record
            regions.append({'id': region_id, 'sourceMap': mapid, 'sourcePage': page, 'sourceUrl': source_url,
                            'sourceBounds': bounds, 'sourceBoundsUnits': 'uncropped original PDF points',
                            'codes': [letter + 'D' + n for letter in group['letters'] for n in '1234'],
                            'areaName': group['areaName'], 'arrivalNode': nw, 'arrivalLatLon': point,
                            'cornerNodes': group['corners'], 'boundaryLanes': boundaries,
                            'precision': 'area-entry-only', 'individualParkingVerified': False,
                            'basis': association, 'boundaryLimitation': limitation,
                            'flightEvidence': flight_evidence(point)})
    expected = {mapid + ':' + letter + 'D' + n for mapid in ['south', 'bastenaken'] for letter in 'GHIJKL' for n in '1234'}
    if set(out) != expected:
        raise ValueError('D field builder must export exactly 48 reviewed source references')
    return {'version': 1, 'reviewed': '2026-11-19', 'destinations': out, 'regions': regions,
            'sourceUrls': [CURRENT_URL, LEGACY_URL, OFW_URL],
            'coverage': '48 source references share FIVE confirmed whole-field entrances. Individual D1..4 geography remains unverified.',
            'controls': [
                {'name': 'ZOUT warehouse', 'osmWay': '1349890062', 'sourceBounds': [616.13, 275.81, 631.69, 294.49],
                 'geoCentre': [51.30135505, 3.22475433], 'role': 'Pins the E1/D northern boundary 746582074 independently.'},
                {'name': 'MBZ warehouse', 'osmWay': '1349890098', 'sourceBounds': [616.22, 254.37, 628.92, 267.56],
                 'geoCentre': [51.30117167, 3.22399553], 'role': 'Independent nearby forecourt control and column order.'},
                {'name': 'Existing independently matched C3 northern boundaries', 'ways': ['1228590688', '746582137'],
                 'role': 'Pins whole D field southern extent without moving any C3 arrival.'}],
            'roadGuards': {ident: {'orderedGeometrySHA256': values[0], 'oneway': values[1], 'private': True} for ident, values in ROAD_GUARDS.items()},
            'unresolved': [],
            'individualPartitionEvidenceGap': {'individualDPartitions': True, 'printedStrips': 4, 'physicalBands': 3,
                                               'neededEvidence': 'Named current site controls or a georeferenced plan locating each revised D subdivision. No such individual location is inferred by this builder.'}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit JSON without writing an output file.')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/d-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
        print('48 source references; FIVE confirmed D field entrances; individual D rows remain unverified')
