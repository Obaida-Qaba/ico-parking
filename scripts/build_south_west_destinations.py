"""Rebuild bounded Hanze and historical Toyota parking-road approaches.

The modern Hanze drawing is schematic: blocks are matched by basin/Natie1
landmarks and the ordered adjacent lane topology, rather than projecting all
labels with one transform. Toyota uses its two individually identified wind
turbines, with the independently matching Bridgestone northern edge as a check.
All routes end on a real, explicitly allowed service road. Historical Toyota
rows whose internal lanes have changed share their nearest existing block
approach. No surveyed line positions or current access permission is claimed.
"""
from pathlib import Path
import json
import re
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
ROADS = json.loads((ROOT / 'public/roads.json').read_text(encoding='utf-8'))
WAYS = {w['id']: w for w in ROADS['ways']}
MAPS = {m['id']: m for m in DATA['maps']}
SCALE = np.array([69800., 111320.])
OUT = {}

HANZE_CONTROLS = [
    {'source': [191, 555], 'geo': [3.2430322, 51.2949252], 'osmWay': '87646848', 'landmark': 'Southern basin east-bank corner'},
    {'source': [191, 425], 'geo': [3.2379006, 51.2932967], 'osmWay': '87646848', 'landmark': 'Southern basin west-bank corner'},
    {'source': [357.435, 608.755], 'geo': [3.24281056, 51.29857674], 'osmWay': '655330274', 'landmark': 'Natie1 small building footprint'},
]
HC = np.linalg.solve(np.array([[*c['source'], 1] for c in HANZE_CONTROLS]), np.array([c['geo'] for c in HANZE_CONTROLS]))

TOYOTA_CONTROLS = [
    {'source': [173.5, 460.3], 'geo': [3.2406611, 51.3007641], 'osmNode': '5147481310', 'landmark': 'Wind mill in C11'},
    {'source': [429.4, 489.0], 'geo': [3.2465473, 51.3022612], 'osmNode': '5147482728', 'landmark': 'Wind mill in F13'},
]
TS = np.array([c['source'] for c in TOYOTA_CONTROLS])
TG = np.array([c['geo'] for c in TOYOTA_CONTROLS])
u = TS[1] - TS[0]
v = (TG[1] - TG[0]) * SCALE
a, b = np.linalg.solve([[u[0], u[1]], [-u[1], u[0]]], v)
# PDF/image Y points down; geographic north points up: reflected similarity.
TR = np.array([[a, b], [b, -a]])


# Ordered road-node guards make stale topology fail loudly on rebuild.
ROAD_GUARDS = {'1349890056': {'ends': ['6988020122', '8345223121'],
                'nodeChainSHA256': 'b35306e005e33f42edfc693b6ba04e56a62f5232a0fc537bad1fcc78ac6d9d85',
                'oneway': False},
 '1349890073': {'ends': ['12487520949', '12487520948'],
                'nodeChainSHA256': 'c38704cb29b3a35ca4785897ddabcdcc1b06a00806c5f990fb5a1ae0ed9c85de',
                'oneway': True},
 '1396678595': {'ends': ['12880754222', '12880754221'],
                'nodeChainSHA256': '13adfadead4603d5b4a5c3ab26fde5f026e74403aadf7bd4fd192e38030569eb',
                'oneway': True},
 '1396678596': {'ends': ['12880754224', '12880754223'],
                'nodeChainSHA256': '4686debd9f342da91a8e7fc734f5fb1df69925fafc3adbe0e8786b3870604d4b',
                'oneway': True},
 '1396678597': {'ends': ['12880754226', '12880754225'],
                'nodeChainSHA256': 'd75875a1ed1a27bb2c5b16ed36fbe940d277323b1ab8fd1b34dca4efa9e467f9',
                'oneway': True},
 '1396678598': {'ends': ['12880754228', '12880754227'],
                'nodeChainSHA256': '93b45155fa1f4ea91ca97fa885cc26cf6c9e92fb5bf0320016c485f15a1ea0a2',
                'oneway': True},
 '1396678599': {'ends': ['12880754230', '12880754229'],
                'nodeChainSHA256': '0f10cd387ec841263d9aa834c0fbd7c3fa9120e68211c7cb1e6327cec36f79d7',
                'oneway': True},
 '1396678600': {'ends': ['6986702414', '12880754231'],
                'nodeChainSHA256': '724086fbccfc1df99d41c6ab3a283ff1a71e6611d25f159e9d30df11911481b4',
                'oneway': True},
 '1396678610': {'ends': ['6986702407', '6988001015'],
                'nodeChainSHA256': 'f71df5171f5b5a33e5283e7d5fc6c7a9e4ae5c1b48ce0518a8fb38b23bdeca32',
                'oneway': False},
 '241869916': {'ends': ['2494477527', '2494477507'],
               'nodeChainSHA256': '4bc9c9f1464fdaf938b92671fc0ce33e9f7a86df18f8ff9943faccf8cc0f7d89',
               'oneway': False},
 '241869917': {'ends': ['2494477546', '2494477646'],
               'nodeChainSHA256': 'ffba3323e642dabead75b4db7a0f841054108671e344a7dd2ac3c72fd4b3ab6b',
               'oneway': False},
 '241869924': {'ends': ['2494477489', '2494477513'],
               'nodeChainSHA256': '80a1da5bbb2d2c3ea624a975960364fa53eca7f555fa3c139fd5cbc27669bee8',
               'oneway': False},
 '241869926': {'ends': ['2494477563', '2494477576'],
               'nodeChainSHA256': 'bd9e3c3b990b526c716ed71ddd795db4521522c278a11af4fe3493e2ab369dd4',
               'oneway': False},
 '241869927': {'ends': ['2494477658', '2494477632'],
               'nodeChainSHA256': 'a61c41c92254cebb17d94e4ea1eaab0132ed21895d2082cfcf8b2919ef9b6988',
               'oneway': True},
 '241869936': {'ends': ['6260984960', '6260984958'],
               'nodeChainSHA256': '82e3a69a80adb33159b14f291188cb5d8c7cc49ef70afbae38db7b8974198085',
               'oneway': False},
 '241869942': {'ends': ['2494477507', '2494477517'],
               'nodeChainSHA256': '6d13ce1e029546a622cfdc8125ac4c6ac5d6357df8e60bdf1a99c55691906883',
               'oneway': False},
 '241869944': {'ends': ['2494477575', '2494477605'],
               'nodeChainSHA256': 'f6b4978e4b1592b93005a05b06c3ab36e25b12aa793b791ba5d7ab0daec58a70',
               'oneway': False},
 '241869946': {'ends': ['2494477505', '2494477622'],
               'nodeChainSHA256': 'd5130a5e2ec0e75f24b05bfe2d0acef363b5a8a1e580f42346bb3e1e58e1b530',
               'oneway': False},
 '241869958': {'ends': ['2494477550', '2494477571'],
               'nodeChainSHA256': 'e85156da398a11911f182459501813712d81ae1f0dca3f70a003026037344f38',
               'oneway': False},
 '241869962': {'ends': ['2494477539', '2494477590'],
               'nodeChainSHA256': 'bae2376becb694ea76639b3ec04ebaee500813e1901a777eb455790b3322b8cb',
               'oneway': False},
 '241869964': {'ends': ['2494477588', '2494477533'],
               'nodeChainSHA256': 'fe1f735e52f064bf90ef121940a2f9ed312deb0ee1167bee813ba23212aba94d',
               'oneway': False},
 '241869968': {'ends': ['2494477510', '2494477605'],
               'nodeChainSHA256': '0f8901611bbc53de46fcebc9b8b19361b424cd537aa34dd006b992a7a854277e',
               'oneway': False},
 '505952613': {'ends': ['4957702862', '12431453975'],
               'nodeChainSHA256': '0eeff64ae6914a58d8ae42f35ab14d805b715c0ce770ba9a54bf39b2ebecb52d',
               'oneway': False},
 '731070739': {'ends': ['6847391530', '6847391530'],
               'nodeChainSHA256': 'b105bbd33eda15ef75ef66f382f822cb8b2e8b4f2069c81541b03d828c392f40',
               'oneway': True},
 '746744790': {'ends': ['6988020146', '6988001032'],
               'nodeChainSHA256': 'bda13649843502ecbb64247ea32f155bb8fd1352bf375684cf75a8ece88552c2',
               'oneway': False},
 '746744795': {'ends': ['6988001041', '6988001047'],
               'nodeChainSHA256': 'd67be2c60c08c97f2346c6a206a28fbdcd8978e1795eb1e9ae34a32b958a6f9e',
               'oneway': False},
 '746744796': {'ends': ['6988001048', '6988001053'],
               'nodeChainSHA256': '706263dfd36b958175478c5bc31185c8a7b868f281daa7c38744e888fbffea38',
               'oneway': False},
 '746744819': {'ends': ['12431453927', '6988020112'],
               'nodeChainSHA256': 'b3f33218dc8cbbc97016535521aba013033fe90d7cfb9b2c55dd7d57c8a0d4d1',
               'oneway': False},
 '746744820': {'ends': ['6988020144', '6988020118'],
               'nodeChainSHA256': '9ff66e3fd4f54958e5aee949a1cc68e2439f68195f335e20cbdb468898d59606',
               'oneway': False},
 '746744821': {'ends': ['6988020119', '6988020123'],
               'nodeChainSHA256': '4a37a947b5743780d92fc671ea2dc54e79b61277892a697a025963318bf96e07',
               'oneway': False},
 '746744822': {'ends': ['6988020107', '6988020129'],
               'nodeChainSHA256': 'baebf9bbddf8f74feee620c4ce4d1692fd9aca46d4a059fdf8d4c6299d67f96b',
               'oneway': False},
 '746744823': {'ends': ['2494477548', '2494409649'],
               'nodeChainSHA256': '783028639ec2aae227fb78654345bba3349536ff5eb844a2ecbe40e203778a6e',
               'oneway': False},
 '746744824': {'ends': ['2494477605', '2494477640'],
               'nodeChainSHA256': 'b453e488bc1d125d9863105752d33cc8d121de33ae4a15a362f064052da77bb7',
               'oneway': False},
 '746744825': {'ends': ['6988020131', '6988020132'],
               'nodeChainSHA256': '5b4c27dc53b2f1d3e3e8c751c5b6672fa0543bb40445e8300122b9c5da297736',
               'oneway': False},
 '746744826': {'ends': ['6988020134', '6988020135'],
               'nodeChainSHA256': '4d811a55ae5901d5a71144cb2d210bc993132b771b31673982296883e5e76b21',
               'oneway': False},
 '746744827': {'ends': ['6988020136', '6988020137'],
               'nodeChainSHA256': '508695d2709961a396731d088c19e280104d67b146a41dc39d5ed3e24b7acf58',
               'oneway': False},
 '746744828': {'ends': ['6988020139', '6988020140'],
               'nodeChainSHA256': '285007dbc5e4c7ca7c1c18e0400112753dbecdb01244c539bee762dcf542849f',
               'oneway': False},
 '746744829': {'ends': ['12487520950', '6988020143'],
               'nodeChainSHA256': '7005ae12cbfeabdbc00a13be7b2381f41ba96216a231748951bcf97ee2c7af72',
               'oneway': False},
 '746744830': {'ends': ['6988020146', '12431453979'],
               'nodeChainSHA256': 'b89f7a8b56bbe6c75935af1cde7d42b483783a4f539ad2137afbd67bd6f18c4c',
               'oneway': False},
 '746744831': {'ends': ['6988001032', '6988020149'],
               'nodeChainSHA256': '09e766d17e17cba28e5686c329553d28f0c8e0f204c29241db3918f0403e1b49',
               'oneway': False},
 '746744832': {'ends': ['6988001032', '6988020156'],
               'nodeChainSHA256': '35f05ca89d0697ecc5edba4b4f31dbafee33d9e1954a9695f76055f883a1c08b',
               'oneway': True},
 '746744833': {'ends': ['6988020157', '6988020158'],
               'nodeChainSHA256': 'cf9b2ac872ffa9fd5af08394855a0bb4caf5853f50afbf9ad04952ef2fd4112b',
               'oneway': False},
 '746744834': {'ends': ['6988020161', '6988020162'],
               'nodeChainSHA256': '4cc0c342a19e14d7894f0ed609b7958e5b3b69083a1dc97dc7d91e6267c14dfb',
               'oneway': False},
 '746744857': {'ends': ['6988020129', '2494477548'],
               'nodeChainSHA256': 'ed3f760918bbf178ce7df30f8c7705fb6a1f8afa8507d64428dd82d5c34ef284',
               'oneway': False},
 '746744858': {'ends': ['6988020129', '2494477553'],
               'nodeChainSHA256': '489212c135d86a25c1306290accd4bdf298132097d737600b52b0f641a81e99c',
               'oneway': False},
 '746744859': {'ends': ['6988020209', '6988020210'],
               'nodeChainSHA256': '39cc7f1040a638041212cbebe987699ed559cd5c19cb3efaee1f0ec5a7a0ad5a',
               'oneway': False},
 '746744860': {'ends': ['6988020211', '6988020212'],
               'nodeChainSHA256': '11d373ad6bdb7adee9fc7225d420f2000a29436ea07766208d690356fa6b0f17',
               'oneway': False},
 '746744861': {'ends': ['6988020214', '6988020217'],
               'nodeChainSHA256': '6fbd216608df2ea183fa1f9f7872f3c82b2d1ee94c32db67b989480241dec9e5',
               'oneway': False},
 '746744868': {'ends': ['6988020232', '2494477554'],
               'nodeChainSHA256': '4bb4df8e01517411185050a696bda928c5f64806244d68b5339525da6876e321',
               'oneway': False},
 '897955611': {'ends': ['6986702422', '6988020144'],
               'nodeChainSHA256': 'f65f70fd0a4c66d2213cadaa3afc06dee892428c215fd9077c23773bdb5169ad',
               'oneway': True}}
for way_id, guard in ROAD_GUARDS.items():
    way = WAYS.get(way_id)
    if way is None or [way['nodes'][0], way['nodes'][-1]] != guard['ends'] or way['oneway'] != guard['oneway'] or __import__('hashlib').sha256(','.join(way['nodes']).encode()).hexdigest() != guard['nodeChainSHA256']:
        raise ValueError('Curated South-west road topology changed: ' + way_id)


def hgeo(point):
    return np.array([*point, 1]) @ HC


def tgeo(point):
    return (TR @ (np.array(point) - TS[0]) + TG[0] * SCALE) / SCALE


def road_match(point, road_ids, limit=180):
    best = None
    for way_id in road_ids:
        way = WAYS[way_id]
        excluded = {tuple(sorted(p)) for p in way.get('excludedSegments', [])}
        blocked = set(way.get('blocked', []))
        for i, pair in enumerate(zip(way['nodes'], way['nodes'][1:])):
            if tuple(sorted(pair)) in excluded or any(n in blocked for n in pair):
                continue
            first = np.array(way['points'][i][::-1])
            last = np.array(way['points'][i + 1][::-1])
            vector = (last - first) * SCALE
            if np.dot(vector, vector) < 1e-6:
                continue
            t = np.clip(np.dot((point - first) * SCALE, vector) / np.dot(vector, vector), 0, 1)
            projected = first + t * (last - first)
            distance = float(np.linalg.norm((projected - point) * SCALE))
            if best is None or distance < best[0]:
                best = distance, projected, way_id, list(pair)
    if best is None or best[0] > limit:
        raise ValueError(f'No bounded parking approach: {road_ids}, distance={best and best[0]}')
    return best


def source_parking(map_id, code):
    return next((p for p in MAPS[map_id]['parkings'] if p['code'] == code), None)


def add(map_id, code, source, label, approach, road_ids, region, historical=False, group=False, bounds=None):
    distance, point, way_id, segment = road_match(approach, road_ids)
    prefix = 'Historical brochure parking layout; current internal aisle positions may differ. ' if historical else ''
    OUT[f'{map_id}:{code}'] = {
        'lat': float(point[1]), 'lon': float(point[0]), 'method': 'bounded-landmark-road-match',
        'scope': 'parking-group-approach' if group else 'parking-approach',
        'parking': code, 'sourceMap': map_id,
        'sourceRevision': 'Cewez brochure historical plan' if historical else 'V1.09-2026',
        'sourcePoint': [round(float(n), 3) for n in source],
        'sourcePointUnits': 'uncropped PDF points',
        'sourcePointAtlasPixels': [round(float((source[0] - (45 if historical else 0)) * 3), 2), round(float((source[1] - (90 if historical else 0)) * 3), 2)],
        'sourceBounds': bounds, 'roadWay': way_id, 'roadSegment': segment,
        'matchDistanceMetres': round(distance, 2), 'lineExact': False,
        'historical': historical, 'region': region,
        'basis': prefix + 'Parking block matched within a bounded landmark region and projected to an identified adjacent existing road segment. Approach only; no surveyed coordinates, exact lines or current access permission claimed.',
        'labelPosition': {'lat': float(label[1]), 'lon': float(label[0]), 'method': 'bounded-landmark-block-position', 'scope': 'parking-block-label', 'basis': prefix + 'Display position within the individually matched block; route retains a separate real-road approach. Not surveyed.'},
    }


def hanze(code, box, road_ids, approach=None, group=False):
    p = source_parking('south', code)
    if p is None:
        return
    x0, y0, x1, y1 = box
    centre = [(x0 + x1) / 2, (y0 + y1) / 2]
    source = [p['x'] / 3, p['y'] / 3]
    add('south', code, source, hgeo(centre), hgeo(approach or centre), road_ids, 'hanze-basin-natie-lane-topology', group=group, bounds=box)


# Individually ordered strips between the basin-edge lane, Natie1 and the south
# distributor. Box coordinates describe matched lane topology in the local
# landmark plane, not the schematic labels' uncorrected X positions.
bottom = '746744795'
north = '746744822'
for code, x0, x1 in [('H10', 407.5, 439.5), ('H11', 376, 407.5), ('H14', 289.6, 317.6), ('H15', 250, 289.6), ('H16', 218.2, 250), ('H17', 186.5, 218.2), ('H18', 155.1, 186.5), ('H19', 123.1, 155.1), ('H20', 104.5, 123.1)]:
    hanze(code, [x0, 582, x1, 634], [bottom], [(x0 + x1) / 2, 582])
hanze('H12', [344.5, 582, 376, 606], [bottom], [360, 582])
hanze('H13', [317.6, 582, 376, 634], ['746744796'], [335, 633], group=True)
for code, x0, x1 in [('HH1', 407.5, 443.5), ('HH2', 376, 407.5), ('HH3', 344.6, 376), ('HH4', 317.6, 344.6), ('HH5', 289.6, 317.6), ('H21', 250, 289.6), ('H22', 218.2, 250), ('H23', 186.5, 218.2)]:
    hanze(code, [x0, 563, x1, 582], [north], [(x0 + x1) / 2, 563])
for code, box in [('H8', [443, 562, 450, 581]), ('H7', [463, 562, 480.4, 581]), ('H6', [480.4, 561, 508.6, 579]), ('H5', [508.6, 555, 547.2, 578]), ('H4', [547.2, 554.5, 577.2, 577.8]), ('H3', [577.2, 554, 607.8, 577.5]), ('H2', [607.8, 553.5, 638, 577.2]), ('H1', [638, 553, 668, 577])]:
    hanze(code, box, ['746744822', '746744857', '746744823', '241869946'], group=True)

# Lower current blocks split the old long rectangular plots. H61 is deliberately
# retained by the main builder's original protected record.
for code, box, roads in [
    ('H60', [250, 634, 289.6, 706], ['746744832', '505952613']),
    ('H61', [218.2, 634, 250, 670], ['746744831']),
    ('H62', [186.5, 634, 218.2, 670], ['746744833']),
    ('H63', [155.1, 634, 186.5, 670], ['746744834']),
    ('H64', [105, 634, 155.1, 670], ['746744790', '746744821']),
    ('H65', [95, 640, 115, 675], ['746744790']),
    ('H71', [218.2, 670, 250, 706], ['746744831']),
    ('H72', [186.5, 670, 218.2, 706], ['746744833']),
    ('H73', [155.1, 670, 186.5, 706], ['746744834']),
    ('H70', [290, 634, 317, 646], ['746744796']),
]:
    hanze(code, box, roads)

# The new southern wedge has no individually mapped internal aisles. Each block
# uses the real shared wedge access at the southern end of the distributor,
# rather than drawing fictional roads between the newly numbered strips.
for code, x0, x1 in [('H80', 270, 289), ('H81', 249, 270), ('H82', 229, 249), ('H83', 209, 229), ('H84', 189, 209), ('H85', 174, 189)]:
    hanze(code, [x0, 710, x1, 735], ['505952613'], [289.5, 735], group=True)

# West-bank groups are matched to their actual lane ladder. Its local X scale
# differs substantially from the basin/Natie drawing: do not extrapolate labels.
for code, box, roads, approach in [
    ('H45', [69, 416, 91, 458], ['746744819'], [91, 438]),
    ('H46', [91, 416, 123, 458], ['746744819', '746744829'], [123, 438]),
    ('H47', [123, 416, 154, 458], ['1349890056'], [138, 415.7]),
    ('H48', [154, 416, 174, 458], ['1349890056'], [154, 416]),
    ('H50', [123, 398, 154, 415], ['1349890056'], [123, 415.6]),
    ('H52', [18, 282, 52, 352], ['1396678610'], [35, 317]),
    ('H53', [69, 282, 123, 415], ['1349890056'], [110, 415.6]),
    ('H54', [174, 399, 390, 415], ['1349890056'], [154, 416]),
    ('H26', [123, 528, 174, 564], ['746744820', '746744822'], [148, 528]),
    ('H28', [123, 458, 154, 528], ['746744829'], [123, 490]),
    ('H29', [91, 458, 123, 528], ['746744829'], [123, 490]),
    # The curved west lane897955611 has no reachable inbound connection in the
    # cached directed graph. Both blocks also border the continuous northern
    # distributor822. Use that real shared compound edge; preserve the curved
    # lane's one-way direction rather than inventing an inbound connection.
    ('H30', [69, 458, 91, 528], ['746744822'], [80, 458]),
    ('H31', [55, 458, 69, 480], ['746744822'], [62, 458]),
    ('HH6', [154, 503, 174, 528], ['746744820'], [164, 528]),
    ('HH7', [154, 458, 174, 503], ['746744822'], [174, 490]),
]:
    hanze(code, box, roads, approach, group=code in ['H30', 'H31', 'H48', 'H50', 'H52', 'H53', 'H54', 'HH6', 'HH7'])
for letter, y, road in [('A', 411.5, '1396678595'), ('B', 402.5, '1396678596'), ('C', 393.5, '1396678597'), ('D', 384.5, '1396678598'), ('E', 375.5, '1396678599'), ('F', 366.4, '1396678600'), ('G', 357.5, '1349890073')]:
    hanze('H51' + letter, [20, y - 4, 64, y + 4], [road], [45, y - 4])

for code, box, roads, approach in [
    ('DRALD', [668, 553, 704, 579], ['746744823'], [683, 553]),
    ('DRWWL', [668, 579, 704, 624], ['241869944'], [665.6, 602]),
    ('DRTOY', [668, 579, 686, 624], ['241869944'], [665.6, 602]),
    ('DRFLX', [686, 579, 704, 624], ['241869944'], [665.6, 613]),
]:
    hanze(code, box, roads, approach, group=True)
if source_parking('south', 'DRS'):
    p = source_parking('south', 'DRS')
    source = [p['x'] / 3, p['y'] / 3]
    add('south', 'DRS', source, hgeo([28, 399]), hgeo([28, 399]), ['1396678610'], 'hanze-west-bank-drs-ladder', group=True)
    OUT['south:DRS']['sourcePoints'] = [[round(pt['x'] / 3, 3), round(pt['y'] / 3, 3)] for pt in p['points']]
    OUT['south:DRS']['approaches'] = []
    for y in [399, 328, 292]:
        _, point, way, segment = road_match(hgeo([25, y]), ['1396678610'])
        OUT['south:DRS']['approaches'].append({'lat': float(point[1]), 'lon': float(point[0]), 'roadWay': way, 'roadSegment': segment})

# Accurate source points read from the source page, correcting the old manually
# indexed catalogue's accumulating row drift. Coordinates remain PDF points.
TOYOTA_POINTS = json.loads((ROOT / 'scripts/toyota-source-points.json').read_text(encoding='utf-8'))['points']

TOYOTA_ROADS = {
    'north': ['731070739', '241869936', '241869946', '241869944', '241869927', '746744824', '241869964'],
    'central': ['241869946', '241869944', '241869968', '241869958', '241869962', '241869964', '241869917', '241869926', '746744824', '746744858', '746744859', '746744860', '746744861', '746744868'],
    'south': ['241869916', '241869924', '241869942', '746744795', '746744796', '746744825', '746744826', '746744827', '746744828', '746744830', '746744831', '746744832', '505952613'],
}
for code, source in TOYOTA_POINTS.items():
    region = 'north' if source[1] < 230 else 'south' if source[1] > 530 else 'central'
    raw = tgeo(source)
    add('toyota', code, source, raw, raw, TOYOTA_ROADS[region], 'toyota-' + region + '-windmill-block-match', historical=True, group=True)

# Three old Hanze-only strips adjoin the west basin bend between HH6, H28-31
# and H19/20. The current plan revises this compound into the larger H26 group.
# Retain historical provenance and share its verified group access; do not
# pretend the old partitions remain individual current internal roads.
for code, source, box, road, approach in [
    ('H24', [231, 657], [154, 528, 174, 564], '746744822', [174, 550]),
    ('H25', [188, 675], [123, 528, 154, 548], '746744829', [123, 539]),
    ('H27', [175, 731], [123, 548, 154, 564], '746744822', [148, 564]),
]:
    p = source_parking('hanze', code)
    if p:
        x0, y0, x1, y1 = box
        add('hanze', code, source, hgeo([(x0 + x1) / 2, (y0 + y1) / 2]), hgeo(approach), [road], 'historical-hanze-basin-bend-compound', historical=True, group=True, bounds=box)

result = {
    'version': 1,
    'source': 'ICO SIT V1.09-2026, Cewez ICO brochure pages 24/25, OSM real access lanes',
    'sourceUrls': ['https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf', 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'],
    'sourcePointUnits': 'Uncropped PDF points; sourcePointAtlasPixels separately uses the public atlas crop/scale.',
    'controls': {'hanze': HANZE_CONTROLS, 'toyota': TOYOTA_CONTROLS},
    'independentCheck': {'osmWay': '240813032', 'landmark': 'Bridgestone warehouse northern edge adjacent to Toyota I/J field', 'source': [395, 534], 'boundaryResidualMetres': 7.52, 'westernEdgeSchematicOffsetMetres': 44, 'basis': 'Northern edge lies within 7.52m of the independently turbine-matched source point; not a fit input. The western edge differs by about44m, confirming this historical drawing supports block approaches rather than surveyed block corners.'},
    'regions': [{'id': 'hanze-basin-natie-lane-topology', 'method': 'Individually ordered road strips and named basin/Natie1 landmarks; separate west-bank ladder.'}, {'id': 'toyota', 'method': 'Local two-windmill reflected similarity, independent Bridgestone northern-edge check, and bounded north/central/south service-road lists.', 'historical': True}],
    'destinations': OUT,
}
target = ROOT / 'scripts/geo/south-west-destinations.json'
target.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(f'{len(OUT)} bounded South-west/Toyota approaches; ' + ', '.join(f'{m}: {sum(k.startswith(m + ":") for k in OUT)}' for m in ['south', 'toyota', 'hanze']))
