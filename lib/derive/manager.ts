/**
 * Per-manager behavioral derivation from transaction history.
 *
 * This is the analytical core shared by the revealed-strategy engine (applied to
 * "you") and the manager dossiers (applied to everyone else). It reads ONLY
 * behavior — what a manager did — never roster contents.
 */
import type { LeagueHistory } from "../history";
import type { Transaction } from "../providers/types";

export interface SeasonCount {
  season: string;
  count: number;
}
export interface TradePartner {
  rosterId: number;
  displayName: string;
  count: number;
}
export interface AgeBySeason {
  season: string;
  avgAge: number;
  count: number;
}
export interface HoldingBand {
  band: string;
  avgDays: number;
  n: number;
}
export interface PostureSeason {
  season: string;
  posture: "rebuilding" | "contending" | "balanced";
  score: number;
}

export interface ManagerProfile {
  rosterId: number;
  userId: string | null;
  displayName: string;
  teamName: string | null;
  totalTransactions: number;
  trades: number;
  waivers: number;
  freeAgents: number;
  tradesInitiated: number;
  tradesResponded: number;
  tradesBySeason: SeasonCount[];
  tradePartners: TradePartner[];
  acquisitions: { count: number; avgAge: number | null; ageBySeason: AgeBySeason[] };
  disposals: { count: number; avgAge: number | null };
  picks: {
    acquired: number;
    spent: number;
    net: number;
    firstsAcquired: number;
    firstsSpent: number;
  };
  avgHoldingDays: number | null;
  holdingByAgeBand: HoldingBand[];
  afterLoss: { afterLoss: number; afterWin: number; total: number } | null;
  deadline: { buys: number; sells: number };
  postureBySeason: PostureSeason[];
  faabAggression: number | null;
  overpaysForAge: boolean;
}

const DAY = 86_400_000;

function ageBand(age: number | null): string {
  if (age == null) return "unknown";
  if (age < 23) return "under 23";
  if (age < 27) return "23–26";
  if (age < 31) return "27–30";
  return "31+";
}

/** Build a season|week -> rosterId -> 'W'|'L' result index from matchups. */
function resultIndex(h: LeagueHistory): Map<string, "W" | "L"> {
  const groups = new Map<string, { rosterId: number; points: number }[]>();
  for (const m of h.matchups) {
    if (m.matchupId == null) continue;
    const key = `${m.season}|${m.week}|${m.matchupId}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({
      rosterId: m.rosterId,
      points: m.points,
    });
  }
  const out = new Map<string, "W" | "L">();
  for (const [key, pair] of groups) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const [season, week] = key.split("|");
    const aWon = a.points >= b.points;
    out.set(`${season}|${week}|${a.rosterId}`, aWon ? "W" : "L");
    out.set(`${season}|${week}|${b.rosterId}`, aWon ? "L" : "W");
  }
  return out;
}

function seasonYear(season: string): number {
  return parseInt(season, 10);
}

export function deriveManagerProfile(
  h: LeagueHistory,
  rosterId: number,
): ManagerProfile {
  const roster = h.rostersById.get(rosterId);
  const userId = roster?.ownerId ?? null;
  const user = userId ? h.usersById.get(userId) : undefined;
  const results = resultIndex(h);

  const mine = h.transactions.filter((t) => involves(t, rosterId));
  const trades = mine.filter((t) => t.type === "trade");
  const waivers = mine.filter((t) => t.type === "waiver");
  const freeAgents = mine.filter((t) => t.type === "free_agent");

  // Initiate vs respond (creator is a userId).
  let tradesInitiated = 0;
  for (const t of trades) if (userId && t.creator === userId) tradesInitiated++;
  const tradesResponded = trades.length - tradesInitiated;

  // Trades by season.
  const tradesBySeason = countBySeason(trades);

  // Trade partners.
  const partnerCounts = new Map<number, number>();
  for (const t of trades) {
    for (const rid of t.rosterIds) {
      if (rid !== rosterId) partnerCounts.set(rid, (partnerCounts.get(rid) ?? 0) + 1);
    }
  }
  const tradePartners: TradePartner[] = [...partnerCounts.entries()]
    .map(([rid, count]) => ({
      rosterId: rid,
      displayName: nameForRoster(h, rid),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Acquisitions / disposals with age-at-event.
  const acqAges: number[] = [];
  const acqAgeBySeasonMap = new Map<string, number[]>();
  const dispAges: number[] = [];
  let overAgeAcquisitions = 0;
  for (const t of mine) {
    const yr = seasonYear(t.season);
    for (const [pid, rid] of Object.entries(t.adds)) {
      if (rid !== rosterId) continue;
      const age = ageAtSeason(h, pid, yr);
      if (age != null) {
        acqAges.push(age);
        (acqAgeBySeasonMap.get(t.season) ?? acqAgeBySeasonMap.set(t.season, []).get(t.season)!).push(age);
        if (t.type === "trade" && age >= 30) overAgeAcquisitions++;
      }
    }
    for (const [pid, rid] of Object.entries(t.drops)) {
      if (rid !== rosterId) continue;
      const age = ageAtSeason(h, pid, yr);
      if (age != null) dispAges.push(age);
    }
  }
  const ageBySeason: AgeBySeason[] = [...acqAgeBySeasonMap.entries()]
    .map(([season, ages]) => ({ season, avgAge: avg(ages)!, count: ages.length }))
    .sort((a, b) => a.season.localeCompare(b.season));

  // Pick flow.
  let acquired = 0, spent = 0, firstsAcquired = 0, firstsSpent = 0;
  for (const t of trades) {
    for (const dp of t.draftPicks) {
      if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId) {
        acquired++;
        if (dp.round === 1) firstsAcquired++;
      } else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId) {
        spent++;
        if (dp.round === 1) firstsSpent++;
      }
    }
  }

  // Holding period (pair adds -> subsequent drops for this roster).
  const holding = computeHolding(h, rosterId);

  // After-loss vs after-win (trades initiated by this manager).
  let afterLoss: ManagerProfile["afterLoss"] = null;
  if (h.matchups.length) {
    let al = 0, aw = 0, tot = 0;
    for (const t of trades) {
      if (userId && t.creator !== userId) continue; // only self-initiated
      if (t.week <= 1) continue;
      const prev = results.get(`${t.season}|${t.week - 1}|${rosterId}`);
      if (prev === "L") { al++; tot++; }
      else if (prev === "W") { aw++; tot++; }
    }
    afterLoss = { afterLoss: al, afterWin: aw, total: tot };
  }

  // Deadline behavior (weeks >= 16 = around the trade deadline).
  let buys = 0, sells = 0;
  for (const t of trades) {
    if (t.week < 16) continue;
    const picksOut = t.draftPicks.filter((d) => d.previousOwnerId === rosterId).length;
    const picksIn = t.draftPicks.filter((d) => d.ownerId === rosterId && d.previousOwnerId !== rosterId).length;
    if (picksOut > picksIn) buys++;
    else if (picksIn > picksOut) sells++;
  }

  // Revealed posture by season.
  const postureBySeason = derivePosture(h, rosterId, trades);

  // FAAB aggression.
  const bids = waivers.map((t) => t.waiverBid ?? 0).filter((b) => b > 0);
  const faabAggression = bids.length ? avg(bids) : null;

  return {
    rosterId,
    userId,
    displayName: user?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? null,
    totalTransactions: mine.length,
    trades: trades.length,
    waivers: waivers.length,
    freeAgents: freeAgents.length,
    tradesInitiated,
    tradesResponded,
    tradesBySeason,
    tradePartners,
    acquisitions: { count: acqAges.length, avgAge: avg(acqAges), ageBySeason },
    disposals: { count: dispAges.length, avgAge: avg(dispAges) },
    picks: { acquired, spent, net: acquired - spent, firstsAcquired, firstsSpent },
    avgHoldingDays: holding.avgDays,
    holdingByAgeBand: holding.byBand,
    afterLoss,
    deadline: { buys, sells },
    postureBySeason,
    faabAggression: faabAggression != null ? Math.round(faabAggression) : null,
    overpaysForAge: overAgeAcquisitions >= 3,
  };
}

function derivePosture(
  h: LeagueHistory,
  rosterId: number,
  trades: Transaction[],
): PostureSeason[] {
  const bySeason = new Map<string, Transaction[]>();
  for (const t of trades) {
    (bySeason.get(t.season) ?? bySeason.set(t.season, []).get(t.season)!).push(t);
  }
  const out: PostureSeason[] = [];
  for (const [season, ts] of bySeason) {
    const yr = seasonYear(season);
    let pickNet = 0;
    const acqAges: number[] = [];
    const dispAges: number[] = [];
    for (const t of ts) {
      for (const dp of t.draftPicks) {
        const w = dp.round === 1 ? 2 : 1;
        if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId) pickNet += w;
        else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId) pickNet -= w;
      }
      for (const [pid, rid] of Object.entries(t.adds)) {
        if (rid === rosterId) { const a = ageAtSeason(h, pid, yr); if (a != null) acqAges.push(a); }
      }
      for (const [pid, rid] of Object.entries(t.drops)) {
        if (rid === rosterId) { const a = ageAtSeason(h, pid, yr); if (a != null) dispAges.push(a); }
      }
    }
    const ageBalance = (avg(acqAges) ?? 0) - (avg(dispAges) ?? 0); // <0 = getting younger
    const score = pickNet - ageBalance * 0.35;
    const posture: PostureSeason["posture"] =
      score > 1.2 ? "rebuilding" : score < -1.2 ? "contending" : "balanced";
    out.push({ season, posture, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => a.season.localeCompare(b.season));
}

function computeHolding(h: LeagueHistory, rosterId: number) {
  const acquiredAt = new Map<string, number>();
  const spans: { days: number; band: string }[] = [];
  for (const t of h.transactions) {
    if (!involves(t, rosterId)) continue;
    for (const [pid, rid] of Object.entries(t.adds)) {
      if (rid === rosterId && !acquiredAt.has(pid)) acquiredAt.set(pid, t.created);
    }
    for (const [pid, rid] of Object.entries(t.drops)) {
      if (rid === rosterId && acquiredAt.has(pid)) {
        const start = acquiredAt.get(pid)!;
        const days = Math.max(0, (t.created - start) / DAY);
        spans.push({ days, band: ageBand(ageAtSeason(h, pid, seasonYear(t.season))) });
        acquiredAt.delete(pid);
      }
    }
  }
  const avgDays = spans.length ? Math.round(avg(spans.map((s) => s.days))!) : null;
  const byBandMap = new Map<string, number[]>();
  for (const s of spans) {
    (byBandMap.get(s.band) ?? byBandMap.set(s.band, []).get(s.band)!).push(s.days);
  }
  const byBand: HoldingBand[] = [...byBandMap.entries()].map(([band, ds]) => ({
    band,
    avgDays: Math.round(avg(ds)!),
    n: ds.length,
  }));
  return { avgDays, byBand };
}

// ---- small helpers ----
export function involves(t: Transaction, rosterId: number): boolean {
  if (t.rosterIds.includes(rosterId)) return true;
  for (const rid of Object.values(t.adds)) if (rid === rosterId) return true;
  for (const rid of Object.values(t.drops)) if (rid === rosterId) return true;
  return false;
}

function countBySeason(ts: Transaction[]): SeasonCount[] {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t.season, (m.get(t.season) ?? 0) + 1);
  return [...m.entries()]
    .map(([season, count]) => ({ season, count }))
    .sort((a, b) => a.season.localeCompare(b.season));
}

export function ageAtSeason(
  h: LeagueHistory,
  playerId: string,
  seasonYr: number,
): number | null {
  const p = h.players.get(playerId);
  if (!p || p.age == null) return null;
  return p.age - (h.currentSeasonYear - seasonYr);
}

function nameForRoster(h: LeagueHistory, rosterId: number): string {
  const r = h.rostersById.get(rosterId);
  const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  return u?.displayName ?? `Roster ${rosterId}`;
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10;
}
