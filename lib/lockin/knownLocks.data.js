// Locks Sleeper's public API does not expose, recorded by hand. Written by
// scripts/lockin/mark-locks.mjs; see lib/lockin/knownLocks.js and D139.
// Each entry: { leagueId, season, week, rosterId, playerId, name, score, recordedAt }.
export const KNOWN_LOCKS = [];
