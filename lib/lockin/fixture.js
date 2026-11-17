/**
 * Deterministic offline lock-in week for LEAGUE_PROVIDER=fixture, tests and e2e.
 * Synthetic players and teams (names are invented; filler starters are labelled as
 * such), served through the same injected fetchJson interface as the live API so the
 * loader and the desk run unchanged. Pass FIXTURE_NOW as `now`: the board is frozen
 * at Thursday noon ET of week 4 (2026-11-09 .. 2026-11-15).
 *
 * Week-4 cast (roster 1), one per desk case:
 *   PG  lk01 locked (banked Mon 40, latest Wed 28)
 *   SG  lk02 holding 31.5, one game left               -> lock or hold
 *   SF  lk03 holding 35, two left, listed Out          -> ruled_out_holding hazard
 *   PF  lk04 reset: played Tue, DNP Wed                 -> reset
 *   C   lk05 has not played yet (Thu, Sat)              -> lineup
 *   U   lk06 holding 26.5, final game Fri, Doubtful     -> final_game_likely_dnp hazard
 *   U   lk07 three games done, 21 stands                -> no decision
 *   bench lk08, lk09 (rookie, thin history), lk10 (done), lk11; IR lk12; taxi lk13
 */
export const FIXTURE_NOW = new Date("2026-11-12T17:00:00Z");
export const FIXTURE_ROSTER_ID = 1;
export const FIXTURE_LEAGUE_ID = "lockin-fixture-2026";
const SEASON = "2026";
const TODAY = "2026-11-12";
const WEEK1_MONDAY = "2026-10-19";

const SCORING = { ast: 1, blk: 2, bonus_pt_40p: 2, bonus_pt_50p: 2, dd: 1, ff: -2, pts: 0.5, reb: 1, stl: 2, td: 2, tf: -2, to: -1, tpm: 0.5 };
const POSITIONS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN"];
const POOL = ["ATL", "BKN", "CHA", "CHI", "CLE", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIN", "NOP", "PHI", "POR", "SAS"];

// id, name, team, positions, base mean, sd, minutes, week-4 offsets (0=Mon), week-4 completed results (fp | "DNP"), injury, joins week (rookie)
const CAST = /** @type {any[][]} */ ([
  ["lk01", "Avery Locke", "BOS", ["PG"], 34, 8, 35, [0, 2, 4], [40, 28], null],
  ["lk02", "Bryce Holden", "NYK", ["SG", "PG"], 27, 7, 33, [1, 2, 5], ["DNP", 31.5], null],
  ["lk03", "Cal Rivers", "DEN", ["SF"], 29, 7, 34, [0, 2, 4, 6], [22, 35], "Out"],
  ["lk04", "Dane Okafor", "MIL", ["PF"], 22, 6, 30, [1, 2, 5], [18.5, "DNP"], null],
  ["lk05", "Eli Brandt", "PHX", ["C"], 26, 7, 31, [3, 5], [], null],
  ["lk06", "Finn Mercer", "OKC", ["SF", "PF"], 21, 6, 29, [0, 2, 4], [12, 26.5], "Doubtful"],
  ["lk07", "Gus Tallis", "MIA", ["SG"], 20, 6, 28, [0, 1, 2], [19, 24.5, 21], null],
  ["lk08", "Hal Pruitt", "DAL", ["PG", "SG"], 19, 6, 27, [3, 5, 6], [], null],
  ["lk09", "Ike Novak", "SAC", ["C", "PF"], 14, 5, 20, [4, 6], [], null, 3],
  ["lk10", "Jon Vale", "ORL", ["SF"], 17, 6, 26, [0, 2], [15, 23], null],
  ["lk11", "Kip Arden", "UTA", ["PF", "C"], 16, 5, 24, [3, 6], [], null],
  ["lk12", "Lou Marsh", "TOR", ["SG"], 18, 6, 26, [1, 3, 5], ["DNP", "DNP"], "Out"],
  ["lk13", "Max Pell", "WAS", ["PG"], 10, 5, 16, [2, 4, 6], ["DNP"], null],

]).map(([id, name, team, positions, mean, sd, minutes, w4, w4results, injury, joinsWeek]) => ({ id, name, team, positions, mean, sd, minutes, w4, w4results, injury, joinsWeek: joinsWeek ?? 1 }));
const STARTERS = ["lk01", "lk02", "lk03", "lk04", "lk05", "lk06", "lk07"];
const RESERVE = ["lk12"];
const TAXI = ["lk13"];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const half = (x) => Math.max(0, Math.round(x * 2) / 2);

/** Stats that score to exactly `fp` under SCORING (no bonus keys). */
function statsFor(fp, minutes, ot = false) {
  const reb = Math.floor(fp * 0.25);
  const ast = Math.floor(fp * 0.15);
  const pts = Math.round(2 * (fp - reb - ast));
  const s = { pts, reb, ast, sp: Math.round(minutes * 60), min: minutes };
  if (ot) s.ot_sp = 180;
  return s;
}

function teamOffsets(c, week) {
  if (week === 4) return c.w4;
  return week === 1 ? [1, 3, 5] : [0, 2, 4, 6].filter((o) => (o + c.id.charCodeAt(3)) % 7 !== 3);
}

let built = null;
function build() {
  if (built) return built;
  const schedule = [];
  const logs = {};
  const filler = (team, n) => `fx-${team}-${n}`;
  const players = {};
  for (const c of CAST) {
    players[c.id] = { full_name: c.name, team: c.team, position: c.positions[0], fantasy_positions: c.positions, injury_status: c.injury, injury_body_part: c.injury ? "Ankle" : null };
    for (let n = 1; n <= 6; n++) players[filler(c.team, n)] = { full_name: `${c.team} Starter ${n}`, team: c.team, position: "SF", fantasy_positions: ["SF"], injury_status: null, injury_body_part: null };
  }
  for (const [ci, c] of CAST.entries()) {
    const r = rng(seedOf(c.id));
    const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const cur = {};
    let gi = 0;
    for (let week = 1; week <= 5; week++) {
      const monday = addDays(WEEK1_MONDAY, 7 * (week - 1));
      for (const off of teamOffsets(c, week)) {
        const date = addDays(monday, off);
        const opp = POOL[(ci * 7 + gi) % POOL.length];
        const home = gi % 2 === 0;
        const gameId = `fx-${SEASON}-${c.team}-${date}`;
        const status = date < TODAY ? "complete" : "pre_game";
        const ot = c.id === "lk02" && week === 3 && off === 4;
        // usual starters: the player (if he starts) plus fillers; NYK's filler 2 sits out Wed of week 4
        const starters = [c.id, filler(c.team, 1), filler(c.team, 2), filler(c.team, 3), filler(c.team, 4)];
        if (c.team === "NYK" && week === 4 && off === 2) starters[2] = filler(c.team, 6);
        const side = (team, st) => ({ team, points: status === "complete" ? 100 + ((gi * 7) % 25) : null, starters: status === "complete" ? st : [], scoring: ot ? [{ type: "quarter" }, { type: "overtime" }] : [{ type: "quarter" }] });
        schedule.push({
          game_id: gameId,
          week,
          date,
          status,
          home: home ? side(c.team, starters) : side(opp, []),
          away: home ? side(opp, []) : side(c.team, starters),
        });
        let stats = {};
        if (status === "complete" && week >= c.joinsWeek) {
          if (week === 4) {
            const res = c.w4results[c.w4.indexOf(off)];
            if (res !== "DNP" && res !== undefined) stats = statsFor(res, c.minutes);
          } else if (r() > 0.06) {
            const jump = c.id === "lk03" && week === 3 && off === 4;
            const min = Math.round((c.minutes + (jump ? 9 : 3 * gauss())) * 10) / 10;
            stats = statsFor(half(c.mean + c.sd * gauss() + (jump ? 10 : 0)), min, ot);
          }
        }
        if (week >= c.joinsWeek) (cur[week] ||= []).push({ date, game_id: gameId, team: c.team, opponent: opp, is_away_team: !home, updated_at: Date.parse(`${date}T23:30:00Z`), stats });
        gi++;
      }
    }
    const prior = {};
    if (c.joinsWeek === 1) {
      for (let i = 0; i < 40; i++) {
        const date = addDays("2026-01-05", 2 * i);
        const week = 12 + Math.floor(i / 4);
        const opp = POOL[(ci * 5 + i) % POOL.length];
        const played = r() > 0.08;
        const min = Math.round((c.minutes + 3 * gauss()) * 10) / 10;
        (prior[week] ||= []).push({ date, game_id: `fx-2025-${c.team}-${date}`, team: c.team, opponent: opp, is_away_team: i % 2 === 1, updated_at: Date.parse(`${date}T23:30:00Z`), stats: played ? statsFor(half(c.mean + c.sd * gauss()), min) : {} });
      }
    }
    logs[c.id] = { [SEASON]: cur, 2025: c.joinsWeek === 1 ? prior : [] };
  }
  const startersPoints = [40, 31.5, 35, 0, 0, 26.5, 21];
  built = {
    state: { week: 4, leg: 4, season: SEASON, season_type: "regular", display_week: 4 },
    league: { league_id: FIXTURE_LEAGUE_ID, season: SEASON, status: "in_season", roster_positions: POSITIONS, scoring_settings: SCORING, settings: { game_mode: 1, playoff_week_start: 21 } },
    rosters: [
      { roster_id: 1, players: CAST.map((c) => c.id), reserve: RESERVE, taxi: TAXI },
      { roster_id: 2, players: [], reserve: [], taxi: [] },
    ],
    matchups: {
      4: [
        { roster_id: 1, matchup_id: 1, starters: STARTERS, starters_points: startersPoints, players: CAST.map((c) => c.id), points: startersPoints.reduce((a, b) => a + b, 0) },
        { roster_id: 2, matchup_id: 1, starters: [], starters_points: [], players: [], points: 0 },
      ],
    },
    schedule,
    players,
    logs,
  };
  return built;
}

/** The synthetic week's raw payloads, for tests that want to inspect or mutate them. */
export function fixtureData() {
  return build();
}

/**
 * fetchJson for the synthetic week: (url, { schema }) => data. Any league id is accepted.
 * @param {string} url
 * @param {{ schema?: any, immutable?: boolean }} [opts]
 */
export async function fixtureFetchJson(url, { schema } = {}) {
  const d = build();
  const u = new URL(url);
  const p = u.pathname;
  let data;
  let m;
  if (p === "/v1/state/nba") data = d.state;
  else if (p === "/v1/players/nba") data = d.players;
  else if ((m = p.match(/^\/v1\/league\/[^/]+\/matchups\/(\d+)$/))) data = d.matchups[m[1]] ?? null;
  else if (/^\/v1\/league\/[^/]+\/rosters$/.test(p)) data = d.rosters;
  else if (/^\/v1\/league\/[^/]+$/.test(p)) data = d.league;
  else if ((m = p.match(/^\/schedule\/nba\/regular\/(\d+)$/))) data = m[1] === SEASON ? d.schedule : [];
  // lockin-sequence: scores feed with tip times; PHX tips first, UTA an hour later, DAL 150 min later
  else if ((m = p.match(/^\/scores\/nba\/regular\/(\d+)\/(\d+)$/)))
    data = m[1] !== SEASON ? [] : d.schedule.filter((g) => g.week === Number(m[2])).map((g) => {
      const team = g.game_id.split("-")[2];
      const offset = { PHX: 0, UTA: 60, DAL: 150 }[team] ?? 30;
      return { game_id: g.game_id, date: g.date, status: g.status, start_time: Date.parse(`${addDays(g.date, 1)}T00:00:00Z`) + offset * 60000 };
    });
  else if ((m = p.match(/^\/stats\/nba\/player\/([^/]+)$/))) {
    const season = u.searchParams.get("season");
    data = d.logs[m[1]]?.[season] ?? [];
  } else throw new Error(`fixture: no response for ${url}`);
  const copy = structuredClone(data);
  return schema ? schema.parse(copy) : copy;
}
