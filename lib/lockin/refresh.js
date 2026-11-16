"use server";
import { updateTag } from "next/cache";
import { readLensRosterId } from "../auth/server.js";
import { getLeagueHistory } from "../history.js";
import { planRefreshLive } from "./source.js";

/**
 * Server action behind the refresh control: expires only what can have changed tonight
 * (see planRefresh), so the next render reads it from Sleeper and reuses the rest.
 * updateTag (not revalidateTag) because the very next render must wait for fresh data.
 * The roster is the validated team cookie, never a client-supplied id; the action takes
 * no arguments. Rate-limited per roster to one per 20 s (planRefresh).
 */
export async function refreshLockDesk() {
  const lens = await readLensRosterId();
  if (lens == null) return { ok: false, reason: "invalid", retryInMs: 0 };
  const h = await getLeagueHistory();
  if (!h.rostersById.has(lens)) return { ok: false, reason: "invalid", retryInMs: 0 };
  const plan = await planRefreshLive(lens);
  if (!plan.ok) return { ok: false, reason: "rate_limited", retryInMs: plan.retryInMs };
  for (const t of plan.tags) updateTag(t);
  return { ok: true, players: plan.players.length, tags: plan.tags.length };
}
