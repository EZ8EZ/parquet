import { FixtureProvider, FIXTURE_LEAGUE_ID } from "./fixture";
import { SleeperProvider } from "./sleeper";
import { CsvProvider } from "./csv";
/** NSL Fantasy Hoops, 2026 season (resolved empirically - see API_NOTES.md). */
export const DEFAULT_SLEEPER_LEAGUE_ID = "1347007735815766016";
export const DEFAULT_SLEEPER_USERNAME = "EZ8";
export function providerName() {
  const v = (process.env.LEAGUE_PROVIDER ?? "sleeper").toLowerCase();
  if (v === "fixture" || v === "csv") return v;
  return "sleeper";
}
/** The Sleeper username whose roster is treated as "you" by default. */
export function defaultUsername() {
  return process.env.SLEEPER_USERNAME || DEFAULT_SLEEPER_USERNAME;
}
export function getLeagueProvider() {
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
 * The active league id. For fixtures this is the synthetic current-season league;
 * for Sleeper it comes from env, falling back to the committed default so a
 * zero-config deployment still serves the real league. CSV has no default.
 */
export function activeLeagueId() {
  const name = providerName();
  if (name === "fixture") return FIXTURE_LEAGUE_ID;
  if (name === "csv") {
    const id = process.env.SLEEPER_LEAGUE_ID;
    if (!id)
      throw new Error(
        "SLEEPER_LEAGUE_ID is required when LEAGUE_PROVIDER=csv.",
      );
    return id;
  }
  return process.env.SLEEPER_LEAGUE_ID || DEFAULT_SLEEPER_LEAGUE_ID;
}
export * from "./types";
