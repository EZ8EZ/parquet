import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DIGEST_COOKIE,
  encodeMarker,
  MAX_TRACKED_ROSTERS,
  type MetricRow,
} from "@/lib/digest";

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
 * Advance the "last seen" marker. Same cookie mechanics as `viewing-as`: readable,
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
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid metrics" }, { status: 400 });
  }

  const metrics: MetricRow[] = parsed.data.metrics;
  const seenAt = Date.now();
  const res = NextResponse.json({ ok: true, seenAt });
  res.cookies.set(DIGEST_COOKIE, encodeMarker({ seenAt, metrics }), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** Forget the marker, which puts the digest back into its first-visit state. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DIGEST_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
