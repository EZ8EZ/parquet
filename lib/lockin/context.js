/**
 * Game context as facts only. Study 7b: these facts co-occur with outliers (minutes
 * jump 61% vs 17%, a usual top-3 teammate out 44% vs 29%, OT 8% vs 4%); they are
 * context, not cause, and the copy says only what happened. Opponent history carries
 * no forecast signal (partial rho 0.026) and never enters the model.
 */
import { isPlayed } from "./model.js";

export const CONTEXT = Object.freeze({
  seriesGames: 15,
  minutesWindow: 10,
  minutesJump: 5,
  starterWindow: 10,
  starterMinStarts: 8,
  meetings: 5,
});

const round1 = (x) => Math.round(x * 10) / 10;

/** Players who started >= 8 of the team's previous 10 completed games (schedule starting fives). */
export function usualStarters(teamGames, team, beforeDate) {
  const prev = (teamGames || []).filter((g) => g.status === "complete" && g.date < beforeDate);
  const last = prev.slice(-CONTEXT.starterWindow);
  if (last.length < CONTEXT.starterWindow) return null;
  const count = new Map();
  for (const g of last) for (const id of g.starters[team] || []) count.set(id, (count.get(id) || 0) + 1);
  return [...count].filter(([, c]) => c >= CONTEXT.starterMinStarts).map(([id]) => id);
}

/**
 * Last 15 played games with factual annotations.
 * schedule: indexSchedule() output (current season); nameOf(id) -> display name or null.
 */
export function annotatedSeries(log, { schedule, nameOf, asOf }) {
  const played = log.filter((g) => isPlayed(g) && (!asOf || g.date < asOf));
  const tail = played.slice(-CONTEXT.seriesGames);
  const offset = played.length - tail.length;
  const games = tail.map((g, i) => {
    const prior = played.slice(Math.max(0, offset + i - CONTEXT.minutesWindow), offset + i);
    const annotations = [];
    const sg = g.gameId ? schedule?.games.get(g.gameId) : null;
    if (g.ot || sg?.ot) annotations.push({ code: "overtime", text: "Overtime game" });
    let minutesAvg = null;
    if (prior.length === CONTEXT.minutesWindow) {
      minutesAvg = prior.reduce((s, x) => s + x.min, 0) / prior.length;
      const diff = g.min - minutesAvg;
      if (diff >= CONTEXT.minutesJump)
        annotations.push({
          code: "minutes_jump",
          text: `${round1(g.min)} min, ${round1(diff)} above his previous-10 average of ${round1(minutesAvg)}`,
          minutes: round1(g.min),
          baseline: round1(minutesAvg),
          n: prior.length,
        });
    }
    if (sg && g.team && (sg.starters[g.team] || []).length) {
      const usual = usualStarters(schedule.teamGames.get(g.team), g.team, g.date);
      if (usual) {
        const started = new Set(sg.starters[g.team]);
        for (const id of usual) {
          if (id === g.playerId || started.has(id)) continue;
          const name = nameOf(id);
          annotations.push({ code: "usual_starter_did_not_start", playerId: id, text: `${name || `Player ${id}`} did not start` });
        }
      }
    }
    return {
      date: g.date,
      season: g.season,
      opponent: g.opp,
      away: g.away,
      fp: g.fp,
      minutes: round1(g.min),
      minutesAvgPrev10: minutesAvg == null ? null : round1(minutesAvg),
      annotations,
    };
  });
  return { games, n: games.length, playedLoaded: played.length };
}

/** Up to the last 5 played games against `opponent`, before asOf. History only. */
export function opponentMeetings(log, opponent, asOf) {
  if (!opponent) return null;
  const all = log.filter((g) => isPlayed(g) && g.opp === opponent && (!asOf || g.date < asOf));
  const meetings = all.slice(-CONTEXT.meetings).map((g) => ({ date: g.date, season: g.season, fp: g.fp, minutes: round1(g.min) }));
  return { opponent, meetings, n: meetings.length, loadedSeasons: [...new Set(log.map((g) => g.season))].sort() };
}
