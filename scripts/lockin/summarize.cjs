// Q4 tables from backtest_rows_<pool>.json. node summarize.js [all|core]
const S = require('./stats.cjs'); const { load } = require('./load.cjs'); const D = load();
const pool = process.argv[2] || 'all';
let R = require(require('path').join(require('./fetch.cjs').DIR, `backtest_rows_${pool}.json`));
const FILTER = process.argv[3] || 'none';
if (FILTER === 'active') R = R.filter(r => r.dead === 0 && r.zeroWithGames === 0);
S.setSeed(7);
const keys = ['actual', 'same7_never', 'same7_first', 'same7_res', 'same7_blind', 'same7_res_pess', 'same7_blind_pess', 'same7_best_pess', 'same7_best', 'never_pos', 'first_pos', 'res_pos', 'lineup_pos', 'lineup_pos_nofore', 'hind_pos', 'never_nopos', 'first_nopos', 'res_nopos', 'lineup_nopos', 'hind_nopos'];
const boot = (d, B = 2000) => { const out = []; for (let b = 0; b < B; b++) { let t = 0; for (let i = 0; i < d.length; i++) t += d[Math.floor(S.rnd() * d.length)]; out.push(t / d.length); } return [S.quant(out, .025), S.quant(out, .975)]; };
// cluster bootstrap by roster-season (team-weeks within a team are not independent)
const clusters = Object.values(R.reduce((a, r, i) => { (a[r.s + '|' + r.roster] = a[r.s + '|' + r.roster] || []).push(i); return a; }, {}));
const cboot = (d, B = 2000) => { const out = []; for (let b = 0; b < B; b++) { let t = 0, n = 0; for (let c = 0; c < clusters.length; c++) { const cl = clusters[Math.floor(S.rnd() * clusters.length)]; for (const i of cl) { t += d[i]; n++; } } out.push(t / n); } return [S.quant(out, .025), S.quant(out, .975)]; };
const byMid = {}; R.forEach(r => (byMid[r.s + '|' + r.w + '|' + r.mid] = byMid[r.s + '|' + r.w + '|' + r.mid] || []).push(r));
const opp = (r) => (byMid[r.s + '|' + r.w + '|' + r.mid] || []).find(o => o.roster !== r.roster);
console.log(`filter=${FILTER} pool=${pool} n team-weeks=${R.length} (2025: ${R.filter(r => r.s === '2025').length}, 2026: ${R.filter(r => r.s === '2026').length}) clusters(team-seasons)=${clusters.length}`);
console.log('| policy | mean pts/team-week | minus actual | 95% CI (team-week bootstrap) | 95% CI (team-season cluster) | share of team-weeks above actual | H2H flips L->W | W->L |');
for (const k of keys) {
  const v = R.map(r => r[k]); const d = R.map(r => r[k] - r.actual);
  let lw = 0, wl = 0, nh = 0; for (const r of R) { const o = opp(r); if (!o) continue; nh++; const a = r.actual > o.actual, p = r[k] > o.actual; if (!a && p && r.actual !== o.actual) lw++; if (a && !p) wl++; }
  const bt = boot(d), cb = cboot(d);
  console.log(`| ${k} | ${S.mean(v).toFixed(1)} | ${S.mean(d) >= 0 ? '+' : ''}${S.mean(d).toFixed(1)} | ${bt.map(x => x.toFixed(1)).join(' to ')} | ${cb.map(x => x.toFixed(1)).join(' to ')} | ${(100 * d.filter(x => x > 0).length / d.length).toFixed(0)}% | ${lw} | ${wl} |`);
}
const viol = R.filter(r => r.actual > r.same7_best + 0.01).length; console.log('sanity: actual > same7 hindsight in', viol, 'team-weeks');
// per-manager (2025 only; 23 weeks each)
const users = Object.fromEntries(D.users['2025'].map(u => [u.user_id, u.display_name]));
const owner = Object.fromEntries(D.rosters['2025'].map(r => [r.roster_id, users[r.owner_id] || ('roster ' + r.roster_id)]));
console.log('\nper roster (2025, n=23 weeks each): mean actual, same7 hindsight gap, same7 reservation-rule minus actual, lineup_pos minus actual');
const rows = [];
for (const rid of [...new Set(R.filter(r => r.s === '2025').map(r => r.roster))]) {
  const rr = R.filter(r => r.s === '2025' && r.roster === rid);
  rows.push([rid, S.mean(rr.map(r => r.actual)), S.mean(rr.map(r => r.same7_best - r.actual)), S.mean(rr.map(r => r.same7_res - r.actual)), S.mean(rr.map(r => r.lineup_pos - r.actual)), S.mean(rr.map(r => r.same7_never - r.actual))]);
}
rows.sort((a, b) => b[2] - a[2]);
for (const x of rows) console.log(`| roster ${x[0]} | ${x[1].toFixed(1)} | ${x[2].toFixed(1)} | ${x[3] >= 0 ? '+' : ''}${x[3].toFixed(1)} | ${x[4] >= 0 ? '+' : ''}${x[4].toFixed(1)} | ${x[5] >= 0 ? '+' : ''}${x[5].toFixed(1)} |`);
console.log('spearman(per-roster same7 hindsight gap, per-roster res-minus-actual)', S.spearman(rows.map(x => x[2]), rows.map(x => x[3])).toFixed(2));

// slot-level decomposition of same7_res - actual
const sl = R.flatMap(r => r.slots.filter(x => !x.empty && x.nPlayed > 0));
const grp = (f) => { const a = sl.filter(f); return [a.length, S.mean(a.map(x => x.res - x.actual)), S.mean(a.map(x => x.blind - x.actual))]; };
console.log('\nslot decomposition (n slots, mean res-actual, mean blind-actual):');
console.log('all played slots', grp(() => true).map(v => +v.toFixed(2)).join(' '));
console.log('actual banked 0 despite games', grp(x => x.actual === 0).map(v => +v.toFixed(2)).join(' '));
console.log('actual > 0', grp(x => x.actual !== 0).map(v => +v.toFixed(2)).join(' '));
console.log('single-game weeks', grp(x => x.nGames === 1).map(v => +v.toFixed(2)).join(' '));
console.log('per-week contribution of zero slots to res gain', (sl.filter(x => x.actual === 0).reduce((t, x) => t + x.res - x.actual, 0) / R.length).toFixed(2));
const same = sl.filter(x => Math.abs(x.res - x.actual) < 0.011).length; console.log('slots where rule banked the same score as the manager', same, 'of', sl.length);
