/**
 * Roster & league analysis: value a roster, read its age curve, pick capital, and
 * contend/rebuild window. Provider-agnostic (works off history.players + rosters).
 */
import type { LeagueHistory } from "./history";
import { tierOf, valuePlayers, type ValueBreakdown } from "./valuation";
import { pickCapital, type PickCapital } from "./picks";

export interface ValuedPlayer {
  playerId: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  injuryStatus: string | null;
  value: number;
  tier: string;
  espnId: string | null;
}

export interface RosterAnalysis {
  rosterId: number;
  ownerName: string;
  teamName: string | null;
  valued: ValuedPlayer[];
  /** Players + picks. */
  totalValue: number;
  playerValue: number;
  picks: PickCapital;
  coreAge: number | null;
  byPosition: { pos: string; count: number; value: number }[];
  window: "rebuilding" | "balanced" | "win-now";
  record: { wins: number; losses: number };
}

const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];

export function analyzeRoster(h: LeagueHistory, rosterId: number): RosterAnalysis {
  const roster = h.rostersById.get(rosterId);
  const scoring = h.currentLeague.scoringSettings;
  const valuesMap: Map<string, ValueBreakdown> = valuePlayers(
    [...h.players.values()],
    scoring,
  );
  const valued: ValuedPlayer[] = (roster?.players ?? [])
    .map((pid) => {
      const p = h.players.get(pid);
      if (!p) return null;
      const v = valuesMap.get(pid)!;
      return {
        playerId: pid,
        name: p.fullName,
        team: p.team,
        position: p.position,
        age: p.age,
        injuryStatus: p.injuryStatus,
        value: v.value,
        tier: tierOf(v.value),
        espnId: p.espnId,
      };
    })
    .filter(Boolean) as ValuedPlayer[];
  valued.sort((a, b) => b.value - a.value);

  const playerValue = valued.reduce((s, v) => s + v.value, 0);
  const picks = pickCapital(h, rosterId);
  const totalValue = playerValue + picks.total;

  // Core age: value-weighted average of the top 8 by value.
  const top = valued.slice(0, 8).filter((v) => v.age != null);
  const wsum = top.reduce((s, v) => s + v.value, 0);
  const coreAge = wsum
    ? Math.round((top.reduce((s, v) => s + v.age! * v.value, 0) / wsum) * 10) / 10
    : null;

  // Positional strength.
  const posMap = new Map<string, { count: number; value: number }>();
  for (const v of valued) {
    const pos = v.position ?? "?";
    const cur = posMap.get(pos) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += v.value;
    posMap.set(pos, cur);
  }
  const byPosition = POS_ORDER.filter((p) => posMap.has(p)).map((pos) => ({
    pos,
    count: posMap.get(pos)!.count,
    value: posMap.get(pos)!.value,
  }));

  // Window read.
  let window: RosterAnalysis["window"] = "balanced";
  if (coreAge != null) {
    if (coreAge <= 25.5) window = "rebuilding";
    else if (coreAge >= 28.5) window = "win-now";
  }

  const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;

  return {
    rosterId,
    ownerName: user?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? null,
    valued,
    totalValue,
    playerValue,
    picks,
    coreAge,
    byPosition,
    window,
    record: { wins: roster?.settings.wins ?? 0, losses: roster?.settings.losses ?? 0 },
  };
}

/** Total roster value for every team, for league-wide ranking. */
export function leagueValueRanking(h: LeagueHistory): RosterAnalysis[] {
  return h.rosters
    .map((r) => analyzeRoster(h, r.rosterId))
    .sort((a, b) => b.totalValue - a.totalValue);
}
