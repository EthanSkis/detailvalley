import json, time, urllib.request, urllib.parse, string, sys
BBOX='-116.45,44.2,-114.9,45.35'
words = ['road','rd','street','st','lane','ln','drive','dr','avenue','ave','way','court','ct','loop','trail','circle','place','pl','highway','boulevard','path','ridge','creek','lake','view','pine','park','hill','meadow','river','canyon','spur','point','north','south','east','west','mountain','forest','valley','spring','bay','cove','summit','crest','glen','heights','ranch','farm','mill','school','church']
letters = list(string.ascii_lowercase) + [a+b for a in 'abcdefghijklmnoprstw' for b in 'aeiou']
queries = words + letters
streets = {}
for i,q in enumerate(queries):
    url = 'https://photon.komoot.io/api/?' + urllib.parse.urlencode({'q':q,'limit':50,'bbox':BBOX,'osm_tag':'highway','lang':'en'})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'street-list-builder/1.0'}), timeout=30) as r:
            d = json.load(r)
    except Exception as e:
        print('fail', q, e, file=sys.stderr); time.sleep(2); continue
    for f in d.get('features',[]):
        p=f['properties']; name=p.get('name'); 
        if not name: continue
        lon,lat=f['geometry']['coordinates']
        key=(name, p.get('postcode') or '', p.get('city') or p.get('town') or p.get('village') or '')
        streets.setdefault(key, (round(lat,4), round(lon,4)))
    if i % 20 == 0: print(i, len(queries), len(streets), file=sys.stderr)
    time.sleep(0.35)
json.dump([[k[0],k[1],k[2],v[0],v[1]] for k,v in streets.items()], open('photon_streets.json','w'))
print('done', len(streets), 'street entries', len({k[0] for k in streets}), 'unique names')
