/**
 * The committed league defaults, with no imports, so plain-node scripts
 * (scripts/snapshot-lineups.js) can read the same id the app uses without loading the
 * providers (which pull in Next and Zod). Re-exported from ./index.js.
 */
/** NSL Fantasy Hoops, 2026 season (resolved empirically - see API_NOTES.md). */
export const DEFAULT_SLEEPER_LEAGUE_ID = "1347007735815766016";
export const DEFAULT_SLEEPER_USERNAME = "EZ8";
