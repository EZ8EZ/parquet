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

function lineupAware(pws, usePos, mAt = modelAt) {
  const modelAt = mAt;
  const nights = [...new Set(pws.flatMap((p) => p.games.map((g) => g.date)))].sort();
  const slots = SLOTS.map((l) => ({ label: l, locked: null }));
  const st = new Map(pws.map((p) => [p.pid, { x: null, inSlot: false, done: false }]));
  const byId = new Map(pws.map((p) => [p.pid, p]));
  const view = (p) => ({ id: p.pid, positions: usePos ? fpos(p.pid) : null, games: p.games.map((g) => ({ date: g.date, plays: g.played })), ...st.get(p.pid) });
  const gIdx = (p, d) => p.games.findIndex((g) => g.date === d);
  const playsOn = (v, d) => { const g = v.games.find((x) => x.date === d); return !!(g && g.plays); };
  let total = 0;
  for (let ni = 0; ni < nights.length; ni++) {
    const d = nights[ni];
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
      v.holdW = Pol.holderHoldValue(v, gIdx(byId.get(id), d) + 1, modelAt);
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
      const r = { s, w, roster: m.roster_id, mid: m.matchup_id, actual: m.points };
      r.same7_res = starters.reduce((t, p) => t + (p ? walk(p) : 0), 0);
      r.same7_blind = starters.reduce((t, p) => t + (p ? walk(p, "blind") : 0), 0);
      r.same7_never = starters.reduce((t, p) => t + (p ? neverLock(p) : 0), 0);
      const slots = m.starters.map((pid, i) => { const p = starters[i]; return p ? { actual: m.starters_points[i], nPlayed: p.played.length } : { empty: true }; });
      r.dead = slots.filter((x) => x.empty || x.nPlayed === 0).length;
      r.zeroWithGames = slots.filter((x) => !x.empty && x.nPlayed > 0 && x.actual === 0).length;
      r.lineup_pos = lineupAware(pws, true);
      if (waveOf.size) {
        const wpws = pws.map(toWaves);
        r.lineup_wave = lineupAware(wpws, true, modelAtKey);
        r.multiWave = wpws.some((p) => p.games.some((g) => !g.date.endsWith("#0")));
      }
      r.hind_same7 = starters.reduce((t, p) => t + (p ? best(p) : 0), 0);
      rows.push(r);
    }
fs.writeFileSync(path.join(OUT, "replay_rows.json"), JSON.stringify(rows));

// summary: seeded cluster bootstrap by team-season, as summarize.js
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const lines = [];
const study = JSON.parse(fs.readFileSync(path.join(STUDY, "backtest_rows_core.json"), "utf8"));
const sk = (r) => `${r.s}|${r.w}|${r.roster}`;
const studyBy = new Map(study.map((r) => [sk(r), r]));
for (const filter of ["active", "all"]) {
  const R = filter === "active" ? rows.filter((r) => r.dead === 0 && r.zeroWithGames === 0) : rows;
  const clusters = Object.values(R.reduce((a, r, i) => ((a[r.s + "|" + r.roster] ||= []).push(i), a), {}));
  lines.push(`\n${filter}: n team-weeks=${R.length}, clusters=${clusters.length}`);
  for (const k of ["same7_res", "same7_blind", "same7_never", "lineup_pos", "hind_same7"]) {
    const d = R.map((r) => r[k] - r.actual);
    seed = 7;
    const out = [];
    for (let b = 0; b < 2000; b++) { let t = 0, n = 0; for (let c = 0; c < clusters.length; c++) { for (const i of clusters[Math.floor(rnd() * clusters.length)]) { t += d[i]; n++; } } out.push(t / n); }
    const studyKey = k === "hind_same7" ? "same7_best" : k;
    const sd = R.map((r) => studyBy.get(sk(r))?.[studyKey]);
    const agree = R.filter((r, i) => sd[i] !== undefined && Math.abs(sd[i] - r[k]) < 0.011).length;
    const sMean = mean(R.map((r, i) => sd[i] - r.actual));
    lines.push(`${k}: mean ${mean(R.map((r) => r[k])).toFixed(1)}, minus actual ${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(2)} [${quant(out, 0.025).toFixed(1)}, ${quant(out, 0.975).toFixed(1)}] | study rows same team-weeks ${sMean >= 0 ? "+" : ""}${sMean.toFixed(2)}; identical team-weeks ${agree}/${R.length}`);
  }
  if (R.length && R[0].lineup_wave !== undefined) {
    const boot = (d) => { seed = 7; const out = []; for (let b = 0; b < 2000; b++) { let t = 0, n = 0; for (let c = 0; c < clusters.length; c++) { for (const i of clusters[Math.floor(rnd() * clusters.length)]) { t += d[i]; n++; } } out.push(t / n); } return [quant(out, 0.025), quant(out, 0.975)]; };
    const dA = R.map((r) => r.lineup_wave - r.actual);
    const dW = R.map((r) => r.lineup_wave - r.lineup_pos);
    const [a1, a2] = boot(dA);
    const [w1, w2] = boot(dW);
    const changed = R.filter((r) => Math.abs(r.lineup_wave - r.lineup_pos) > 0.011);
    lines.push(`lineup_wave (tip waves): mean ${mean(R.map((r) => r.lineup_wave)).toFixed(1)}, minus actual ${mean(dA) >= 0 ? "+" : ""}${mean(dA).toFixed(2)} [${a1.toFixed(1)}, ${a2.toFixed(1)}]`);
    lines.push(`lineup_wave minus lineup_pos (paired): ${mean(dW) >= 0 ? "+" : ""}${mean(dW).toFixed(2)} [${w1.toFixed(2)}, ${w2.toFixed(2)}]; team-weeks with a 2-wave night ${R.filter((r) => r.multiWave).length}/${R.length}; team-weeks whose total changed ${changed.length} (higher ${changed.filter((r) => r.lineup_wave > r.lineup_pos).length}, lower ${changed.filter((r) => r.lineup_wave < r.lineup_pos).length})`);
  }
}
lines.push(`\nnights with tips: ${nightsTotal}; nights with a second tip wave (>=${WAVE_GAP_MIN} min after the latest earlier tip): ${multiWaveNights}`);
lines.push(`\nwall ${((Date.now() - t0) / 1000).toFixed(1)} s; model evaluations ${mc.size}`);
fs.writeFileSync(path.join(OUT, "replay_summary.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
