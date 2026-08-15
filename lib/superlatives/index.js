/**
 * League awards — superlatives derived across every manager.
 *
 * Two kinds live here, and the distinction matters.
 *
 * BEHAVIOURAL awards are a *presentation* layer over `deriveManagerProfile`: they
 * re-use metrics that already exist and only rank them. They need no counterfactual,
 * so they are safe. "Most trades" is a fact.
 *
 * PERFORMANCE awards ask "who is actually good at this", which always needs a baseline
 * and is always at least partly hindsight. Those come from `lib/metrics/skill.ts`,
 * which states each baseline explicitly, and their copy on this page must keep saying
 * so rather than presenting a graded outcome as a graded decision.
 *
 * Awards are keyed by PRINCIPAL, not by roster: a team that changed hands contributes
 * two managers, and a manager who has left the league is still eligible for the
 * seasons they were here. See lib/principals.ts.
 *
 * No randomness — the same corpus always produces the same awards, and ties break on
 * the lowest rosterId. Every award is either won by a real manager on real data, or
 * omitted; an award with nothing behind it simply does not appear.
 */
import { deriveManagerProfile } from "../derive/manager";
import { getPrincipals, tenureLabel, tenureSeasons } from "../principals";
import { leagueFragility } from "../metrics/fragility";
import { performanceMetrics } from "../metrics/skill";
export const AWARD_GROUPS = [
  { id: "performance", label: "On the merits" },
  { id: "trade-desk", label: "At the trade desk" },
  { id: "capital", label: "Draft capital" },
  { id: "taste", label: "Taste and timing" },
  { id: "margins", label: "Working the margins" },
];
// ---------------------------------------------------------------- helpers
/**
 * Age-skew awards need a real sample — a manager with a handful of adds can
 * post an extreme average by accident.
 */
const MIN_ACQUISITIONS = 10;
function labelFor(p) {
  return p.teamName ?? p.displayName;
}
function entrant(p, pr, stat, value) {
  return {
    rosterId: pr?.lastRosterId ?? p.rosterId,
    ownerId: pr?.ownerId ?? p.userId,
    isFormer: pr?.isFormer ?? false,
    displayName: p.displayName,
    teamName: p.teamName,
    label: labelFor(p),
    stat,
    // Normalise -0 (a negated zero score) so values compare and serialise cleanly.
    value: value === 0 ? 0 : value,
    tenureLabel: pr ? tenureLabel(pr) : undefined,
  };
}
function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
/** 1 -> "1st", 2 -> "2nd", 13 -> "13th". For "the 5th best player in the class". */
function ordinalish(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
function buildAward(items, spec, profileOf, principalOf) {
  const rows = [];
  for (const x of items) {
    const s = spec.score(x);
    if (s == null || !Number.isFinite(s)) continue;
    rows.push({ x, s });
  }
  if (rows.length < (spec.minEntrants ?? 2)) return null;
  const second = spec.secondary ?? (() => 0);
  rows.sort(
    (a, b) =>
      b.s - a.s ||
      second(b.x) - second(a.x) ||
      profileOf(a.x).rosterId - profileOf(b.x).rosterId ||
      // A handover puts two principals on one roster id, so the last tie-break has to
      // be the identity itself or the ordering is not deterministic.
      (principalOf(a.x)?.ownerId ?? "").localeCompare(
        principalOf(b.x)?.ownerId ?? "",
      ),
  );
  const top = rows[0];
  if (spec.qualifies && !spec.qualifies(top.x, top.s)) return null;
  const toEntrant = (r) =>
    entrant(profileOf(r.x), principalOf(r.x), spec.stat(r.x), r.s);
  return {
    id: spec.id,
    group: spec.group,
    title: spec.title,
    subtitle: spec.subtitle,
    winner: toEntrant(top),
    statLine: spec.stat(top.x),
    runnersUp: rows.slice(1, 4).map(toEntrant),
  };
}
/**
 * Most-frequent trade pairing — a two-team award, so it is built by hand.
 *
 * KEYED BY PRINCIPAL. This used to key on roster id, and a pairing is a relationship
 * between two PEOPLE, not two seats: with one seat in this league having changed hands,
 * the award crowned "6-Month Plan + kdewitt4, 8 trades together" (kdewitt4 has done two
 * with them) and "The Terror Twins + kdewitt4, 5 trades together" (they have never
 * traded at all - all five were the departed manager's). Both numbers were the
 * successor being handed their predecessor's record. `TradePartner` now carries the
 * owner id, so the fold below is simply the honest one, and a departed manager can win
 * or place on their own account.
 */
function pairingAward(rows) {
  const byOwner = new Map(rows.map((r) => [r.principal.ownerId, r]));
  const pairs = new Map();
  for (const { p, principal } of rows) {
    for (const partner of p.tradePartners) {
      if (!partner.ownerId || !byOwner.has(partner.ownerId)) continue;
      const [a, b] = [principal.ownerId, partner.ownerId].sort();
      const key = `${a}|${b}`;
      // Both sides report the same count; take the max rather than summing so a
      // one-sided record can't inflate the pair.
      const prev = pairs.get(key);
      const count = Math.max(prev?.count ?? 0, partner.count);
      pairs.set(key, { a, b, count });
    }
  }
  const ranked = [...pairs.values()]
    .filter((x) => x.count >= 2)
    .sort(
      (x, y) =>
        y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b),
    );
  if (ranked.length < 2) return null;
  const toEntrant = (x) => {
    const ra = byOwner.get(x.a);
    const rb = byOwner.get(x.b);
    return {
      rosterId: ra.p.rosterId,
      ownerId: ra.principal.ownerId,
      isFormer: ra.principal.isFormer,
      displayName: ra.p.displayName,
      teamName: ra.p.teamName,
      label: `${labelFor(ra.p)} + ${labelFor(rb.p)}`,
      stat: `${plural(x.count, "trade")} together`,
      value: x.count,
      tenureLabel: tenureLabel(ra.principal),
      partnerRosterId: rb.p.rosterId,
      partnerLabel: labelFor(rb.p),
    };
  };
  const winner = toEntrant(ranked[0]);
  return {
    id: "trade-pairing",
    group: "trade-desk",
    title: "Best Friends Forever",
    subtitle:
      "The two managers who deal with each other more than anyone else.",
    winner,
    statLine: winner.stat,
    runnersUp: ranked.slice(1, 4).map(toEntrant),
  };
}
// ---------------------------------------------------------------- the awards
export async function computeAwards(h) {
  // No current rosters means no league to hand awards out in. Worth an explicit guard
  // rather than an implicit one: principals are derived from the season chain, so
  // without this a league that has been torn down would still crown winners drawn
  // entirely from managers who are no longer there.
  if (h.rosters.length === 0) return [];
  const seasons = Math.max(1, h.chain.length);
  const principals = await getPrincipals(h);
  const perf = await performanceMetrics(h, principals);
  const fragilityByRoster = new Map(
    leagueFragility(h).map((f) => [f.rosterId, f]),
  );
  // One row per principal. A manager's behavioural profile is scoped to the seasons
  // they actually managed, which is what makes a handover produce two honest profiles
  // instead of one blended fiction.
  const rows = principals.principals.map((pr) => {
    const rosterId = pr.currentRosterId ?? pr.lastRosterId;
    return {
      principal: pr,
      p: deriveManagerProfile(
        h,
        rosterId,
        {
          ownerId: pr.ownerId,
          displayName: pr.displayName,
          teamName: pr.teamName,
          // Only scope when there is something to scope: a league with no handovers
          // must produce byte-identical numbers to the roster-keyed version.
          seasons: principals.hasSuccessions
            ? tenureSeasons(pr, rosterId)
            : undefined,
        },
        principals,
      ),
      startRate: perf.startRate.get(pr.ownerId) ?? null,
      draft: perf.draftCapture.get(pr.ownerId) ?? null,
      trade: perf.tradeValue.get(pr.ownerId) ?? null,
      fragility: pr.isFormer ? null : (fragilityByRoster.get(rosterId) ?? null),
    };
  });
  rows.sort(
    (a, b) =>
      a.p.rosterId - b.p.rosterId ||
      a.principal.ownerId.localeCompare(b.principal.ownerId),
  );
  const profiles = rows.map((r) => r.p);
  const principalOfProfile = new Map(rows.map((r) => [r.p, r.principal]));
  /**
   * A RATE HAS TO BE DIVIDED BY THE MANAGER'S OWN SEASONS, not by the league's.
   *
   * Every other number on a row here is already confined to the principal's tenure,
   * so dividing by the length of the whole chain mixed two scopes in one figure: the
   * departed manager in this league made 18 trades in three seasons and their own
   * dossier says "6/szn", while this page printed "3.6/season" for the same 18 trades.
   * Two surfaces, one manager, one quantity, two answers.
   */
  const seasonsOf = (p) => {
    if (!principals.hasSuccessions) return seasons;
    const pr = principalOfProfile.get(p);
    if (!pr) return seasons;
    return Math.max(1, pr.seasons.length);
  };
  const perSeason = (n, p) => Math.round((n / seasonsOf(p)) * 10) / 10;
  const pctOf = (x) => `${(x * 100).toFixed(1)}%`;
  const points = (n) => n.toLocaleString("en-US");
  /** Draft and lineup awards need a real sample before they mean anything. */
  const MIN_GRADED_PICKS = 8;
  const MIN_RATED_SEASONS = 2;
  // ------------------------------------------------------------ performance
  //
  // Every one of these is graded with hindsight, and every subtitle says so. They are
  // answers to "how did it turn out", not "was it a good decision at the time" - we
  // have no historical ranking snapshots, so the honest version of the second question
  // is not available and we do not pretend otherwise.
  const perfSpecs = [
    {
      id: "start-rate",
      group: "performance",
      title: "The Closer",
      subtitle:
        "Highest share of available points actually started. In a lock-in league this is the daily-management skill: every slot filled, nobody's big night left on the bench.",
      score: (r) =>
        r.startRate && r.startRate.seasons.length >= MIN_RATED_SEASONS
          ? r.startRate.startRate
          : null,
      secondary: (r) => r.startRate?.ppts ?? 0,
      stat: (r) =>
        r.startRate
          ? `${pctOf(r.startRate.startRate)} started · ${plural(r.startRate.seasons.length, "season")}`
          : "-",
    },
    {
      id: "start-rate-worst",
      group: "performance",
      title: "Left On The Bench",
      subtitle:
        "Most available points never started, against an optimal lineup. Some of this is tanking rather than inattention, and the number cannot tell them apart.",
      score: (r) =>
        r.startRate && r.startRate.seasons.length >= MIN_RATED_SEASONS
          ? r.startRate.leftOnBench
          : null,
      stat: (r) =>
        r.startRate
          ? `${points(r.startRate.leftOnBench)} pts benched · ${pctOf(r.startRate.startRate)} started`
          : "-",
      qualifies: (_r, s) => s > 0,
    },
    {
      id: "draft-capture",
      group: "performance",
      title: "The Scout",
      subtitle:
        "Best value extracted from the board, graded pick by pick against the players still available at that slot. Draft position and class strength both cancel out. Includes the startup draft, where the biggest decisions were made. Hindsight pricing.",
      score: (r) =>
        r.draft && r.draft.picks >= MIN_GRADED_PICKS
          ? r.draft.captureRate
          : null,
      secondary: (r) => r.draft?.capturable ?? 0,
      stat: (r) =>
        r.draft
          ? `${pctOf(r.draft.captureRate)} of value on the board · ${plural(r.draft.picks, "pick")}`
          : "-",
    },
    {
      id: "draft-steal",
      group: "performance",
      title: "The Steal",
      subtitle:
        "The rookie-draft pick that most outran its slot: taken late, turned out to be one of the best players in the class. Graded against draft position rather than against the board, because taking the consensus number one at 1.01 is not a steal. The one-off startup draft is held out, since it would freeze this award on that season forever.",
      score: (r) => r.draft?.steal?.slotSurplusRate ?? null,
      secondary: (r) => r.draft?.steal?.value ?? 0,
      stat: (r) =>
        r.draft?.steal
          ? `${r.draft.steal.playerName} · pick ${r.draft.steal.pickNo}, ${ordinalish(r.draft.steal.valueRank)} best in ${r.draft.steal.season}`
          : "-",
      qualifies: (_r, s) => s > 0,
    },
    {
      id: "draft-bust",
      group: "performance",
      title: "The Reach",
      subtitle:
        "The rookie-draft pick that most underran its slot: a high pick on a player the class went on to leave behind. Hindsight only, and nobody knew at the time.",
      score: (r) => (r.draft?.bust ? -r.draft.bust.slotSurplusRate : null),
      secondary: (r) => -(r.draft?.bust?.pickNo ?? 0),
      stat: (r) =>
        r.draft?.bust
          ? `${r.draft.bust.playerName} · pick ${r.draft.bust.pickNo}, ${ordinalish(r.draft.bust.valueRank)} best in ${r.draft.bust.season}`
          : "-",
      qualifies: (_r, s) => s > 0,
    },
    {
      id: "fragility",
      group: "performance",
      title: "House of Cards",
      subtitle:
        "Most fragile roster right now, by the Fragility Index: how much of the lineup is load-bearing on a handful of assets, and how little there is behind them. Not a verdict on quality - a torn-down roster has little to lose and scores low.",
      score: (r) => r.fragility?.fragility ?? null,
      secondary: (r) => r.fragility?.spofDamageShare ?? 0,
      stat: (r) =>
        r.fragility
          ? `RFI ${Math.round(r.fragility.fragility)} · hinges on ${r.fragility.singlePointOfFailure?.name ?? "nobody"}`
          : "-",
    },
    {
      id: "trade-value",
      group: "performance",
      title: "The Shark",
      subtitle:
        "Most player value gained through trades, priced at today's value. Picks are excluded because hand-executed trades do not record them, so a pick-for-player trader looks better here than they were.",
      score: (r) => (r.trade && r.trade.trades >= 3 ? r.trade.net : null),
      secondary: (r) => r.trade?.trades ?? 0,
      stat: (r) =>
        r.trade
          ? `${r.trade.net >= 0 ? "+" : ""}${points(r.trade.net)} net · ${plural(r.trade.trades, "trade")}`
          : "-",
      qualifies: (_r, s) => s > 0,
    },
  ];
  const specs = [
    {
      id: "most-trades",
      group: "trade-desk",
      title: "The Wheeler-Dealer",
      subtitle: "Most completed trades across the league's recorded history.",
      score: (p) => p.trades,
      stat: (p) =>
        `${plural(p.trades, "trade")} · ${perSeason(p.trades, p)}/season`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "fewest-trades",
      group: "trade-desk",
      title: "The Ghost",
      subtitle: "Fewest trades made. Some managers simply do not pick up.",
      score: (p) => -p.trades,
      secondary: (p) => -p.totalTransactions,
      stat: (p) =>
        `${plural(p.trades, "trade")} · ${plural(p.totalTransactions, "total move")}`,
    },
    {
      id: "initiator",
      group: "trade-desk",
      title: "The Cold Caller",
      subtitle:
        "Highest share of their own trades that they started (min. 5 trades).",
      score: (p) => (p.trades >= 5 ? p.tradesInitiated / p.trades : null),
      secondary: (p) => p.tradesInitiated,
      stat: (p) =>
        `${pct(p.tradesInitiated, p.trades)}% self-started · ${p.tradesInitiated}/${p.trades}`,
      qualifies: (_p, s) => s > 0.5,
    },
    {
      id: "responder",
      group: "trade-desk",
      title: "Screening Their Calls",
      subtitle:
        "Highest share of trades where someone else made the first move (min. 5 trades).",
      score: (p) => (p.trades >= 5 ? p.tradesResponded / p.trades : null),
      secondary: (p) => p.tradesResponded,
      stat: (p) =>
        `${pct(p.tradesResponded, p.trades)}% inbound · ${p.tradesResponded}/${p.trades}`,
      qualifies: (_p, s) => s > 0.5,
    },
    {
      id: "pick-hoarder",
      group: "capital",
      title: "Pick Hoarder",
      subtitle: "Best net draft-pick haul from trades. Collects the future.",
      score: (p) => p.picks.net,
      secondary: (p) => p.picks.firstsAcquired,
      stat: (p) =>
        `+${p.picks.net} net picks · ${plural(p.picks.firstsAcquired, "first")} in`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "pick-spender",
      group: "capital",
      title: "The Mortgage Broker",
      subtitle:
        "Deepest into next year's capital. Pays for today with tomorrow.",
      score: (p) => -p.picks.net,
      secondary: (p) => p.picks.firstsSpent,
      stat: (p) =>
        `${p.picks.net} net picks · ${plural(p.picks.firstsSpent, "first")} out`,
      qualifies: (p) => p.picks.net < 0,
    },
    {
      id: "deadline-buyer",
      group: "capital",
      title: "The Deadline Shopper",
      subtitle: "Most win-now buys made once the trade deadline was in sight.",
      score: (p) => p.deadline.buys,
      stat: (p) =>
        `${plural(p.deadline.buys, "deadline buy", "deadline buys")}`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "youth-acquirer",
      group: "taste",
      title: "The Kids' Table",
      subtitle:
        "Youngest average age of players brought in (min. 10 acquisitions).",
      score: (p) =>
        p.acquisitions.count >= MIN_ACQUISITIONS &&
        p.acquisitions.avgAge != null
          ? -p.acquisitions.avgAge
          : null,
      secondary: (p) => p.acquisitions.count,
      stat: (p) =>
        `avg age ${p.acquisitions.avgAge} · ${plural(p.acquisitions.count, "add")}`,
    },
    {
      id: "veteran-acquirer",
      group: "taste",
      title: "Name Brand Buyer",
      subtitle:
        "Oldest average age of players brought in. Pays for the résumé (min. 10).",
      score: (p) =>
        p.acquisitions.count >= MIN_ACQUISITIONS &&
        p.acquisitions.avgAge != null
          ? p.acquisitions.avgAge
          : null,
      secondary: (p) => p.acquisitions.count,
      stat: (p) =>
        `avg age ${p.acquisitions.avgAge} · ${plural(p.acquisitions.count, "add")}`,
    },
    {
      id: "panic-button",
      group: "taste",
      title: "Panic Button",
      subtitle:
        "Highest share of self-started trades made the week after a loss (min. 3).",
      score: (p) =>
        p.afterLoss && p.afterLoss.total >= 3
          ? p.afterLoss.afterLoss / p.afterLoss.total
          : null,
      secondary: (p) => p.afterLoss?.afterLoss ?? 0,
      stat: (p) =>
        p.afterLoss
          ? `${pct(p.afterLoss.afterLoss, p.afterLoss.total)}% post-loss · ${p.afterLoss.afterLoss}/${p.afterLoss.total}`
          : "-",
      qualifies: (_p, s) => s > 0.5,
    },
    {
      id: "waiver-churn",
      group: "margins",
      title: "Waiver Wire Gremlin",
      subtitle:
        "Most waiver claims and free-agent pickups. Never stops tinkering.",
      score: (p) => p.waivers + p.freeAgents,
      stat: (p) =>
        `${plural(p.waivers + p.freeAgents, "wire move")} · ${perSeason(p.waivers + p.freeAgents, p)}/season`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "faab-spender",
      group: "margins",
      title: "Big FAAB Energy",
      subtitle:
        "Highest average winning waiver bid. Never wins one by a dollar.",
      score: (p) => p.faabAggression,
      secondary: (p) => p.waivers,
      stat: (p) =>
        `${p.faabAggression} avg bid · ${plural(p.waivers, "claim")}`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "longest-hold",
      group: "margins",
      title: "The Tortoise",
      subtitle:
        "Longest average time between acquiring a player and letting him go.",
      score: (p) =>
        p.avgHoldingDays != null && p.totalTransactions >= 5
          ? p.avgHoldingDays
          : null,
      secondary: (p) => p.totalTransactions,
      stat: (p) => `${plural(p.avgHoldingDays ?? 0, "day")} avg hold`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "shortest-hold",
      group: "margins",
      title: "Hot Potato",
      subtitle: "Shortest average time holding a player before moving on.",
      score: (p) =>
        p.avgHoldingDays != null && p.totalTransactions >= 5
          ? -p.avgHoldingDays
          : null,
      secondary: (p) => p.totalTransactions,
      stat: (p) => `${plural(p.avgHoldingDays ?? 0, "day")} avg hold`,
    },
  ];
  const awards = [];
  const principalOf = (p) => principalOfProfile.get(p);
  for (const spec of perfSpecs) {
    const a = buildAward(
      rows,
      spec,
      (r) => r.p,
      (r) => r.principal,
    );
    if (a) awards.push(a);
  }
  for (const spec of specs) {
    const a = buildAward(profiles, spec, (p) => p, principalOf);
    if (a) awards.push(a);
  }
  const pairing = pairingAward(rows);
  if (pairing) awards.push(pairing);
  // Stable, group-ordered output.
  const groupRank = new Map(AWARD_GROUPS.map((g, i) => [g.id, i]));
  const specRank = new Map([...perfSpecs, ...specs].map((s, i) => [s.id, i]));
  return awards.sort(
    (a, b) =>
      (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99) ||
      (specRank.get(a.id) ?? 99) - (specRank.get(b.id) ?? 99),
  );
}
/**
 * Headline counts for the awards page. Cheap — reads the corpus directly.
 *
 * `managers` counts PRINCIPALS when the index is available, so a league where a team
 * changed hands honestly reports more managers than it has rosters.
 */
export function awardsSummary(h, principals) {
  let trades = 0;
  for (const t of h.transactions) if (t.type === "trade") trades++;
  const all = principals?.principals;
  return {
    seasons: h.chain.length,
    managers: all ? all.length : h.rosters.length,
    formerManagers: all ? all.filter((p) => p.isFormer).length : 0,
    trades,
    moves: h.transactions.length,
  };
}
/** Everything the awards page needs, in one await. */
export async function awardsPageData(h) {
  const principals = await getPrincipals(h);
  const [awards, metrics] = await Promise.all([
    computeAwards(h),
    performanceMetrics(h, principals),
  ]);
  return { awards, summary: awardsSummary(h, principals), metrics };
}
