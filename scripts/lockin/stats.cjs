// small stats helpers: Spearman, partial Spearman, bootstrap (seeded)
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const setSeed = (s) => { seed = s; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function rank(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const av = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = av; i = j + 1; } return r; }
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
const spearman = (x, y) => pearson(rank(x), rank(y));
function partial(rxy, rxz, ryz) { return (rxy - rxz * ryz) / Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2)); }
const partialSpearman = (x, y, z) => { const rx = rank(x), ry = rank(y), rz = rank(z); return partial(pearson(rx, ry), pearson(rx, rz), pearson(ry, rz)); };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
// cluster bootstrap: groups = array of arrays of rows; stat(rows) -> number
function clusterBoot(groups, stat, B = 1000) { const out = []; for (let b = 0; b < B; b++) { const rows = []; for (let i = 0; i < groups.length; i++) rows.push(...groups[Math.floor(rnd() * groups.length)]); out.push(stat(rows)); } return [quant(out, 0.025), quant(out, 0.975)]; }
module.exports = { mean, sd, rank, pearson, spearman, partialSpearman, quant, clusterBoot, rnd, setSeed };
