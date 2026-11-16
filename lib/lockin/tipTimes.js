/**
 * Tip times. Sleeper's schedule endpoint has dates only, but its (undocumented) scores
 * feed `GET /scores/nba/regular/{season}/{week}` carries `start_time` (epoch ms) under the
 * same game_id. Checked 2026-11-16: start_time on 566/566 games across 2026 weeks 1-5 and
 * 2025 weeks 1, 8, 18, 23; ids identical to the schedule's (248/248); all 8 games that
 * night matched ESPN's scoreboard to the minute. ~65-180 KB a week.
 * Fallback when the feed fails: a FUTURE game's row in a player log is created at the
 * scheduled tip (study: 191/192 on :00 or :30 UTC), so its updated_at is a tip proxy.
 * After the game, updated_at is the last stat update and says nothing about the tip.
 */
import { z } from "zod";

export const urlTips = (season, week) => `https://api.sleeper.app/scores/nba/regular/${season}/${week}`;

export const tipsSchema = z.array(
  z.object({
    game_id: z.string(),
    date: z.string().nullish(),
    status: z.string().nullish(),
    start_time: z.number().nullish(),
    metadata: z
      .object({
        scheduled: z.string().nullish(),
        home_team: z.object({ team: z.string().nullish() }).nullish(),
        away_team: z.object({ team: z.string().nullish() }).nullish(),
      })
      .nullish(),
  }),
);

/**
 * Scores feed -> Map gameId -> { startMs, source }. Games the schedule marks postponed get
 * no tip (the feed's behaviour on postponement is unobserved), so they sort as unknown.
 */
export function indexTips(raw, scheduleIdx = null) {
  const out = new Map();
  for (const g of raw || []) {
    const sched = scheduleIdx?.games.get(g.game_id);
    if (sched && (sched.status === "postponed" || sched.status === "canceled")) continue;
    let ms = typeof g.start_time === "number" ? g.start_time : null;
    if (ms == null && g.metadata?.scheduled) {
      const p = Date.parse(g.metadata.scheduled);
      if (Number.isFinite(p)) ms = p;
    }
    if (ms != null) out.set(g.game_id, { startMs: ms, source: "sleeper_scores" });
  }
  return out;
}

/** Proxy tips from log rows of games not yet final: updated_at at the scheduled tip. */
export function proxyTipsFromLogs(rows, scheduleIdx) {
  const out = new Map();
  for (const r of rows) {
    if (!r.gameId || r.complete || out.has(r.gameId)) continue;
    const g = scheduleIdx?.games.get(r.gameId);
    if (!g || g.status !== "pre_game") continue;
    const ms = typeof r.updatedAt === "number" ? r.updatedAt : Number(r.updatedAt);
    if (!Number.isFinite(ms)) continue;
    const onHalfHour = Math.round(ms / 60000) % 30 === 0;
    if (onHalfHour) out.set(r.gameId, { startMs: ms, source: "log_row_proxy" });
  }
  return out;
}

/** "7:30 PM ET" for an epoch ms. */
export function tipLabel(ms) {
  if (ms == null) return null;
  const t = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  return `${t} ET`;
}

/** Fetch the week's tips through the desk's requester; a failure is a gap, never silent. */
export async function loadTips(rq, season, week) {
  return rq.get("scores", urlTips(season, week), tipsSchema);
}
