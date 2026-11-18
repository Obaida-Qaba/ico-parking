"""Match the four northern OS parking banks to their own road-junction cells.

The barcode-shaped car banks above IE3/JE3/KE3/LE3 in the September 2026
source are separate from the central C rows. Their outer perimeter, column
access roads and MBZ/ZOUT end identify each bank independently. Bounds below
are source drawing coordinates, not surveyed dimensions or an affine fit.
"""
from pathlib import Path
import json

from build_south_east_destinations import region, add, OUT, REGIONS


ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = set(OUT)
START_REGIONS = len(REGIONS)

PROVENANCE = {
    'source': 'ICO SIT V1.09-2026',
    'sourceUrl': 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
    'sourceCache': 'scripts/sources/south2026.pdf',
    'sourcePage': 1,
    'sourceCoordinates': 'PDF points before the 3x atlas rendering',
    'roadSource': 'public/roads.json; OpenStreetMap road-junction geometry',
    'imageryCrossCheck': 'Official Flemish orthophoto, OMWRGBMRVL WMS Ortho layer',
    'imageryUrl': 'https://geo.api.vlaanderen.be/OMWRGBMRVL/wms',
    'reviewed': '2026-11-18',
    'limitation': 'Approach roads and display labels only; not surveyed entrances, parking lines or live operational access.',
}

# Every entry has its own source bounds and NW, NE, SE, SW physical corners.
# North / east / south / west boundary chains are checked by region(): node
# membership, contiguous connectivity, expected one-way state and closures.
# The south boundary is the real access aisle shared with the E3-side row;
# labels are interpolated separately inside the individual parking bank.
CELLS = [
    {
        'code': 'IOS',
        'bounds': [560.0, 237.0, 607.5, 271.7],
        'corners': [6986702453, 6986702430, 6986702452, 6986702454],
        'boundaries': [
            ('746582127', 6986702453, 6986702430),
            ('746582084', 6986702430, 6986702452, True),
            ('897960053', 6986702454, 6986702452),
            ('746582086', 6986702453, 6986702454),
        ],
        'evidence': (
            'IOS is the northern car bank above IE3, immediately west of the '
            'MBZ/ZOUT facilities. Its western I/J column road, outer perimeter '
            'and separate eastern one-way aisle identify this bounded cell. '
            'The eastern boundary is 746582084; the MBZ loop farther east is '
            'not included.'
        ),
    },
    {
        'code': 'JOS',
        'bounds': [508.0, 237.0, 555.5, 271.7],
        'corners': [6986702431, 6986702453, 6986702454, 6986702470],
        'boundaries': [
            ('746582127', 6986702431, 6986702453),
            ('746582086', 6986702453, 6986702454),
            ('897960053', 6986702470, 6986702454),
            ('746582091', 6986702431, 6986702470),
        ],
        'evidence': (
            'JOS is the northern car bank above JE3, between the J/K and I/J '
            'column roads. The two independently matched column junctions '
            'on the outer perimeter and the E3-side access aisle identify '
            'this cell in the ladder west of MBZ/ZOUT.'
        ),
    },
    {
        'code': 'KOS',
        'bounds': [456.4, 237.0, 504.0, 271.7],
        'corners': [6986702432, 6986702431, 6986702470, 6986702461],
        'boundaries': [
            ('746582127', 6986702432, 6986702431),
            ('746582091', 6986702431, 6986702470),
            ('897960053', 6986702461, 6986702470),
            ('746582088', 6986702432, 6986702461),
        ],
        'evidence': (
            'KOS is the northern car bank above KE3, between the K/L and J/K '
            'column roads. Its own four junctions on the outer perimeter '
            'and E3-side access aisle identify this cell, independently '
            'of the central C-row scale.'
        ),
    },
    {
        'code': 'LOS',
        'bounds': [404.5, 237.0, 452.5, 271.7],
        'corners': [6986702448, 6986702432, 6986702461, 12487521007],
        'boundaries': [
            ('746582127', 6986702448, 6986702432),
            ('746582088', 6986702432, 6986702461),
            ('897960053', 12487521007, 6986702461),
            ('746582127', 6986702448, 12487521007),
        ],
        'evidence': (
            'LOS is the westernmost northern car bank above LE3. The K/L '
            'column road and the actual western perimeter bend at junction '
            '6986702448 distinguish it from KOS and the DRL corridor. Its '
            'western boundary follows the real curved perimeter to '
            '12487521007; no rectangular corner or road is invented.'
        ),
    },
]

for cell in CELLS:
    matched = region(
        'south-' + cell['code'].lower() + '-bank',
        cell['bounds'], cell['corners'], cell['boundaries'],
        cell['evidence'],
    )
    matched['provenance'] = PROVENANCE
    add(cell['code'], matched, 'south')

destinations = {key: value for key, value in OUT.items() if key not in PREVIOUS}
expected = {'south:' + cell['code'] for cell in CELLS}
if set(destinations) != expected:
    raise ValueError('OS builder must export exactly the four independent OS banks')

if __name__ == '__main__':
    target = ROOT / 'scripts/geo/os-destinations.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({
        'destinations': destinations,
        'regions': REGIONS[START_REGIONS:],
        'lineExact': False,
        'provenance': PROVENANCE,
    }, indent=2), encoding='utf-8')
    print(len(destinations), 'OS parking approaches in', len(REGIONS) - START_REGIONS, 'bounded banks')
