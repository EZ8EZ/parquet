/**
 * Roster crunch: who is over the roster limit after the rookie draft, how
 * much of that overage the taxi squad can absorb, and who is therefore likely
 * to be released.
 *
 * This module only counts. Sleeper enforces roster limits itself (an
 * over-limit team is blocked from setting a lineup / making moves until it
 * complies, at lock); nothing here predicts what an owner will actually do,
 * and nothing here reads Sleeper's own enforcement state.
 *
 * Arithmetic, per roster:
 *
 *   limits.active   = rosterPositions.length, excluding any "IR" / "TAXI"
 *                     codes (Sleeper keeps reserve and taxi out of
 *                     rosterPositions, but we filter defensively).
 *   counts.reserve  = |reserve|, counts.taxi = |taxi|
 *   counts.active   = |players| - |players ∩ (taxi ∪ reserve)|
 *                     (players is the full list incl. taxi + reserve).
 *   overBy          = max(0, counts.active - limits.active)
 *   openSpots       = max(0, limits.active - counts.active)
 *   taxiOpen        = max(0, limits.taxi - counts.taxi)
 *   N (startable)   = number of non-"BN" slots in limits.active
 *   taxiSuggestions = taxi-eligible active players NOT among the roster's
 *                     top-N by value, sorted by value DESC. These are stash
 *                     candidates: moving them costs no starter.
 *   taxiMoves       = min(overBy, taxiOpen, |taxiSuggestions|); the
 *                     highest-value taxiMoves suggestions are assumed moved.
 *   mustCut         = overBy - taxiMoves
 *
 * Stated assumptions:
 *   - Taxi eligibility: Sleeper's `taxi_years` is read as the number of
 *     seasons a player may be stashed, and `years_exp` 0 means rookie, so a
 *     player is eligible when yearsExp < taxiYears. When taxi_years is
 *     missing we fall back to rookies only (yearsExp === 0). Players with
 *     unknown yearsExp are never eligible. `taxi_allow_vets` and any
 *     "must have been acquired this season" rules are NOT modelled.
 *   - "Top-N startable" is pure value rank; slot/position eligibility is
 *     ignored, so a team with three elite centres is treated as starting all
 *     three.
 *   - Reserve (IR) is taken as-is: we do not check that reserved players are
 *     actually injured, nor suggest IR moves to relieve the crunch.
 *   - `valueOf` returning a non-finite number is treated as 0.
 *   - Players drafted in the just-completed rookie draft (opts.rookieIds) are
 *     placed at the END of cutCandidates with `protected: true` and are never
 *     counted as likely releases; an owner cutting a fresh pick is possible
 *     but we do not predict it. A team whose mustCut exceeds its unprotected
 *     candidates therefore contributes fewer than mustCut likely releases.
 */

/**
 * @typedef {Object} RosterLimits
 * @property {number} active      Active-roster slots (starters + bench).
 * @property {number} taxi        Taxi slots (settings.taxi_slots, default 0).
 * @property {number} reserve     Reserve/IR slots (settings.reserve_slots, default 0).
 * @property {number|null} taxiYears settings.taxi_years, or null if absent.
 */

/**
 * @typedef {Object} CrunchPlayer
 * @property {string} playerId
 * @property {string} name
 * @property {number} value
 * @property {string[]} reasonFlags  Any of 'rookie', 'injured', 'noTeam', 'taxiStash'.
 * @property {boolean} [protected]   True for players in opts.rookieIds.
 */

/**
 * @typedef {Object} RosterCrunch
 * @property {number|string} rosterId
 * @property {string|null} ownerId
 * @property {RosterLimits} limits
 * @property {{active:number, taxi:number, reserve:number, total:number}} counts
 * @property {number} overBy
 * @property {number} openSpots
 * @property {number} taxiOpen
 * @property {number} taxiMoves      Suggestions assumed moved to taxi.
 * @property {number} mustCut
 * @property {CrunchPlayer[]} taxiSuggestions
 * @property {CrunchPlayer[]} cutCandidates
 */

/**
 * @typedef {CrunchPlayer & {rosterId: number|string, ownerId: string|null}} LikelyRelease
 */

const NON_ACTIVE_CODES = new Set(["IR", "TAXI"]);

/**
 * @param {any} h LeagueHistory
 * @returns {RosterLimits}
 */
export function rosterLimits(h) {
  const positions = h?.currentLeague?.rosterPositions ?? [];
  const settings = h?.currentLeague?.settings ?? {};
  return {
    active: positions.filter((p) => !NON_ACTIVE_CODES.has(p)).length,
    taxi: settings.taxi_slots ?? 0,
    reserve: settings.reserve_slots ?? 0,
    taxiYears: settings.taxi_years ?? null,
  };
}

/**
 * Taxi eligibility by experience only (see header for assumptions).
 * @param {{yearsExp?: number|null}|undefined} player
 * @param {RosterLimits} limits
 * @returns {boolean}
 */
export function taxiEligible(player, limits) {
  const exp = player?.yearsExp;
  if (exp == null || !Number.isFinite(exp)) return false;
  if (limits.taxiYears == null) return exp === 0;
  return exp < limits.taxiYears;
}

function safeValue(valueOf, id) {
  const v = Number(valueOf(id));
  return Number.isFinite(v) ? v : 0;
}

function startableCount(h) {
  const positions = h?.currentLeague?.rosterPositions ?? [];
  return positions.filter((p) => p !== "BN" && !NON_ACTIVE_CODES.has(p)).length;
}

/** Value DESC, then playerId ASC for determinism. */
const byValueDesc = (a, b) => b.value - a.value || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
/** Value ASC, then playerId ASC for determinism. */
const byValueAsc = (a, b) => a.value - b.value || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

/**
 * @param {any} h LeagueHistory
 * @param {number|string} rosterId
 * @param {(playerId: string) => number} valueOf
 * @param {{rookieIds?: Set<string>}} [opts]
 * @returns {RosterCrunch}
 */
export function rosterCrunch(h, rosterId, valueOf, opts = {}) {
  const roster = (h?.rosters ?? []).find((r) => r.rosterId === rosterId);
  if (!roster) throw new Error(`rosterCrunch: unknown rosterId ${rosterId}`);
  const rookieIds = opts.rookieIds ?? new Set();
  const limits = rosterLimits(h);
  const players = h?.players;

  const taxiSet = new Set(roster.taxi ?? []);
  const reserveSet = new Set(roster.reserve ?? []);
  const all = [...new Set(roster.players ?? [])];
  const activeIds = all.filter((id) => !taxiSet.has(id) && !reserveSet.has(id));

  const counts = {
    active: activeIds.length,
    taxi: taxiSet.size,
    reserve: reserveSet.size,
    total: all.length,
  };
  const overBy = Math.max(0, counts.active - limits.active);
  const openSpots = Math.max(0, limits.active - counts.active);
  const taxiOpen = Math.max(0, limits.taxi - counts.taxi);

  const describe = (id) => {
    const p = players?.get?.(id);
    const flags = [];
    if (rookieIds.has(id)) flags.push("rookie");
    if (p?.injuryStatus) flags.push("injured");
    if (p == null || p.team == null) flags.push("noTeam");
    return { playerId: id, name: p?.fullName ?? id, value: safeValue(valueOf, id), reasonFlags: flags };
  };

  const active = activeIds.map(describe).sort(byValueDesc);
  const topN = new Set(active.slice(0, startableCount(h)).map((p) => p.playerId));

  const taxiSuggestions = active
    .filter((p) => !topN.has(p.playerId) && taxiEligible(players?.get?.(p.playerId), limits))
    .map((p) => ({ ...p, reasonFlags: [...p.reasonFlags] }));

  const taxiMoves = Math.min(overBy, taxiOpen, taxiSuggestions.length);
  const stashed = new Set(taxiSuggestions.slice(0, taxiMoves).map((p) => p.playerId));
  const mustCut = overBy - taxiMoves;

  const asc = [...active].sort(byValueAsc).map((p) => {
    const out = { ...p, reasonFlags: [...p.reasonFlags] };
    if (stashed.has(p.playerId)) out.reasonFlags.push("taxiStash");
    return out;
  });
  const cutCandidates = [
    ...asc.filter((p) => !rookieIds.has(p.playerId)),
    ...asc.filter((p) => rookieIds.has(p.playerId)).map((p) => ({ ...p, protected: true })),
  ];

  return {
    rosterId: roster.rosterId,
    ownerId: roster.ownerId ?? null,
    limits,
    counts,
    overBy,
    openSpots,
    taxiOpen,
    taxiMoves,
    mustCut,
    taxiSuggestions,
    cutCandidates,
  };
}

/**
 * @param {any} h LeagueHistory
 * @param {(playerId: string) => number} valueOf
 * @param {{rookieIds?: Set<string>}} [opts]
 * @returns {{rosters: RosterCrunch[], likelyReleases: LikelyRelease[]}}
 */
export function leagueCrunch(h, valueOf, opts = {}) {
  const rosters = (h?.rosters ?? []).map((r) => rosterCrunch(h, r.rosterId, valueOf, opts));
  const likelyReleases = rosters
    .filter((c) => c.mustCut > 0)
    .flatMap((c) =>
      c.cutCandidates
        .filter((p) => !p.protected && !p.reasonFlags.includes("taxiStash"))
        .slice(0, c.mustCut)
        .map((p) => ({ ...p, rosterId: c.rosterId, ownerId: c.ownerId })),
    )
    .sort(byValueDesc);
  return { rosters, likelyReleases };
}
