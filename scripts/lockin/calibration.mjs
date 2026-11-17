// 2026 calibration through lib/lockin: predicted-range coverage and "beats it" bins. No network.
// node calibration.mjs -> calibration.txt
import fs from "node:fs";
import path from "node:path";
import { loadStudyData, WT, STUDY } from "./data.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const OUT = STUDY;
const D = loadStudyData();
const qs = [0.1, 0.25, 0.5, 0.75, 0.9];
const cov = qs.map(() => 0);
let n = 0, inRange = 0;
const pb = [];   // [p, outcome]: next PLAYED game beats his previous score (study's check, no q)
const pbq = [];  // [p, outcome]: next TEAM game is played and beats it (the product's k=1 figure, with q)
const basisCount = {};
for (const pid of D.uni.rostered) {
  const L = D.logs[pid] || [];
  for (let gi = 0; gi < L.length; gi++) {
    const g = L[gi];
    if (g.season !== "2026" || !g.complete) continue;
    const m = M.playerModel(L, g.date);
    const prev = L.filter((x) => x.date < g.date && M.isPlayed(x)).pop();
    if (prev && m.dist.n >= 10) {
      pbq.push([M.probLaterBeats(m.dist.sample, prev.fp, 1, m.q.value), g.sp > 0 && g.fp > prev.fp ? 1 : 0]);
    }
    if (g.sp <= 0 || m.dist.n < 10) continue;
    basisCount[m.dist.basis] = (basisCount[m.dist.basis] || 0) + 1;
    n++;
    qs.forEach((q, k) => { if (g.fp <= M.quantile(m.dist.sample, q)) cov[k]++; });
    const r = M.nextGameRange(m.dist);
    if (g.fp >= r.p10 && g.fp <= r.p90) inRange++;
    if (prev) pb.push([M.probLaterBeats(m.dist.sample, prev.fp, 1, 1), g.fp > prev.fp ? 1 : 0]);
  }
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const lines = [];
lines.push(`2026 games, rostered players, >=10 prior played games. n=${n} (basis ${JSON.stringify(basisCount)})`);
lines.push("Share of outcomes at or below each predicted quantile (nominal -> observed):");
lines.push(qs.map((q, k) => `${q} -> ${(cov[k] / n).toFixed(3)}`).join("  "));
lines.push(`Inside the 10th-90th range: ${(inRange / n).toFixed(3)} (nominal 0.800)`);
const bins = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]];
const binTable = (rows, title) => {
  lines.push(`\n${title} (n=${rows.length})`);
  lines.push("| bin | n | mean predicted | observed | predicted minus observed |");
  for (const [a, b] of bins) {
    const s = rows.filter((x) => x[0] >= a && x[0] < b);
    const p = mean(s.map((x) => x[0]));
    const o = mean(s.map((x) => x[1]));
    lines.push(`| ${a}-${Math.min(b, 1)} | ${s.length} | ${p.toFixed(3)} | ${o.toFixed(3)} | ${((p - o) * 100).toFixed(1)} pts |`);
  }
};
binTable(pb, "P(next played game beats his previous score), study's check");
binTable(pbq, "P(next team game is played AND beats his previous score), the card's k=1 figure incl. play probability");
fs.writeFileSync(path.join(OUT, "calibration.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
