"""Rebuild reviewed North approaches and retain explicit North/Nissan gaps.

The old OSM109 alignment runs through stored cars. Its replacement is the
independently digitized quay aisle in north-road-corrections.json. P has a
four-sided source/road-cell match. Q2 receives an access-side group approach;
the older Loods C / Q9 / Q10 partitions do not justify a surveyed block centre.
No unresolved code gets a terminal-centre, gate or fence-side fallback.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
ROADS = json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
PUBLISHED = json.loads((ROOT / 'public/destinations.json').read_text(encoding='utf-8'))
RULES = json.loads((ROOT / 'scripts/north-road-corrections.json').read_text(encoding='utf-8'))
MAPS = {m['id']: m for m in DATA['maps']}
WAYS = {w['id']: w for w in ROADS['ways']}
NODES = {n: p for w in ROADS['ways'] for n, p in zip(w['nodes'], w['points'])}


def chain(way_id, nodes, oneway=False):
    w = WAYS.get(way_id)
    if w is None or w['oneway'] != oneway or w.get('private') is not True:
        raise ValueError('Reviewed North private road is unavailable or changed: ' + way_id)
    candidates = [w['nodes'][i:i + len(nodes)] for i in range(len(w['nodes']) - len(nodes) + 1)]
    if nodes not in candidates and (oneway or nodes[::-1] not in candidates):
        raise ValueError('Reviewed North road-junction chain changed: ' + way_id)
    excluded = {tuple(sorted(pair)) for pair in w.get('excludedSegments', [])}
    if any(n in w.get('blocked', []) for n in nodes) or any(
            tuple(sorted(pair)) in excluded for pair in zip(nodes, nodes[1:])):
        raise ValueError('Reviewed North approach uses a closed road: ' + way_id)
    return {'way': way_id, 'nodes': nodes, 'oneway': oneway, 'private': True}


# Full source-way and coordinate guards are intentional: the image/road match
# must be reviewed if an existing junction, direction or digitized point moves.
for guard in RULES['guards']:
    w = WAYS.get(guard['way'])
    if w is None or w['nodes'] != guard['expectedNodes'] or w['oneway'] != guard['expectedOneway'] or w.get('private') != guard['expectedPrivate']:
        raise ValueError('North source-road guard changed: ' + guard['way'])
for node, expected in RULES['anchorCoordinates'].items():
    if node not in NODES or any(abs(a - b) > 1e-10 for a, b in zip(NODES[node], expected)):
        raise ValueError('North imagery anchor moved: ' + node)
for addition in RULES['additions']:
    w = WAYS.get(addition['id'])
    if w is None or w['nodes'] != addition['nodes'] or w['points'] != addition['points']:
        raise ValueError('Apply the reviewed North road correction before rebuilding destinations: ' + addition['id'])
    chain(addition['id'], addition['nodes'], addition['oneway'])
for rule in RULES['segmentExclusions']:
    w = WAYS.get(rule['way'])
    if w is None or w['nodes'] != rule['expectedNodes'] or w['oneway'] != rule['expectedOneway']:
        raise ValueError('Obsolete North road guard changed: ' + rule['way'])
    actual = {tuple(sorted(pair)) for pair in w.get('excludedSegments', [])}
    if any(tuple(sorted(pair)) not in actual for pair in rule['excludedSegments']):
        raise ValueError('Stored-car crossings must be excluded before emitting North approaches: ' + rule['way'])


def source_points(map_id, code):
    parking = next(p for p in MAPS[map_id]['parkings'] if p['code'] == code)
    points = parking['points']
    if map_id == 'north':
        # Undo atlas -90-degree rotation and 3x crop scaling.
        return [[round(p['y'] / 3 + 30, 4), round((MAPS[map_id]['width'] - p['x']) / 3 + 30, 4)] for p in points]
    return [[round(p['x'] / 3 + 30, 4), round(p['y'] / 3 + 200, 4)] for p in points]


def midpoint(nodes):
    if len(nodes) != 2:
        raise ValueError('Approach must lie on one actual adjacent edge.')
    return [sum(NODES[n][axis] for n in nodes) / 2 for axis in (0, 1)]


def polygon_centroid(nodes):
    polygon = [NODES[n] for n in nodes]
    origin = polygon[0]
    points = [[(p[1] - origin[1]) * 69800, (p[0] - origin[0]) * 111320] for p in polygon]
    area = x_sum = y_sum = 0.0
    for a, b in zip(points, points[1:]):
        cross = a[0] * b[1] - b[0] * a[1]
        area += cross
        x_sum += (a[0] + b[0]) * cross
        y_sum += (a[1] + b[1]) * cross
    if abs(area) < 100 or not all(math.isfinite(v) for v in (area, x_sum, y_sum)):
        raise ValueError('The reviewed P road-cell polygon is degenerate.')
    return [origin[0] + y_sum / (3 * area) / 111320,
            origin[1] + x_sum / (3 * area) / 69800], polygon


NORTH = chain('241878125', ['2494558978', '2494558983', '2984583056', '2984583057'])
WEST = chain('241878076', ['2494558944', '2494558973', '2494558978'])
DIVIDER = chain('241878113', ['2494558944', '2494558948'])
EXTENSION = chain('portway-nit-q2-divider-link', ['2494558948', 'portway-nit-quay-divider'])
P_ACCESS = chain('portway-nit-quay-west-aisle', ['2984583057', 'portway-nit-quay-divider'])
Q_ACCESS = chain('portway-nit-quay-west-aisle', ['portway-nit-quay-divider', 'portway-nit-quay-south'])
P_NODES = ['2494558978', '2494558983', '2984583056', '2984583057',
           'portway-nit-quay-divider', '2494558948', '2494558944', '2494558973', '2494558978']
P_LABEL, P_POLYGON = polygon_centroid(P_NODES)

SOURCE_URL = 'https://www.icoterminals.com/upload/ico_safety_regulations.pdf'
PROVENANCE = {
    'sourceUrl': SOURCE_URL, 'sourceCache': 'scripts/sources/current.pdf', 'sourcePage': 5,
    'sourceCoordinates': 'Original uncropped PDF points before atlas cropping, scaling and rotation',
    'roadCorrection': 'scripts/north-road-corrections.json',
    'imageryService': 'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms',
    'imageryFlightDate': '2025-02-23', 'reviewed': '2026-11-18',
    'limitation': 'Physical parking-road approaches only. The source has no printed revision date; parking lines and current operational access are not surveyed or verified live.',
}

P_BASIS = ('P is the individual dock408 parcel between the northern cross-road125, '
           'P/Q2 divider113 and the inner076 perimeter. The fourth side is the actual '
           'quay aisle independently traced in the official orthophoto, rather than '
           'the obsolete109 line through stored cars.')
Q_BASIS = ('The source places Q2 immediately south of P/divider113, above the Q9/Q10 '
           'strips and Loods C landmark on the western dock408 frontage. Its arrival '
           'is on the individually reviewed adjacent quay aisle south of that divider. '
           'This is an access-side compound reference; the older southern partitions '
           'do not establish a surveyed Q2 centre or exact numbered line.')

OUT = {}
for code, access, label, bounds, region_id, scope, basis in [
    ('P', P_ACCESS, P_LABEL, [158.6859, 265.4733, 247.1469, 371.7523],
     'nit-reviewed-dock408-p-parcel', 'parking-approach', P_BASIS),
    ('Q2', Q_ACCESS, midpoint(Q_ACCESS['nodes']), [155.7933, 377.7570, 244.0013, 482.6810],
     'nit-reviewed-q2-quay-access-side', 'parking-group-approach', Q_BASIS),
]:
    point = midpoint(access['nodes'])
    source = source_points('north', code)
    OUT['north:' + code] = {
        'lat': point[0], 'lon': point[1], 'parking': code,
        'sourceMap': 'north', 'sourceRevision': MAPS['north']['date'],
        'sourcePage': 5, 'sourcePoint': source[0], 'sourcePoints': source, 'sourceBounds': bounds,
        'method': 'imagery-verified-parcel-road-match', 'scope': scope, 'lineExact': False,
        'roadWay': access['way'], 'roadSegment': access['nodes'], 'region': region_id,
        'basis': basis + ' Arrival remains on the reviewed private road; current site permissions and exact lines are unverified.',
        'junctionMatch': {'boundaryLanes': [NORTH, WEST, DIVIDER, EXTENSION, access] if code == 'P' else [DIVIDER, EXTENSION, access]},
        'labelPosition': {
            'lat': label[0], 'lon': label[1],
            'method': 'road-cell-polygon-centroid' if code == 'P' else 'matched-parcel-access-side-reference',
            'scope': 'parking-block-label' if code == 'P' else 'parking-access-side-reference',
            'sourcePoint': source[0],
            'basis': 'Display point inside the four-sided source/road parcel, separate from its actual approach.' if code == 'P' else Q_BASIS,
        },
        'provenance': PROVENANCE,
    }

REGIONS = [
    {'id': 'nit-reviewed-dock408-p-parcel', 'codes': ['P'], 'sourceMap': 'north',
     'sourceBounds': OUT['north:P']['sourceBounds'], 'model': 'individually-bounded-road-cell',
     'boundaryNodes': P_NODES, 'polygon': P_POLYGON,
     'boundaryLanes': [NORTH, P_ACCESS, DIVIDER, EXTENSION, WEST], 'evidence': P_BASIS},
    {'id': 'nit-reviewed-q2-quay-access-side', 'codes': ['Q2'], 'sourceMap': 'north',
     'sourceBounds': OUT['north:Q2']['sourceBounds'], 'model': 'source-parcel-access-side-reference',
     'sourceNeighbours': {'north': 'P / divider113', 'south': 'Q9 / Q10 / Loods C', 'quay': 'dock408'},
     'boundaryLanes': [DIVIDER, EXTENSION, Q_ACCESS], 'evidence': Q_BASIS},
]

# DRU is a named linear parking/access reference outside the repeated U banks,
# not an individual row inside one of them. Its source position and the whole
# long outer corridor are matched independently of the P/Q2 quay correction.
# The5Mar2026 official working orthophoto positively confirms this existing
# private lane between the Jozef fence and the U storage rows.
DRU_WAY = '241878055'
DRU_EXPECTED_NODES = [
    '2494558929', '2494558928', '2494558936', '2494558938', '2494558939',
    '2494558949', '2494558956', '2494558970', '2494558979', '2494558985',
    '2494558992', '2494558998', '2494559009', '2494559019', '2494559025',
]
if WAYS.get(DRU_WAY, {}).get('nodes') != DRU_EXPECTED_NODES:
    raise ValueError('DRU outer U-side corridor topology changed: ' + DRU_WAY)
DRU_ACCESS = chain(DRU_WAY, ['2494558928', '2494558936'])
for n, expected in {
    '2494558928': [51.3193662, 3.2080204],
    '2494558936': [51.3235379, 3.2063497],
}.items():
    if any(abs(a - b) > 1e-10 for a, b in zip(NODES[n], expected)):
        raise ValueError('DRU image-matched corridor anchor moved: ' + n)
DRU_SOURCE = source_points('north', 'DRU')
DRU_EXPECTED_SOURCE = [[49.0156, 541.4828], [45.2179, 682.2490]]
if len(DRU_SOURCE) != 2 or any(abs(a - b) > .03 for p, q in zip(DRU_SOURCE, DRU_EXPECTED_SOURCE) for a, b in zip(p, q)):
    raise ValueError('DRU printed source references changed; review the corridor association.')
DRU_POINT = midpoint(DRU_ACCESS['nodes'])
DRU_BASIS = ('The two printed DRU references name the continuous outer U-side '
             'parking/access lane between the terminal fence beside Jozef '
             'Verschaveweg and the repeated U storage banks. The existing private '
             'road8928-8936 follows that exact corridor in the official5Mar2026 '
             'orthophoto. This is a named-lane group approach, not an interior '
             'parking-row centre or a public-road target across the fence.')
OUT['north:DRU'] = {
    'lat': DRU_POINT[0], 'lon': DRU_POINT[1], 'parking': 'DRU',
    'sourceMap': 'north', 'sourceRevision': MAPS['north']['date'], 'sourcePage': 5,
    'sourcePoint': DRU_SOURCE[0], 'sourcePoints': DRU_SOURCE,
    'scope': 'parking-group-approach', 'destinationKind': 'parking-lane-reference',
    'method': 'source-lane-and-2026-imagery-match', 'lineExact': False,
    'roadWay': DRU_WAY, 'roadSegment': DRU_ACCESS['nodes'],
    'region': 'nit-dru-outer-u-side-corridor', 'basis': DRU_BASIS,
    'junctionMatch': {'boundaryLanes': [DRU_ACCESS], 'landmarks': ['Jozef-side terminal fence', 'repeated U storage banks']},
    'labelPosition': {'lat': DRU_POINT[0], 'lon': DRU_POINT[1],
                      'method': 'matched-named-lane-reference', 'scope': 'parking-lane-reference',
                      'basis': 'Display reference on the individually identified DRU corridor; no exact truck position or numbered row is claimed.'},
    'provenance': {
        'sourceUrl': SOURCE_URL, 'sourceCache': 'scripts/sources/current.pdf', 'sourcePage': 5,
        'sourceCoordinates': PROVENANCE['sourceCoordinates'],
        'imageryService': 'https://geo.api.vlaanderen.be/ofw/wms', 'imageryLayer': 'OFW',
        'imageryFlightDate': '2026-03-05', 'reviewed': '2026-11-19',
        'imageryRequest': {'service': 'WMS', 'request': 'GetMap', 'version': '1.3.0',
                           'layers': 'OFW', 'crs': 'EPSG:4326',
                           'bbox': [51.3192, 3.2058, 51.3238, 3.2084],
                           'width': 1000, 'height': 1800, 'format': 'image/jpeg'},
        'flightDateEvidence': 'OFW_vdc GetFeatureInfo text/html at i550,j1000 returns OpnDatum5/3/2026,FID4.',
        'limitation': 'Existing private named-lane approach only; imagery does not establish current operational permission, a numbered parking row, or an exact truck position.',
    },
}
REGIONS.append({'id': 'nit-dru-outer-u-side-corridor', 'codes': ['DRU'], 'sourceMap': 'north',
                'sourcePoints': DRU_SOURCE, 'model': 'individually-matched-named-lane',
                'boundaryLanes': [DRU_ACCESS], 'evidence': DRU_BASIS,
                'provenance': OUT['north:DRU']['provenance']})

# These are entrances to independently identified compounds. Their individual
# old-plan strips are not positioned in today's parking rows. Keep the source
# glyphs, field boundaries and actual entrance junctions separate; no source
# coordinates are projected onto the orthophoto.
Q_COMPOUND_ACCESS = chain('241878076', ['2494558944', '2494558932'])
KB_COMPOUND_ACCESS = chain(DRU_WAY, ['2494558929', '2494558928'])
for node, expected in {
    '2494558944': [51.3238986, 3.2078897],
    '2494558932': [51.3224706, 3.2084415],
    '2494558929': [51.3195327, 3.2090748],
}.items():
    if any(abs(a - b) > 1e-10 for a, b in zip(NODES[node], expected)):
        raise ValueError('North compound entrance image anchor moved: ' + node)

Q_AREA = 'Q parking area north of Loods C'
KB_AREA = 'KB area at south end of U'
Q_ENTRANCE_BASIS = (
    'The original Q9 and Q10 glyphs label the two strips between Q2 and Loods C. '
    'They belong to the specific dock408 Q compound bounded north by divider113, '
    'west by the inner076 lane, east by the quay-side aisle and south by Loods C. '
    'The5Mar2026 OFW image confirms an uninterrupted paved field and its open '
    'south-west forecourt access at existing076 junction8932, immediately north '
    'of Loods C. Routing ends at that actual area entrance. The historic strip '
    'divisions and individual Q9/Q10 parking positions are not mapped.')
KB_ENTRANCE_BASIS = (
    'The original KB glyph labels the southern cap of U, west of the rail '
    'corridor; it does not label either KA or KE beside VPC1-PDI. The5Mar2026 '
    'OFW image independently confirms the paved strip between the U storage '
    'rows and southern terminal fence, with the rail/track-side boundary to '
    'the east and DRU-side boundary to the west. Existing055 junction8928 '
    'is the actual open junction from the outer U-side lane into that south '
    'strip. Routing ends at this area entrance, not an invented KB bay.')

AREA_PROVENANCE = {
    **OUT['north:DRU']['provenance'],
    'imageryRequest': {'service': 'WMS', 'request': 'GetMap', 'version': '1.3.0',
                      'layers': 'OFW', 'crs': 'EPSG:4326',
                      'bbox': [51.31925, 3.20755, 51.32425, 3.21035],
                      'width': 1500, 'height': 2000, 'format': 'image/jpeg'},
    'kbDetailRequest': {'bbox': [51.3188, 3.2077, 51.3198, 3.2095],
                        'width': 1600, 'height': 1300},
    'limitation': 'Confirmed physical compound entrances only. Individual parking strips and numbered lines are not mapped; current operational access is not verified live.',
}
AREA_SPECS = [
    ('Q9', [195.5400, 488.9333], [155.6410, 481.4598, 240.9261, 495.6889],
     Q_COMPOUND_ACCESS, '2494558932', 'nit-q-north-loods-c-area-entry', Q_AREA, Q_ENTRANCE_BASIS),
    ('Q10', [195.5533, 510.6200], [155.1571, 502.8689, 240.5472, 517.6440],
     Q_COMPOUND_ACCESS, '2494558932', 'nit-q-north-loods-c-area-entry', Q_AREA, Q_ENTRANCE_BASIS),
    ('KB', [80.6833, 781.6967], [40.0, 763.0, 112.0, 800.0],
     KB_COMPOUND_ACCESS, '2494558928', 'nit-kb-south-u-area-entry', KB_AREA, KB_ENTRANCE_BASIS),
]
for code, expected, bounds, access, arrival_node, region_id, area_name, basis in AREA_SPECS:
    source = source_points('north', code)
    if len(source) != 1 or any(abs(a - b) > .03 for a, b in zip(source[0], expected)):
        raise ValueError('North compound printed source reference changed: ' + code)
    point = NODES[arrival_node]
    OUT['north:' + code] = {
        'lat': point[0], 'lon': point[1], 'parking': code,
        'name': code + ' · ' + area_name + ' area entrance', 'areaName': area_name,
        'sourceMap': 'north', 'sourceRevision': MAPS['north']['date'], 'sourcePage': 5,
        'sourcePoint': source[0], 'sourcePoints': source, 'sourceBounds': bounds,
        'scope': 'parking-group-approach', 'precision': 'area-entry-only',
        'individualParkingVerified': False, 'lineExact': False,
        'method': 'source-compound-and-2026-imagery-entrance-match',
        'roadWay': access['way'], 'roadSegment': access['nodes'], 'region': region_id,
        'basis': basis, 'junctionMatch': {'boundaryLanes': [access], 'arrivalNode': arrival_node},
        'labelPosition': {'lat': point[0], 'lon': point[1], 'scope': 'area-entrance-reference',
                          'method': 'actual-compound-entrance-junction',
                          'basis': 'Display the confirmed area entrance; the individual parking is not mapped.'},
        'provenance': AREA_PROVENANCE,
    }

REGIONS.extend([
    {'id': 'nit-q-north-loods-c-area-entry', 'codes': ['Q9', 'Q10'], 'sourceMap': 'north',
     'sourceBounds': [150.0, 377.7, 244.1, 529.2], 'areaName': Q_AREA,
     'model': 'landmark-bounded-compound-area-entrance',
     'polygon': [NODES['2494558944'], NODES['portway-nit-quay-divider'],
                 [51.322524, 3.21012], [51.3223475, 3.209547], NODES['2494558930'],
                 NODES['2494558932'], NODES['2494558944']],
     'polygonPrecision': 'Physical compound evidence envelope, not a surveyed parking-strip boundary',
     'boundaryControls': [
         {'name': 'North divider113', 'lane': DIVIDER},
         {'name': 'West inner076 lane and actual south-west entry', 'lane': Q_COMPOUND_ACCESS},
         {'name': 'Eastern quay-side aisle', 'lane': Q_ACCESS},
         {'name': 'Loods C northern roof edge', 'points': [NODES['2494558930'], [51.3223475, 3.209547]]},
     ], 'evidence': Q_ENTRANCE_BASIS, 'provenance': AREA_PROVENANCE},
    {'id': 'nit-kb-south-u-area-entry', 'codes': ['KB'], 'sourceMap': 'north',
     'sourceBounds': [40.0, 763.0, 112.0, 800.0], 'areaName': KB_AREA,
     'model': 'landmark-bounded-compound-area-entrance',
     'polygon': [[51.31955, 3.2080], [51.31968, 3.2091], [51.31922, 3.20932],
                 [51.31908, 3.20815], [51.31955, 3.2080]],
     'polygonPrecision': 'Physical south-U compound evidence envelope, not a surveyed KB bay boundary',
     'boundaryControls': [
         {'name': 'North end of paved strip below U storage rows', 'points': [[51.31955, 3.2080], [51.31968, 3.2091]]},
         {'name': 'South terminal fence', 'points': [[51.31908, 3.20815], [51.31922, 3.20932]]},
         {'name': 'West DRU-side actual entry8928 and south-U crossing', 'lane': KB_COMPOUND_ACCESS},
         {'name': 'East rail/track-side boundary', 'points': [[51.31968, 3.2091], [51.31922, 3.20932]]},
     ], 'evidence': KB_ENTRANCE_BASIS, 'provenance': AREA_PROVENANCE},
])

OVERRIDE_GUARDS = {
    'north:P': {'roadWay': '241878109', 'roadSegment': ['2494558948', '2494558983'],
                'lat': 51.324694199999996, 'lon': 3.2088330999999997},
    'north:Q2': {'roadWay': '241878109', 'roadSegment': ['2494558935', '2494558948'],
                 'lat': 51.3238452, 'lon': 3.20917695},
}


def unresolved_reason(map_id, code):
    if map_id == 'nissan':
        return ('The source-matched Nissan compound and its office-side entrance are west of Jozef Verschaveweg, '
                'inside official ICO4070. The old eastern context was BNFW4130 and has been rejected. '
                'The published graph has no reviewed private aisle network linking the fourteen Nissan source '
                'codes to their own physical arrivals. No public-road fence target, terminal-centre point, '
                'or old rejected global image fit is used.')
    if code in ['KA', 'KE']:
        return ('The source identifies a parking strip on this side of VPC1-PDI. The exact present-day '
                'warehouse-side lane and the strip extent have not been independently matched to the graph; '
                'the known076 corner or another nearby road is not substituted for this parking.')
    if code == 'KB':
        return ('KB is printed at the southern cap of the U/VPC-side compound. The corresponding access '
                'reference has not been individually matched to a currently reviewed drivable segment.')
    if code in ['A1', 'A46']:
        return ('This is a real numbered A-row reference recovered from split PDF glyphs. An exact row '
                'arrival has not been verified; another A reference is not silently reused as its GPS point.')
    if code in ['Q9', 'Q10']:
        return ('This real joined source label identifies one of the strips between Q2 and Loods C. '
                'Its changed or historical physical strip and its own drivable access are not independently verified.')
    return ('The real printed parking/lane reference is now indexed, but its own source-to-road association '
            'has not yet been independently verified. Indexing a label alone does not establish a GPS destination.')


UNRESOLVED = []
for map_id in ['north', 'nissan']:
    for parking in MAPS[map_id]['parkings']:
        key = map_id + ':' + parking['code']
        if key in OUT or key in PUBLISHED.get('destinations', {}):
            continue
        UNRESOLVED.append({'key': key, 'code': parking['code'], 'sourceMap': map_id,
                           'sourcePoints': source_points(map_id, parking['code']),
                           'locationStatus': 'printed-source-label', 'routeStatus': 'unresolved',
                           'reason': unresolved_reason(map_id, parking['code'])})

RESULT = {
    'version': 1, 'source': 'Reviewed North P/Q2 correction, DRU named lane, Q9/Q10/KB area entrances and remaining North/Nissan evidence gaps',
    'lineExact': False, 'destinations': OUT, 'regions': REGIONS,
    'overrideKeys': list(OVERRIDE_GUARDS), 'overrideGuards': OVERRIDE_GUARDS,
    'unresolved': UNRESOLVED, 'provenance': PROVENANCE,
}

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/north-remaining-destinations.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(RESULT, indent=2), encoding='utf-8')
    print(f'North: {len(OUT)} reviewed approaches, including3 explicit area-only entrances; {len(UNRESOLVED)} other North/Nissan codes retain explicit evidence gaps')
