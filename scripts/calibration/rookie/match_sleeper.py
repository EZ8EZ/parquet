import json,re,unicodedata
def norm(s):
    s=unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode().lower()
    s=re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?","",s)
    s=re.sub(r"[^a-z ]","",s.replace("-"," "))
    return " ".join(s.split())
P=json.load(open('raw/players.json'))
D=[x for x in json.load(open('draft_raw.json')) if x['name'].strip()]
by={}
for pid,p in P.items():
    if p.get('sport')!='nba' and 'full_name' not in p: continue
    n=norm(p.get('full_name') or ((p.get('first_name') or '')+' '+(p.get('last_name') or '')))
    by.setdefault(n,[]).append((pid,p))
OVR={('Ron Holland',2024):'2836'}
out=[];unm=[]
ST={y:json.load(open(f'raw/stats{y}.json')) for y in range(2020,2026)}
for d in D:
    n=norm(d['name']); c=by.get(n,[])
    if (d['name'],d['draft_year']) in OVR: c=[(OVR[(d['name'],d['draft_year'])],P[OVR[(d['name'],d['draft_year'])]])]
    y=d['draft_year']
    def score(p):
        s=0
        ry=(p.get('metadata') or {}).get('rookie_year')
        if ry and str(ry)==str(y)  : s+=3
        if ry and str(ry)==str(y-1)  : s+=1  # 2020 draft -> rookie season 2020
        by_=p.get('birth_date')
        if by_ and by_[:4].isdigit() and 1985<=int(by_[:4])<=2008: s+=1
        if p.get('college') and d['college'] and norm(p['college'])[:4]==norm(d['college'])[:4]: s+=2
        return s
    if c:
        c=sorted(c,key=lambda t:-score(t[1]))
        if len(c)>1 and d['nba_g'].isdigit():
            def gs(pid): return sum((ST[yy].get(pid) or {}).get('gp',0) for yy in ST)
            c=sorted(c,key=lambda t:(abs(gs(t[0])-int(d['nba_g'])),-score(t[1])))
        d['sleeper_id']=c[0][0]; d['n_cands']=len(c); d['score']=score(c[0][1])
        d['sleeper']={k:c[0][1].get(k) for k in ('full_name','birth_date','college','years_exp','team','status','position')}
        d['sleeper']['rookie_year']=(c[0][1].get('metadata') or {}).get('rookie_year')
    else:
        d['sleeper_id']=None
        unm.append(d)
    if d['sleeper_id']:
        d['sleeper_gp_2020_25']=sum((ST[yy].get(d['sleeper_id']) or {}).get('gp',0) for yy in ST)
    out.append(d)
json.dump(out,open('draft_sleeper.json','w'),indent=1)
print(len(out),len(unm))
for u in unm: print(u['draft_year'],u['pick'],u['name'],u['college'])
from collections import Counter
print(Counter((d['draft_year'],d.get('score')) for d in out if d['sleeper_id']))
print([ (d['name'],d['n_cands']) for d in out if d.get('n_cands',0)>1])
