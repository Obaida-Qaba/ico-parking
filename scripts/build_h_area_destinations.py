"""One positively matched H AREA; never ten interpolated AH/BH positions.

The earlier G match incorrectly used the CURVED OUTER perimeter as the straight
source G/H divider. The independent CF1/VPC control exposes that one-field
shift: CF1's southern edge and AF/BF's southern edge share a drawn cross-road.
The actual VPC forecourt 931027303 ends beside 241873282, not 241873292. The
corrected order is H outer392->290, G290->292, F292->282, E282->278, D278->C3.
It also accounts for the previously unused whole field immediately above C3.

The whole H field has its own outer bend, quay cap, southern divider and staff
side junction. The OFW 2026-03-05 image confirms real vehicle storage EAST of
392480112 inside this field; the grass outside that road is not used. All GPS
labels remain at junction1819. No numbered H strip, precise line or current
access permission is established. Older four H references have separately
reviewed whole-field provenance and their own explicit source records.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
CURRENT_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
LEGACY_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
PORT_BERTH_URL = 'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/58'
ARRIVAL = '2494511819'
CURRENT_CODES = [f'AH{n}' for n in range(1, 7)] + [f'BH{n}' for n in range(1, 5)]
LEGACY_POINTS = {'AH1': [164.6667, 174], 'AH2': [134.6667, 174],
                 'BH1': [164.6667, 222.6667], 'BH2': [133.3333, 222.6667]}
ROAD_GUARDS = {
    '392480112': 'a9666be5cb68932453cf347ff025f755d8dad3c4848a9857eb1b6a1cc7208b2d',
    '241873290': 'eaa41b208831352ae314b964bcde3a511a20934f7f3c6268aa8307e43fef057a',
    '241873267': 'bfbadabcb9b853ede9acf2c473420e5c9012ea12b3ed0524a0615b25ff035a37',
    '931027303': 'e259f16fa4337012e68fde71036a146afec73fdbaf406387c253ef2f743b1d2a',
    '241873282': 'ad03e0c74b62270045e37a9ce59c43ebe5bfdf8c0c5e8fb1a32c42b271acf1b9',
}
# Actual page1 glyph rectangles, not the grey fill or geographic coordinates.
SOURCE_GLYPHS = {
    'BH1': [951.3867, 164.5316, 958.8207, 175.6196],
    'BH2': [961.0527, 164.6096, 968.4868, 175.6976],
    'BH3': [971.6943, 164.4232, 979.1283, 175.5112],
    'BH4': [982.2003, 164.4172, 989.6343, 175.5052],
    'AH1': [993.2283, 164.5132, 1000.6623, 175.9132],
    'AH2': [1003.7283, 164.2012, 1011.1623, 175.6012],
    'AH3': [1014.7623, 163.8892, 1022.1963, 175.2892],
    'AH4': [1026.3123, 164.0212, 1033.7462, 175.4212],
    'AH5': [1037.2142, 164.5432, 1044.6482, 175.9432],
    'AH6': [1048.0623, 164.2852, 1055.4962, 175.6852],
}
# Separately extracted fill outlines have a sloped outer edge and straight
# bottom. They evidence a WHOLE H field above G, not exact geographic strips.
SOURCE_OUTLINES = [
    [950.56, 141.75, 958.56, 198.46], [960.65, 142.35, 968.65, 198.46],
    [971.12, 142.95, 979.12, 198.46], [981.58, 143.55, 989.58, 198.46],
    [992.49, 144.15, 1000.49, 198.46], [1003.11, 144.75, 1011.11, 198.46],
    [1014.14, 145.35, 1022.14, 198.46], [1025.47, 145.96, 1033.47, 198.47],
    [1036.59, 146.56, 1044.59, 198.47], [1047.24, 147.16, 1055.24, 198.47],
]
CONTROLS = {
    'cf1VpcAnchor': {
        'forecourtWay': '931027303', 'sourceSouthY': [264.9, 265.1],
        'neighbouringJunctions': ['2494511860', '2494511857'],
        'sourceCF1Bounds': [855.2, 242.1, 930.3, 264.9],
        'sourceAFBFBounds': [938.6, 237.1, 1048.0, 265.1],
        'proof': 'CF1 and AF/BF share the same southern source cross-road beside the named VPC. The actual VPC northern forecourt 931027303 meets Koffieweg at node2494511860, within5m of road241873282 at node2494511857. Substituting road241873292 as the AF/BF south edge shifted every upper field by one.',
        'independence': 'This control starts from the VPC building/forecourt and source cross-road continuity; it does not use the published AG/BG GPS footprint as ground truth.',
    },
    'correctedUpperRows': [
        {'row': 'H', 'north': '392480112', 'south': '241873290'},
        {'row': 'G', 'north': '241873290', 'south': '241873292'},
        {'row': 'F', 'north': '241873292', 'south': '241873282'},
        {'row': 'E', 'north': '241873282', 'south': '241873278'},
        {'row': 'D', 'north': '241873278', 'south': '746582112/746641410'},
    ],
    'wholeFieldOutline': 'Curved/sloped source BDR outer edge, BWH quay cap, straight source G/H divider and staff/rail-side access distinguish the whole H field. The outer road is392480112, the straight southern divider is241873290, and the staff-side spine is241873267.',
    'berth504': {
        'dataset': PORT_BERTH_URL, 'queried': '2026-11-19',
        'where': "h_lpl.LPL='504' AND h_lpl.TERMINAL='5210'",
        'reportedTerminal': '5210', 'reportedBerth': '504',
        'polygonLonLat': [[3.21632009946, 51.312399301], [3.213614168632, 51.311803125312],
                          [3.213376339496, 51.312227090617], [3.216082294821, 51.312823270755],
                          [3.21632009946, 51.312399301]],
        'role': 'Independent named jetty/quay control beside source G/F below the H cap. The berth polygon is not a parking polygon or driving permission.',
    },
}


def guarded_ways(roads):
    ways = {w['id']: w for w in roads['ways']}
    for ident, expected in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not False or way.get('private') is not True:
            raise ValueError('Reviewed H field/control access or direction changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected:
            raise ValueError('Reviewed H field/control geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed H field/control road closed: ' + ident)
    return ways


def chain(ways, wayid, start, end, role):
    way = ways[wayid]
    a, b = way['nodes'].index(start), way['nodes'].index(end)
    step = 1 if b >= a else -1
    return {'way': wayid, 'nodes': [way['nodes'][i] for i in range(a, b + step, step)],
            'oneway': False, 'role': role}


def flight_evidence(point):
    lat, lon = point
    return {'service': OFW_URL, 'imageryLayer': 'OFW', 'queryLayer': 'OFW_vdc',
            'dataset': 'Orthofotowerkbestand 2026.01', 'flightDate': '2026-03-05',
            'reportedFlightDate': '5/3/2026', 'featureId': '4', 'reviewed': '2026-11-19',
            'method': 'Official OFW_vdc GetFeatureInfo OpnDatum, independently queried at this entrance on 2026-11-19.',
            'query': {'version': '1.3.0', 'CRS': 'EPSG:4326',
                      'bboxLatLon': [lat - .0001, lon - .0001, lat + .0001, lon + .0001],
                      'width': 500, 'height': 500, 'i': 250, 'j': 250,
                      'infoFormat': 'application/geo+json'},
            'reviewImageRequest': {'version': '1.3.0', 'CRS': 'EPSG:4326',
                                   'bboxLatLon': [51.3073, 3.2117, 51.3112, 3.216],
                                   'width': 1000, 'height': 1450},
            'limitation': 'Supports the whole parking field and access junction. Individual AH/BH strip positions and live access permissions remain unverified.'}


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    maps = {m['id']: {p['code']: p for p in m['parkings']} for m in atlas['maps']}
    legacy = json.loads((ROOT / 'scripts/bastenaken-source-points.json').read_text(encoding='utf-8'))
    corners = [ARRIVAL, '2494511887', '2494511892', '2494511830']
    boundaries = [chain(ways, '392480112', ARRIVAL, '2494511887', 'curved OUTER H/BDR field boundary'),
                  chain(ways, '392480112', '2494511887', '2494511892', 'H/BWH quay cap'),
                  chain(ways, '241873290', '2494511830', '2494511892', 'straight H/G divider'),
                  chain(ways, '241873267', ARRIVAL, '2494511830', 'staff and rail-side access spine')]
    segment = ['12487520988', ARRIVAL]
    road = ways['241873267']
    index = road['nodes'].index(segment[0])
    if road['nodes'][index:index + 2] != segment:
        raise ValueError('Reviewed H entry segment changed')
    point = road['points'][road['nodes'].index(ARRIVAL)]
    cf1 = maps['south']['CF1']
    if abs(cf1['points'][0]['x'] / 3 - 891.1267) > .02 or abs(cf1['points'][0]['y'] / 3 - 253.0967) > .02:
        raise ValueError('Independent CF1 source control changed')
    out, regions = {}, []
    for mapid, codes, bounds, source_url, page in [
        ('south', CURRENT_CODES, [946, 138, 1059, 201], CURRENT_URL, 1),
        ('bastenaken', list(LEGACY_POINTS), [120, 150, 181, 247], LEGACY_URL, 23),
    ]:
        historical = mapid == 'bastenaken'
        region_id = mapid + '-h-shared-field-entrance'
        basis = ('The curved BDR/BDA outer perimeter, BWH quay cap, staff/rail-side approach and straight G/H divider identify the whole H field. '
                 'The independent CF1/VPC cross-road control corrects the earlier one-field-shifted G assignment. '
                 'Vehicle storage is inside the outer road392480112, not in the grass outside it. '
                 'Shared AH/BH area entrance only; individual numbered AH/BH strips, exact lines and current access permission are not established.')
        if historical:
            basis += ' Historical page23 was separately reviewed: its four H compartments retain the same whole-field controls, although their individual partitions differ from the current ten strips.'
        for code in codes:
            parking = maps[mapid][code]
            source = [[round(p['x'] / 3 + (45 if historical else 0), 4),
                       round(p['y'] / 3 + (90 if historical else 0), 4)] for p in parking['points']]
            x0, y0, x1, y1 = bounds
            if not all(x0 < x < x1 and y0 < y < y1 for x, y in source):
                raise ValueError('Source reference left reviewed H whole field: ' + mapid + ':' + code)
            if historical:
                expected = LEGACY_POINTS[code]
                if len(source) != 1 or any(abs(source[0][i] - expected[i]) > .00011 for i in [0, 1]) or legacy['points'][code] != [expected]:
                    raise ValueError('Reviewed historical H source control changed: ' + code)
            else:
                glyph = SOURCE_GLYPHS[code]
                centre = [(glyph[0] + glyph[2]) / 2, (glyph[1] + glyph[3]) / 2]
                if len(source) != 1 or any(abs(source[0][i] - centre[i]) > .02 for i in [0, 1]):
                    raise ValueError('Reviewed current H source glyph changed: ' + code)
                if not (x0 <= glyph[0] <= glyph[2] <= x1 and y0 <= glyph[1] <= glyph[3] <= y1):
                    raise ValueError('Full current H glyph left reviewed source bounds: ' + code)
            pin = {
                'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                'parking': code, 'areaName': 'AH/BH parking area', 'region': region_id,
                'method': 'source-topology-shared-area-entrance', 'scope': 'parking-group-approach',
                'precision': 'area-entry-only', 'individualParkingVerified': False,
                'lineExact': False, 'historical': historical, 'supportedMaps': [mapid],
                'sourceMap': mapid, 'sourcePage': page, 'sourceUrl': source_url,
                'sourceRevision': 'Cewez historical page23' if historical else 'V1.09-2026',
                'sourcePoint': source[0], 'sourcePoints': source,
                'sourcePointUnits': 'uncropped original PDF points',
                'sourcePointAtlasPixels': [parking['x'], parking['y']],
                'sourceBounds': bounds, 'sourceBoundsUnits': 'uncropped original PDF points',
                'sourceBoundsBasis': 'Visually reviewed whole H field outline and full code extents in this source; source drawing coordinates are not a geographic polygon.',
                'roadWay': '241873267', 'roadSegment': segment, 'arrivalNode': ARRIVAL,
                'basis': basis,
                'junctionMatch': {'cornerNodes': corners, 'arrivalNode': ARRIVAL, 'entrySegment': segment,
                                  'boundaryLanes': boundaries},
                'mappedArea': {'areaName': 'AH/BH parking area', 'boundaryReferences': boundaries,
                               'individualParkingVerified': False,
                               'boundaryLimitation': 'Only the whole H field and its shared entry are established. No individual current or historical AH/BH compartment is geographically positioned.'},
                'independentControl': CONTROLS['cf1VpcAnchor'], 'flightEvidence': flight_evidence(point),
                'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                                  'method': 'confirmed-shared-area-entrance', 'scope': 'area-entrance-label',
                                  'precision': 'area-entry-only', 'individualParkingVerified': False,
                                  'basis': 'Display at the SAME confirmed H area junction; no inferred numbered H strip position.'},
            }
            if not historical:
                pin['sourceGlyphBounds'] = [SOURCE_GLYPHS[code]]
            else:
                pin['historicalAssociation'] = 'Independent full-page23 review retained BG1/AG1 below, BWH/K504 cap, BDA outer edge and staff/truck/rail-side access. Four old partitions are not equated with ten current partitions.'
            out[mapid + ':' + code] = pin
        regions.append({'id': region_id, 'sourceMap': mapid, 'sourcePage': page,
                        'sourceUrl': source_url, 'sourceBounds': bounds,
                        'sourceBoundsUnits': 'uncropped original PDF points', 'codes': codes,
                        'areaName': 'AH/BH parking area', 'arrivalNode': ARRIVAL, 'arrivalLatLon': point,
                        'cornerNodes': corners, 'boundaryLanes': boundaries,
                        'precision': 'area-entry-only', 'individualParkingVerified': False,
                        'basis': basis, 'flightEvidence': flight_evidence(point)})
    expected = {'south:' + c for c in CURRENT_CODES} | {'bastenaken:' + c for c in LEGACY_POINTS}
    if set(out) != expected:
        raise ValueError('H field builder must export exactly14 explicitly source-matched references')
    return {'version': 1, 'reviewed': '2026-11-19', 'destinations': out, 'regions': regions,
            'sourceUrls': [CURRENT_URL, LEGACY_URL, OFW_URL, PORT_BERTH_URL],
            'independentControls': CONTROLS, 'currentGreySourceOutlines': SOURCE_OUTLINES,
            'roadGuards': {ident: {'orderedGeometrySHA256': value, 'oneway': False, 'private': True} for ident, value in ROAD_GUARDS.items()},
            'coverage': '14 current/historical source references share ONE confirmed whole H area entrance; no individual AH/BH positions or lines claimed.',
            'unresolved': []}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit JSON without writing an output file.')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/h-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
        print('14 source references; ONE confirmed AH/BH area entrance; individual strips remain unverified')
