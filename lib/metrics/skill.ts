/**
 * PERFORMANCE METRICS — three attempts at "who is actually good at this".
 *
 * Everything else in the awards system measures *behaviour*: how often you trade, how
 * young you buy, how long you hold. Behaviour is safe to measure because it needs no
 * counterfactual. Performance is harder, and every honest version of it has to answer
 * "compared to what?" out loud. The three metrics here each name their baseline:
 *
 *   1. START RATE  (lock-in management)
 *      fpts / ppts. The league platform already computes, per season, the points you
 *      DID score and the points your roster COULD have scored with a perfect lineup.
 *      In a lock-in league that ratio is close to a pure measure of daily management:
 *      filling every start, spending starts on players who actually play that night,
 *      and not leaving a 40-point game on the bench. It needs no counterfactual from
 *      us because the platform supplies it, and no matchup ingest.
 *
 *   2. DRAFT CAPTURE  (drafting)
 *      Graded against the pool that was still on the board. For each pick, look at
 *      every player taken at that slot or later, and ask where inside that range the
 *      player actually taken falls. 1.0 = took the best remaining asset, 0.5 = median,
 *      0.0 = took the worst. Aggregated as a value-weighted ratio, so a blown 1.01
 *      counts for much more than a blown 4.12. Draft slot cancels out (every pick is
 *      graded only against what was in front of IT), and class strength cancels out
 *      (every pick is graded only against its own draft).
 *
 *   3. TRADE VALUE ADDED  (trading)
 *      Players in minus players out, priced at TODAY's value. This one is hindsight
 *      and says so: it is not a measure of process, it is a measure of how the deals
 *      turned out. Picks are excluded on purpose - see the note on that function.
 *
 * All three are HINDSIGHT-BIASED by construction: they price assets at what we know
 * now, not at what was knowable then. That is the correct way to grade an outcome and
 * the wrong way to grade a decision, and the copy that ships with them says so. We do
 * not have historical ranking snapshots, so a process-fair version is not available.
 *
 * ALL THREE ARE KEYED BY PRINCIPAL, NOT BY ROSTER. A roster that changed hands holds
 * two managers' work, and crediting one with the other's drafts would be the single
 * worst error this file could make. Every historical fact is attributed through
 * `PrincipalIndex.ownerAt(season, rosterId)`. See lib/principals.ts.
 */
import type { LeagueHistory } from "../history";
import { getLeagueProvider } from "../providers";
import type { Roster } from "../providers/types";
import { valuePlayers } from "../valuation";
import { buildDraftIndex } from "../lineage";
import { getPrincipals, type PrincipalIndex } from "../principals";

// ============================================================ 1. start rate

export interface SeasonStartRate {
  season: string;
  /** Points actually scored. */
  fpts: number;
  /** Points the roster could have scored with an optimal lineup. */
  ppts: number;
  /** fpts / ppts, 0..1. */
  startRate: number;
}

export interface StartRateProfile {
  /** The manager. Identity key. */
  ownerId: string;
  /** The last roster this manager held. For links and display only. */
  rosterId: number;
  /** Completed seasons with usable data, oldest first. */
  seasons: SeasonStartRate[];
  fpts: number;
  ppts: number;
  /** Career fpts / ppts. Weighted by season length automatically. */
  startRate: number;
  /** Total points that were available and never started. */
  leftOnBench: number;
  best: SeasonStartRate | null;
  worst: SeasonStartRate | null;
}

/**
 * Pure core: fold per-season (fpts, ppts) rows into one career profile.
 *
 * Summing the numerator and denominator before dividing (rather than averaging the
 * per-season ratios) is deliberate - it weights a 20-week season above a 6-week one
 * and keeps `leftOnBench` consistent with the headline rate.
 */
export function foldStartRate(
  ownerId: string,
  rosterId: number,
  rows: SeasonStartRate[],
): StartRateProfile {
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

/**
 * Per-season rosters across the chain, keyed by season.
 *
 * Loaded here rather than in the corpus on purpose: only the pages that grade
 * performance need it, and folding it into `getLeagueHistory` would add a request per
 * season to every cold start in the app. Cached like the draft index, and never
 * throws - a season that fails to load is simply absent.
 */
let seasonRosterCache: {
  at: number;
  key: string;
  value: Map<string, Roster[]>;
} | null = null;
const SEASON_ROSTER_TTL_MS = 5 * 60_000;

export async function loadSeasonRosters(
  h: LeagueHistory,
  opts: { fresh?: boolean } = {},
): Promise<Map<string, Roster[]>> {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (
    !opts.fresh &&
    seasonRosterCache &&
    seasonRosterCache.key === key &&
    Date.now() - seasonRosterCache.at < SEASON_ROSTER_TTL_MS
  ) {
    return seasonRosterCache.value;
  }
  const provider = getLeagueProvider();
  const out = new Map<string, Roster[]>();
  const results = await Promise.all(
    h.chain.map(async (league) => {
      try {
        return { season: league.season, rosters: await provider.getRosters(league.leagueId) };
      } catch {
        return { season: league.season, rosters: [] as Roster[] };
      }
    }),
  );
  for (const r of results) if (r.rosters.length) out.set(r.season, r.rosters);
  seasonRosterCache = { at: Date.now(), key, value: out };
  return out;
}

/** Reset the season-roster memo. Test and "fresh reload" hook. */
export function invalidateSeasonRosters(): void {
  seasonRosterCache = null;
}

/**
 * Career start rate per PRINCIPAL, keyed by owner user id.
 *
 * Joined on owner id rather than roster id, which is the whole point: a roster that
 * changed hands has two managers' lineup management in it, and a manager who has left
 * the league still earns credit for the seasons they actually managed.
 */
export async function startRateProfiles(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Promise<Map<string, StartRateProfile>> {
  const bySeason = await loadSeasonRosters(h);

  // owner user id -> their season rows
  const rowsByOwner = new Map<string, SeasonStartRate[]>();
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

  const out = new Map<string, StartRateProfile>();
  for (const p of principals.principals) {
    const rows = rowsByOwner.get(p.ownerId);
    if (!rows?.length) continue;
    out.set(p.ownerId, foldStartRate(p.ownerId, p.lastRosterId, rows));
  }
  return out;
}

// ============================================================ 2. draft capture

/** A single pick, graded against the players still on the board when it was made. */
export interface GradedPick {
  season: string;
  pickNo: number;
  round: number;
  rosterId: number;
  /** The manager who was on the clock, resolved through the principal index. */
  ownerId: string;
  playerId: string;
  playerName: string;
  /** Today's value of the player taken. */
  value: number;
  /** Today's value of the best player still on the board. */
  bestAvailable: number;
  bestAvailableName: string;
  /** Today's value of the worst player who went at this slot or later. */
  worstAvailable: number;
  /** Where the pick landed inside [worst, best]. 1 = took the best asset left. */
  capture: number;
  /** value - bestAvailable. Always <= 0: the points left on the board. */
  regret: number;
  /** 1 = the most valuable player to come out of this draft, by today's value. */
  valueRank: number;
  /**
   * pickNo - valueRank. Positive = the player outperformed the slot he went at.
   *
   * This is the slot-relative view, and it is a genuinely different question from
   * `capture`. Capture asks "did you take the best asset in front of you", which the
   * first pick of a draft answers trivially by taking the consensus number one.
   * Slot surplus asks "did you get more than that slot usually returns", which is what
   * anyone actually means by a draft steal: taken 30th, turned out to be the 5th best
   * player in the class.
   */
  slotSurplus: number;
  /** Graded picks in this draft. Needed to compare surpluses across draft sizes. */
  draftSize: number;
  /**
   * This pick came from the league's one-off STARTUP draft, not an annual rookie draft.
   *
   * The distinction matters more than it looks. A startup draft is a different exercise:
   * seventeen rounds over the entire player pool, held once in a league's life. A rookie
   * draft is three rounds over one class, held every year. Slot surplus in the first is
   * not the same quantity as slot surplus in the second even after normalising for
   * depth, and because there is only ever one startup, any award ranked on it is frozen
   * on that season forever. So the startup is excluded from the slot-surplus extremes.
   */
  isStartup: boolean;
  /**
   * `slotSurplus / draftSize`. The comparable form, and the one to rank on.
   *
   * Raw surplus is not comparable across drafts: a startup draft nearly five times the
   * depth of a rookie draft can produce surpluses nearly five times as large for the
   * same quality of decision, so ranking on the raw number quietly turns every
   * best-and-worst-pick award into an award about the startup draft. Verified on the
   * real league, where the unnormalised version filled all four places of both awards
   * with picks from one season.
   */
  slotSurplusRate: number;
}

export interface DraftCaptureProfile {
  ownerId: string;
  /** Last roster this manager drafted for. Display only. */
  rosterId: number;
  /** Picks that could be graded (a pick with nothing behind it cannot be). */
  picks: number;
  seasons: string[];
  /** Sum of (value - worstAvailable) over graded picks. */
  captured: number;
  /** Sum of (bestAvailable - worstAvailable) over graded picks. */
  capturable: number;
  /** captured / capturable, 0..1. Value-weighted, so early picks dominate. */
  captureRate: number;
  /** Total value left on the board across every graded pick. */
  regret: number;
  /** Best and worst by pool capture. */
  best: GradedPick | null;
  worst: GradedPick | null;
  /**
   * Best and worst by slot surplus, from ANNUAL ROOKIE DRAFTS ONLY.
   * See `GradedPick.isStartup` for why the startup draft is held out.
   */
  steal: GradedPick | null;
  bust: GradedPick | null;
  /** Split of graded picks, so the reader can see what each number is built on. */
  rookiePicks: number;
  startupPicks: number;
}

export interface RawDraftPick {
  pickNo: number;
  rosterId: number | null;
  playerId: string | null;
  playerName: string | null;
  round: number;
  isKeeper: boolean;
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
  season: string,
  picks: RawDraftPick[],
  valueOf: (playerId: string) => number,
  nameOf: (playerId: string) => string,
  /** (season, rosterId) -> the manager who was actually on the clock. */
  ownerOf: (season: string, rosterId: number) => string | null,
  /** True for the league's one-off startup draft. See `GradedPick.isStartup`. */
  isStartup = false,
): GradedPick[] {
  const ordered = picks
    .filter((p) => p.playerId != null && p.rosterId != null && !p.isKeeper)
    .sort((a, b) => a.pickNo - b.pickNo);
  const n = ordered.length;
  if (n < 2) return [];

  const values = ordered.map((p) => valueOf(p.playerId!));

  // Value rank within this draft class: 1 = the best player to come out of it. Ties
  // resolve to the earlier pick so the ranking is a permutation and stays deterministic.
  const rankOfIndex = new Array<number>(n);
  [...values.keys()]
    .sort((a, b) => values[b] - values[a] || a - b)
    .forEach((idx, r) => {
      rankOfIndex[idx] = r + 1;
    });

  // Suffix max/min so each pick's pool is O(1) rather than O(n).
  const sufMax = new Array<number>(n);
  const sufMin = new Array<number>(n);
  const sufMaxAt = new Array<number>(n);
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

  const out: GradedPick[] = [];
  for (let i = 0; i < n - 1; i++) {
    const best = sufMax[i];
    const worst = sufMin[i];
    const span = best - worst;
    if (span <= 0) continue; // nothing to choose between
    const p = ordered[i];
    const ownerId = ownerOf(season, p.rosterId!);
    if (!ownerId) continue; // cannot attribute the decision to a person: drop it
    const value = values[i];
    out.push({
      season,
      pickNo: p.pickNo,
      round: p.round,
      rosterId: p.rosterId!,
      ownerId,
      playerId: p.playerId!,
      playerName: p.playerName ?? nameOf(p.playerId!),
      value: Math.round(value),
      bestAvailable: Math.round(best),
      bestAvailableName:
        ordered[sufMaxAt[i]].playerName ?? nameOf(ordered[sufMaxAt[i]].playerId!),
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
export function startupSeasons(
  drafts: { season: string; rounds: number }[],
): Set<string> {
  if (drafts.length < 2) return new Set();
  const sorted = [...drafts].map((d) => d.rounds).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(median > 0)) return new Set();
  return new Set(drafts.filter((d) => d.rounds > median * 2).map((d) => d.season));
}

/** Fold graded picks into one profile per roster. Pure. */
export function foldDraftCapture(
  graded: GradedPick[],
): Map<string, DraftCaptureProfile> {
  const byOwner = new Map<string, GradedPick[]>();
  for (const g of graded) {
    const list = byOwner.get(g.ownerId) ?? [];
    list.push(g);
    byOwner.set(g.ownerId, list);
  }

  const out = new Map<string, DraftCaptureProfile>();
  for (const [ownerId, picks] of byOwner) {
    const captured = picks.reduce((s, g) => s + (g.value - g.worstAvailable), 0);
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
        b.bestAvailable - b.worstAvailable - (a.bestAvailable - a.worstAvailable) ||
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
export async function draftCaptureProfiles(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Promise<Map<string, DraftCaptureProfile>> {
  const index = await buildDraftIndex(h);
  if (!index.supported) return new Map();

  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
  );
  const valueOf = (id: string) => values.get(id)?.value ?? 0;
  const nameOf = (id: string) => h.players.get(id)?.fullName ?? id;

  const complete = [...index.bySeason].filter(
    ([, sd]) => sd.draft.status === "complete",
  );
  const startups = startupSeasons(
    complete.map(([season, sd]) => ({ season, rounds: sd.draft.rounds })),
  );

  const graded: GradedPick[] = [];
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

// ============================================================ 3. trade value added

export interface TradeLine {
  transactionId: string;
  season: string;
  valueIn: number;
  valueOut: number;
  net: number;
  /** Player names, for the copy. */
  inNames: string[];
  outNames: string[];
}

export interface TradeValueProfile {
  ownerId: string;
  /** Last roster this manager traded from. Display only. */
  rosterId: number;
  /** Trades with at least one player on one side. */
  trades: number;
  valueIn: number;
  valueOut: number;
  net: number;
  best: TradeLine | null;
  worst: TradeLine | null;
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
export function tradeValueProfiles(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Map<string, TradeValueProfile> {
  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
  );
  const valueOf = (id: string) => values.get(id)?.value ?? 0;
  const nameOf = (id: string) => h.players.get(id)?.fullName ?? id;

  const linesByOwner = new Map<string, { rosterId: number; lines: TradeLine[] }>();
  for (const t of h.transactions) {
    if (t.type !== "trade") continue;

    // A trade's player movement lives entirely in `adds`: playerId -> receiving roster.
    // `drops` on a trade mirrors the same movement from the other side, so using both
    // would double-count. Build each roster's in/out from `adds` alone.
    const perRoster = new Map<number, { inIds: string[]; outIds: string[] }>();
    const touch = (rid: number) => {
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

  const out = new Map<string, TradeValueProfile>();
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

// ============================================================ bundle

/** Everything the awards layer needs that requires an await. All keyed by owner id. */
export interface PerformanceMetrics {
  principals: PrincipalIndex;
  startRate: Map<string, StartRateProfile>;
  draftCapture: Map<string, DraftCaptureProfile>;
  tradeValue: Map<string, TradeValueProfile>;
}

export async function performanceMetrics(
  h: LeagueHistory,
  principalIndex?: PrincipalIndex,
): Promise<PerformanceMetrics> {
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
