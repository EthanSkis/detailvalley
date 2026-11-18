import json, math
d = json.load(open('photon_streets.json'))
ZIP_TOWN = {'83638':'McCall','83611':'Cascade','83615':'Donnelly','83635':'Lake Fork','83654':'New Meadows','83677':'Yellow Pine','83671':'Warren'}
TOWN_ZIP = {v:k for k,v in ZIP_TOWN.items()}
CENTERS = {'McCall':(44.911,-116.099),'Donnelly':(44.733,-116.078),'Cascade':(44.516,-116.042),'Lake Fork':(44.83,-116.09),
           'New Meadows':(44.971,-116.284),'Yellow Pine':(44.962,-115.495),'Smiths Ferry':(44.304,-116.090),'Warren':(45.263,-115.682)}
def nearest(lat, lon):
    return min(CENTERS, key=lambda t: (CENTERS[t][0]-lat)**2 + ((CENTERS[t][1]-lon)*math.cos(math.radians(lat)))**2)
import re
# Not places anyone lives: Forest Service roads, bare route numbers.
JUNK = re.compile(r'forest (development |service )?(road|rd)|national forest|^(nf|fs|nfsr|fr)[- ]?\d|^forest road|^\d+[a-z]?$|^road \d+$|^unnamed', re.I)
out = {}
for name, zip_, city, lat, lon in d:
    if JUNK.search(name): continue
    town = ZIP_TOWN.get(zip_) or (city if city in CENTERS else '') or nearest(lat, lon)
    z = zip_ if zip_ in ZIP_TOWN else TOWN_ZIP.get(town, '')
    if town == 'Smiths Ferry': z = '83611'
    out.setdefault((name, town), z)
towns = sorted({t for _,t in out})
rows = sorted(out.items(), key=lambda kv: kv[0][0])
data = {'t': towns, 'z': [TOWN_ZIP.get(t, '83611' if t=='Smiths Ferry' else '') for t in towns],
        's': [[n, towns.index(t)] for (n,t),_ in rows]}
js = '/* Valley County streets for instant address suggestions (OpenStreetMap data via Photon, (c) OpenStreetMap contributors, ODbL). Rebuild with the README steps. */\nwindow.DV_STREETS=' + json.dumps(data, separators=(',',':')) + ';\n'
open('dv-streets.js','w').write(js)
print(len(data['s']), 'streets', towns, len(js)//1024, 'KB')
