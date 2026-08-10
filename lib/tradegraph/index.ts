/**
 * THE TRADE LEDGER - who traded with whom, and every asset hop it caused.
 *
 * This file used to build a picture: a ring of managers with a bowed strand for every
 * pair that had traded, thickness encoding the number of deals. The ring is gone, and
 * the reason is worth keeping written down so nobody rebuilds it. Edge counts in this
 * league run 1 to 8, and the stroke formula rendered a 1-deal strand at 1.41px and an
 * 8-deal strand at 3.40px at 390px - the ENTIRE dynamic range of the only thing that
 * drawing encoded was two pixels, spread across 46 overlapping curves, with 23 of the
 * 46 sitting at the minimum. The page's own copy admitted it ("Everything is also
 * listed below"), and the list was better than the picture. It also drew 15 nodes for
 * a 14-team league, correctly (D22 - one node per principal, and one roster has
 * changed hands), which is a true fact that a picture of a league is the worst
 * possible place to learn.
 *
 * What survives is the derivation the ring was drawn over, which was never the
 * problem:
 *
 *  1. `buildTradeLedger` - one `TradeRecord` per deal, plus the managers and the
 *     pairings, all keyed by PRINCIPAL (see lib/principals.ts) rather than roster
 *     seat. A roster that changed hands contributes one manager per person who
 *     actually sat in it, and each trade is attributed via `ownerAt` to whoever held
 *     the seat THAT season - a roster-keyed version would credit one manager's trades
 *     to whoever replaced them.
 *
 *  2. `buildAssetMoves` - every hop every player and pick took. Asset flow is tracked
 *     by ROSTER SEAT (a roster's belongings are a fact about the roster, which is what
 *     lets a chain spanning a handover stay one lineage), but each hop also carries
 *     the PRINCIPAL who made it, resolved once here via `ownerAt`.
 *
 * The tree walker that used to live at the bottom of this file is gone too, replaced
 * by lib/provenance's backwards walk. The header comment there explains why the
 * direction is the whole fix.
 *
 * MULTI-TEAM TRADES: a 3-team deal is one transaction with 3+ parties. It becomes one
 * pairing per participating pair (3 pairs for 3 teams) and is flagged `multiTeam`.
 * Parties are read from the union of `rosterIds`, `adds`, `drops` and pick owners,
 * because commissioner-reconstructed trades don't always agree with `rosterIds` alone.
 */
import type { LeagueHistory } from "../history";
import type { Transaction } from "../providers/types";
import { deriveManagerProfile, type ManagerProfile } from "../derive/manager";
import { tenureLabel, tenureSeasons, type PrincipalIndex } from "../principals";
import {
  describeTradeForRoster,
  describeTransaction,
  pickLabel,
  rosterName,
} from "../derive/describe";

// ---------------------------------------------------------------- types

/**
 * A manager, as the trade record knows them.
 *
 * No geometry. The ring's `x`/`y` and its invented `abbr` are gone: the abbreviations
 * were minted here and nowhere else in the app, so a reader met `5YP`, `6MP` and `TTT`
 * for the first and only time inside one drawing.
 */
export interface TradeManager {
  /** Stable identity: the platform user id (Principal.ownerId). Never shared, even
   *  across a handover - a departed and a current manager can share a rosterId, but
   *  never this. */
  ownerId: string;
  /** The roster they hold now, or the last one they held if they've left. Used for
   *  `TeamAvatar` and for routing a CURRENT principal's dossier link - it is not the
   *  identity key, `ownerId` is. */
  rosterId: number;
  /** Team name if set, else the Sleeper handle. */
  name: string;
  handle: string;
  /** Deals this manager has been part of (from the dossier derivation, scoped to
   *  their own tenure when any roster in the league has changed hands). */
  trades: number;
  /** Distinct managers they've traded with. */
  partners: number;
  /** Net picks acquired minus spent. */
  picksNet: number;
  isMe: boolean;
  /** For `TeamAvatar` - same imagery every other page uses for this manager. */
  avatarId: string | null;
  teamLogoUrl: string | null;
  /** No longer holds a roster in the league. */
  isFormer: boolean;
  /** e.g. "2022-2024". Set only when `isFormer` - nothing to date-range for a current
   *  manager. See `lib/principals.ts#tenureLabel`. */
  tenureLabel: string | undefined;
}

export interface TradeSideText {
  rosterId: number;
  name: string;
  /** e.g. "acquired Devin Booker for Jordan Poole". */
  text: string;
}

/** What moved in a deal, by kind. See `TradeRecord.assets`. */
export interface DealAssetCounts {
  players: number;
  picks: number;
}

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
export function dealPieces(a: DealAssetCounts): string {
  const parts: string[] = [];
  if (a.players) parts.push(`${a.players} ${a.players === 1 ? "player" : "players"}`);
  if (a.picks) parts.push(`${a.picks} ${a.picks === 1 ? "pick" : "picks"}`);
  return parts.length ? parts.join(", ") : "nothing on record";
}

/**
 * ONE DEAL. This type was always the receipt; it just had nowhere to be printed.
 * `/deals/[transactionId]` is now that page.
 */
export interface TradeRecord {
  id: string;
  season: string;
  week: number;
  created: number;
  /** Roster seats that were party to this trade. */
  parties: number[];
  /** The same parties, resolved to the PRINCIPAL who actually held each seat during
   *  `season` - the correct key for grouping this trade into a pairing. Deduplicated;
   *  usually the same length as `parties`, but collapses if a seat somehow resolved
   *  to the same owner twice. */
  ownerParties: string[];
  multiTeam: boolean;
  /** Neutral, perspective-free summary. */
  summary: string;
  sides: TradeSideText[];
  /**
   * How much changed hands, counted rather than narrated.
   *
   * The index prints this instead of the two-sided prose: a list you scan needs to say
   * how big a deal was, and what was actually in it is the whole job of the receipt one
   * tap away. Players come from `adds`, where every traded player lands exactly once;
   * picks from the recorded `draftPicks` rows, which is why a commissioner-executed
   * deal reports zero of them and carries the tag that says why.
   */
  assets: DealAssetCounts;
  /**
   * True when this deal was reconstructed from commissioner rows (D19). Those rows
   * carry `draft_picks: []`, so the deal's pick component - if it had one - is not in
   * the record and cannot be recovered. This is a CHECKED fact about the source rows,
   * not an inference about the deal's contents; the receipt says so up front.
   */
  commissionerExecuted: boolean;
}

/**
 * Two managers who have traded, and the deals between them.
 *
 * Formerly `TradeGraphEdge`, and the rename is not cosmetic: an edge is a thing you
 * draw, and there is nothing left in this app that draws one. What a pairing is FOR
 * now is filtering the deal index (`/deals?pair=...`) and answering Manager Compare's
 * head-to-head question.
 */
export interface TradePairing {
  /** `${a}-${b}` with a < b lexicographically. `a`/`b` are owner ids, not roster ids -
   *  a roster that changed hands needs to distinguish "traded with the old guy" from
   *  "traded with the new guy" and a roster-id key cannot do that. */
  key: string;
  a: string;
  b: string;
  /**
   * The deals that exist as records between this pair. `tradeIds.length`, restated as
   * a field so nothing has to remember which of the two numbers below is safe.
   *
   * THIS IS THE ONE TO SORT AND HEADLINE ON. Use `dossierCount` only to footnote a
   * disagreement, the way /managers/compare does.
   */
  dealCount: number;
  /**
   * `max(dossier-derived weight, dealCount)`, kept because a pair should never be
   * undersold and because Manager Compare surfaces the gap deliberately.
   *
   * The gap USED to have two causes and now has one. The dossier fold was ROSTER-keyed,
   * so for a seat that had changed hands it credited the successor with everything the
   * seat ever did: "busiest pairing" read "kdewitt4 and 6-Month Plan, 8 deals" when
   * kdewitt4 has done 2 with them and the other 6 belong to NSLKB, who left in 2024.
   * That was the D22 blend, and `TradePartner` is principal-keyed now, so it is gone at
   * the source - on this corpus the two counts agree on all 46 pairings. What remains
   * is the honest one: a commissioner-executed multi-team deal can arrive as several
   * transactions that coalesce into ONE record here while the dossier still counts each
   * encounter. Still NOT interchangeable with `dealCount`, and still never the headline.
   */
  dossierCount: number;
  tradeIds: string[];
  /** Seasons the pair traded in, ascending. */
  seasons: string[];
}

export interface TradeLedger {
  managers: TradeManager[];
  pairings: TradePairing[];
  trades: TradeRecord[];
  /** Every season in the league chain, ascending. */
  seasons: string[];
  totalTrades: number;
  multiTeamCount: number;
  meRosterId: number | null;
}

/**
 * A manager's CURRENT read on the two proprietary metrics, attached wherever a deal
 * or a chain names them. Optional fields are null rather than absent so a consumer
 * can render "not enough data" instead of silently omitting the row - matches how
 * both metrics already degrade on their own pages.
 *
 * Both metrics are properties of a roster AS IT STANDS TONIGHT, so a departed
 * principal has nothing here - callers must not look this up by a former principal's
 * last roster id, which belongs to whoever replaced them now.
 */
export interface ManagerMetric {
  tci: number;
  posture: "contending" | "ascending" | "rebuilding" | "straddling";
  rosterDuration: number;
  fragility: number | null;
  fragilityBand: "resilient" | "balanced" | "brittle" | null;
}

/** A traded player's CURRENT standing, not what they were worth at trade time. */
export interface PlayerNow {
  team: string | null;
  value: number;
  tier: string;
  /** Seasons from now the player's own value arrives, on average. */
  duration: number;
  /** Roster currently holding them, or null if no longer in the league. */
  heldBy: number | null;
}

export type AssetKind = "player" | "pick";

/** One hop of one asset, in one trade. */
export interface AssetMove {
  /** `${tradeId}|${assetKey}` - stable and unique. */
  id: string;
  /** `p:<playerId>` or `k:<season>-<round>-<originalRoster>`. */
  assetKey: string;
  kind: AssetKind;
  /** Player name, or a pick label. */
  label: string;
  /** For a pick that has since been used: the player it became. */
  became: string | null;
  tradeId: string;
  season: string;
  week: number;
  created: number;
  /** Roster seats. Asset flow is tracked by SEAT, not by manager - a roster's
   *  belongings are a fact about the roster, and that is what makes a chain that
   *  spans a handover keep making sense as one lineage. */
  from: number;
  to: number;
  /** The PRINCIPAL who actually made this hop, resolved via `ownerAt(season, from/
   *  to)` at build time - who was in the seat THAT season, not who holds it now. */
  fromOwnerId: string | null;
  toOwnerId: string | null;
}

// ---------------------------------------------------------------- helpers

/** Every roster a trade touches. `rosterIds` alone can miss a party. */
export function tradeParties(t: Transaction): number[] {
  const s = new Set<number>(t.rosterIds);
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
export function pairEdgeKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export const playerKey = (playerId: string) => `p:${playerId}`;
export const pickKey = (season: string, round: number, orig: number) =>
  `k:${season}-${round}-${orig}`;
/** Recovers the player id from a player-kind asset key. Null for a pick. */
export const assetPlayerId = (assetKey: string): string | null =>
  assetKey.startsWith("p:") ? assetKey.slice(2) : null;

// ---------------------------------------------------------------- the ledger

/**
 * Builds the trade record. `principals` is the caller's one `getPrincipals(h)` fetch
 * (see lib/principals.ts) - this file never fetches it itself, so a page that needs
 * both the ledger and something else keyed by principal only pays once.
 */
export function buildTradeLedger(
  h: LeagueHistory,
  principals: PrincipalIndex,
): TradeLedger {
  const tradesRaw = h.transactions.filter((t) => t.type === "trade");

  // One behavioural profile per PRINCIPAL, confined to their own tenure when any
  // roster in this league has changed hands - the exact conditional lib/superlatives
  // uses, so a league with no handovers produces byte-identical numbers to the old
  // roster-keyed derivation, and a handover splits one blended profile into two real
  // ones instead of averaging two people together.
  const profiles = new Map<string, ManagerProfile>();
  for (const pr of principals.principals) {
    const rosterId = pr.currentRosterId ?? pr.lastRosterId;
    profiles.set(
      pr.ownerId,
      deriveManagerProfile(h, rosterId, {
        ownerId: pr.ownerId,
        displayName: pr.displayName,
        teamName: pr.teamName,
        seasons: principals.hasSuccessions ? tenureSeasons(pr, rosterId) : undefined,
      }, principals),
    );
  }

  const pairTrades = new Map<string, { a: string; b: string; ids: string[] }>();
  const pairSeasons = new Map<string, Set<string>>();
  const records: TradeRecord[] = [];
  let multiTeamCount = 0;

  for (const t of tradesRaw) {
    const parties = tradeParties(t);
    const multiTeam = parties.length > 2;
    if (multiTeam) multiTeamCount++;

    const ownerParties = [
      ...new Set(
        parties
          .map((rid) => principals.ownerAt(t.season, rid))
          .filter((x): x is string => x != null),
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
        (
          pairSeasons.get(key) ?? pairSeasons.set(key, new Set()).get(key)!
        ).add(t.season);
      }
    }
  }

  // Cross-check against the dossier derivation, which counts encounters rather than
  // records - see the note on `TradePairing.count`. Looked up by OWNER: the dossier's
  // partner list is principal-keyed now, so a seat that changed hands no longer folds
  // two people's counts into one row for this comparison to then inherit.
  const profileWeight = (ownerA: string, ownerB: string) =>
    profiles.get(ownerA)?.tradePartners.find((p) => p.ownerId === ownerB)?.count ?? 0;

  const pairings: TradePairing[] = [];
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
  pairings.sort((x, y) => y.dealCount - x.dealCount || x.key.localeCompare(y.key));

  const managers: TradeManager[] = principals.principals.map((pr) => {
    const p = profiles.get(pr.ownerId)!;
    const rosterId = pr.isFormer ? pr.lastRosterId : (pr.currentRosterId as number);
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
export function buildAssetMoves(
  h: LeagueHistory,
  principals: PrincipalIndex,
  pickPlayers: Record<string, string> = {},
): AssetMove[] {
  const out: AssetMove[] = [];
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
          dp.rosterId !== dp.previousOwnerId ? rosterName(h, dp.rosterId) : null,
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
export function buildHoldings(h: LeagueHistory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of h.rosters) for (const pid of r.players) out[pid] = r.rosterId;
  return out;
}
