import { deriveManagerProfile } from "../derive/manager";
import { tenureLabel, tenureSeasons } from "../principals";
import {
  describeTradeForRoster,
  describeTransaction,
  pickLabel,
  rosterName,
} from "../derive/describe";
/**
 * The index row's second line: "3 players, 2 picks".
 *
 * Deliberately a count and never a name. Naming the "headline" asset would mean
 * ranking the pieces, and ranking the pieces of a trade is one short step from
 * scoring it - which is the thing this app refuses to do (D6). A count says how much
 * weight a deal carried without saying who won it.
 *
 * A commissioner-executed deal has no pick record at all (D19), so it reports only
 * its players here and the row tags the gap rather than letting the number imply the
 * deal was players-only.
 */
export function dealPieces(a) {
  const parts = [];
  if (a.players)
    parts.push(`${a.players} ${a.players === 1 ? "player" : "players"}`);
  if (a.picks) parts.push(`${a.picks} ${a.picks === 1 ? "pick" : "picks"}`);
  return parts.length ? parts.join(", ") : "nothing on record";
}
// ---------------------------------------------------------------- helpers
/** Every roster a trade touches. `rosterIds` alone can miss a party. */
export function tradeParties(t) {
  const s = new Set(t.rosterIds);
  for (const r of Object.values(t.adds)) s.add(r);
  for (const r of Object.values(t.drops)) s.add(r);
  for (const dp of t.draftPicks) {
    s.add(dp.ownerId);
    s.add(dp.previousOwnerId);
  }
  return [...s].sort((x, y) => x - y);
}
/**
 * The canonical key for a pairing, order-independent: a pair has one key however you
 * name it. Now that it round-trips through a URL (`/deals?pair=...`) there must
 * continue to be exactly one place it is built.
 */
export function pairEdgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
export const playerKey = (playerId) => `p:${playerId}`;
export const pickKey = (season, round, orig) => `k:${season}-${round}-${orig}`;
/** Recovers the player id from a player-kind asset key. Null for a pick. */
export const assetPlayerId = (assetKey) =>
  assetKey.startsWith("p:") ? assetKey.slice(2) : null;
// ---------------------------------------------------------------- the ledger
/**
 * Builds the trade record. `principals` is the caller's one `getPrincipals(h)` fetch
 * (see lib/principals.ts) - this file never fetches it itself, so a page that needs
 * both the ledger and something else keyed by principal only pays once.
 */
export function buildTradeLedger(h, principals) {
  const tradesRaw = h.transactions.filter((t) => t.type === "trade");
  // One behavioural profile per PRINCIPAL, confined to their own tenure when any
  // roster in this league has changed hands - the exact conditional lib/superlatives
  // uses, so a league with no handovers produces byte-identical numbers to the old
  // roster-keyed derivation, and a handover splits one blended profile into two real
  // ones instead of averaging two people together.
  const profiles = new Map();
  for (const pr of principals.principals) {
    const rosterId = pr.currentRosterId ?? pr.lastRosterId;
    profiles.set(
      pr.ownerId,
      deriveManagerProfile(
        h,
        rosterId,
        {
          ownerId: pr.ownerId,
          displayName: pr.displayName,
          teamName: pr.teamName,
          seasons: principals.hasSuccessions
            ? tenureSeasons(pr, rosterId)
            : undefined,
        },
        principals,
      ),
    );
  }
  const pairTrades = new Map();
  const pairSeasons = new Map();
  const records = [];
  let multiTeamCount = 0;
  for (const t of tradesRaw) {
    const parties = tradeParties(t);
    const multiTeam = parties.length > 2;
    if (multiTeam) multiTeamCount++;
    const ownerParties = [
      ...new Set(
        parties
          .map((rid) => principals.ownerAt(t.season, rid))
          .filter((x) => x != null),
      ),
    ].sort();
    records.push({
      id: t.transactionId,
      season: t.season,
      week: t.week,
      created: t.created,
      parties,
      ownerParties,
      multiTeam,
      commissionerExecuted: t.transactionId.startsWith("coalesced-"),
      assets: {
        players: Object.keys(t.adds).length,
        picks: t.draftPicks.length,
      },
      summary: describeTransaction(h, t),
      sides: parties.map((rid) => {
        const ownerId = principals.ownerAt(t.season, rid);
        const pr = ownerId ? principals.byOwnerId.get(ownerId) : undefined;
        return {
          rosterId: rid,
          // A principal's own team name/handle from THAT season beats the roster's
          // current label, which would otherwise say the successor's name for a
          // trade the departed manager actually made.
          name: pr ? pr.teamName || pr.displayName : rosterName(h, rid),
          text: describeTradeForRoster(h, t, rid),
        };
      }),
    });
    for (let i = 0; i < ownerParties.length; i++) {
      for (let j = i + 1; j < ownerParties.length; j++) {
        const a = ownerParties[i];
        const b = ownerParties[j];
        const key = pairEdgeKey(a, b);
        const entry = pairTrades.get(key) ?? { a, b, ids: [] };
        entry.ids.push(t.transactionId);
        pairTrades.set(key, entry);
        (pairSeasons.get(key) ?? pairSeasons.set(key, new Set()).get(key)).add(
          t.season,
        );
      }
    }
  }
  // Cross-check against the dossier derivation, which counts encounters rather than
  // records - see the note on `TradePairing.count`. Looked up by OWNER: the dossier's
  // partner list is principal-keyed now, so a seat that changed hands no longer folds
  // two people's counts into one row for this comparison to then inherit.
  const profileWeight = (ownerA, ownerB) =>
    profiles.get(ownerA)?.tradePartners.find((p) => p.ownerId === ownerB)
      ?.count ?? 0;
  const pairings = [];
  for (const [key, { a, b, ids }] of pairTrades) {
    const derived = Math.max(profileWeight(a, b), profileWeight(b, a));
    pairings.push({
      key,
      a,
      b,
      dealCount: ids.length,
      dossierCount: Math.max(derived, ids.length),
      tradeIds: ids,
      seasons: [...(pairSeasons.get(key) ?? [])].sort(),
    });
  }
  // Sorted on the LISTABLE count - see `dossierCount` for the headline this got wrong.
  pairings.sort(
    (x, y) => y.dealCount - x.dealCount || x.key.localeCompare(y.key),
  );
  const managers = principals.principals.map((pr) => {
    const p = profiles.get(pr.ownerId);
    const rosterId = pr.isFormer ? pr.lastRosterId : pr.currentRosterId;
    const name = pr.teamName || pr.displayName;
    return {
      ownerId: pr.ownerId,
      rosterId,
      name,
      handle: pr.displayName,
      trades: p.trades,
      partners: p.tradePartners.length,
      picksNet: p.picks.net,
      isMe: pr.ownerId === h.me.userId,
      avatarId: pr.avatar,
      teamLogoUrl: pr.teamLogoUrl,
      isFormer: pr.isFormer,
      tenureLabel: tenureLabel(pr),
    };
  });
  managers.sort((a, b) => b.trades - a.trades || a.name.localeCompare(b.name));
  return {
    managers,
    pairings,
    trades: records.sort((a, b) => b.created - a.created),
    seasons: h.chain.map((c) => c.season),
    totalTrades: tradesRaw.length,
    multiTeamCount,
    meRosterId: h.me.rosterId,
  };
}
// ---------------------------------------------------------------- asset moves
/**
 * Every hop of every asset that moved in a trade, chronological.
 *
 * `pickPlayers` maps a pick's asset key to the player it became (resolved by
 * `lib/lineage`), which is how a pick chain keeps going past the draft.
 *
 * Each hop also carries `fromOwnerId`/`toOwnerId`, the principal actually holding
 * that seat during the hop's own season - resolved once here via `ownerAt` so the
 * provenance walk never has to guess who a roster id "means" at a given point in the
 * chain.
 */
export function buildAssetMoves(h, principals, pickPlayers = {}) {
  const out = [];
  for (const t of h.transactions) {
    if (t.type !== "trade") continue;
    for (const [pid, to] of Object.entries(t.adds)) {
      const from = t.drops[pid];
      // Without a recorded origin the asset can't be chained to a giver.
      if (from == null || from === to) continue;
      const key = playerKey(pid);
      out.push({
        id: `${t.transactionId}|${key}`,
        assetKey: key,
        kind: "player",
        label: h.players.get(pid)?.fullName ?? `Player ${pid}`,
        became: null,
        tradeId: t.transactionId,
        season: t.season,
        week: t.week,
        created: t.created,
        from,
        to,
        fromOwnerId: principals.ownerAt(t.season, from),
        toOwnerId: principals.ownerAt(t.season, to),
      });
    }
    for (const dp of t.draftPicks) {
      if (dp.ownerId === dp.previousOwnerId) continue;
      const key = pickKey(dp.season, dp.round, dp.rosterId);
      out.push({
        id: `${t.transactionId}|${key}`,
        assetKey: key,
        kind: "pick",
        // Origin qualifier per the /drafts lineage convention: a pick moving on
        // from someone other than its original roster names where it came from,
        // so two same-round pick nodes in one chain stay distinguishable.
        label: pickLabel(
          dp,
          dp.rosterId !== dp.previousOwnerId
            ? rosterName(h, dp.rosterId)
            : null,
        ),
        became: pickPlayers[key] ?? null,
        tradeId: t.transactionId,
        season: t.season,
        week: t.week,
        // The event time is the trade's, not the pick's own season.
        created: t.created,
        from: dp.previousOwnerId,
        to: dp.ownerId,
        fromOwnerId: principals.ownerAt(t.season, dp.previousOwnerId),
        toOwnerId: principals.ownerAt(t.season, dp.ownerId),
      });
    }
  }
  return out.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}
/** playerId -> the roster currently holding them. */
export function buildHoldings(h) {
  const out = {};
  for (const r of h.rosters) for (const pid of r.players) out[pid] = r.rosterId;
  return out;
}
