import json,math,warnings
import numpy as np,pandas as pd
from scipy import stats
warnings.filterwarnings('ignore')
rng=np.random.default_rng(20261001)
B_BOOT=2000
df=pd.DataFrame(json.load(open('dataset.json')))
df['fp40_ok']=(df['fp40'].notna())&(df['college_season']==df['draft_year'])&(df['mp_total']>=300)
df['fp40_use']=np.where(df['fp40_ok'],df['fp40'],np.nan)
df['bpm_use']=np.where(df['fp40_ok'],df['bpm'],np.nan)
df['ln_pick']=np.log(df['pick']); df['ln_adp']=np.log(df['adp_dynasty']); df['age_c']=df['age_draft']-20
df['has_out']=df['nba_fp_norm'].notna()
R={}
# ---------------- coverage / missingness
cov=df.groupby('draft_year').agg(n=('pick','size'),college=('pre_draft_type',lambda x:int((x=='college').sum())),fp40_ok=('fp40_ok','sum'),adp=('adp_dynasty','count'),sleeper_matched=('sleeper_id','count'))
lot=df[df.pick<=14].groupby('draft_year').agg(top14=('pick','size'),top14_with_fp40=('fp40_ok','sum'))
top5=df[df.pick<=5].groupby('draft_year').agg(top5=('pick','size'),top5_with_fp40=('fp40_ok','sum'))
cov=cov.join(lot).join(top5); cov['top14_excluded_share']=(1-cov.top14_with_fp40/cov.top14).round(3)
R['coverage_by_class']={int(k):{kk:(float(vv) if isinstance(vv,(float,np.floating)) else int(vv)) for kk,vv in v.items()} for k,v in cov.to_dict('index').items()}
# ---------------- targets
o=df[df.has_out&(df.draft_year<=2025)].copy()
pw=lambda s,g:s.groupby(g).rank(pct=True,method='average')
o['T']=pw(o['nba_fp_norm'],o['draft_year'])
# late-bloom target: seasons 2+3 only (3-season classes)
SM=json.load(open('season_means.json'))
def late(r):
    if r['n_seasons_observed']<3: return np.nan
    return (r['fp_s2']/SM[str(int(r['draft_year'])+1)]+r['fp_s3']/SM[str(int(r['draft_year'])+2)])
o['late']=o.apply(late,axis=1)
o['T_late']=pw(o['late'],o['draft_year'])
o['played']=o['nba_gp']>0
# market rank within class (1=best)
o['adp_rank']=o.groupby('draft_year')['adp_dynasty'].rank(method='min')
for c in ['pick','age_draft','fp40_use','bpm_use','adp_dynasty']:
    o['r_'+c]=pw(o[c],o['draft_year'])
SETS={'A_full3(2020-23)':o[o.draft_year<=2023],'B_all(2020-25,K=1..3)':o}
SUB={'all_draftees':lambda s:s,'R1_only(pick<=30)':lambda s:s[s.pick<=30],'top30_by_market_in_class':lambda s:s[s.adp_rank<=30],'played>=1_NBA_game':lambda s:s[s.played],'college_players_only':lambda s:s[s.pre_draft_type=='college']}
R['sample_sizes']={k:int(len(v)) for k,v in SETS.items()}
def sp(x,y,B=1000):
    m=x.notna()&y.notna(); n=int(m.sum())
    if n<12: return dict(n=n,rho=None)
    xs,ys=x[m].values,y[m].values; r,p=stats.spearmanr(xs,ys); bs=[]
    for _ in range(B):
        i=rng.integers(0,n,n); bs.append(stats.spearmanr(xs[i],ys[i])[0])
    return dict(n=n,rho=round(float(r),3),p=round(float(p),4),ci95=[round(float(np.percentile(bs,2.5)),3),round(float(np.percentile(bs,97.5)),3)])
XS=['pick','age_draft','fp40_use','bpm_use','adp_dynasty']
R['a_spearman']={}
for sn,s in SETS.items():
    R['a_spearman'][sn]={}
    for sub,f in SUB.items():
        ss=f(s); R['a_spearman'][sn][sub]={x:sp(ss[x],ss['T']) for x in XS}
        # note: for the sub 'top30_by_market' pick/adp ranges truncated
R['a_spearman_by_class']={}
for y,g in o.groupby('draft_year'):
    R['a_spearman_by_class'][int(y)]={x:(round(float(stats.spearmanr(g[x][g[x].notna()],g['T'][g[x].notna()])[0]),3) if g[x].notna().sum()>=10 else None) for x in XS}|{'n':int(len(g)),'n_seasons':int(g.n_seasons_observed.iloc[0])}
# late-bloomer
R['a_spearman_late_target_seasons2_3']={x:sp(o[x],o['T_late']) for x in XS}
R['x_x_spearman']={f'{a}~{b}':sp(o[a],o[b]) for a,b in [('pick','adp_dynasty'),('pick','age_draft'),('pick','fp40_use'),('adp_dynasty','fp40_use'),('adp_dynasty','age_draft'),('age_draft','fp40_use')]}
# ---------------- helpers
def resid(y,Z):
    A=np.column_stack([np.ones(len(y)),Z]); b=np.linalg.lstsq(A,y,rcond=None)[0]; return y-A@b
def prank(y,x,Z): return float(np.corrcoef(resid(stats.rankdata(y),np.column_stack([stats.rankdata(z) for z in Z])),resid(stats.rankdata(x),np.column_stack([stats.rankdata(z) for z in Z])))[0,1])
def partial(s,xcol,given,ycol='T',B=B_BOOT,by_class=True):
    cols=[xcol]+given+[ycol]; s=s.dropna(subset=cols); n=len(s)
    if n<25: return dict(n=n,r=None)
    Y=s[ycol].values; X=s[xcol].values; Z=[s[g].values for g in given]
    r=prank(Y,X,Z); bs=[]
    for _ in range(B):
        i=rng.integers(0,n,n); bs.append(prank(Y[i],X[i],[z[i] for z in Z]))
    t=r*math.sqrt((n-2-len(given))/(1-r**2)); p=2*(1-stats.t.cdf(abs(t),n-2-len(given)))
    out=dict(n=n,r=round(r,3),ci95=[round(float(np.percentile(bs,2.5)),3),round(float(np.percentile(bs,97.5)),3)],p=round(float(p),4))
    if by_class:
        # class-block bootstrap (resample classes) and per-class values
        cl=s.draft_year.values; ucl=np.unique(cl); per={}
        for c in ucl:
            m=cl==c
            if m.sum()>=15: per[int(c)]=round(prank(Y[m],X[m],[z[m] for z in Z]),3)
        out['by_class']=per
        if len(per)>=3:
            bs2=[]
            for _ in range(1000):
                pick=rng.choice(ucl,len(ucl)); idx=np.concatenate([np.where(cl==c)[0] for c in pick])
                try: bs2.append(prank(Y[idx],X[idx],[z[idx] for z in Z]))
                except Exception: pass
            out['class_block_boot_ci95']=[round(float(np.percentile(bs2,2.5)),3),round(float(np.percentile(bs2,97.5)),3)]
            out['per_class_mean']=round(float(np.mean(list(per.values()))),3)
    return out
# ---------------- (b) incremental over the market (ADP)
R['b_partial_given_adp']={}
for sn,s in SETS.items():
    R['b_partial_given_adp'][sn]={}
    for sub in ['all_draftees','R1_only(pick<=30)','top30_by_market_in_class','played>=1_NBA_game']:
        ss=SUB[sub](s)
        R['b_partial_given_adp'][sn][sub]={x:partial(ss,x,['adp_dynasty']) for x in ['pick','age_draft','fp40_use','bpm_use']}
        R['b_partial_given_adp'][sn][sub]['market_alone_rho']=sp(ss['adp_dynasty'],ss['T'],300)
# partial given pick (is age/fp40 more than slot?) – all, no ADP needed
R['b2_partial_given_pick']={}
for sn,s in SETS.items():
    R['b2_partial_given_pick'][sn]={}
    for sub in ['all_draftees','R1_only(pick<=30)','college_players_only']:
        ss=SUB[sub](s)
        R['b2_partial_given_pick'][sn][sub]={x:partial(ss,x,['pick']) for x in ['age_draft','fp40_use','bpm_use']}
# partial of fp40 given pick and age, age given pick and fp40 (college subset)
R['b3_joint_college']={}
for sn,s in SETS.items():
    ss=s[s.fp40_use.notna()]
    R['b3_joint_college'][sn]={'fp40|pick,age':partial(ss,'fp40_use',['pick','age_draft']),'age|pick,fp40':partial(ss,'age_draft',['pick','fp40_use']),'age|pick':partial(ss,'age_draft',['pick']),
       'fp40|pick,age,adp':partial(ss,'fp40_use',['pick','age_draft','adp_dynasty']),'age|pick,adp':partial(ss,'age_draft',['pick','adp_dynasty'])}
# OLS standardized (ranks) with bootstrap
def ols_std(Y,X):
    Xz=(X-X.mean(0))/X.std(0); Yz=(Y-Y.mean())/Y.std(); A=np.column_stack([np.ones(len(Yz)),Xz]); b=np.linalg.lstsq(A,Yz,rcond=None)[0]; res=Yz-A@b; return b[1:],1-res.var()
def ols_block(s,preds,label):
    cols=['r_adp_dynasty']+preds; s=s.dropna(subset=cols+['T']); n=len(s); Y=s['T'].values; X=s[cols].values.astype(float)
    b,r2=ols_std(Y,X); bs=[];dr=[]
    for _ in range(B_BOOT):
        i=rng.integers(0,n,n); bb,rr=ols_std(Y[i],X[i]); bs.append(bb); dr.append(rr-ols_std(Y[i],X[i][:,:1])[1])
    bs=np.array(bs); _,r2a=ols_std(Y,X[:,:1])
    k=len(preds); F=((r2-r2a)/k)/((1-r2)/(n-k-2))
    return dict(n=n,r2=round(float(r2),3),r2_adp_only=round(float(r2a),3),delta_r2=round(float(r2-r2a),3),delta_r2_ci95=[round(float(np.percentile(dr,2.5)),3),round(float(np.percentile(dr,97.5)),3)],nested_F_p=round(float(1-stats.f.cdf(F,k,n-k-2)),4),
        beta={c:dict(b=round(float(x),3),ci95=[round(float(np.percentile(bs[:,j],2.5)),3),round(float(np.percentile(bs[:,j],97.5)),3)]) for j,(c,x) in enumerate(zip(cols,b))})
R['b4_ols_rank_models']={}
for sn,s in SETS.items():
    R['b4_ols_rank_models'][sn]={'T~adp+pick+age':ols_block(s,['r_pick','r_age_draft'],''),'T~adp+fp40':ols_block(s,['r_fp40_use'],''),'T~adp+pick+age+fp40':ols_block(s,['r_pick','r_age_draft','r_fp40_use'],'')}
    R['b4_ols_rank_models'][sn]['T~adp+pick+age (R1 only)']=ols_block(s[s.pick<=30],['r_pick','r_age_draft'],'')
    R['b4_ols_rank_models'][sn]['T~adp+pick+age+fp40 (R1 only)']=ols_block(s[s.pick<=30],['r_pick','r_age_draft','r_fp40_use'],'')
# ---------------- leave-one-class-out blends: market vs slot vs college
def fit(X,y): A=np.column_stack([np.ones(len(y)),X]); return np.linalg.lstsq(A,y,rcond=None)[0]
def pr(b,X): return np.column_stack([np.ones(len(X)),X])@b
def loco(s,cols,ycol='T',min_train=40):
    s=s.dropna(subset=cols+[ycol]).copy(); yhat=pd.Series(np.nan,index=s.index)
    for y in s.draft_year.unique():
        tr=s[s.draft_year!=y]; te=s[s.draft_year==y]
        b=fit(tr[cols].values,tr[ycol].values); yhat[te.index]=pr(b,te[cols].values)
    y=s[ycol]; res=y-yhat
    r2=1-float((res**2).sum()/((y-y.mean())**2).sum()); rho=float(stats.spearmanr(yhat,y)[0])
    wr=[stats.spearmanr(yhat[s.draft_year==c],y[s.draft_year==c])[0] for c in s.draft_year.unique() if (s.draft_year==c).sum()>=10]
    # bootstrap CI for cv rmse via resampling residuals pairs
    b=fit(s[cols].values,s[ycol].values)
    return dict(n=int(len(s)),cv_r2=round(r2,3),cv_rmse=round(float(np.sqrt((res**2).mean())),3),cv_spearman_pooled=round(rho,3),cv_spearman_mean_within_class=round(float(np.mean(wr)),3),
                per_class_spearman={int(c):round(float(stats.spearmanr(yhat[s.draft_year==c],y[s.draft_year==c])[0]),3) for c in sorted(s.draft_year.unique()) if (s.draft_year==c).sum()>=10},
                full_fit=dict(zip(['intercept']+cols,[round(float(v),4) for v in b])))
R['c_fallback_loco']={}
for sn,s in SETS.items():
    cs={}
    cs['pick(ln)']=loco(s,['ln_pick']); cs['pick(linear)']=loco(s,['pick']); cs['pick(ln)+age']=loco(s,['ln_pick','age_c'])
    cs['age only']=loco(s,['age_c'])
    sc=s[s.fp40_use.notna()]
    for nm,c in [('pick(ln)',['ln_pick']),('pick(ln)+age',['ln_pick','age_c']),('pick(ln)+fp40',['ln_pick','fp40_use']),('pick(ln)+age+fp40',['ln_pick','age_c','fp40_use']),('pick(ln)+age+bpm',['ln_pick','age_c','bpm_use']),('fp40 only',['fp40_use']),('age+fp40 (no slot)',['age_c','fp40_use'])]:
        cs['[college w/ fp40] '+nm]=loco(sc,c)
    sa=s[s.adp_dynasty.notna()]
    for nm,c in [('adp(ln)',['ln_adp']),('pick(ln)',['ln_pick']),('pick(ln)+age',['ln_pick','age_c']),('adp(ln)+pick(ln)',['ln_adp','ln_pick']),('adp(ln)+pick(ln)+age',['ln_adp','ln_pick','age_c'])]:
        cs['[has ADP] '+nm]=loco(sa,c)
    sb=sa[sa.fp40_use.notna()]
    for nm,c in [('adp(ln)',['ln_adp']),('adp(ln)+fp40',['ln_adp','fp40_use']),('adp(ln)+pick(ln)+age',['ln_adp','ln_pick','age_c']),('adp(ln)+pick(ln)+age+fp40',['ln_adp','ln_pick','age_c','fp40_use'])]:
        cs['[ADP & college] '+nm]=loco(sb,c)
    # first round has-ADP
    s1=sa[sa.pick<=30]
    for nm,c in [('adp(ln)',['ln_adp']),('pick(ln)+age',['ln_pick','age_c']),('adp(ln)+pick(ln)+age',['ln_adp','ln_pick','age_c'])]:
        cs['[R1 & ADP] '+nm]=loco(s1,c)
    R['c_fallback_loco'][sn]=cs
# ---------------- (d) shipped prior
s=o.dropna(subset=['ln_pick','age_c','T'])
cols=['ln_pick','age_c']
b=fit(s[cols].values,s['T'].values); Bs=[]
for _ in range(B_BOOT):
    i=rng.integers(0,len(s),len(s)); Bs.append(fit(s[cols].values[i],s['T'].values[i]))
Bs=np.array(Bs); res=s['T'].values-pr(b,s[cols].values)
R['d_prior_all_2020_2025']=dict(n=int(len(s)),a=round(float(b[0]),4),b_ln_pick=round(float(b[1]),4),c_age=round(float(b[2]),4),ci95={k:[round(float(np.percentile(Bs[:,j],2.5)),4),round(float(np.percentile(Bs[:,j],97.5)),4)] for j,k in enumerate(['a','b_ln_pick','c_age'])},resid_sd=round(float(res.std()),3))
s3=o[o.draft_year<=2023].dropna(subset=['ln_pick','age_c','T'])
b3=fit(s3[cols].values,s3['T'].values); B3=[]
for _ in range(B_BOOT):
    i=rng.integers(0,len(s3),len(s3)); B3.append(fit(s3[cols].values[i],s3['T'].values[i]))
B3=np.array(B3)
R['d_prior_full3_2020_2023']=dict(n=int(len(s3)),a=round(float(b3[0]),4),b_ln_pick=round(float(b3[1]),4),c_age=round(float(b3[2]),4),ci95={k:[round(float(np.percentile(B3[:,j],2.5)),4),round(float(np.percentile(B3[:,j],97.5)),4)] for j,k in enumerate(['a','b_ln_pick','c_age'])},resid_sd=round(float(np.std(s3['T'].values-pr(b3,s3[cols].values))),3))
# pick-only prior for reference
b1=fit(s3[['ln_pick']].values,s3['T'].values); R['d_prior_pick_only_full3']=dict(a=round(float(b1[0]),4),b_ln_pick=round(float(b1[1]),4))
# FP-units prior: E[ sum over 3 seasons FP/mean_qualified ] (units = "qualified-average player-seasons") ~ a + b ln(pick) (+age)
Xn=s3[cols].values; yn=s3['nba_fp_norm'].values; bn=fit(Xn,yn)
R['d_prior_fp_units_full3']=dict(n=int(len(s3)),note='E[sum of 3 seasons FP/qualified-season-mean] (qualified-player-season equivalents) = a + b ln(pick) + c(age-20), floor 0',a=round(float(bn[0]),4),b_ln_pick=round(float(bn[1]),4),c_age=round(float(bn[2]),4))
bn1=fit(s3[['ln_pick']].values,yn); R['d_prior_fp_units_full3']['pick_only']=dict(a=round(float(bn1[0]),4),b=round(float(bn1[1]),4))
# calibration table
bins=[0,3,5,10,14,20,30,40,50,60]
o['bucket']=pd.cut(o['pick'],bins)
cal=o[o.draft_year<=2023].groupby('bucket',observed=True).agg(n=('T','size'),mean_T_pct=('T','mean'),sd_T=('T','std'),mean_fp_norm3=('nba_fp_norm','mean'),share_never_played=('played',lambda x:1-x.mean()),mean_age=('age_draft','mean')).round(3)
R['d_calibration_by_pick_full3']={str(k):v for k,v in cal.to_dict('index').items()}
# age effect conditional on pick tier
o['tier']=pd.cut(o['pick'],[0,5,14,30,60],labels=['1-5','6-14','15-30','31-60'])
o['young']=(o['age_draft']<o.groupby('tier',observed=True)['age_draft'].transform('median'))
R['d_age_within_tier']={str(t):{'n':int(len(g)),'median_age':round(float(g.age_draft.median()),2),'mean_T_young_half':round(float(g[g.young]['T'].mean()),3),'mean_T_old_half':round(float(g[~g.young]['T'].mean()),3),'n_young':int(g.young.sum())} for t,g in o.groupby('tier',observed=True)}
# 2026 application
d26=df[df.draft_year==2026].copy(); ag=d26['age_c'].fillna(d26['age_c'].median())
bb=b3
d26['prior_pct_full3']=np.clip(bb[0]+bb[1]*np.log(d26['pick'])+bb[2]*ag,0,1).round(3)
d26['prior_pct_all']=np.clip(b[0]+b[1]*np.log(d26['pick'])+b[2]*ag,0,1).round(3)
d26['adp_class_pct']=d26['adp_dynasty'].rank(pct=True,ascending=False).round(3)
R['prior_2026']=d26[['pick','name','sleeper_id','age_draft','pre_draft_type','fp40_use','adp_dynasty','prior_pct_full3','prior_pct_all','adp_class_pct','in_league_2026_rookie_draft']].astype(object).where(d26[['pick','name','sleeper_id','age_draft','pre_draft_type','fp40_use','adp_dynasty','prior_pct_full3','prior_pct_all','adp_class_pct','in_league_2026_rookie_draft']].notna(),None).to_dict('records')
def enc(v):
    if isinstance(v,(np.floating,)): return None if np.isnan(v) else float(v)
    if isinstance(v,np.integer): return int(v)
    if isinstance(v,np.bool_): return bool(v)
    return str(v)
json.dump(R,open('results.json','w'),indent=1,default=enc)
o.to_csv('analysis_frame.csv',index=False)
print('done',R['sample_sizes'])
