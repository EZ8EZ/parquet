"use server";
import { updateTag } from "next/cache";
import { planRefresh } from "./source.js";

/**
 * Server action behind the refresh control: expires only what can have changed tonight
 * (see planRefresh), so the next render reads it from Sleeper and reuses the rest.
 * updateTag (not revalidateTag) because the very next render must wait for fresh data.
 */
export async function refreshLockDesk(rosterId) {
  const id = Number(rosterId);
  if (!Number.isInteger(id) || id < 1) return { ok: false, reason: "invalid", retryInMs: 0 };
  const plan = planRefresh(id);
  if (!plan.ok) return { ok: false, reason: "rate_limited", retryInMs: plan.retryInMs };
  for (const t of plan.tags) updateTag(t);
  return { ok: true, players: plan.players.length, tags: plan.tags.length };
}
