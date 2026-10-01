import json,math
import os; S=os.environ.get('CALIB_DATA') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data')  # snapshot dir; see ../README.md
sc={'ast':1,'blk':2,'bonus_pt_40p':2,'bonus_pt_50p':2,'dd':1,'ff':-2,'pts':0.5,'reb':1,'stl':2,'td':2,'tf':-2,'to':-1,'tpm':0.5}
st={y:json.load(open(S+'/stats%d.json'%y)) for y in (2023,2024,2025)}
def fp(v): return sum(sc[k]*(v.get(k) or 0) for k in sc)
# era normalize: mean total FP among players with gp>=20
norm={}
for y,d in st.items():
    xs=[fp(v) for v in d.values() if (v.get('gp') or 0)>=20]; norm[y]=sum(xs)/len(xs)
rows=json.load(open(S+'/leaguedrafts.json'))
def rank(xs):
    o=sorted(range(len(xs)),key=lambda i:xs[i]); r=[0]*len(xs); i=0
    while i<len(o):
        j=i
        while j+1<len(o) and xs[o[j+1]]==xs[o[i]]: j+=1
        for k in range(i,j+1): r[o[k]]=(i+j)/2+1
        i=j+1
    return r
def pear(a,b):
    n=len(a); ma=sum(a)/n; mb=sum(b)/n
    c=sum((x-ma)*(y-mb) for x,y in zip(a,b)); return c/math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))
def spear(a,b): return pear(rank(a),rank(b))
allp=[];allm=[];allt=[]
for Y in (2023,2024,2025):
    cls=[r for r in rows if r[0]==Y]
    P,M,T=[],[],[]
    for y,k,pid,adp,n,ex in cls:
        t=sum((0.9**(s-Y))*fp(st[s].get(pid,{}))/norm[s] for s in range(Y,2026))
        P.append(k); M.append(adp if adp<999 else 400); T.append(-t)
    rp,rm,rpm=spear(P,T),spear(M,T),spear(P,M)
    part=(rp-rm*rpm)/math.sqrt((1-rm**2)*(1-rpm**2))
    print(Y,'n',len(P),'rho(room order,outcome)',round(rp,3),'rho(market ADP,outcome)',round(rm,3),'rho(room,market)',round(rpm,3),'partial room|market',round(part,3))
    # within-class percentile ranks pooled
    def pct(xs): r=rank(xs); return [(v-1)/(len(xs)-1) for v in r]
    allp+=pct(P); allm+=pct(M); allt+=pct(T)
rp,rm,rpm=pear(allp,allt),pear(allm,allt),pear(allp,allm)
part=(rp-rm*rpm)/math.sqrt((1-rm**2)*(1-rpm**2))
print('POOLED n',len(allp),'room',round(rp,3),'market',round(rm,3),'room~market',round(rpm,3),'partial room|market',round(part,3), 'z~',round(part*math.sqrt(len(allp)-3),2))
best=None
for w in [i/20 for i in range(21)]:
    b=[w*p+(1-w)*m for p,m in zip(allp,allm)]; r=spear(b,allt)
    if best is None or r>best[1]: best=(w,r)
    print(' w_room',w,round(r,4))
print('best',best)
