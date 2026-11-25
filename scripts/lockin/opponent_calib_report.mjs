// Win-probability calibration on the backtest decision points, side coverage, and a widening
// factor (my side c_m, their side c_t) fitted on 2025 and tested on 2026.
import fs from "node:fs";
import path from "node:path";
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const widen = (a, c) => { if (c === 1) return a; const m = mean(a); return Float64Array.from(a, (x) => m + c * (x - m)); };
const q = (a, t) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.floor(t * (s.length - 1))]; };
export function calibrationReport(recs, W, OUT) {
  const lines = [];
  const won = (r) => (r.myFinal > r.oppFinal ? 1 : r.myFinal === r.oppFinal ? 0.5 : 0);
  const predOf = (r, cm, ct) => W.pWin(widen(r.mine, cm), widen(r.theirs, ct));
  const table = (rows, cm, ct, title) => {
    lines.push(`\n${title} (n=${rows.length} decision points, ${new Set(rows.map((r) => r.key)).size} team-weeks)`);
    const ps = rows.map((r) => predOf(r, cm, ct));
    const ys = rows.map(won);
    lines.push(`Brier ${mean(ps.map((p, i) => (p - ys[i]) ** 2)).toFixed(4)}; base rate won ${mean(ys).toFixed(3)}`);
    lines.push("| predicted P(win) | n | mean predicted | observed won | gap (pts) |");
    for (let b = 0; b < 10; b++) {
      const idx = ps.map((p, i) => i).filter((i) => ps[i] >= b / 10 && (b === 9 ? ps[i] <= 1 : ps[i] < (b + 1) / 10));
      if (!idx.length) continue;
      const mp = mean(idx.map((i) => ps[i])), mo = mean(idx.map((i) => ys[i]));
      lines.push(`| ${b / 10}-${(b + 1) / 10} | ${idx.length} | ${mp.toFixed(3)} | ${mo.toFixed(3)} | ${((mp - mo) * 100).toFixed(1)} |`);
    }
    lines.push("| nights left | n | Brier | mean predicted | observed |");
    for (const [lo, hi] of [[1, 1], [2, 2], [3, 3], [4, 9]]) {
      const idx = rows.map((r, i) => i).filter((i) => rows[i].nightsLeft >= lo && rows[i].nightsLeft <= hi);
      if (!idx.length) continue;
      lines.push(`| ${lo === hi ? lo : `${lo}+`} | ${idx.length} | ${mean(idx.map((i) => (ps[i] - ys[i]) ** 2)).toFixed(4)} | ${mean(idx.map((i) => ps[i])).toFixed(3)} | ${mean(idx.map((i) => ys[i])).toFixed(3)} |`);
    }
  };
  // side coverage: first decision point of each team-week (furthest from the end) and all
  const cov = (rows, side, final, c) => { const ok = rows.filter((r) => { const a = widen(r[side], c); return r[final] >= q(a, 0.1) && r[final] <= q(a, 0.9); }).length; return ok / rows.length; };
  const bias = (rows, side, final) => mean(rows.map((r) => mean(r[side]) - r[final]));
  lines.push(`Side coverage of the final weekly total by the predicted 10th-90th range (nominal 0.80), all decision points (n=${recs.length}):`);
  lines.push(`  my side: ${cov(recs, "mine", "myFinal", 1).toFixed(3)} (mean predicted minus actual ${bias(recs, "mine", "myFinal").toFixed(1)})`);
  lines.push(`  opponent: ${cov(recs, "theirs", "oppFinal", 1).toFixed(3)} (mean predicted minus actual ${bias(recs, "theirs", "oppFinal").toFixed(1)})`);
  for (const [lo, hi] of [[1, 1], [2, 2], [3, 9]]) {
    const r = recs.filter((x) => x.nightsLeft >= lo && x.nightsLeft <= hi);
    lines.push(`  nights left ${lo === hi ? lo : `${lo}+`} (n=${r.length}): my side ${cov(r, "mine", "myFinal", 1).toFixed(3)}, opponent ${cov(r, "theirs", "oppFinal", 1).toFixed(3)}`);
  }
  const train = recs.filter((r) => r.s === "2025");
  const test = recs.filter((r) => r.s === "2026");
  table(recs, 1, 1, "Before: predicted P(win) at each decision point vs the week's result (points policy vs opponent's actual)");
  // fit widening on 2025
  let best = null;
  for (const cm of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) for (const ct of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    const b = mean(train.map((r) => (predOf(r, cm, ct) - won(r)) ** 2));
    if (!best || b < best.b) best = { cm, ct, b };
  }
  lines.push(`\nWidening fitted on 2025 (n=${train.length}): my side x${best.cm}, opponent x${best.ct} (Brier ${best.b.toFixed(4)})`);
  lines.push(`Side coverage after widening, 2026 (n=${test.length}): my side ${cov(test, "mine", "myFinal", best.cm).toFixed(3)}, opponent ${cov(test, "theirs", "oppFinal", best.ct).toFixed(3)}`);
  table(test, 1, 1, "2026 before widening");
  table(test, best.cm, best.ct, "2026 after widening (out of sample)");
  fs.writeFileSync(path.join(OUT, "calib_wp.txt"), lines.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "calib_wp.json"), JSON.stringify(best));
  console.log(lines.join("\n"));
}
