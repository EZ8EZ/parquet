import re,json,html
rows=[]
DATES={2020:'2020-11-18',2021:'2021-07-29',2022:'2022-06-23',2023:'2023-06-22',2024:'2024-06-26',2025:'2025-06-25',2026:'2026-06-23'}
for y in range(2020,2027):
    h=open(f'raw/bbref{y}.html').read()
    for tr in re.findall(r'<tr ?>.*?</tr>',h,re.S):
        if 'data-stat="pick_overall"' not in tr or '<td' not in tr: continue
        def cell(stat):
            m=re.search(r'<t[dh][^>]*data-stat="%s"[^>]*>(.*?)</t[dh]>'%stat,tr,re.S)
            return m.group(1) if m else None
        pk=cell('pick_overall')
        pk=re.sub('<[^>]+>','',pk or '').strip()
        if not pk.isdigit(): continue
        pl=cell('player') or ''
        m=re.search(r"href=['\"]/players/./([^'\"]+)\.html",pl)
        name=html.unescape(re.sub('<[^>]+>','',pl)).strip()
        col=cell('college_name') or ''
        cm=re.search(r'href="(/cbb/schools/[^"]+)"',col)
        colname=html.unescape(re.sub('<[^>]+>','',col)).strip()
        tm=re.sub('<[^>]+>','',cell('team_id') or '').strip()
        rows.append(dict(draft_year=y,pick=int(pk),name=name,bbref_id=m.group(1) if m else None,college=colname,team=tm,nba_g=re.sub('<[^>]+>','',cell('g') or '').strip(),draft_date=DATES[y]))
    print(y,sum(1 for r in rows if r['draft_year']==y))
json.dump(rows,open('draft_raw.json','w'),indent=1)
