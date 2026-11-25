/**
 * What-if locks that stay put (D141). A viewer who marks a slot, theirs or the opponent's,
 * as locked or playing on keeps that mark across visits until they change it, press Reset,
 * pick another team, or the week ends. Typed hypothetical scores are explorations and are
 * not kept.
 *
 * Stored in a plain cookie the browser writes when the what-if changes (useAssumeNav) and
 * the server reads when the URL carries no ?assume= (app/page.jsx, app/lockin/page.jsx):
 * "<rosterId>~<expires ms>~<tokens>", tokens as in ?assume= (m4L,t2O). It expires at the
 * next Monday 16:00 UTC (noon Eastern in summer, 11:00 in winter), before any game of the
 * next lock-in week, since slot numbers mean other players then. The board still validates
 * every token against the live data (validAssume), so a mark that no longer fits is dropped.
 */
import { normaliseAssume, serialiseAssume } from "./assume.js";

export const SAVED_ASSUME_COOKIE = "parquet_whatif";

/** The next Monday 16:00 UTC strictly after `now` (ms). */
export function weekEndMs(now = Date.now()) {
  const d = new Date(now);
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((8 - d.getUTCDay()) % 7), 16));
  if (mon.getTime() <= now) mon.setUTCDate(mon.getUTCDate() + 7);
  return mon.getTime();
}

/** Lock and play-on marks only (typed scores dropped). */
export function keptMarks(list) {
  return normaliseAssume((list || []).filter((a) => a && a.score == null));
}

/** Cookie value for a roster's marks, or null when there is nothing to keep. */
export function encodeSaved(rosterId, list, now = Date.now()) {
  const tokens = serialiseAssume(keptMarks(list));
  if (!tokens || !Number.isInteger(Number(rosterId))) return null;
  return `${Number(rosterId)}~${weekEndMs(now)}~${tokens}`;
}

/** The ?assume= string saved for this roster, or null (other roster, expired, malformed). */
export function decodeSaved(value, rosterId, now = Date.now()) {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,3})~(\d{10,14})~([A-Za-z0-9.,]{1,200})$/.exec(decodeURIComponent(value));
  if (!m || Number(m[1]) !== Number(rosterId) || Number(m[2]) <= now) return null;
  return m[3];
}
