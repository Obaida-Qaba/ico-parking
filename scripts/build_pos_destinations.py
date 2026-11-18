"""Build the two source-supported POS compound approaches.

The September 2026 plan prints POS three times, but its chevrons form two
compounds: one above GE2 and a continuous larger one above EE1 / DE1. Match
those compounds to their existing boundary-road polygons, without an affine
projection or an invented split between the larger compound's repeated labels.
The generic POS record requires an explicit approach choice in the client.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
REVISION = 'V1.09-2026'
DATA = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
ROADS = json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
SOURCE = next(m for m in DATA['maps'] if m['id'] == 'south')
PARKING = next((p for p in SOURCE['parkings'] if p['code'] == 'POS'), None)
if PARKING is None:
    raise ValueError('POS is absent from the South source index; rebuild scripts/build_maps.py first.')
WAYS = {w['id']: w for w in ROADS['ways']}
NODES = {n: p for w in ROADS['ways'] for n, p in zip(w['nodes'], w['points'])}


def require_chain(way_id, expected_nodes):
    """Require the identified private two-way lane and every adjacent edge."""
    way = WAYS.get(way_id)
    if way is None or way['oneway'] is not False or way.get('private') is not True:
        raise ValueError('POS private boundary-lane direction/access changed: ' + way_id)
    nodes = way['nodes']
    count = len(expected_nodes)
    candidates = [nodes[i:i + count] for i in range(len(nodes) - count + 1)]
    if expected_nodes not in candidates and expected_nodes[::-1] not in candidates:
        raise ValueError('POS boundary-lane junction chain changed: ' + way_id)
    excluded = {tuple(sorted(pair)) for pair in way.get('excludedSegments', [])}
    if any(n in way.get('blocked', []) for n in expected_nodes) or any(
            tuple(sorted(pair)) in excluded for pair in zip(expected_nodes, expected_nodes[1:])):
        raise ValueError('POS boundary lane is no longer drivable: ' + way_id)
    if any(len(NODES[n]) != 2 or not all(math.isfinite(v) for v in NODES[n]) for n in expected_nodes):
        raise ValueError('POS boundary lane has invalid coordinates: ' + way_id)
    return {'way': way_id, 'nodes': expected_nodes, 'oneway': False, 'private': True}


# Guard every boundary link, including the curved west end and eastern elbow.
NORTH = require_chain('746582122', [
    '6987015338', '12487521075', '12487521076', '6986702550',
    '2494511761', '2494511768', '2494511787', '2494511789', '2494511796',
])
SOUTH = require_chain('931027303', [
    '6987015338', '2494511763', '2494511770', '2494511782',
    '12487521003', '2494511796',
])
DIVIDER = require_chain('241873299', ['2494511761', '2494511763'])


def centroid(polygon):
    """Return an interior display label from the actual boundary polygon."""
    # Compute in local metres to keep the shoelace arithmetic stable.
    origin = polygon[0]
    points = [[(p[1] - origin[1]) * 69800, (p[0] - origin[0]) * 111320] for p in polygon]
    twice_area = x_sum = y_sum = 0.0
    for a, b in zip(points, points[1:]):
        cross = a[0] * b[1] - b[0] * a[1]
        twice_area += cross
        x_sum += (a[0] + b[0]) * cross
        y_sum += (a[1] + b[1]) * cross
    if abs(twice_area) < 100:
        raise ValueError('POS compound polygon is degenerate.')
    point = [origin[0] + y_sum / (3 * twice_area) / 111320,
             origin[1] + x_sum / (3 * twice_area) / 69800]
    # A changed boundary must not silently put the label outside its compound.
    inside = False
    lat, lon = point
    for a, b in zip(polygon, polygon[1:]):
        if (a[0] > lat) != (b[0] > lat) and lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1]:
            inside = not inside
    if not inside:
        raise ValueError('POS display label is outside the matched compound.')
    return point


SOURCE_POINTS = [[p['x'] / 3, p['y'] / 3] for p in PARKING['points']]
WEST_INDICES = [i for i, p in enumerate(SOURCE_POINTS) if p[0] < 710]
MAIN_INDICES = [i for i, p in enumerate(SOURCE_POINTS) if p[0] >= 710]
if len(WEST_INDICES) != 1 or len(MAIN_INDICES) != 2:
    raise ValueError('POS source-label grouping changed; review the two compounds.')

REGIONS = []


def approach(id, name, indices, bounds, boundary_nodes, boundaries, road_segment, evidence):
    for i in indices:
        x, y = SOURCE_POINTS[i]
        if not (bounds[0] <= x <= bounds[2] and bounds[1] <= y <= bounds[3]):
            raise ValueError('POS source label is outside its reviewed footprint: ' + id)
    # This approach is deliberately a midpoint of one existing adjacent edge.
    access = require_chain('931027303', road_segment)
    point = [sum(NODES[n][axis] for n in road_segment) / 2 for axis in (0, 1)]
    if boundary_nodes[0] != boundary_nodes[-1]:
        raise ValueError('POS compound boundary is not closed: ' + id)
    expected_edges = {tuple(sorted(pair)) for pair in zip(boundary_nodes, boundary_nodes[1:])}
    actual_edges = {tuple(sorted(pair)) for boundary in boundaries
                    for pair in zip(boundary['nodes'], boundary['nodes'][1:])}
    if expected_edges != actual_edges or not tuple(sorted(road_segment)) in expected_edges:
        raise ValueError('POS polygon does not follow its checked boundary roads: ' + id)
    polygon = [NODES[n] for n in boundary_nodes]
    label = centroid(polygon)
    source_points = [SOURCE_POINTS[i] for i in indices]
    source_point = [sum(p[axis] for p in source_points) / len(source_points) for axis in (0, 1)]
    region_id = 'south-pos-' + id
    basis = evidence + ' Arrival stays on the existing private southern boundary road; parking lines and current site operations are not surveyed.'
    region = {
        'id': region_id, 'codes': ['POS'], 'approachId': id,
        'sourceMap': 'south', 'sourceRevision': REVISION, 'sourceBounds': bounds,
        'sourceIndices': indices, 'sourcePoints': source_points,
        'model': 'road-boundary-polygon', 'polygon': polygon,
        'boundaryNodes': boundary_nodes, 'boundaryLanes': boundaries,
        'evidence': evidence,
    }
    REGIONS.append(region)
    return {
        'id': id, 'name': name, 'lat': point[0], 'lon': point[1],
        'parking': 'POS', 'scope': 'parking-group-approach',
        'method': 'landmark-junction-match', 'sourceMap': 'south', 'sourceRevision': REVISION,
        'roadWay': access['way'], 'roadSegment': road_segment, 'lineExact': False,
        'sourceIndices': indices, 'sourcePoint': source_point, 'sourcePoints': source_points,
        'sourceBounds': bounds, 'region': region_id, 'basis': basis,
        'junctionMatch': {'boundaryNodes': boundary_nodes, 'boundaryLanes': boundaries},
        'polygon': polygon,
        'labelPosition': {
            'lat': label[0], 'lon': label[1], 'method': 'road-boundary-polygon-centroid',
            'scope': 'parking-block-label', 'sourcePoint': source_point,
            'sourceIndices': indices,
            'basis': 'Display label inside this independently matched POS compound; not a surveyed parking line.',
        },
    }


WEST_NORTH = require_chain('746582122', [
    '6987015338', '12487521075', '12487521076', '6986702550', '2494511761',
])
WEST_SOUTH = require_chain('931027303', ['6987015338', '2494511763'])
MAIN_NORTH = require_chain('746582122', [
    '2494511761', '2494511768', '2494511787', '2494511789', '2494511796',
])
MAIN_SOUTH = require_chain('931027303', [
    '2494511763', '2494511770', '2494511782', '12487521003', '2494511796',
])

APPROACHES = [
    approach('ge2', 'Near GE2', WEST_INDICES, [647.5, 239.2, 709.8, 265.5],
             ['6987015338', '12487521075', '12487521076', '6986702550',
              '2494511761', '2494511763', '6987015338'],
             [WEST_NORTH, DIVIDER, WEST_SOUTH], ['6987015338', '2494511763'],
             'The west POS chevron compound sits above GE2, east of the MBZ / rest-facility landmarks, and west of the clearly printed gap before the larger POS compound. Its curved northern and western access lane and southern GE2-side road identify this physical polygon.'),
    approach('ee1-de1', 'Near EE1 / DE1', MAIN_INDICES, [719.4, 239.2, 846.9, 265.5],
             ['2494511761', '2494511768', '2494511787', '2494511789', '2494511796',
              '12487521003', '2494511782', '2494511770', '2494511763', '2494511761'],
             [MAIN_NORTH, MAIN_SOUTH, DIVIDER], ['2494511770', '2494511782'],
             'The two eastern POS labels occupy one uninterrupted chevron compound above EE1 / DE1 and west of CF1. The surrounding northern access lane, CF1-side elbow, southern forecourt road and western divider identify its polygon; repeated labels do not create an internal road or official subdivision.'),
]

# The older rotated drawing prints west/main/main, while the current drawing's
# text extraction orders the same compounds main/main/west. Source highlighting
# must retain each drawing's own index order without changing the GPS choice.
legacy_map=next(m for m in DATA['maps'] if m['id']=='bastenaken')
legacy_pos=next(p for p in legacy_map['parkings'] if p['code']=='POS')
legacy_west=[i for i,p in enumerate(legacy_pos['points']) if p['y']/3+90>480]
legacy_main=[i for i,p in enumerate(legacy_pos['points']) if p['y']/3+90<=480]
if len(legacy_west)!=1 or len(legacy_main)!=2:
    raise ValueError('Review older POS source grouping after index revision.')
for item in APPROACHES:
    item['sourceIndicesByMap']={'south':item['sourceIndices'],'bastenaken':legacy_west if item['id']=='ge2' else legacy_main}

# The base coordinates retain a real reviewed point for catalogue metadata.
# chooseApproach prevents those coordinates from becoming an arbitrary route.
DESTINATION = {
    **APPROACHES[0], 'parking': 'POS', 'scope': 'parking-group-approach',
    'chooseApproach': True, 'approaches': APPROACHES,
    'sourcePoints': SOURCE_POINTS, 'sourceIndices': list(range(len(SOURCE_POINTS))),
    'basis': 'POS covers two separately approached compounds. Select Near GE2 or Near EE1 / DE1 before routing. The base coordinate is catalogue metadata for the reviewed west approach, not an automatic selection.',
}
DESTINATION.pop('id')
DESTINATION.pop('name')

RESULT = {
    'version': 1, 'source': 'ICO SIT ' + REVISION + '; two individually matched POS road-boundary compounds',
    'sourceUrl': SOURCE_URL, 'lineExact': False,
    'destinations': {'south:POS': DESTINATION}, 'regions': REGIONS,
    'sourceEvidence': {
        'printedPOSLabels': SOURCE_POINTS,
        'compoundCount': 2,
        'partitionNames': 'Near GE2 and Near EE1 / DE1 are app descriptions, not official POS subcodes.',
        'POS01': {'printedText': 'POS 01', 'sourceBounds': [846.9761, 250.4604, 855.0982, 254.0015],
                  'interpretation': 'Small east-edge line/access annotation beside CF1, not a separately indexed parking compound or surveyed line.'},
        'interiorLaneExcludedFromMatch': {
            'roadWay': '1349890086',
            'reason': 'The main POS chevrons are uninterrupted at this interior crossing. This generator uses only the surrounding roads and does not justify a shortcut through the compound.',
        },
    },
}

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/pos-destinations.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(RESULT, indent=2), encoding='utf-8')
    print('POS: 2 guarded compound approaches; explicit selection required')
