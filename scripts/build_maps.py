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
        if re.fullmatch(r'(?:H\d{1,2}\s*[A-G]?|HH\d|[A-Z]{2}\s*\d{1,2}|[A-Z]{2}X|CH\d{1,2}|B[A-Z]{1,2}|[IJKL]OS|DR[A-Z]+)',text):
            box=line['bbox'];south['_add'](text,(box[0]+box[2])/2,(box[1]+box[3])/2)

north, pg = make_map('north','Noordelijke Insteek','Northern terminal','current',5,
                     (30,30,940,810),'Date not printed','Plan published in ICO’s January 2026 document.',-90)
allowed = set('APZ X I K KCB KCA HHN KD M O P Q2 U KB KA KE HHO E BA BB BC CA CB CC DA DB DC R S G F H J L N B1 B46 A23 B23 Y W SL PL PL2 AA Z06'.split())
for b in pg.get_text('dict')['blocks']:
    for line in b.get('lines',[]):
        text=''.join(s['text'] for s in line['spans']).strip()
        compact=re.sub(r'\s+','',text)
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

bast=legacy('bastenaken','Bastenaken','Bastenaken · older plan',23,'Historical detail from Cewez’s ICO brochure. Use the combined southern plan for the newer layout.')
# Source labels on the rotated Bastenaken drawing.
for code,x,y in [('BDH',139,266),('HA2',180,266),('AH1',222,265),('AG1',265,245),('BG1',266,306),('AF1',362,245),('BF1',362,306),('AE1',408,245),('BE1',409,306),('AD1',454,245),('BD1',454,306),('AB1',590,266),('BA1',660,318),('AA1',660,266),('DH1',166,384),('AHH',131,375),('T15',408,400),('VPC1',363,427),('VPC',408,476),('PRE',498,400),('CB1',591,400),('CA1',660,400),('DB1',590,500),('DA1',660,500),('EB1',590,591),('EA1',660,591),('FB1',590,684),('FA1',660,684),('GB1',590,781),('GA1',660,781),('HB1',590,875),('HA1',660,875),('IB1',590,967),('IA1',660,967),('JB1',590,1024),('JA1',660,1024),('LOS',336,980),('KOS',336,885),('JOS',336,790),('IOS',336,695)]:
    screenshot_point(bast,code,x,y)
# Smaller legacy row labels are retained in the image, not assigned speculative positions.

hanze=legacy('hanze','Hanze','Hanze · older plan',24,'Historical detail from Cewez’s ICO brochure. H61 is also on the newer combined southern plan.')
for code,x,y in [('H1',323,212),('H2',323,267),('H3',323,319),('H4',323,370),('H5',323,424),('H6',323,477),('H7',323,531),('H8',323,586),('HH1',323,512),('HH2',323,555),('HH3',323,600),('HH4',323,645),('HH5',323,687),('H10',380,512),('H11',380,555),('H12',380,600),('H13',380,645),('H14',380,687),('H15',380,728),('H16',380,775),('H17',380,816),('H18',380,855),('H19',380,898),('H20',380,941),('H21',323,728),('H22',323,775),('H23',323,816),('H24',323,898),('H25',269,941),('H26',269,984),('H27',269,1026),('H28',186,941),('H29',186,984),('H30',186,1026),('H31',186,1068),('H45',158,1068),('H60',458,728),('H61',458,775),('H62',458,816),('H63',458,855),('H64',453,898),('H65',264,898),('HH6',186,898)]:
    screenshot_point(hanze,code,x,y)

toyota=legacy('toyota','Toyota','Toyota terminal · older plan',25,'Cewez brochure plan. Parking labels are indexed from the drawing; internal line positions are unverified.')
for i,y in enumerate([188,207,226,245],1):screenshot_point(toyota,f'A{i:02}',220,y)
for i,y in enumerate([188,207,226,245],5):screenshot_point(toyota,f'A{i:02}',315,y)
screenshot_point(toyota,'A01PPO',415,210)
for i,y in enumerate([269,287,306,325,344,363,382,401,420,439],1):screenshot_point(toyota,f'B{i:02}',220,y)
for i,y in enumerate([455,475,493,511,531,550,571,591,612,631,646,665,682],1):screenshot_point(toyota,f'C{i:02}',220,y)
for prefix,x in [('D',310),('E',406)]:
    for i,y in enumerate([611,630,648,666,684],9):screenshot_point(toyota,f'{prefix}{i:02}',x,y)
for prefix,x in [('F',570),('G',671)]:
    for i,y in enumerate([454,475,495,516,536,556,578,598,620,642,665,687,709,730],1):
        screenshot_point(toyota,f'{prefix}{i:02}',x,y)
for prefix,x in [('I',320),('J',434)]:
    for i,y in enumerate([754,774,793,814,834,854,875,895,916,936,956,977,997,1018,1038,1058,1081],1):
        screenshot_point(toyota,f'{prefix}{i:02}',x,y)
for i,y in enumerate([205,273,335,402,465,533,602,659,701,776,838,904,962,1018],1):
    screenshot_point(toyota,f'H{i:02}',165 if i>=10 else 110,y)

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
            elif re.fullmatch(r'[A-Z]{2}\d{1,2}|[A-Z]{2}X|CH\d{1,2}|B[A-Z]{1,2}|[IJKL]OS',code):
                parking['terminal']='bastenaken'
    else:
        for parking in m['parkings']:
            parking['terminal']=m['id']
    m['parkings'].sort(key=lambda p:p['code'])
    print(m['id'],len(m['parkings']),'parkings',m['width'],m['height'])
(OUT/'data.json').write_text(json.dumps(dict(version=1, maps=maps),indent=2,ensure_ascii=False),encoding='utf-8')
