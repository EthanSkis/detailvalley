import json, time, urllib.request, urllib.parse, string, sys
BBOX='-116.45,44.2,-114.9,45.35'
prev = json.load(open('photon_streets.json'))
streets = {(r[0],r[1],r[2]):(r[3],r[4]) for r in prev}
done = set(string.ascii_lowercase) | {a+b for a in 'abcdefghijklmnoprstw' for b in 'aeiou'}
queries = [a+b for a in string.ascii_lowercase for b in string.ascii_lowercase if a+b not in done and not (a in 'qxz' and b not in 'aeiou')]
queries += ['old','spring mountain','hewitt','paddock','chipmunk','brown','highway 55','state highway']
for i,q in enumerate(queries):
    url = 'https://photon.komoot.io/api/?' + urllib.parse.urlencode({'q':q,'limit':50,'bbox':BBOX,'osm_tag':'highway','lang':'en'})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'street-list-builder/1.0'}), timeout=30) as r: d=json.load(r)
    except Exception as e:
        print('fail', q, e, file=sys.stderr); time.sleep(3); continue
    for f in d.get('features',[]):
        p=f['properties']; name=p.get('name')
        if not name: continue
        lon,lat=f['geometry']['coordinates']
        streets.setdefault((name, p.get('postcode') or '', p.get('city') or p.get('town') or p.get('village') or ''), (round(lat,4), round(lon,4)))
    if i % 100 == 0: print(i, len(queries), len(streets), file=sys.stderr)
    time.sleep(0.5)
json.dump([[k[0],k[1],k[2],v[0],v[1]] for k,v in streets.items()], open('photon_streets.json','w'))
print('done', len(streets), 'entries', len({k[0] for k in streets}), 'unique names')
