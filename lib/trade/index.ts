/**
 * Trade evaluator. Values both sides, but the OUTPUT IS A THESIS, NOT A GRADE:
 *   - what each side is betting on
 *   - the single assumption that must be true for this to work for YOU
 *   - what your own history says about how you handle this kind of bet
 * A letter grade is what competitors ship (DECISIONS.md D6). We do better.
 */
import type { LeagueHistory } from "../history";
import { pickValue, tierOf, valuePlayer } from "../valuation";
import { strengthRanks } from "../picks";
import { ordinal, rosterName } from "../derive/describe";
import { getStrategyReport } from "../strategy";
import { posturesByRoster, readPickAgency } from "../agency";
import { leagueTimelines } from "../metrics/duration";
import type { OwnedPick } from "../picks";

export interface PickInput {
  round: number;
  season: string;
  /**
   * The roster the pick ORIGINALLY belongs to. Optional, but supplying it is what
   * lets the evaluator price "their 2027 1st" differently from "my 2027 1st" - the
   * whole point of slot-aware pick valuation.
   */
  originalRosterId?: number;
  /** Known slot within the round, when the draft order is already set. */
  slot?: number;
}
export interface TradeInput {
  /** Assets YOU send away. */
  give: { playerIds: string[]; picks: PickInput[] };
  /** Assets YOU receive. */
  get: { playerIds: string[]; picks: PickInput[] };
}

export interface ValuedAsset {
  kind: "player" | "pick";
  id: string;
  label: string;
  value: number;
  tier?: string;
  age?: number | null;
}
export interface TradeSideValue {
  assets: ValuedAsset[];
  total: number;
  avgAge: number | null;
}
export interface TradeEvaluation {
  give: TradeSideValue;
  get: TradeSideValue;
  /** value received minus value given, from YOUR perspective. */
  delta: number;
  deltaPct: number;
  direction: "buying" | "selling" | "lateral";
  yourBet: string;
  theirBet: string;
  keyAssumption: string;
  historyCheck: string;
  consolidationNote: string | null;
  /**
   * WHOSE SEASON DECIDES THE PICKS IN THIS DEAL.
   *
   * The evaluator already prices a pick by the strength of the team that owes it.
   * What it never said is the thing an experienced dynasty manager checks first:
   * whether the outcome of the pick belongs to you or to somebody else, and what
   * that somebody else's roster is currently built to do. "You are acquiring a pick
   * whose value depends on a team that is contending" is exactly the kind of thesis
   * this output exists to print, and it was missing.
   *
   * Empty when the deal moves no picks, or when the picks carry no original roster.
   */
  agencyNotes: string[];
}

function valueSide(
  h: LeagueHistory,
  side: { playerIds: string[]; picks: PickInput[] },
): TradeSideValue {
  const scoring = h.currentLeague.scoringSettings;
  const assets: ValuedAsset[] = [];
  const ages: number[] = [];
  for (const pid of side.playerIds) {
    const p = h.players.get(pid);
    if (!p) continue;
    const v = valuePlayer(p, scoring);
    if (p.age != null) ages.push(p.age);
    assets.push({
      kind: "player",
      id: pid,
      label: p.fullName,
      value: v.value,
      tier: tierOf(v.value),
      age: p.age,
    });
  }
  // Price picks exactly the way lib/picks.ts does, including slot estimation from
  // the original team's strength. If these two disagreed, a roster's pick capital
  // would not match what the trade evaluator says those same picks are worth.
  const ranks = strengthRanks(h);
  const teams = h.currentLeague.totalRosters || h.rosters.length;
  const rounds = h.currentLeague.settings.draft_rounds || 3;
  for (const pk of side.picks) {
    const seasonsOut = parseInt(pk.season, 10) - h.currentSeasonYear;
    const v = pickValue(pk.round, seasonsOut, {
      slot: pk.slot,
      originalTeamRank:
        pk.originalRosterId != null ? ranks.get(pk.originalRosterId) : undefined,
      teams,
      rounds,
      playoffTeams: h.currentLeague.settings.playoff_teams,
      season: pk.season,
    });
    const via =
      pk.originalRosterId != null ? ` (via ${rosterName(h, pk.originalRosterId)})` : "";
    assets.push({
      kind: "pick",
      id: `${pk.season}-${pk.round}-${pk.originalRosterId ?? "own"}`,
      label: `${pk.season} ${ordinal(pk.round)}${via}`,
      value: v,
    });
  }
  assets.sort((a, b) => b.value - a.value);
  const total = assets.reduce((s, a) => s + a.value, 0);
  const avgAge = ages.length ? Math.round((ages.reduce((s, v) => s + v, 0) / ages.length) * 10) / 10 : null;
  return { assets, total, avgAge };
}

export function evaluateTrade(h: LeagueHistory, input: TradeInput): TradeEvaluation {
  const give = valueSide(h, input.give);
  const get = valueSide(h, input.get);
  const delta = get.total - give.total;
  const deltaPct = give.total > 0 ? Math.round((delta / give.total) * 100) : 0;

  // Direction from age + pick flow of what YOU receive.
  const picksReceived = input.get.picks.length;
  const picksSent = input.give.picks.length;
  const olderIn =
    get.avgAge != null && give.avgAge != null && get.avgAge - give.avgAge >= 2.5;
  const youngerIn =
    get.avgAge != null && give.avgAge != null && give.avgAge - get.avgAge >= 2.5;
  let direction: TradeEvaluation["direction"] = "lateral";
  if (olderIn || picksSent > picksReceived) direction = "buying";
  else if (youngerIn || picksReceived > picksSent) direction = "selling";

  const topGet = get.assets[0]?.label ?? "the incoming pieces";
  const topGive = give.assets[0]?.label ?? "what you're sending";

  const yourBet =
    direction === "buying"
      ? `You're betting your window is now - that ${topGet} plus your current core can win before value ages out. You're converting future flexibility into present production.`
      : direction === "selling"
        ? `You're betting on the future - that ${topGet} and the draft capital will outproduce ${topGive} over the next 3+ seasons, and that you're not close enough to waste this asset now.`
        : `You're making a lateral bet - swapping like value, likely for fit or need rather than a timeline shift.`;

  const theirBet =
    direction === "buying"
      ? `They're betting the opposite: that the youth and picks they're getting back are worth more than ${topGet}'s remaining prime.`
      : direction === "selling"
        ? `They're betting they can win now with ${topGive} - paying a premium in youth/picks to do it.`
        : `They see the same rough parity and value what they're getting for their own roster's fit.`;

  const keyAssumption =
    direction === "buying"
      ? `This only works if you actually contend within ${topGet.includes("Round") ? "the next season or two" : "the prime window of " + topGet}. If you don't, you've paid future assets for a window that never opened.`
      : direction === "selling"
        ? `This only works if the young assets hit. Picks and youth are probabilistic - you're trading a known quantity (${topGive}) for a distribution of outcomes.`
        : `The assumption is fit: that ${topGet} solves a real roster need better than ${topGive} did.`;

  // History check — tie into the revealed-vs-stated engine.
  const historyCheck = buildHistoryCheck(h, direction);

  // Consolidation: are you giving quantity to get a star, or vice versa?
  let consolidationNote: string | null = null;
  const giveCount = give.assets.length;
  const getCount = get.assets.length;
  if (getCount < giveCount && (get.assets[0]?.value ?? 0) > 3000) {
    consolidationNote = `You're consolidating ${giveCount} assets into ${getCount}. Star scarcity is real - a single ${get.assets[0].tier} is usually worth a modest value discount because you can't start ${giveCount} of them. This is the good kind of consolidation.`;
  } else if (getCount > giveCount && (give.assets[0]?.value ?? 0) > 3000) {
    consolidationNote = `You're breaking up a ${give.assets[0].tier} into ${getCount} lesser pieces. Quantity rarely replaces a stud - make sure the depth actually cracks your lineup.`;
  }

  return {
    give,
    get,
    delta,
    deltaPct,
    direction,
    yourBet,
    theirBet,
    keyAssumption,
    historyCheck,
    consolidationNote,
    agencyNotes: buildAgencyNotes(h, input),
  };
}

/**
 * The agency read for the picks in a deal.
 *
 * Computed LAST and only when the deal actually contains an attributable pick, so a
 * player-for-player trade never pays for the league-wide timeline pass that posture
 * needs. Trades carry at most a handful of picks, so this is a short list by
 * construction rather than by truncation.
 */
function buildAgencyNotes(h: LeagueHistory, input: TradeInput): string[] {
  const mine = h.me.rosterId;
  if (mine == null) return [];
  const attributable = [...input.get.picks, ...input.give.picks].some(
    (p) => p.originalRosterId != null,
  );
  if (!attributable) return [];

  const postures = posturesByRoster(leagueTimelines(h));
  const notes: string[] = [];

  const asOwned = (p: PickInput): OwnedPick => ({
    season: p.season,
    round: p.round,
    originalRoster: p.originalRosterId!,
    acquired: p.originalRosterId !== mine,
    fromName: null,
    value: 0,
    label: `${p.season} ${ordinal(p.round)}`,
  });

  for (const p of input.get.picks) {
    if (p.originalRosterId == null) continue;
    const r = readPickAgency(h, mine, asOwned(p), { postures });
    notes.push(
      r.controlled
        ? `Incoming: this brings your own ${r.pick.label} back to you. ${r.note}`
        : `Incoming: ${r.note}`,
    );
  }
  for (const p of input.give.picks) {
    if (p.originalRosterId == null) continue;
    // Sending it: the question is what YOU are handing over, so the read is taken
    // from the receiving side's point of view rather than restating your own.
    const r = readPickAgency(h, mine, asOwned(p), { postures });
    notes.push(
      r.controlled
        ? `Outgoing: you are sending a pick your own ${r.determiningSeason} season sets. Whoever holds it after this is a passenger on your results, and you stop being able to convert your own season into this asset.`
        : `Outgoing: you are sending a pick ${r.determinedByName}'s ${r.determiningSeason} season sets${r.posture ? `, and their roster reads ${r.posture}` : ""}. You were a passenger on it either way.`,
    );
  }
  return notes;
}

function buildHistoryCheck(
  h: LeagueHistory,
  direction: TradeEvaluation["direction"],
): string {
  const report = getStrategyReport(h);
  const posture = report.profile.postureBySeason.at(-1)?.posture;
  const stated = report.statedPostures.at(-1);
  const bits: string[] = [];

  if (stated && stated.posture !== "unclear") {
    const conflict =
      (stated.posture === "rebuilding" && direction === "buying") ||
      (stated.posture === "contending" && direction === "selling");
    bits.push(
      conflict
        ? `Your most recent stated intent was "${stated.posture}", and this is a ${direction} move - that's a reversal. Be honest about whether the plan changed or you're chasing.`
        : `This lines up with your most recent stated intent ("${stated.posture}").`,
    );
  }
  if (report.contradictions.length) {
    bits.push(
      `Heads up: your record already shows a stated-vs-revealed gap - ${report.contradictions[0].title.toLowerCase()} Don't repeat the pattern blindly.`,
    );
  }
  if (posture) {
    bits.push(`Your revealed posture lately reads as ${posture}.`);
  }
  if (report.profile.afterLoss && report.profile.afterLoss.afterLoss > report.profile.afterLoss.afterWin) {
    bits.push(`You tend to trade after losses - if you just lost, sleep on this one.`);
  }
  return bits.length
    ? bits.join(" ")
    : `Not enough of your history yet to judge this against your patterns - annotate a few more moves.`;
}
