import { pickValue, valuePlayer } from "../valuation";
import { leagueTierLabel } from "../rankings/leagueTiers";
import { strengthRanks } from "../picks";
import { ordinal, rosterName } from "../derive/describe";
import { getStrategyReport } from "../strategy";
import { posturesByRoster, readPickAgency } from "../agency";
import { leagueTimelines } from "../metrics/duration";
function valueSide(
  h,
  side,
  // Tier labels come from the LEAGUE'S OWN distribution, the same recipe /values and
  // every roster page use. A receipt that called a player "Franchise" while /values
  // called him "Cornerstone" is a receipt the reader cannot trust about anything else.
  tierFor,
) {
  const scoring = h.currentLeague.scoringSettings;
  const assets = [];
  const ages = [];
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
      tier: tierFor(v.value),
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
        pk.originalRosterId != null
          ? ranks.get(pk.originalRosterId)
          : undefined,
      teams,
      rounds,
      playoffTeams: h.currentLeague.settings.playoff_teams,
      season: pk.season,
    });
    const via =
      pk.originalRosterId != null
        ? ` (via ${rosterName(h, pk.originalRosterId)})`
        : "";
    assets.push({
      kind: "pick",
      id: `${pk.season}-${pk.round}-${pk.originalRosterId ?? "own"}`,
      label: `${pk.season} ${ordinal(pk.round)}${via}`,
      value: v,
    });
  }
  assets.sort((a, b) => b.value - a.value);
  const total = assets.reduce((s, a) => s + a.value, 0);
  const avgAge = ages.length
    ? Math.round((ages.reduce((s, v) => s + v, 0) / ages.length) * 10) / 10
    : null;
  return { assets, total, avgAge };
}
export function evaluateTrade(h, input) {
  const tierFor = leagueTierLabel(h);
  const give = valueSide(h, input.give, tierFor);
  const get = valueSide(h, input.get, tierFor);
  const delta = get.total - give.total;
  const deltaPct = give.total > 0 ? Math.round((delta / give.total) * 100) : 0;
  // Direction from age + pick flow of what YOU receive.
  const picksReceived = input.get.picks.length;
  const picksSent = input.give.picks.length;
  const olderIn =
    get.avgAge != null &&
    give.avgAge != null &&
    get.avgAge - give.avgAge >= 2.5;
  const youngerIn =
    get.avgAge != null &&
    give.avgAge != null &&
    give.avgAge - get.avgAge >= 2.5;
  let direction = "lateral";
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
  let consolidationNote = null;
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
function buildAgencyNotes(h, input) {
  const mine = h.me.rosterId;
  if (mine == null) return [];
  const attributable = [...input.get.picks, ...input.give.picks].some(
    (p) => p.originalRosterId != null,
  );
  if (!attributable) return [];
  const postures = posturesByRoster(leagueTimelines(h));
  const notes = [];
  const asOwned = (p) => ({
    season: p.season,
    round: p.round,
    originalRoster: p.originalRosterId,
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
function buildHistoryCheck(h, direction) {
  const report = getStrategyReport(h);
  const posture = report.profile.postureBySeason.at(-1)?.posture;
  const stated = report.statedPostures.at(-1);
  const bits = [];
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
  if (
    report.profile.afterLoss &&
    report.profile.afterLoss.afterLoss > report.profile.afterLoss.afterWin
  ) {
    bits.push(
      `You tend to trade after losses - if you just lost, sleep on this one.`,
    );
  }
  return bits.length
    ? bits.join(" ")
    : `Not enough of your history yet to judge this against your patterns - annotate a few more moves.`;
}
