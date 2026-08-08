/**
 * THE START LINE - the app's first surface about tonight.
 *
 * ---------------------------------------------------------------------------------
 * What this is, and the line it does not cross
 * ---------------------------------------------------------------------------------
 * Every other surface in Parquet is about a season. This one is about the seven slots
 * in front of you right now, and it exists because lock-in asks a question no season
 * view can answer: a game just finished, the number is on the screen, and the only
 * decision is whether to spend a slot on it.
 *
 * IT OPTIMISES NOTHING. It never ranks the roster, never proposes a lineup, never
 * says lock and never says wait. The moment it does, it is a different product and it
 * is making the one claim the data cannot support - what a player will do tonight.
 * D6 forbids grades; D19 forbids inference the evidence does not carry. Both bind
 * here, and every component below has a refusal written into it rather than bolted on
 * afterwards:
 *
 *  - SLOT PAR shows what a slot in THIS league has historically been worth and where
 *    a figure sits in that distribution. It does not tell you to bank it. A median is
 *    a fact about 2,124 past slots; it is not advice about this one.
 *  - THE WEEK BOARD shows which slots are spent, which are open, and which nights the
 *    unslotted half of your roster still has. It is a board, not an optimiser: it puts
 *    the arithmetic on screen and stops.
 *  - THE GAME LOG marks context on past lines and refuses to fold that context into a
 *    number. There is no "true" score here, no discount factor, no blowout-adjusted
 *    average - see `lateMargin` for why the adjustment would be backwards anyway.
 *
 * ---------------------------------------------------------------------------------
 * The format, verified against the real league (2025, league 1240499656799039488)
 * ---------------------------------------------------------------------------------
 * Seven starting slots a week, 322 roster-weeks, 2,254 slots, seven every time, and a
 * slot holds ONE PLAYER-GAME rather than a player-week. That is why "player-games
 * left" and not "players left" is the unit the board counts in: a manager with four
 * players and six remaining nights has six chances, not four.
 */

/** How wide a bin of the par strip is, in fantasy points. */
export const PAR_BIN_WIDTH = 4;

/**
 * The margin after three quarters, in points, at which a fourth quarter is treated as
 * having been played under different conditions.
 *
 * Deliberately a per-GAME annotation and never a per-player average. Two reasons, both
 * measured rather than assumed:
 *
 *  1. A season gives a given player nine to fifteen games this side of the line. An
 *     average over that many games is noise wearing a decimal point.
 *  2. The intuition it is usually reached for is BACKWARDS. Blowouts deflate stars far
 *     more than they inflate bench players (Jokic 41.8 -> 36.1, Giddey 28.3 -> 20.3,
 *     against Kuminga +2.4 and Vincent +0.3). So the flag's honest job is to stop a
 *     reader misreading a quiet line as a decline, not to license an adjustment.
 *
 * And it can never forecast, because a blowout is only knowable after the fact. It
 * annotates history. That is the whole of it.
 */
export const LATE_MARGIN_POINTS = 18;

// ---------------------------------------------------------------- slot par

export interface ParBin {
  from: number;
  to: number;
  count: number;
}

export interface SlotPar {
  /** Slots the distribution is drawn from: filled, and scoring above zero. */
  n: number;
  mean: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  bins: ParBin[];
  /** Slots that banked EXACTLY 0.0 - never filled, or filled with a name that
   *  produced nothing. 126 of the league's 2,254 in 2025. */
  deadSlots: number;
  /**
   * Slots that finished BELOW zero. Four of the league's 2,254 in 2025, all at -1.0.
   *
   * Their own category rather than lumped in with the dead ones, because "banked
   * nothing" and "went backwards" are different events and this league's scoring
   * makes the second one possible. Four rows cannot be drawn on a strip that starts
   * at zero without distorting it, so they are counted and named instead of plotted.
   */
  negativeSlots: number;
  /** Slots the season actually played, dead ones included. */
  totalSlots: number;
  /** Every scoring slot, ascending. Kept so a rank is looked up rather than binned. */
  sorted: number[];
}

/** One slot as the platform recorded it. `playerId` null means nobody was in it. */
export interface RecordedSlot {
  playerId: string | null;
  points: number;
}

/**
 * What a lock-in slot has been worth in THIS league.
 *
 * ZEROS ARE EXCLUDED FROM THE DISTRIBUTION AND COUNTED SEPARATELY, which is the one
 * modelling decision in this function. A slot that banked 0.0 is not a low score, it
 * is an absent decision: 10 of the league's 2,254 slots in 2025 held no player at all
 * and 116 more held a player who did not play. Leaving them in drags the median down
 * by half a point and quietly redefines "typical" as "typical, including the weeks
 * nobody was watching". They are reported on their own line instead, where they say
 * something true.
 */
export function buildSlotPar(slots: RecordedSlot[], binWidth = PAR_BIN_WIDTH): SlotPar {
  const scoring = slots.filter((s) => s.playerId != null && s.points > 0).map((s) => s.points);
  const sorted = [...scoring].sort((a, b) => a - b);
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  const bins: ParBin[] = [];
  const binCount = Math.max(1, Math.ceil((max || 1) / binWidth));
  for (let i = 0; i < binCount; i++) {
    bins.push({ from: i * binWidth, to: (i + 1) * binWidth, count: 0 });
  }
  for (const v of sorted) {
    const i = Math.min(binCount - 1, Math.floor(v / binWidth));
    bins[i].count++;
  }
  return {
    n: sorted.length,
    mean: round1(sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1)),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max,
    bins,
    deadSlots: slots.filter((s) => s.points === 0).length,
    negativeSlots: slots.filter((s) => s.playerId != null && s.points < 0).length,
    totalSlots: slots.length,
    sorted,
  };
}

/** Linear-interpolated quantile of an ASCENDING array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return round1(sorted[lo]);
  return round1(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}

/**
 * Where a figure sits among the league's scoring slots, as a percentage at or below.
 *
 * Returned so a reader can be told "higher than 62% of the slots this league has ever
 * banked" - which is a statement about the past. It is NOT a probability, not a
 * confidence, and the surface never words it as one.
 */
export function parPercentile(par: SlotPar, value: number): number {
  if (par.n === 0) return 0;
  // Read from the raw sorted array, never from the bins: two slots either side of a
  // bin edge are four points apart in the drawing and one point apart in fact, and the
  // printed sentence has to be the fact.
  let lo = 0;
  let hi = par.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (par.sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / par.n) * 100);
}

// ---------------------------------------------------------------- week board

export interface BoardSlot {
  index: number;
  /** From `roster_positions`, e.g. "UTIL". */
  label: string;
  playerId: string | null;
  playerName: string | null;
  banked: number;
  empty: boolean;
}

export interface BoardGame {
  gameId: string;
  /** ISO date. */
  date: string;
  playerId: string;
  playerName: string;
  team: string | null;
  opponent: string | null;
  home: boolean;
  /** This player's team played the previous calendar day too. */
  backToBack: boolean;
  /** The schedule reports this game as finished. */
  played: boolean;
  /** Games this player has in the week from this one onward, this one included. */
  gamesLeftForPlayer: number;
  /** This player already occupies one of the seven slots, so he cannot fill another. */
  slotted: boolean;
}

export interface BoardDay {
  date: string;
  games: BoardGame[];
}

export interface WeekBoard {
  week: number;
  slots: BoardSlot[];
  openSlots: number;
  bankedSoFar: number;
  days: BoardDay[];
  /**
   * Player-games still available: unplayed games belonging to players who are not
   * already in a slot. THE arithmetic of the week, and the reason the board exists.
   */
  gamesLeft: number;
  /** Rostered players Sleeper lists with no NBA team, so no nights could be found. */
  playersWithoutTeam: number;
}

export interface BoardInput {
  week: number;
  /** Seven ids in `roster_positions` order. "" or "0" is an unfilled slot. */
  starters: string[];
  startersPoints: number[];
  slotLabels: string[];
  /** Everyone on the roster this week. */
  players: string[];
  playerNames: Map<string, string>;
  /** playerId -> NBA team abbreviation, or null when Sleeper has none. */
  playerTeams: Map<string, string | null>;
  /** Every game of the season. Filtered to `week` here. */
  schedule: {
    gameId: string;
    date: string | null;
    week: number | null;
    status: string | null;
    home: { team: string | null };
    away: { team: string | null };
  }[];
}

function isEmptyId(id: string | undefined | null): boolean {
  return !id || id === "0";
}

/** Previous calendar day, as a plain ISO date. UTC arithmetic on a date-only string. */
function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The week as a board: seven chips, then the nights that are left.
 *
 * BACK-TO-BACK is computed from the TEAM's schedule, not the player's game list, which
 * is the only way to get it right for a game that has not been played yet - there is
 * no box score to count. It is marked and not scored: a second night is a fact about
 * the calendar, and this file has no evidence about what it does to any individual.
 */
export function buildWeekBoard(input: BoardInput): WeekBoard {
  const slotCount = input.slotLabels.length;
  const slotted = new Set(input.starters.filter((id) => !isEmptyId(id)));

  const slots: BoardSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const pid = input.starters[i];
    const empty = isEmptyId(pid);
    slots.push({
      index: i,
      label: input.slotLabels[i] ?? "UTIL",
      playerId: empty ? null : pid,
      playerName: empty ? null : (input.playerNames.get(pid) ?? `Player ${pid}`),
      banked: input.startersPoints[i] ?? 0,
      empty,
    });
  }

  const weekGames = input.schedule.filter((g) => g.week === input.week && g.date);
  /** team -> the dates it plays this week, and all season, for the b2b test. */
  const teamDates = new Map<string, Set<string>>();
  for (const g of input.schedule) {
    if (!g.date) continue;
    for (const t of [g.home.team, g.away.team]) {
      if (!t) continue;
      let s = teamDates.get(t);
      if (!s) teamDates.set(t, (s = new Set()));
      s.add(g.date);
    }
  }

  const byDate = new Map<string, BoardGame[]>();
  let playersWithoutTeam = 0;
  const roster = [...new Set(input.players)];

  for (const pid of roster) {
    const team = input.playerTeams.get(pid) ?? null;
    if (!team) {
      playersWithoutTeam++;
      continue;
    }
    const mine = weekGames
      .filter((g) => g.home.team === team || g.away.team === team)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    mine.forEach((g, i) => {
      const date = g.date as string;
      const home = g.home.team === team;
      const row: BoardGame = {
        gameId: g.gameId,
        date,
        playerId: pid,
        playerName: input.playerNames.get(pid) ?? `Player ${pid}`,
        team,
        opponent: home ? g.away.team : g.home.team,
        home,
        backToBack: teamDates.get(team)?.has(previousDay(date)) ?? false,
        played: g.status === "complete",
        gamesLeftForPlayer: mine.length - i,
        slotted: slotted.has(pid),
      };
      const list = byDate.get(date);
      if (list) list.push(row);
      else byDate.set(date, [row]);
    });
  }

  const days: BoardDay[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, games]) => ({
      date,
      games: games.sort((a, b) => a.playerName.localeCompare(b.playerName)),
    }));

  return {
    week: input.week,
    slots,
    openSlots: slots.filter((s) => s.empty).length,
    bankedSoFar: round1(slots.reduce((s, x) => s + x.banked, 0)),
    days,
    gamesLeft: days.reduce(
      (n, d) => n + d.games.filter((g) => !g.played && !g.slotted).length,
      0,
    ),
    playersWithoutTeam,
  };
}

// ---------------------------------------------------------------- game log

export interface GameLogRow {
  gameId: string | null;
  date: string | null;
  opponent: string | null;
  /** Null when the line carries no home/away marker. */
  home: boolean | null;
  /** Minutes, one decimal. Null when the feed carried no seconds. */
  minutes: number | null;
  /** Scored under the league's OWN settings. */
  points: number;
  /**
   * In his team's starting five, from the schedule's own `starters` array.
   *
   * Null when the line could not be joined to a schedule row. FALSE MEANS "not in the
   * five" AND NOTHING MORE. It does not mean injured, rested, benched or demoted:
   * Sleeper carries only a player's current `injury_status` and publishes no
   * historical inactive list, so the reason is not in the data at any price. The copy
   * on the surface says exactly this, in these words.
   */
  started: boolean | null;
  /** Margin after three regulation quarters, from this player's team's side. */
  thirdQuarterMargin: number | null;
  /** Final margin, same sign convention. */
  finalMargin: number | null;
  /** `|thirdQuarterMargin| >= LATE_MARGIN_POINTS`. See that constant. */
  lateMargin: boolean;
}

export interface GameLogInput {
  playerId: string;
  /** That player's games, most recent LAST. */
  games: {
    date: string | null;
    opponent: string | null;
    gameId: string | null;
    isAway: boolean | null;
    secondsPlayed: number;
    stats: Record<string, number>;
  }[];
  schedule: Map<
    string,
    {
      status: string | null;
      home: { team: string | null; points: number | null; starters: string[]; quarters: number[] };
      away: { team: string | null; points: number | null; starters: string[]; quarters: number[] };
    }
  >;
  scoring: Record<string, number>;
  limit?: number;
}

/**
 * The last N games, each annotated with the context it was played in.
 *
 * Every annotation is a separate FIELD. Nothing is folded into `points`, and there is
 * no second "adjusted" figure anywhere in this return type, because there is no
 * defensible way to produce one: the effect of a late margin is large and negative for
 * a star, near zero for a reserve, and measured over nine to fifteen games a season.
 * A number carrying that much uncertainty printed next to a real box score would be
 * read as the better of the two.
 */
export function buildGameLog(input: GameLogInput): GameLogRow[] {
  const limit = input.limit ?? 10;
  const played = input.games.filter((g) => g.secondsPlayed > 0);
  return played.slice(-limit).reverse().map((g) => {
    const sched = g.gameId ? input.schedule.get(g.gameId) : undefined;
    let started: boolean | null = null;
    let q3: number | null = null;
    let fin: number | null = null;
    if (sched && sched.status === "complete" && g.isAway != null) {
      const me = g.isAway ? sched.away : sched.home;
      const them = g.isAway ? sched.home : sched.away;
      started = me.starters.includes(input.playerId);
      const three = (q: number[]) => q.slice(0, 3).reduce((s, v) => s + v, 0);
      if (me.quarters.length >= 3 && them.quarters.length >= 3) {
        q3 = three(me.quarters) - three(them.quarters);
      }
      if (me.points != null && them.points != null) fin = me.points - them.points;
    }
    return {
      gameId: g.gameId,
      date: g.date,
      opponent: g.opponent,
      home: g.isAway == null ? null : !g.isAway,
      minutes: g.secondsPlayed > 0 ? round1(g.secondsPlayed / 60) : null,
      points: scoreLine(g.stats, input.scoring),
      started,
      thirdQuarterMargin: q3,
      finalMargin: fin,
      lateMargin: q3 != null && Math.abs(q3) >= LATE_MARGIN_POINTS,
    };
  });
}

/**
 * One line's fantasy points under the league's OWN scoring settings.
 *
 * Same shape as the regret ledger's `scoreGame`, and for the same reason: the payload
 * carries a `pts_std` that looks like a shortcut and excludes this league's bonuses
 * (a 43-point game reads `pts_std` 33.0 against a league score of 39.5). It is never
 * read.
 */
export function scoreLine(
  stats: Record<string, number>,
  scoring: Record<string, number>,
): number {
  let total = 0;
  for (const [key, weight] of Object.entries(scoring)) {
    const v = stats[key];
    if (typeof v === "number") total += weight * v;
  }
  return Math.round(total * 100) / 100;
}

/**
 * The one sentence a row expands to.
 *
 * Prose, and deliberately without a verdict at the end. It states what the schedule
 * shows and stops; the reader supplies the meaning, because the meaning depends on
 * which player it is and this file does not know.
 */
export function describeGame(row: GameLogRow): string {
  const parts: string[] = [];
  const where = row.home === null ? "against" : row.home ? "at home against" : "on the road against";
  parts.push(
    `${row.minutes != null ? `${row.minutes} minutes ` : ""}${where} ${row.opponent ?? "an unlisted opponent"}`.trim(),
  );
  if (row.started === true) parts.push("in the starting five");
  else if (row.started === false)
    parts.push("not in the starting five, and the feed does not say why");
  if (row.lateMargin && row.thirdQuarterMargin != null) {
    const lead = row.thirdQuarterMargin > 0 ? "ahead by" : "behind by";
    parts.push(
      `three quarters in, the team was ${lead} ${Math.abs(row.thirdQuarterMargin)}` +
        `${row.finalMargin != null ? `, and it finished ${row.finalMargin > 0 ? "+" : ""}${row.finalMargin}` : ""}`,
    );
  }
  return `${parts.join("; ")}.`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
