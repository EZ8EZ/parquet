/**
 * Revealed-vs-stated strategy engine — THE headline feature.
 *
 * Derives the user's actual behavior from transaction history, then contrasts it
 * with what they SAID (ledger annotations). It is built to disagree: it hunts for
 * places where stated intent and revealed behavior diverge, and surfaces them
 * prominently. It never rationalizes the stated strategy.
 */
import { myAnnotation } from "../history.js";
import { ageAtSeason, deriveManagerProfile, involves } from "../derive/manager.js";
import { describeTradeForRoster, tradeSide } from "../derive/describe.js";
import { tenureSeasons } from "../principals.js";
const REBUILD_WORDS =
  /\b(rebuild|rebuilding|getting younger|stockpil|youth|future|tank|long[- ]term|firsts|picks)\b/i;
const CONTEND_WORDS =
  /\b(win[- ]now|contend|contending|all[- ]in|championship|title|compete|ring|this year)\b/i;
function statedPostureFrom(posture, text) {
  const p = (posture ?? "").toLowerCase();
  if (p.includes("rebuild")) return "rebuilding";
  if (p.includes("contend") || p.includes("win")) return "contending";
  if (REBUILD_WORDS.test(text) && !CONTEND_WORDS.test(text))
    return "rebuilding";
  if (CONTEND_WORDS.test(text) && !REBUILD_WORDS.test(text))
    return "contending";
  return "unclear";
}
/** Is this trade (from rosterId's view) a clear "win-now" move? */
function isWinNowTrade(h, t, rosterId) {
  const s = tradeSide(h, t, rosterId);
  const firstsSpent = s.gavePicks.filter((p) => /1st/.test(p)).length;
  const firstsGot = s.gotPicks.filter((p) => /1st/.test(p)).length;
  const oldAcquired = Object.entries(t.adds).some(([pid, rid]) => {
    if (rid !== rosterId) return false;
    const age = ageAtSeason(h, pid, parseInt(t.season, 10));
    return age != null && age >= 30;
  });
  return firstsSpent - firstsGot >= 2 && oldAcquired;
}
/** Is this trade a clear "teardown/sell" move? */
function isSellTrade(h, t, rosterId) {
  const s = tradeSide(h, t, rosterId);
  const firstsGot = s.gotPicks.filter((p) => /1st/.test(p)).length;
  const youngAcquired = Object.entries(t.adds).some(([pid, rid]) => {
    if (rid !== rosterId) return false;
    const age = ageAtSeason(h, pid, parseInt(t.season, 10));
    return age != null && age <= 24;
  });
  return firstsGot >= 1 && (youngAcquired || s.gotPicks.length >= 2);
}
/**
 * `principals` SCOPES THIS REPORT TO THE PERSON, not the seat.
 *
 * Without it every figure on the home page is roster-keyed, and a seat that has
 * changed hands hands the new manager their predecessor's whole record: viewing this
 * app as the manager who took over roster 11 in 2025, "Revealed strategy" led with
 * "TRADES MADE 22" when they have made four, "PICK CAPITAL 0" against a real -9, and
 * an average acquisition age averaged across two different people - all of it
 * contradicting that same manager's own dossier two taps away, which has been tenure
 * scoped since D22. Optional so a caller with no index in hand degrades to the old
 * behaviour rather than failing, and so a league with no handovers is unaffected.
 */
export function getStrategyReport(h, principals) {
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return {
      profile: emptyProfile(h),
      headline: "Couldn't identify your roster in this league.",
      statedPostures: [],
      contradictions: [],
      findings: [],
      hasEnoughData: false,
    };
  }
  // The viewer's own tenure in this seat. Only applied when the league has actually
  // had a handover, so a league without one produces byte-identical output.
  const viewer = h.me.userId
    ? principals?.byOwnerId.get(h.me.userId)
    : undefined;
  const scope =
    viewer && principals?.hasSuccessions
      ? {
          ownerId: viewer.ownerId,
          displayName: viewer.displayName,
          teamName: viewer.teamName,
          seasons: tenureSeasons(viewer, rosterId),
        }
      : undefined;
  const profile = deriveManagerProfile(h, rosterId, scope, principals);
  const myTrades = h.transactions.filter(
    (t) =>
      t.type === "trade" &&
      t.rosterIds.includes(rosterId) &&
      (!scope?.seasons || scope.seasons.has(t.season)),
  );
  // Stated postures from annotations — the VIEWER's own decisions with the
  // VIEWER's own reasoning attached, never a trade partner's transaction or a trade
  // partner's annotation on a shared transactionId. Both halves of that filter
  // matter: `involves` keeps someone else's whole trade out, and `myAnnotation`
  // keeps someone else's reasoning on the viewer's OWN trade out (a trade has two
  // sides that share one transactionId, and each side may have annotated it).
  const statedPostures = [];
  for (const t of h.transactions) {
    if (!involves(t, rosterId)) continue;
    const ann = myAnnotation(h, t.transactionId);
    if (!ann) continue;
    const posture = statedPostureFrom(ann.posture, ann.reasoning);
    statedPostures.push({
      transactionId: t.transactionId,
      posture,
      season: t.season,
      createdMs: t.created,
      excerpt:
        ann.reasoning.length > 160
          ? ann.reasoning.slice(0, 157) + "…"
          : ann.reasoning,
    });
  }
  // Contradictions: a stated posture followed by opposite revealed behavior.
  const contradictions = [];
  for (const sp of statedPostures) {
    if (sp.posture === "unclear") continue;
    const later = myTrades.filter((t) => t.created > sp.createdMs);
    for (const t of later) {
      if (sp.posture === "rebuilding" && isWinNowTrade(h, t, rosterId)) {
        const desc = describeTradeForRoster(h, t, rosterId);
        const oldName = Object.entries(t.adds)
          .filter(([, rid]) => rid === rosterId)
          .map(([pid]) => {
            const age = ageAtSeason(h, pid, parseInt(t.season, 10));
            return `${h.players.get(pid)?.fullName ?? pid}${age != null ? ` (age ${age})` : ""}`;
          })
          .join(", ");
        contradictions.push({
          id: `${sp.transactionId}->${t.transactionId}`,
          severity: "high",
          title: "You said rebuild. You bought win-now.",
          statedTransactionId: sp.transactionId,
          statedSeason: sp.season,
          revealedTransactionId: t.transactionId,
          revealedSeason: t.season,
          narrative:
            `In ${sp.season} you called your move a rebuild - “${sp.excerpt}”. ` +
            `Then in ${t.season} you ${desc} - spending multiple first-round picks to add ${oldName}. ` +
            `Your stated strategy and your revealed strategy disagree.`,
        });
        break;
      }
      if (sp.posture === "contending" && isSellTrade(h, t, rosterId)) {
        const desc = describeTradeForRoster(h, t, rosterId);
        contradictions.push({
          id: `${sp.transactionId}->${t.transactionId}`,
          severity: "high",
          title: "You said win-now. You sold.",
          statedTransactionId: sp.transactionId,
          statedSeason: sp.season,
          revealedTransactionId: t.transactionId,
          revealedSeason: t.season,
          narrative:
            `In ${sp.season} you framed your plan as contending - “${sp.excerpt}”. ` +
            `Then in ${t.season} you ${desc} - the trade of a seller, not a contender. ` +
            `Your words and your transactions point in opposite directions.`,
        });
        break;
      }
    }
  }
  const findings = buildFindings(h, profile);
  const headline = buildHeadline(profile, contradictions);
  return {
    profile,
    headline,
    statedPostures,
    contradictions,
    findings,
    hasEnoughData: profile.trades >= 2,
  };
}
function buildHeadline(profile, contradictions) {
  if (contradictions.length) return contradictions[0].title;
  const post = profile.postureBySeason;
  if (post.length) {
    const last = post[post.length - 1];
    if (last.posture === "rebuilding")
      return "Your recent moves read as a rebuild. Are you sure that's the plan?";
    if (last.posture === "contending")
      return "You're in win-now mode - the picks are going out the door.";
  }
  return "Your revealed strategy, straight from your transaction record.";
}
function buildFindings(h, p) {
  const f = [];
  const ages = p.acquisitions.ageBySeason;
  if (ages.length >= 2) {
    const first = ages[0];
    const last = ages[ages.length - 1];
    const delta = last.avgAge - first.avgAge;
    if (Math.abs(delta) >= 1.5) {
      f.push(
        delta < 0
          ? `You're acquiring younger over time - avg acquisition age fell from ${first.avgAge} (${first.season}) to ${last.avgAge} (${last.season}).`
          : `You're acquiring older over time - avg acquisition age rose from ${first.avgAge} (${first.season}) to ${last.avgAge} (${last.season}).`,
      );
    }
  }
  if (p.picks.acquired || p.picks.spent) {
    f.push(
      p.picks.net > 0
        ? `Net pick accumulator: +${p.picks.net} picks (${p.picks.firstsAcquired} firsts in, ${p.picks.firstsSpent} out).`
        : p.picks.net < 0
          ? `Net pick spender: ${p.picks.net} picks (${p.picks.firstsSpent} firsts out, ${p.picks.firstsAcquired} in).`
          : `Even on pick capital (${p.picks.acquired} in, ${p.picks.spent} out).`,
    );
  }
  if (p.avgHoldingDays != null) {
    const yrs = (p.avgHoldingDays / 365).toFixed(1);
    f.push(
      `You hold acquired players ~${yrs} years on average before moving on.`,
    );
  }
  if (p.afterLoss && p.afterLoss.total >= 2) {
    const { afterLoss, afterWin, total } = p.afterLoss;
    if (afterLoss > afterWin)
      f.push(
        `You trade more after losses (${afterLoss} of ${total} self-initiated trades followed a loss) - watch for tilt.`,
      );
  }
  if (p.tradePartners.length) {
    const top = p.tradePartners[0];
    f.push(
      `Your most frequent trade partner is ${top.displayName} (${top.count} deals).`,
    );
  }
  if (p.deadline.buys || p.deadline.sells) {
    // An even split is not a tendency, and claiming one would be exactly the kind
    // of overreach this whole engine exists to avoid committing.
    f.push(
      p.deadline.buys > p.deadline.sells
        ? `At the deadline you tend to buy (${p.deadline.buys} buy-side vs ${p.deadline.sells} sell-side).`
        : p.deadline.sells > p.deadline.buys
          ? `At the deadline you tend to sell (${p.deadline.sells} sell-side vs ${p.deadline.buys} buy-side).`
          : `At the deadline you're an even split (${p.deadline.buys} buy-side, ${p.deadline.sells} sell-side) - no lean either way yet.`,
    );
  }
  return f;
}
function emptyProfile(h) {
  return {
    rosterId: -1,
    userId: h.me.userId,
    displayName: h.me.displayName,
    teamName: h.me.teamName,
    totalTransactions: 0,
    trades: 0,
    waivers: 0,
    freeAgents: 0,
    tradesInitiated: 0,
    tradesResponded: 0,
    tradesBySeason: [],
    tradePartners: [],
    acquisitions: { count: 0, avgAge: null, ageBySeason: [] },
    disposals: { count: 0, avgAge: null },
    picks: { acquired: 0, spent: 0, net: 0, firstsAcquired: 0, firstsSpent: 0 },
    avgHoldingDays: null,
    holdingByAgeBand: [],
    afterLoss: null,
    deadline: { buys: 0, sells: 0 },
    postureBySeason: [],
    faabAggression: null,
    overpaysForAge: false,
  };
}
