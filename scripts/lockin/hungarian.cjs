// Max-weight assignment of rows (slots) to columns (players). w[i][j] = weight or -Infinity if ineligible.
// Each row may stay empty (weight 0). Returns {value, assign: rowIdx -> colIdx|-1}.
function assign(w) {
  const nR = w.length; if (!nR) return { value: 0, assign: [] };
  const nC0 = w[0].length; const nC = nC0 + nR; // dummy column per row = empty slot
  const BIG = 1e7;
  const n = Math.max(nR, nC);
  const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    if (i >= nR) return 0;
    if (j < nC0) return w[i][j] === -Infinity ? BIG : -w[i][j];
    if (j < nC) return j - nC0 === i ? 0 : BIG;
    return BIG;
  }));
  // standard O(n^3) Hungarian (min cost), 1-indexed potentials
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(Infinity); const used = new Array(n + 1).fill(false);
    do { used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) { const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1; } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(nR).fill(-1); let value = 0;
  for (let j = 1; j <= n; j++) { const i = p[j] - 1; if (i >= 0 && i < nR && j - 1 < nC0) { if (w[i][j - 1] === -Infinity) continue; out[i] = j - 1; value += w[i][j - 1]; } }
  return { value, assign: out };
}
module.exports = { assign };
