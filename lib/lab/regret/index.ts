/**
 * THE REGRET LEDGER - a record of a lock-in season, not a verdict on one.
 *
 * ---------------------------------------------------------------------------------
 * The format
 * ---------------------------------------------------------------------------------
 * This league is Sleeper `game_mode: 1`, lock-in. Seven starting slots a week, and a
 * slot holds ONE PLAYER-GAME, not a player-week: you bank a player for a specific
 * night, the slot freezes at that game's line, and the slot is spent. Verified on the
 * real league: 322 roster-weeks in 2025, 2,254 slots, seven every time, and zero
 * duplicate player ids inside any one week.
 *
 * So every week is seven decisions, and every decision has a shadow: the best game
 * that player, or some other player on the roster, went on to produce. This file
 * measures the distance between the two.
 *
 * ---------------------------------------------------------------------------------
 * WHY THIS IS NOT A GRADE (D6, and the reason the copy is written the way it is)
 * ---------------------------------------------------------------------------------
 * Best-in-hindsight is not best-decision, and the two are not close. A manager who
 * banked 28 on Tuesday could not know Thursday would bring 41. The gap below is a
 * fact about how the week turned out; it is not evidence about how the week was
 * reasoned, and nothing in this module or the surface over it calls a banked slot a
 * mistake.
 *
 * ONE EXCEPTION, and it is named as one: an EMPTY slot required no foresight to
 * avoid. Nobody had to predict anything to put a name in the box. That is counted and
 * stated separately, because it is the only line here that is genuinely about the
 * manager rather than about the week.
 *
 * ---------------------------------------------------------------------------------
 * What this deliberately does NOT model
 * ---------------------------------------------------------------------------------
 *  - POSITION ELIGIBILITY. The seven slots are PG/SG/SF/PF/C/UTIL/UTIL, but Sleeper
 *    reports only TODAY's eligibility, and 193 of the 2,244 filled slots this league
 *    actually played in 2025 would be illegal under it. Applying it would grade real
 *    lineups against a rulebook they did not play under, so the best-available figure
 *    ignores position and is therefore an UPPER BOUND, stated as one.
 *  - RESERVE AND TAXI. The weekly roster list includes IR and taxi players, who could
 *    not legally have been started, and per-week reserve status is not recoverable
 *    from any endpoint. Some of the pool was never actually startable.
 *  - INJURY AND AVAILABILITY AT LOCK TIME. A game that had not tipped off yet was a
 *    guess; this file only ever sees the box score afterwards.
 */

/** How a slot's banked figure was reconciled against the box scores. */
export interface SlotRow {
  /** 0-based position in `starters`, i.e. which lineup slot. */
  index: number;
  /** The slot's label from the league's `roster_positions`, e.g. "UTIL". */
  label: string;
  playerId: string | null;
  playerName: string | null;
  /** Points this slot banked, straight from `starters_points`. */
  banked: number;
  /** No player id at all - the slot was never filled. */
  empty: boolean;
  /** `banked` matched one of the games we can see for that player that week. */
  verified: boolean;
  /**
   * The GAME the slot banked, when the banked figure matched exactly one box score.
   *
   * A lock-in slot is a player-game, not a player-week, so naming the night is what
   * makes the row read as the format actually works. Null when the figure matched no
   * game (`verified` false) or more than one, which happens when a player posts the
   * same score twice in a week - guessing between them would put a specific claim on
   * screen that the data does not support.
   */
  bankedOpponent: string | null;
  bankedDate: string | null;
  /** That player's best single game that week, when visible. */
  playerBest: number | null;
}

export interface PoolGame {
  playerId: string;
  name: string;
  /** Best single game that week under THIS league's scoring. */
  points: number;
  date: string | null;
  opponent: string | null;
  /** This player occupied one of the seven slots. */
  banked: boolean;
}

export interface WeekRow {
  week: number;
  /** At or after the league's `playoff_week_start`. */
  playoff: boolean;
  /** Sum of `starters_points`. */
  banked: number;
  /** Sum of the best seven distinct player-games the roster produced. */
  best: number;
  /** `best - banked`. Never negative - see `poolFor`. */
  gap: number;
  slots: SlotRow[];
  /** The seven that would have been banked with the benefit of hindsight. */
  bestSeven: PoolGame[];
  emptySlots: number;
  /** Filled slots that banked exactly 0.0. */
  zeroSlots: number;
  /** Distinct players with at least one visible game. */
  poolSize: number;
  /** Rostered players whose box scores could not be loaded at all. */
  missingStats: number;
  filledSlots: number;
  verifiedSlots: number;
  /** Filled slots where the banked game WAS that player's best game of the week. */
  slotsAtPlayerBest: number;
}

export interface RegretLedger {
  season: string;
  rosterId: number;
  weeks: WeekRow[];
  bankedTotal: number;
  bestTotal: number;
  gapTotal: number;
  slotsTotal: number;
  filledSlots: number;
  emptySlots: number;
  zeroSlots: number;
  verifiedSlots: number;
  slotsAtPlayerBest: number;
  /** The week with the largest gap, or null when there are no weeks. */
  widestWeek: WeekRow | null;
  /** The week with the smallest gap. */
  tightestWeek: WeekRow | null;
}

export interface LedgerInput {
  season: string;
  rosterId: number;
  /** This roster's weeks, ascending. Weeks that never ran must be omitted. */
  matchups: {
    week: number;
    starters: string[];
    startersPoints: number[];
    players: string[];
  }[];
  /** playerId -> week -> that week's games. Missing players are counted, not hidden. */
  games: Map<string, Map<number, { date: string | null; opponent: string | null; stats: Record<string, number> }[]>>;
  /** The league's own scoring settings. Never a default table. */
  scoring: Record<string, number>;
  /** `roster_positions`, trimmed to the starting slots by the caller. */
  slotLabels: string[];
  playerNames: Map<string, string>;
  playoffWeekStart: number;
}

/** An unfilled slot id, as Sleeper writes it. */
function isEmptyId(id: string | undefined | null): boolean {
  return !id || id === "0";
}

/**
 * One game's fantasy points under the league's OWN scoring settings.
 *
 * Deliberately generic over `scoring`: every key the league scores is multiplied by
 * the same key on the box score, so bonuses (`bonus_pt_40p`, `bonus_pt_50p`) and
 * penalties (`tf`, `ff`) are picked up automatically. The stats payload also carries
 * a `pts_std` field that looks like a shortcut and is not one - it excludes this
 * league's bonuses (verified: a 43-point game reads `pts_std` 33.0 against a real
 * league score of 39.5), so it is never read.
 */
export function scoreGame(
  stats: Record<string, number>,
  scoring: Record<string, number>,
): number {
  let total = 0;
  for (const [key, weight] of Object.entries(scoring)) {
    const v = stats[key];
    if (typeof v === "number") total += weight * v;
  }
  // Sleeper publishes half-point scoring; 2dp kills float dust without rounding away
  // anything real.
  return Math.round(total * 100) / 100;
}

/**
 * The best single game each rostered player produced that week.
 *
 * `bankedFloor` is the reconciliation that keeps the gap honest in both directions: a
 * slot's `starters_points` is Sleeper's own statement that this player produced that
 * figure in a game that week, so it is a LOWER BOUND on his best game even when the
 * box scores we loaded do not contain a matching line. Without it, a player whose
 * stats failed to load would make "best available" smaller than "actually banked" and
 * produce a negative regret, which would be an artefact of our fetch rather than a
 * fact about the week.
 */
function poolFor(
  input: LedgerInput,
  week: number,
  players: string[],
  bankedFloor: Map<string, number>,
): { pool: PoolGame[]; missing: number } {
  const pool: PoolGame[] = [];
  let missing = 0;
  for (const pid of new Set(players)) {
    const weeks = input.games.get(pid);
    const games = weeks?.get(week) ?? [];
    if (!weeks) missing++;
    let bestPoints = -Infinity;
    let bestDate: string | null = null;
    let bestOpp: string | null = null;
    for (const g of games) {
      const pts = scoreGame(g.stats, input.scoring);
      if (pts > bestPoints) {
        bestPoints = pts;
        bestDate = g.date;
        bestOpp = g.opponent;
      }
    }
    const floor = bankedFloor.get(pid);
    if (floor !== undefined && (bestPoints === -Infinity || floor > bestPoints)) {
      bestPoints = floor;
      bestDate = null;
      bestOpp = null;
    }
    if (bestPoints === -Infinity) continue; // no game that week: not available
    pool.push({
      playerId: pid,
      name: input.playerNames.get(pid) ?? `Player ${pid}`,
      points: bestPoints,
      date: bestDate,
      opponent: bestOpp,
      banked: bankedFloor.has(pid),
    });
  }
  pool.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return { pool, missing };
}

export function buildRegretLedger(input: LedgerInput): RegretLedger {
  const slotCount = input.slotLabels.length;
  const weeks: WeekRow[] = [];

  for (const m of input.matchups) {
    const bankedFloor = new Map<string, number>();
    m.starters.forEach((pid, i) => {
      if (isEmptyId(pid)) return;
      const pts = m.startersPoints[i] ?? 0;
      bankedFloor.set(pid, Math.max(bankedFloor.get(pid) ?? -Infinity, pts));
    });

    const { pool, missing } = poolFor(input, m.week, m.players, bankedFloor);
    const byPlayer = new Map(pool.map((p) => [p.playerId, p]));

    const slots: SlotRow[] = [];
    for (let i = 0; i < slotCount; i++) {
      const pid = m.starters[i];
      const banked = m.startersPoints[i] ?? 0;
      const empty = isEmptyId(pid);
      const weeks_ = empty ? undefined : input.games.get(pid);
      const games = weeks_?.get(m.week) ?? [];
      const matches = games.filter(
        (g) => Math.abs(scoreGame(g.stats, input.scoring) - banked) < 0.011,
      );
      const verified = !empty && matches.length > 0;
      const one = matches.length === 1 ? matches[0] : null;
      const best = empty ? null : (byPlayer.get(pid)?.points ?? null);
      slots.push({
        index: i,
        label: input.slotLabels[i] ?? "UTIL",
        playerId: empty ? null : pid,
        playerName: empty ? null : (input.playerNames.get(pid) ?? `Player ${pid}`),
        banked,
        empty,
        verified,
        bankedOpponent: one?.opponent ?? null,
        bankedDate: one?.date ?? null,
        playerBest: best,
      });
    }

    const bestSeven = pool.slice(0, slotCount);
    const banked = slots.reduce((s, x) => s + x.banked, 0);
    const best = bestSeven.reduce((s, x) => s + x.points, 0);

    weeks.push({
      week: m.week,
      playoff: m.week >= input.playoffWeekStart,
      banked: round2(banked),
      best: round2(best),
      gap: round2(Math.max(0, best - banked)),
      slots,
      bestSeven,
      emptySlots: slots.filter((s) => s.empty).length,
      zeroSlots: slots.filter((s) => !s.empty && s.banked === 0).length,
      poolSize: pool.length,
      missingStats: missing,
      filledSlots: slots.filter((s) => !s.empty).length,
      verifiedSlots: slots.filter((s) => s.verified).length,
      slotsAtPlayerBest: slots.filter(
        (s) => !s.empty && s.playerBest != null && Math.abs(s.playerBest - s.banked) < 0.011,
      ).length,
    });
  }

  const sum = (f: (w: WeekRow) => number) => weeks.reduce((s, w) => s + f(w), 0);
  const sorted = [...weeks].sort((a, b) => b.gap - a.gap);

  return {
    season: input.season,
    rosterId: input.rosterId,
    weeks,
    bankedTotal: round2(sum((w) => w.banked)),
    bestTotal: round2(sum((w) => w.best)),
    gapTotal: round2(sum((w) => w.gap)),
    slotsTotal: weeks.length * slotCount,
    filledSlots: sum((w) => w.filledSlots),
    emptySlots: sum((w) => w.emptySlots),
    zeroSlots: sum((w) => w.zeroSlots),
    verifiedSlots: sum((w) => w.verifiedSlots),
    slotsAtPlayerBest: sum((w) => w.slotsAtPlayerBest),
    widestWeek: sorted[0] ?? null,
    tightestWeek: sorted[sorted.length - 1] ?? null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
