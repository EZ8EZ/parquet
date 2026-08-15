export function playerName(h, pid) {
  return h.players.get(pid)?.fullName ?? `Player ${pid}`;
}
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
export function pickLabel(dp, via) {
  // Every pick that reaches this label is one a transaction actually RECORDED - the
  // app does not infer pick movement (D19). `via` names the pick's ORIGINAL roster
  // (the /drafts lineage convention) - without it, a trade moving two different picks
  // that share a season and round reads as a no-op ("acquired the 2027 3rd for the
  // 2027 3rd"), when the two are distinct assets.
  const origin = via ? ` (via ${via})` : "";
  return `${dp.season} ${ordinal(dp.round)}${origin}`;
}
export function rosterName(h, rosterId) {
  const r = h.rostersById.get(rosterId);
  const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  return u?.teamName || u?.displayName || `Roster ${rosterId}`;
}
/** What a given roster received and sent in a trade. */
export function tradeSide(h, t, rosterId) {
  const got = [];
  const gave = [];
  for (const [pid, rid] of Object.entries(t.adds)) {
    if (rid === rosterId) got.push(playerName(h, pid));
  }
  for (const [pid, rid] of Object.entries(t.drops)) {
    if (rid === rosterId) gave.push(playerName(h, pid));
  }
  const gotPicks = [];
  const gavePicks = [];
  for (const dp of t.draftPicks) {
    // A pick that isn't this side's own natural pick is named by its origin, so
    // two same-round picks in one deal can never read as the same asset. Your own
    // pick stays unqualified - "the 2027 3rd" from your perspective IS yours.
    const via = dp.rosterId !== rosterId ? rosterName(h, dp.rosterId) : null;
    if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId)
      gotPicks.push(pickLabel(dp, via));
    else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId)
      gavePicks.push(pickLabel(dp, via));
  }
  return { got, gave, gotPicks, gavePicks };
}
function joinAssets(players, picks) {
  const parts = [...players];
  if (picks.length) parts.push(...picks.map((p) => `the ${p}`));
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}
/** One-line summary of a trade from a roster's perspective. */
export function describeTradeForRoster(h, t, rosterId) {
  const s = tradeSide(h, t, rosterId);
  const got = joinAssets(s.got, s.gotPicks);
  const gave = joinAssets(s.gave, s.gavePicks);
  return `acquired ${got} for ${gave}`;
}
/** Neutral, perspective-free summary (for the ledger list and analyst corpus). */
export function describeTransaction(h, t) {
  if (t.type === "trade") {
    const rosters = t.rosterIds;
    const parts = rosters.map((rid) => {
      const s = tradeSide(h, t, rid);
      const sent = joinAssets(s.gave, s.gavePicks);
      return `${rosterName(h, rid)} sent ${sent}`;
    });
    return `Trade - ${parts.join("; ")}`;
  }
  const adds = Object.keys(t.adds).map((pid) => playerName(h, pid));
  const drops = Object.keys(t.drops).map((pid) => playerName(h, pid));
  const who =
    t.rosterIds[0] != null ? rosterName(h, t.rosterIds[0]) : "A manager";
  const verb = t.type === "waiver" ? "claimed" : "added";
  const bid = t.waiverBid ? ` ($${t.waiverBid})` : "";
  const dropStr = drops.length ? `, dropped ${drops.join(", ")}` : "";
  return `${who} ${verb} ${adds.join(", ") || "-"}${bid}${dropStr}`;
}
export function seasonYear(season) {
  return parseInt(season, 10);
}
