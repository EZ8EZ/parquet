// Replays the study's backtest (2025 w1-23, 2026 w1-3, pool=core) through lib/lockin's production
// functions, on the study's cached responses. The week loop is glue; every model, stopping and
// assignment decision is a lib/lockin call. node replay.mjs  -> replay_rows.json, replay_summary.txt
import fs from "node:fs";
import path from "node:path";
import { loadStudyData, WT, STUDY } from "./data.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const Pol = await import(`${WT}/lib/lockin/policy.js`);
const { maxWeightAssign } = await import(`${WT}/lib/lockin/assign.js`);
const OUT = STUDY;
const t0 = Date.now();
const D = loadStudyData();
const SLOTS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];
const fpos = (pid) => D.players[pid]?.fantasy_positions || [];
const elig = (pid, l, usePos) => Pol.eligible(fpos(pid), l, usePos);

const TG = {};
for (const s of ["2025", "2026"])
  for (const g of D.sched[s].games.values()) {
    if (g.status !== "complete") continue;
    for (const t of [g.home, g.away]) (TG[`${s}|${g.week}|${t}`] ||= []).push({ date: g.date, gameId: g.gameId });
  }
for (const k in TG) TG[k].sort((a, b) => (a.date < b.date ? -1 : 1));

const mc = new Map();
const modelAt = (pid, date) => {
  const k = pid + "|" + date;
  if (!mc.has(k)) mc.set(k, M.playerModel(D.logs[pid] || [], date));
  return mc.get(k);
};
function pweek(pid, s, w) {
  const L = (D.logs[pid] || []).filter((g) => g.season === s && g.week === w);
  if (!L.length) return null;
  const team = L[L.length - 1].team;
  const byG = new Map(L.map((g) => [g.gameId, g]));
  const games = (TG[`${s}|${w}|${team}`] || []).map((t) => {
    const g = byG.get(t.gameId);
    return { date: t.date, gameId: t.gameId, played: !!(g && g.sp > 0), fp: g ? g.fp : 0 };
  });
  return { pid, games, played: games.filter((g) => g.played) };
}
function walk(pw, playsMode) {
  const G = pw.games;
  let x = null;
  for (let i = 0; i < G.length; i++) {
    if (x !== null) {
      const plays = playsMode === "blind" ? null : G[i].played;
      if (M.perPlayerRuleLocks(modelAt(pw.pid, G[i].date), x, G.length - i, plays)) return x;
    }
    if (G[i].played) x = G[i].fp;
    else if (x !== null) x = 0;
  }
  return x === null ? 0 : x;
}
const neverLock = (pw) => { const G = pw.games; return G.length && G[G.length - 1].played ? G[G.length - 1].fp : 0; };
const best = (pw) => (pw.played.length ? Math.max(...pw.played.map((g) => g.fp)) : 0);

// Within-night ordering (lockin-sequence): a night splits into tip waves; a wave starts when a
// tip comes >=150 min after the latest tip of the current wave, so every game of a wave is final
// before the next wave tips. Real tips from Sleeper's scores feed (cached by
// ../lockin-sequence/fetch_scores.mjs). A wave is then a decision point exactly like a night.
const SEQ_DIR = path.join(OUT, "..", "lockin-sequence", "scores");
const WAVE_GAP_MIN = Number(process.env.WAVE_GAP_MIN || 150);
const waveOf = new Map();
let multiWaveNights = 0, nightsTotal = 0;
if (fs.existsSync(SEQ_DIR)) {
  const byDate = new Map();
  for (const f of fs.readdirSync(SEQ_DIR)) for (const g of JSON.parse(fs.readFileSync(path.join(SEQ_DIR, f), "utf8"))) {
    if (typeof g.start_time !== "number") continue;
    (byDate.get(g.date) || byDate.set(g.date, []).get(g.date)).push(g);
  }
  for (const games of byDate.values()) {
    games.sort((a, b) => a.start_time - b.start_time);
    let wave = 0, latest = games[0].start_time;
    for (const g of games) {
      if ((g.start_time - latest) / 60000 >= WAVE_GAP_MIN) wave++;
      latest = Math.max(latest, g.start_time);
      waveOf.set(g.game_id, wave);
    }
    nightsTotal++;
    if (wave > 0) multiWaveNights++;
  }
}
const toWaves = (pw) => ({ ...pw, games: pw.games.map((g) => ({ ...g, date: `${g.date}#${waveOf.get(g.gameId) ?? 0}` })) });
const modelAtKey = (pid, key) => modelAt(pid, key.slice(0, 10));

const A = await import(`${WT}/lib/lockin/availability.js`);
function holdValueP(v, nextIdx, modelAt) {
  if (nextIdx >= v.games.length) return v.x;
  const left = v.games.length - nextIdx;
  const g = v.games[nextIdx];
  const m = modelAt(v.id, g.date);
  const K = (k) => Math.min(k, 6);
  if (g.plays === false) return Math.max(0, m.H(K(left - 1), 0));
  if (g.plays === null && typeof g.p === "number") return g.p * m.r[K(left)] + (1 - g.p) * Math.max(0, left - 1 > 0 ? m.H(K(left - 1), 0) : 0);
  return m.r[K(left)];
}
function lineupAware(pws, usePos, mode, mAt = modelAt) {
  const modelAt = mAt;
  const nights = [...new Set(pws.flatMap((p) => p.games.map((g) => g.date)))].sort();
  const slots = SLOTS.map((l) => ({ label: l, locked: null }));
  const st = new Map(pws.map((p) => [p.pid, { x: null, inSlot: false, done: false }]));
  const byId = new Map(pws.map((p) => [p.pid, p]));
  let curNight = null;
  // oracle: every game's play known; blind*: tonight known (the injury report), later games unknown
  const view = (p) => {
    const games = p.games.map((g) => {
      if (mode === "oracle" || g.date <= curNight) return { date: g.date, plays: g.played };
      return { date: g.date, plays: null };
    });
    if (mode === "blindP") {
      const fut = games.map((g, i) => [g, i]).filter(([g]) => g.plays === null);
      if (fut.length) {
        const m = modelAt(p.pid, curNight);
        const ps = A.playProbabilities({ log: D.logs[p.pid] || [], asOf: fut[0][0].date, q: m.q.value, dates: fut.map(([g]) => g.date) });
        fut.forEach(([g], j) => (g.p = ps[j]));
      }
    }
    return { id: p.pid, positions: usePos ? fpos(p.pid) : null, games, ...st.get(p.pid) };
  };
  const gIdx = (p, d) => p.games.findIndex((g) => g.date === d);
  const playsOn = (v, d) => { const p = byId.get(v.id); const g = p.games.find((x) => x.date === d); return !!(g && g.played); };
  let total = 0;
  for (let ni = 0; ni < nights.length; ni++) {
    const d = nights[ni];
    curNight = d;
    const open = slots.filter((s) => !s.locked);
    if (!open.length) break;
    const openLabels = open.map((s) => s.label);
    const cand = pws.filter((p) => !st.get(p.pid).done);
    const res = Pol.assignTonight({ openLabels, cand: cand.map(view), d, modelAt, playsOn, usePos });
    for (const id of res.displaced) Object.assign(st.get(id), { inSlot: false, x: null });
    for (const p of cand) {
      const s = st.get(p.pid);
      const i = gIdx(p, d);
      if (s.inSlot && s.x !== null && i >= 0 && !p.games[i].played) s.x = 0;
    }
    for (const id of res.tonight.keys()) {
      const p = byId.get(id);
      Object.assign(st.get(id), { x: p.games[gIdx(p, d)].fp, inSlot: true });
    }
    const dn = nights[ni + 1] || "9999";
    const holders = [...res.tonight.keys()].map((id) => {
      const v = view(byId.get(id));
      const ni2 = gIdx(byId.get(id), d) + 1;
      v.holdW = mode === "blindP" ? holdValueP(v, ni2, modelAt) : Pol.holderHoldValue(v, ni2, modelAt);
      return v;
    });
    const others = cand.filter((p) => !res.tonight.has(p.pid) && !st.get(p.pid).done).map(view);
    const ch = Pol.chooseLocks({ openLabels, holders, others, dn, modelAt, usePos });
    for (const h of ch.perHolder) {
      if (!h.locks) continue;
      const k = Pol.pickLockSlot(slots, usePos ? fpos(h.id) : null, usePos);
      if (k < 0) continue;
      const s = st.get(h.id);
      slots[k].locked = { pid: h.id, x: s.x };
      total += s.x;
      Object.assign(s, { done: true, inSlot: false });
    }
  }
  const open = slots.filter((s) => !s.locked);
  const riders = pws.filter((p) => { const s = st.get(p.pid); return !s.done && s.inSlot && s.x !== null; });
  total += maxWeightAssign(open.map((s) => riders.map((p) => (elig(p.pid, s.label, usePos) ? st.get(p.pid).x : -Infinity)))).value;
  return total;
}
const startedSet = {};
for (const s of ["2025", "2026"]) for (const w in D.matchups[s]) for (const m of D.matchups[s][w]) for (const pid of m.starters) if (pid !== "0") (startedSet[s + "|" + m.roster_id] ||= new Set()).add(pid);
const rows = [];
for (const s of ["2025", "2026"])
  for (let w = 1; w <= (s === "2026" ? 3 : 23); w++)
    for (const m of D.matchups[s][w]) {
      const pool = m.players.filter((pid) => D.logs[pid] && startedSet[s + "|" + m.roster_id].has(pid));
      const pws = pool.map((pid) => pweek(pid, s, w)).filter((p) => p && p.played.length);
      const starters = m.starters.map((pid) => (pid === "0" ? null : pweek(pid, s, w)));
      const slots = m.starters.map((pid, i) => { const p = starters[i]; return p ? { actual: m.starters_points[i], nPlayed: p.played.length } : { empty: true }; });
      const r = { s, w, roster: m.roster_id, actual: m.points };
      r.dead = slots.filter((x) => x.empty || x.nPlayed === 0).length;
      r.zeroWithGames = slots.filter((x) => !x.empty && x.nPlayed > 0 && x.actual === 0).length;
      r.oracle = lineupAware(pws, true, "oracle");
      r.blindR = lineupAware(pws, true, "blindR");
      r.blindP = lineupAware(pws, true, "blindP");
      rows.push(r);
    }
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const out = [];
for (const filter of ["active", "all"]) {
  const R = filter === "active" ? rows.filter((r) => r.dead === 0 && r.zeroWithGames === 0) : rows;
  const clusters = Object.values(R.reduce((a, r, i) => ((a[r.s + "|" + r.roster] ||= []).push(i), a), {}));
  const boot = (d) => { seed = 7; const o = []; for (let b = 0; b < 2000; b++) { let t = 0, n = 0; for (let c = 0; c < clusters.length; c++) for (const i of clusters[Math.floor(rnd() * clusters.length)]) { t += d[i]; n++; } o.push(t / n); } return [quant(o, 0.025), quant(o, 0.975)]; };
  out.push(`\n${filter}: n=${R.length}, clusters=${clusters.length}`);
  for (const k of ["oracle", "blindR", "blindP"]) { const d = R.map((r) => r[k] - r.actual); const [a, b] = boot(d); out.push(`${k} minus actual: ${mean(d).toFixed(2)} [${a.toFixed(2)}, ${b.toFixed(2)}]`); }
  const dd = R.map((r) => r.blindP - r.blindR); const [a, b] = boot(dd);
  const ch = R.filter((r) => Math.abs(r.blindP - r.blindR) > 0.011);
  out.push(`blindP minus blindR (paired): ${mean(dd).toFixed(3)} [${a.toFixed(3)}, ${b.toFixed(3)}]; changed ${ch.length} (higher ${ch.filter((r) => r.blindP > r.blindR).length}, lower ${ch.filter((r) => r.blindP < r.blindR).length})`);
}
fs.writeFileSync(path.join(OUT, "lean_playchance.txt"), out.join("\n") + "\n");
console.log(out.join("\n"));
