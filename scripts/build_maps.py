"""Build a local atlas from public ICO sources. Python: requests, pymupdf, Pillow."""
from pathlib import Path
import json, re
import requests
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public'
CACHE = ROOT / 'scripts' / 'sources'
CACHE.mkdir(parents=True, exist_ok=True)
(OUT / 'maps').mkdir(parents=True, exist_ok=True)
SOURCES = {
    'current': 'https://www.icoterminals.com/upload/ico_safety_regulations.pdf',
    'cewez': 'https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf',
    'south2026': 'https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf',
}
docs = {}
for key, url in SOURCES.items():
    path = CACHE / (key + '.pdf')
    if not path.exists():
        existing = {
            'current': ROOT.parent/'tmp'/'ico-research'/'ico-2026.pdf',
            'cewez': ROOT.parent/'tmp'/'ico-research'/'ico-cewez.pdf',
            'south2026': ROOT/'scripts'/'geo'/'sit-sep2026.pdf',
        }[key]
        if existing.exists():
            path.write_bytes(existing.read_bytes())
        else:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            path.write_bytes(r.content)
    docs[key] = pymupdf.open(path)

maps = []
def make_map(id, name, short, source, page, crop, date, note, rotation=0):
    pg = docs[source][page-1]
    rect = pymupdf.Rect(crop)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=rect, alpha=False)
    im = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
    if rotation:
        im = im.rotate(rotation, expand=True)
    im.save(OUT / 'maps' / (id + '.webp'), quality=91, method=6)
    m = dict(id=id, name=name, short=short, source=SOURCES[source], page=page,
             image='maps/'+id+'.webp', width=im.width, height=im.height,
             date=date, note=note, historical=source=='cewez', parkings=[],
             georeferenced=False, routingVerified=False)
    def add(code, x, y, basis='pdf-label'):
        code = re.sub(r'\s+', '', code.upper())
        x, y = (x-rect.x0)*3, (y-rect.y0)*3
        if rotation == -90:
            x,y = im.width-y, x
        if not (0 <= x <= im.width and 0 <= y <= im.height):
            return
        old = next((p for p in m['parkings'] if p['code']==code), None)
        point = dict(x=round(x,2), y=round(y,2))
        if old:
            if all(abs(p['x']-x)+abs(p['y']-y)>18 for p in old['points']):
                old['points'].append(point)
        else:
            m['parkings'].append(dict(code=code, **point, points=[point], basis=basis))
    m['_add'] = add
    maps.append(m)
    return m, pg

south, pg = make_map('south','Zuidelijke Insteek','Bastenaken / Hanze','south2026',1,
                     (0,0,1190.55,841.89),'Sep 2026','Current combined Bastenaken / Hanze plan, published by ICO. Printed revision V1.09-2026.')
for b in pg.get_text('dict')['blocks']:
    for line in b.get('lines',[]):
        spans=line['spans']
        text=''.join(s['text'] for s in spans).strip()
        if re.fullmatch(r'(?:H\d{1,2}\s*[A-G]?|HH\d|[A-Z]{2}\s*\d{1,2}|[A-Z]{2}X|CH\d{1,2}|B[A-Z]{1,2}|[IJKL]OS|POS|DR[A-Z]+)',text):
            box=line['bbox'];south['_add'](text,(box[0]+box[2])/2,(box[1]+box[3])/2)

# Illustrator stores the AA letters and their adjacent number as separate
# lines. Join only numbers on that same baseline, within the printed label.
south_lines=[line for b in pg.get_text('dict')['blocks'] for line in b.get('lines',[])]
for line in south_lines:
    if ''.join(s['text'] for s in line['spans']).strip()!='AA':continue
    box=line['bbox'];baseline=(box[1]+box[3])/2
    for number in south_lines:
        text=''.join(s['text'] for s in number['spans']).strip();nb=number['bbox']
        if text in ['1','2'] and 0<=nb[0]-box[2]<8 and abs((nb[1]+nb[3])/2-baseline)<1:
            south['_add']('AA'+text,(box[0]+nb[2])/2,baseline)

north, pg = make_map('north','Noordelijke Insteek','Northern terminal','current',5,
                     (30,30,940,810),'Date not printed','Plan published in ICO’s January 2026 document.',-90)
allowed = set('APZ X I K KCB KCA HHN KD M O P Q2 U KB KA KE HHO E BA BB BC CA CB CC DA DB DC R S G F H J L N B1 B46 A23 B23 Y W SL PL PL2 AA Z06'.split())
for b in pg.get_text('dict')['blocks']:
    for line in b.get('lines',[]):
        text=''.join(s['text'] for s in line['spans']).strip()
        compact=re.sub(r'\s+','',text)
        # Tiny L/P fragments in '+100 LP', and W in HHW, are warehouse
        # annotations. Actual single-letter parking labels use the large font.
        if compact in ['L','P','W'] and max(s['size'] for s in line['spans'])<14:continue
        if compact in allowed or re.fullmatch(r'Z0[1-6]|Q(?:9|10)',compact):
            box=line['bbox'];north['_add'](compact,(box[0]+box[2])/2,(box[1]+box[3])/2)

nissan, pg = make_map('nissan','Nissan','Nissan terminal','current',6,
                     (30,200,1130,740),'02 Feb 2024','Plan published in ICO’s January 2026 document.')
for b in pg.get_text('dict')['blocks']:
    for line in b.get('lines',[]):
        for span in line['spans']:
            text=span['text'].strip()
            if re.fullmatch(r'V[A-Z]{1,2}\d{0,3}',text):
                box=span['bbox'];nissan['_add'](text,(box[0]+box[2])/2,(box[1]+box[3])/2)
# These two labels are above the cropped parking area; include their actual positions by extending the view.

def legacy(id,name,short,page,note):
    m,_=make_map(id,name,short,'cewez',page,(45,90,570,785),'Older plan · date not printed',note)
    return m
def screenshot_point(m, code, x, y):
    # Points read from the original source page rendered at 1.4x, not inferred geographic coordinates.
    m['_add'](code,x/1.4,y/1.4,'manual-source-label')

def apply_source_points(m, filename):
    manifest=json.loads((ROOT/'scripts'/filename).read_text(encoding='utf-8'))
    for code,points in manifest['points'].items():
        for point in points:m['_add'](code,*point,'reviewed-source-label')

bast=legacy('bastenaken','Bastenaken','Bastenaken · older plan',23,'Historical detail from Cewez’s ICO brochure. Use the combined southern plan for the newer layout.')
apply_source_points(bast,'bastenaken-source-points.json')
hanze=legacy('hanze','Hanze','Hanze · older plan',24,'Historical detail from Cewez’s ICO brochure. H61 is also on the newer combined southern plan.')
apply_source_points(hanze,'hanze-source-points.json')

toyota=legacy('toyota','Toyota','Toyota terminal · older plan',25,'Cewez brochure plan. Parking labels are indexed from the drawing; internal line positions are unverified.')
toyota_points=json.loads((ROOT/'scripts/toyota-source-points.json').read_text(encoding='utf-8'))['points']
for code,point in toyota_points.items():
    toyota['_add'](code,*point,'manual-source-label')

# Complete reviewed source inventory. These are drawing labels only; adding a
# label never assigns a geographic destination through a generic projection.
apply_source_points(toyota,'toyota-additional-source-points.json')
extra_index=json.loads((ROOT/'scripts/north-nissan-source-points.json').read_text(encoding='utf-8'))
for entry in extra_index['additions']:
    target=next(m for m in maps if m['id']==entry['mapId'])
    for point in entry['points']:target['_add'](entry['code'],*point,'reviewed-source-label')

# Illustrator retains one old GE1 glyph beneath the opaque current GE2 box.
# Only the visible bold GE1 at the southern strip is a current source label.
ge1=next(p for p in south['parkings'] if p['code']=='GE1')
visible=[point for point in ge1['points'] if 678<point['x']/3<682 and 289<point['y']/3<293]
if len(visible)!=1:raise ValueError('Review GE1 source overpaint correction after source revision.')
ge1.update(**visible[0],points=visible)

for m in maps:
    del m['_add']
    if m['id']=='south':
        m['terminals']=['bastenaken','hanze']
        for parking in m['parkings']:
            # The combined plan contains the Hanze H/HH blocks and the Bastenaken
            # letter-grid blocks. Keep regional filters on the current plan rather
            # than relying on the sparsely indexed older brochure images.
            code=parking['code']
            if re.fullmatch(r'H\d{1,2}[A-G]?|HH\d',code):
                parking['terminal']='hanze'
            elif re.fullmatch(r'[A-Z]{2}\d{1,2}|[A-Z]{2}X|CH\d{1,2}|B[A-Z]{1,2}|[IJKL]OS|POS',code):
                parking['terminal']='bastenaken'
    else:
        for parking in m['parkings']:
            parking['terminal']=m['id']
    m['parkings'].sort(key=lambda p:p['code'])
    print(m['id'],len(m['parkings']),'parkings',m['width'],m['height'])
(OUT/'data.json').write_text(json.dumps(dict(version=1, maps=maps),indent=2,ensure_ascii=False),encoding='utf-8')
