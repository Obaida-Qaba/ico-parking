"""Bounded ICO upper-strip approaches and explicit remaining CH evidence gap.

The 1338613xxx road grid west of Koffieweg belongs to WWL terminal5010, as
confirmed by the Port of Antwerp-Bruges public company polygons. It MUST NOT be
used for ICO CH coordinates. The AH/BH strip is instead bounded by the known
BG/AG northern perimeter and Koffieweg on ICO's side of that road. Ordered
parking positions are mapped only within that identified parcel; routes stay
on its existing private access lane. CH internal partitions cannot currently be
individually matched from the Sep2026 drawing to Feb2025 imagery/cached roads.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
ROADS = json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
PARKINGS = {p['code']: p for p in next(m for m in DATA['maps'] if m['id'] == 'south')['parkings']}
WAYS = {w['id']: w for w in ROADS['ways']}
NODES = {n: p for w in ROADS['ways'] for n, p in zip(w['nodes'], w['points'])}


def chain(way_id, start, end, expected_oneway=False):
    w = WAYS[way_id]
    if w['oneway'] != expected_oneway:
        raise ValueError('Upper-strip lane direction changed: ' + way_id)
    a, b = w['nodes'].index(start), w['nodes'].index(end)
    step = 1 if b >= a else -1
    result = w['nodes'][a:b + step:step] if b + step >= 0 else w['nodes'][a::step]
    if result[-1] != end:
        raise ValueError('Upper-strip lane chain changed: ' + way_id)
    excluded = {tuple(sorted(p)) for p in w.get('excludedSegments', [])}
    if any(n in w.get('blocked', []) for n in result) or any(tuple(sorted(p)) in excluded for p in zip(result, result[1:])):
        raise ValueError('Upper-strip access lane is closed: ' + way_id)
    return {'way': way_id, 'nodes': result, 'oneway': expected_oneway}


def along(boundary, fraction):
    ns = boundary['nodes']
    lengths = [math.hypot((NODES[b][0] - NODES[a][0]) * 111320, (NODES[b][1] - NODES[a][1]) * 69800) for a, b in zip(ns, ns[1:])]
    remain = sum(lengths) * max(0, min(1, fraction))
    for i, length in enumerate(lengths):
        if remain <= length or i == len(lengths) - 1:
            t = remain / length
            return [NODES[ns[i]][j] * (1 - t) + NODES[ns[i + 1]][j] * t for j in range(2)], ns[i:i + 2]
        remain -= length
    raise ValueError('Empty upper-strip boundary')


INNER = chain('392480112', '2494511819', '2494511887')
OUTER = chain('1067857541', '12487520987', '9765036892')
SOUTH = chain('241873267', '12487520987', '2494511819')
BOUNDS = [945, 143, 1058, 200]
OUT = {}


def add(code, source=None, forced_fraction=None, group=False):
    p = PARKINGS[code]
    source = source or [p['x'] / 3, p['y'] / 3]
    f = forced_fraction if forced_fraction is not None else (source[0] - BOUNDS[0]) / (BOUNDS[2] - BOUNDS[0])
    if not -.01 <= f <= 1.01:
        raise ValueError('Upper-strip source parking outside bounded parcel: ' + code)
    point, segment = along(INNER, f)
    outer, _ = along(OUTER, f)
    label = [(a + b) / 2 for a, b in zip(point, outer)]
    OUT['south:' + code] = {
        'lat': point[0], 'lon': point[1], 'method': 'bounded-parcel-road-match',
        'scope': 'parking-group-approach' if group else 'parking-approach',
        'parking': code, 'sourceMap': 'south', 'sourceRevision': 'V1.09-2026',
        'roadWay': INNER['way'], 'roadSegment': segment, 'lineExact': False,
        'sourcePoint': source, 'sourceBounds': BOUNDS,
        'region': 'ico-koffieweg-bh-ah-strip',
        'basis': 'The known BG/AG northern perimeter and Koffieweg identify the narrow ICO-side AH/BH parcel. Ordered source strips are bounded between those physical roads; the route ends on the existing inner access lane. Internal parking partitions and lines are not surveyed.',
        'junctionMatch': {'boundaryLanes': [INNER, OUTER, SOUTH], 'cornerNodes': ['12487520987', '9765036892', '2494511887', '2494511819']},
        'labelPosition': {'lat': label[0], 'lon': label[1], 'method': 'bounded-parcel-midline', 'scope': 'parking-block-label', 'basis': 'Display position within the matched ICO-side strip between Koffieweg and the known BG/AG perimeter; source ordinal only, not a surveyed internal partition.'},
    }


for prefix, count in [('BH', 4), ('AH', 6)]:
    for n in range(1, count + 1):
        add(f'{prefix}{n}')

# BDR repeats along the same outer-edge band. Keep its two source positions and
# separate existing-road approaches; choose the first as the default group entry.
add('BDR', source=[PARKINGS['BDR']['points'][0]['x'] / 3, 170], group=True)
OUT['south:BDR']['sourcePoints'] = [[round(p['x'] / 3, 3), round(p['y'] / 3, 3)] for p in PARKINGS['BDR']['points']]
OUT['south:BDR']['approaches'] = []
for p in PARKINGS['BDR']['points']:
    point, segment = along(INNER, (p['x'] / 3 - BOUNDS[0]) / (BOUNDS[2] - BOUNDS[0]))
    OUT['south:BDR']['approaches'].append({'lat': point[0], 'lon': point[1], 'roadWay': INNER['way'], 'roadSegment': segment})

# BWH caps the source strip beside the quayward bend. Its approach is the actual
# north end of the existing inner lane, never an invented road across the cap.
add('BWH', forced_fraction=1, group=True)
OUT['south:BWH']['basis'] = 'The source BWH strip caps the AH/BH parcel at its quayward end. The route uses the real northern bend of that parcel access lane; the cap and berth coordinates are not surveyed.'

CH_CODES = [f'CH{i}' for i in range(1, 25)]
candidate_gate = chain('562258755', '4957640303', '5420487866')
gate_point, gate_segment = along(candidate_gate, .25)
result = {
    'version': 1,
    'source': 'ICO SIT V1.09-2026, OSM roads, official port company polygons and official Flemish orthophoto',
    'sourceUrls': [
        'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
        'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/20',
        'https://geo.api.vlaanderen.be/omwrgbmrvl/wms',
    ],
    'regions': [{'id': 'ico-koffieweg-bh-ah-strip', 'sourceBounds': BOUNDS, 'boundaryLanes': [INNER, OUTER, SOUTH], 'evidence': 'Contiguous ICO-side strip outside the already matched BG/AG northern perimeter. Physical road bounds, source-code order, and Koffieweg/berthward topology; no central affine extrapolation.'}],
    'ownershipChecks': [
        {'point': [3.212, 51.306], 'company': 'WALLENIUS WILHELMSEN LOGISTICS ZEEBRUGGE', 'terminal': '5010', 'meaning': '1338613xxx grid is not ICO; excluded from all matches.'},
        {'point': [3.218, 51.306], 'company': 'ICO', 'terminal': '5210'},
        {'point': [3.214, 51.311], 'company': 'ICO', 'terminal': '5210'},
    ],
    'orthophoto': {'flightDate': '2025-02-23', 'flightDateMethod': 'Official WMS Vliegdagcontour GetFeatureInfo, OpnDatum23/2/2025', 'limitation': 'Older than the Sep2026 parking revision; it cannot prove the revised individual CH partitions.'},
    'unresolved': [{'code': c, 'sourceMap': 'south', 'sourcePoints': [[round(p['x'] / 3, 3), round(p['y'] / 3, 3)] for p in PARKINGS[c]['points']], 'reason': 'The current24-strip CH schematic has not been individually matched to internal physical aisles. The tempting1338613xxx grid is WWL, not ICO. A confirmed current georeferenced plan or parking-code control observations are needed.'} for c in CH_CODES],
    'compoundApproachCandidates': [{'region': 'south-western-ico-koffieweg-mvo-band', 'lat': gate_point[0], 'lon': gate_point[1], 'roadWay': candidate_gate['way'], 'roadSegment': gate_segment, 'scope': 'shared-compound-entry-only', 'basis': 'Existing private access from MVO into the correct ICO-side compound. This is not an individual CH destination and is intentionally not emitted under24 different codes.'}],
    'destinations': OUT,
}
(ROOT / 'scripts/geo/upper-destinations.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(f'{len(OUT)} bounded upper-strip approaches; {len(CH_CODES)} CH codes remain individually unlocated')
