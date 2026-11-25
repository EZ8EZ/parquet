// Backtest on the study's 240 active team-weeks (2025 w1-23, 2026 w1-3, pool=core):
//   points  = the nightly lineup-aware policy (lean by expected points)
//   winprob = same, but each lock decision by P(win) against the opponent as visible that night
//   wait    = points policy, but each lock decided only at its deadline (the night before his next game)
// Opponent at night d: his final lineup's players, the score each slot SHOWED after night d,
// locked-certain only when the shown score differs from that player's latest game; unknown
// slots locked with the league share 0.293; open slots play the rule shifted -1.55 a slot.
// node backtest_wp.mjs -> backtest_wp.txt, backtest_wp_rows.json
import fs from "node:fs";
import path from "node:path";
const { loadStudyData, WT } = await import("./data.mjs");
const M = await import(`${WT}/lib/lockin/model.js`);
const Pol = await import(`${WT}/lib/lockin/policy.js`);
const W = await import(`${WT}/lib/lockin/winprob.js`);
const { maxWeightAssign } = await import(`${WT}/lib/lockin/assign.js`);
const OUT = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const t0 = Date.now();
const D = loadStudyData();
const SLOTS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];
const SIMS = 600;
const UNKNOWN_LOCKED = process.env.ULOCK != null ? Number(process.env.ULOCK) : 0.293; // ULOCK: test another opponent unknown-lock share (D136)
const SHIFT = -1.55;
const EPS = 0.011;
const fpos = (pid) => D.players[pid]?.fantasy_positions || [];
const WIDEN = (process.env.WIDEN || "1,1").split(",").map(Number);
const widen = (a, c) => { if (c === 1) return a; let m = 0; for (const x of a) m += x; m /= a.length; return Float64Array.from(a, (x) => m + c * (x - m)); };
const TG = {};
for (const s of ["2025", "2026"]) for (const g of D.sched[s].games.values()) { if (g.status !== "complete") continue; for (const t of [g.home, g.away]) (TG[`${s}|${g.week}|${t}`] ||= []).push({ date: g.date, gameId: g.gameId }); }
for (const k in TG) TG[k].sort((a, b) => (a.date < b.date ? -1 : 1));
const mc = new Map();
const modelAt = (pid, date) => { const k = pid + "|" + date; if (!mc.has(k)) mc.set(k, M.playerModel(D.logs[pid] || [], date)); return mc.get(k); };
function pweek(pid, s, w) {
  const L = (D.logs[pid] || []).filter((g) => g.season === s && g.week === w);
  if (!L.length) return null;
  const team = L[L.length - 1].team;
  const byG = new Map(L.map((g) => [g.gameId, g]));
  const games = (TG[`${s}|${w}|${team}`] || []).map((t) => { const g = byG.get(t.gameId); return { date: t.date, played: !!(g && g.sp > 0), fp: g && g.sp > 0 ? g.fp : 0 }; });
  return { pid, games, played: games.filter((g) => g.played) };
}
const simP = (pid, games, x) => {
  if (!games.length) return null;
  const m = modelAt(pid, games[0].date);
  return { id: pid, sample: m.dist.sample, q: m.q.value, r: m.r, H: m.H, games: games.map(() => ({ plays: null })), x };
};

// opponent's visible state after night d -> simulated totals
function opponentTotals(m, s, w, d, seed) {
  let fixed = 0;
  const riders = [];
  const slots = [];
  m.starters.forEach((pid, i) => {
    if (!pid || pid === "0") return;
    const pw = pweek(pid, s, w);
    if (!pw) return;
    const banked = m.starters_points[i];
    const past = pw.games.filter((g) => g.date <= d);
    const fut = pw.games.filter((g) => g.date > d);
    const bIdx = pw.games.findIndex((g) => g.played && Math.abs(g.fp - banked) < EPS);
    const latest = past[past.length - 1];
    const lockedByNow = bIdx >= 0 && pw.games[bIdx].date <= d && past.length > 0 && past.length - 1 >= bIdx;
    const shown = lockedByNow ? banked : latest ? latest.fp : null;
    if (!fut.length) { fixed += shown ?? 0; return; }
    if (latest && shown != null && Math.abs(shown - latest.fp) > EPS) { fixed += shown; return; } // locked, certain
    // ULOCKALL=1: the share at every later deadline too, not only for the score held now (D137)
    const every = process.env.ULOCKALL ? { lockShare: UNKNOWN_LOCKED } : {};
    if (latest && latest.played) { const p = simP(pid, fut, latest.fp); if (p) riders.push({ ...p, wLocked: UNKNOWN_LOCKED, ...every, lockShareFrom: 1 }); return; }
    const p = simP(pid, fut, null);
    if (p) slots.push({ ...p, ...every });
  });
  return W.simulateTotals({ fixed, riders, slots, shift: SHIFT }, { sims: SIMS, seed });
}

function lineupAware(pws, mode, ctx) {
  const nights = [...new Set(pws.flatMap((p) => p.games.map((g) => g.date)))].sort();
  const slots = SLOTS.map((l) => ({ label: l, locked: null }));
  const st = new Map(pws.map((p) => [p.pid, { x: null, inSlot: false, done: false }]));
  const byId = new Map(pws.map((p) => [p.pid, p]));
  const view = (p) => ({ id: p.pid, positions: fpos(p.pid), games: p.games.map((g) => ({ date: g.date, plays: g.played })), ...st.get(p.pid) });
  const gIdx = (p, d) => p.games.findIndex((g) => g.date === d);
  const playsOn = (v, d) => { const g = v.games.find((x) => x.date === d); return !!(g && g.plays); };
  let total = 0;
  for (let ni = 0; ni < nights.length; ni++) {
    const d = nights[ni];
    const open = slots.filter((x) => !x.locked);
    if (!open.length) break;
    const openLabels = open.map((x) => x.label);
    const cand = pws.filter((p) => !st.get(p.pid).done);
    const res = Pol.assignTonight({ openLabels, cand: cand.map(view), d, modelAt, playsOn });
    for (const id of res.displaced) Object.assign(st.get(id), { inSlot: false, x: null });
    for (const p of cand) { const s = st.get(p.pid); const i = gIdx(p, d); if (s.inSlot && s.x !== null && i >= 0 && !p.games[i].played) s.x = 0; }
    for (const id of res.tonight.keys()) { const p = byId.get(id); Object.assign(st.get(id), { x: p.games[gIdx(p, d)].fp, inSlot: true }); }
    const dn = nights[ni + 1] || "9999";
    const nextIdx = (p) => p.games.findIndex((g) => g.date > d);
    // who decides tonight
    let deciders = [...res.tonight.keys()];
    if (mode === "wait") {
      const riders = pws.filter((p) => { const s = st.get(p.pid); return s.inSlot && s.x !== null && !s.done; }).map((p) => p.pid);
      deciders = riders.filter((id) => { const p = byId.get(id); const k = nextIdx(p); return k < 0 || p.games[k].date === dn; });
    }
    const holders = deciders.map((id) => { const v = view(byId.get(id)); const k = nextIdx(byId.get(id)); v.holdW = Pol.holderHoldValue(v, k < 0 ? v.games.length : k, modelAt); return v; });
    const others = cand.filter((p) => !deciders.includes(p.pid) && !st.get(p.pid).done && !(st.get(p.pid).inSlot && st.get(p.pid).x !== null)).map(view);
    const ch = Pol.chooseLocks({ openLabels, holders, others, dn, modelAt });
    let locks = new Set(ch.perHolder.filter((h) => h.locks).map((h) => h.id));
    if (mode === "winprob" && ch.perHolder.length) {
      const theirs = opponentTotals(ctx.opp, ctx.s, ctx.w, d, 11);
      // my visible team after night d
      const riderIds = pws.filter((p) => { const s = st.get(p.pid); return s.inSlot && s.x !== null && !s.done; }).map((p) => p.pid);
      const after = (p) => p.games.filter((g) => g.date > d);
      const standing = riderIds.filter((id) => !after(byId.get(id)).length).reduce((t, id) => t + st.get(id).x, 0);
      const riders = riderIds.map((id) => simP(id, after(byId.get(id)), st.get(id).x)).filter(Boolean);
      const nOpen = open.length - riderIds.length;
      const pool = pws.filter((p) => !st.get(p.pid).done && !riderIds.includes(p.pid) && after(p).length);
      const wts = pool.map((p) => { const v = Pol.slotWeight({ id: p.pid, positions: fpos(p.pid), games: after(p).map((g) => ({ date: g.date, plays: null })), x: null, inSlot: false, done: false }, after(p)[0].date, modelAt); return Number.isFinite(v) ? v : -Infinity; });
      const freeLabels = open.map((x) => x.label).slice(0, Math.max(0, nOpen));
      const A = maxWeightAssign(freeLabels.map((l) => pool.map((p, j) => (Pol.eligible(fpos(p.pid), l) ? wts[j] : -Infinity))));
      const fill = A.assign.filter((j) => j >= 0).map((j) => simP(pool[j].pid, after(pool[j]), null)).filter(Boolean);
      const base = { fixed: total + standing, riders, slots: fill };
      for (const h of ch.perHolder) {
        const hi = riders.findIndex((r) => r.id === h.id);
        if (hi < 0) continue;
        const hr = riders[hi];
        const rest = riders.filter((_, i) => i !== hi);
        const lockT = W.simulateTotals({ ...base, fixed: base.fixed + hr.x, riders: rest }, { sims: SIMS, seed: 5 });
        const holdT = W.simulateTotals({ ...base, riders: rest, slots: [...fill, { ...hr, x: null }] }, { sims: SIMS, seed: 5 });
        const thW = widen(theirs, WIDEN[1]);
        const lockW = widen(lockT, WIDEN[0]), holdW = widen(holdT, WIDEN[0]);
        const wl = W.pWin(lockW, thW), wh = W.pWin(holdW, thW);
        // paired standard error of the difference; under 2 SE the points lean stands
        let s1 = 0, s2 = 0;
        for (let i = 0; i < SIMS; i++) { const dd = (lockW[i] > thW[i] ? 1 : lockW[i] === thW[i] ? 0.5 : 0) - (holdW[i] > thW[i] ? 1 : holdW[i] === thW[i] ? 0.5 : 0); s1 += dd; s2 += dd * dd; }
        const se = Math.sqrt(Math.max(0, s2 / SIMS - (s1 / SIMS) ** 2) / SIMS);
        const winLock = Math.abs(wl - wh) < Math.max(2 * se, Number(process.env.GAP || 0.005)) ? h.locks : wl > wh;
        ctx.decisions.push({ pointsLock: h.locks, winLock, gap: Math.abs(wl - wh) });
        if (winLock) locks.add(h.id); else locks.delete(h.id);
      }
    }
    if (mode === "points" && ctx.calib && ni < nights.length - 1) {
      const theirs = opponentTotals(ctx.opp, ctx.s, ctx.w, d, 11);
      const after = (p) => p.games.filter((g) => g.date > d);
      const lockedNow = [...locks];
      const fixedNow = total + lockedNow.reduce((t, id) => t + st.get(id).x, 0);
      const riderIds = pws.filter((p) => { const s = st.get(p.pid); return s.inSlot && s.x !== null && !s.done && !lockedNow.includes(p.pid); }).map((p) => p.pid);
      const standing = riderIds.filter((id) => !after(byId.get(id)).length).reduce((t, id) => t + st.get(id).x, 0);
      const riders = riderIds.map((id) => simP(id, after(byId.get(id)), st.get(id).x)).filter(Boolean);
      const openN = slots.filter((x) => !x.locked).length - lockedNow.length - riderIds.length;
      const pool = pws.filter((p) => !st.get(p.pid).done && !lockedNow.includes(p.pid) && !riderIds.includes(p.pid) && after(p).length);
      const wts = pool.map((p) => { const v = Pol.slotWeight({ id: p.pid, positions: fpos(p.pid), games: after(p).map((g) => ({ date: g.date, plays: null })), x: null, inSlot: false, done: false }, after(p)[0].date, modelAt); return Number.isFinite(v) ? v : -Infinity; });
      const labels = slots.filter((x) => !x.locked).map((x) => x.label).slice(0, Math.max(0, openN));
      const A = maxWeightAssign(labels.map((l) => pool.map((p, j) => (Pol.eligible(fpos(p.pid), l) ? wts[j] : -Infinity))));
      const fill = A.assign.filter((j) => j >= 0).map((j) => simP(pool[j].pid, after(pool[j]), null)).filter(Boolean);
      const mine = W.simulateTotals({ fixed: fixedNow + standing, riders, slots: fill }, { sims: SIMS, seed: 5 });
      ctx.calib.push({ s: ctx.s, nightsLeft: nights.length - 1 - ni, mine, theirs });
    }
    for (const id of locks) {
      const k = Pol.pickLockSlot(slots, fpos(id));
      if (k < 0) continue;
      const s = st.get(id);
      slots[k].locked = { pid: id, x: s.x };
      total += s.x;
      Object.assign(s, { done: true, inSlot: false });
    }
  }
  const open = slots.filter((x) => !x.locked);
  const riders = pws.filter((p) => { const s = st.get(p.pid); return !s.done && s.inSlot && s.x !== null; });
  total += maxWeightAssign(open.map((x) => riders.map((p) => (Pol.eligible(fpos(p.pid), x.label) ? st.get(p.pid).x : -Infinity)))).value;
  return total;
}

const startedSet = {};
for (const s of ["2025", "2026"]) for (const w in D.matchups[s]) for (const m of D.matchups[s][w]) for (const pid of m.starters) if (pid !== "0") (startedSet[s + "|" + m.roster_id] ||= new Set()).add(pid);
const rows = [];
const decisions = [];
const calibAll = [];
for (const s of ["2025", "2026"]) for (let w = 1; w <= (s === "2026" ? 3 : 23); w++) for (const m of D.matchups[s][w]) {
  const starters = m.starters.map((pid) => (pid === "0" ? null : pweek(pid, s, w)));
  const dead = m.starters.filter((pid, i) => !starters[i] || !starters[i].played.length).length;
  const zero = m.starters.filter((pid, i) => starters[i] && starters[i].played.length && m.starters_points[i] === 0).length;
  if (dead || zero) continue; // active team-weeks only
  const opp = D.matchups[s][w].find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
  if (!opp) continue;
  const pool = m.players.filter((pid) => D.logs[pid] && startedSet[s + "|" + m.roster_id].has(pid));
  const pws = pool.map((pid) => pweek(pid, s, w)).filter((p) => p && p.played.length);
  const ctx = { opp, s, w, decisions, calib: process.env.CALIB ? [] : null };
  const pointsTotal = lineupAware(pws, "points", ctx);
  if (ctx.calib) for (const c of ctx.calib) calibAll.push({ ...c, myFinal: pointsTotal, oppFinal: opp.points, key: `${s}|${w}|${m.roster_id}`, cluster: `${s}|${m.roster_id}` });
  rows.push({ s, w, roster: m.roster_id, actual: m.points, oppActual: opp.points, points: pointsTotal, winprob: process.env.CALIB ? pointsTotal : lineupAware(pws, "winprob", ctx), wait: process.env.CALIB ? pointsTotal : lineupAware(pws, "wait", ctx) });
}
fs.writeFileSync(path.join(OUT, "backtest_wp_rows.json"), JSON.stringify(rows));
if (process.env.CALIB) {
  const { calibrationReport } = await import(path.join(OUT, "opponent_calib_report.mjs"));
  calibrationReport(calibAll, W, OUT);
  process.exit(0);
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const quant = (a, q) => { const x = [...a].sort((u, v) => u - v); const i = (x.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return x[lo] + (x[hi] - x[lo]) * (i - lo); };
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const clusters = Object.values(rows.reduce((a, r, i) => ((a[r.s + "|" + r.roster] ||= []).push(i), a), {}));
const boot = (d) => { seed = 7; const out = []; for (let b = 0; b < 2000; b++) { let t = 0, n = 0; for (let c = 0; c < clusters.length; c++) for (const i of clusters[Math.floor(rnd() * clusters.length)]) { t += d[i]; n++; } out.push(t / n); } return [quant(out, 0.025), quant(out, 0.975)]; };
const win = (x, o) => (x > o ? 1 : x === o ? 0.5 : 0);
const lines = [`Active team-weeks n=${rows.length} (clusters ${clusters.length}); ${SIMS} sims per branch; wall ${((Date.now() - t0) / 1000).toFixed(0)} s`];
lines.push("| policy | mean points | minus actual [95% CI] | matchups won vs opponent's actual | minus actual's wins [95% CI] |");
const wa = rows.map((r) => win(r.actual, r.oppActual));
for (const k of ["actual", "points", "winprob", "wait"]) {
  const pts = rows.map((r) => r[k]);
  const dP = rows.map((r) => r[k] - r.actual);
  const wk = rows.map((r) => win(r[k], r.oppActual));
  const dW = wk.map((x, i) => x - wa[i]);
  const [p1, p2] = boot(dP), [w1, w2] = boot(dW);
  lines.push(`| ${k} | ${mean(pts).toFixed(1)} | ${k === "actual" ? "-" : `${mean(dP) >= 0 ? "+" : ""}${mean(dP).toFixed(2)} [${p1.toFixed(1)}, ${p2.toFixed(1)}]`} | ${mean(wk).toFixed(3)} (${wk.reduce((t, x) => t + x, 0)}) | ${k === "actual" ? "-" : `${(mean(dW) * 100).toFixed(1)} pts [${(w1 * 100).toFixed(1)}, ${(w2 * 100).toFixed(1)}]`} |`);
}
for (const [a, b] of [["winprob", "points"], ["wait", "points"]]) {
  const dP = rows.map((r) => r[a] - r[b]);
  const dW = rows.map((r) => win(r[a], r.oppActual) - win(r[b], r.oppActual));
  const [p1, p2] = boot(dP), [w1, w2] = boot(dW);
  lines.push(`${a} minus ${b} (paired): points ${mean(dP) >= 0 ? "+" : ""}${mean(dP).toFixed(2)} [${p1.toFixed(2)}, ${p2.toFixed(2)}]; wins ${(mean(dW) * 100).toFixed(2)} pts of team-weeks [${(w1 * 100).toFixed(2)}, ${(w2 * 100).toFixed(2)}]; flips L->W ${dW.filter((x) => x > 0).length}, W->L ${dW.filter((x) => x < 0).length}`);
}
const dis = decisions.filter((x) => x.pointsLock !== x.winLock);
lines.push(`Lock decisions scored by both leans: ${decisions.length}; win-probability lean disagreed with the points lean in ${dis.length} (${((dis.length / decisions.length) * 100).toFixed(1)}%): lock instead of hold ${dis.filter((x) => x.winLock).length}, hold instead of lock ${dis.filter((x) => !x.winLock).length}; median win-chance gap where they disagreed ${dis.length ? (quant(dis.map((x) => x.gap), 0.5) * 100).toFixed(1) : "-"} pts`);
fs.writeFileSync(path.join(OUT, "backtest_wp.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
