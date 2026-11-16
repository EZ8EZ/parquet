// Q7a opponent history + Q7b outliers / teammate absence. node context_study.js
const { load } = require('./load.cjs'); const { dist } = require('./model.cjs'); const S = require('./stats.cjs');
const D = load(); S.setSeed(99);
const rost = new Set(D.uni.rostered);
// model mu/sd per played game (cache)
const mc = new Map(); const md = (pid, date) => { const k = pid + date; if (!mc.has(k)) { const d = dist(D.logs[pid], date); mc.set(k, d); } return mc.get(k); };
// index rows by gameId
const byGame = new Map();
for (const pid in D.logs) for (const g of D.logs[pid]) { if (!byGame.has(g.gameId)) byGame.set(g.gameId, []); byGame.get(g.gameId).push(g); }
const targets = [];
for (const pid of rost) { const L = D.logs[pid] || []; const played = L.filter(g => g.sp > 0);
  for (let i = 0; i < played.length; i++) { const g = played[i]; if (g.season !== '2025' && g.season !== '2026') continue; if (i < 10) continue; targets.push({ pid, g, prior: played.slice(0, i) }); } }
console.log('target games', targets.length);
// ---------------- 7a
// history depth: earliest season with per-game data, probe a few veterans (cached requests)
const out7a = {};
const priorOpp = targets.map(t => t.prior.filter(x => x.opp === t.g.opp));
const nDist = priorOpp.map(a => a.length);
out7a.priorMeetings = { median: S.quant(nDist, .5), p25: S.quant(nDist, .25), p75: S.quant(nDist, .75), share0: nDist.filter(x => x === 0).length / nDist.length, shareGe3: nDist.filter(x => x >= 3).length / nDist.length, shareGe5: nDist.filter(x => x >= 5).length / nDist.length };
// signal test, players with >=2 prior meetings: x = mean residual (fp - mu at that time) over last<=5 meetings
const rows = [];
targets.forEach((t, k) => { const pm = priorOpp[k].slice(-5); if (pm.length < 2) return; const d = md(t.pid, t.g.date);
  const resid = pm.map(x => x.fp - md(t.pid, x.date).mu); const rawMean = S.mean(pm.map(x => x.fp));
  rows.push({ pid: t.pid, y: t.g.fp, mu: d.mu, e: t.g.fp - d.mu, xres: S.mean(resid), xraw: rawMean, n: pm.length }); });
const grp = (rs) => Object.values(rs.reduce((a, r) => { (a[r.pid] = a[r.pid] || []).push(r); return a; }, {}));
out7a.n = rows.length; out7a.players = grp(rows).length;
out7a.spearman_resid = S.spearman(rows.map(r => r.xres), rows.map(r => r.e));
out7a.spearman_resid_CI = S.clusterBoot(grp(rows), rs => S.spearman(rs.map(r => r.xres), rs.map(r => r.e)), 400);
out7a.partial_raw_given_form = S.partialSpearman(rows.map(r => r.xraw), rows.map(r => r.y), rows.map(r => r.mu));
out7a.partial_raw_CI = S.clusterBoot(grp(rows), rs => S.partialSpearman(rs.map(r => r.xraw), rs.map(r => r.y), rs.map(r => r.mu)), 400);
out7a.raw_spearman_unadjusted = S.spearman(rows.map(r => r.xraw), rows.map(r => r.y));
// OLS slope of e on xres (shrinkage factor: how much of the past opponent residual carries over)
const b = rows.reduce((s, r) => s + r.xres * r.e, 0) / rows.reduce((s, r) => s + r.xres ** 2, 0);
out7a.slope_e_on_xres = b; out7a.slope_CI = S.clusterBoot(grp(rows), rs => rs.reduce((s, r) => s + r.xres * r.e, 0) / rs.reduce((s, r) => s + r.xres ** 2, 0), 400);
// out-of-sample: does mu + b*xres beat mu? fit on 2025, test on 2026
// team-level opponent effect for comparison: mean residual of ALL rostered players vs this opponent in the season so far
const oppAcc = {}; const tRows = [];
const sortedT = [...targets].sort((a, b) => a.g.date < b.g.date ? -1 : 1);
for (const t of sortedT) { const key = t.g.season + t.g.opp; const acc = oppAcc[key] || { s: 0, n: 0 }; const d = md(t.pid, t.g.date); const e = t.g.fp - d.mu;
  if (acc.n >= 100) tRows.push({ pid: t.pid, x: acc.s / acc.n, e }); acc.s += e; acc.n++; oppAcc[key] = acc; }
out7a.teamOpp_spearman = S.spearman(tRows.map(r => r.x), tRows.map(r => r.e)); out7a.teamOpp_n = tRows.length;
out7a.teamOpp_CI = S.clusterBoot(grp(tRows), rs => S.spearman(rs.map(r => r.x), rs.map(r => r.e)), 300);
console.log('7a', JSON.stringify(out7a, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
// ---------------- 7b
const games = D.games; const T = [];
let covNum = 0, covDen = 0;
for (const t of targets) {
  const g = t.g; const sg = games[g.gameId]; const rowsG = byGame.get(g.gameId) || [];
  const mates = rowsG.filter(r => r.team === g.team && r.pid !== t.pid);
  // "usual" teammate: played >=7 of his last 10 team-game rows before tonight and is top-3 by minutes among such teammates
  const usual = [];
  for (const r of mates) { const L = D.logs[r.pid]; const idx = L.indexOf(r); const last10 = L.slice(Math.max(0, idx - 10), idx).filter(x => x.team === g.team); if (last10.length < 7) continue; const pl = last10.filter(x => x.sp > 0); if (pl.length < 7) continue; usual.push({ r, avgMin: S.mean(pl.map(x => x.min)) }); }
  usual.sort((a, b) => b.avgMin - a.avgMin); const top3 = usual.slice(0, 3);
  const out = top3.filter(u => u.r.sp === 0);
  const d = md(t.pid, g.date); const min10 = S.mean(t.prior.slice(-10).map(x => x.min));
  let margin = null, ot = g.ot; if (sg && sg.home.points != null) { margin = Math.abs(sg.home.points - sg.away.points); ot = ot || (sg.home.scoring || []).some(q => q.type === 'overtime'); }
  if (sg && sg.season === '2025') { const team = rowsG.filter(r => r.team === g.team); covNum += team.reduce((s, r) => s + r.sp, 0); covDen += 48 * 60 * 5 + (ot ? 5 * 60 * 5 : 0); }
  const selfTop = usual.length ? (t.prior.slice(-10).reduce((s, x) => s + x.min, 0) / Math.min(10, t.prior.length)) >= (top3[2] ? top3[2].avgMin : 0) : false;
  T.push({ pid: t.pid, season: g.season, y: g.fp, mu: d.mu, sd: d.sd, z: (g.fp - d.mu) / d.sd, e: g.fp - d.mu, min: g.min, dmin: g.min - min10, nOut: out.length, ot, margin, outNames: out.map(u => u.r.pid), selfTop });
}
console.log('7b team-minute coverage of fetched universe (2025 games)', (covNum / covDen).toFixed(3));
const pos = T.filter(r => r.z > 1.5), neg = T.filter(r => r.z < -1.5), mid = T.filter(r => Math.abs(r.z) <= 1.5);
const share = (a, f) => a.filter(f).length / a.length;
const feats = { 'minutes jump >= +5 vs last-10 avg': r => r.dmin >= 5, 'top-3-minutes teammate out (fresh)': r => r.nOut >= 1, 'overtime': r => r.ot, 'blowout (margin >= 20)': r => r.margin != null && r.margin >= 20, 'close (margin <= 5)': r => r.margin != null && r.margin <= 5, 'any of minutes jump / teammate out / OT': r => r.dmin >= 5 || r.nOut >= 1 || r.ot };
console.log(`7b outliers: n games ${T.length}, positive (z>1.5) ${pos.length} (${(100 * pos.length / T.length).toFixed(1)}%), negative ${neg.length}`);
console.log('| feature | share of positive outliers | share of ordinary games | share of negative outliers |');
for (const [k, f] of Object.entries(feats)) console.log(`| ${k} | ${(100 * share(pos, f)).toFixed(1)}% | ${(100 * share(mid, f)).toFixed(1)}% | ${(100 * share(neg, f)).toFixed(1)}% |`);
// teammate-out effect
const G = grp(T);
const diff = (f, v) => (rs) => S.mean(rs.filter(f).map(v)) - S.mean(rs.filter(r => !f(r)).map(v));
for (const [name, f] of [['>=1 top-3 out', r => r.nOut >= 1], ['>=2 top-3 out', r => r.nOut >= 2]]) {
  const n1 = T.filter(f).length;
  const fm = diff(f, r => r.dmin), fe = diff(f, r => r.e);
  console.log(`7b effect ${name}: n games ${n1} of ${T.length}; minutes lift ${fm(T).toFixed(2)} [${S.clusterBoot(G, fm, 400).map(x => x.toFixed(2)).join(', ')}]; fantasy-pt lift vs model ${fe(T).toFixed(2)} [${S.clusterBoot(G, fe, 400).map(x => x.toFixed(2)).join(', ')}]`);
}
// heterogeneity: by own role (self in top-3 minutes vs not)
for (const [name, g] of [['player is himself a top-3-minutes player', r => r.selfTop], ['player is not', r => !r.selfTop]]) { const sub = T.filter(g); const f = r => r.nOut >= 1; const fe = diff(f, r => r.e), fm = diff(f, r => r.dmin); console.log(`  ${name}: n ${sub.length} (out-games ${sub.filter(f).length}) fp lift ${fe(sub).toFixed(2)} [${S.clusterBoot(grp(sub), fe, 300).map(x => x.toFixed(2)).join(', ')}] min lift ${fm(sub).toFixed(2)}`); }
// per-player estimability: split-half reliability of per-player lift (players with >=12 out-games and >=12 normal games)
const per = []; for (const rs of G) { const o = rs.filter(r => r.nOut >= 1), n = rs.filter(r => r.nOut === 0); if (o.length >= 12 && n.length >= 12) per.push({ o, n }); }
const halves = [[], []];
for (const p of per) { for (const h of [0, 1]) { const oo = p.o.filter((_, i) => i % 2 === h), nn = p.n.filter((_, i) => i % 2 === h); halves[h].push(S.mean(oo.map(r => r.e)) - S.mean(nn.map(r => r.e))); } }
const lifts = per.map(p => S.mean(p.o.map(r => r.e)) - S.mean(p.n.map(r => r.e)));
const sampVar = S.mean(per.map(p => (S.sd(p.o.map(r => r.e)) ** 2) / p.o.length + (S.sd(p.n.map(r => r.e)) ** 2) / p.n.length));
console.log(`7b per-player: players with >=12 out-games ${per.length}; split-half corr of per-player lift ${S.pearson(halves[0], halves[1]).toFixed(3)}; var(observed lifts) ${(S.sd(lifts) ** 2).toFixed(2)} vs mean sampling var ${sampVar.toFixed(2)} -> implied true-effect SD ${Math.sqrt(Math.max(0, S.sd(lifts) ** 2 - sampVar)).toFixed(2)}`);
const outCounts = G.map(rs => rs.filter(r => r.nOut >= 1).length); console.log('7b out-games per player: median', S.quant(outCounts, .5), 'p75', S.quant(outCounts, .75), 'players', G.length);
// schedule starters as proxy: usual starter missing from starting five vs DNP
let notStart = 0, notStartDNP = 0;
for (const sg of D.schedule['2025']) { if (sg.status !== 'complete') continue; for (const side of ['home', 'away']) { const st = new Set(sg[side].starters || []); const rowsG = (byGame.get(sg.game_id) || []).filter(r => r.team === sg[side].team);
  for (const r of rowsG) { const L = D.logs[r.pid]; const idx = L.indexOf(r); const prev = L.slice(Math.max(0, idx - 10), idx); if (prev.length < 8) continue; const startedPrev = prev.filter(x => { const g2 = D.games[x.gameId]; if (!g2) return false; const sd = g2.home.team === x.team ? g2.home : g2.away; return (sd.starters || []).includes(x.pid); }).length; if (startedPrev < 8) continue; if (!st.has(r.pid)) { notStart++; if (r.sp === 0) notStartDNP++; } } } }
console.log(`7b schedule proxy: usual starters (started >=8 of last 10) absent from tonight's starting five: ${notStart}; of those DNP: ${notStartDNP} (${(100 * notStartDNP / notStart).toFixed(1)}%)`);
require('fs').writeFileSync(require('path').join(require('./fetch.cjs').DIR, 'context_rows.json'), JSON.stringify(T.slice(0, 0)));
