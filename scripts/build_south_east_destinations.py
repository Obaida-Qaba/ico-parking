"""Curated South east parking approaches, bounded by identified road junctions.

The ICO plan is schematic. Each parcel has its own four-corner correspondence;
no coordinates are extrapolated from the central warehouse affine transform.
The source rectangle is the printed parking footprint, not a claim that every
road inside the OSM parcel remains open. Routes end on a separately checked
boundary segment. Regenerate after reviewing a changed plan or OSM lane chain.
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
OUT, REGIONS = {}, []


def node(n):
    return str(n) if len(str(n)) > 4 else '249451' + str(n)


def lane(way_id, start, end, oneway=False):
    """Require the matched boundary chain, its direction, and drivable edges."""
    way_id, start, end = str(way_id), node(start), node(end)
    w = WAYS[way_id]
    if w['oneway'] != oneway:
        raise ValueError(f'Lane direction changed: {way_id}')
    a, b = w['nodes'].index(start), w['nodes'].index(end)
    step = 1 if b > a else -1
    chain = w['nodes'][a:b + step:step] if b + step >= 0 else w['nodes'][a::step]
    if not chain or chain[-1] != end:
        raise ValueError(f'Missing boundary chain: {way_id}, {start}, {end}')
    excluded = {tuple(sorted(pair)) for pair in w.get('excludedSegments', [])}
    if any(n in w.get('blocked', []) for n in chain) or any(tuple(sorted(pair)) in excluded for pair in zip(chain, chain[1:])):
        raise ValueError(f'Boundary uses a closed road: {way_id}')
    return {'way': way_id, 'nodes': chain, 'oneway': oneway}


def along(boundary, fraction):
    chain = boundary['nodes']
    lengths = [math.hypot((NODES[b][0] - NODES[a][0]) * 111320,
                          (NODES[b][1] - NODES[a][1]) * 69800) for a, b in zip(chain, chain[1:])]
    remainder = sum(lengths) * max(0, min(1, fraction))
    for i, length in enumerate(lengths):
        if remainder <= length or i == len(lengths) - 1:
            t = remainder / length
            a, b = NODES[chain[i]], NODES[chain[i + 1]]
            return [a[j] + t * (b[j] - a[j]) for j in range(2)], chain[i:i + 2]
        remainder -= length
    raise ValueError('Empty boundary')


def region(name, bounds, corners, boundaries, evidence):
    """NW, NE, SE, SW source corners correspond to physical junctions."""
    corners = [node(n) for n in corners]
    edges = []
    for b in boundaries:
        if isinstance(b[0], (list, tuple)):
            parts = [lane(*part) for part in b]
            chain = parts[0]['nodes'][:]
            for part in parts[1:]:
                if chain[-1] != part['nodes'][0]:
                    raise ValueError('Boundary parts are disconnected: '+name)
                chain += part['nodes'][1:]
            edges.append({'way':None, 'nodes':chain, 'parts':parts})
        else:
            edges.append(lane(*b))
    expected = [(corners[0], corners[1]), (corners[1], corners[2]),
                (corners[3], corners[2]), (corners[0], corners[3])]
    for boundary, pair in zip(edges, expected):
        if (boundary['nodes'][0], boundary['nodes'][-1]) != pair:
            raise ValueError(f'Parcel boundary order mismatch: {name}')
    r = {'id': name, 'sourceBounds': bounds, 'cornerNodes': corners,
         'cornerCoordinates': [NODES[n] for n in corners], 'boundaryLanes': edges,
         'model': 'bounded-bilinear-parcel', 'evidence': evidence}
    REGIONS.append(r)
    return r


def add(code, r, edge='south', source_index=0, fraction=None, source_override=None):
    p = PARKINGS.get(code)
    if p is None and source_override is None:
        raise ValueError(f'Parking is absent from the current source index: {code}')
    source = source_override or [p['points'][source_index]['x'] / 3, p['points'][source_index]['y'] / 3]
    x0, y0, x1, y1 = r['sourceBounds']
    u, v = (source[0] - x0) / (x1 - x0), (source[1] - y0) / (y1 - y0)
    if not (-.05 <= u <= 1.05 and -.05 <= v <= 1.05):
        raise ValueError(f'Source point outside matched parcel: {code}: {source}')
    u, v = max(0, min(1, u)), max(0, min(1, v))
    weights = [(1-u)*(1-v), u*(1-v), u*v, (1-u)*v]
    label = [sum(c[j] * w for c, w in zip(r['cornerCoordinates'], weights)) for j in range(2)]
    edge_index = ['north', 'east', 'south', 'west'].index(edge)
    boundary = r['boundaryLanes'][edge_index]
    if boundary['way'] is None:
        raise ValueError('Select an individually matched approach road, not a composite boundary')
    point, segment = along(boundary, fraction if fraction is not None else u if edge in ['north', 'south'] else v)
    OUT['south:' + code] = {
        'lat': point[0], 'lon': point[1], 'method': 'landmark-junction-match',
        'scope': 'parking-group-approach' if p and len(p['points']) > 1 else 'parking-approach',
        'parking': code, 'sourceMap': 'south', 'sourceRevision': 'V1.09-2026',
        'roadWay': boundary['way'], 'roadSegment': segment, 'lineExact': False,
        'sourcePoint': source, 'sourceBounds': r['sourceBounds'], 'region': r['id'],
        'basis': r['evidence'] + ' The route ends on the matched access road, not at a surveyed parking line.',
        'junctionMatch': {'cornerNodes': r['cornerNodes'], 'boundaryLanes': r['boundaryLanes']},
        'labelPosition': {'lat': label[0], 'lon': label[1], 'method': 'bounded-parcel-position',
                          'scope': 'parking-block-label', 'sourcePoint': source,
                          'basis': 'Position inside the individually identified parking parcel; display label only, not a surveyed line.'}
    }


GRID_EVIDENCE = ('The VPC landmark, six lettered column boundaries, the continuous A/B divider, '
                 'and the K.507-K.510 quay identify this bounded parcel by road-junction topology. '
                 'Its source footprint is matched independently of the central affine fit.')

# A/B row: ordered column boundaries are anchored by VPC and the eastern quay
# perimeter. The E/F compound has internal OSM aisles not drawn in the plan;
# approaches use only its clearly printed top/bottom boundary roads.
cols = [
    ('F', [719.4, 761.2], [1769,1781,1783,1771,1772,1785], '241873299','241873298'),
    ('E', [761.2, 812.9], [1781,1799,1813,1783,1785,1824], '241873298','241873296'),
    ('D', [819.6, 855.4], [1799,1843,1858,1813,1824,1866], '241873296','241873287'),
    ('C', [863.6, 932.2], [1843,1875,1884,1858,1866,1888], '241873287','746641412'),
    ('B', [938.6, 983.8], [1875,1905,1916,1884,1888,6140154458], '746641412','1349890080'),
]
for letter, xs, ns, west, east in cols:
    nw,ne,se,sw,qw,qe = ns
    b = region('east-'+letter.lower()+'-b', [*xs[:1],359.5,xs[1],385.8], [nw,ne,se,sw],
               [('241873302',nw,ne), (east,ne,se), ('392480112',sw,se), (west,nw,sw)], GRID_EVIDENCE)
    a = region('east-'+letter.lower()+'-a', [xs[0],389.4,xs[1],417.7], [sw,se,qe,qw],
               [('392480112',sw,se), (east,se,qe), ('746582115',qw,qe), (west,sw,qw)], GRID_EVIDENCE)
    add(letter+'B1',b)
    add(letter+'A1',a,'north')
    # Quay codes have a distinct printed position beyond the A row. The actual
    # quay edge follows the parcel's independently identified southern road.
    q = dict(a, sourceBounds=[xs[0],417.0,xs[1],423.6])
    add('BK'+letter,q,'south')
    if letter == 'D': add('TP7',a,'north')

ab = region('east-a-b', [990.2,359.7,1032.1,385.8], [1905,1943,1948,1916],
            [('241873302',1905,1943), ('392480112',1943,1948), ('392480112',1916,1948), ('1349890080',1905,1916)], GRID_EVIDENCE)
for code in ['AB1','AB2','AB3']: add(code,ab,'west')
aa = region('east-a-a', [990.2,389.5,1026.1,415.6], [1916,1948,6986702534,6140154458],
            [('392480112',1916,1948), ('746582115',1948,6986702534), ('746582115',6140154458,6986702534), ('1349890080',1916,6140154458)], GRID_EVIDENCE)
for code, source in [('AA1',[1010.30,410.45]),('AA2',[1010.20,394.40])]:
    add(code,aa,'west',source_override=source)
add('TP6',aa,'west')
add('BKA',dict(aa,sourceBounds=[990.2,417.0,1026.1,423.6]),'south')

# Three C strips are individually observable in both the plan and the roads.
# Match them by ordinal lane topology, rather than extrapolating a scale from
# the neighbouring multi-part CC2/large EC1 compound.
bands = [
    ('3',[329.8,335.8], [1869,1891,6986702532,6986702531],
     [('746582112',1869,1891),('1349890080',1891,6986702532),('746582108',6986702531,6986702532),('746582111',1869,6986702531)],
     [1891,1933,6986702530,6986702532],
     [('746641410',1891,1933),('392480112',1933,6986702530),('746582108',6986702532,6986702530),('1349890080',1891,6986702532)]),
    ('2',[339.0,345.0], [6986702531,6986702532,1895,1872],
     [('746582108',6986702531,6986702532),('1349890080',6986702532,1895),('241873270',1872,1895),('746582111',6986702531,1872)],
     [6986702532,6986702530,1938,1895],
     [('746582108',6986702532,6986702530),('392480112',6986702530,1938),('241873270',1895,1938),('1349890080',6986702532,1895)]),
    ('1',[348.2,354.2], [1872,1895,1905,1875],
     [('241873270',1872,1895),('1349890080',1895,1905),('241873302',1875,1905),('746641412',1872,1875)],
     [1895,1938,1943,1905],
     [('241873270',1895,1938),('392480112',1938,1943),('241873302',1905,1943),('1349890080',1895,1905)]),
]
for number, ys, bcorners, blanes, acorners, alanes in bands:
    for letter,xs,corners,lanes in [('B',[938.6,983.8],bcorners,blanes), ('A',[990.2,1035.5],acorners,alanes)]:
        r = region('east-'+letter.lower()+'-c'+number,[xs[0],ys[0],xs[1],ys[1]],corners,lanes,GRID_EVIDENCE)
        add(letter+'C'+number,r)

for code,bounds,corners,lanes in [
    ('CC1',[863.4,348.2,932.1,354.9],[1826,1872,1875,1843],
     [('746582120',1826,1872),('746641412',1872,1875),('241873302',1843,1875),('241873287',1826,1843)]),
    ('DC1',[819.8,348.2,855.9,354.9],[6986702547,1826,1843,1799],
     [('746582120',6986702547,1826),('241873287',1826,1843),('241873302',1799,1843),('241873296',6986702547,1799)]),
    ('EC1',[719.4,328.9,812.8,354.9],[6986702618,6986702597,1799,1769],
     [('1228590688',6986702618,6986702597,True),('241873296',6986702597,1799),('241873302',1769,1799),('241873299',6986702618,1769)]),
]:
    r=region('east-'+code.lower(),bounds,corners,lanes,GRID_EVIDENCE)
    add(code,r)

# The A/B mid-line is a painted parcel divider in these upper rows, not an
# invented north/south street. Keep the two parking labels inside one compound
# and route each to its own position on the existing horizontal access road.
for row,bounds,corners,lanes,edge in [
    ('D',[938.6,301.7,1039.9,325.2],[1857,1913,1921,1865],
     [('241873282',1857,1913),('392480112',1913,1921),('241873278',1865,1921),('241873267',1857,1865)],'north'),
    ('E',[938.6,268.9,1044.0,292.3],[1842,6986702477,1913,1857],
     [[('241873292',1842,1894),('746582093',1894,6986702477)],('392480112',6986702477,1913),('241873282',1857,1913),('241873267',1842,1857)],'south'),
    ('F',[938.6,237.1,1048.0,265.1],[1830,1892,6986702477,1842],
     [('241873290',1830,1892),('392480112',1892,6986702477),[('241873292',1842,1894),('746582093',1894,6986702477)],('241873267',1830,1842)],'north'),
    ('G',[940.7,205.2,1052.8,232.5],[1819,1887,1892,1830],
     [('392480112',1819,1887),('392480112',1887,1892),('241873290',1830,1892),('241873267',1819,1830)],'south'),
]:
    r=region('east-ab-'+row.lower(),bounds,corners,lanes,
             'The VPC-side access spine, continuous eastern quay perimeter, and ordered cross roads identify this A/B compound. The printed A/B divider is not treated as a road.')
    for letter in 'AB':add(letter+row+'1',r,edge)

# Direct quay-side bands follow the real perimeter between the corresponding
# individually matched parking rows. Their source labels describe one linear
# berth band, so they need a chain correspondence rather than a rectangle fit.
def add_road_band(code, source_y, way, start, end, description):
    p=PARKINGS[code]
    source=[p['x']/3,p['y']/3]
    fraction=(source[1]-source_y[0])/(source_y[1]-source_y[0])
    if not -.05 <= fraction <= 1.05:
        raise ValueError('Quay label outside matched row span: '+code)
    boundary=lane(way,start,end)
    point,segment=along(boundary,fraction)
    OUT['south:'+code]={
        'lat':point[0], 'lon':point[1], 'method':'landmark-junction-match',
        'scope':'parking-approach','parking':code,'sourceMap':'south','sourceRevision':'V1.09-2026',
        'roadWay':str(way),'roadSegment':segment,'lineExact':False,'sourcePoint':source,
        'region':'east-quay-'+code.lower(), 'sourceSpan':source_y,
        'basis':description+' The approach stays on the actual perimeter road; berth positions and parking lines are not surveyed.',
        'junctionMatch':{'boundaryLanes':[boundary]},
        'labelPosition':{'lat':point[0],'lon':point[1],'method':'matched-quay-road-band','scope':'parking-block-label','sourcePoint':source,
                         'basis':'Label at the matched quay access-road band, not an exact waterside parking line.'}}

QUAY_EVIDENCE='The ordered K.505/K.503 berth frontage and adjacent A/B/C/D/E/F parking compounds identify this eastern quay road band.'
for code,ys,way,start,end in [
    ('BWA',[389.5,415.6],'746582115',1948,6986702534),
    ('BWB',[359.7,385.8],'392480112',1943,1948),
    ('BWC',[329.8,354.2],'392480112',1933,1943),
    ('BWD',[301.7,325.2],'392480112',1913,1921),
    ('BWE',[268.9,292.3],'392480112',6986702477,1913),
    ('BWF',[210.3,262.0],'392480112',1892,6986702477),
    ('MAX',[210.3,262.0],'392480112',1892,6986702477),
]:add_road_band(code,ys,way,start,end,QUAY_EVIDENCE)

# VPC forecourt: the west DE1 strip and west CE1 strip have individually
# identifiable one-way dividers in the OSM access-road ladder. Repeated codes
# retain an approach to this confirmed sub-block, not a promise for every lane.
for code,bounds,corners,lanes,idx in [
    ('DE1',[820.3,269.3,837.9,286.7],[1782,12487521003,12487521004,6986702540],
     [('931027303',1782,12487521003),('1349890085',12487521003,12487521004,True),('746582117',6986702540,12487521004),('241873296',1782,6986702540)],1),
    ('CE1',[859.0,269.3,873.6,286.8],[12487521001,12487520999,12487521000,12487521002],
     [('931027303',12487521001,12487520999),('1349890083',12487520999,12487521000,True),('746582117',12487521002,12487521000),('1349890084',12487521001,12487521002,True)],0),
]:
    r=region('east-vpc-'+code.lower(),bounds,corners,lanes,
             'The named VPC building, its north forecourt and the sequence of one-way forecourt dividers identify this individual strip of the repeated parking code.')
    add(code,r,'north',source_index=idx)

for code,bounds,corners,lanes,edge in [
    ('EE1',[719.4,268.7,812.8,295.4],[1763,1782,11393709897,11393709899],
     [('931027303',1763,1782),('241873296',1782,11393709897),('1228590686',11393709899,11393709897,True),('241873299',1763,11393709899)],'north'),
    ('FD1',[719.4,299.1,761.2,325.1],[11393709899,11393709898,6986702598,6986702618],
     [('1228590686',11393709899,11393709898,True),('241873298',11393709898,6986702598),('1228590688',6986702618,6986702598,True),('241873299',11393709899,6986702618)],'south'),
    ('ED1',[771.0,299.1,812.8,325.1],[11393709898,11393709897,6986702597,6986702598],
     [('1228590686',11393709898,11393709897,True),('241873296',11393709897,6986702597),('1228590688',6986702598,6986702597,True),('241873298',11393709898,6986702598)],'north'),
]:
    r=region('east-'+code.lower(),bounds,corners,lanes,
             'The FDL-side parcel, ordered F/E/D access spines and VPC forecourt identify this bounded compound. Internal OSM parking aisles are not used as invented shortcuts through the printed parcel.')
    add(code,r,edge)

# CF1's westbound north side is independently distinctive. It is the rectangle
# immediately south of the MVO entry facilities, west of the B-column spine,
# and north of the VPC forecourt cross road. The source's west-pointing arrow
# agrees with the actual one-way northern boundary 241873283.
cf=region('east-cf1',[855.2,242.1,930.3,264.9],[1789,1853,1860,1796],
          [('241873283',1789,1853,True),('241873267',1853,1860),('931027303',1796,1860),('746582122',1789,1796)],
          'The MVO entrance facilities, westbound northern boundary, B-column access spine and VPC forecourt cross road identify the bounded CF1 parcel independently of schematic scale.')
add('CF1',cf,'south')
add_road_band('CG1',[226.9,237.0],'241873267',12487520977,12487520979,
              'CG1 is the small entrance-side annex immediately north of CF1, beside the B-column spine between the northern cross road and the MVO-roundabout access junction.')

# The FX label boxes straddle the MVO fence in the drawing. Public-road
# proximity does not establish access to these terminal parking strips. Keep
# them unresolved until the correct internal approach is independently matched.
UNRESOLVED_FX=[{'code':c,'sourceMap':'south','reason':'The source label straddles the terminal fence; the public MVO road does not establish parking access. Correct internal access lane is not yet independently matched.'} for c in ['FFX','EFX','DFX']]


if __name__ == '__main__':
    target = ROOT / 'scripts/geo/south-east-destinations.json'
    target.write_text(json.dumps({'destinations':OUT,'regions':REGIONS,'lineExact':False,
                                 'source':'ICO South V1.09-2026; individually matched road-junction parcels','unresolved':UNRESOLVED_FX},indent=2),encoding='utf-8')
    print(len(OUT),'South east approaches in',len(REGIONS),'bounded parcels')
