import re,html,unicodedata,os
def norm(s):
    s=unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode().lower()
    s=re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?","",s)
    s=re.sub(r"[^a-z ]","",s.replace("-"," "))
    return " ".join(s.split())
def _cells(row):
    out={}
    for m in re.finditer(r'<t[dh][^>]*data-stat="([^"]+)"([^>]*)>(.*?)</t[dh]>',row,re.S):
        stat,attrs,inner=m.groups()
        cs=re.search(r'csk="([^"]+)"',attrs)
        txt=html.unescape(re.sub(r'<[^>]+>','',inner)).strip()
        v=None
        if cs:
            try: v=float(cs.group(1))
            except: v=None
        if v is None:
            try: v=float(txt)
            except: v=None
        out[stat]=(txt,v)
    return out
def table(h,tid):
    i=h.find(f'id="{tid}"')
    if i<0: return {}
    seg=h[i:h.find('</table>',i)]
    seg=seg[seg.find('<tbody'):]
    res={}
    for row in re.findall(r'<tr[ >].*?</tr>',seg,re.S):
        c=_cells(row)
        if 'name_display' not in c: continue
        link=re.search(r'href="/cbb/players/([^"]+)\.html"',row)
        name=c['name_display'][0]
        res[link.group(1) if link else name]=dict(name=name,slug=link.group(1) if link else None,c=c)
    return res
def parse_page(path):
    h=open(path).read()
    pg=table(h,'players_per_game'); pm=table(h,'players_per_min'); ad=table(h,'players_advanced')
    out={}
    for k,r in pg.items():
        c=r['c']
        g=lambda s,t=c:(t.get(s) or (None,None))[1]
        rec=dict(name=r['name'],cbb_slug=r['slug'],pos=c.get('pos',('',None))[0],
            games=g('games'),mpg=g('mp_per_g'),pts=g('pts_per_g'),reb=g('trb_per_g'),ast=g('ast_per_g'),
            stl=g('stl_per_g'),blk=g('blk_per_g'),tov=g('tov_per_g'),tpm=g('fg3_per_g'))
        if k in ad:
            a=ad[k]['c']; ga=lambda s:(a.get(s) or (None,None))[1]
            rec.update(mp_total=ga('mp'),per=ga('per'),ts_pct=ga('ts_pct'),usg_pct=ga('usg_pct'),ws40=ga('ws_per_40'),obpm=ga('obpm'),dbpm=ga('dbpm'),bpm=ga('bpm'))
        out[k]=rec
    return out
if __name__=='__main__':
    import sys,json
    p=parse_page(sys.argv[1]); print(len(p)); print(list(p.values())[:2])
