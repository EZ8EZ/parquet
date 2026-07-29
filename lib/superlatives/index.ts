/**
 * League awards — superlatives derived across every manager.
 *
 * This is a *presentation* layer over `deriveManagerProfile`: it re-uses the
 * behavioral metrics that already exist and only ranks them. No new data
 * sources, no re-derivation, no randomness — the same corpus always produces
 * the same awards, and ties break on the lowest rosterId.
 *
 * Every award is either won by a real manager on real data, or omitted. An
 * award with nothing behind it (no FAAB in the league, no matchups loaded, no
 * one net-negative on picks) simply does not appear.
 */
import { deriveManagerProfile, type ManagerProfile } from "../derive/manager";
import type { LeagueHistory } from "../history";

/** Editorial grouping so the page can section the awards. */
export type AwardGroup = "trade-desk" | "capital" | "taste" | "margins";

export const AWARD_GROUPS: { id: AwardGroup; label: string }[] = [
  { id: "trade-desk", label: "At the trade desk" },
  { id: "capital", label: "Draft capital" },
  { id: "taste", label: "Taste and timing" },
  { id: "margins", label: "Working the margins" },
];

export interface AwardEntrant {
  rosterId: number;
  displayName: string;
  teamName: string | null;
  /** What to print — team name, or "A + B" for a two-team award. */
  label: string;
  /** The number that earned the placing, already formatted. */
  stat: string;
  /** Raw score, higher = better placing. Useful for tests. */
  value: number;
  /** Second team on a pairing award. */
  partnerRosterId?: number;
  partnerLabel?: string;
}

export interface Award {
  id: string;
  group: AwardGroup;
  title: string;
  subtitle: string;
  winner: AwardEntrant;
  /** The winning number, e.g. "36 trades · 7.2/season". */
  statLine: string;
  runnersUp: AwardEntrant[];
}

export interface AwardsSummary {
  seasons: number;
  managers: number;
  trades: number;
  moves: number;
}

// ---------------------------------------------------------------- helpers

/**
 * Age-skew awards need a real sample — a manager with a handful of adds can
 * post an extreme average by accident.
 */
const MIN_ACQUISITIONS = 10;

function labelFor(p: ManagerProfile): string {
  return p.teamName ?? p.displayName;
}

function entrant(p: ManagerProfile, stat: string, value: number): AwardEntrant {
  return {
    rosterId: p.rosterId,
    displayName: p.displayName,
    teamName: p.teamName,
    label: labelFor(p),
    stat,
    // Normalise -0 (a negated zero score) so values compare and serialise cleanly.
    value: value === 0 ? 0 : value,
  };
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

interface AwardSpec {
  id: string;
  group: AwardGroup;
  title: string;
  subtitle: string;
  /** Higher always wins. Return null to make the manager ineligible. */
  score: (p: ManagerProfile) => number | null;
  /** Higher wins, applied only on exact score ties. */
  secondary?: (p: ManagerProfile) => number;
  stat: (p: ManagerProfile) => string;
  /** Minimum eligible field for the award to mean anything. Default 2. */
  minEntrants?: number;
  /** Final sanity gate on the winner — e.g. "must actually be net-negative". */
  qualifies?: (winner: ManagerProfile, score: number) => boolean;
}

function buildAward(profiles: ManagerProfile[], spec: AwardSpec): Award | null {
  const rows: { p: ManagerProfile; s: number }[] = [];
  for (const p of profiles) {
    const s = spec.score(p);
    if (s == null || !Number.isFinite(s)) continue;
    rows.push({ p, s });
  }
  if (rows.length < (spec.minEntrants ?? 2)) return null;

  const second = spec.secondary ?? (() => 0);
  rows.sort(
    (a, b) =>
      b.s - a.s || second(b.p) - second(a.p) || a.p.rosterId - b.p.rosterId,
  );

  const top = rows[0];
  if (spec.qualifies && !spec.qualifies(top.p, top.s)) return null;

  return {
    id: spec.id,
    group: spec.group,
    title: spec.title,
    subtitle: spec.subtitle,
    winner: entrant(top.p, spec.stat(top.p), top.s),
    statLine: spec.stat(top.p),
    runnersUp: rows.slice(1, 4).map((r) => entrant(r.p, spec.stat(r.p), r.s)),
  };
}

/** Most-frequent trade pairing — a two-team award, so it is built by hand. */
function pairingAward(profiles: ManagerProfile[]): Award | null {
  const byRoster = new Map(profiles.map((p) => [p.rosterId, p]));
  const pairs = new Map<string, { a: number; b: number; count: number }>();
  for (const p of profiles) {
    for (const partner of p.tradePartners) {
      if (!byRoster.has(partner.rosterId)) continue;
      const a = Math.min(p.rosterId, partner.rosterId);
      const b = Math.max(p.rosterId, partner.rosterId);
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
    .sort((x, y) => y.count - x.count || x.a - y.a || x.b - y.b);
  if (ranked.length < 2) return null;

  const toEntrant = (x: { a: number; b: number; count: number }): AwardEntrant => {
    const pa = byRoster.get(x.a)!;
    const pb = byRoster.get(x.b)!;
    return {
      rosterId: pa.rosterId,
      displayName: pa.displayName,
      teamName: pa.teamName,
      label: `${labelFor(pa)} + ${labelFor(pb)}`,
      stat: `${plural(x.count, "trade")} together`,
      value: x.count,
      partnerRosterId: pb.rosterId,
      partnerLabel: labelFor(pb),
    };
  };

  const winner = toEntrant(ranked[0]);
  return {
    id: "trade-pairing",
    group: "trade-desk",
    title: "Best Friends Forever",
    subtitle: "The two managers who deal with each other more than anyone else.",
    winner,
    statLine: winner.stat,
    runnersUp: ranked.slice(1, 4).map(toEntrant),
  };
}

// ---------------------------------------------------------------- the awards

export function computeAwards(h: LeagueHistory): Award[] {
  const seasons = Math.max(1, h.chain.length);
  const profiles = h.rosters
    .map((r) => deriveManagerProfile(h, r.rosterId))
    .sort((a, b) => a.rosterId - b.rosterId);

  const perSeason = (n: number) => Math.round((n / seasons) * 10) / 10;

  const specs: AwardSpec[] = [
    {
      id: "most-trades",
      group: "trade-desk",
      title: "The Wheeler-Dealer",
      subtitle: "Most completed trades across the league's recorded history.",
      score: (p) => p.trades,
      stat: (p) => `${plural(p.trades, "trade")} · ${perSeason(p.trades)}/season`,
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
      subtitle: "Deepest into next year's capital. Pays for today with tomorrow.",
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
      stat: (p) => `${plural(p.deadline.buys, "deadline buy", "deadline buys")}`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "youth-acquirer",
      group: "taste",
      title: "The Kids' Table",
      subtitle:
        "Youngest average age of players brought in (min. 10 acquisitions).",
      score: (p) =>
        p.acquisitions.count >= MIN_ACQUISITIONS && p.acquisitions.avgAge != null
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
        p.acquisitions.count >= MIN_ACQUISITIONS && p.acquisitions.avgAge != null
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
      subtitle: "Most waiver claims and free-agent pickups. Never stops tinkering.",
      score: (p) => p.waivers + p.freeAgents,
      stat: (p) =>
        `${plural(p.waivers + p.freeAgents, "wire move")} · ${perSeason(p.waivers + p.freeAgents)}/season`,
      qualifies: (_p, s) => s > 0,
    },
    {
      id: "faab-spender",
      group: "margins",
      title: "Big FAAB Energy",
      subtitle: "Highest average winning waiver bid. Never wins one by a dollar.",
      score: (p) => p.faabAggression,
      secondary: (p) => p.waivers,
      stat: (p) => `${p.faabAggression} avg bid · ${plural(p.waivers, "claim")}`,
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

  const awards: Award[] = [];
  for (const spec of specs) {
    const a = buildAward(profiles, spec);
    if (a) awards.push(a);
  }
  const pairing = pairingAward(profiles);
  if (pairing) awards.push(pairing);

  // Stable, group-ordered output.
  const groupRank = new Map(AWARD_GROUPS.map((g, i) => [g.id, i]));
  const specRank = new Map(specs.map((s, i) => [s.id, i]));
  return awards.sort(
    (a, b) =>
      (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99) ||
      (specRank.get(a.id) ?? 99) - (specRank.get(b.id) ?? 99),
  );
}

/** Headline counts for the awards page. Cheap — reads the corpus directly. */
export function awardsSummary(h: LeagueHistory): AwardsSummary {
  let trades = 0;
  for (const t of h.transactions) if (t.type === "trade") trades++;
  return {
    seasons: h.chain.length,
    managers: h.rosters.length,
    trades,
    moves: h.transactions.length,
  };
}
