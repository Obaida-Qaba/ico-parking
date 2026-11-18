"""Emit individually matched Nissan internal approaches from reviewed aisles.

No schematic-to-GPS affine transform is used. Three actual bank aisles, their
main transverse junctions and the source's seven-bay V field establish the
code-side references. The private graph deliberately has no public gate join.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
RULES = json.loads((ROOT / 'scripts/nissan-road-corrections.json').read_text(encoding='utf-8'))
DATA = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
ROADS = json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
MAP = next(m for m in DATA['maps'] if m['id'] == 'nissan')
PARKINGS = {p['code']: p for p in MAP['parkings']}
WAYS = {w['id']: w for w in ROADS['ways']}
NODES = {n: p for w in ROADS['ways'] for n, p in zip(w['nodes'], w['points'])}

for expected in RULES['additions']:
    actual = WAYS.get(expected['id'])
    if actual is None or any(actual.get(k) != expected[k] for k in ['nodes', 'points', 'oneway', 'private']):
        raise ValueError('Apply the reviewed Nissan internal road geometry first: ' + expected['id'])
    if actual.get('blocked') or actual.get('excludedSegments'):
        raise ValueError('Reviewed Nissan internal aisle is closed: ' + expected['id'])
    if any(not n.startswith('portway-nissan-') for n in actual['nodes']):
        raise ValueError('Nissan island must not acquire an unproved external join.')


def source_points(code):
    result = [[round(p['x'] / 3 + 30, 4), round(p['y'] / 3 + 200, 4)] for p in PARKINGS[code]['points']]
    expected = RULES['sourceLabelPoints'][code]
    if len(result) != len(expected) or any(abs(a - b) > .03 for p, q in zip(result, expected) for a, b in zip(p, q)):
        raise ValueError('Nissan source label changed and needs fresh matching: ' + code)
    return result


def build(code, spec, indices=None):
    way_id = 'portway-nissan-' + spec['way']
    nodes = ['portway-nissan-j' + n for n in spec['nodes']]
    w = WAYS[way_id]
    positions = [w['nodes'].index(n) for n in nodes]
    if abs(positions[0] - positions[1]) != 1:
        raise ValueError('Nissan approach must use one actual adjacent aisle segment: ' + code)
    t = spec.get('fraction', .5)
    point = [NODES[nodes[0]][a] * (1 - t) + NODES[nodes[1]][a] * t for a in (0, 1)]
    sources = source_points(code)
    chosen = list(range(len(sources))) if indices is None else indices
    basis = spec['association']
    return {
        'lat': point[0], 'lon': point[1], 'parking': code, 'sourceMap': 'nissan',
        'sourceRevision': 'V02022024', 'sourcePage': 6, 'sourcePoint': sources[chosen[0]],
        'sourcePoints': sources, 'sourceIndices': chosen, 'sourceBounds': spec.get('sourceBounds'),
        'method': 'source-bank-and-imagery-aisle-match', 'scope': spec['scope'],
        'lineExact': False, 'routingScope': 'terminal-internal', 'publicConnectionVerified': False,
        'roadWay': way_id, 'roadSegment': nodes, 'region': 'nissan-' + code.lower() + '-access-side',
        'basis': basis + ' Internal arrival only; the public gate transfer and exact numbered lines are unverified.',
        'labelPosition': {'lat': point[0], 'lon': point[1], 'scope': 'parking-access-side-reference',
                          'method': 'reviewed-aisle-side-reference', 'sourceIndices': chosen,
                          'basis': 'Actual access-side reference for this matched source code; not an inferred interior or surveyed line.'},
        'provenance': {'sourceUrl': RULES['sourcePlan']['url'], 'sourcePage': 6,
                       'sourceRevision': 'V02022024', 'imagery': RULES['imagery'],
                       'roadCorrection': 'scripts/nissan-road-corrections.json', 'reviewed': RULES['reviewed']},
    }


OUT = {}
for code, spec in RULES['destinationSpecs'].items():
    OUT['nissan:' + code] = build(code, spec)

v_points = source_points('V')
choices = []
for id, spec in RULES['vApproaches'].items():
    indices = [i for i, p in enumerate(v_points) if spec['sourceY'][0] <= p[1] < spec['sourceY'][1]]
    if len(indices) != 1:
        raise ValueError('Each physical V bank must have its own printed source label.')
    choice = build('V', {**spec, 'scope': 'parking-group-approach',
                        'association': 'This is the ' + spec['name'].lower() + ' of the three separately approached seven-bay V banks. The actual long-aisle boundary supplies this bank-specific arrival; names are app descriptions, not official subcodes.'}, indices)
    choices.append({**choice, 'id': id, 'name': spec['name']})
OUT['nissan:V'] = {**choices[0], 'chooseApproach': True, 'approaches': choices,
                   'sourceIndices': list(range(len(v_points))),
                   'basis': 'The three physically split V banks require an explicit choice. Base coordinates are west-bank catalogue metadata, not an arbitrary default. Internal Nissan routes only.'}
OUT['nissan:V'].pop('id')
OUT['nissan:V'].pop('name')

UNRESOLVED = [{'key': 'nissan:' + code, 'code': code, 'sourceMap': 'nissan',
               'sourcePoints': source_points(code), 'routeStatus': 'unresolved', 'reason': reason}
              for code, reason in RULES['unresolved'].items()]
if len(OUT) != 11 or set(p['code'] for p in UNRESOLVED) != {'VB', 'VF', 'VG'}:
    raise ValueError('Nissan review must retain eleven individually matched codes and three explained gaps.')

RESULT = {'version': 1, 'source': 'Nissan2024 source topology and official23Feb2025 orthophoto',
          'lineExact': False, 'routingScope': 'terminal-internal', 'publicConnectionVerified': False,
          'destinations': OUT, 'regions': [{'id': p['region'], 'codes': [p['parking']],
                                           'sourcePoints': p['sourcePoints'], 'roadWay': p['roadWay'],
                                           'roadSegment': p['roadSegment'], 'model': 'individual-source-bank-access-side',
                                           'evidence': p['basis']} for p in OUT.values()],
          'unresolved': UNRESOLVED, 'publicGateAudit': RULES['publicGateAudit'],
          'limitations': RULES['limitations']}

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/nissan-destinations.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(RESULT, indent=2), encoding='utf-8')
    print('Nissan:11 reviewed internal-only codes; V requires3-bank choice; VB/VF/VG unresolved; no public gate join')
