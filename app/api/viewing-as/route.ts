import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

const Body = z.object({ rosterId: z.number().int().min(1).max(64) });

/**
 * Set which team the app is "viewing as". Persisted in a cookie so every server
 * component picks it up. The heavy league corpus is cached independently of this,
 * so switching teams is cheap.
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
    return NextResponse.json({ error: "invalid rosterId" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, rosterId: parsed.data.rosterId });
  res.cookies.set("parquet_roster", String(parsed.data.rosterId), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  invalidateHistory();
  return res;
}

/** Clear the override and fall back to the configured Sleeper username. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("parquet_roster", "", { path: "/", maxAge: 0 });
  invalidateHistory();
  return res;
}
