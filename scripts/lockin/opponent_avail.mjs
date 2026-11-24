// Play probability: current (last 40 team-game rows shrunk to 0.8) vs a richer logistic model
// (current rate, a 3-season recency-weighted rate, second night of a back-to-back, missed the
// previous game, missed 3+ of the last 5). Fit on 2025 team games, test on 2026. Listings are
// not available historically, so they are not part of this test.
// node avail.mjs -> avail.txt, avail_coef.json
import fs from "node:fs";
import path from "node:path";
import { loadAll, WT } from "./opponent_data2.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const { logOf } = loadAll();
const { universe } = JSON.parse(fs.readFileSync(path.join(D, "chain.json"), "utf8"));
const lg = (p) => Math.log(Math.min(0.995, Math.max(0.005, p)) / (1 - Math.min(0.995, Math.max(0.005, p))));
const rows = [];
for (const pid of universe) {
  const L = logOf(pid).filter((g) => g.complete);
  for (let i = 1; i < L.length; i++) {
    const g = L[i];
    if (g.season !== "2025" && g.season !== "2026") continue;
    const prev = L.slice(0, i);
    if (prev.length < 10) continue;
    const q = M.playProbability(L, g.date).value;
    let w = 0, t = 0;
    for (let j = prev.length - 1, k = 0; j >= 0 && k < 250; j--, k++) { const ww = Math.pow(0.5, k / 82); w += ww; t += ww * (prev[j].sp > 0 ? 1 : 0); }
    const long = (t + 0.8 * 20) / (w + 20);
    const last = prev[prev.length - 1];
    const b2b = last && Date.parse(g.date) - Date.parse(last.date) <= 86400000 && last.team === g.team ? 1 : 0;
    const missed1 = last && last.sp === 0 ? 1 : 0;
    const missed3of5 = prev.slice(-5).filter((x) => x.sp === 0).length >= 3 ? 1 : 0;
    rows.push({ s: g.season, y: g.sp > 0 ? 1 : 0, q, x: [1, lg(q), lg(long), b2b, missed1, missed3of5] });
  }
}
function fitLogit(data) {
  const p = data[0].x.length;
  let beta = new Array(p).fill(0);
  for (let it = 0; it < 50; it++) {
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const r of data) {
      const z = r.x.reduce((t, v, k) => t + v * beta[k], 0);
      const m = 1 / (1 + Math.exp(-z));
      for (let a = 0; a < p; a++) { g[a] += (r.y - m) * r.x[a]; for (let b = 0; b < p; b++) H[a][b] += m * (1 - m) * r.x[a] * r.x[b]; }
    }
    for (let a = 0; a < p; a++) H[a][a] += 1e-6;
    // solve H d = g (Gauss)
    const A = H.map((row, i) => [...row, g[i]]);
    for (let c = 0; c < p; c++) { let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; } }
    const d = A.map((row, i) => row[p] / row[i]);
    beta = beta.map((b, i) => b + d[i]);
  }
  return beta;
}
const train = rows.filter((r) => r.s === "2025");
const test = rows.filter((r) => r.s === "2026");
const beta = fitLogit(train);
const pred = (r) => 1 / (1 + Math.exp(-r.x.reduce((t, v, k) => t + v * beta[k], 0)));
const brier = (a, f) => a.reduce((t, r) => t + (f(r) - r.y) ** 2, 0) / a.length;
const lines = [`Play probability for a team game. Fit 2025 (n=${train.length}), test 2026 (n=${test.length}); league-rostered players with >=10 prior rows.`,
  `Coefficients (intercept, logit current rate, logit 3-season rate, back-to-back 2nd night, missed last game, missed 3+ of last 5): ${beta.map((b) => b.toFixed(3)).join(", ")}`,
  `Brier 2026: current ${brier(test, (r) => r.q).toFixed(4)}, richer ${brier(test, pred).toFixed(4)}; base rate played ${(test.reduce((t, r) => t + r.y, 0) / test.length).toFixed(3)}`,
  "| decile of predicted | n | current: predicted / observed | richer: predicted / observed |"];
for (const [name, f] of [["current", (r) => r.q], ["richer", pred]]) void name, void f;
const dec = (f) => { const a = [...test].sort((u, v) => f(u) - f(v)); const out = []; for (let d = 0; d < 10; d++) { const s = a.slice(Math.floor((d * a.length) / 10), Math.floor(((d + 1) * a.length) / 10)); out.push([s.length, s.reduce((t, r) => t + f(r), 0) / s.length, s.reduce((t, r) => t + r.y, 0) / s.length]); } return out; };
const dc = dec((r) => r.q), dr = dec(pred);
for (let d = 0; d < 10; d++) lines.push(`| ${d + 1} | ${dc[d][0]} | ${dc[d][1].toFixed(3)} / ${dc[d][2].toFixed(3)} | ${dr[d][1].toFixed(3)} / ${dr[d][2].toFixed(3)} |`);
fs.writeFileSync(path.join(D, "avail.txt"), lines.join("\n") + "\n");
fs.writeFileSync(path.join(D, "avail_coef.json"), JSON.stringify({ beta, trainN: train.length, testN: test.length, brierCurrent: brier(test, (r) => r.q), brierRicher: brier(test, pred) }));
console.log(lines.join("\n"));
