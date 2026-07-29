/**
 * StatsProvider implementations. Stats are abstracted so a real source can
 * replace the fixture without touching the valuation model. Stats are ALWAYS
 * cached to the DB before use — never called from a render path.
 *
 * v1 valuation does NOT depend on stats (see DECISIONS.md D4); this interface
 * exists so a real source (balldontlie.io preferred) is a drop-in upgrade.
 */
import type { PlayerSeasonStats, StatsProvider } from "../types";
import { corpus } from "../fixture";

/**
 * Deterministically derives plausible per-season production from a player's
 * rank and age. Not real data — internally consistent for exercising the app.
 */
export class FixtureStatsProvider implements StatsProvider {
  readonly name = "fixture-stats";

  async getSeasonStats(season: string): Promise<PlayerSeasonStats[]> {
    const players = corpus().players;
    const yr = parseInt(season, 10);
    return players
      .filter((p) => (p.searchRank ?? 999) <= 180)
      .map((p) => {
        const rank = p.searchRank ?? 180;
        // Better rank -> more production. Age applies a gentle decline past 30.
        const base = Math.max(6, 34 - rank * 0.16);
        const ageAtSeason = (p.age ?? 25) - (2026 - yr);
        const ageFactor = ageAtSeason > 30 ? 1 - (ageAtSeason - 30) * 0.03 : 1;
        const scale = (n: number) => Math.round(n * ageFactor * 10) / 10;
        const pos = p.position ?? "SF";
        const bigMan = pos === "C" || pos === "PF";
        const guard = pos === "PG" || pos === "SG";
        return {
          playerId: p.playerId,
          season,
          gamesPlayed: 60 + (rank % 20),
          minutesPerGame: scale(Math.min(36, 20 + base * 0.4)),
          pts: scale(base),
          reb: scale(bigMan ? base * 0.5 : base * 0.22),
          ast: scale(guard ? base * 0.35 : base * 0.14),
          stl: scale(base * 0.05),
          blk: scale(bigMan ? base * 0.08 : base * 0.03),
          tov: scale(base * 0.12),
          tpm: scale(guard ? base * 0.09 : base * 0.04),
        };
      });
  }
}

/**
 * balldontlie.io adapter — documented stub. Free tier gives per-game/season
 * stats. Wire this behind BALLDONTLIE_API_KEY when Eric approves (QUESTIONS #4).
 * Left unimplemented in v1 to honor "never block": the fixture stats provider is
 * the default and the valuation model needs no stats at all.
 */
export class BallDontLieStatsProvider implements StatsProvider {
  readonly name = "balldontlie";
  async getSeasonStats(): Promise<PlayerSeasonStats[]> {
    throw new Error(
      "BallDontLieStatsProvider not configured for v1. Set BALLDONTLIE_API_KEY " +
        "and implement per API_NOTES; the fixture stats provider is the default.",
    );
  }
}

export function getStatsProvider(): StatsProvider {
  // Only the fixture source is wired in v1.
  return new FixtureStatsProvider();
}
