/**
 * Builds a LeagueHistory directly from the in-memory fixture corpus, with NO DB
 * dependency. Used by unit tests so the derivation engines can be exercised
 * purely and deterministically.
 */
import { annotationKey } from "../history";
import { corpus, FIXTURE_LEAGUE_ID } from "../providers/fixture";
import { leagueIdFor, SEASONS } from "../providers/fixture/generate";
export function buildFixtureHistory(annotations = new Map()) {
  const c = corpus();
  const currentLeague = c.leagues[FIXTURE_LEAGUE_ID];
  const chain = SEASONS.map((s) => c.leagues[leagueIdFor(s)]);
  const transactions = Object.values(c.transactions)
    .flat()
    .sort((a, b) => a.created - b.created);
  const matchups = [];
  const brackets = new Map();
  for (const s of SEASONS) {
    const id = leagueIdFor(s);
    for (const m of c.matchups[id] ?? []) matchups.push({ ...m, season: s });
    const games = c.brackets[id] ?? [];
    if (games.length) brackets.set(s, games);
  }
  const players = new Map(c.players.map((p) => [p.playerId, p]));
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
    tradedPicksHistory: SEASONS.flatMap(
      (s) => c.tradedPicks[leagueIdFor(s)] ?? [],
    ),
    matchups,
    brackets,
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
/**
 * Builds a one-entry annotations map, authored by `ownerId` (default "u1" — the
 * fixture's own EZ8 seat, `buildFixtureHistory`'s default `me`). Pass a different
 * ownerId to simulate a leaguemate's own captured reasoning on a shared trade.
 */
export function annotation(
  transactionId,
  reasoning,
  posture = null,
  ownerId = "u1",
) {
  return new Map([
    [
      annotationKey(transactionId, ownerId),
      {
        transactionId,
        ownerId,
        reasoning,
        posture,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
  ]);
}
