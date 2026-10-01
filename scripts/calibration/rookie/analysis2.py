import json,math,warnings
import numpy as np,pandas as pd
from scipy import stats
warnings.filterwarnings('ignore')
rng=np.random.default_rng(777)
R=json.load(open('results.json'))
o=pd.read_csv('analysis_frame.csv')
o['ln_pick']=np.log(o['pick']); o['age_c']=o['age_draft']-20
def fit(X,y): A=np.column_stack([np.ones(len(y)),X]); return np.linalg.lstsq(A,y,rcond=None)[0]
def pr(b,X): return np.column_stack([np.ones(len(X)),X])@b
def oof(s,cols,ycol='T'):
    yh=pd.Series(np.nan,index=s.index)
    for y in s.draft_year.unique():
        tr=s[s.draft_year!=y]; te=s[s.draft_year==y]
        yh[te.index]=pr(fit(tr[cols].values,tr[ycol].values),te[cols].values)
    return yh
def r2(y,yh): return 1-float(((y-yh)**2).sum()/((y-y.mean())**2).sum())
out={}
# LOCO with within-class percentile predictors (removes ADP scale differences across years)
def loco_block(s,label):
    res={}
    sa=s.dropna(subset=['r_adp_dynasty'])
    specs={'rank_adp':['r_adp_dynasty'],'ln_pick':['ln_pick'],'rank_pick':['r_pick'],'ln_pick+age':['ln_pick','age_c'],'rank_adp+ln_pick':['r_adp_dynasty','ln_pick'],'rank_adp+ln_pick+age':['r_adp_dynasty','ln_pick','age_c']}
    for k,c in specs.items():
        yh=oof(sa,c); res[k]=dict(n=int(len(sa)),cv_r2=round(r2(sa['T'],yh),3),cv_spearman=round(float(stats.spearmanr(yh,sa['T'])[0]),3))
    sc=sa.dropna(subset=['r_fp40_use'])
    for k,c in {'rank_adp':['r_adp_dynasty'],'rank_adp+rank_fp40':['r_adp_dynasty','r_fp40_use'],'ln_pick+age':['ln_pick','age_c'],'ln_pick+age+rank_fp40':['ln_pick','age_c','r_fp40_use'],'rank_adp+ln_pick+age':['r_adp_dynasty','ln_pick','age_c'],'rank_adp+ln_pick+age+rank_fp40':['r_adp_dynasty','ln_pick','age_c','r_fp40_use']}.items():
        yh=oof(sc,c); res['[ADP&college] '+k]=dict(n=int(len(sc)),cv_r2=round(r2(sc['T'],yh),3),cv_spearman=round(float(stats.spearmanr(yh,sc['T'])[0]),3))
    # blend weight: yhat = w*oof(adp rank) + (1-w)*oof(slot: ln_pick+age); grid
    ya=oof(sa,['r_adp_dynasty']); ys=oof(sa,['ln_pick','age_c']); y=sa['T']
    ws=np.linspace(0,1,21); cv=[r2(y,w*ya+(1-w)*ys) for w in ws]
    wbest=float(ws[int(np.argmax(cv))]); bs=[]
    idx=np.arange(len(sa))
    for _ in range(1000):
        i=rng.integers(0,len(sa),len(sa)); yi=y.values[i]
        bs.append(float(ws[int(np.argmax([r2(pd.Series(yi),pd.Series(w*ya.values[i]+(1-w)*ys.values[i])) for w in ws]))]))
    res['blend_market_weight']=dict(n=int(len(sa)),w_market_best=wbest,ci95=[float(np.percentile(bs,2.5)),float(np.percentile(bs,97.5)),],cv_r2_at_w0_slot_only=round(cv[0],3),cv_r2_at_w1_market_only=round(cv[-1],3),cv_r2_best=round(max(cv),3),cv_r2_at_w05=round(cv[10],3))
    # by class: R2 of market-only vs slot-only
    res['by_class_cv_spearman']={int(c):dict(market=round(float(stats.spearmanr(ya[sa.draft_year==c],y[sa.draft_year==c])[0]),3),slot=round(float(stats.spearmanr(ys[sa.draft_year==c],y[sa.draft_year==c])[0]),3),n=int((sa.draft_year==c).sum())) for c in sorted(sa.draft_year.unique())}
    return res
full3=o[o.draft_year<=2023]
out['loco_percentile_predictors']={'A_full3_all_with_ADP':loco_block(full3,'A'),'B_all_with_ADP':loco_block(o,'B'),'A_full3_R1_with_ADP':loco_block(full3[full3.pick<=30],'A1'),'B_all_R1_with_ADP':loco_block(o[o.pick<=30],'B1'),'A_full3_top30_by_market':loco_block(full3[full3.adp_rank<=30],'A2'),'B_all_top30_by_market':loco_block(o[o.adp_rank<=30],'B2')}
# ADP-missing group diagnostics (selection) and fallback calibration
for nm,s in [('A_full3',full3),('B_all',o)]:
    d={}
    for lab,m in [('adp_present',s.adp_dynasty.notna()),('adp_missing',s.adp_dynasty.isna())]:
        g=s[m]; d[lab]=dict(n=int(len(g)),mean_pick=round(float(g.pick.mean()),1),median_pick=float(g.pick.median()),mean_T=round(float(g['T'].mean()),3),share_never_played=round(float(1-g.played.mean()),3),R1_n=int((g.pick<=30).sum()))
    # slot+age fallback fit on all (LOCO), bias on ADP-missing
    yh=oof(s.dropna(subset=['ln_pick','age_c']),['ln_pick','age_c']); ss=s.dropna(subset=['ln_pick','age_c']).copy(); ss['yh']=yh; ss['res']=ss['T']-ss['yh']
    d['fallback_slot_age_loco_bias']={lab:dict(n=int(m.sum()),mean_resid=round(float(ss[m]['res'].mean()),3),rmse=round(float(np.sqrt((ss[m]['res']**2).mean())),3)) for lab,m in [('adp_present',ss.adp_dynasty.notna()),('adp_missing',ss.adp_dynasty.isna()),('college',ss.pre_draft_type=='college'),('non_college(intl/ignite/OTE)',ss.pre_draft_type!='college'),('non_college_top14',(ss.pre_draft_type!='college')&(ss.pick<=14)),('college_top14',(ss.pre_draft_type=='college')&(ss.pick<=14))]}
    # fit fallback only on ADP-missing group
    sm=ss[ss.adp_dynasty.isna()]
    if len(sm)>20:
        b=fit(sm[['ln_pick','age_c']].values,sm['T'].values); d['fit_on_adp_missing_only']=dict(n=int(len(sm)),a=round(float(b[0]),4),b_ln_pick=round(float(b[1]),4),c_age=round(float(b[2]),4))
    out['adp_selection_'+nm]=d
# non-college vs college by tier
tiers=pd.cut(o['pick'],[0,5,14,30,60],labels=['1-5','6-14','15-30','31-60'])
out['T_by_tier_and_type_all']={str(t):{ty:dict(n=int(((tiers==t)&(o.pre_draft_type==ty)).sum()),mean_T=round(float(o[(tiers==t)&(o.pre_draft_type==ty)]['T'].mean()),3) if ((tiers==t)&(o.pre_draft_type==ty)).sum() else None) for ty in ['college','non_college']} for t in tiers.cat.categories for _ in [0]} if False else None
o['ty']=np.where(o.pre_draft_type=='college','college','non_college')
out['T_by_tier_and_type_all']={}
for t in ['1-5','6-14','15-30','31-60']:
    out['T_by_tier_and_type_all'][t]={ty:dict(n=int(((tiers==t)&(o.ty==ty)).sum()),mean_T=(round(float(o[(tiers==t)&(o.ty==ty)]['T'].mean()),3) if ((tiers==t)&(o.ty==ty)).sum() else None)) for ty in ['college','non_college']}
# mean-FP units spot: fp_norm3 for full3 by tier
# fp40 sensitivity: partial given pick using within-class fp40 percentile, college, R1 -- done in analysis.py
# simple pick->T lookup (isotonic-ish smoothing): bins of 5 for the shipped table, full3 and all
o['b5']=pd.cut(o['pick'],[0,1,2,3,5,8,12,16,20,25,30,35,40,45,50,60])
tab=o.groupby('b5',observed=True).agg(n=('T','size'),mean_T=('T','mean'),mean_fp_norm=('nba_fp_norm','mean')).round(3)
out['lookup_all_2020_2025']={str(k):v for k,v in tab.to_dict('index').items()}
R['extra']=out
def enc(v):
    if isinstance(v,(np.floating,)): return None if np.isnan(v) else float(v)
    if isinstance(v,np.integer): return int(v)
    return str(v)
json.dump(R,open('results.json','w'),indent=1,default=enc)
print(json.dumps(out['loco_percentile_predictors']['A_full3_all_with_ADP'],indent=1))
print(json.dumps(out['loco_percentile_predictors']['B_all_with_ADP']['blend_market_weight']))
for k in ['A_full3_R1_with_ADP','A_full3_top30_by_market','B_all_top30_by_market']: print(k,out['loco_percentile_predictors'][k]['blend_market_weight'])
print(json.dumps(out['adp_selection_A_full3'],indent=1)); print(json.dumps(out['adp_selection_B_all']['fallback_slot_age_loco_bias']))
print(out['T_by_tier_and_type_all'])
