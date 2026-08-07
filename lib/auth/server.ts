/**
 * Request-scope half of the seat. Everything here needs `next/headers`; everything
 * that does NOT is in ./seat.ts, which is where the logic and the tests live.
 *
 * The split is the same one `lib/digest` makes between its pure codec and
 * `readMarker`: a decision that can be unit tested without standing up a request
 * should be, and a module that reaches for the request should contain nothing but
 * the reaching.
 */
import { getLeagueProvider, defaultUsername } from "../providers";
import {
  authSecret,
  LEGACY_SEAT,
  resolveSeat,
  SEAT_COOKIE,
  type Seat,
} from "./seat";

export * from "./seat";

/**
 * Cookie options for the seat. Three of these are load-bearing:
 *
 * `httpOnly` is the whole point - unlike the lens cookie (deliberately readable, so
 * `/rank` and the digest panel can see it), a seat that JavaScript can read is a seat
 * an XSS or a curious leaguemate with devtools can copy.
 *
 * `sameSite: "lax"` still lets the claim link work: it is a top-level GET navigation,
 * which lax permits, so the cookie is set on arrival and sent on the redirect that
 * follows.
 *
 * `secure` in production only, because local dev is plain http and a `secure` cookie
 * would silently never be stored - which would look exactly like a broken feature.
 */
export const SEAT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * The seat this request holds.
 *
 * Outside a request scope (tests, a script) `next/headers` throws, and the honest
 * answer there is "multi-user mode is on but this caller has no seat" rather than
 * "legacy mode" - falling back to legacy would turn every non-request caller into an
 * unauthenticated writer with full rights.
 */
export async function readSeat(): Promise<Seat> {
  const secret = authSecret();
  if (!secret) return LEGACY_SEAT;
  try {
    const { cookies } = await import("next/headers");
    return resolveSeat((await cookies()).get(SEAT_COOKIE)?.value, secret);
  } catch {
    return { enforced: true, ownerId: null };
  }
}

/**
 * The lens roster id straight off the cookie, with no corpus read behind it.
 *
 * `getLeagueHistory` already does this properly (and resolves it to an owner), but
 * the digest-seen route needs an identity to key a cookie by and must not pay for a
 * corpus assembly to get one. A roster id is a perfectly good key for that: it is
 * stable within a session, it is what the reader actually chose, and the marker it
 * names is browser-local anyway.
 */
export async function readLensRosterId(): Promise<number | null> {
  try {
    const { cookies } = await import("next/headers");
    const raw = (await cookies()).get("parquet_roster")?.value;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * The identity that browser-local, per-person state (today: the digest's last-seen
 * marker) is filed under.
 *
 * Seat first, because a claimed manager is the same person no matter which team they
 * are currently looking at. Lens second, because an unclaimed reader still deserves
 * "since YOUR last visit" to mean something, and the team they picked is the only
 * thing about them the app knows. `default` last, for the browser that has neither -
 * which after the front-door redirect is essentially only `/about`.
 *
 * Purely cookie-derived on purpose: no provider call, no corpus, no network.
 */
export async function readMarkerIdentity(): Promise<string> {
  const seat = await readSeat();
  if (seat.ownerId) return seat.ownerId;
  const rosterId = await readLensRosterId();
  return rosterId != null ? `r${rosterId}` : "default";
}

/**
 * The deploy owner - the manager whose Sleeper username this deployment is
 * configured with, i.e. whoever runs it.
 *
 * This is the app's only notion of "commissioner", and it is deliberately the same
 * constant that already decides the default lens (`defaultUsername()`), not a new
 * piece of configuration. Returns null if the username cannot be resolved, which the
 * callers all read as "cannot confirm you are the owner" rather than "you are".
 */
export async function deployOwnerId(): Promise<string | null> {
  try {
    const user = await getLeagueProvider().getUser(defaultUsername());
    return user.userId || null;
  } catch {
    return null;
  }
}

/**
 * Where this deployment lives, for building a claim link someone can paste into a
 * message. Read off the forwarded headers rather than configured, so the same code
 * prints `http://localhost:3007/claim?...` in dev and the real origin on Vercel.
 *
 * NULL, NOT `""`, WHEN IT CANNOT BE DETERMINED, and the caller has to handle it. The
 * empty string was worse than an error: `claimUrl` happily concatenates it into a
 * RELATIVE path (`/claim?t=s1...`) which looks exactly like a claim link inside a
 * copy block, so the commissioner would copy it, send it to a leaguemate, and it would
 * resolve against whatever host that person happened to be on - i.e. nowhere. That is
 * the same shape as the silent-write-failure D36 was written about: a failure path
 * reporting success.
 *
 * And deliberately no fallback origin. Guessing a hostname would hand out a link to
 * the WRONG host, which is a credential pointed somewhere unintended and is strictly
 * worse than saying we do not know.
 */
export async function requestOrigin(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}
