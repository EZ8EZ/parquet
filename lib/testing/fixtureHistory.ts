/**
 * Builds a LeagueHistory directly from the in-memory fixture corpus, with NO DB
 * dependency. Used by unit tests so the derivation engines can be exercised
 * purely and deterministically.
 */
import type { Annotation, HistoryMatchup, LeagueHistory } from "../history";
import {
  corpus,
  FIXTURE_LEAGUE_ID,
} from "../providers/fixture";
import { leagueIdFor, SEASONS } from "../providers/fixture/generate";
import type { Player } from "../providers/types";

export function buildFixtureHistory(
  annotations: Map<string, Annotation> = new Map(),
): LeagueHistory {
  const c = corpus();
  const currentLeague = c.leagues[FIXTURE_LEAGUE_ID];
  const chain = SEASONS.map((s) => c.leagues[leagueIdFor(s)]);

  const transactions = Object.values(c.transactions)
    .flat()
    .sort((a, b) => a.created - b.created);

  const matchups: HistoryMatchup[] = [];
  for (const s of SEASONS) {
    const id = leagueIdFor(s);
    for (const m of c.matchups[id] ?? []) matchups.push({ ...m, season: s });
  }

  const players = new Map<string, Player>(c.players.map((p) => [p.playerId, p]));
  const rosters = c.rosters[FIXTURE_LEAGUE_ID];

  return {
    provider: "fixture",
    currentLeague,
    chain,
    users: c.users,
    usersById: new Map(c.users.map((u) => [u.userId, u])),
    rosters,
    rostersById: new Map(rosters.map((r) => [r.rosterId, r])),
    players,
    transactions,
    tradedPicks: c.tradedPicks[FIXTURE_LEAGUE_ID],
    tradedPicksHistory: SEASONS.flatMap((s) => c.tradedPicks[leagueIdFor(s)] ?? []),
    matchups,
    annotations,
    me: {
      userId: "u1",
      rosterId: 1,
      displayName: "EZ8",
      teamName: "Parquet Kings",
    },
    currentSeasonYear: parseInt(currentLeague.season, 10),
  };
}

export function annotation(
  transactionId: string,
  reasoning: string,
  posture: string | null = null,
): Map<string, Annotation> {
  return new Map([
    [
      transactionId,
      {
        transactionId,
        reasoning,
        posture,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
  ]);
}
