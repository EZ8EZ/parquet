import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CUSTOM_RANK_COOKIE,
  encodeCustomOrderCookie,
  isSafePlayerId,
  MAX_RANKED_IN_COOKIE,
} from "@/lib/rankings/customOrder";

export const dynamic = "force-dynamic";

const Body = z.object({
  order: z
    .array(z.string().min(1).max(24).refine(isSafePlayerId, "not a player id"))
    .max(MAX_RANKED_IN_COOKIE),
});

/**
 * Mirror the viewer's own ranking into a cookie so server components can read it.
 *
 * Same cookie mechanics as `viewing-as` and the digest marker: readable, lax, one
 * year. /rank already owns this order in localStorage; this route exists purely
 * because localStorage is invisible to a server render, and /trade/finder is a
 * server component.
 *
 * Deliberately does NOT invalidate the league corpus, for the same reason the
 * digest marker does not: nothing about the league changed. A ranking is an
 * opinion layered on top of the corpus, and throwing the corpus away on every
 * drag would turn a cheap cookie write into a full reassembly.
 *
 * An empty array is a legitimate body, not an error - it is how the board says
 * "I have no custom ranking any more" without a separate call.
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid order" }, { status: 400 });
  }
  const { order } = parsed.data;
  const res = NextResponse.json({ ok: true, ranked: order.length });
  res.cookies.set(CUSTOM_RANK_COOKIE, encodeCustomOrderCookie(order), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** Forget the ranking, which puts every reader back to consensus-only. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOM_RANK_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
