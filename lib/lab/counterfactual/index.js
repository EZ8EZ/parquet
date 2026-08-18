import { pickCapital } from "../../picks.js";
import { cachedValuePlayers } from "../../valuation/index.js";
import {
  coherenceOf,
  pickDuration,
  playerDuration,
} from "../../metrics/duration.js";
/**
 * The set of players a trade-free version of this roster would hold today, with the
 * acquisition that put each one there.
 *
 * Applied strictly in order - drafts first for each season, then that season's
 * non-trade transactions by their own timestamps - so a player added and later
 * dropped leaves, and a player acquired by trade and later dropped never arrives (the
 * delete is a no-op on a set that never contained him).
 */
function acquisitions(h, rosterId, index) {
  const held = new Map();
  let picksUsedByOthers = 0;
  // Startup detection by round count, the same self-calibrating signal D27 uses: a
  // startup is simply the deepest draft in the chain by a wide margin, and hardcoding
  // "2022" would break for any other league.
  const roundCounts = [...index.bySeason.values()].map((sd) => sd.draft.rounds);
  const median = roundCounts.length
    ? [...roundCounts].sort((a, b) => a - b)[Math.floor(roundCounts.length / 2)]
    : 0;
  const seasons = h.chain.map((c) => c.season);
  for (const season of seasons) {
    const sd = index.bySeason.get(season);
    if (sd) {
      const isStartup = roundCounts.length > 1 && sd.draft.rounds > median * 2;
      for (const p of sd.picks) {
        if (!p.playerId) continue;
        if (sd.draft.slotToRosterId[p.draftSlot] !== rosterId) continue;
        if (p.rosterId != null && p.rosterId !== rosterId) picksUsedByOthers++;
        held.set(p.playerId, {
          kind: isStartup ? "startup" : "rookie-draft",
          origin: `${season} ${isStartup ? "startup" : "rookie draft"}, pick ${p.pickNo}`,
          season,
        });
      }
    }
    for (const t of h.transactions) {
      if (t.season !== season) continue;
      if (t.type === "trade") continue;
      for (const [pid, from] of Object.entries(t.drops)) {
        if (from === rosterId) held.delete(pid);
      }
      for (const [pid, to] of Object.entries(t.adds)) {
        if (to !== rosterId) continue;
        const kind =
          t.type === "waiver"
            ? "waiver"
            : t.type === "free_agent"
              ? "free-agent"
              : "other";
        held.set(pid, {
          kind,
          origin: `${season} ${kind === "waiver" ? "waiver claim" : kind === "free-agent" ? "free agent" : t.type}`,
          season,
        });
      }
    }
  }
  return { held, picksUsedByOthers };
}
/**
 * Whether this corpus carries NBA team affiliation at all.
 *
 * `team === null` is the signal that a player has left the league, but only in a
 * corpus that populates the field for anybody. The fixture provider models no NBA
 * teams whatsoever, so reading its nulls as "everyone has retired" would price the
 * entire synthetic league at zero. A provider that tracks nothing has told us
 * nothing, and the honest response to no information is not to act on it. Checked
 * against the data rather than against the provider's name, so a future provider
 * inherits the right behaviour without an entry in a list somewhere.
 */
export function corpusTracksNbaTeams(h) {
  for (const p of h.players.values()) if (p.team) return true;
  return false;
}
export function buildCounterfactual(h, rosterId, index) {
  const roster = h.rostersById.get(rosterId);
  const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;
  const values = cachedValuePlayers(h);
  const heldBy = new Map();
  for (const r of h.rosters)
    for (const pid of r.players) heldBy.set(pid, r.rosterId);
  const { held, picksUsedByOthers } = acquisitions(h, rosterId, index);
  const tracksTeams = corpusTracksNbaTeams(h);
  const all = [];
  for (const [playerId, acq] of held) {
    const p = h.players.get(playerId);
    // "Still an NBA player" is the honest bar for pricing: the valuation model is
    // anchored on a consensus rank, and a rank means nothing once its subject is off
    // every NBA roster. A player the provider no longer carries AT ALL fails it too,
    // and is kept under whatever name we still have rather than dropped - vanishing
    // is the one thing this file is written not to do.
    const priced = !!p && (!tracksTeams || !!p.team);
    all.push({
      playerId,
      name: p?.fullName ?? `Player ${playerId}`,
      position: p?.position ?? null,
      age: p?.age ?? null,
      value: priced ? (values.get(playerId)?.value ?? 0) : 0,
      duration: playerDuration(p?.age ?? null),
      kind: acq.kind,
      origin: acq.origin,
      season: acq.season,
      stillHeld: heldBy.get(playerId) === rosterId,
      heldBy: heldBy.get(playerId) ?? null,
      priced,
      kept: false,
    });
  }
  all.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const unpriced = all.filter((p) => !p.priced);
  // `value > 0` mirrors the filter the actual side applies below, so the two roster
  // counts mean the same thing. A priced player the model scores at 0 contributes
  // nothing either way; letting him occupy a trimmed slot would penalise the
  // counterfactual for depth that is worth nothing.
  const priceable = all.filter((p) => p.priced && p.value > 0);
  // Trim to the number of players this manager actually rosters today, so the two
  // sides of the comparison are the same SIZE as well as the same model. Stated in
  // the UI, never silent: `overflow` is how many the trim left behind.
  const rosterSlots = roster?.players.length ?? 0;
  const kept = priceable.slice(0, rosterSlots);
  for (const p of kept) p.kept = true;
  const hoardValue = priceable.reduce((s, p) => s + p.value, 0);
  const cfPicks = pickCapital(h, rosterId, { ownership: "original" });
  const actualPicks = pickCapital(h, rosterId);
  const cfAssets = [
    ...kept.map((p) => ({ value: p.value, duration: p.duration })),
    ...cfPicks.picks.map((pk) => ({
      value: pk.value,
      duration: pickDuration(parseInt(pk.season, 10) - h.currentSeasonYear),
    })),
  ];
  const actualPlayers = (roster?.players ?? [])
    .map((pid) => ({
      value: values.get(pid)?.value ?? 0,
      duration: playerDuration(h.players.get(pid)?.age ?? null),
    }))
    .filter((a) => a.value > 0);
  const actualAssets = [
    ...actualPlayers,
    ...actualPicks.picks.map((pk) => ({
      value: pk.value,
      duration: pickDuration(parseInt(pk.season, 10) - h.currentSeasonYear),
    })),
  ];
  const cfPlayerValue = kept.reduce((s, p) => s + p.value, 0);
  const actualPlayerValue = actualPlayers.reduce((s, a) => s + a.value, 0);
  const counterfactual = {
    playerCount: kept.length,
    playerValue: cfPlayerValue,
    picks: cfPicks.picks,
    pickValue: cfPicks.total,
    total: cfPlayerValue + cfPicks.total,
    coherence: coherenceOf(cfAssets),
  };
  const actual = {
    playerCount: actualPlayers.length,
    playerValue: actualPlayerValue,
    picks: actualPicks.picks,
    pickValue: actualPicks.total,
    total: actualPlayerValue + actualPicks.total,
    coherence: coherenceOf(actualAssets),
  };
  return {
    rosterId,
    ownerName: user?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? null,
    players: all,
    counterfactual,
    actual,
    delta: counterfactual.total - actual.total,
    overflow: Math.max(0, priceable.length - kept.length),
    hoardValue,
    rosterSlots,
    unpriced,
    teamCheckAvailable: tracksTeams,
    picksUsedByOthers,
    boundarySeason: h.chain[0]?.season ?? String(h.currentSeasonYear),
    draftless: !index.supported || index.bySeason.size === 0,
  };
}
/**
 * The read, in the app's voice: three flat statements about what the two columns
 * differ on. No grade, no verdict, and deliberately no word that implies the trades
 * were good or bad (D6). Trading value away for pick capital is a strategy, not an
 * error, and the whole point of showing both columns is that the reader decides.
 */
export function describeCounterfactual(c) {
  const out = [];
  const n = (v) => Math.abs(v).toLocaleString("en-US");
  const dir = c.delta > 0 ? "above" : "below";
  out.push(
    Math.abs(c.delta) < 250
      ? `The trade-free roster prices at ${n(c.counterfactual.total)}, level with the ${n(c.actual.total)} you hold today.`
      : `The trade-free roster prices at ${n(c.counterfactual.total)}, ${n(c.delta)} ${dir} the ${n(c.actual.total)} you hold today.`,
  );
  const playerDelta = c.counterfactual.playerValue - c.actual.playerValue;
  const pickDelta = c.counterfactual.pickValue - c.actual.pickValue;
  if (Math.abs(playerDelta) >= 250 || Math.abs(pickDelta) >= 250) {
    const players =
      playerDelta > 0
        ? `${n(playerDelta)} more in players`
        : `${n(playerDelta)} less in players`;
    const picks =
      pickDelta > 0
        ? `${n(pickDelta)} more in picks`
        : `${n(pickDelta)} less in picks`;
    out.push(`That splits into ${players} and ${picks}.`);
  }
  const tciGap = c.counterfactual.coherence.tci - c.actual.coherence.tci;
  if (Math.abs(tciGap) >= 5) {
    out.push(
      `Its timeline is ${tciGap > 0 ? "more" : "less"} coherent: TCI ${c.counterfactual.coherence.tci} against ${c.actual.coherence.tci} today.`,
    );
  }
  if (c.counterfactual.playerCount < c.rosterSlots) {
    out.push(
      `It cannot fill your roster: ${c.counterfactual.playerCount} priced players for ${c.rosterSlots} spots.`,
    );
  }
  return out;
}
/**
 * Players claimed by more than one manager's counterfactual.
 *
 * A player only lands in two trade-free rosters by going out on waivers and being
 * re-added elsewhere, which is a real feature of the construction rather than an
 * arithmetic slip - and it is the honest way to say "these fourteen rosters do not
 * add up to one league." Returns playerId -> the roster ids that both claim him.
 */
export function counterfactualOverlaps(h, index) {
  const claims = new Map();
  for (const r of h.rosters) {
    const { held } = acquisitions(h, r.rosterId, index);
    for (const pid of held.keys()) {
      (claims.get(pid) ?? claims.set(pid, []).get(pid)).push(r.rosterId);
    }
  }
  for (const [pid, rosters] of claims)
    if (rosters.length < 2) claims.delete(pid);
  return claims;
}
