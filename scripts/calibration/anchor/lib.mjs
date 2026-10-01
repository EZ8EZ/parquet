// Shared helpers: data loading, fantasy points, era-normalisation, rank stats, bootstrap, Poisson GLM.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(process.env.CALIB_DATA ?? path.join(HERE, '..', 'data'), f), 'utf8'));
export const P = rd('players.json');
export const STATS = {}; export const PROJ = {};
for (let y = 2013; y <= 2026; y++) STATS[y] = rd(`stats${y}.json`);
for (let y = 2021; y <= 2026; y++) PROJ[y] = rd(`proj${y}.json`);
export const RESULTS_DIR = HERE;
export const name = (id) => P[id]?.full_name ?? `#${id}`;

// ---- scoring. NOTE: bonus_pt_40p / bonus_pt_50p are EXCLUDED: in the stats blobs they are a ~0/1 flag
// present for ~80% of all players incl. 107-point seasons (a Sleeper data artefact, not 40/50-pt games).
export const SCORING = { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5, dd: 1, td: 2, tf: -2, ff: -2 };
export const SCORING_WITH_BONUS = { ...SCORING, bonus_pt_40p: 2, bonus_pt_50p: 2 };
export function fp(line, sc = SCORING) { let t = 0; for (const k in sc) t += sc[k] * (line[k] ?? 0); return t; }

// ---- season tables: total FP, gp, minutes, era-normalised (divide by mean over qualifiers 30gp & 500 min)
export const SEASON = {}; // y -> { meanTot, meanPg, rows: Map id -> {gp, min, tot, pg, nTot, nPg} }
for (let y = 2013; y <= 2025; y++) {
  const rows = new Map(); const q = [];
  for (const [id, l] of Object.entries(STATS[y])) {
    if (!l || !l.gp) continue;
    if (!/^\d+$/.test(id)) continue; // blobs also carry TEAM_XXX pseudo-ids (team lines); they are not players
    const tot = fp(l); const min = (l.sp ?? 0) / 60;
    const r = { gp: l.gp, min, tot, pg: tot / l.gp, mpg: min / l.gp };
    rows.set(id, r);
    if (l.gp >= 30 && min >= 500) q.push(r);
  }
  const meanTot = q.reduce((s, r) => s + r.tot, 0) / q.length;
  const meanPg = q.reduce((s, r) => s + r.pg, 0) / q.length;
  for (const r of rows.values()) { r.nTot = r.tot / meanTot; r.nPg = r.pg / meanPg; }
  SEASON[y] = { meanTot, meanPg, nQual: q.length, rows };
}
export const LAST_SEASON = 2025; // 2025-26 complete as of 2026-10-01; stats2026 is empty
export const nTot = (id, y) => SEASON[y]?.rows.get(id)?.nTot ?? 0;
export const gpOf = (id, y) => SEASON[y]?.rows.get(id)?.gp ?? 0;
export function firstSeason(id) { for (let y = 2013; y <= LAST_SEASON; y++) if (gpOf(id, y) > 0) return y; return null; }
export function careerGames(id, upTo) { let g = 0; for (let y = 2013; y <= upTo; y++) g += gpOf(id, y); return g; }
export function weightedTarget(id, Y, K, d = 0.9) { // sum_{k<K} d^k * normFP(Y+k), and the weight sum
  let t = 0, w = 0; for (let k = 0; k < K; k++) { t += Math.pow(d, k) * nTot(id, Y + k); w += Math.pow(d, k); } return { sum: t, avg: t / w, wsum: w };
}

// ---- repo age curve (read-only parse of lib/valuation/ageCurve.js DERIVED_AGE_CURVE)
const curveSrc = fs.readFileSync('/Users/ezphv/Claude/fantasy-sports/lib/valuation/ageCurve.js', 'utf8');
const curveBlock = curveSrc.slice(curveSrc.indexOf('export const DERIVED_AGE_CURVE'), curveSrc.indexOf('export const AGE_CURVE_PROVENANCE'));
export const CURVE = [...curveBlock.matchAll(/age:\s*(\d+),\s*multiplier:\s*([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
export function ageMult(age) { // same linear interpolation + flat extrapolation as lib/valuation/index.js ageMultiplier (no star term)
  if (age == null) return 1; const a = CURVE;
  if (age <= a[0][0]) return a[0][1]; if (age >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 0; i < a.length - 1; i++) { const [x0, y0] = a[i], [x1, y1] = a[i + 1]; if (age >= x0 && age <= x1) return y0 + (age - x0) / (x1 - x0) * (y1 - y0); }
  return 1;
}
// age at preseason snapshot Y (Oct 15 of Y, fractional) and the curve's own definition (integer age at Jan 1 of Y+1)
export function ageAtSnapshot(id, Y) { const b = P[id]?.birth_date; if (!b) return null; return (Date.UTC(Y, 9, 15) - Date.parse(b + 'T00:00:00Z')) / (365.25 * 864e5); }
export function ageDuringSeason(id, Y) { const b = P[id]?.birth_date; if (!b) return null; const born = new Date(b + 'T00:00:00Z'), mid = new Date(Date.UTC(Y + 1, 0, 1)); let a = mid.getUTCFullYear() - born.getUTCFullYear(); const md = (d) => d.getUTCMonth() * 100 + d.getUTCDate(); if (md(mid) < md(born)) a--; return a; }

// ---- projected line -> FPPG (base scoring only: dd/td/bonus absent from 2021-25 snapshots)
export function projFPPG(p) { if (!p || p.pts == null || p.reb == null) return null; const g = (k) => p[k] ?? 0; return 0.5 * g('pts') + g('reb') + g('ast') + 2 * g('stl') + 2 * g('blk') - g('to') + 0.5 * g('tpm') + g('dd') + 2 * g('td') - 2 * g('ff'); }

// ---- stats
export function rankAvg(a) {
  const n = a.length, idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i] - a[j]); const r = new Array(n);
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++; const v = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = v; i = j + 1; }
  return r;
}
export function pearson(x, y) {
  const n = x.length; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}
export const spearman = (x, y) => pearson(rankAvg(x), rankAvg(y));
export function resid(y, z) { // OLS residual of y on z (with intercept)
  const n = y.length; let mz = 0, my = 0; for (let i = 0; i < n; i++) { mz += z[i]; my += y[i]; } mz /= n; my /= n;
  let szz = 0, szy = 0; for (let i = 0; i < n; i++) { szz += (z[i] - mz) ** 2; szy += (z[i] - mz) * (y[i] - my); }
  const b = szy / szz; return y.map((v, i) => v - my - b * (z[i] - mz));
}
export function partialSpearman(x, y, z) { const rx = rankAvg(x), ry = rankAvg(y), rz = rankAvg(z); return pearson(resid(rx, rz), resid(ry, rz)); }
export const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
export const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export const ci = (a) => [quantile(a, 0.025), quantile(a, 0.975)];
export function rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// cluster bootstrap: returns array of index arrays (indices into rows), clustering on cluster[i]
export function bootIdx(cluster, B, seed = 1) {
  const R = rng(seed), groups = new Map(); cluster.forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(i); });
  const keys = [...groups.keys()], out = [];
  for (let b = 0; b < B; b++) { const idx = []; for (let k = 0; k < keys.length; k++) { const g = groups.get(keys[Math.floor(R() * keys.length)]); for (const i of g) idx.push(i); } out.push(idx); }
  return out;
}
export const pick = (a, idx) => idx.map((i) => a[i]);
export const r3 = (v) => (v == null || Number.isNaN(v) ? v : Math.round(v * 1000) / 1000);
export const r2 = (v) => (v == null || Number.isNaN(v) ? v : Math.round(v * 100) / 100);

// ---- Poisson (quasi) GLM, log link, IRLS, cluster-robust SE.  X: array of rows (include intercept col).
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }
function inv(A) { const n = A.length; const out = []; for (let j = 0; j < n; j++) { const e = Array(n).fill(0); e[j] = 1; out.push(solve(A, e)); } return out[0].map((_, i) => out.map((c) => c[i])); }
export function poisson(X, y, cluster) {
  const n = X.length, p = X[0].length; let b = Array(p).fill(0); b[0] = Math.log(mean(y) || 1);
  let XtWXinv;
  for (let it = 0; it < 50; it++) {
    const mu = X.map((x) => Math.exp(Math.min(30, x.reduce((s, v, j) => s + v * b[j], 0))));
    const A = Array.from({ length: p }, () => Array(p).fill(0)), g = Array(p).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) { g[j] += X[i][j] * (y[i] - mu[i]); for (let k = 0; k < p; k++) A[j][k] += X[i][j] * X[i][k] * mu[i]; }
    const step = solve(A, g); let mx = 0; for (let j = 0; j < p; j++) { b[j] += step[j]; mx = Math.max(mx, Math.abs(step[j])); }
    XtWXinv = inv(A); if (mx < 1e-9) break;
  }
  const mu = X.map((x) => Math.exp(x.reduce((s, v, j) => s + v * b[j], 0)));
  const meat = Array.from({ length: p }, () => Array(p).fill(0)); const sc = new Map();
  for (let i = 0; i < n; i++) { const c = cluster ? cluster[i] : i; if (!sc.has(c)) sc.set(c, Array(p).fill(0)); const s = sc.get(c); for (let j = 0; j < p; j++) s[j] += X[i][j] * (y[i] - mu[i]); }
  for (const s of sc.values()) for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) meat[j][k] += s[j] * s[k];
  const G = sc.size, adj = G / (G - 1);
  const V = Array.from({ length: p }, (_, j) => Array.from({ length: p }, (_, k) => { let s = 0; for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) s += XtWXinv[j][a] * meat[a][c] * XtWXinv[c][k]; return s * adj; }));
  return { b, se: b.map((_, j) => Math.sqrt(V[j][j])), n, clusters: G };
}
export function writeJson(f, o) { fs.writeFileSync(path.join(HERE, f), JSON.stringify(o, null, 1)); }
