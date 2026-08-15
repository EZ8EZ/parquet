/**
 * Platform-agnostic domain model.
 *
 * The entire app depends ONLY on these types and the `LeagueProvider` /
 * `StatsProvider` interfaces — never on a concrete provider. Sleeper, CSV, and
 * fixture implementations all normalize into these shapes. Swapping providers is
 * a one-line change in `lib/providers/index.ts`.
 */
export {};
