import { deriveManagerProfile } from "../derive/manager.js";
import { tenureLabel, tenureSeasons } from "../principals.js";
import {
  describeTradeForRoster,
  describeTransaction,
  pickLabel,
  rosterName,
} from "../derive/describe.js";
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
 * Did the commissioner execute this deal by hand?
 *
 * One condition, one implementation. `lib/derive/coalesce.js` mints a `coalesced-`
 * transaction id when it stitches a commissioner's separate add/drop rows back into
 * the one deal they actually were, so the prefix IS the detection - but it was written
 * out inline at the ledger and nowhere else, which is why the fact reached `/deals`
 * and not the provenance rail. Now both callers ask the same question the same way,
 * and a third one cannot get a different answer.
 *
 * Matters because Sleeper records no picks against a commissioner move (D19), so the
 * asset list on one of these deals is knowably incomplete - and a hop that renders
 * identically to a normal trade hides that.
 */
export function isCommissionerExecuted(transactionId) {
  return (
    typeof transactionId === "string" && transactionId.startsWith("coalesced-")
  );
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
      commissionerExecuted: isCommissionerExecuted(t.transactionId),
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
/**
 * THE PAIR MATRIX - who has traded with whom, as a GRID rather than a network.
 *
 * The reconsidered shelved idea (D51's blue-sky addendum #2): a persistent view of
 * every possible pairing, so the pairs that have NEVER traded are as visible as the
 * ones that have. The blocked version was a force-directed or hand-placed NODE
 * layout, and the objection was not "too much work" - it was D19 in visual form: any
 * layout readable enough to draw fourteen names as dots on a plane implies an
 * adjacency or closeness the trade record does not support. Two managers placed near
 * each other in that kind of drawing reads as "close", and this data has no such
 * relation to report.
 *
 * A GRID has no such implication. A cell's position encodes exactly one thing - which
 * TWO parties it represents - and nothing about how "close" those parties are to each
 * other or to anyone else. Row 1 sitting next to row 2 says nothing but that they are
 * adjacent ROWS; swapping the whole order changes nothing about what any cell means.
 * That is what a matrix is for, and it is the one hand-rolled layout (D3: no chart
 * library) this app can draw here without making the D19 claim the network version
 * would have made.
 *
 * Deliberately reports NO magnitude. `dealCount` exists on `pairings` and is not read
 * here: a cell is TRADED or NEVER, full stop, drawn as filled-versus-hollow (shape,
 * not shade alone - D47 rule 1) - because D48 already measured that an opacity ramp
 * cannot both order five steps and clear 3:1 contrast, and there is no reason to
 * inherit that failure mode for a fact this simple.
 *
 * Ordered alphabetically by name, never by trade count or anything else that would
 * itself imply a ranking sitting on top of a grid built specifically to avoid implying
 * one.
 */
export function pairMatrix(managers, pairings) {
  const order = [...managers].sort((a, b) => a.name.localeCompare(b.name));
  const dealCount = new Map(pairings.map((p) => [p.key, p.dealCount]));
  const cells = [];
  for (let row = 0; row < order.length; row++) {
    for (let col = 0; col < row; col++) {
      const a = order[row];
      const b = order[col];
      const key = pairEdgeKey(a.ownerId, b.ownerId);
      const count = dealCount.get(key) ?? 0;
      cells.push({ row, col, a, b, count, traded: count > 0 });
    }
  }
  const traded = cells.filter((c) => c.traded).length;
  return {
    order,
    cells,
    traded,
    never: cells.length - traded,
    possible: cells.length,
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
    // How many rosters this specific transaction touched, carried onto EVERY asset it
    // moved. A hop only ever prints the two seats on its own ends (`from`/`to`) - that
    // is the correct predecessor for the walk regardless of party count - but a real
    // three-team deal (this league has two) has OTHER assets moving between OTHER
    // seats in the same transaction that a two-seat sentence says nothing about. The
    // rail needs the count to say "this was a bigger deal than it looks" rather than
    // silently reading like an ordinary two-team trade with the third party's assets
    // invisible.
    const parties = tradeParties(t).length;
    // Carried onto every asset for the same reason `parties` is: the flag is a fact
    // about the TRANSACTION, and the provenance rail only ever holds one asset's hop.
    // Without it the rail draws a commissioner move identically to a normal trade,
    // which is the one place the reader cannot tell that the pick side of what they
    // are looking at was never recorded (D19).
    const commish = isCommissionerExecuted(t.transactionId);
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
        parties,
        commissionerExecuted: commish,
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
        parties,
        commissionerExecuted: commish,
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
