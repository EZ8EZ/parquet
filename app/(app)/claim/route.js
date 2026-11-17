import { NextResponse } from "next/server";
import { getLeagueHistory } from "@/lib/history";
import {
  authSecret,
  CLAIM_PARAM,
  SEAT_COOKIE,
  SEAT_COOKIE_OPTIONS,
  verifySeatToken,
} from "@/lib/auth/server";
export const dynamic = "force-dynamic";
/**
 * Claim a seat. The entire onboarding flow, and it is one GET.
 *
 * The commissioner hands a manager their link once (see /commissioner or
 * `pnpm claim-links`); opening it in the browser they actually use sets the signed,
 * httpOnly cookie that makes every private write in the app theirs. No password, no
 * account, no email - for a fourteen-person dynasty league the link IS the credential,
 * and anything more would be a login page nobody asked for.
 *
 * A route handler rather than a page because only a route handler (or a server
 * action) may set a cookie, and this has exactly one thing to do before redirecting.
 *
 * It sets the LENS as well as the seat, which is the difference between landing on
 * your own team and landing on the picker with a seat you have no visible sign of.
 * A manager who has left the league still gets the seat - their old annotations are
 * still theirs - they just have no current roster to point the lens at, so they meet
 * the picker like anyone else.
 */
export async function GET(req) {
  const secret = authSecret();
  const home = new URL("/", req.url);
  // Legacy mode: nothing was ever signed, so nothing can be verified. Sending them
  // to the app rather than to an error is the right call - in single-user mode the
  // whole notion of a seat is off, and there is nothing broken to explain.
  if (!secret) return NextResponse.redirect(home);
  const token = new URL(req.url).searchParams.get(CLAIM_PARAM);
  const ownerId = verifySeatToken(token, secret);
  if (!ownerId) {
    return NextResponse.redirect(new URL("/claim/invalid", req.url));
  }
  // The lens follows the seat on arrival. Best-effort on purpose: if the corpus is
  // briefly unreachable the claim itself must still succeed, because the seat is the
  // part that cannot be re-derived later and the lens is one tap away in /teams.
  let rosterId = null;
  try {
    const h = await getLeagueHistory();
    const roster = h.rosters.find(
      (r) => r.ownerId === ownerId || r.coOwners.includes(ownerId),
    );
    rosterId = roster?.rosterId ?? null;
  } catch {
    rosterId = null;
  }
  const res = NextResponse.redirect(
    rosterId != null ? home : new URL("/teams", req.url),
  );
  res.cookies.set(SEAT_COOKIE, token, SEAT_COOKIE_OPTIONS);
  if (rosterId != null) {
    res.cookies.set("parquet_roster", String(rosterId), {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
/** Hand the seat back. The only way out, and it clears the seat alone - the lens is
 *  a display preference and giving it up as well would just be a surprise. */
export async function DELETE(req) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SEAT_COOKIE, "", { ...SEAT_COOKIE_OPTIONS, maxAge: 0 });
  void req;
  return res;
}
