import json,os,time,subprocess,sys
D=json.load(open('draft_sleeper.json'));S=json.load(open('college_slug.json'))
pairs=sorted({(S[d['college']],d['draft_year']) for d in D if d['college'] in S},key=lambda t:(-t[1],t[0]))
extra=[tuple(x.split(':')) for x in sys.argv[1:]]
pairs+= [(a,int(b)) for a,b in extra]
for slug,y in pairs:
    f=f'raw/cbb/{slug}_{y}.html'
    if os.path.exists(f) and os.path.getsize(f)>50000: continue
    url=f'https://www.sports-reference.com/cbb/schools/{slug}/men/{y}.html'
    for attempt in range(3):
        r=subprocess.run(['curl','-s','-A','Mozilla/5.0','-o',f,'-w','%{http_code}',url],capture_output=True,text=True)
        code=r.stdout.strip()
        print(slug,y,code,os.path.getsize(f),flush=True)
        time.sleep(5)
        if code=='200': break
        if code=='429': time.sleep(60)
