import json,warnings
import numpy as np,pandas as pd
from scipy import optimize
warnings.filterwarnings('ignore')
rng=np.random.default_rng(4242)
R=json.load(open('results.json')); o=pd.read_csv('analysis_frame.csv')
f1=lambda X,A,t:A*np.exp(-X[0]/t)
f2=lambda X,A,t,d:A*np.exp(-X[0]/t)+d*(X[1]-20)
def run(ss,f,p0,cols):
    X=lambda d:tuple(d[c].values.astype(float) for c in cols)
    oof=pd.Series(np.nan,index=ss.index)
    for y in ss.draft_year.unique():
        tr=ss[ss.draft_year!=y]; te=ss[ss.draft_year==y]
        p=optimize.curve_fit(f,X(tr),tr['T'].values,p0=p0,maxfev=20000)[0]; oof[te.index]=np.clip(f(X(te),*p),0,1)
    y_=ss['T']; p=optimize.curve_fit(f,X(ss),ss['T'].values,p0=p0,maxfev=20000)[0]
    bs=[]
    for _ in range(1000):
        i=rng.integers(0,len(ss),len(ss)); d=ss.iloc[i]
        try: bs.append(optimize.curve_fit(f,X(d),d['T'].values,p0=p0,maxfev=20000)[0])
        except Exception: pass
    bs=np.array(bs)
    pr=np.clip(f(X(ss),*p),0,1)
    return dict(n=int(len(ss)),cv_r2=round(1-float(((y_-oof)**2).sum()/((y_-y_.mean())**2).sum()),3),cv_rmse=round(float(np.sqrt(((y_-oof)**2).mean())),3),params=[round(float(v),4) for v in p],boot_ci95=[[round(float(np.percentile(bs[:,j],2.5)),4),round(float(np.percentile(bs[:,j],97.5)),4)] for j in range(len(p))],resid_sd=round(float(np.std(y_-pr)),3))
out={}
s3=o[(o.draft_year<=2023)].dropna(subset=['age_draft']); sa=o.dropna(subset=['age_draft'])
for nm,ss in [('full3',s3),('all',sa)]:
    out[nm]={'pick_only: T=A*exp(-pick/tau)':run(ss,f1,[0.95,45],['pick']),'pick+age: T=A*exp(-pick/tau)+d*(age-20)':run(ss,f2,[0.95,45,0.02],['pick','age_draft'])}
# calibration of chosen (full3 pick-only) by bucket, and mean fp units E[fp_norm3] ~ B*exp(-pick/tau2)
p=out['full3']['pick_only: T=A*exp(-pick/tau)']['params']
s3=s3.assign(pred=np.clip(p[0]*np.exp(-s3.pick/p[1]),0,1))
s3['bkt']=pd.cut(s3.pick,[0,3,5,10,14,20,30,40,50,60])
out['calibration_full3']={str(k):v for k,v in s3.groupby('bkt',observed=True).agg(n=('T','size'),obs_T=('T','mean'),pred_T=('pred','mean'),obs_fp_norm3=('nba_fp_norm','mean')).round(3).to_dict('index').items()}
g=lambda X,B,t:B*np.exp(-X[0]/t)
pg=optimize.curve_fit(g,(s3.pick.values.astype(float),),s3.nba_fp_norm.values,p0=[5,30])[0]
out['fp_units_full3']=dict(n=int(len(s3)),B=round(float(pg[0]),3),tau=round(float(pg[1]),2),note='E[sum over 3 seasons of FP_s/mean qualified FP_s] = B*exp(-pick/tau); 3.0 = a qualified-average player for all 3 seasons')
R['d_ship']=out
d26=pd.DataFrame(R['prior_2026'])
pa=out['all']['pick+age: T=A*exp(-pick/tau)+d*(age-20)']['params']
pf=out['full3']['pick_only: T=A*exp(-pick/tau)']['params']
ag=d26['age_draft'].fillna(d26['age_draft'].median())
d26['ship_pick_only_full3']=np.clip(pf[0]*np.exp(-d26['pick']/pf[1]),0,1).round(3)
d26['ship_pick_age_all']=np.clip(pa[0]*np.exp(-d26['pick']/pa[1])+pa[2]*(ag-20),0,1).round(3)
d26['ship_fp_units']=(pg[0]*np.exp(-d26['pick']/pg[1])).round(2)
R['prior_2026']=json.loads(d26.to_json(orient='records'))
def enc(v):
    if isinstance(v,(np.floating,)): return None if np.isnan(v) else float(v)
    if isinstance(v,np.integer): return int(v)
    return str(v)
json.dump(R,open('results.json','w'),indent=1,default=enc)
print(json.dumps(out,indent=1))
