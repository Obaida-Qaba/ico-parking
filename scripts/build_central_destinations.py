"""Rebuild the checked G-L quay and A/B compounds from actual corner nodes."""
from pathlib import Path
import json
from build_south_east_destinations import region,add,label_quay_reference,OUT,REGIONS

ROOT=Path(__file__).resolve().parents[1]
previous=set(OUT);start_regions=len(REGIONS)
evidence=('The G-L column ladder is identified by the C1 access corridor, '
          'the quay perimeter and its A/B distributor. Each source parcel is '
          'bounded by four actual lane junctions, independently of the schematic scale.')
# West/east columns list the C1 southern boundary, A/B divider and quay nodes.
# The centre grid retains the same long bounding lanes as the checked C rows.
columns=[
 ('G',[661.4,708.8],[6986702605,6986702604,2494511769,2494511762,2494511764,2494511771],
  '241873269','241873299','241873302','392480112'),
 ('H',[611.2,657.6],[6986702606,6986702605,2494511762,2494511753,2494511756,2494511764],
  '746582127','241873269','241873302','392480112'),
 ('I',[560.0,607.5],[6986702607,6986702606,2494511753,6986702459,6986702456,2494511756],
  '746582086','746582127','746582087','1349890077'),
 ('J',[508.0,555.5],[6986702608,6986702607,6986702459,6986702473,6986702474,6986702456],
  '746582091','746582086','746582087','1349890077'),
 ('K',[456.4,504.0],[6986702609,6986702608,6986702473,6986702463,6986702464,6986702474],
  '746582088','746582091','746582087','1349890077'),
 ('L',[404.5,452.5],[6986702602,6986702609,6986702463,6986702458,6986702392,6986702464],
  '746582075','746582088','746582087','1349890077'),
]
for letter,xs,nodes,west,east,divider,quay in columns:
 nw,ne,se,sw,qw,qe=nodes
 b=region('central-'+letter.lower()+'-b',[xs[0],359.4,xs[1],385.8],[nw,ne,se,sw],
  [('746582135',nw,ne),(east,ne,se),(divider,sw,se),(west,nw,sw)],evidence)
 a=region('central-'+letter.lower()+'-a',[xs[0],389.4,xs[1],417.7],[sw,se,qe,qw],
  [(divider,sw,se),(east,se,qe),(quay,qw,qe),(west,sw,qw)],evidence)
 add(letter+'B1',b,'south');add(letter+'A1',a,'north')
 add('BK'+letter,dict(a,sourceBounds=[xs[0],417,xs[1],423.7]),'south')
 label_quay_reference('BK'+letter)

output=ROOT/'scripts/geo/central-destinations.json'
output.write_text(json.dumps({'destinations':{k:v for k,v in OUT.items() if k not in previous},'regions':REGIONS[start_regions:]},indent=2),encoding='utf-8')
print(len(OUT)-len(previous),'central A/B/quay approaches')
