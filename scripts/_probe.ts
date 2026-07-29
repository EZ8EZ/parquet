import "./_env";

async function main() {
  const { getLeagueHistory } = await import("@/lib/history");
  const { deriveManagerProfile } = await import("@/lib/derive/manager");
  const h = await getLeagueHistory();
  const trades = h.transactions.filter((t) => t.type === "trade");
  console.log("rosters", h.rosters.length, "tx", h.transactions.length, "trades", trades.length);
  console.log("me", JSON.stringify(h.me));
  console.log("seasons", h.chain.map((c) => c.season).join(","));

  const parties = (t: (typeof trades)[number]) => {
    const s = new Set<number>(t.rosterIds);
    for (const r of Object.values(t.adds)) s.add(r);
    for (const r of Object.values(t.drops)) s.add(r);
    for (const dp of t.draftPicks) { s.add(dp.ownerId); s.add(dp.previousOwnerId); }
    return [...s].sort((a, b) => a - b);
  };

  const sizes = new Map<number, number>();
  for (const t of trades) sizes.set(parties(t).length, (sizes.get(parties(t).length) ?? 0) + 1);
  console.log("party-size histogram", [...sizes.entries()].sort());

  const rosterIdsSizes = new Map<number, number>();
  for (const t of trades) rosterIdsSizes.set(t.rosterIds.length, (rosterIdsSizes.get(t.rosterIds.length) ?? 0) + 1);
  console.log("rosterIds-size histogram", [...rosterIdsSizes.entries()].sort());

  for (const t of trades) {
    if (parties(t).length > 2) {
      console.log("MULTI", t.transactionId, t.season, t.week, "parties", parties(t).join("/"), "rosterIds", t.rosterIds.join("/"), "picks", t.draftPicks.length);
    }
  }

  // pair counts from parties
  const pairCount = new Map<string, number>();
  for (const t of trades) {
    const p = parties(t);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        pairCount.set(`${p[i]}-${p[j]}`, (pairCount.get(`${p[i]}-${p[j]}`) ?? 0) + 1);
  }
  // profile counts
  const prof = new Map<number, Map<number, number>>();
  for (const r of h.rosters) {
    const pr = deriveManagerProfile(h, r.rosterId);
    prof.set(r.rosterId, new Map(pr.tradePartners.map((tp) => [tp.rosterId, tp.count])));
    console.log("node", r.rosterId, JSON.stringify(pr.teamName ?? pr.displayName), "trades", pr.trades, "partners", pr.tradePartners.length);
  }
  let diverge = 0;
  for (const [key, c] of pairCount) {
    const [a, b] = key.split("-").map(Number);
    const pa = prof.get(a)?.get(b) ?? 0;
    const pb = prof.get(b)?.get(a) ?? 0;
    if (pa !== c || pb !== c) { diverge++; console.log("DIVERGE", key, "pairCount", c, "profA", pa, "profB", pb); }
  }
  console.log("edges", pairCount.size, "of possible", (h.rosters.length * (h.rosters.length - 1)) / 2, "diverge", diverge);
  console.log("maxEdge", Math.max(...pairCount.values()));

  // asset moves count
  let moves = 0, inferred = 0;
  for (const t of trades) {
    for (const [pid, to] of Object.entries(t.adds)) { void pid; void to; moves++; }
    for (const dp of t.draftPicks) { moves++; if (dp.inferred) inferred++; }
  }
  console.log("asset moves(add-side)", moves, "inferred picks", inferred);

  // longest name
  const names = h.rosters.map((r) => {
    const u = r.ownerId ? h.usersById.get(r.ownerId) : undefined;
    return u?.teamName || u?.displayName || `Roster ${r.rosterId}`;
  });
  console.log("names", JSON.stringify(names));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
