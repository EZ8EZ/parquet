// Fit P(manager locks | score vs bar, games left) on lock_propensity.mjs rows; leave-one-season-out.
// node scripts/lockin/lock_propensity_fit.mjs rows.json
import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const knots = [-0.5, 0, 0.5, 1];
export const feats = (r) => [1, r.z, ...knots.map((k) => Math.max(0, r.z - k)), r.left >= 2 ? 1 : 0, r.left >= 3 ? 1 : 0];
const sig = (t) => 1 / (1 + Math.exp(-t));
function fit(data, l2 = 1e-3, iters = 60) {
  const X = data.map(feats), y = data.map((r) => r.locked), d = X[0].length;
  let b = new Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    // Newton step: (X'WX + l2 I) delta = X'(y-p) - l2 b
    const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < X.length; i++) {
      const p = sig(X[i].reduce((t, v, j) => t + v * b[j], 0)), w = p * (1 - p);
      for (let j = 0; j < d; j++) { g[j] += X[i][j] * (y[i] - p); for (let k = 0; k < d; k++) H[j][k] += w * X[i][j] * X[i][k]; }
    }
    for (let j = 0; j < d; j++) { g[j] -= l2 * b[j]; H[j][j] += l2; }
    // solve H delta = g (Gaussian elimination)
    const A = H.map((row, j) => [...row, g[j]]);
    for (let c = 0; c < d; c++) { let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < d; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= d; k++) A[r][k] -= f * A[c][k]; } }
    const delta = A.map((row, j) => row[d] / row[j]);
    b = b.map((v, j) => v + delta[j]);
    if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
  }
  return b;
}
const pred = (b, r) => sig(feats(r).reduce((t, v, j) => t + v * b[j], 0));
const SHARE = 0.293, SHIFT = -1.55;
const engine = (r) => SHARE + (1 - SHARE) * (r.x >= r.bar + SHIFT ? 1 : 0);
const seasons = [...new Set(rows.map((r) => r.s))];
let acc = { c: 0, e: 0, m: 0, n: 0, llc: 0, llm: 0 };
console.log("held-out season   n     Brier const  engine  model");
for (const s of seasons) {
  const tr = rows.filter((r) => r.s !== s), te = rows.filter((r) => r.s === s);
  const b = fit(tr), base = tr.reduce((t, r) => t + r.locked, 0) / tr.length;
  const bc = te.reduce((t, r) => t + (base - r.locked) ** 2, 0), be = te.reduce((t, r) => t + (engine(r) - r.locked) ** 2, 0), bm = te.reduce((t, r) => t + (pred(b, r) - r.locked) ** 2, 0);
  const ll = (p, y) => -(y ? Math.log(p) : Math.log(1 - p));
  acc.llc += te.reduce((t, r) => t + ll(base, r.locked), 0); acc.llm += te.reduce((t, r) => t + ll(pred(b, r), r.locked), 0);
  acc.c += bc; acc.e += be; acc.m += bm; acc.n += te.length;
  console.log(`  ${s}`.padEnd(16), String(te.length).padStart(6), (bc / te.length).toFixed(4).padStart(12), (be / te.length).toFixed(4).padStart(7), (bm / te.length).toFixed(4).padStart(7));
}
console.log(`  all`.padEnd(16), String(acc.n).padStart(6), (acc.c / acc.n).toFixed(4).padStart(12), (acc.e / acc.n).toFixed(4).padStart(7), (acc.m / acc.n).toFixed(4).padStart(7), `  logloss const ${(acc.llc / acc.n).toFixed(4)} model ${(acc.llm / acc.n).toFixed(4)}`);
const b = fit(rows);
console.log("coefficients (all data):", JSON.stringify(b.map((v) => Math.round(v * 1000) / 1000)), "features [1, z, (z+0.5)+, (z)+, (z-0.5)+, (z-1)+, left>=2, left>=3]");
console.log("calibration of the full fit, by predicted decile:");
const sorted = rows.map((r) => [pred(b, r), r.locked]).sort((a, c) => a[0] - c[0]);
for (let d = 0; d < 10; d++) { const sl = sorted.slice(Math.floor(d * sorted.length / 10), Math.floor((d + 1) * sorted.length / 10)); console.log(`  pred ${(sl.reduce((t, x) => t + x[0], 0) / sl.length).toFixed(3)}  actual ${(sl.reduce((t, x) => t + x[1], 0) / sl.length).toFixed(3)}  n=${sl.length}`); }
fs.writeFileSync(process.argv[2].replace(/\.json$/, ".coef.json"), JSON.stringify({ knots, b }));
