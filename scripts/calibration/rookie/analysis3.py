import json,warnings
import numpy as np,pandas as pd
from scipy import stats,optimize
warnings.filterwarnings('ignore')
rng=np.random.default_rng(31337)
R=json.load(open('results.json'))
o=pd.read_csv('analysis_frame.csv')
forms={
 'linear':(lambda p,a,b:a+b*p,[0.9,-0.01]),
 'ln':(lambda p,a,b:a+b*np.log(p),[1.1,-0.2]),
 'sqrt':(lambda p,a,b:a+b*np.sqrt(p),[1.0,-0.1]),
 'expdecay_floor':(lambda p,a,b,c:a+b*np.exp(-p/c),[0.25,0.7,15.0]),
 'logistic_in_ln':(lambda p,a,b,c:1/(1+np.exp(-(a+b*np.log(p)))),[2,-0.8]),
}
def fitf(f,p0,x,y):
    try: return optimize.curve_fit(f,x,y,p0=p0,maxfev=20000)[0]
    except Exception: return None
res={}
for samp,s in [('full3',o[o.draft_year<=2023]),('all',o)]:
    res[samp]={}
    for nm,(f,p0) in forms.items():
        oof=pd.Series(np.nan,index=s.index)
        for y in s.draft_year.unique():
            tr=s[s.draft_year!=y]; te=s[s.draft_year==y]
            p=fitf(f,p0,tr['pick'].values.astype(float),tr['T'].values)
            if p is not None: oof[te.index]=np.clip(f(te['pick'].values.astype(float),*p),0,1)
        m=oof.notna(); y_=s['T'][m]
        full=fitf(f,p0,s['pick'].values.astype(float),s['T'].values)
        res[samp][nm]=dict(n=int(m.sum()),cv_r2=round(1-float(((y_-oof[m])**2).sum()/((y_-y_.mean())**2).sum()),3),cv_rmse=round(float(np.sqrt(((y_-oof[m])**2).mean())),3),params=[round(float(v),4) for v in full] if full is not None else None)
R['d_functional_forms_loco']=res
# age added to chosen forms: expdecay + b*age
f2=lambda X,a,b,c,d:a+b*np.exp(-X[0]/c)+d*(X[1]-20)
s=o.dropna(subset=['age_draft'])
for samp,ss in [('full3',s[s.draft_year<=2023]),('all',s)]:
    oof=pd.Series(np.nan,index=ss.index)
    for y in ss.draft_year.unique():
        tr=ss[ss.draft_year!=y]; te=ss[ss.draft_year==y]
        p=optimize.curve_fit(f2,(tr['pick'].values.astype(float),tr['age_draft'].values),tr['T'].values,p0=[0.25,0.7,15,0.0],maxfev=20000)[0]
        oof[te.index]=np.clip(f2((te['pick'].values.astype(float),te['age_draft'].values),*p),0,1)
    p=optimize.curve_fit(f2,(ss['pick'].values.astype(float),ss['age_draft'].values),ss['T'].values,p0=[0.25,0.7,15,0.0],maxfev=20000)[0]
    y_=ss['T']; R['d_functional_forms_loco'][samp]['expdecay_floor+age']=dict(n=int(len(ss)),cv_r2=round(1-float(((y_-oof)**2).sum()/((y_-y_.mean())**2).sum()),3),params=[round(float(v),4) for v in p])
# bootstrap CI for expdecay (full3 & all) params
f=forms['expdecay_floor'][0]
for samp,ss in [('full3',o[o.draft_year<=2023]),('all',o)]:
    bs=[]
    for _ in range(1000):
        i=rng.integers(0,len(ss),len(ss)); p=fitf(f,forms['expdecay_floor'][1],ss['pick'].values[i].astype(float),ss['T'].values[i])
        if p is not None: bs.append(p)
    bs=np.array(bs); R['d_functional_forms_loco'][samp]['expdecay_floor']['boot_ci95']={k:[round(float(np.percentile(bs[:,j],2.5)),3),round(float(np.percentile(bs[:,j],97.5)),3)] for j,k in enumerate('abc')}
# apply chosen prior to 2026 with pick-only expdecay (all-class fit) and compare vs ADP class percentile
pall=np.array(res['all']['expdecay_floor']['params']); pf3=np.array(res['full3']['expdecay_floor']['params'])
d26=pd.DataFrame(R['prior_2026'])
d26['prior_pick_exp_all']=np.clip(pall[0]+pall[1]*np.exp(-d26['pick']/pall[2]),0,1).round(3)
d26['prior_pick_exp_full3']=np.clip(pf3[0]+pf3[1]*np.exp(-d26['pick']/pf3[2]),0,1).round(3)
R['prior_2026']=json.loads(d26.to_json(orient='records'))
def enc(v):
    if isinstance(v,(np.floating,)): return None if np.isnan(v) else float(v)
    if isinstance(v,np.integer): return int(v)
    return str(v)
json.dump(R,open('results.json','w'),indent=1,default=enc)
print(json.dumps(res,indent=1))
