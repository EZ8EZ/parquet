import { NextResponse } from "next/server";
import { z } from "zod";
import {
  digestCookieName,
  encodeMarker,
  MAX_TRACKED_ROSTERS,
  readMarker,
  shouldAdvanceMarker,
} from "@/lib/digest";
import { readMarkerIdentity } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
const Index = z.number().int().min(0).max(100);
const Body = z.object({
  metrics: z
    .array(
      z.object({
        rosterId: z.number().int().min(1).max(64),
        tci: Index,
        fragility: Index,
      }),
    )
    .max(MAX_TRACKED_ROSTERS),
});
/**
 * Advance the "last seen" marker - but only when `shouldAdvanceMarker` says the floor
 * has actually elapsed (see lib/digest's own header for why the floor exists at all:
 * SHELVED.md S2's revival condition). Same cookie mechanics as `viewing-as`: readable,
 * lax, one year, so every server component picks it up on the next render.
 *
 * The timestamp is taken HERE rather than accepted from the caller, because a marker the
 * client can date is a marker the client can use to hide changes from itself.
 *
 * The snapshot, by contrast, does come from the caller: the home page already computed
 * both indices to render the panel, and recomputing them in this route would double the
 * cost of the most-visited page in the app to learn nothing new. The values are bounded
 * by the schema above, and this cookie is user-writable anyway, so nothing downstream is
 * allowed to trust it further than "a previous number to subtract".
 *
 * Deliberately does NOT invalidate the league corpus. Nothing about the league changed;
 * clearing the cache on every home-page visit would turn a cheap write into a full
 * reassembly.
 */
export async function POST(req) {
  let json;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid metrics" }, { status: 400 });
  }
  const metrics = parsed.data.metrics;
  const now = Date.now();
  const existing = await readMarker();
  // Under the floor: the beacon still fired (it always does, fire-and-forget), but the
  // marker itself does not move, so a reader who reloads twice in the same sitting keeps
  // diffing against the SAME baseline instead of resetting it to "just now" each time.
  if (!shouldAdvanceMarker(existing, now)) {
    return NextResponse.json({
      ok: true,
      advanced: false,
      seenAt: existing?.seenAt ?? null,
    });
  }
  const res = NextResponse.json({ ok: true, advanced: true, seenAt: now });
  // Filed under the reader's own identity (seat, else lens), so switching who you
  // are looking at can no longer stamp "seen" on someone else's behalf - see
  // `digestCookieName`. Cookie-derived, so this stays a corpus-free write.
  const name = digestCookieName(await readMarkerIdentity());
  res.cookies.set(name, encodeMarker({ seenAt: now, metrics }), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
/** Forget the marker, which puts the digest back into its first-visit state. Clears
 *  the CALLER's marker only - one identity forgetting its own last visit is not a
 *  reason to reset everyone else's. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(digestCookieName(await readMarkerIdentity()), "", {
    path: "/",
    maxAge: 0,
  });
  return res;
}
