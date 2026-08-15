import { getLeagueProvider } from "../providers";
import { cachedValuePlayers } from "../valuation";
import { buildDraftIndex } from "../lineage";
import { getPrincipals } from "../principals";
/**
 * Pure core: fold per-season (fpts, ppts) rows into one career profile.
 *
 * Summing the numerator and denominator before dividing (rather than averaging the
 * per-season ratios) is deliberate - it weights a 20-week season above a 6-week one
 * and keeps `leftOnBench` consistent with the headline rate.
 */
export function foldStartRate(ownerId, rosterId, rows) {
  const usable = rows
    .filter((r) => r.ppts > 0 && r.fpts > 0)
    .sort((a, b) => a.season.localeCompare(b.season));
  const fpts = usable.reduce((s, r) => s + r.fpts, 0);
  const ppts = usable.reduce((s, r) => s + r.ppts, 0);
  const byRate = [...usable].sort((a, b) => b.startRate - a.startRate);
  return {
    ownerId,
    rosterId,
    seasons: usable,
    fpts: Math.round(fpts),
    ppts: Math.round(ppts),
    startRate: ppts > 0 ? fpts / ppts : 0,
    leftOnBench: Math.round(ppts - fpts),
    best: byRate[0] ?? null,
    worst: byRate.length > 1 ? byRate[byRate.length - 1] : null,
  };
}
let seasonRosterSlot = null;
const SEASON_ROSTER_TTL_MS = 5 * 60_000;
async function assembleSeasonRosters(h) {
  const provider = getLeagueProvider();
  const out = new Map();
  const results = await Promise.all(
    h.chain.map(async (league) => {
      try {
        return {
          season: league.season,
          rosters: await provider.getRosters(league.leagueId),
        };
      } catch {
        return { season: league.season, rosters: [] };
      }
    }),
  );
  for (const r of results) if (r.rosters.length) out.set(r.season, r.rosters);
  return out;
}
export async function loadSeasonRosters(h, opts = {}) {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (!opts.fresh && seasonRosterSlot && seasonRosterSlot.key === key) {
    if (seasonRosterSlot.resolvedAt === undefined)
      return seasonRosterSlot.promise;
    if (Date.now() - seasonRosterSlot.resolvedAt < SEASON_ROSTER_TTL_MS) {
      return seasonRosterSlot.promise;
    }
  }
  const slot = { key };
  slot.promise = assembleSeasonRosters(h)
    .then((value) => {
      slot.resolvedAt = Date.now();
      return value;
    })
    .catch((err) => {
      // Clear the slot on rejection so a transient failure doesn't pin a rejected
      // promise for the rest of the TTL window (mirrors `ensureIngested`).
      if (seasonRosterSlot === slot) seasonRosterSlot = null;
      throw err;
    });
  seasonRosterSlot = slot;
  return slot.promise;
}
/** Reset the season-roster memo. Test and "fresh reload" hook. */
export function invalidateSeasonRosters() {
  seasonRosterSlot = null;
}
/**
 * Career start rate per PRINCIPAL, keyed by owner user id.
 *
 * Joined on owner id rather than roster id, which is the whole point: a roster that
 * changed hands has two managers' lineup management in it, and a manager who has left
 * the league still earns credit for the seasons they actually managed.
 */
export async function startRateProfiles(h, principals) {
  const bySeason = await loadSeasonRosters(h);
  // owner user id -> their season rows
  const rowsByOwner = new Map();
  for (const [season, rosters] of bySeason) {
    for (const r of rosters) {
      if (!r.ownerId) continue;
      const { fpts, ppts } = r.settings;
      if (!(ppts > 0) || !(fpts > 0)) continue; // unplayed or unreported season
      const list = rowsByOwner.get(r.ownerId) ?? [];
      list.push({ season, fpts, ppts, startRate: fpts / ppts });
      rowsByOwner.set(r.ownerId, list);
    }
  }
  const out = new Map();
  for (const p of principals.principals) {
    const rows = rowsByOwner.get(p.ownerId);
    if (!rows?.length) continue;
    out.set(p.ownerId, foldStartRate(p.ownerId, p.lastRosterId, rows));
  }
  return out;
}
/**
 * Grade one draft. Pure: takes the picks and a value lookup, returns graded picks.
 *
 * The pool for pick N is every player taken at N or later, which is the honest
 * available-information set we can reconstruct: we know what the other managers
 * actually did with the board, so we can ask whether a better asset was sitting
 * there. Players who went undrafted are invisible to this - a manager is only ever
 * graded against choices someone in the league actually made.
 *
 * The last pick of a draft has a pool of one and cannot be graded, so it is dropped
 * rather than scored as a perfect 1.0. Keepers are dropped too: they are not decisions
 * made on the clock.
 */
export function gradeDraft(
  season,
  picks,
  valueOf,
  nameOf,
  /** (season, rosterId) -> the manager who was actually on the clock. */
  ownerOf,
  /** True for the league's one-off startup draft. See `GradedPick.isStartup`. */
  isStartup = false,
) {
  const ordered = picks
    .filter((p) => p.playerId != null && p.rosterId != null && !p.isKeeper)
    .sort((a, b) => a.pickNo - b.pickNo);
  const n = ordered.length;
  if (n < 2) return [];
  const values = ordered.map((p) => valueOf(p.playerId));
  // Value rank within this draft class: 1 = the best player to come out of it. Ties
  // resolve to the earlier pick so the ranking is a permutation and stays deterministic.
  const rankOfIndex = new Array(n);
  [...values.keys()]
    .sort((a, b) => values[b] - values[a] || a - b)
    .forEach((idx, r) => {
      rankOfIndex[idx] = r + 1;
    });
  // Suffix max/min so each pick's pool is O(1) rather than O(n).
  const sufMax = new Array(n);
  const sufMin = new Array(n);
  const sufMaxAt = new Array(n);
  sufMax[n - 1] = values[n - 1];
  sufMin[n - 1] = values[n - 1];
  sufMaxAt[n - 1] = n - 1;
  for (let i = n - 2; i >= 0; i--) {
    if (values[i] >= sufMax[i + 1]) {
      sufMax[i] = values[i];
      sufMaxAt[i] = i;
    } else {
      sufMax[i] = sufMax[i + 1];
      sufMaxAt[i] = sufMaxAt[i + 1];
    }
    sufMin[i] = Math.min(values[i], sufMin[i + 1]);
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const best = sufMax[i];
    const worst = sufMin[i];
    const span = best - worst;
    if (span <= 0) continue; // nothing to choose between
    const p = ordered[i];
    const ownerId = ownerOf(season, p.rosterId);
    if (!ownerId) continue; // cannot attribute the decision to a person: drop it
    const value = values[i];
    out.push({
      season,
      pickNo: p.pickNo,
      round: p.round,
      rosterId: p.rosterId,
      ownerId,
      playerId: p.playerId,
      playerName: p.playerName ?? nameOf(p.playerId),
      value: Math.round(value),
      bestAvailable: Math.round(best),
      bestAvailableName:
        ordered[sufMaxAt[i]].playerName ??
        nameOf(ordered[sufMaxAt[i]].playerId),
      worstAvailable: Math.round(worst),
      capture: (value - worst) / span,
      regret: Math.round(value - best),
      valueRank: rankOfIndex[i],
      // Against the pick's position in the draft, not its position among graded picks,
      // so an ungraded keeper earlier in the round does not shift the comparison.
      slotSurplus: p.pickNo - rankOfIndex[i],
      draftSize: n,
      slotSurplusRate: (p.pickNo - rankOfIndex[i]) / n,
      isStartup,
    });
  }
  return out;
}
/**
 * Which drafts in a chain are the one-off startup, by round count.
 *
 * Self-calibrating rather than a magic threshold: take the median round count across
 * the chain's drafts and flag anything more than twice it. On this league that is
 * seventeen rounds against a median of three. A league whose drafts are all the same
 * shape flags nothing, and a chain with a single draft flags nothing either, because
 * with one sample there is no way to tell what kind of draft it is.
 *
 * Round count is the signal rather than draft format because format is a league setting
 * that can change for reasons unrelated to what the draft is (this league runs its
 * startup as a snake and its rookie drafts as linear, but that pairing is a convention,
 * not a rule).
 */
export function startupSeasons(drafts) {
  if (drafts.length < 2) return new Set();
  const sorted = [...drafts].map((d) => d.rounds).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(median > 0)) return new Set();
  return new Set(
    drafts.filter((d) => d.rounds > median * 2).map((d) => d.season),
  );
}
/** Fold graded picks into one profile per roster. Pure. */
export function foldDraftCapture(graded) {
  const byOwner = new Map();
  for (const g of graded) {
    const list = byOwner.get(g.ownerId) ?? [];
    list.push(g);
    byOwner.set(g.ownerId, list);
  }
  const out = new Map();
  for (const [ownerId, picks] of byOwner) {
    const captured = picks.reduce(
      (s, g) => s + (g.value - g.worstAvailable),
      0,
    );
    const capturable = picks.reduce(
      (s, g) => s + (g.bestAvailable - g.worstAvailable),
      0,
    );
    // Rookie drafts only, and ranked on the normalised rate rather than the raw
    // surplus so a three-round class is comparable with another three-round class.
    // A league that has only ever held a startup falls back to it rather than
    // reporting no extremes at all.
    const rookie = picks.filter((g) => !g.isStartup);
    const surplusPool = rookie.length > 0 ? rookie : picks;
    const bySurplus = [...surplusPool].sort(
      (a, b) => b.slotSurplusRate - a.slotSurplusRate || a.pickNo - b.pickNo,
    );
    // Rank the extremes by how much of the available value they captured, then break
    // ties on the size of the opportunity so a big miss outranks a small one.
    const byCapture = [...picks].sort(
      (a, b) =>
        b.capture - a.capture ||
        b.bestAvailable -
          b.worstAvailable -
          (a.bestAvailable - a.worstAvailable) ||
        a.pickNo - b.pickNo,
    );
    out.set(ownerId, {
      ownerId,
      // The most recent roster they drafted for, for display and links.
      rosterId: picks.reduce(
        (acc, g) => (g.season >= acc.season ? g : acc),
        picks[0],
      ).rosterId,
      picks: picks.length,
      seasons: [...new Set(picks.map((p) => p.season))].sort(),
      captured: Math.round(captured),
      capturable: Math.round(capturable),
      captureRate: capturable > 0 ? captured / capturable : 0,
      regret: Math.round(picks.reduce((s, g) => s + g.regret, 0)),
      best: byCapture[0] ?? null,
      worst: byCapture.length > 1 ? byCapture[byCapture.length - 1] : null,
      steal: bySurplus[0] ?? null,
      bust: bySurplus.length > 1 ? bySurplus[bySurplus.length - 1] : null,
      rookiePicks: rookie.length,
      startupPicks: picks.length - rookie.length,
    });
  }
  return out;
}
/**
 * Draft capture per roster across every completed draft in the chain.
 *
 * Credited to the manager who ACTUALLY MADE the pick - not whoever originally owned
 * the slot, and not whoever holds the roster today. A pick acquired in a trade and
 * then used badly is the acquirer's miss, and a pick made by a manager who has since
 * handed the team over stays theirs.
 *
 * The made-pick record carries a roster id but no owner id, so the person is resolved
 * through `ownerAt(season, rosterId)`. That is exactly the join a roster-keyed version
 * would get wrong.
 */
export async function draftCaptureProfiles(h, principals) {
  const index = await buildDraftIndex(h);
  if (!index.supported) return new Map();
  const values = cachedValuePlayers(h);
  const valueOf = (id) => values.get(id)?.value ?? 0;
  const nameOf = (id) => h.players.get(id)?.fullName ?? id;
  const complete = [...index.bySeason].filter(
    ([, sd]) => sd.draft.status === "complete",
  );
  const startups = startupSeasons(
    complete.map(([season, sd]) => ({ season, rounds: sd.draft.rounds })),
  );
  const graded = [];
  for (const [season, sd] of complete) {
    graded.push(
      ...gradeDraft(
        season,
        sd.picks,
        valueOf,
        nameOf,
        principals.ownerAt,
        startups.has(season),
      ),
    );
  }
  return foldDraftCapture(graded);
}
/**
 * Net player value gained through trades, priced at today's value.
 *
 * PICKS ARE EXCLUDED, and that is a real limitation rather than an oversight.
 * Commissioner-executed trades - which is how every multi-team deal in this league was
 * done - arrive with an empty `draft_picks` array, so the pick side of those trades is
 * simply not in the record (see API_NOTES). Including picks for the trades that happen
 * to record them, and silently omitting them for the trades that do not, would produce
 * a number that looks complete and is not. Measuring one side completely beats
 * measuring both sides inconsistently, so this counts players only.
 *
 * Two consequences to state wherever this is shown: a manager who trades picks for
 * players looks better than they were, and a manager who trades players for picks
 * looks worse. `lib/picks.ts` reports pick capital separately and honestly.
 *
 * Attributed to whoever held the roster IN THE SEASON OF THE TRADE, so a manager who
 * inherited a team does not inherit their predecessor's deals.
 */
export function tradeValueProfiles(h, principals) {
  const values = cachedValuePlayers(h);
  const valueOf = (id) => values.get(id)?.value ?? 0;
  const nameOf = (id) => h.players.get(id)?.fullName ?? id;
  const linesByOwner = new Map();
  for (const t of h.transactions) {
    if (t.type !== "trade") continue;
    // A trade's player movement lives entirely in `adds`: playerId -> receiving roster.
    // `drops` on a trade mirrors the same movement from the other side, so using both
    // would double-count. Build each roster's in/out from `adds` alone.
    const perRoster = new Map();
    const touch = (rid) => {
      let e = perRoster.get(rid);
      if (!e) {
        e = { inIds: [], outIds: [] };
        perRoster.set(rid, e);
      }
      return e;
    };
    for (const [playerId, toRoster] of Object.entries(t.adds ?? {})) {
      touch(toRoster).inIds.push(playerId);
      const fromRoster = t.drops?.[playerId];
      if (fromRoster != null && fromRoster !== toRoster) {
        touch(fromRoster).outIds.push(playerId);
      }
    }
    if (perRoster.size === 0) continue; // pick-only trade: nothing we can price
    for (const [rosterId, e] of perRoster) {
      const ownerId = principals.ownerAt(t.season, rosterId);
      if (!ownerId) continue; // unattributable to a person
      const valueIn = e.inIds.reduce((s, id) => s + valueOf(id), 0);
      const valueOut = e.outIds.reduce((s, id) => s + valueOf(id), 0);
      const entry = linesByOwner.get(ownerId) ?? { rosterId, lines: [] };
      entry.rosterId = rosterId; // transactions are chronological, so this ends on the latest
      entry.lines.push({
        transactionId: t.transactionId,
        season: t.season,
        valueIn: Math.round(valueIn),
        valueOut: Math.round(valueOut),
        net: Math.round(valueIn - valueOut),
        inNames: e.inIds.map(nameOf),
        outNames: e.outIds.map(nameOf),
      });
      linesByOwner.set(ownerId, entry);
    }
  }
  const out = new Map();
  for (const [ownerId, { rosterId, lines }] of linesByOwner) {
    const byNet = [...lines].sort(
      (a, b) => b.net - a.net || a.transactionId.localeCompare(b.transactionId),
    );
    out.set(ownerId, {
      ownerId,
      rosterId,
      trades: lines.length,
      valueIn: lines.reduce((s, l) => s + l.valueIn, 0),
      valueOut: lines.reduce((s, l) => s + l.valueOut, 0),
      net: lines.reduce((s, l) => s + l.net, 0),
      best: byNet[0] ?? null,
      worst: byNet.length > 1 ? byNet[byNet.length - 1] : null,
    });
  }
  return out;
}
export async function performanceMetrics(h, principalIndex) {
  const principals = principalIndex ?? (await getPrincipals(h));
  const [startRate, draftCapture] = await Promise.all([
    startRateProfiles(h, principals),
    draftCaptureProfiles(h, principals),
  ]);
  return {
    principals,
    startRate,
    draftCapture,
    tradeValue: tradeValueProfiles(h, principals),
  };
}
