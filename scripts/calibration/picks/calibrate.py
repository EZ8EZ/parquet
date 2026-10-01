import json, math, statistics as st, itertools, datetime
from collections import defaultdict
import os; S=os.environ.get('CALIB_DATA') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data')  # snapshot dir; see ../README.md
OUT=os.path.dirname(os.path.abspath(__file__))
rows=[r for r in json.load(open(S+'/leaguedrafts.json')) if r[0]!=2022]
players=json.load(open(S+'/players.json'))
YEARS=[2023,2024,2025,2026]
AGE={19:1.16,20:1.16,21:1.071,22:1.045,23:1.018,24:1.006,25:.97,26:.934,27:.902,28:.877,29:.862,30:.771,31:.719,32:.719,33:.671,34:.586,35:.57,36:.533}
Vb=lambda r: 10000*math.exp(-0.021*(r-1))
cur=lambda k: 70+(5000-70)*math.exp(-0.155*(k-1))
# rank maps per season
rank={}
for y in YEARS:
    pj=json.load(open(S+'/proj%d.json'%y))
    ranked=sorted([(v['adp_dynasty'],pid) for pid,v in pj.items() if isinstance(v,dict) and v.get('adp_dynasty',999)<999])
    rank[y]=({pid:i+1 for i,(a,pid) in enumerate(ranked)}, len(ranked))
def agemult(pid,y):
    b=(players.get(pid) or {}).get('birth_date')
    if not b: return 1.16, None
    bd=datetime.date.fromisoformat(b); a=(datetime.date(y,6,25)-bd).days/365.25
    ai=min(36,max(19,int(a)))
    return AGE[ai], round(a,2)
val={}  # (y,k) -> dict
for y,k,pid,adp,name,ex in rows:
    rm,n=rank[y]; r=rm.get(pid,n+1)
    m,age=agemult(pid,y)
    val[(y,k)]=dict(pid=pid,name=name,rank=r,age=age,base=Vb(r),aged=Vb(r)*m/1.16)
K=range(1,43)
def slotstats(key):
    out=[]
    for k in K:
        xs=[val[(y,k)][key] for y in YEARS]
        out.append(dict(k=k,mean=st.mean(xs),median=st.median(xs),sd=st.stdev(xs),min=min(xs),max=max(xs),byclass=dict(zip(map(str,YEARS),[round(x) for x in xs]))))
    return out
# ---- fitting (pure python Nelder-Mead) ----
def nm(f,x0,steps,it=3000):
    n=len(x0); pts=[list(x0)]+[[x0[j]+(steps[j] if j==i else 0) for j in range(n)] for i in range(n)]
    fs=[f(p) for p in pts]
    for _ in range(it):
        o=sorted(range(n+1),key=lambda i:fs[i]); pts=[pts[i] for i in o]; fs=[fs[i] for i in o]
        if abs(fs[-1]-fs[0])<1e-10*(1+abs(fs[0])): break
        c=[sum(p[j] for p in pts[:-1])/n for j in range(n)]
        xr=[c[j]+(c[j]-pts[-1][j]) for j in range(n)]; fr=f(xr)
        if fr<fs[0]:
            xe=[c[j]+2*(c[j]-pts[-1][j]) for j in range(n)]; fe=f(xe)
            pts[-1],fs[-1]=(xe,fe) if fe<fr else (xr,fr)
        elif fr<fs[-2]: pts[-1],fs[-1]=xr,fr
        else:
            xc=[c[j]+0.5*(pts[-1][j]-c[j]) for j in range(n)]; fc=f(xc)
            if fc<fs[-1]: pts[-1],fs[-1]=xc,fc
            else:
                for i in range(1,n+1): pts[i]=[pts[0][j]+0.5*(pts[i][j]-pts[0][j]) for j in range(n)]; fs[i]=f(pts[i])
    i=min(range(n+1),key=lambda i:fs[i]); return pts[i],fs[i]
def expf(p,k): top,d,fl=p; return fl+(top-fl)*math.exp(-d*(k-1))
def powf(p,k): a,b,fl=p; return fl+(a-fl)*k**(-b)
def fit(ys,form,space):
    f=expf if form=='exp' else powf
    x0=[max(ys[0],50),0.15 if form=='exp' else 1.0,max(min(ys),5)]
    def loss(p):
        if p[0]<=0 or p[1]<=0 or p[2]<0 or p[2]>p[0]: return 1e30
        if space=='qp': return sum((f(p,k)-y)**2/max(f(p,k),1) for k,y in zip(K,ys))
        if space=='log': return sum((math.log(max(f(p,k),1e-6))-math.log(max(y,1)))**2 for k,y in zip(K,ys))
        return sum((f(p,k)-y)**2 for k,y in zip(K,ys))
    best=None
    for s in ([1000,.05,50],[3000,.2,200]):
        p,l=nm(loss,x0,s); p,l=nm(loss,p,[p[0]*.1,p[1]*.1,max(p[2]*.1,5)])
        if best is None or l<best[1]: best=(p,l)
    p,l=best
    # pooled R2 on raw scale
    mu=st.mean(ys); ssr=sum((f(p,k)-y)**2 for k,y in zip(K,ys)); r2=1-ssr/sum((y-mu)**2 for y in ys)
    return dict(top=p[0] if form=='exp' else p[0],d_or_b=p[1],floor=p[2],loss=l,R2raw=r2)
def means_for(classes,key):
    return [st.mean(val[(y,k)][key] for y in classes) for k in K]
res={'n_classes':4,'slots':{}, 'fits':{}, 'boot':{}, 'class_strength':{}, 'premium':{}, 'realized':{}}
for key in ('base','aged'):
    res['slots'][key]=slotstats(key)
    ys=means_for(YEARS,key)
    res['fits'][key]={f'{form}_{sp}':fit(ys,form,sp) for form in ('exp','pow') for sp in ('raw','log','qp')}
    # exact class bootstrap: all 4^4 resamples
    bs=defaultdict(list)
    for combo in itertools.product(YEARS,repeat=4):
        if len(set(combo))==1: pass
        yb=means_for(combo,key)
        for sp in ('raw','log','qp'):
            r=fit(yb,'exp',sp); bs[sp].append((r['top'],r['d_or_b'],r['floor']))
    def q(xs,p): xs=sorted(xs); i=p*(len(xs)-1); lo=int(i); return xs[lo]+(xs[min(lo+1,len(xs)-1)]-xs[lo])*(i-lo)
    res['boot'][key]={sp:{nm_:dict(p05=q([b[j] for b in v],.05),p50=q([b[j] for b in v],.5),p95=q([b[j] for b in v],.95)) for j,nm_ in enumerate(('top','d','floor'))} for sp,v in bs.items()}
    # class strength
    cs={}
    for rd in (1,2,3):
        ks=range(14*(rd-1)+1,14*rd+1); pooled=st.mean(val[(y,k)][key] for y in YEARS for k in ks)
        cs[f'R{rd}']={str(y):st.mean(val[(y,k)][key] for k in ks)/pooled for y in YEARS}
    pooled=st.mean(val[(y,k)][key] for y in YEARS for k in K)
    cs['all']={str(y):st.mean(val[(y,k)][key] for k in K)/pooled for y in YEARS}
    for kk in list(cs): v=list(cs[kk].values()); cs[kk]['sd']=st.stdev(v); cs[kk]['range']=[min(v),max(v)]
    # slot-level CV (per-slot sd/mean), averaged by round
    for rd in (1,2,3):
        ks=range(14*(rd-1)+1,14*rd+1)
        cs[f'R{rd}']['mean_slot_CV']=st.mean(st.stdev([val[(y,k)][key] for y in YEARS])/st.mean([val[(y,k)][key] for y in YEARS]) for k in ks)
    res['class_strength'][key]=cs
    v1=[val[(y,1)][key] for y in YEARS]; v23=[(val[(y,2)][key]+val[(y,3)][key])/2 for y in YEARS]
    res['premium'][key]=dict(byclass={str(y):a/b for y,a,b in zip(YEARS,v1,v23)}, ratio_of_means=st.mean(v1)/st.mean(v23), mean1=st.mean(v1),mean23=st.mean(v23))
# ---- realized production ----
W=dict(pts=.5,reb=1,ast=1,stl=2,blk=2,to=-1,tpm=.5,dd=1,td=2)
seasonFP={}; seasonRank={}; norm={}
for s in (2023,2024,2025):
    sd=json.load(open(S+'/stats%d.json'%s))
    fp={pid:sum(W[c]*v.get(c,0) for c in W) for pid,v in sd.items() if isinstance(v,dict) and v.get('gp',0)>0}
    seasonFP[s]=fp; srt=sorted(fp,key=lambda p:-fp[p]); seasonRank[s]={p:i+1 for i,p in enumerate(srt)}
    top150=[fp[p] for p in srt[:150]]; norm[s]=st.mean(top150)
real={}
for y in (2023,2024,2025):
    seasons=[s for s in (2023,2024,2025) if s>=y]
    for k in K:
        pid=val[(y,k)]['pid']
        nfp=st.mean(seasonFP[s].get(pid,0)/norm[s] for s in seasons)
        rv=st.mean(Vb(seasonRank[s][pid]) if pid in seasonRank[s] else 0 for s in seasons)
        real[(y,k)]=(nfp,rv)
rs=[]
for k in K:
    a=[real[(y,k)][0] for y in (2023,2024,2025)]; b=[real[(y,k)][1] for y in (2023,2024,2025)]
    rs.append(dict(k=k,normFP_mean=st.mean(a),rankV_mean=st.mean(b),normFP_byclass=[round(x,3) for x in a]))
res['realized']['slots']=rs
# shape: fit exp to realized rankV and normFP means; compare market (2023-25 only)
mk=means_for([2023,2024,2025],'base')
res['realized']['market_2023_25_fit_log']=fit(mk,'exp','log'); res['realized']['market_2023_25_fit_raw']=fit(mk,'exp','raw')
rvm=[r['rankV_mean'] for r in rs]; fpm=[r['normFP_mean']*1000 for r in rs]
res['realized']['rankV_fit_qp']=fit(rvm,'exp','qp'); res['realized']['market_2023_25_fit_qp']=fit(mk,'exp','qp'); res['realized']['rankV_fit_raw']=fit(rvm,'exp','raw'); res['realized']['rankV_fit_log']=fit(rvm,'exp','log')
res['realized']['normFPx1000_fit_raw']=fit(fpm,'exp','raw')
def spear(a,b):
    ra={i:r for r,i in enumerate(sorted(range(len(a)),key=lambda i:a[i]))}; rb={i:r for r,i in enumerate(sorted(range(len(b)),key=lambda i:b[i]))}
    n=len(a); return 1-6*sum((ra[i]-rb[i])**2 for i in range(n))/(n*(n*n-1))
res['realized']['spearman_slot_vs_normFP_playerlevel']=spear([-k for (y,k) in real],[v[0] for v in real.values()])
res['realized']['spearman_marketV_vs_normFP_playerlevel']=spear([val[yk]['base'] for yk in real],[v[0] for v in real.values()])
# shape by round: share of 3-round total in R1/R2/R3, market vs realized
def shares(xs): t=sum(xs); return [sum(xs[0:14])/t,sum(xs[14:28])/t,sum(xs[28:42])/t]
res['realized']['round_shares']=dict(market_2023_25=shares(mk),realized_rankV=shares(rvm),realized_normFP=shares(fpm),current_curve=shares([cur(k) for k in K]))
res['realized']['top3_vs_slot4_14']=dict(market=st.mean(mk[:3])/st.mean(mk[3:14]),rankV=st.mean(rvm[:3])/st.mean(rvm[3:14]),normFP=st.mean(fpm[:3])/st.mean(fpm[3:14]))
res['current_curve']=dict(top=5000,d=0.155,floor=70,values=[round(cur(k)) for k in K],round_shares=shares([cur(k) for k in K]))
res['players']={f'{y}-{k}':val[(y,k)] for (y,k) in val}
json.dump(res,open(OUT+'/results.json','w'),indent=1,default=str)
# console summary
for key in ('base','aged'):
    print('==',key)
    for s in res['slots'][key]: print(s['k'],round(s['mean']),round(s['median']),round(s['sd']),s['byclass'],' cur',round(cur(s['k'])))
    for f,v in res['fits'][key].items(): print(f,{a:round(b,4) for a,b in v.items()})
    print('boot',json.dumps(res['boot'][key]))
    print('cs',json.dumps(res['class_strength'][key]))
    print('prem',json.dumps(res['premium'][key]))
print('== realized')
for r in rs: print(r['k'],round(r['normFP_mean'],3),round(r['rankV_mean']),r['normFP_byclass'])
for k,v in res['realized'].items():
    if k!='slots': print(k,v)
