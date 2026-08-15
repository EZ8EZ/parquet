import { NextResponse } from "next/server";
import { z } from "zod";
export const dynamic = "force-dynamic";
const Body = z.object({ rosterId: z.number().int().min(1).max(64) });
/**
 * Set which team the app is "viewing as". Persisted in a cookie so every server
 * component picks it up. The heavy league corpus is cached independently of this,
 * so switching teams is cheap — no `invalidateHistory()` here on purpose. `Corpus`
 * (lib/history.ts) is declared `Omit<LeagueHistory, "me">`, i.e. identity-independent
 * by construction, and `getLeagueHistory` re-derives `me` from the lens cookie on
 * every call, so switching the lens can never stale the corpus. Invalidating it here
 * used to force every other reader on this instance into a ~146-request corpus
 * reassembly just because one manager switched teams.
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
    return NextResponse.json({ error: "invalid rosterId" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, rosterId: parsed.data.rosterId });
  res.cookies.set("parquet_roster", String(parsed.data.rosterId), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
/** Clear the override and fall back to the configured Sleeper username. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("parquet_roster", "", { path: "/", maxAge: 0 });
  return res;
}
