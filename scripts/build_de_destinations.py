"""Individually match the supported South E cells; retain explicit D evidence gaps.

The ZOUT warehouse pins the three E rows independently of the central C-row
fit. Each E cell uses actual bordering road junctions. The current source has
four D strips while the reviewed road/imagery ladder below ZOUT has only three
bands before the existing C3 boundary. Do not invent a fourth physical lane or
quietly shift either catalogue into the other: D remains explicitly unresolved.
"""
from pathlib import Path
import json

from build_south_east_destinations import region, add, OUT, REGIONS, PARKINGS


ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = set(OUT)
START_REGIONS = len(REGIONS)

PROVENANCE = {
    'source': 'ICO SIT V1.09-2026',
    'sourceUrl': 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
    'sourceCache': 'scripts/sources/south2026.pdf',
    'sourcePage': 1,
    'sourceUnits': 'Uncropped PDF points before the atlas 3x rendering',
    'sourceFootprints': 'Grey parking rectangles and the visible bold parking labels, visually checked against the rendered PDF.',
    'roadSource': 'public/roads.json; OpenStreetMap junction and road-edge geometry',
    'imagery': {
        'url': 'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms',
        'layer': 'Ortho',
        'request': {'version': '1.3.0', 'crs': 'EPSG:4326',
                    'bbox': [51.2957, 3.2200, 51.3059, 3.2317],
                    'width': 1300, 'height': 1810},
        'reviewed': '2026-11-18',
        'flightDate': None,
        'limitation': 'Flight date was not returned by the queried flight-contour service. Imagery cannot establish live access or prove the revised individual D partitions.',
    },
    'controls': [
        {'landmark': 'ZOUT warehouse', 'osmWay': '1349890062',
         'sourceBounds': [616.13, 275.81, 631.69, 294.49],
         'geoCentre': [51.30135505, 3.22475433],
         'role': 'Its north/south extent pins the three E rows and southern two-way road 746582074.'},
        {'landmark': 'MBZ warehouse', 'osmWay': '1349890098',
         'sourceBounds': [616.22, 254.37, 628.92, 267.56],
         'geoCentre': [51.30117167, 3.22399553],
         'role': 'Independently identifies the northern OS/E distributor and the curved GE northern forecourt.'},
        {'landmark': 'OS banks and western DRL corridor',
         'role': 'Identify the I/J/K/L column order and the western ends of all three E cross aisles.'},
    ],
    'limitation': 'Parking boundary-road approaches and interior display labels only. No global affine extrapolation, surveyed entrance, exact line or live operational access is claimed.',
}

# North -> south nodes are separately identified at every column boundary.
# Three physical E bands run 897960053 / 746582126 / 746582140 / 746582074.
# The last two cross aisles terminate at the ZOUT-side road, independently
# confirming the warehouse-based row order instead of borrowing the C scale.
COLUMNS = [
    ('I', [564.69, 606.32],
     [6986702454, 6986702580, 6986702640, 6986702455],
     [6986702468, 6986702579, 6986702638, 2494511748],
     '746582086', '746582127'),
    ('J', [513.06, 554.69],
     [6986702470, 6986702581, 6986702641, 6986702471],
     [6986702454, 6986702580, 6986702640, 6986702455],
     '746582091', '746582086'),
    ('K', [461.44, 503.07],
     [6986702461, 6986702582, 6986702642, 6986702462],
     [6986702470, 6986702581, 6986702641, 6986702471],
     '746582088', '746582091'),
    ('L', [409.81, 451.44],
     [6986702441, 6986702572, 6986702639, 6986702386],
     [6986702461, 6986702582, 6986702642, 6986702462],
     '746582075', '746582088'),
]
ROWS = [
    ('3', [275.82, 280.51], '897960053', False, '746582126', True),
    ('2', [282.90, 287.59], '746582126', True, '746582140', True),
    ('1', [289.98, 294.67], '746582140', True, '746582074', False),
]

for letter, xs, west_nodes, east_nodes, west, east in COLUMNS:
    for i, (number, ys, north, north_oneway, south, south_oneway) in enumerate(ROWS):
        nw, ne = west_nodes[i], east_nodes[i]
        sw, se = west_nodes[i + 1], east_nodes[i + 1]
        # The source E1 rectangles have a slightly shorter eastern edge.
        x1 = xs[1] - (0.05 if letter in 'IJ' else 0.06) if number == '1' else xs[1]
        matched = region(
            'south-' + letter.lower() + '-e' + number,
            [xs[0], ys[0], x1, ys[1]], [nw, ne, se, sw],
            [(north, nw, ne, north_oneway), (east, ne, se),
             (south, sw, se, south_oneway), (west, nw, sw)],
            'The three E strips lie immediately below the OS banks and west '
            'of the identifiable ZOUT warehouse. The warehouse extent and '
            'four independently identified cross aisles establish the E3/E2/E1 '
            'order; the ' + letter + ' column is bounded by its own actual '
            'access-road junctions. This source footprint is matched '
            'independently of the central C-row scale.',
        )
        matched['provenance'] = PROVENANCE
        add(letter + 'E' + number, matched, 'south')

# GE2 is north of the real curved divider 746582130, immediately east of
# ZOUT. GE1 is the narrower southern strip between that divider and 746582074.
# These cells have their own geometry and are not copies of the I-L grid.
ge2 = region(
    'south-ge2', [634.17, 270.11, 709.57, 282.98],
    [6986702548, 2494511763, 6986702591, 6986702589],
    [('931027303', 6986702548, 2494511763),
     ('241873299', 2494511763, 6986702591),
     ('746582130', 6986702589, 6986702591, True),
     ('746582128', 6986702548, 6986702589, True)],
    'The visible GE2 rectangle is east of ZOUT and south of the POS/MBZ '
    'forecourt. Its curved northern road, F/G eastern access spine, actual '
    'southern divider 746582130 and short ZOUT-side western aisle identify '
    'this individual parking compound. Internal parking lanes are not '
    'invented as source subdivisions.',
)
ge2['provenance'] = PROVENANCE
add('GE2', ge2, 'north')

ge1 = region(
    'south-ge1', [634.17, 286.31, 709.57, 295.32],
    [6986702589, 6986702591, 2494511766, 2494511754],
    [('746582130', 6986702589, 6986702591, True),
     ('241873299', 6986702591, 2494511766),
     ('746582074', 2494511754, 2494511766),
     ('746582130', 6986702589, 2494511754, True)],
    'The visible bold GE1 label occupies the southern rectangle east of '
    'ZOUT. Its actual northern divider 746582130 turns at the western end '
    'onto the southern two-way road 746582074; the F/G access spine closes '
    'the eastern edge. This is a separate bounded strip from GE2.',
)
ge1['provenance'] = PROVENANCE

# Illustrator retains an obsolete regular-font GE1 label beneath the new
# GE2 fill. It is extracted as text but is invisible in the rendered source.
# Select the one visible lower GE1 point by its reviewed footprint, so a later
# atlas cleanup can remove the hidden point without changing this match.
ge1_bounds = ge1['sourceBounds']
ge1_visible = [i for i, point in enumerate(PARKINGS['GE1']['points'])
               if ge1_bounds[0] < point['x'] / 3 < ge1_bounds[2]
               and ge1_bounds[1] < point['y'] / 3 < ge1_bounds[3]]
if len(ge1_visible) != 1:
    raise ValueError('Visible GE1 source label changed; recheck the rendered source')
add('GE1', ge1, 'south', source_index=ge1_visible[0])
OUT['south:GE1']['scope'] = 'parking-approach'
OUT['south:GE1']['sourceLabelReview'] = {
    'visibleSourceIndex': ge1_visible[0],
    'ignoredExtractedIndices': [i for i in range(len(PARKINGS['GE1']['points'])) if i not in ge1_visible],
    'reason': 'The old regular-font GE1 point beneath the GE2 fill is overpainted and not a second visible parking label.',
}

D_BOUNDS = {'G': [658.08, 709.82], 'H': [616.34, 658.08],
            'I': [564.69, 606.32], 'J': [513.06, 554.69],
            'K': [461.44, 503.07], 'L': [409.81, 451.44]}
D_ROWS = {'4': [299.13, 303.82], '3': [306.21, 310.90],
          '2': [313.28, 317.97], '1': [320.36, 325.05]}
UNRESOLVED = []
for letter, xs in D_BOUNDS.items():
    for number, ys in D_ROWS.items():
        UNRESOLVED.append({
            'code': letter + 'D' + number,
            'sourceMap': 'south', 'sourceRevision': 'V1.09-2026',
            'sourceBounds': [xs[0], ys[0], xs[1], ys[1]],
            'reason': 'The current source prints four D strips below the ZOUT-side two-way aisle, but the reviewed road/orthophoto ladder has only three physical bands between 746582074 and the existing C3 northern boundary 1228590688/746582137. The two internal boundaries are 1228590689/746582139 and 746582138. A distinct physical cell or revised subdivision for this code is not independently confirmed. No fourth road, shifted C3 assignment or terminal-centre point is invented.',
            'neededEvidence': 'Current site confirmation or newer georeferenced imagery identifying all four revised D partitions and their actual access lanes.',
        })

DESTINATIONS = {key: point for key, point in OUT.items() if key not in PREVIOUS}
EXPECTED = {'south:' + letter + 'E' + number for letter in 'IJKL' for number in '123'} | {'south:GE1', 'south:GE2'}
if set(DESTINATIONS) != EXPECTED:
    raise ValueError('D/E builder must export exactly the fourteen independently supported E cells')

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/de-destinations.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({
        'destinations': DESTINATIONS, 'regions': REGIONS[START_REGIONS:],
        'lineExact': False, 'provenance': PROVENANCE, 'unresolved': UNRESOLVED,
    }, indent=2), encoding='utf-8')
    print(len(DESTINATIONS), 'independently matched E approaches;', len(UNRESOLVED), 'explicit D partition evidence gaps')
