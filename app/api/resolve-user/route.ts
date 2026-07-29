import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeagueHistory, invalidateHistory } from "@/lib/history";
import { getLeagueProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().trim().min(1).max(64) });

/**
 * Resolve a Sleeper username to their roster in the configured league, then set the
 * "viewing as" cookie. This is the real entry point: a user types their own handle
 * rather than picking off a list.
 *
 * Matching is deliberately generous — Sleeper usernames are case-insensitive, and
 * people often type their TEAM name instead of their username, so we accept either.
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
    return NextResponse.json({ error: "Enter a username." }, { status: 400 });
  }
  const input = parsed.data.username;
  const needle = input.toLowerCase();

  const h = await getLeagueHistory();

  // 1) Match against league members by display name or team name (no network).
  let match = h.users.find(
    (u) =>
      u.displayName.toLowerCase() === needle ||
      (u.teamName ?? "").toLowerCase() === needle,
  );

  // 2) Fall back to resolving the username via the provider, then matching by id.
  if (!match) {
    try {
      const resolved = await getLeagueProvider().getUser(input);
      match = h.users.find((u) => u.userId === resolved.userId);
    } catch {
      // unknown username upstream — fall through to the not-found response
    }
  }

  // 3) Last resort: forgiving substring match (handles minor typos/partials).
  if (!match) {
    match = h.users.find(
      (u) =>
        u.displayName.toLowerCase().includes(needle) ||
        (u.teamName ?? "").toLowerCase().includes(needle),
    );
  }

  if (!match) {
    return NextResponse.json(
      {
        error: `"${input}" isn't a manager in ${h.currentLeague.name}. Check the spelling, or pick a team from the list.`,
      },
      { status: 404 },
    );
  }

  const roster = h.rosters.find(
    (r) => r.ownerId === match!.userId || r.coOwners.includes(match!.userId),
  );
  if (!roster) {
    return NextResponse.json(
      { error: `${match.displayName} has no roster in this league.` },
      { status: 404 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    rosterId: roster.rosterId,
    displayName: match.displayName,
    teamName: match.teamName,
  });
  res.cookies.set("parquet_roster", String(roster.rosterId), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  invalidateHistory();
  return res;
}
