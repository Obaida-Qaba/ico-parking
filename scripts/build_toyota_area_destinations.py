"""Source-matched Toyota AREA ENTRANCES, never guessed numbered bays.

The old Y bays occupy the field north of D09/E09 and west of F/G. Its reviewed
southern road boundary provides one shared arrival. R01 repeats along the
staging band NORTH of the railway; its shared arrival uses that northern road,
not the parallel one-way road across the tracks. OFW imagery dated 2026-03-05
confirms the surrounding road/rail/field relationships but changes internal
parking partitions. Therefore all points and display labels stay at the real
area entrance, with individualParkingVerified=False. No ordinal interpolation.

Z01 is the inner G perimeter. The separate Z03/Z04/Z05 triangular apron is
outside the curved railway; routing stops at its observed crossing approach,
without adding an unverified road connection across the tracks.
Nothing is inferred for the gas-site projections or the W/X/P subdivisions.

The historical A01-A04 field is separately matched by its closed access loop,
quayside strip and eastern redevelopment. Its present southwest connector is
one shared field entrance, not the historic source GATE or an individual bay.
H01 remains outside that loop. No flight date is claimed for this mosaic match.
"""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
OFW_URL = 'https://geo.api.vlaanderen.be/ofw/wms'
MOSAIC_URL = 'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms'
OWNER_URL = 'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/20'
Y_CODES = [f'Y{n:02}' for n in list(range(2, 35, 2)) + [35, 36, 37, 38]]

# Hashes bind both the actual road geometry and ordered node identities to the
# reviewed source/OFW match. A changed road requires a new geographic review.
ROAD_GUARDS = {
    '241869952': 'bbeb51d85d0c48efeeb93d378e00518902f14f8c3552217fcd3edb7dc419c1a0',
    '746744858': '7cd47acefb4b29c25132e3a19809384d68f9fa96cba4b2b7eb8a74dff2a70025',
    '746744859': '58ef0939cf3b9094cfd2e3d814a16504800b17c23f93762031df7cd6a2db6f9b',
    '241869968': 'ba9384e204a574516a39abed33a4c332adb460482834f8d3202b7fdf9492aaed',
    '241869962': '604b73b7d4d2731604eb92595ad6f45930613dd283dfef91fea1c324192e52a6',
    '241869964': '6aed3e73b461d10dda791b2fb8cc9afd60f525c3af759d508afb55f2bd698052',
    '746744860': '1078e07bd23a6ac19b14e795160987fd20521c17b6aa7ed3dd97602b08bcb75e',
    '241869917': '29fd55c80ed84a918813793f2178fd4d887a1addcbbf8d2cc6965178bdd737b9',
    '87379708': '6c4066c1ed3e2b232cd15e7c810160e3138e9b55128bf10c38916c8b1e6d6d5e',
    '731070738': '6d9de652c8f7a26ab1116b8b0b0567e4cf5bf1193498674c5117a96de114e4c1',
    '731070739': 'eaafa343fa1711c83a352800071f8d43403c6aef118d25991d93f67deb194884',
}
ROAD_DIRECTIONS = {'731070739': True}


def guarded_ways(roads):
    ways = {w['id']: w for w in roads['ways']}
    for ident, expected in ROAD_GUARDS.items():
        way = ways.get(ident)
        if not way or way.get('oneway') is not ROAD_DIRECTIONS.get(ident, False) or way.get('private') is not (ident != '87379708'):
            raise ValueError('Reviewed Toyota area road direction/access changed: ' + ident)
        actual = hashlib.sha256(json.dumps({'nodes': way['nodes'], 'points': way['points']}, separators=(',', ':')).encode()).hexdigest()
        if actual != expected:
            raise ValueError('Reviewed Toyota area road geometry changed: ' + ident)
        if way.get('blocked') or way.get('excludedSegments'):
            raise ValueError('Reviewed Toyota area road is closed: ' + ident)
    return ways


def chain(ways, ident, start, end):
    way = ways[ident]
    a, b = way['nodes'].index(start), way['nodes'].index(end)
    step = 1 if b >= a else -1
    nodes = way['nodes'][a:b + step:step] if b + step >= 0 else way['nodes'][a::step]
    if not nodes or nodes[-1] != end:
        raise ValueError('Reviewed Toyota area boundary changed: ' + ident)
    return {'way': ident, 'nodes': nodes, 'oneway': way['oneway']}


def flight_evidence(position):
    lat, lon = position
    return {
        'service': OFW_URL, 'imageryLayer': 'OFW', 'queryLayer': 'OFW_vdc',
        'dataset': 'Orthofotowerkbestand 2026.01', 'flightDate': '2026-03-05',
        'reportedFlightDate': '5/3/2026', 'featureId': '4',
        'method': 'Official WMS GetFeatureInfo property OpnDatum, independently queried at this area entrance on 2026-11-19.',
        'query': {'version': '1.3.0', 'CRS': 'EPSG:4326',
                  'bboxLatLon': [lat - .0001, lon - .0001, lat + .0001, lon + .0001],
                  'width': 500, 'height': 500, 'i': 250, 'j': 250,
                  'infoFormat': 'application/geo+json'},
        'limitation': 'The imagery supports the shared field and access-road association, not the old numbered bay divisions or current operating permissions.',
    }


def build(atlas=None, roads=None):
    atlas = atlas if atlas is not None else json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    roads = roads if roads is not None else json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
    ways = guarded_ways(roads)
    toyota = next(m for m in atlas['maps'] if m['id'] == 'toyota')
    parkings = {p['code']: p for p in toyota['parkings']}
    if 'Z02' in parkings:
        raise ValueError('Toyota source needs review: indexed Z02 was a repeated Z01 glyph, not a parking code.')
    groups = [
        {
            'id': 'toyota-a01-a04-shared-field-entrance', 'areaName': 'Historical Toyota A01-A04 field',
            'codes': ['A01', 'A02', 'A03', 'A04'],
            'arrivalNode': '6847391526', 'arrivalWay': '731070738',
            'arrivalSegment': ['6847391526', '6847391525'],
            'adjoiningLane': ('731070739', '6847391528', '6847391527'),
            'sourceBounds': [141.6667, 127.6667, 206.6667, 178.6667],
            'sourceGlyphs': {'A01': [[157, 134]], 'A02': [[157, 148]],
                             'A03': [[157, 162]], 'A04': [[157, 176]]},
            'sourceRevision': 'Cewez historical source; whole-field association independently reviewed with the official Flanders orthophoto mosaic; individual partitions unverified',
            'imageryEvidence': {
                'service': MOSAIC_URL, 'imageryLayer': 'Ortho',
                'dataset': 'Flanders most recent orthophoto mosaic',
                'method': 'Independent official WMS imagery review of the closed field loop, separate western quay strip, eastern redevelopment and southwest access connector. No Google imagery was used to derive these positions.',
                'limitation': 'The aerial association identifies the whole historical field and its real entrance. Its flight date and the old A01-A04 internal partitions were not independently confirmed.',
            },
            'association': 'The whole historical A01-A04 field is matched by the closed access loop north of the cross-terminal road, the separate narrow quay strip to its west and the redevelopment to its east. The present southwest connector joins the independently mapped cross-terminal road at node 6847391525. The current field aisles differ from the old four drawn partitions.',
            'boundaries': [
                {'way': '731070739', 'nodes': ways['731070739']['nodes'], 'oneway': True,
                 'role': 'complete one-way loop surrounding the independently matched historical A01-A04 whole field'},
                dict(chain(ways, '731070738', '6847391526', '6847391525'), role='real two-way connector from the field loop to the cross-terminal approach road'),
                dict(chain(ways, '241869964', '2494477588', '2494477618'), role='existing cross-terminal road junction at connector node 6847391525'),
            ],
            'boundaryLimitation': 'Only the whole-field entrance is located; no individual A01-A04 bay centre, row or exact line is established. H01 is outside the loop in the separate western quay strip and is not included. The historic source GATE is not identified with this current connector. Eastern A05-A09 and A01PPO are not inferred across the redevelopment.',
        },
        {
            'id': 'toyota-y-shared-field-entrance', 'areaName': 'Toyota Y area', 'codes': Y_CODES,
            'arrivalNode': '6988020209', 'arrivalWay': '746744858',
            'arrivalSegment': ['2494477538', '6988020209'],
            'sourceBounds': [214.7, 330, 380, 426],
            'association': 'The whole source Y field is north of D09/E09 and west of F/G. The current field retains those surrounding road/rail/landmark relationships; its internal rows have changed. The entrance is on its reviewed southern road boundary.',
            'boundaries': [
                dict(chain(ways, '746744858', '2494477523', '2494477553'), role='confirmed southern field boundary and shared arrival'),
                dict(chain(ways, '241869968', '2494477523', '2494477605'), role='western approach-corridor control'),
                dict(chain(ways, '241869962', '2494477553', '2494477590'), role='eastern F/G field-lane control'),
            ],
            'boundaryLimitation': 'These controls identify the shared field access. The forecourt-side northern partition and individual Y bays are not surveyed; no precise parking polygon or individual bay centre is emitted.',
        },
        {
            'id': 'toyota-r01-shared-staging-entrance', 'areaName': 'R01 staging area', 'codes': ['R01'],
            'arrivalNode': '6988020210', 'arrivalWay': '241869952',
            'arrivalSegment': ['2494477511', '6988020210'],
            'sourceBounds': [122, 498, 378, 508],
            'association': 'The three source R01 strips form one staging band below C13/D13/E13 and NORTH of the railway. The railway, its northern service road and the Bridgestone-side road junction identify that common band independently of source bay spacing.',
            'boundaries': [dict(chain(ways, '241869952', '2494477505', '2494477536'), role='confirmed NORTH-side railway staging access boundary')],
            'boundaryLimitation': 'Only the shared staging-area arrival is positioned. The three contiguous source strip interiors are not separately located. Parallel one-way road 241869960 across the tracks is not used as the R01 arrival.',
        },
        {
            'id': 'toyota-z01-inner-g-perimeter', 'areaName': 'Toyota Z perimeter area', 'codes': ['Z01'],
            'arrivalNode': '6988020212', 'arrivalWay': '241869964',
            'arrivalSegment': ['2494477626', '6988020212'],
            'sourceBounds': [490, 266, 569, 486],
            'sourceGlyphs': {'Z01': [[496.7, 271.2], [543, 479.5], [565, 371]]},
            'adjoiningLane': ('746744860', '6988020211', '6988020212'),
            'association': 'The three printed Z01 references follow the north and curved east edge of the G field. The retained G-field road ladder, curved railway and Bridgestone-side southern railway distinguish this INNER perimeter from the separate triangular apron across the tracks. The real cross-field road joins the perimeter at this area entrance.',
            'boundaries': [
                dict(chain(ways, '241869964', '2494477590', '2494477533'), role='reviewed north/east G-field perimeter INSIDE the curved railway'),
                dict(chain(ways, '746744860', '6988020211', '6988020212'), role='real cross-field road and perimeter-entry junction'),
                dict(chain(ways, '241869917', '2494477646', '2494477546'), role='independent G-field ladder axis between north edge and southern railway'),
            ],
            'boundaryLimitation': 'Only the shared inner-perimeter entrance is located. Individual Z01 positions and current parking partitions are not surveyed. This entry does not certify access to the apron outside the railway.',
        },
        {
            'id': 'toyota-z-outer-triangular-apron', 'areaName': 'Toyota Z apron area', 'codes': ['Z03', 'Z04', 'Z05'],
            'arrivalNode': '2494477580', 'arrivalWay': '241869964',
            'arrivalSegment': ['2494477593', '2494477580'],
            'sourceBounds': [526, 490, 562, 528],
            'sourceGlyphs': {'Z03': [[532.7, 502.6], [557, 497], [534, 524]], 'Z04': [[546, 501]], 'Z05': [[536, 513.5]]},
            'adjoiningLane': None,
            'areaAccessNote': 'Route ends at the apron’s railway-crossing approach; onward roads inside the apron are not mapped.',
            'observedAccess': {'method': 'OFW-imagery-reviewed-crossing-approach', 'onwardRoadsMapped': False,
                               'basis': 'A visible crossing at the northern tip of the triangular parked-car apron reaches the inner G-perimeter road here. Routing stops on that existing road before the tracks; no graph join, operational gate status or crossing permission is claimed.'},
            'association': 'The three Z03 edge labels and lower Z04/Z05 glyphs occupy the triangular apron OUTSIDE the G-field curve. Current OFW independently retains that distinctive parked-car wedge between the curved railway, the outer Aziestraat fence/road and the Bridgestone-side southern boundary. The northern tip has an observed railway-crossing approach at this actual road node.',
            'boundaries': [
                dict(chain(ways, '241869964', '2494477580', '2494477533'), role='mapped approach and curved railway-side boundary; target stays INSIDE the tracks before the observed crossing'),
                dict(chain(ways, '87379708', '1016125236', '1016124853'), role='outer Aziestraat road/fence landmark independently distinguishing the triangular apron from the G field; not an invented drive-in link'),
            ],
            'boundaryLimitation': 'The triangle is a distinct apron outside the curved railway. Its internal roads and individual Z03/Z04/Z05 bays are not mapped. Only the inner-road approach to its observed crossing is positioned, not a route across the railway or an operational gate guarantee.',
        },
    ]
    out, regions = {}, []
    for group in groups:
        way = ways[group['arrivalWay']]
        point = way['points'][way['nodes'].index(group['arrivalNode'])]
        segment = group['arrivalSegment']
        start = way['nodes'].index(segment[0])
        if way['nodes'][start:start + 2] != segment or group['arrivalNode'] not in segment:
            raise ValueError('Reviewed Toyota entrance segment changed: ' + group['id'])
        adjoining = group.get('adjoiningLane', ('746744859', '6988020209', '6988020210'))
        branch = chain(ways, *adjoining) if adjoining else None
        if branch and group['arrivalNode'] not in branch['nodes']:
            raise ValueError('Reviewed Toyota entrance junction changed: ' + group['id'])
        evidence = group.get('imageryEvidence') or flight_evidence(point)
        for code in group['codes']:
            parking = parkings[code]
            source = [[round(p['x'] / 3 + 45, 4), round(p['y'] / 3 + 90, 4)] for p in parking['points']]
            x0, y0, x1, y1 = group['sourceBounds']
            if not all(x0 <= x <= x1 and y0 <= y <= y1 for x, y in source):
                raise ValueError('Source glyph left the reviewed Toyota field: ' + code)
            if 'sourceGlyphs' in group and (len(source) != len(group['sourceGlyphs'][code]) or any(abs(a-b) > .025 for p, q in zip(source, group['sourceGlyphs'][code]) for a, b in zip(p, q))):
                raise ValueError('Reviewed Toyota source glyph identities changed: ' + code)
            out['toyota:' + code] = {
                'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                'parking': code, 'areaName': group['areaName'], 'region': group['id'],
                'method': 'source-topology-shared-area-entrance',
                'scope': 'parking-group-approach', 'precision': 'area-entry-only',
                'individualParkingVerified': False, 'lineExact': False, 'historical': True,
                'sourceMap': 'toyota', 'sourcePage': 25, 'sourceUrl': SOURCE_URL,
                'sourceRevision': group.get('sourceRevision', 'Cewez historical source; shared-area control reviewed with OFW 2026 imagery'),
                'sourcePoint': source[0], 'sourcePoints': source, 'sourcePointUnits': 'uncropped original PDF points',
                'sourcePointAtlasPixels': [parking['x'], parking['y']],
                'sourceBounds': group['sourceBounds'], 'sourceBoundsUnits': 'uncropped original PDF points',
                'sourceBoundsBasis': 'Visually reviewed source field/staging-band outline; these drawing coordinates are not geographic boundaries.',
                'roadWay': group['arrivalWay'], 'roadSegment': segment,
                'arrivalNode': group['arrivalNode'],
                'basis': group['association'] + ' Shared area entrance only. Individual numbered bays, current partitions, exact lines and current access permission are not established.',
                'junctionMatch': {'arrivalNode': group['arrivalNode'], 'entrySegment': segment,
                                  'adjoiningLane': branch, 'boundaryLanes': group['boundaries']},
                'mappedArea': {'areaName': group['areaName'], 'boundaryReferences': group['boundaries'],
                               'boundaryLimitation': group['boundaryLimitation'], 'individualParkingVerified': False},
                'flightEvidence': evidence,
                'labelPosition': {'lat': point[0], 'lon': point[1], 'name': code + ' · area entrance',
                                  'method': 'confirmed-shared-area-entrance', 'scope': 'area-entrance-label',
                                  'precision': 'area-entry-only', 'individualParkingVerified': False,
                                  'basis': 'Display at the SAME confirmed area arrival, not a guessed location of this numbered parking bay.'},
            }
            if branch is None:
                out['toyota:' + code]['junctionMatch'].pop('adjoiningLane')
            for field in ['areaAccessNote', 'observedAccess']:
                if field in group:
                    out['toyota:' + code][field] = group[field]
        regions.append({**group, 'sourceMap': 'toyota', 'sourcePage': 25, 'sourceUrl': SOURCE_URL,
                        'sourceBoundsUnits': 'uncropped original PDF points',
                        'precision': 'area-entry-only', 'individualParkingVerified': False,
                        'arrivalLatLon': point, 'flightEvidence': evidence})
    return {
        'version': 1, 'reviewed': '2026-11-20', 'source': 'Cewez page25 and independently reviewed official Flanders aerial field/road/rail topology',
        'sourceUrls': [SOURCE_URL, OFW_URL, MOSAIC_URL, OWNER_URL], 'destinations': out, 'regions': regions,
        'roadGuards': {way: {'orderedGeometrySHA256': fingerprint, 'oneway': ROAD_DIRECTIONS.get(way, False), 'private': way != '87379708'} for way, fingerprint in ROAD_GUARDS.items()},
        'ownerEvidence': {'dataset': OWNER_URL, 'queried': '2026-11-19',
                          'arrivalNodes': ['6988020209', '6988020210', '6988020212', '2494477580'], 'company': 'TOYOTA MOTOR EUROPE', 'terminal': '5230',
                          'additionalAreas': [{'region': 'toyota-a01-a04-shared-field-entrance',
                                               'fieldInteriorLatLon': [51.3055, 3.2363], 'company': 'ICO', 'terminal': '5250',
                                               'objectId': 296, 'landUse': 'roro concession',
                                               'basis': 'Official Port operator-polygon point query at the independently matched field interior; this does not transfer Toyota5230 ownership evidence to the northern A field.'}],
                          'limitation': 'Operator polygon is supporting geographic evidence, not current driving permission.'},
        'coverage': '30 source references share FIVE reviewed area entrances. A01-A04 share one historical whole-field entrance; their individual old partitions are unverified and H01 is excluded. No individual parking locations are claimed. Outer-apron routing ends before the railway crossing; its onward roads are not mapped.',
        'notAdded': ['A01PPO', 'A05', 'A06', 'A07', 'A08', 'A09', 'P04', 'P05',
                     'W01', 'W02', 'W03', 'W04', 'W05', 'W06', 'X02', 'X04', 'X06',
                     'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true', help='Emit JSON without writing an output file.')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        target = ROOT / 'scripts/geo/toyota-area-destinations.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
        print('30 Toyota source references; FIVE reviewed area entrances; no individual bay coordinates or new railway graph joins')
