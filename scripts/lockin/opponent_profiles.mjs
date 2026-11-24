// Manager lock-in profiles from every completed lock-in week (2022-2026 w1-5), keyed by owner
// user_id; recency-weighted and credibility-shrunk to the league. Validated on 2026: does the
// manager profile predict a team's final weekly total better than the league profile?
// node profiles.mjs -> profiles.json, profiles.txt, slotfacts.json
import fs from "node:fs";
import path from "node:path";
import { loadAll, WT } from "./opponent_data2.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const W = await import(`${WT}/lib/lockin/winprob.js`);
const MU = await import(`${WT}/lib/lockin/matchup.js`);
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const { seasons, players, logOf } = loadAll();
const EPS = 0.011;
const mc = new Map();
const modelAt = (pid, date) => { const k = pid + "|" + date; if (!mc.has(k)) mc.set(k, M.playerModel(logOf(pid), date)); return mc.get(k); };
const dow = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
const order = ["2022", "2023", "2024", "2025", "2026"];
const tIndex = (s, w) => order.indexOf(s) * 23 + w;

function weekGames(pid, s, w) {
  const L = logOf(pid).filter((g) => g.season === s && g.week === w);
  if (!L.length) return null;
  const team = L[L.length - 1].team;
  const byG = new Map(L.map((g) => [g.gameId, g]));
  const tw = seasons[s].sched.teamWeek.get(`${team}|${w}`) || [];
  const games = tw.filter((g) => g.status === "complete").map((g) => { const r = byG.get(g.gameId); return { date: g.date, gameId: g.gameId, played: !!(r && r.sp > 0), fp: r && r.sp > 0 ? r.fp : 0 }; });
  return games.length ? games : null;
}
function ruleWalk(pid, games) {
  let x = null;
  for (let i = 0; i < games.length; i++) {
    if (x !== null && M.perPlayerRuleLocks(modelAt(pid, games[i].date), x, games.length - i, games[i].played)) return x;
    x = games[i].played ? games[i].fp : x === null ? null : 0;
  }
  return x === null ? 0 : x;
}

// ---- slot facts
const slots = [];
const teamWeeks = [];
for (const s of order) {
  const S = seasons[s];
  for (let w = 1; w <= S.weeks; w++) {
    for (const m of S.matchups[w]) {
      const owner = S.owner.get(m.roster_id) || `r${m.roster_id}`;
      let allPlayed = true;
      const tw = { s, w, owner, roster: m.roster_id, points: m.points, mid: m.matchup_id, slots: [] };
      (m.starters || []).forEach((pid, i) => {
        const banked = m.starters_points?.[i] ?? 0;
        if (!pid || pid === "0") { allPlayed = false; tw.slots.push({ empty: true }); slots.push({ s, w, owner, empty: true }); return; }
        const games = weekGames(pid, s, w);
        if (!games || !games.some((g) => g.played)) { allPlayed = false; tw.slots.push({ pid, banked, noGames: true }); slots.push({ s, w, owner, pid, banked, noGames: true }); return; }
        let idx = games.findIndex((g) => g.played && Math.abs(g.fp - banked) < EPS);
        const lastIdx = games.length - 1;
        if (idx < 0 && banked === 0 && !games[lastIdx].played) idx = lastIdx;
        const f = { s, w, owner, pid, banked, n: games.length, idx, zero: banked === 0 && games.some((g) => g.played), rule: ruleWalk(pid, games) };
        if (idx >= 0) {
          f.early = dow(games[idx].date) <= 3;
          f.deliberate = idx < lastIdx; // banked before the final game: a lock
          if (f.deliberate) f.ratio = banked / Math.max(1, modelAt(pid, games[idx].date).dist.mean);
          // unknown-until-next-tip situations: each played game before the last, not yet locked
          f.unknown = [];
          for (let g = 0; g < lastIdx; g++) if (games[g].played && idx >= g) f.unknown.push(idx === g ? 1 : 0);
        }
        tw.slots.push(f);
        slots.push(f);
      });
      tw.allPlayed = allPlayed;
      teamWeeks.push(tw);
    }
  }
}

// ---- profile fit
function fit(rows, tws, T, halfLife) {
  const wt = (s, w) => (halfLife === Infinity ? 1 : Math.pow(0.5, (T - tIndex(s, w)) / halfLife));
  const acc = { early: [0, 0], ratio: [], empty: [0, 0], zero: [0, 0], unk: [0, 0], vsRule: [0, 0], bench: [0, 0], lockPts: [] };
  const bySeason = {};
  for (const f of rows) {
    const k = wt(f.s, f.w);
    acc.empty[0] += k * (f.empty ? 1 : 0); acc.empty[1] += k;
    if (f.empty || f.noGames) continue;
    acc.zero[0] += k * (f.zero ? 1 : 0); acc.zero[1] += k;
    acc.vsRule[0] += k * (f.banked - f.rule); acc.vsRule[1] += k;
    if (f.idx >= 0) {
      acc.early[0] += k * (f.early ? 1 : 0); acc.early[1] += k;
      if (f.deliberate) { acc.ratio.push([f.ratio, k]); acc.lockPts.push([f.banked, k]); }
      for (const u of f.unknown) { acc.unk[0] += k * u; acc.unk[1] += k; }
    }
  }
  for (const t of tws) { const k = wt(t.s, t.w); acc.bench[0] += k * (t.allPlayed ? 1 : 0); acc.bench[1] += k; bySeason[t.s] = (bySeason[t.s] || { weeks: 0, weight: 0 }); bySeason[t.s].weeks++; bySeason[t.s].weight += k; }
  const wmed = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x[0] - y[0]); const tot = a.reduce((t, x) => t + x[1], 0); let c = 0; for (const [v, k] of a) { c += k; if (c >= tot / 2) return v; } return a[a.length - 1][0]; };
  const r = (a) => (a[1] ? a[0] / a[1] : null);
  const totalW = Object.values(bySeason).reduce((t, x) => t + x.weight, 0);
  return {
    earlyShare: r(acc.early), vsForecast: wmed(acc.ratio), lockMedian: wmed(acc.lockPts), emptySlotRate: r(acc.empty), zeroRate: r(acc.zero),
    unknownLockedShare: r(acc.unk), pointsVsRulePerSlot: r(acc.vsRule), benchUse: r(acc.bench), nEff: acc.bench[1], weeks: tws.length,
    seasons: Object.entries(bySeason).map(([season, x]) => ({ season, weeks: x.weeks, weight: Math.round((x.weight / totalW) * 1000) / 1000 })),
    nUnknown: acc.unk[1] && rows.reduce((t, f) => t + (f.unknown ? f.unknown.length : 0), 0),
  };
}
const shrink = (own, league, nEff, K) => {
  const out = {};
  for (const k of ["earlyShare", "vsForecast", "lockMedian", "emptySlotRate", "zeroRate", "unknownLockedShare", "pointsVsRulePerSlot", "benchUse"]) out[k] = own[k] == null ? league[k] : (nEff * own[k] + K * league[k]) / (nEff + K);
  return { ...out, shrinkage: K / (nEff + K) };
};
function profilesUpTo(maxT, halfLife, K) {
  const rows = slots.filter((f) => tIndex(f.s, f.w) <= maxT);
  const tws = teamWeeks.filter((t) => tIndex(t.s, t.w) <= maxT);
  const league = fit(rows, tws, maxT, Infinity);
  const out = {};
  for (const o of new Set(tws.map((t) => t.owner))) {
    const own = fit(rows.filter((f) => f.owner === o), tws.filter((t) => t.owner === o), maxT, halfLife);
    out[o] = { ...shrink(own, league, own.nEff, K), weeks: own.weeks, seasons: own.seasons, raw: own };
  }
  return { league, managers: out };
}

// ---- choose half-life out of sample: profiles from <=2025 predicting each manager's 2026 values
const T25 = tIndex("2025", 23);
const T26 = tIndex("2026", 5);
const actual26 = {};
for (const o of new Set(teamWeeks.filter((t) => t.s === "2026").map((t) => t.owner))) actual26[o] = fit(slots.filter((f) => f.owner === o && f.s === "2026"), teamWeeks.filter((t) => t.owner === o && t.s === "2026"), T26, Infinity);
const lines = [];
const hlRows = [];
for (const hl of [12, 23, 46, Infinity]) {
  for (const K of [6, 12, 24]) {
    const P = profilesUpTo(T25, hl, K);
    let se = 0, n = 0;
    for (const [o, a] of Object.entries(actual26)) {
      const p = P.managers[o];
      if (!p) continue;
      for (const k of ["pointsVsRulePerSlot", "zeroRate", "earlyShare", "benchUse"]) {
        const scale = { pointsVsRulePerSlot: 3, zeroRate: 0.05, earlyShare: 0.15, benchUse: 0.2 }[k];
        if (a[k] == null) continue;
        se += ((p[k] - a[k]) / scale) ** 2; n++;
      }
    }
    hlRows.push({ hl, K, mse: se / n, n });
  }
}
hlRows.sort((a, b) => a.mse - b.mse);
lines.push("Half-life and credibility K chosen by predicting each manager's 2026 values (weeks 1-5) from <=2025 data; standardised MSE over pointsVsRule, zeroRate, earlyShare, benchUse:");
for (const r of hlRows) lines.push(`  half-life ${r.hl} weeks, K ${r.K}: ${r.mse.toFixed(3)} (n ${r.n})`);
const best = hlRows[0];
lines.push(`chosen: half-life ${best.hl}, K ${best.K}`);

// ---- validation: weekly total from week start, manager vs league profile (fit <=2025), on 2026 team-weeks
const P25 = profilesUpTo(T25, best.hl, best.K);
const L25 = P25.league;
function weekStartSim(t, prof) {
  const S = seasons[t.s];
  const m = S.matchups[t.w].find((x) => x.roster_id === t.roster);
  const Pm = new Map();
  for (const pid of m.players || []) {
    const games = (logOf(pid).filter((g) => g.season === t.s && g.week === t.w));
    if (!games.length) continue;
    const team = games[games.length - 1].team;
    const tw = (S.sched.teamWeek.get(`${team}|${t.w}`) || []).filter((g) => g.status === "complete");
    if (!tw.length) continue;
    Pm.set(pid, { pid, who: { positions: players[pid]?.fantasy_positions || [] }, log: logOf(pid), remaining: tw.map((g) => ({ date: g.date, gameId: g.gameId })), live: null, noData: false });
  }
  const labels = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];
  const slotsV = labels.map((label, i) => ({ index: i, label, playerId: null, banked: 0, lockState: null, lockStateReason: "empty_slot" }));
  const input = MU.teamSimInput({ slots: slotsV, P: Pm, modelAt: (pid) => modelAt(pid, Pm.get(pid).remaining[0].date), statusOf: () => null, mode: "policy", shift: prof ? prof.pointsVsRulePerSlot : 0, emptyRate: prof ? prof.emptySlotRate : 0 });
  return W.summarise(W.simulateTotals(input.team, { sims: 1000, seed: 7 }));
}
const res = { none: [], league: [], manager: [] };
const cover = { none: 0, league: 0, manager: 0 };
const tw26 = teamWeeks.filter((t) => t.s === "2026");
for (const t of tw26) {
  for (const [k, prof] of [["none", null], ["league", L25], ["manager", P25.managers[t.owner] || L25]]) {
    const sm = weekStartSim(t, prof);
    res[k].push(sm.mean - t.points);
    if (t.points >= sm.p10 && t.points <= sm.p90) cover[k]++;
  }
}
const mae = (a) => a.reduce((s, x) => s + Math.abs(x), 0) / a.length;
const bias = (a) => a.reduce((s, x) => s + x, 0) / a.length;
lines.push(`\nValidation on 2026 weeks 1-5 (n=${tw26.length} team-weeks), weekly total predicted at week start, profiles fit on 2022-2025:`);
for (const k of ["none", "league", "manager"]) lines.push(`  ${k === "none" ? "rule only (no behaviour shift)" : k + " profile"}: MAE ${mae(res[k]).toFixed(1)}, bias ${bias(res[k]) >= 0 ? "+" : ""}${bias(res[k]).toFixed(1)}, inside p10-p90 ${(cover[k] / tw26.length).toFixed(2)}`);

// ---- final fit on everything (for the desk), with chosen half-life and K
const PALL = profilesUpTo(T26, best.hl, best.K);
lines.push(`\nLeague (all weeks, n=${teamWeeks.length} team-weeks, ${slots.length} slot-weeks): ${JSON.stringify(Object.fromEntries(Object.entries(PALL.league).filter(([k]) => k !== "seasons")))}`);
fs.writeFileSync(path.join(D, "profiles.json"), JSON.stringify({ chosen: best, league: PALL.league, managers: PALL.managers, validation: { n: tw26.length, mae: Object.fromEntries(Object.entries(res).map(([k, a]) => [k, mae(a)])), coverage: Object.fromEntries(Object.entries(cover).map(([k, c]) => [k, c / tw26.length])) } }, null, 1));
fs.writeFileSync(path.join(D, "slotfacts.json"), JSON.stringify({ teamWeeks: teamWeeks.map((t) => ({ ...t, slots: undefined })) }));
fs.writeFileSync(path.join(D, "profiles.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
