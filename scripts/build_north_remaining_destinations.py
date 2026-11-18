"""Rebuild the reviewed P/Q2 approaches and retain explicit North/Nissan gaps.

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
    'version': 1, 'source': 'Reviewed North P/Q2 correction and explicit remaining North/Nissan evidence gaps',
    'lineExact': False, 'destinations': OUT, 'regions': REGIONS,
    'overrideKeys': list(OVERRIDE_GUARDS), 'overrideGuards': OVERRIDE_GUARDS,
    'unresolved': UNRESOLVED, 'provenance': PROVENANCE,
}

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/north-remaining-destinations.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(RESULT, indent=2), encoding='utf-8')
    print(f'North P/Q2: 2 reviewed approaches; {len(UNRESOLVED)} other North/Nissan codes retain explicit evidence gaps')
