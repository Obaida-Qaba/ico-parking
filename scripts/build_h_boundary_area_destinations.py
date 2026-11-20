"""Current BDR/BWH boundary references share the independently matched H area.

The reviewed H builder identifies the BDR outer perimeter and BWH quay cap as
whole-field controls. This adds a road approach to that field, never a separate
boundary-strip centre. Historical names require separate geographic evidence.
"""
from pathlib import Path
import argparse
import copy
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
GLYPHS = {
    'BDR': [[962.987793, 133.937302, 971.344116, 138.799774],
            [1036.077148, 138.573105, 1044.433472, 143.435577]],
    'BWH': [[1068.628418, 164.363525, 1076.51355, 176.240356]],
}


def build(atlas=None, roads=None):
    atlas = atlas or json.loads((ROOT / 'public/data.json').read_text(encoding='utf-8'))
    parent = runpy.run_path(str(ROOT / 'scripts/build_h_area_destinations.py'))['build'](atlas, roads)
    reviewed = parent['destinations']['south:AH1']
    parkings = {p['code']: p for m in atlas['maps'] if m['id'] == 'south' for p in m['parkings']}
    out = {}
    for code, glyphs in GLYPHS.items():
        source = [[round(p['x']/3, 4), round(p['y']/3, 4)] for p in parkings[code]['points']]
        centres = [[(g[0]+g[2])/2, (g[1]+g[3])/2] for g in glyphs]
        if len(source) != len(centres) or any(abs(a-b) > .02 for p, q in zip(source, centres) for a, b in zip(p, q)):
            raise ValueError('Reviewed H boundary source glyph changed: ' + code)
        basis = ('The current BDR outer perimeter and BWH quay cap identify boundaries of the independently matched H field. '
                 'The CF1/VPC cross-road, whole-field road chains and named berth control are inherited from its guarded review. '
                 'Only the shared H-field road approach is positioned; individual boundary strips, exact gate and current access permission are unverified.')
        pin = copy.deepcopy(reviewed)
        pin.update(parking=code, name=code+' · area approach', areaName='H parking area',
                   region='south-h-boundary-area-road-approach', method='source-topology-shared-area-road-approach',
                   precision='area-approach-only', sourcePoints=source, sourcePoint=source[0],
                   sourcePointAtlasPixels=[parkings[code]['x'], parkings[code]['y']], sourceGlyphBounds=glyphs,
                   sourceBounds=[min(g[0] for g in glyphs), min(g[1] for g in glyphs), max(g[2] for g in glyphs), max(g[3] for g in glyphs)],
                   sourceBoundsBasis='Actual printed boundary-reference glyphs; not a geographic parking footprint.', basis=basis,
                   areaAccessNote='Route stops at the shared H-field road approach; the individual boundary strip and operational gate are unverified.')
        pin['mappedArea'].update(areaName='H parking area',
                                boundaryLimitation='Only the shared H-field road approach is located; individual BDR/BWH boundary strips and their operational gates remain unverified.')
        pin['labelPosition'].update(name=pin['name'], method='shared-area-road-approach', precision='area-approach-only', scope='area-approach-label',
                                    basis='Same supported whole-field road approach, not a position along the separately named boundary strip.')
        out['south:'+code] = pin
    return {'version': 1, 'reviewed': '2026-11-20', 'destinations': out,
            'regions': [{'id': 'south-h-boundary-area-road-approach', 'codes': list(GLYPHS),
                         'sourceMap': 'south', 'precision': 'area-approach-only',
                         'boundaryLanes': reviewed['junctionMatch']['boundaryLanes'],
                         'basis': out['south:BDR']['basis']}],
            'independentControls': parent['independentControls'], 'roadGuards': parent['roadGuards']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.stdout:
        print(json.dumps(result))
    else:
        (ROOT / 'scripts/geo/h-boundary-area-destinations.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print('BDR/BWH: two current boundary references share one reviewed H-field road approach')
