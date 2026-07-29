/**
 * Human-readable transaction descriptions. Shared by the ledger UI, the strategy
 * engine's contradiction narratives, and the analyst's prompt corpus.
 */
import type { LeagueHistory } from "../history";
import type { DraftPickRef, Transaction } from "../providers/types";

export function playerName(h: LeagueHistory, pid: string): string {
  return h.players.get(pid)?.fullName ?? `Player ${pid}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function pickLabel(dp: DraftPickRef): string {
  return `${dp.season} ${ordinal(dp.round)}`;
}

export function rosterName(h: LeagueHistory, rosterId: number): string {
  const r = h.rostersById.get(rosterId);
  const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  return u?.teamName || u?.displayName || `Roster ${rosterId}`;
}

export interface TradeSide {
  got: string[];
  gave: string[];
  gotPicks: string[];
  gavePicks: string[];
}

/** What a given roster received and sent in a trade. */
export function tradeSide(
  h: LeagueHistory,
  t: Transaction,
  rosterId: number,
): TradeSide {
  const got: string[] = [];
  const gave: string[] = [];
  for (const [pid, rid] of Object.entries(t.adds)) {
    if (rid === rosterId) got.push(playerName(h, pid));
  }
  for (const [pid, rid] of Object.entries(t.drops)) {
    if (rid === rosterId) gave.push(playerName(h, pid));
  }
  const gotPicks: string[] = [];
  const gavePicks: string[] = [];
  for (const dp of t.draftPicks) {
    if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId)
      gotPicks.push(pickLabel(dp));
    else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId)
      gavePicks.push(pickLabel(dp));
  }
  return { got, gave, gotPicks, gavePicks };
}

function joinAssets(players: string[], picks: string[]): string {
  const parts = [...players];
  if (picks.length) parts.push(...picks.map((p) => `the ${p}`));
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** One-line summary of a trade from a roster's perspective. */
export function describeTradeForRoster(
  h: LeagueHistory,
  t: Transaction,
  rosterId: number,
): string {
  const s = tradeSide(h, t, rosterId);
  const got = joinAssets(s.got, s.gotPicks);
  const gave = joinAssets(s.gave, s.gavePicks);
  return `acquired ${got} for ${gave}`;
}

/** Neutral, perspective-free summary (for the ledger list and analyst corpus). */
export function describeTransaction(h: LeagueHistory, t: Transaction): string {
  if (t.type === "trade") {
    const rosters = t.rosterIds;
    const parts = rosters.map((rid) => {
      const s = tradeSide(h, t, rid);
      const sent = joinAssets(s.gave, s.gavePicks);
      return `${rosterName(h, rid)} sent ${sent}`;
    });
    return `Trade - ${parts.join("; ")}`;
  }
  const adds = Object.keys(t.adds).map((pid) => playerName(h, pid));
  const drops = Object.keys(t.drops).map((pid) => playerName(h, pid));
  const who = t.rosterIds[0] != null ? rosterName(h, t.rosterIds[0]) : "A manager";
  const verb = t.type === "waiver" ? "claimed" : "added";
  const bid = t.waiverBid ? ` ($${t.waiverBid})` : "";
  const dropStr = drops.length ? `, dropped ${drops.join(", ")}` : "";
  return `${who} ${verb} ${adds.join(", ") || "-"}${bid}${dropStr}`;
}

export function seasonYear(season: string): number {
  return parseInt(season, 10);
}
