// Q4: replay every completed team-week (2025 w1-23, 2026 w1-3) under lock policies. node backtest.js [--pool=core]
// Information rule: decisions at date d use only games before d, plus (a) the schedule (known in advance) and
// (b) whether the player plays his NEXT game, which the lock deadline (that game's tip) lets a manager see
// on the injury report. Pool policies also know which players play >=1 game that week (stated in report).
const { load } = require('./load.cjs'); const { dist, reservation, mean, playProb } = require('./model.cjs'); const { assign } = require('./hungarian.cjs');
const S = require('./stats.cjs'); const fs = require('fs');
const D = load();
const eq = (a, b) => Math.abs(a - b) < 0.011;
const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL', 'UTIL'];
const fpos = (pid) => (D.players[pid] && D.players[pid].fantasy_positions) || [];
const elig = (pid, label, usePos) => !usePos || label === 'UTIL' || fpos(pid).includes(label);
// team schedule per (season|week|team), completed games, by date
const TG = {}; for (const s of ['2025', '2026']) for (const g of D.schedule[s]) { if (g.status !== 'complete') continue; for (const side of ['home', 'away']) { const k = `${s}|${g.week}|${g[side].team}`; (TG[k] = TG[k] || []).push({ date: g.date, gameId: g.game_id }); } }
for (const k in TG) TG[k].sort((a, b) => a.date < b.date ? -1 : 1);
// distribution + q cache
const dc = new Map();
function model(pid, date) {
  const k = pid + '|' + date; if (dc.has(k)) return dc.get(k);
  const L = D.logs[pid] || []; const d = dist(L, date);
  // q: share of the player's own team-game rows (incl. sp=0 DNP rows) he played in his last 20 rows before date
  const q = playProb(L, date);
  const sample = d.sample || [d.mu];
  const { r, H } = reservation(sample, q, 6);
  const v = { mu: d.mu, sample, q, r, H }; dc.set(k, v); return v;
}
// per player-week: scheduled team games (with played flag + fp)
function pweek(pid, s, w) {
  const L = (D.logs[pid] || []).filter(g => g.season === s && g.week === w);
  if (!L.length) return null;
  const team = L[L.length - 1].team; const tg = TG[`${s}|${w}|${team}`] || [];
  const byG = new Map(L.map(g => [g.gameId, g]));
  const games = tg.map(t => { const g = byG.get(t.gameId); return { date: t.date, played: !!(g && g.sp > 0), fp: g ? g.fp : 0 }; });
  return { pid, games, played: games.filter(g => g.played) };
}
// per-player stopping walk over his team's games. rule(x, model, left, playsNext) -> lock now?
function walk(pw, rule) {
  const G = pw.games; let x = null;
  for (let i = 0; i < G.length; i++) {
    if (x !== null && rule(x, model(pw.pid, G[i].date), G.length - i, G[i].played)) return x; // decided at game i's tip
    if (G[i].played) x = G[i].fp; else if (x !== null) x = 0; // unlocked score resets at tip; DNP -> 0
  }
  return x === null ? 0 : x;
}
const ruleRes = (x, m, left, plays) => plays ? x >= m.r[Math.min(left, 6)] : x >= m.H(Math.min(left - 1, 6), 0);
// availability-blind version: decides at the deadline WITHOUT knowing whether he plays the next game
const ruleBlind = (x, m, left) => x >= m.q * m.r[Math.min(left, 6)] + (1 - m.q) * Math.max(0, m.H(Math.min(left - 1, 6), 0));
const ruleNever = () => false;
const ruleFirst = () => true;
// never-lock as Sleeper scores it: final team game (0 if DNP)
const neverLock = (pw) => { const G = pw.games; return G.length ? (G[G.length - 1].played ? G[G.length - 1].fp : 0) : 0; };
const lockFirst = (pw) => pw.played.length ? pw.played[0].fp : 0;
const best = (pw) => pw.played.length ? Math.max(...pw.played.map(g => g.fp)) : 0;
// choose 7 by weight with position matching
function pick7(pws, weightFn, usePos) {
  const w = SLOTS.map(l => pws.map(p => elig(p.pid, l, usePos) ? weightFn(p) : -Infinity));
  const a = assign(w); return a.assign.map(j => j >= 0 ? pws[j] : null);
}
// (v) nightly lineup-aware assignment with option values
function lineupAware(pws, usePos) {
  const BIG = 1e4; const nights = [...new Set(pws.flatMap(p => p.games.map(g => g.date)))].sort();
  let slots = SLOTS.map(l => ({ label: l, locked: null }));
  const st = new Map(pws.map(p => [p.pid, { x: null, inSlot: false, done: false }]));
  let total = 0;
  const gIdx = (p, d) => p.games.findIndex(g => g.date === d);
  // value of a player for an unlocked slot, evaluated just before night d's tip
  function weight(p, d) {
    const s = st.get(p.pid); if (s.done) return -Infinity;
    const i0 = p.games.findIndex(g => g.date >= d); const left = i0 < 0 ? 0 : p.games.length - i0;
    const m = model(p.pid, d);
    const playsTonight = i0 >= 0 && p.games[i0].date === d && p.games[i0].played;
    if (s.x !== null && s.inSlot) { // rider holding x
      if (left === 0) return s.x;
      if (playsTonight) return m.r[Math.min(left, 6)];
      return m.H(Math.min(left, 6), s.x); // (a known DNP tonight was resolved at the previous deadline)
    }
    if (left === 0) return -Infinity;
    if (playsTonight) return m.r[Math.min(left, 6)];
    // fresh, not tonight: discounted by unknown availability
    let v = 0; for (let k = 1; k <= Math.min(left, 6); k++) v = m.q * m.r[k] + (1 - m.q) * v; return v;
  }
  for (const d of nights) {
    const open = slots.filter(sl => !sl.locked);
    if (!open.length) break;
    const cand = pws.filter(p => !st.get(p.pid).done);
    const W = open.map(sl => cand.map(p => elig(p.pid, sl.label, usePos) ? weight(p, d) : -Infinity));
    const A = assign(W);
    const assigned = new Map(); A.assign.forEach((j, i) => { if (j >= 0) assigned.set(cand[j].pid, i); });
    // displaced riders lose their held score
    for (const p of cand) { const s = st.get(p.pid); if (s.inSlot && !assigned.has(p.pid)) { s.inSlot = false; s.x = null; } }
    const tonight = (p) => { const i = gIdx(p, d); return i >= 0 && p.games[i].played; };
    // borrow: slots reserved for players not playing tonight and not holding a score
    const inSlotTonight = new Map(); // pid -> open slot index
    for (const [pid, i] of assigned) { const p = cand.find(c => c.pid === pid); if (tonight(p)) inSlotTonight.set(pid, i); }
    const freeIdx = open.map((_, i) => i).filter(i => { const j = A.assign[i]; if (j < 0) return true; const p = cand[j]; const s = st.get(p.pid); return !tonight(p) && !(s.inSlot && s.x !== null); });
    const extras = cand.filter(p => tonight(p) && !assigned.has(p.pid)).sort((a, b) => weight(b, d) - weight(a, d));
    for (const p of extras) { const k = freeIdx.findIndex(i => elig(p.pid, open[i].label, usePos)); if (k >= 0) { inSlotTonight.set(p.pid, freeIdx[k]); freeIdx.splice(k, 1); } }
    // riders whose team plays tonight but who sit: their unlocked score resets to 0 at tip
    for (const p of cand) { const s = st.get(p.pid); const i = gIdx(p, d); if (s.inSlot && s.x !== null && i >= 0 && !p.games[i].played) s.x = 0; }
    for (const pid of inSlotTonight.keys()) { const p = cand.find(c => c.pid === pid); const s = st.get(pid); s.x = p.games[gIdx(p, d)].fp; s.inSlot = true; }
    // post-game lock decision (taken before each player's next game): evaluate lock subsets
    const P = [...inSlotTonight.keys()].map(pid => cand.find(c => c.pid === pid));
    const dn = nights[nights.indexOf(d) + 1] || '9999';
    const holdW = (p) => { // value of NOT locking p, seen at his next-game deadline
      const s = st.get(p.pid); const i = gIdx(p, d) + 1; if (i >= p.games.length) return s.x; // final: x stands
      const left = p.games.length - i; const m = model(p.pid, p.games[i].date);
      if (p.games[i].played) return m.r[Math.min(left, 6)];
      return Math.max(0, m.H(Math.min(left - 1, 6), 0)); // known DNP next: holding resets him to 0
    };
    let bestVal = -Infinity, bestL = 0; const n = Math.min(P.length, 10);
    const others = cand.filter(p => !inSlotTonight.has(p.pid) && !(st.get(p.pid).done));
    for (let mask = 0; mask < (1 << n); mask++) {
      const ppl = [...P, ...others];
      const Wm = open.map(sl => ppl.map((p, j) => { if (!elig(p.pid, sl.label, usePos)) return -Infinity; if (j < n) return (mask >> j) & 1 ? st.get(p.pid).x + BIG : holdW(p); return weight(p, dn); }));
      const a = assign(Wm); const cnt = a.assign.filter(j => j >= 0 && j < n && ((mask >> j) & 1)).length;
      const lockedN = [...Array(n).keys()].filter(j => (mask >> j) & 1).length; if (cnt < lockedN) continue;
      const val = a.value - BIG * lockedN; if (val > bestVal + 1e-9) { bestVal = val; bestL = mask; }
    }
    for (let j = 0; j < n; j++) if ((bestL >> j) & 1) {
      const p = P[j]; const s = st.get(p.pid); const k = slots.findIndex(sl => !sl.locked && elig(p.pid, sl.label, usePos) && !slots.some(o => o === sl && o.locked));
      // pick an eligible open slot that keeps the rest matchable: prefer specific position slots for single-position players
      const order = slots.map((sl, i) => i).filter(i => !slots[i].locked && elig(p.pid, slots[i].label, usePos)).sort((a, b) => (slots[a].label === 'UTIL') - (slots[b].label === 'UTIL'));
      const pickI = order.length ? order[0] : k; if (pickI < 0) continue;
      slots[pickI].locked = { pid: p.pid, x: s.x }; total += s.x; s.done = true; s.inSlot = false;
    }
  }
  // end of week: riders still in slots bank x (their final game, or 0 if DNP final: guarded above by locking)
  const open = slots.filter(sl => !sl.locked);
  const riders = pws.filter(p => { const s = st.get(p.pid); return !s.done && s.inSlot && s.x !== null; });
  const Wf = open.map(sl => riders.map(p => elig(p.pid, sl.label, usePos) ? st.get(p.pid).x : -Infinity));
  total += assign(Wf).value;
  return total;
}
function finalValue(p, s) { const G = p.games; const last = G[G.length - 1]; if (!last.played) return 0; return last.fp === s.x ? s.x : s.x; }

// ------------------------------------------------------------------ run
const POOL = (process.argv.find(a => a.startsWith('--pool=')) || '--pool=all').split('=')[1];
const rowsOut = [];
// riders' final value is their last game's score (0 if DNP), tracked in s.x
const startedSet = {}; // season|roster -> players ever started (for core pool)
for (const s of ['2025', '2026']) for (const w in D.matchups[s]) for (const m of D.matchups[s][w]) for (const pid of m.starters) if (pid !== '0') (startedSet[s + '|' + m.roster_id] = startedSet[s + '|' + m.roster_id] || new Set()).add(pid);
let missingLogs = 0, actualIllegal = 0, actualSlots = 0;
for (const s of ['2025', '2026']) for (let w = 1; w <= (s === '2026' ? 3 : 23); w++) {
  const ms = D.matchups[s][w];
  for (const m of ms) {
    let pool = m.players.filter(pid => { if (!D.logs[pid]) { missingLogs++; return false; } return true; });
    if (POOL === 'core') pool = pool.filter(pid => startedSet[s + '|' + m.roster_id].has(pid));
    const pws = pool.map(pid => pweek(pid, s, +w)).filter(p => p && p.played.length);
    const starters = m.starters.map(pid => pid === '0' ? null : pweek(pid, s, +w));
    m.starters.forEach((pid, i) => { if (pid === '0') return; actualSlots++; if (!elig(pid, SLOTS[i], true)) actualIllegal++; });
    const r = { s, w: +w, roster: m.roster_id, mid: m.matchup_id, actual: m.points };
    // same-7 (manager's own final starters): lock timing only
    r.same7_never = starters.reduce((t, p) => t + (p ? neverLock(p) : 0), 0);
    r.same7_first = starters.reduce((t, p) => t + (p ? lockFirst(p) : 0), 0);
    r.same7_res = starters.reduce((t, p) => t + (p ? walk(p, ruleRes) : 0), 0);
    r.same7_blind = starters.reduce((t, p) => t + (p ? walk(p, ruleBlind) : 0), 0);
    // PESSIMISTIC same-7: assume the player entered the slot only at the game the manager banked (earliest match);
    // earlier games were never lockable. Lower bound on the timing gain under unobservable mid-week rotation.
    const trunc = (p, i) => { if (!p) return null; const sp = m.starters_points[i]; const k = p.games.findIndex(g => g.played ? Math.abs(g.fp - sp) < 0.011 : sp === 0); if (k < 0) return p; const games = p.games.slice(k); return { ...p, games, played: games.filter(g => g.played) }; };
    r.same7_res_pess = starters.reduce((t, p, i) => t + (p ? walk(trunc(p, i), ruleRes) : 0), 0);
    r.same7_blind_pess = starters.reduce((t, p, i) => t + (p ? walk(trunc(p, i), ruleBlind) : 0), 0);
    r.same7_best_pess = starters.reduce((t, p, i) => { const q = trunc(p, i); return t + (q ? best(q) : 0); }, 0);
    // per-slot detail for decomposition
    r.slots = m.starters.map((pid, i) => { const p = starters[i]; if (!p) return { empty: true }; return { pid, actual: m.starters_points[i], res: walk(p, ruleRes), blind: walk(p, ruleBlind), never: neverLock(p), best: best(p), nPlayed: p.played.length, nGames: p.games.length }; });
    r.dead = r.slots.filter(x => x.empty || x.nPlayed === 0).length;
    r.zeroWithGames = r.slots.filter(x => !x.empty && x.nPlayed > 0 && x.actual === 0).length;
    r.same7_best = starters.reduce((t, p) => t + (p ? best(p) : 0), 0);
    for (const usePos of [true, false]) {
      const tag = usePos ? 'pos' : 'nopos';
      const firstNight = pws.length ? pws.map(p => p.games[0].date).sort()[0] : null;
      const m0 = (p) => model(p.pid, p.games[0].date);
      const core = (f) => pick7(pws, f, usePos);
      r['never_' + tag] = core(p => m0(p).mu).reduce((t, p) => t + (p ? neverLock(p) : 0), 0);
      r['first_' + tag] = core(p => m0(p).mu).reduce((t, p) => t + (p ? lockFirst(p) : 0), 0);
      r['res_' + tag] = core(p => m0(p).r[Math.min(p.games.length, 6)]).reduce((t, p) => t + (p ? walk(p, ruleRes) : 0), 0);
      r['lineup_' + tag] = lineupAware(pws, usePos);
      r['hind_' + tag] = pick7(pws, best, usePos).reduce((t, p) => t + (p ? best(p) : 0), 0);
    }
    // foresight check: lineup-aware with players who end up playing 0 games still in the pool
    const pwsAll = pool.map(pid => pweek(pid, s, +w)).filter(p => p && p.games.length);
    r.lineup_pos_nofore = lineupAware(pwsAll, true);
    rowsOut.push(r);
  }
}
fs.writeFileSync(require('path').join(require('./fetch.cjs').DIR, `backtest_rows_${POOL}.json`), JSON.stringify(rowsOut));
console.log('pool', POOL, 'team-weeks', rowsOut.length, 'missing logs (player-weeks dropped)', missingLogs, 'actual starters illegal under TODAY eligibility', actualIllegal, '/', actualSlots);
