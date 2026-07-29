/**
 * Provider selection. The app imports `getLeagueProvider()` and never a concrete
 * class, so swapping data sources is a one-line env change (LEAGUE_PROVIDER).
 * Defaults to `fixture` so a fresh clone runs with zero external dependencies.
 */
import type { LeagueProvider } from "./types";
import { FixtureProvider, FIXTURE_LEAGUE_ID } from "./fixture";
import { SleeperProvider } from "./sleeper";
import { CsvProvider } from "./csv";

export type ProviderName = "fixture" | "sleeper" | "csv";

export function providerName(): ProviderName {
  const v = (process.env.LEAGUE_PROVIDER ?? "fixture").toLowerCase();
  if (v === "sleeper" || v === "csv") return v;
  return "fixture";
}

export function getLeagueProvider(): LeagueProvider {
  switch (providerName()) {
    case "sleeper":
      return new SleeperProvider();
    case "csv":
      return CsvProvider.fromEnv();
    default:
      return new FixtureProvider();
  }
}

/**
 * The active league id for the current provider. For fixtures this is the
 * synthetic current-season league; for Sleeper/CSV it comes from env.
 */
export function activeLeagueId(): string {
  const name = providerName();
  if (name === "fixture") return FIXTURE_LEAGUE_ID;
  const id = process.env.SLEEPER_LEAGUE_ID;
  if (!id) {
    throw new Error(
      "SLEEPER_LEAGUE_ID is required when LEAGUE_PROVIDER is not 'fixture'.",
    );
  }
  return id;
}

export * from "./types";
