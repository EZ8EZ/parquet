import json,os,re,csv,difflib,datetime
from cbb_parse import parse_page,norm
D=json.load(open('draft_sleeper.json'))
SLUG=json.load(open('college_slug.json'))
W=json.load(open('wiki_draft.json'))
P=json.load(open('raw/players.json'))
BIRTH_OVR={'4892':('2006-01-27','web: Wikipedia/Champions League/The Athletic')}
OVR_SLEEPER={('Nikola Djurisic',2024):'2757'}
LEAGUE42="4873,4866,4862,4882,4891,4884,4881,4871,4876,4883,4864,4885,4880,4869,4888,4874,4863,4867,4875,4865,4868,4887,4877,4895,4915,4870,4886,4879,4878,4872,4889,4900,4904,4905,4890,4921,4913,4922,4902,4908,4918,4919".split(",")
# ---- Sleeper outcomes
def fp(s):
    g=lambda k:s.get(k,0) or 0
    return 0.5*g('pts')+g('reb')+g('ast')+2*g('stl')+2*g('blk')-g('to')+0.5*g('tpm')+g('dd')+2*g('td')+2*g('bonus_pt_40p')+2*g('bonus_pt_50p')-2*g('tf')-2*g('ff')
ST={};SMEAN={}
for y in range(2020,2026):
    S={k:v for k,v in json.load(open(f'raw/stats{y}.json')).items() if k.isdigit()}
    ST[y]=S
    mg=max(v.get('gp',0) for v in S.values())
    q=[fp(v) for v in S.values() if v.get('gp',0)>=0.5*mg]
    SMEAN[y]=sum(q)/len(q)
PR={y:json.load(open(f'raw/proj{y}.json')) for y in range(2020,2027)}
LASTSEASON=2025
def draft_night(d): return datetime.date.fromisoformat(d)
def age(bd,dd):
    if not bd: return None
    return round((draft_night(dd)-datetime.date.fromisoformat(bd)).days/365.25,3)
# ---- CBB
cache={}
def page(slug,y):
    k=(slug,y)
    if k not in cache:
        f=f'raw/cbb/{slug}_{y}.html'
        cache[k]=parse_page(f) if os.path.exists(f) and os.path.getsize(f)>50000 else None
    return cache[k]
NAME_ALIAS={'bones hyland':"nahshon hyland",'bub carrington':'carlton carrington'}
def find(pg,name):
    n=NAME_ALIAS.get(norm(name),norm(name)); recs=list(pg.values())
    ex=[r for r in recs if norm(r['name'])==n]
    if len(ex)==1: return ex[0],'exact'
    parts=n.split()
    if parts:
        c=[r for r in recs if norm(r['name']).split() and norm(r['name']).split()[-1]==parts[-1] and norm(r['name'])[:1]==n[:1]]
        if len(c)==1: return c[0],'last+initial'
    best=difflib.get_close_matches(n,[norm(r['name']) for r in recs],n=1,cutoff=0.86)
    if best:
        c=[r for r in recs if norm(r['name'])==best[0]]
        if len(c)==1: return c[0],'fuzzy'
    return None,None
FP_W=dict(pts=0.5,reb=1,ast=1,stl=2,blk=2,tov=-1,tpm=0.5)
rows=[];unresolved=[]
wiki_by={(y,r['pick']):r for y,rs in W.items() for r in rs for y in [int(y)]}
for d in D:
    y=d['draft_year']; pid=d['sleeper_id'] or OVR_SLEEPER.get((d['name'],y))
    sp=P.get(pid) if pid else None
    w=wiki_by.get((y,d['pick']),{})
    bd=sp.get('birth_date') if sp else None
    bsrc='sleeper' if bd else None
    if not bd and pid in BIRTH_OVR: bd,bsrc=BIRTH_OVR[pid]
    r=dict(draft_year=y,pick=d['pick'],round=1 if d['pick']<=30 else 2,name=d['name'],nba_team=d['team'],
        pre_draft_team=w.get('wiki_team'),nationality=w.get('nationality'),college=d['college'] or None,
        birth_date=bd,birth_source=bsrc,wiki_name_ok=(norm(w.get('wiki_name',''))==norm(d['name'])) if w else None,age_draft=age(bd,d['draft_date']),sleeper_id=pid,
        sleeper_name=sp.get('full_name') if sp else None,bbref_nba_g_thru_2025_26=int(d['nba_g']) if d['nba_g'].isdigit() else 0)
    pdt=(w.get('wiki_team') or '')
    if d['college']: r['pre_draft_type']='college'
    elif 'G League' in pdt: r['pre_draft_type']='g_league_ignite'
    elif 'Overtime Elite' in pdt: r['pre_draft_type']='overtime_elite'
    elif 'postgraduate' in pdt.lower() or 'prep' in pdt.lower(): r['pre_draft_type']='prep_postgrad'
    else: r['pre_draft_type']='international_pro'
    # match confidence
    if not pid: r['match_conf']='unmatched'
    else:
        sg=sum((ST[s].get(pid) or {}).get('gp',0) for s in ST)
        r['sleeper_gp_2020_25']=sg
        if y<2026:
            if r['bbref_nba_g_thru_2025_26']>=10 and abs(sg-r['bbref_nba_g_thru_2025_26'])<=2: r['match_conf']='high_gp_verified'
            elif r['bbref_nba_g_thru_2025_26']<10 and abs(sg-r['bbref_nba_g_thru_2025_26'])<=1: r['match_conf']='medium_name_unique_gp_small_agree'
            else: r['match_conf']='low_check'
        else:
            nm=norm(sp.get('full_name') or '')==norm(d['name'])
            r['match_conf']='high_league_id_list' if pid in LEAGUE42 else ('medium_name_unique_2026' if nm else 'low_check')
    r['in_league_2026_rookie_draft']=bool(pid in LEAGUE42) if y==2026 else None
    # college stats
    r.update({k:None for k in ['cbb_slug','college_season','college_stat_match','games','mpg','pts','reb','ast','stl','blk','tov','tpm','fp_per_game','fp40','per40_pts','per40_reb','per40_ast','per40_stl','per40_blk','per40_tov','per40_tpm','bpm','obpm','dbpm','per','usg_pct','ts_pct','ws40','mp_total','college_pos']})
    if d['college']:
        slug=SLUG.get(d['college'])
        r['cbb_slug_school']=slug
        found=None
        for sy in (y,y-1,y-2,y-3):
            pg=page(slug,sy) if slug else None
            if pg is None:
                if slug: unresolved.append((slug,sy,d['name'],y))
                continue
            rec,how=find(pg,d['name'])
            if rec: found=(rec,how,sy);break
        if found:
            rec,how,sy=found
            r['college_season']=sy; r['college_stat_match']=how; r['cbb_slug']=rec['cbb_slug']
            for k in ['games','mpg','pts','reb','ast','stl','blk','tov','tpm']: r[k]=rec.get(k)
            for k in ['bpm','obpm','dbpm','per','usg_pct','ts_pct','ws40','mp_total']: r[k]=rec.get(k)
            r['college_pos']=rec.get('pos')
            if rec.get('mpg'):
                fpg=sum(FP_W[k]*rec[k] for k in FP_W if rec.get(k) is not None)
                r['fp_per_game']=round(fpg,3); r['fp40']=round(fpg*40/rec['mpg'],3)
                for k in ['pts','reb','ast','stl','blk','tov','tpm']: r['per40_'+k]=round(rec[k]*40/rec['mpg'],3)
    # outcomes
    r['adp_dynasty_raw']=(PR[y].get(pid) or {}).get('adp_dynasty') if pid else None
    r['adp_dynasty']=r['adp_dynasty_raw'] if (r['adp_dynasty_raw'] is not None and r['adp_dynasty_raw']<999) else None
    if y<=LASTSEASON and pid:
        seas=[s for s in range(y,y+3) if s<=LASTSEASON]
        r['n_seasons_observed']=len(seas)
        fps=[fp(ST[s][pid]) if pid in ST[s] else 0.0 for s in seas]
        gps=[(ST[s].get(pid) or {}).get('gp',0) for s in seas]
        r['nba_fp_raw']=round(sum(fps),2); r['nba_gp']=sum(gps)
        r['nba_fp_norm']=round(sum(f/SMEAN[s] for f,s in zip(fps,seas)),4)
        for i,s in enumerate(seas): r[f'fp_s{i+1}']=round(fps[i],1); r[f'gp_s{i+1}']=gps[i]
    elif y<=LASTSEASON:
        r['n_seasons_observed']=min(3,LASTSEASON-y+1)  # unmatched: outcome unknown
    r['college_stats_reliable']=bool(r.get('fp40') is not None and r.get('college_season')==y and (r.get('mp_total') or 0)>=300)
    rows.append(r)
json.dump(rows,open('dataset.json','w'),indent=1)
keys=[]
for r in rows:
    for k in r:
        if k not in keys: keys.append(k)
with open('dataset.csv','w',newline='') as f:
    wr=csv.DictWriter(f,fieldnames=keys); wr.writeheader(); wr.writerows(rows)
json.dump(sorted(set(unresolved)),open('unresolved_pages.json','w'))
print(len(rows),'rows; unresolved pages needed:',len({(a,b) for a,b,_,_ in unresolved}))
json.dump({str(k):v for k,v in SMEAN.items()},open('season_means.json','w'))
