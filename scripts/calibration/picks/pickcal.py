import json,urllib.request,math,statistics as st
import os; S=os.environ.get('CALIB_DATA') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data')  # snapshot dir; see ../README.md
import subprocess
def get(u): return json.loads(subprocess.check_output(['curl','-s','https://api.sleeper.app/v1'+u]))
lid='1347007735815766016'; rows=[]
while lid and lid!='0':
    L=get('/league/'+lid); 
    for d in get('/league/%s/drafts'%lid):
        if d['status']!='complete': continue
        picks=get('/draft/%s/picks'%d['draft_id'])
        y=int(d['season']); proj=json.load(open(S+'/proj%d.json'%y))
        for p in picks:
            v=proj.get(p['player_id'],{}); rows.append((y,p['pick_no'],p['player_id'],v.get('adp_dynasty',999),(p['metadata'].get('first_name','')+' '+p['metadata'].get('last_name','')), p['metadata'].get('years_exp')))
    lid=L.get('previous_league_id')
json.dump(rows,open(S+'/leaguedrafts.json','w'))
base=lambda a: 10000*math.exp(-0.021*(a-1)) if a<999 else 0
slot=lambda k: 70+(5000-70)*math.exp(-0.155*(k-1))
from collections import defaultdict
by=defaultdict(list)
for y,k,pid,a,n,ex in rows: by[y].append((k,a,n,ex))
for y in sorted(by): 
    xs=sorted(by[y]); print(y,len(xs),'rookies(exp0)',sum(1 for x in xs if str(x[3])=='0'), 'adp<999',sum(1 for x in xs if x[1]<999))
    print('  ',[(k,round(a),n[:14]) for k,a,n,ex in xs[:14]])
print('slot  curve  marketBase(median over classes)  n')
for k in range(1,43):
    vals=[base(a) for y in by for kk,a,n,ex in by[y] if kk==k]
    print(k, round(slot(k)), round(st.median(vals)) if vals else None, [round(v) for v in vals])
