/**
 * Platform-agnostic domain model.
 *
 * The entire app depends ONLY on these types and the `LeagueProvider` /
 * `StatsProvider` interfaces — never on a concrete provider. Sleeper, CSV, and
 * fixture implementations all normalize into these shapes. Swapping providers is
 * a one-line change in `lib/providers/index.js`.
 *
 * JSDoc typedefs, not TypeScript interfaces (D63: TypeScript was removed from this
 * app deliberately). These are the same shapes the pre-D63 `types.ts` declared —
 * restored here as `checkJs`-visible JSDoc so the rest of `lib/` has something real
 * to import via `@typedef {import('./providers/types.js').X} X`, rather than every
 * consumer re-describing "the shape a Player has" from scratch.
 */

/** @typedef {"nba"} Sport */

/**
 * Sleeper transaction types. The common ones are trade / waiver / free_agent, but
 * the live API also emits others (e.g. "commissioner"). Kept as a widened string so
 * unknown types never break ingestion; consumers filter on the literals they care
 * about.
 * @typedef {string} TransactionType
 */

/**
 * @typedef {Object} User
 * @property {string} userId
 * @property {string} username
 * @property {string} displayName
 * @property {string|null} [avatar]
 */

/**
 * @typedef {Object} League
 * @property {string} leagueId
 * @property {string} name
 * @property {string} season
 * @property {string} sport
 * @property {string} status
 * @property {string|null} [previousLeagueId]
 * @property {number} totalRosters
 */

/**
 * @typedef {League & {
 *   rosterPositions: string[],
 *   scoringSettings: Record<string, number>,
 *   settings: Record<string, number>,
 * }} LeagueDetail
 */

/**
 * @typedef {Object} RosterSettings
 * @property {number} wins
 * @property {number} losses
 * @property {number} ties
 * @property {number} fpts fantasy points scored (already includes the .decimal component)
 * @property {number} fptsAgainst
 * @property {number} ppts potential points (max if optimal lineup) — a "manager efficiency" signal
 * @property {number} waiverBudgetUsed
 * @property {number} waiverPosition
 * @property {number} totalMoves
 */

/**
 * @typedef {Object} Roster
 * @property {number} rosterId
 * @property {string|null} ownerId
 * @property {string[]} coOwners
 * @property {string[]} players Sleeper player_id strings
 * @property {string[]} starters
 * @property {string[]} reserve
 * @property {string[]} taxi
 * @property {RosterSettings} settings
 */

/**
 * @typedef {Object} LeagueUser
 * @property {string} userId
 * @property {string} displayName
 * @property {string|null} [avatar] Sleeper user-avatar id
 * @property {string|null} [teamName]
 * @property {string|null} [teamLogoUrl] Full URL, from `metadata.avatar`
 * @property {boolean} isOwner
 * @property {boolean} isBot
 */

/**
 * A draft pick as referenced inside a transaction or the traded-picks snapshot.
 * @typedef {Object} DraftPickRef
 * @property {number} round
 * @property {string} season
 * @property {number} rosterId the roster the pick originally belongs to
 * @property {number} ownerId who owns the pick after the referencing event
 * @property {number} previousOwnerId who owned it before
 */

/**
 * @typedef {Object} Transaction
 * @property {string} transactionId
 * @property {TransactionType} type
 * @property {string} status
 * @property {string} season the league season this transaction belongs to (added during ingest)
 * @property {number} week Sleeper "leg" — the week within the season
 * @property {number} created ms epoch
 * @property {number} statusUpdated ms epoch
 * @property {string|null} creator user_id that initiated the transaction
 * @property {number[]} rosterIds roster_ids involved
 * @property {number[]} consenterIds roster_ids that consented (both sides of a trade)
 * @property {Record<string, number>} adds player_id -> roster_id receiving
 * @property {Record<string, number>} drops player_id -> roster_id dropping
 * @property {DraftPickRef[]} draftPicks
 * @property {number|null} [waiverBid] FAAB bid for waiver claims, if any
 */

/**
 * @typedef {Object} TradedPick
 * @property {number} round
 * @property {string} season
 * @property {number} rosterId
 * @property {number} ownerId
 * @property {number} previousOwnerId
 */

/**
 * @typedef {Object} Matchup
 * @property {number} rosterId
 * @property {number|null} matchupId
 * @property {number} points
 * @property {number} week
 */

/**
 * @typedef {Object} Player
 * @property {string} playerId
 * @property {string} fullName
 * @property {string} firstName
 * @property {string} lastName
 * @property {string|null} team
 * @property {string|null} position
 * @property {string[]} fantasyPositions
 * @property {number|null} age
 * @property {number|null} yearsExp
 * @property {string|null} birthDate
 * @property {string|null} injuryStatus Sleeper `injury_status` (DTD / Out / IR in live NBA data)
 * @property {string|null} injuryBodyPart Sleeper `injury_body_part`, e.g. "Knee"
 * @property {string|null} injuryNotes Sleeper `injury_notes`, e.g. "Surgery"
 * @property {string|null} depthChartPosition Sleeper `depth_chart_position` - the position `depthChartOrder` is an order WITHIN, and the field that makes the order mean anything. Not always equal to `position`
 * @property {number|null} depthChartOrder Sleeper `depth_chart_order`. NON-CONTIGUOUS and occasionally DUPLICATED in live data, so it is something to sort by, never something to index by (see lib/depth)
 * @property {number|null} newsUpdated Sleeper `news_updated`, ms epoch. The age of the RECORD, not of the depth chart
 * @property {string|null} status
 * @property {number|null} number
 * @property {number|null} searchRank Sleeper's consensus-ish rank; lower = better
 * @property {string|null} espnId
 */

/**
 * @typedef {"winners"|"losers"} BracketKind
 */

/**
 * One game in a playoff bracket. Sleeper's shape, normalised.
 * @typedef {Object} BracketGame
 * @property {number} matchId match id within the bracket
 * @property {number} round round number, 1-based
 * @property {number|null} placement the place this game decides (1 = championship); null if it only advances teams
 * @property {number|null} team1 roster id, or null while the bracket is still filling in
 * @property {number|null} team2
 * @property {number|null} winner
 * @property {number|null} loser
 */

/**
 * A draft (one per league season). `slotToRosterId` is load-bearing for pick
 * lineage — see API_NOTES "Drafts".
 * @typedef {Object} DraftMeta
 * @property {string} draftId
 * @property {string} leagueId
 * @property {string} season
 * @property {string} sport
 * @property {string} status "pre_draft" | "drafting" | "complete" (widened)
 * @property {string} type "linear" | "snake" | "auction" (widened)
 * @property {number} rounds
 * @property {number} teams
 * @property {number|null} startTime ms epoch, or null when unscheduled
 * @property {number|null} created
 * @property {Record<number, number>} slotToRosterId draft slot -> the roster that ORIGINALLY owns that slot
 * @property {Record<string, number>} draftOrder user_id -> draft slot
 */

/**
 * A pick that was ACTUALLY MADE in a draft — distinct from `DraftPickRef`, which is
 * a *tradeable* future pick.
 * @typedef {Object} DraftPick
 * @property {string} draftId
 * @property {number} pickNo overall pick number, 1-based — AUTHORITATIVE for ordering
 * @property {number} round
 * @property {number} draftSlot
 * @property {number|null} rosterId the roster that actually made the pick
 * @property {string|null} pickedBy user_id of whoever made the pick
 * @property {string|null} playerId
 * @property {boolean} isKeeper
 * @property {string|null} playerName denormalized on the pick itself
 * @property {string|null} position
 * @property {string|null} team
 */

/**
 * Per-season production line for a player. Provider-agnostic.
 * @typedef {Object} PlayerSeasonStats
 * @property {string} playerId
 * @property {string} season
 * @property {number} gamesPlayed
 * @property {number} minutesPerGame
 * @property {number} pts
 * @property {number} reb
 * @property {number} ast
 * @property {number} stl
 * @property {number} blk
 * @property {number} tov
 * @property {number} tpm
 */

/**
 * The provider contract. Every method returns normalized domain types.
 * Implementations: SleeperProvider (real), CsvProvider (import), FixtureProvider
 * (synthetic, built first, the default).
 * @typedef {Object} LeagueProvider
 * @property {string} name
 * @property {(username: string) => Promise<User>} getUser
 * @property {(userId: string, sport: string, season: string) => Promise<League[]>} getLeagues
 * @property {(leagueId: string) => Promise<LeagueDetail>} getLeague
 * @property {(leagueId: string) => Promise<Roster[]>} getRosters
 * @property {(leagueId: string) => Promise<LeagueUser[]>} getUsers
 * @property {(leagueId: string, week: number) => Promise<Transaction[]>} getTransactions
 * @property {(leagueId: string, week: number, season: string) => Promise<Transaction[]>} [getTransactionsForSeason] Optional efficient variant: stamps season without re-fetching the league
 * @property {(leagueId: string, week: number) => Promise<Matchup[]>} getMatchups
 * @property {(leagueId: string) => Promise<TradedPick[]>} getTradedPicks
 * @property {() => Promise<Player[]>} getPlayers
 * @property {(leagueId: string) => Promise<DraftMeta[]>} [getDrafts] Optional; callers must treat undefined as "no draft data"
 * @property {(draftId: string) => Promise<DraftPick[]>} [getDraftPicks] Optional, same reason as getDrafts
 * @property {(leagueId: string, kind: BracketKind) => Promise<BracketGame[]>} [getBracket] Optional; undefined means "no decided champion on record"
 */

/**
 * Stats are abstracted so a real external source can replace the fixture without
 * touching the valuation model.
 *
 * FORWARD DECLARATION ONLY — nothing in the app implements or consumes this today
 * (see SHELVED.md S5). Kept because it is the shape D4 committed to.
 * @typedef {Object} StatsProvider
 * @property {string} name
 * @property {(season: string) => Promise<PlayerSeasonStats[]>} getSeasonStats
 */

export {};
