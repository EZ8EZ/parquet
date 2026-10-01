#!/usr/bin/env python3
"""Calibrate dynasty value curve V(rank) against realized discounted surplus FP over replacement.
Pure python (no numpy). Data in ../ (Sleeper snapshots + season stats)."""
import json, math, random, os, sys
D = os.environ.get('CALIB_DATA') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')  # snapshot dir; see ../README.md
OUT = os.path.dirname(os.path.abspath(__file__))
SC = dict(pts=.5, reb=1, ast=1, stl=2, blk=2, to=-1, tpm=.5, dd=1, td=2, bonus_pt_40p=2, bonus_pt_50p=2, tf=-2, ff=-2)
LAST = 2025; DISC = 0.9; GPFULL = 70.0; RMAX = 250
random.seed(7)

def load(f): return json.load(open(os.path.join(D, f)))
players = load('players.json')
stats = {y: load(f'stats{y}.json') for y in range(2021, 2026)}

def fp(s): return sum(SC[k] * (s.get(k) or 0) for k in SC)

def season_table(y, repl_n):
    rows = {}
    for pid, s in stats[y].items():
        gp = s.get('gp') or 0
        if gp > 0: rows[pid] = (fp(s) / gp, gp)
    q = sorted((v[0] for v in rows.values() if v[1] >= 20), reverse=True)
    repl = q[repl_n - 1]
    sur = {pid: max(0.0, f - repl) * min(gp, GPFULL) / GPFULL for pid, (f, gp) in rows.items()}
    return repl, sur

def age_at(pid, y):
    b = (players.get(pid) or {}).get('birth_date')
    if not b: return None
    by, bm, bd = map(int, b.split('-'))
    return y - by - ((10, 1) < (bm, bd))  # age on Oct 1 of year y

def build(repl_n, horizon=5, snaps=(2021, 2022, 2023)):
    sur = {y: season_table(y, repl_n)[1] for y in stats}
    pts = []  # (snap, rank, target, age, pid)
    for Y in snaps:
        pr = load(f'proj{Y}.json')
        c = [(v['adp_dynasty'], v.get('adp_std', 999) or 999, pid) for pid, v in pr.items()
             if v and (v.get('adp_dynasty') or 999) < 999]
        c.sort()
        for i, (_, _, pid) in enumerate(c):
            r = i + 1
            if r > RMAX: break
            t = sum(DISC ** (s - Y) * sur[s].get(pid, 0.0) for s in range(Y, min(Y + horizon - 1, LAST) + 1))
            pts.append((Y, r, t, age_at(pid, Y), pid))
    return pts

# ---------- fitting: scale-free least squares, V = A*f(r), f(1)=1 ----------
def fit_scale(xs, ys, f):
    fv = [f(r) for r in xs]
    den = sum(v * v for v in fv)
    A = sum(v * y for v, y in zip(fv, ys)) / den if den else 0
    sse = sum((y - A * v) ** 2 for v, y in zip(fv, ys))
    return A, sse

def grid_min(xs, ys, fam, grid):
    best = None
    for p in grid:
        f = fam(p)
        A, sse = fit_scale(xs, ys, f)
        if best is None or sse < best[2]: best = (p, A, sse)
    return best

EXP = lambda k: (lambda r: math.exp(-k * (r - 1)))
POW = lambda a: (lambda r: r ** (-a))
EXPF = lambda p: (lambda r: p[1] + (1 - p[1]) * math.exp(-p[0] * (r - 1)))
KG = [i / 2000 for i in range(4, 400)]            # 0.002..0.2
AG = [i / 200 for i in range(2, 600)]              # 0.01..3
FG = [(k, c) for k in [i / 1000 for i in range(5, 300, 3)] for c in [j / 100 for j in range(0, 40)]]

def fits(xs, ys):
    sst = sum((y - sum(ys) / len(ys)) ** 2 for y in ys)
    e = grid_min(xs, ys, EXP, KG); p = grid_min(xs, ys, POW, AG); ef = grid_min(xs, ys, EXPF, FG)
    cur = fit_scale(xs, ys, EXP(0.021))
    R2 = lambda sse: 1 - sse / sst
    return dict(exp=dict(k=e[0], A=e[1], R2=R2(e[2])), power=dict(a=p[0], A=p[1], R2=R2(p[2])),
                exp_floor=dict(k=ef[0][0], floor=ef[0][1], A=ef[1], R2=R2(ef[2])),
                current_k021=dict(A=cur[0], R2=R2(cur[1])))

def isotonic_dec(xs, ys):
    # PAVA for non-increasing fit on rank-sorted data (pool by rank first)
    by = {}
    for r, y in zip(xs, ys): by.setdefault(r, []).append(y)
    rs = sorted(by)
    blocks = [[sum(by[r]), len(by[r]), [r]] for r in rs]
    out = []
    for b in blocks:
        out.append(b)
        while len(out) > 1 and out[-2][0] / out[-2][1] < out[-1][0] / out[-1][1]:
            s, n, rr = out.pop(); out[-1][0] += s; out[-1][1] += n; out[-1][2] += rr
    m = {}
    for s, n, rr in out:
        for r in rr: m[r] = s / n
    return m

BINS = [(1, 3), (4, 6), (7, 10), (11, 15), (16, 20), (21, 30), (31, 40), (41, 60), (61, 80), (81, 100), (101, 130), (131, 160), (161, 200), (201, 250)]
def binned(pts):
    res = []
    for lo, hi in BINS:
        v = [p[2] for p in pts if lo <= p[1] <= hi]
        if v:
            m = sum(v) / len(v); sd = (sum((x - m) ** 2 for x in v) / max(1, len(v) - 1)) ** .5
            res.append(dict(bin=f'{lo}-{hi}', n=len(v), mean=round(m, 1), se=round(sd / len(v) ** .5, 1),
                            pct_zero=round(sum(1 for x in v if x == 0) / len(v), 2)))
    return res

def trades(fdict):
    """fdict: name->normalized f(r). returns ratios: V(10)/(2V(30)), V(5)/(V(15)+V(25))."""
    o = {}
    for n, f in fdict.items():
        o[n] = dict(V10_over_2xV30=round(f(10) / (2 * f(30)), 3), V5_over_V15_plus_V25=round(f(5) / (f(15) + f(25)), 3),
                    V1_over_V10=round(f(1) / f(10), 2), V1_over_V50=round(f(1) / max(f(50), 1e-9), 1),
                    f10=round(f(10), 3), f30=round(f(30), 3), f50=round(f(50), 3), f100=round(f(100), 3))
    return o

def fdict_from(F):
    return {'current_exp_k0.021': EXP(0.021), 'fit_exp': EXP(F['exp']['k']), 'fit_power': POW(F['power']['a']),
            'fit_exp_floor': EXPF((F['exp_floor']['k'], F['exp_floor']['floor']))}

def boot(pts, B=200):
    pids = sorted({(p[0], p[4]) for p in pts})
    byk = {}
    for p in pts: byk.setdefault((p[0], p[4]), []).append(p)
    ks, as_, efk, efc, r1030 = [], [], [], [], []
    KGc = [i / 1000 for i in range(5, 150)]
    FGc = [(k, c) for k in [i / 1000 for i in range(5, 200, 5)] for c in [j / 50 for j in range(0, 15)]]
    for _ in range(B):
        s = [q for _ in pids for q in byk[random.choice(pids)]]
        xs = [q[1] for q in s]; ys = [q[2] for q in s]
        k = grid_min(xs, ys, EXP, KGc)[0]; ks.append(k)
        as_.append(grid_min(xs, ys, POW, [i / 50 for i in range(1, 150)])[0])
        ef = grid_min(xs, ys, EXPF, FGc)[0]; efk.append(ef[0]); efc.append(ef[1])
        r1030.append(math.exp(-9 * k) / (2 * math.exp(-29 * k)))
    q = lambda v: [round(sorted(v)[int(.05 * len(v))], 4), round(sorted(v)[len(v) // 2], 4), round(sorted(v)[int(.95 * len(v)) - 1], 4)]
    return dict(B=B, exp_k_p5_p50_p95=q(ks), power_a=q(as_), expfloor_k=q(efk), expfloor_floor=q(efc),
                exp_V10_over_2V30=q(r1030))

def run():
    R = {}
    for rn in (98, 140):
        R[f'repl_{rn}'] = dict(replacement_fpg={y: round(season_table(y, rn)[0], 2) for y in stats})
    # main: repl 98, full available horizon (<=5 seasons)
    for rn in (98, 140):
        for hz, snaps, tag in [(5, (2021, 2022, 2023), 'full_horizon'), (3, (2021, 2022, 2023), 'common_3yr'),
                               (5, (2021,), 'snap2021_5yr'), (5, (2022,), 'snap2022_4yr'), (5, (2023,), 'snap2023_3yr')]:
            pts = build(rn, hz, snaps)
            xs = [p[1] for p in pts]; ys = [p[2] for p in pts]
            F = fits(xs, ys)
            e = dict(n=len(pts), fits=F, trades=trades(fdict_from(F)))
            if tag in ('full_horizon',):
                e['binned'] = binned(pts)
                iso = isotonic_dec(xs, ys); top = iso[1]
                e['isotonic_normalized'] = {r: round(iso[r] / top, 3) for r in (1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250) if r in iso}
                # binned implied local decay
                if rn == 98:
                    e['bootstrap'] = boot(pts)
                    # age split: fit within group
                    ag = {}
                    for nm, cond in [('young_le23', lambda a: a is not None and a <= 23), ('prime_24_29', lambda a: a is not None and 24 <= a <= 29), ('old_ge30', lambda a: a is not None and a >= 30)]:
                        g = [p for p in pts if cond(p[3])]
                        gx = [p[1] for p in g]; gy = [p[2] for p in g]
                        Fg = fits(gx, gy)
                        ag[nm] = dict(n=len(g), exp_k=Fg['exp']['k'], exp_A=round(Fg['exp']['A'], 1), R2_exp=round(Fg['exp']['R2'], 3),
                                      power_a=Fg['power']['a'], binned=binned(g)[:9])
                    e['age_split'] = ag
            R[f'repl_{rn}'][tag] = e
    # pure-FPG rank check with 1-season horizon incl. 2024 snap (market vs next-year)
    pts = build(98, 1, (2021, 2022, 2023, 2024, 2025))
    F = fits([p[1] for p in pts], [p[2] for p in pts])
    R['repl_98']['one_season_snaps2021_2025'] = dict(n=len(pts), fits=F, trades=trades(fdict_from(F)))
    json.dump(R, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=str)
    return R

if __name__ == '__main__' and 'hyb' not in sys.argv:
    R = run()
    m = R['repl_98']['full_horizon']
    print(json.dumps({k: m[k] for k in ('n', 'fits', 'trades', 'isotonic_normalized', 'bootstrap')}, indent=1))
    print(json.dumps(m['binned'], indent=0))
    print(json.dumps(m['age_split'], indent=0)[:3000])
    for rn in ('repl_98', 'repl_140'):
        print(rn, R[rn]['replacement_fpg'])
        for t in ('full_horizon', 'common_3yr', 'snap2021_5yr', 'snap2022_4yr', 'snap2023_3yr'):
            F = R[rn][t]['fits']; T = R[rn][t]['trades']
            print(f"  {t:14s} n={R[rn][t]['n']} expk={F['exp']['k']:.4f} R2={F['exp']['R2']:.3f} | pow a={F['power']['a']:.2f} R2={F['power']['R2']:.3f} | expF k={F['exp_floor']['k']:.3f} c={F['exp_floor']['floor']:.2f} R2={F['exp_floor']['R2']:.3f} | cur R2={F['current_k021']['R2']:.3f}")
    F = R['repl_98']['one_season_snaps2021_2025']['fits']; print('1-season', F)

# ---- addendum: power x exponential hybrid  f(r) = r^-a * exp(-k(r-1)) ----
HYB = lambda p: (lambda r: r ** (-p[0]) * math.exp(-p[1] * (r - 1)))
HG = [(a, k) for a in [i / 20 for i in range(0, 21)] for k in [j / 1000 for j in range(0, 80)]]
def hybrid_report():
    out = {}
    for rn in (98, 112, 126, 140):
        pts = build(rn, 5, (2021, 2022, 2023)); xs = [p[1] for p in pts]; ys = [p[2] for p in pts]
        sst = sum((y - sum(ys) / len(ys)) ** 2 for y in ys)
        (a, k), A, sse = grid_min(xs, ys, HYB, HG)
        e = grid_min(xs, ys, EXP, KG)
        f = HYB((a, k))
        out[rn] = dict(a=a, k=k, A=round(A, 2), R2=round(1 - sse / sst, 4), exp_k=e[0], exp_R2=round(1 - e[2] / sst, 4),
                       repl_fpg_2023=round(season_table(2023, rn)[0], 2), trades=trades({'hybrid': f, 'exp': EXP(e[0])}))
    return out
if __name__ == '__main__' and 'hyb' in sys.argv:
    H = hybrid_report(); R = json.load(open(os.path.join(OUT, 'results.json'))); R['hybrid_power_exp'] = H
    json.dump(R, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=str)
    for rn, v in H.items(): print(rn, json.dumps(v))
