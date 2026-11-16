/**
 * Raw Sleeper payloads -> the plain shapes lib/lockin works on. Pure, no I/O.
 * Scoring goes through the regret ledger's scoreGame so there is one scorer.
 */
import { scoreGame } from "../lab/regret/index.js";

/**
 * Index the season schedule. Returns
 *   games:    gameId -> { gameId, week, date, status, home, away, ot, starters: {TEAM: ids} }
 *   teamWeek: "TEAM|week" -> games sorted by date
 *   teamGames: TEAM -> all games sorted by date
 */
export function indexSchedule(raw, season) {
  const games = new Map();
  const teamWeek = new Map();
  const teamGames = new Map();
  for (const g of raw || []) {
    if (!g || !g.game_id || !g.home?.team || !g.away?.team) continue;
    const ot = [g.home, g.away].some((s) => (s.scoring || []).some((q) => q.type === "overtime"));
    const row = {
      gameId: g.game_id,
      season,
      week: g.week,
      date: g.date,
      status: g.status,
      home: g.home.team,
      away: g.away.team,
      points: { [g.home.team]: g.home.points ?? null, [g.away.team]: g.away.points ?? null },
      ot,
      starters: { [g.home.team]: g.home.starters || [], [g.away.team]: g.away.starters || [] },
    };
    games.set(row.gameId, row);
    for (const t of [row.home, row.away]) {
      const k = `${t}|${row.week}`;
      if (!teamWeek.has(k)) teamWeek.set(k, []);
      teamWeek.get(k).push(row);
      if (!teamGames.has(t)) teamGames.set(t, []);
      teamGames.get(t).push(row);
    }
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  for (const v of teamWeek.values()) v.sort(byDate);
  for (const v of teamGames.values()) v.sort(byDate);
  return { games, teamWeek, teamGames };
}

/**
 * One season's per-game log for one player. `isComplete(row)` decides whether a row's
 * game is final; rows for future games and DNPs (sp=0) are kept and flagged.
 */
export function normalizeSeasonLog(raw, { playerId, season, scoring, isComplete }) {
  const out = [];
  if (!raw || Array.isArray(raw)) return out; // [] = no data for that season
  for (const [wk, games] of Object.entries(raw)) {
    for (const g of games || []) {
      if (!g || !g.date) continue;
      const st = g.stats || {};
      const sp = typeof st.sp === "number" ? st.sp : 0;
      const row = {
        playerId,
        season,
        week: Number(wk),
        date: g.date,
        gameId: g.game_id ?? null,
        team: g.team ?? null,
        opp: g.opponent ?? null,
        away: g.is_away_team ?? null,
        sp,
        min: sp / 60,
        fp: scoreGame(st, scoring),
        ot: (st.ot_sp || 0) > 0,
        updatedAt: g.updated_at ?? null,
      };
      row.complete = isComplete(row);
      out.push(row);
    }
  }
  return out;
}

/** Merge season logs into one date-sorted log (duplicate game ids dropped). */
export function mergeLogs(...logs) {
  const seen = new Set();
  const out = [];
  for (const g of logs.flat()) {
    const k = g.gameId ? `${g.gameId}` : `${g.date}|${g.opp}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(g);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Completion rule: a game in the loaded schedule is final iff its status is "complete"; a
 *  past season not in the schedule is final; otherwise not. */
export function completionRule(schedule, currentSeason) {
  return (row) => {
    const g = row.gameId ? schedule?.games.get(row.gameId) : null;
    if (g) return g.status === "complete";
    return Number(row.season) < Number(currentSeason);
  };
}

/** Sleeper /players/nba entry -> the fields the desk reads. */
export function normalizePlayer(id, p) {
  if (!p) return null;
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
  return {
    id,
    name,
    team: p.team ?? null,
    positions: p.fantasy_positions || (p.position ? [p.position] : []),
    injuryStatus: p.injury_status ?? null,
    injuryBodyPart: p.injury_body_part ?? null,
  };
}
