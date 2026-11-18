"""Record the central-source audit without manufacturing missing GPS controls.

The September 2026 AH/BH/CH source layout and older Bastenaken forecourt labels
are real. Neither their printed label positions nor a nearby road establish
their individual geographic parcels. This builder therefore emits evidence
gaps, not a collection of guessed destinations on a shared gate or road.

The nearby 1338613xxx road grid was checked against the official port company
polygons and is recorded there as WWL 5010. The earlier AH/BH candidate also
only interpolated source ordinals between roads; its internal partitions were
not matched. Do not merge scripts/geo/upper-destinations.json as verified GPS.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf'
LEGACY_URL = 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf'
PORT_LAYER = 'https://webapps.portofantwerpbruges.com/arcgis/rest/services/extern/havenmeesterkaart/MapServer/20'
ORTHOPHOTO = 'https://geo.api.vlaanderen.be/omwrgbmrvl/wms'

# Original, uncropped PDF points, visually checked on Cewez page 23. These are
# source-label coordinates only. They deliberately have no latitude/longitude.
LEGACY_SOURCE_POINTS = {
    'BDA': [[93, 282.6667], [98.3333, 227.6667], [103.3333, 167.6667]],
    'AH2': [[134.6667, 174]], 'BH2': [[133.3333, 222.6667]],
    'DH1': [[138.3333, 301.6667]], 'CH1': [[138.3333, 270.6667]],
    'TES': [[288, 281.6667]], 'PRE': [[364.3333, 285]],
    'VPC': [[288, 328.3333]], 'VPC1': [[260.6667, 307.6667]],
    'DLT': [[323.3333, 340.3333], [365, 338.6667]],
    'CLT1': [[323.3333, 277]], 'CLT2': [[323.3333, 261.6667]],
}


def build():
    data = json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    south = next(m for m in data['maps'] if m['id'] == 'south')
    parkings = {p['code']: p for p in south['parkings']}
    unresolved = []

    def current(code, region, reason):
        p = parkings[code]
        unresolved.append({
            'code': code, 'sourceMap': 'south', 'sourceRevision': 'V1.09-2026',
            'sourcePoints': [[round(q['x'] / 3, 4), round(q['y'] / 3, 4)] for q in p['points']],
            'sourceUnits': 'original PDF points', 'region': region,
            'status': 'source-position-only', 'geographicMatchVerified': False,
            'reason': reason,
        })

    for prefix, count in [('AH', 6), ('BH', 4)]:
        for number in range(1, count + 1):
            current(prefix + str(number), 'central-upper-ah-bh',
                    'The source identifies ordered strips, but no independent control matches each strip to a physical parking parcel. The earlier bounded-road candidate only interpolated source ordinals; it does not establish individual label locations.')
    for code in ['BDR', 'BWH']:
        current(code, 'central-upper-boundary-bands',
                'The named source boundary band is visible, but its geographic match depends on the still-unconfirmed AH/BH parcel correspondence. A real nearby road is insufficient to establish this band location.')
    for number in range(1, 25):
        current('CH' + str(number), 'central-upper-ch',
                'No individual CH strip has an independently established geographic control. The tempting 1338613xxx grid is attributed to WWL 5010 in the official port dataset and does not match the source compound layout. A shared ICO access gate is not an individual CH destination.')

    for code, points in LEGACY_SOURCE_POINTS.items():
        unresolved.append({
            'code': code, 'sourceMap': 'bastenaken', 'sourcePage': 23,
            'sourceRevision': 'Cewez older plan, date not printed',
            'sourcePoints': points, 'sourceUnits': 'uncropped original PDF points',
            'region': 'central-legacy-revised-layout',
            'status': 'source-position-only', 'geographicMatchVerified': False,
            'reason': 'The printed old label and source position are established. The old forecourt or northern compound is partitioned differently from the current drawing; current code equality, a VPC name, or a nearby road does not independently identify this old parcel. No current GPS coordinate has been copied into it.',
        })

    catalogue = json.loads((ROOT / 'public/destinations.json').read_text(encoding='utf-8'))
    quay_findings = []
    for letter in 'ABCDEFGHIJKL':
        key = 'south:BK' + letter
        point = catalogue['destinations'].get(key)
        if not point or not point.get('labelPosition'):
            continue
        label = point['labelPosition']
        dx = math.radians(label['lon'] - point['lon']) * math.cos(math.radians((label['lat'] + point['lat']) / 2))
        dy = math.radians(label['lat'] - point['lat'])
        offset = math.hypot(dx, dy) * 6371008.8
        if offset > 5:
            quay_findings.append({
                'key': key, 'kind': 'quay-band-label-inside-a-row',
                'displayOffsetFromQuayMetres': round(offset, 2),
                'approachLatLon': [point['lat'], point['lon']],
                'incorrectDisplayLatLon': [label['lat'], label['lon']],
                'sourceBounds': point.get('sourceBounds'),
                'reason': 'The BK source label is in the narrow quay band below the A row. Reusing A-row geographic corners after changing only sourceBounds places the display label back inside A-row parking, 30-37 m inland. The matched quay road approach itself remains on the correct boundary.',
            })

    return {
        'version': 1, 'destinations': {}, 'regions': [], 'unresolved': unresolved,
        'auditDate': '2026-11-18', 'lineExact': False,
        'coverage': 'Source inventory audited; no additional individual geographic matches established.',
        'sourceUrls': [SOURCE_URL, LEGACY_URL, PORT_LAYER, ORTHOPHOTO],
        'confirmedLabelDefects': quay_findings,
        'sourceChecks': {
            'currentPlan': 'Full September 2026 page and enlarged CH/AH/BH and VPC regions visually inspected.',
            'legacyPlan': 'Full Cewez page 23 and all printed parking labels visually reviewed; 168 actual parking/yard/quay/truck references and 174 printed labels identified, including repeated labels.',
            'legacyHanze': 'Full Cewez page 24 visually reviewed; 43 actual codes and 45 printed labels, including repeated H14 and H45. The source prints H69, not the previous index H65.',
            'pdfGeoreference': 'Neither supplied PDF contains VP, LGIDict, GPTS or LPTS georeference keys.',
            'orthophoto': 'Official most-recent winter orthophoto examined. The earlier research records local flight date 2025-02-23; imagery predates the September 2026 source and cannot prove later partitions.',
            'portDatasetDate': 'The public company layer exposes no editing date; its attribution is evidence about that dataset, not proof of current operating rights.',
        },
        'ownershipChecks': [
            {'pointLonLat': [3.212, 51.306], 'datasetCompany': 'WALLENIUS WILHELMSEN LOGISTICS ZEEBRUGGE', 'datasetTerminal': '5010'},
            {'pointLonLat': [3.2139, 51.3076], 'datasetCompany': 'ICO', 'datasetTerminal': '5210'},
            {'pointLonLat': [3.2121, 51.31055], 'datasetCompany': 'ICO', 'datasetTerminal': '5210'},
            {'pointLonLat': [3.21269, 51.3093], 'datasetCompany': None, 'meaning': 'Candidate AH/BH midline receives no company polygon; this is not proof of absence, but supplies no positive ICO parcel control.'},
        ],
        'sourceIndexCorrections': {
            'bastenaken': {'removeInventedOrMisread': ['AHH', 'BDH', 'HA2', 'T15', 'DB1'], 'actualPrinted': ['BDA', 'AH2', 'TES', 'DB4'], 'otherIssues': 'Systematic shifted A/B and OS columns; DH1 marker on CH1; many printed rows previously omitted.'},
            'hanze': {'removeMisread': ['H65'], 'actualPrinted': ['H69'], 'otherIssues': 'H1-H8 point drift; H31/H45 misplaced; H27 outside its box; repeated H14 and H45 labels omitted.'},
        },
        'temporalAliasRisks': [
            {'sourceMap': 'bastenaken', 'codes': ['AH1', 'BH1', 'AH2', 'BH2', 'CH1'], 'reason': 'The old north compound divisions differ from current AH1-AH6/BH1-BH4/CH1-CH24.'},
            {'sourceMap': 'bastenaken', 'codes': ['GE1', 'GE2', 'FE1', 'EE1', 'POS', 'AB1'], 'reason': 'Old row counts or repeated compound divisions differ; sharing a code does not establish a current GPS alias.'},
            {'sourceMap': 'hanze', 'codes': ['H14', 'H45', 'H60', 'H69'], 'reason': 'Repeated or changed old-source compounds require source-specific review before inheriting current-source coordinates.'},
        ],
    }


if __name__ == '__main__':
    result = build()
    target = ROOT / 'scripts/geo/central-remaining-destinations.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(f"{len(result['destinations'])} additional GPS approaches; {len(result['unresolved'])} individually documented evidence gaps")
