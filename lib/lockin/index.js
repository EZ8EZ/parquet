/**
 * LOCK-IN WEEK DESK. One roster's lock-in week as a plain, serialisable view model.
 * Productionises the 2026-11-16 lock-in study; lib/lockin/model.js and policy.js carry
 * its constants. Contract for the UI below; bump `version` on any breaking change.
 *
 * @typedef {"locked"|"unknown_until_next_tip"|"reset"} LockStateName
 *
 * @typedef {Object} Gap  A named hole in the data; never swallowed.
 * @property {string} source        "state"|"league"|"rosters"|"matchups"|"schedule"|"players"|"playerLog"|"model"
 * @property {string|null} subject  player id or roster id the gap concerns
 * @property {string|null} url
 * @property {string} code          "fetch_failed"|"shape_mismatch"|"budget_exhausted"|"roster_missing"|"player_unknown"|"log_missing"|"team_unknown"
 * @property {string} message
 *
 * @typedef {Object} GameRef
 * @property {string} date          YYYY-MM-DD (US calendar; tip times are not published)
 * @property {string} day           "Mon".."Sun"
 * @property {string|null} opponent
 * @property {boolean|null} away
 * @property {"pre_game"|"in_game"|"complete"|"postponed"|"canceled"|string} status
 * @property {boolean|null} played  true sp>0 on a complete game; false DNP; null not final, or final with his box score not loaded yet
 * @property {number|null} fp       league-scored points when final and played (0 on a DNP)
 * @property {number|null} minutes
 *
 * @typedef {Object} Forecast  Next-game distribution. n = played games it rests on.
 * @property {number} mean
 * @property {number} sd
 * @property {{p10:number,p90:number}} range
 * @property {number} n
 * @property {number} shapeN        games in the shape (0 unless basis "own")
 * @property {number[]} shape       the equally weighted outcomes the forecast is built from, sorted
 * @property {"own"|"thin"|"league-prior"} basis  own: >=10 games; thin: 1-9 (league SD shape); league-prior: none
 * @property {{value:number,nRows:number,played:number}} playProbability  share of last <=40 team-game rows played, shrunk to 0.8
 *
 * @typedef {Object} Stopping  For a score x with k games left. Present only when k>=1.
 * @property {number} x
 * @property {number} k
 * @property {number} expectedIfHeld       r_k if not listed out, else H_{k-1}(0)
 * @property {number} expectedIfHeldPlays  r_k: reservation value if he plays his next game
 * @property {number} expectedIfHeldOut    H_{k-1}(0): if he is ruled out of it
 * @property {"listed_out"|"listed_uncertain"|"not_listed_out"} availabilityAssumed  listed_uncertain: GTD/DTD (lockin-sequence)
 * @property {{value:number,n:number}|null} [listedPlayRate]  share of uncertain-listed players who played, used for expectedIfHeld
 * @property {number} pLaterBeats          P(a later game is played and beats x), uses play probability
 * @property {number} pLaterBeatsIfPlays   same, if he plays every remaining game
 * @property {number} n
 *
 * @typedef {Object} Lean  The policy's lean. Optional for the UI; nothing else depends on it.
 * @property {"lock"|"hold"|"none"} value
 * @property {string} reason           one plain line built from the numbers, or why there is none
 * @property {string|null} noneCode    "no_games_left"|"already_locked"|"assumed_locked"|"has_not_played_this_week"|"bench"|"score_is_zero"|"game_in_progress"|"lock_state_unresolved"|"no_model" when value is "none"
 * @property {"marginal"|"moderate"|"clear"|null} confidence  from |valueIfLock - valueIfHold| / forecast SD: <0.25 marginal, <0.75 moderate, else clear
 * @property {number|null} marginSds
 * @property {boolean} conditional      true when the score may already be locked
 * @property {string|null} conditionalText
 * @property {Object|null} inputs       { x, k, expectedIfHeld, sd, valueIfLock, valueIfHold, perPlayerRule: "lock"|"hold", openSlots, holders, playersStillToPlay, nextNight, truncated }
 *
 * @typedef {Object} Hazard  Mechanical cases that need no model.
 * @property {"ruled_out_holding"|"final_game_likely_dnp"|"starter_no_games_left"} code
 * @property {string} text
 * @property {string|null} deadlineDate
 *
 * @typedef {Object} Annotation
 * @property {"overtime"|"minutes_jump"|"usual_starter_did_not_start"} code
 * @property {string} text
 *
 * @typedef {Object} SeriesGame
 * @property {string} date
 * @property {string} season
 * @property {string|null} opponent
 * @property {boolean|null} away
 * @property {number} fp
 * @property {number} minutes
 * @property {number|null} minutesAvgPrev10
 * @property {Annotation[]} annotations
 *
 * @typedef {Object} DecisionCard
 * @property {string} playerId
 * @property {string} name
 * @property {string|null} team
 * @property {string[]} positions
 * @property {"starter"|"bench"} role
 * @property {number|null} slotIndex
 * @property {string|null} slotLabel
 * @property {{status:string|null,bodyPart:string|null}|null} injury  /players/nba; freshness unmeasured
 * @property {number|null} banked      the slot's starters_points (starters only)
 * @property {{state:LockStateName|null,reason:string,certain:boolean}|null} lockState  starters only
 * @property {GameRef[]} weekGames
 * @property {number} gamesLeft
 * @property {GameRef|null} nextGame
 * @property {{kind:"lock_or_hold"|"lineup"|"none",text:string,deadlineDate:string|null,deadlineText:string|null}} decision
 * @property {Hazard[]} hazards
 * @property {number} urgencyRank      0 hazard, 1 lock or hold, 2 lineup, 3 nothing to decide
 * @property {Forecast|null} forecast
 * @property {Stopping|null} stopping
 * @property {Lean} lean
 * @property {{games:SeriesGame[],n:number,playedLoaded:number}} series  last 15 played games
 * @property {{opponent:string,meetings:{date:string,season:string,fp:number,minutes:number}[],n:number,loadedSeasons:string[]}|null} opponentHistory  history only
 *
 * @typedef {Object} SlotView
 * @property {number} index
 * @property {string} label
 * @property {string|null} playerId
 * @property {string|null} name
 * @property {number|null} banked
 * @property {LockStateName|null} lockState
 * @property {string} lockStateReason
 * @property {boolean} lockCertain
 *
 * @typedef {Object} PressureCell
 * @property {boolean} game
 * @property {string|null} opponent
 * @property {string|null} status
 * @property {boolean|null} played
 * @property {number|null} fp
 *
 * @typedef {Object} SlotPressure
 * @property {{lockedCertain:number,holdingUnknown:number,settled:number,openMax:number,openMin:number,playersStillToPlay:number,gamesRemaining:number,text:string}} summary
 * @property {{date:string,day:string,past:boolean,playersWithGame:number,playersStillToPlay:number,cells:Record<string,PressureCell>}[]} nights
 * @property {string[]} rowOrder       player ids, card order
 * @property {{nextNight:string|null,assignment:{slotLabel:string,playerId:string|null}[]}|null} policy  policy output; UI may ignore
 *
 * @typedef {Object} WeekDesk
 * @property {1} version
 * @property {"in_season"|"between_weeks"|"offseason"|"no_matchup"|"unavailable"} status
 * @property {boolean} inSeason
 * @property {string} message           short explicit line for non-board states, "" on a board
 * @property {string} generatedAt       ISO time
 * @property {string} today             YYYY-MM-DD, US Eastern
 * @property {string|null} leagueId
 * @property {string|null} season
 * @property {number} rosterId
 * @property {number|null} week
 * @property {string|null} weekSource   "state"|"schedule_rollover"|"override"
 * @property {{start:string,end:string,games:number}|null} dateWindow
 * @property {{week:number,start:string}|null} nextWeek   between_weeks only
 * @property {{result:{week:number,points:number,opponentPoints:number,opponentRosterId:number,outcome:"won"|"lost"|"tied"}|null,firstGames:{date:string,day:string,players:{playerId:string,name:string,team:string,opponent:string}[]}|null}} [betweenWeeks]  between_weeks only
 * @property {SlotView[]} slots
 * @property {DecisionCard[]} cards      ordered by urgency
 * @property {{playerId:string,name:string,reason:"reserve"|"taxi"}[]} excluded
 * @property {SlotPressure|null} slotPressure
 * @property {Gap[]} gaps
 * @property {{count:number,budget:number,immutable:number,wallMs:number|null}} requests
 * @property {typeof MODEL_INFO} model
 * @property {typeof LEAN_RECORD} leanRecord
 * @property {string} displayTz  lockin-fixes: the zone every returned time is expressed in (ISO strings carry its offset)
 * @property {import("./sequence.js").Tonight} [tonight]  lockin-sequence: tonight's tip-ordered decisions (boards only)
 * @property {import("./matchup.js").Opponent|null} [opponent]  lockin-opponent: this week's opponent
 * @property {import("./matchup.js").WinProb|null} [winProb]    lockin-opponent: head-to-head win probability
 * @property {{list:{side:"mine"|"theirs",slot:number,state:"locked"|"open"}[], contradictsInferred:{side:string,slot:number,state:string,inferred:string|null,inferredReason:string}[], text:string}} [assumptions]  lockin-assume: present only when buildWeekDesk got assumptions
 * @property {import("./matchup.js").WhatIf|null} [whatIf]      lockin-opponent: each action's effect on win probability
 * @property {import("./matchup.js").History|null} [history]    lockin-opponent: the viewing manager's past weeks
 */
import { MODEL, playerModel, stoppingView, perPlayerRuleLocks, probLaterBeats, nextGameRange } from "./model.js";
import { holderHoldValue, chooseLocks, assignTonight } from "./policy.js";
import { inferLockState } from "./lockState.js";
import { annotatedSeries, opponentMeetings, CONTEXT } from "./context.js";
import { isPlayed } from "./model.js";

/** His points per played game this season, with n; null with none played. */
function seasonAverageOf(log, season) {
  const g = (log || []).filter((x) => x.season === season && isPlayed(x) && Number.isFinite(x.fp));
  return g.length ? { mean: Math.round((g.reduce((t, x) => t + x.fp, 0) / g.length) * 10) / 10, n: g.length } : null;
}
import { normalizeSeasonLog, mergeLogs, completionRule, normalizePlayer } from "./normalize.js";
import { dayLabel, deadlineText, dateWindow } from "./calendar.js";
import { loadWeekInputs, LOAD_BUDGET } from "./load.js";
import { tonightFromBoard } from "./sequence.js"; // lockin-sequence
import { DISPLAY_TZ } from "./calendar.js"; // lockin-fixes
import { applyMatchupLayer, availabilityPerGame } from "./matchup.js"; // lockin-opponent
import { assumedLockState, normaliseAssume } from "./assume.js"; // lockin-assume
import { recalibrateBeat } from "./recalibrate.js"; // lockin-opponent
import { availabilityOf, heldValueFor } from "./availability.js"; // lockin-sequence

export const MODEL_INFO = Object.freeze({
  params: MODEL,
  context: CONTEXT,
  fit: { method: "EWMA half-life 5 games + last-30 shape x1.12", r2: 0.42, residualSd: 7.0, n: 21757, autocorrelation: 0.02 },
  calibration: {
    window: "2026 games to 2026-11-16, players with >=10 prior played games",
    n: 3039,
    quantileCoverage: { 0.1: 0.114, 0.25: 0.279, 0.5: 0.542, 0.75: 0.783, 0.9: 0.912 },
    insideRange10to90: 0.798,
    pLaterBeatsIfPlays: "over-states by 2.0 to 6.7 percentage points across five bins (n=3,039)",
    pLaterBeats: "with play probability, over-states by up to 13.3 percentage points in the 0.6-0.8 bin (n=731 of 4,109); within 3 percentage points below 0.6",
    source: "scripts/lockin/calibration.mjs through lib/lockin, 2026-11-16, n=3,039",
  },
  notInForecast: [
    "opponent history (partial rho 0.026, n=18,812)",
    "teammate absence (+1.7 points on average, n=6,432 games; not estimable per player, split-half r 0.15)",
    "home/away (+0.19, null)",
  ],
  lockStateNote: "Sleeper does not expose lock state. Locked is certain only when the banked score differs from the latest completed game and matches an earlier one; otherwise it is unknown until his next tip.",
  injuryNote: "Injury status comes from /players/nba; its refresh cadence is unmeasured.",
});

export const LEAN_RECORD = Object.freeze({
  policy: "Lineup-aware nightly assignment (study policy v)",
  gainPerTeamWeek: 9.4,
  interval95: [5.5, 14.7],
  intervalMethod: "cluster bootstrap by team-season, 28 clusters, 2,000 resamples",
  n: 240,
  unit: "active team-weeks (no empty slot, no slot without a game, no slot banked 0 when the player had played)",
  sample: "2025 weeks 1-23 and 2026 weeks 1-3",
  comparedWith: "points the managers actually banked",
  perPlayerRule: { gainPerTeamWeek: 10.0, interval95: [8.1, 12.5], n: 240 },
  rotationCaveat:
    "Sleeper does not record mid-week lineup moves. If each starter could only have been locked from the game his manager banked, the per-player rule's gain falls to +0.8 [+0.3, +1.5] per team-week. The lineup-aware policy builds its own rotation and does not rest on that assumption.",
  availabilityCaveat:
    "The backtest knew whether each player would play his next game (the injury report at the deadline). Without it the per-player rule's gain was +6.5 [+4.4, +9.0].",
  reproduction: {
    lineupAware: { gainPerTeamWeek: 9.57, interval95: [5.7, 14.7], identicalTeamWeeks: 229 },
    perPlayerRule: { gainPerTeamWeek: 9.97, interval95: [8.1, 12.4], identicalTeamWeeks: 236 },
    n: 240,
    by: "scripts/lockin/replay.mjs through lib/lockin, 2026-11-16, n=240 team-weeks",
  },
  source: "lock-in study 2026-11-16 (scripts/lockin/backtest.cjs, summarize.cjs)",
});

const OUT_RE = /^(out|suspension|suspended|inactive)$/i;
const LIKELY_OUT_RE = /^(out|doubtful|suspension|suspended|inactive)$/i;
const CONF = { marginal: 0.25, moderate: 0.75 };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const NOT_DONE = new Set(["pre_game", "postponed", "in_game"]);

/** Fetch and assemble. fetchJson: (url, { schema, immutable }) => Promise<data>. */
export async function buildWeekDesk({ rosterId, leagueId, fetchJson, now = new Date(), week = null, players = null, budget = {}, assume = null }) {
  const t0 = Date.now();
  const inputs = await loadWeekInputs({ fetchJson, leagueId, rosterId, now, week, players, budget });
  const desk = assembleDesk(inputs, { rosterId, leagueId, now, assume });
  desk.requests.wallMs = Date.now() - t0;
  return desk;
}

function shell(L, { rosterId, leagueId, now }) {
  return {
    version: 1,
    status: "unavailable",
    inSeason: false,
    message: "",
    generatedAt: now.toISOString(),
    today: L.today,
    leagueId: leagueId ?? L.league?.league_id ?? null,
    season: L.league?.season ?? null,
    rosterId: Number(rosterId),
    week: null,
    weekSource: null,
    dateWindow: null,
    nextWeek: null,
    slots: [],
    cards: [],
    excluded: [],
    slotPressure: null,
    displayTz: DISPLAY_TZ, // lockin-fixes
    opponent: null, // lockin-opponent
    winProb: null,
    whatIf: null,
    history: null,
    gaps: L.gaps,
    requests: {
      count: L.requests.length,
      budget: L.budgetMax ?? LOAD_BUDGET.maxRequests,
      immutable: L.requests.filter((r) => r.immutable).length,
      wallMs: null,
    },
    model: MODEL_INFO,
    leanRecord: LEAN_RECORD,
  };
}

/** Pure: loader output -> WeekDesk. */
export function assembleDesk(L, { rosterId, leagueId = null, now = new Date(), assume = null }) {
  const desk = shell(L, { rosterId, leagueId, now });
  const R = L.resolved;
  const inSeason = L.league?.status === "in_season" && L.state?.season_type === "regular";
  desk.inSeason = !!inSeason;
  if (R.kind === "unavailable") {
    desk.message = `Lock-in data unavailable: ${R.reason}.`;
    return desk;
  }
  if (R.kind === "offseason") {
    desk.status = "offseason";
    desk.message = "No lock-in week is being played.";
    return desk;
  }
  if (R.kind === "between_weeks") {
    desk.status = "between_weeks";
    desk.week = R.completedWeek;
    desk.nextWeek = { week: R.nextWeek, start: R.nextWeekStart };
    desk.message = `Week ${R.completedWeek} is complete. Week ${R.nextWeek} starts ${dayLabel(R.nextWeekStart)} ${R.nextWeekStart}.`;
    desk.betweenWeeks = betweenWeeksView(L, desk.rosterId, R);
    return desk;
  }
  desk.week = R.week;
  desk.weekSource = R.source;
  desk.dateWindow = dateWindow(L.scheduleIdx, R.week);
  if (!L.matchup) {
    desk.status = L.matchups ? "no_matchup" : "unavailable";
    desk.message = L.matchups ? `Roster ${rosterId} has no matchup in week ${R.week}.` : "Lock-in data unavailable: matchups not loaded.";
    return desk;
  }
  desk.status = "in_season";
  // lockin-assume: the viewer's lock-state assumptions. With none the desk is built exactly as
  // before. With some, a baseline pass without them runs first (simulating only the plan and
  // the opponent; the main pass reuses whichever side has no assumption).
  const slotCount = (L.league.roster_positions || []).filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI").length;
  const list = normaliseAssume(assume, { slotCount });
  if (!list.length) return buildBoard(desk, L);
  const base = buildBoard({ ...shell(L, { rosterId, leagueId, now }), gaps: [...L.gaps], status: desk.status, inSeason: desk.inSeason, week: desk.week, weekSource: desk.weekSource, dateWindow: desk.dateWindow }, L, { baselineOnly: true });
  return buildBoard(desk, L, { assume: list, baseline: base.baselineSims });
}

/**
 * Between weeks: last week's final score against the opponent, and the roster's first
 * games of the next week (IR and taxi left out). Either part is null when its data
 * did not load.
 */
export function betweenWeeksView(L, rosterId, R) {
  const rows = L.lastMatchups || null;
  const mine = rows?.find((m) => m.roster_id === rosterId) ?? null;
  const opp = mine && mine.matchup_id != null ? rows.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== rosterId) ?? null : null;
  const result =
    mine && opp && mine.points != null && opp.points != null
      ? { week: R.completedWeek, points: r1(mine.points), opponentPoints: r1(opp.points), opponentRosterId: opp.roster_id, outcome: mine.points > opp.points ? "won" : mine.points < opp.points ? "lost" : "tied" }
      : null;
  const dir = playerDirectory(L);
  const roster = (L.rosters || []).find((r) => r.roster_id === rosterId) ?? null;
  let firstGames = null;
  if (roster && L.scheduleIdx) {
    const skip = new Set([...(roster.reserve || []), ...(roster.taxi || [])]);
    const byDate = new Map();
    for (const pid of roster.players || []) {
      if (skip.has(pid)) continue;
      const who = dir.get(pid);
      if (!who?.team) continue;
      const g = (L.scheduleIdx.teamWeek.get(`${who.team}|${R.nextWeek}`) || [])[0];
      if (!g) continue;
      if (!byDate.has(g.date)) byDate.set(g.date, []);
      byDate.get(g.date).push({ playerId: pid, name: who.name ?? `Player ${pid}`, team: who.team, opponent: g.home === who.team ? g.away : g.home });
    }
    const dates = [...byDate.keys()].sort();
    firstGames = dates.length ? { date: dates[0], day: dayLabel(dates[0]), players: byDate.get(dates[0]).sort((a, b) => a.name.localeCompare(b.name)) } : null;
  }
  return { result, firstGames };
}

function playerDirectory(L) {
  const out = new Map();
  if (L.playersInjected) for (const [id, p] of Object.entries(L.playersInjected)) out.set(id, p);
  else if (L.playersRaw) for (const [id, p] of Object.entries(L.playersRaw)) { const n = normalizePlayer(id, p); if (n) out.set(id, n); }
  return out;
}

function buildBoard(desk, L, { assume = [], baselineOnly = false, baseline = null } = {}) {
  const today = L.today;
  const week = desk.week;
  const S = L.scheduleIdx;
  const dir = playerDirectory(L);
  const nameOf = (id) => dir.get(id)?.name ?? null;
  const isComplete = completionRule(S, L.season);
  const labels = (L.league.roster_positions || []).filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI");
  const m = L.matchup;
  const starters = m.starters || [];
  const sp = m.starters_points || [];
  const roster = (L.rosters || []).find((r) => r.roster_id === desk.rosterId);

  desk.excluded = (L.excluded || []).map((id) => ({
    playerId: id,
    name: nameOf(id) ?? `Player ${id}`,
    reason: (roster?.taxi || []).includes(id) ? "taxi" : "reserve",
  }));

  // per-player facts
  const P = new Map();
  for (const pid of L.playerIds || []) {
    const raw = L.logsRaw?.[pid] || {};
    const who = dir.get(pid);
    if (!who) desk.gaps.push({ source: "players", subject: pid, url: null, code: "player_unknown", message: "not in /players/nba; name and positions unknown" });
    const parts = [];
    if (raw.current) parts.push(normalizeSeasonLog(raw.current, { playerId: pid, season: L.season, scoring: L.league.scoring_settings, isComplete }));
    else desk.gaps.push({ source: "playerLog", subject: pid, url: null, code: "log_missing", message: `${L.season} game log not loaded; no forecast or week games` });
    if (raw.prior) parts.push(normalizeSeasonLog(raw.prior, { playerId: pid, season: L.prevSeason, scoring: L.league.scoring_settings, isComplete }));
    // lockin-opponent: second prior season (opponent history, early-season shape)
    if (raw.prior2) parts.push(normalizeSeasonLog(raw.prior2, { playerId: pid, season: L.prevSeason2, scoring: L.league.scoring_settings, isComplete }));
    const log = mergeLogs(...parts);
    const cur = log.filter((g) => g.season === L.season && g.team);
    const team = cur.length ? cur[cur.length - 1].team : (who?.team ?? null);
    if (!team) desk.gaps.push({ source: "model", subject: pid, url: null, code: "team_unknown", message: "no NBA team; week games unknown" });
    const byGame = new Map(log.filter((g) => g.gameId).map((g) => [g.gameId, g]));
    const tw = team ? S.teamWeek.get(`${team}|${week}`) || [] : [];
    const weekGames = tw.map((g) => {
      const row = byGame.get(g.gameId) || null;
      const opp = g.home === team ? g.away : g.home;
      const final = g.status === "complete";
      return {
        gameId: g.gameId,
        date: g.date,
        day: dayLabel(g.date),
        opponent: opp,
        away: g.away === team,
        status: g.status,
        played: final && row ? row.sp > 0 : null,
        fp: final && row ? (row.sp > 0 ? row.fp : 0) : null,
        minutes: final && row ? r1(row.min) : null,
        row,
      };
    });
    const remaining = weekGames.filter((g) => g.status === "pre_game" || g.status === "postponed");
    const live = weekGames.find((g) => g.status === "in_game") || null;
    P.set(pid, { pid, who, log, team, weekGames, remaining, live, nextGame: remaining[0] || null, noData: !raw.current || !team });
  }

  // slots and lock state
  const slotOf = new Map();
  const mineAssume = new Map(assume.filter((a) => a.side === "mine").map((a) => [a.slot, a]));
  const applied = [];
  desk.slots = labels.map((label, i) => {
    const pid = starters[i] && starters[i] !== "0" ? starters[i] : null;
    const banked = pid ? (sp[i] ?? 0) : null;
    const p = pid ? P.get(pid) : null;
    let ls = pid
      ? inferLockState(banked, (p?.weekGames || []).map((g) => ({ status: g.status, row: g.row })))
      : { state: null, reason: "empty_slot", certain: false, score: null };
    let assumedScore = null;
    if (mineAssume.has(i)) {
      const e = mineAssume.get(i);
      const a = assumedLockState(ls, e.state, { banked, gamesLeft: p && !p.noData ? p.remaining.length : 0, live: !!p?.live, score: e.score ?? null });
      applied.push({ side: "mine", slot: i, state: e.state, score: e.score ?? null, label, playerId: pid, banked, inferred: ls.state, inferredReason: ls.reason, contradicts: a.contradicts });
      ls = a.ls;
      if (a.ls.typed) assumedScore = a.ls.score;
    }
    if (pid) slotOf.set(pid, { index: i, label, banked, ls });
    return { index: i, label, playerId: pid, name: pid ? (nameOf(pid) ?? `Player ${pid}`) : null, banked, lockState: ls.state, lockStateReason: ls.reason, lockCertain: ls.certain, ...(assumedScore != null ? { assumedScore } : {}) };
  });

  // classify each player
  const nextNight = [...P.values()].map((p) => p.nextGame?.date).filter(Boolean).sort()[0] || null;
  const models = new Map();
  const modelFor = (pid, date) => {
    const k = `${pid}|${date}`;
    if (!models.has(k)) models.set(k, playerModel(P.get(pid).log, date));
    return models.get(k);
  };
  const injuryOf = (p) => p.who?.injuryStatus ?? null;
  const playsNextFlag = (p) => !OUT_RE.test(injuryOf(p) || "");
  const policyGames = (p) => p.remaining.map((g, i) => ({ date: g.date, plays: i === 0 ? playsNextFlag(p) : null }));

  const info = new Map();
  for (const p of P.values()) {
    const slot = slotOf.get(p.pid) || null;
    const k = p.remaining.length;
    const asOf = p.nextGame?.date ?? (p.live ? p.live.date : null);
    const mdl = asOf ? modelFor(p.pid, asOf) : null;
    let kind = "none";
    let noneCode = null;
    let x = null;
    if (p.noData) noneCode = "no_model";
    else if (slot) {
      const st = slot.ls.state;
      if (st === "locked") noneCode = slot.ls.reason === "assumed_locked" ? "assumed_locked" : "already_locked";
      else if (p.live) noneCode = "game_in_progress";
      else if (st === "unknown_until_next_tip") {
        x = slot.banked;
        if (k >= 1) kind = "lock_or_hold";
        else noneCode = "no_games_left";
      } else if (st === "reset") {
        noneCode = "score_is_zero";
        if (k >= 1) kind = "lineup";
      } else if (slot.ls.reason === "no_game_yet" || slot.ls.reason === "no_game_played_yet") {
        noneCode = "has_not_played_this_week";
        if (k >= 1) kind = "lineup";
        else noneCode = "no_games_left";
      } else if (slot.ls.reason === "final_game_score_stands") noneCode = "no_games_left";
      else noneCode = "lock_state_unresolved";
    } else {
      noneCode = p.live && k === 0 ? "game_in_progress" : "bench";
      if (k >= 1) kind = "lineup";
    }
    info.set(p.pid, { p, slot, k, mdl, kind, noneCode, x });
  }

  // policy lean (feeds only the lean field)
  const openLabels = desk.slots.filter((s) => s.lockState !== "locked").map((s) => s.label);
  const holderIds = [...info.values()].filter((v) => v.kind === "lock_or_hold" && v.mdl).map((v) => v.p.pid);
  const modelAt = (pid, date) => modelFor(pid, date);
  const pview = (v) => ({
    id: v.p.pid,
    positions: v.p.who?.positions || [],
    games: policyGames(v.p),
    x: v.kind === "lock_or_hold" ? v.x : v.noneCode === "score_is_zero" ? 0 : null,
    inSlot: !!v.slot && (v.kind === "lock_or_hold" || v.noneCode === "score_is_zero"),
    done: false,
  });
  const otherVs = [...info.values()].filter((v) => v.kind !== "lock_or_hold" && v.p.remaining.length && v.slot?.ls.state !== "locked" && !v.p.live);
  let choice = null;
  let assignment = null;
  if (holderIds.length && nextNight) {
    const holders = holderIds.map((id) => {
      const v = info.get(id);
      const pv = pview(v);
      // D137: his chance of playing his next game (the play model, the listing for an Out)
      // weights the hold value, as every figure on his card already does
      const mdl = modelAt(v.p.pid, v.p.remaining[0]?.date);
      const av = mdl ? availabilityPerGame(v.p, mdl, injuryOf(v.p)) : null;
      if (av?.perGame?.[0] && pv.games[0]) pv.games[0] = { ...pv.games[0], p: av.perGame[0].pPlay };
      pv.holdW = holderHoldValue(pv, 0, modelAt);
      return pv;
    });
    choice = chooseLocks({ openLabels, holders, others: otherVs.map(pview), dn: nextNight, modelAt });
  }
  if (nextNight && openLabels.length) {
    const cand = [...info.values()].filter((v) => v.p.remaining.length && v.slot?.ls.state !== "locked" && !v.p.live).map(pview);
    const playsOn = (pv, d) => pv.games.some((g) => g.date === d && g.plays === true);
    const a = assignTonight({ openLabels, cand, d: nextNight, modelAt, playsOn });
    const bySlot = new Map([...a.assigned].map(([id, i]) => [i, id]));
    assignment = openLabels.map((l, i) => ({ slotLabel: l, playerId: bySlot.get(i) ?? null }));
  }

  const toPlay = [...info.values()].filter((v) => v.p.remaining.length && v.slot?.ls.state !== "locked");
  const pressureSummary = slotPressureSummary(desk.slots, (pid) => P.get(pid)?.remaining.length ?? 0, toPlay.length, toPlay.reduce((s, v) => s + v.p.remaining.length, 0));

  // cards
  const cards = [];
  for (const v of info.values()) {
    const { p, slot, k, mdl } = v;
    const injury = p.who ? { status: p.who.injuryStatus ?? null, bodyPart: p.who.injuryBodyPart ?? null } : null;
    const forecast = mdl ? forecastOf(mdl) : null;
    let stopping = null;
    if (v.kind === "lock_or_hold" && mdl) {
      // lockin-sequence: GTD/DTD listings weight both branches by the measured listed play rate
      const av = availabilityOf(injuryOf(p));
      const sv = stoppingView(mdl, v.x, k, av.playsNext === false ? false : true);
      stopping = {
        x: v.x,
        k,
        expectedIfHeld: r1(heldValueFor(sv.expectedIfHeldPlays, sv.expectedIfHeldOut, av)),
        expectedIfHeldPlays: r1(sv.expectedIfHeldPlays),
        expectedIfHeldOut: r1(sv.expectedIfHeldOut),
        availabilityAssumed: av.assumed,
        listedPlayRate: av.rate,
        // lockin-opponent: recalibrated on real lock situations (recalibrate.js); raw kept
        pLaterBeats: r3(recalibrateBeat(sv.pLaterBeats)),
        pLaterBeatsModel: r3(sv.pLaterBeats),
        pLaterBeatsIfPlays: r3(recalibrateBeat(probLaterBeats(mdl.dist.sample, v.x, k, 1))),
        n: mdl.dist.n,
      };
    }
    const hazards = hazardsFor(v, injury);
    const nextG = p.nextGame;
    const decision = decisionOf(v, nextG, today);
    const urgencyRank = hazards.length ? 0 : v.kind === "lock_or_hold" ? 1 : v.kind === "lineup" ? 2 : 3;
    const lean = leanFor(v, stopping, mdl, choice, pressureSummary, nextNight);
    cards.push({
      playerId: p.pid,
      name: nameOf(p.pid) ?? `Player ${p.pid}`,
      team: p.team,
      positions: p.who?.positions || [],
      role: slot ? "starter" : "bench",
      slotIndex: slot ? slot.index : null,
      slotLabel: slot ? slot.label : null,
      injury,
      banked: slot ? slot.banked : null,
      lockState: slot ? { state: slot.ls.state, reason: slot.ls.reason, certain: slot.ls.certain } : null,
      weekGames: p.weekGames.map(gameRef),
      gamesLeft: k,
      nextGame: nextG ? gameRef(nextG) : null,
      decision,
      hazards,
      urgencyRank,
      forecast,
      stopping,
      lean,
      series: annotatedSeries(p.log, { schedule: S, nameOf, asOf: null }),
      opponentHistory: nextG ? opponentMeetings(p.log, nextG.opponent, nextG.date) : null,
      // past meetings with each team he still faces this week (history only)
      opponentsAhead: (p.remaining || []).filter((g) => g.opponent).map((g) => ({ date: g.date, day: g.day, away: g.away, ...opponentMeetings(p.log, g.opponent, g.date) })),
      seasonAverage: seasonAverageOf(p.log, L.season),
    });
  }
  cards.sort(
    (a, b) =>
      a.urgencyRank - b.urgencyRank ||
      (a.decision.deadlineDate || "9999").localeCompare(b.decision.deadlineDate || "9999") ||
      (a.role === b.role ? 0 : a.role === "starter" ? -1 : 1) ||
      (a.slotIndex ?? 99) - (b.slotIndex ?? 99) ||
      a.name.localeCompare(b.name),
  );
  desk.cards = cards;

  // pressure grid
  const nightDates = [...new Set([...P.values()].flatMap((p) => p.weekGames.map((g) => g.date)))].sort();
  desk.slotPressure = {
    summary: pressureSummary,
    nights: nightDates.map((d) => {
      const cells = {};
      let withGame = 0;
      for (const p of P.values()) {
        const g = p.weekGames.find((x) => x.date === d);
        cells[p.pid] = g
          ? { game: true, opponent: g.opponent, status: g.status, played: g.played, fp: g.fp }
          : { game: false, opponent: null, status: null, played: null, fp: null };
        if (g && NOT_DONE.has(g.status) && slotOf.get(p.pid)?.ls.state !== "locked") withGame++;
      }
      const stillToPlay = toPlay.filter((v) => v.p.remaining.some((g) => g.date >= d)).length;
      const past = [...P.values()].every((p) => !p.weekGames.some((g) => g.date === d && NOT_DONE.has(g.status)));
      return { date: d, day: dayLabel(d), past, playersWithGame: withGame, playersStillToPlay: past ? 0 : stillToPlay, cells };
    }),
    rowOrder: cards.map((c) => c.playerId),
    policy: assignment ? { nextNight, assignment } : null,
  };
  // lockin-sequence: tonight's tip-ordered decisions (optional field, see sequence.js)
  desk.tonight = tonightFromBoard({ L, P, info, slots: desk.slots, modelFor, nowMs: Date.parse(desk.generatedAt) });
  // lockin-opponent: head-to-head layer (opponent, win probability, what-if, history)
  applyMatchupLayer({ L, desk, P, info, modelFor, dir, nameOf, assume, applied, baselineOnly, baseline });
  return desk;
}

const ZERO_REASONS = new Set(["latest_game_dnp", "no_game_yet", "no_game_played_yet"]);

/**
 * Open slots: ones that can still bank a different game. Certainly open: empty, or
 * holding 0 (reset or not yet played), whether or not that player has games left, since
 * a swap fills it. Possibly open: an unknown lock state whose player still has a game.
 * Not open: locked, a nonzero score whose player has no games left, or a slot tracking
 * his final game of the week while it is in progress.
 */
export function slotPressureSummary(slots, gamesLeftOf, playersStillToPlay, gamesRemaining) {
  let lockedCertain = 0;
  let open = 0;
  let maybe = 0;
  let settled = 0;
  for (const s of slots) {
    if (!s.playerId) open++;
    else if (s.lockState === "locked") lockedCertain++;
    else if (s.lockStateReason === "reset_at_tip_now_tracking_live_game") {
      if (gamesLeftOf(s.playerId) > 0) open++;
      else settled++;
    }
    else if (s.lockState === "reset" || ZERO_REASONS.has(s.lockStateReason)) open++;
    else if (gamesLeftOf(s.playerId) > 0) maybe++;
    else settled++;
  }
  const holdingUnknown = slots.filter((s) => s.lockState === "unknown_until_next_tip" && gamesLeftOf(s.playerId) > 0).length;
  const summary = { lockedCertain, holdingUnknown, settled, openMax: open + maybe, openMin: open, playersStillToPlay, gamesRemaining };
  const who = `${plural(playersStillToPlay, "player")} still to play`;
  summary.text =
    maybe === 0
      ? `${plural(open, "open slot")}, ${who}`
      : `${open}-${open + maybe} open slots (lock state unknown for ${maybe}), ${who}`;
  return summary;
}

function gameRef(g) {
  return { date: g.date, day: g.day, opponent: g.opponent, away: g.away, status: g.status, played: g.played, fp: g.fp, minutes: g.minutes };
}

function forecastOf(mdl) {
  const d = mdl.dist;
  const range = nextGameRange(d);
  return {
    mean: r1(d.mean),
    sd: r1(d.sd),
    range: { p10: r1(range.p10), p90: r1(range.p90) },
    n: d.n,
    shapeN: d.shapeN,
    basis: d.basis,
    playProbability: { value: r3(mdl.q.value), nRows: mdl.q.nRows, played: mdl.q.played },
    shape: [...d.sample].sort((a, b) => a - b).map(r1),
  };
}

function decisionOf(v, nextG, today) {
  const dl = nextG ? deadlineText(nextG.date, today) : null;
  const base = { deadlineDate: nextG?.date ?? null, deadlineText: dl };
  if (v.kind === "lock_or_hold") return { kind: "lock_or_hold", text: `Lock ${fmt(v.x)} or hold it, ${dl}`, ...base };
  if (v.kind === "lineup") {
    const what = v.slot ? "Keep in the lineup or swap out" : "Move into a slot or leave on the bench";
    return { kind: "lineup", text: `${what}, ${dl}`, ...base };
  }
  const why = {
    no_games_left: "No games left this week",
    no_model: "Game log or team not loaded; see gaps",
    already_locked: "Locked",
    assumed_locked: "Assumed locked (your assumption)",
    game_in_progress: "Game in progress",
    lock_state_unresolved: "Score updating: the matchup and box score have not caught up with each other",
    bench: "No games left this week",
    score_is_zero: "Score is 0 and no games left this week",
    has_not_played_this_week: "No games left this week",
  }[v.noneCode] || "Nothing to decide";
  return { kind: "none", text: why, deadlineDate: null, deadlineText: null };
}

function hazardsFor(v, injury) {
  const out = [];
  const { p, slot, k } = v;
  if (!slot || slot.ls.state === "locked" || p.noData) return out;
  const st = injury?.status || "";
  const next = p.nextGame;
  if (v.kind === "lock_or_hold" && next && OUT_RE.test(st)) {
    out.push({
      code: "ruled_out_holding",
      text: `Listed ${st} for his next game (${next.day}). An unlocked score resets to 0 at that tip.`,
      deadlineDate: next.date,
    });
  } else if (k === 1 && next && LIKELY_OUT_RE.test(st)) {
    out.push({
      code: "final_game_likely_dnp",
      text: `Listed ${st}; his ${next.day} game is his last this week. A starter never locked scores that game, 0 if he does not play.`,
      deadlineDate: next.date,
    });
  }
  if (k === 0 && !p.live && (slot.ls.state === "reset" || slot.ls.reason === "no_game_yet" || slot.ls.reason === "no_game_played_yet")) {
    out.push({ code: "starter_no_games_left", text: "No games left this week; as the lineup stands, this slot scores 0.", deadlineDate: null });
  }
  return out;
}

function leanFor(v, stopping, mdl, choice, pressure, nextNight) {
  const none = (noneCode, reason) => ({ value: "none", reason, noneCode, confidence: null, marginSds: null, conditional: false, conditionalText: null, inputs: null });
  if (v.kind !== "lock_or_hold") {
    const reasons = {
      no_games_left: "No games left this week, so there is no decision.",
      already_locked: "Already locked.",
      assumed_locked: "You assumed this slot is locked, so there is no decision.",
      has_not_played_this_week: "He has not played this week, so there is no score to lock.",
      bench: "Bench games cannot be locked.",
      score_is_zero: "His score is 0, so there is nothing to lock.",
      game_in_progress: "His game is in progress; the decision comes after it.",
      lock_state_unresolved: "His score is updating; the lean returns once the matchup and box score agree.",
      no_model: "His game log or team did not load.",
    };
    return none(v.noneCode, reasons[v.noneCode] || "No decision.");
  }
  if (!stopping || !mdl || !choice) return none("no_model", "No forecast for this player.");
  const h = choice.perHolder.find((x) => x.id === v.p.pid);
  if (!h || h.valueIfLock == null || h.valueIfHold == null) return none("no_model", "The policy could not place him in an open slot.");
  const value = h.locks ? "lock" : "hold";
  const delta = h.valueIfLock - h.valueIfHold;
  const z = mdl.dist.sd > 0 ? Math.abs(delta) / mdl.dist.sd : null;
  const confidence = z == null ? null : z < CONF.marginal ? "marginal" : z < CONF.moderate ? "moderate" : "clear";
  const rule = perPlayerRuleLocks(mdl, stopping.x, stopping.k, stopping.availabilityAssumed === "listed_out" ? false : true) ? "lock" : "hold";
  let reason = `${fmt(stopping.x)} now against ${fmt(stopping.expectedIfHeld)} expected if held, ${plural(stopping.k, "game")} left`;
  if (rule !== value) reason += `; ${pressure.text}`;
  const conditional = v.slot?.ls.state === "unknown_until_next_tip";
  return {
    value,
    reason,
    noneCode: null,
    confidence,
    marginSds: z == null ? null : r3(z),
    conditional,
    conditionalText: conditional ? "Applies only if this score is not already locked; Sleeper does not show lock state." : null,
    inputs: {
      x: stopping.x,
      k: stopping.k,
      expectedIfHeld: stopping.expectedIfHeld,
      sd: r1(mdl.dist.sd),
      valueIfLock: r1(h.valueIfLock),
      valueIfHold: r1(h.valueIfHold),
      perPlayerRule: rule,
      openSlots: pressure.openMax,
      holders: choice.perHolder.length,
      playersStillToPlay: pressure.playersStillToPlay,
      nextNight,
      truncated: choice.truncated,
    },
  };
}
