/**
 * THE SEAT - proving which manager this browser actually is.
 *
 * Parquet has always had exactly one notion of "you": the `parquet_roster` cookie.
 * That cookie is a LENS. It answers "whose public data am I looking at", it is
 * deliberately non-httpOnly so the client can read it, it is one tap to change, and
 * being able to run the whole app as any manager in the league is a feature, not a
 * leak - every number it moves is derived from public Sleeper data that everyone in
 * the league can already see.
 *
 * The bug it caused is that the same cookie also answered "whose private authorship
 * do I hold". Decision-ledger annotations are the one thing in this app that is NOT
 * public: they are what a manager was thinking at the moment of conviction, and they
 * are stamped with an `ownerId` (D22 - the durable principal id, never a roster id,
 * because roster ids get reassigned on a handover). Deriving that stamp from a
 * user-writable cookie means anyone can author, and edit, as anyone. One cookie
 * cannot carry both jobs, because the two want opposite properties: the lens wants
 * to be freely switchable and the authorship wants to be unforgeable.
 *
 * So this module adds the SECOND mechanism, and nothing else changes:
 *
 *   the lens  = `parquet_roster`, unchanged, freely switchable, public data only
 *   the seat  = `parquet_seat`,   SIGNED, httpOnly, one owner, private authorship
 *
 * A seat token is `s1.<ownerId>.<HMAC-SHA256(s1:<ownerId>, AUTH_SECRET)>`. That is
 * the entire scheme, and the smallness is the point: no passwords, no user table, no
 * session store, no new dependency (node's built-in `crypto` only), and crucially no
 * database - D18 says reads are DB-free and the database is optional, and an identity
 * layer that needed one would quietly repeal that. The commissioner generates one
 * claim link per manager and hands it out once; visiting it sets the cookie.
 *
 * LEGACY MODE IS THE DEFAULT AND IT IS NOT A DEGRADED MODE. With no `AUTH_SECRET`
 * configured there is nothing to sign with, so `resolveSeat` reports `enforced:
 * false` and every decision function below falls through to exactly the behaviour
 * this app had before any of it existed: the lens is the author. A single-user
 * deploy (which is every deploy today) should never have to think about seats, and
 * the app must not become harder to run because it CAN be shared.
 *
 * What this deliberately is NOT: a login. There is no account, no password reset, no
 * revocation list. A claim link is a bearer token - whoever holds it holds that seat
 * until `AUTH_SECRET` is rotated, which invalidates every seat at once. For a private
 * fourteen-person dynasty league where the threat model is "my leaguemate flips a
 * cookie and writes a note as me", that is the right amount of machinery. Anything
 * more would be a login page nobody in this league asked for.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed, httpOnly, and therefore invisible to `document.cookie` on purpose. */
export const SEAT_COOKIE = "parquet_seat";

/** The query parameter a claim link carries. */
export const CLAIM_PARAM = "t";

/**
 * Owner ids as every provider in this app produces them: Sleeper's numeric strings
 * and the fixture generator's `u1`. The token format below is separator-delimited,
 * so an id containing a separator would make the token ambiguous - rejecting the id
 * outright is cheaper than escaping, and no real id has ever needed it.
 */
const SAFE_OWNER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeOwnerId(id: string): boolean {
  return SAFE_OWNER_ID.test(id);
}

/**
 * The configured signing secret, or null when multi-user mode is off.
 *
 * Whitespace-only is treated as absent rather than as a one-character secret: a
 * half-filled `.env` line is far more likely to be a mistake than an intent, and
 * silently accepting `AUTH_SECRET=" "` would hand out signatures anyone could forge.
 */
export function authSecret(): string | null {
  const raw = process.env.AUTH_SECRET;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Multi-user mode is configured. The one switch the whole feature hangs off. */
export function isMultiUser(): boolean {
  return authSecret() != null;
}

/** Versioned so rotating the token SHAPE expires old cookies instead of misreading
 *  them - the same convention the digest marker and the custom-rank cookie use. */
const TOKEN_VERSION = "s1";
const SEP = ".";

function signature(ownerId: string, secret: string): string {
  // The version is inside the signed payload, not merely prefixed to it, so a future
  // `s2` token can never be replayed as an `s1` one by rewriting the prefix.
  return createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}:${ownerId}`)
    .digest("hex");
}

/**
 * Mint the token that a claim link carries and the seat cookie stores.
 *
 * Deliberately the same string in both places. A separate exchange step (link token
 * -> session token) would buy revocation we do not have anywhere else in this design,
 * and would cost a server-side store, which is the one thing D18 says we don't get.
 */
export function signSeatToken(ownerId: string, secret: string): string {
  if (!isSafeOwnerId(ownerId)) {
    throw new Error(`refusing to sign an unsafe owner id: ${JSON.stringify(ownerId)}`);
  }
  return `${TOKEN_VERSION}${SEP}${ownerId}${SEP}${signature(ownerId, secret)}`;
}

/**
 * Verify a token and hand back the owner id it proves, or null.
 *
 * Never throws and never explains WHY it failed. This is the boundary between a
 * user-writable cookie and the durable identity every annotation is stamped with, so
 * anything unrecognised - a tampered id, a signature from a different secret, a
 * truncated cookie, a stale token shape, plain garbage - collapses to the same
 * answer: no seat.
 */
export function verifySeatToken(
  token: string | null | undefined,
  secret: string | null,
): string | null {
  if (!token || !secret) return null;
  const parts = token.split(SEP);
  if (parts.length !== 3) return null;
  const [version, ownerId, provided] = parts;
  if (version !== TOKEN_VERSION) return null;
  if (!isSafeOwnerId(ownerId)) return null;

  const expected = signature(ownerId, secret);
  // Both are fixed-length lowercase hex from the same digest, so an unequal length
  // means malformed input rather than a near-miss; `timingSafeEqual` throws on
  // mismatched lengths, so the guard is required as well as free.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  return ownerId;
}

// ------------------------------------------------------------------ the seat

export interface Seat {
  /**
   * Multi-user mode is on (`AUTH_SECRET` is configured). False is LEGACY MODE, in
   * which every decision below reduces to the app's pre-seat behaviour.
   */
  enforced: boolean;
  /** The owner id this browser has PROVEN it holds, or null. Never a guess. */
  ownerId: string | null;
}

/** Single-user mode: no secret, no seat, no enforcement, no behaviour change. */
export const LEGACY_SEAT: Seat = { enforced: false, ownerId: null };

/** Turn a raw cookie value into a seat. Pure, so the whole matrix is unit-testable. */
export function resolveSeat(
  cookieValue: string | null | undefined,
  secret: string | null,
): Seat {
  if (!secret) return LEGACY_SEAT;
  return { enforced: true, ownerId: verifySeatToken(cookieValue, secret) };
}

// ------------------------------------------------------------------ decisions

/**
 * The `ownerId` a WRITE gets stamped with, or null to refuse the write.
 *
 * Note what this does not consult: the lens. In multi-user mode the stamp is the
 * seat's owner and only ever the seat's owner, so the worst a forged
 * `parquet_roster` cookie can now do is change which public numbers you are reading.
 * In legacy mode there is no seat to consult and the lens is the author, exactly as
 * before.
 */
export function writeAuthorId(seat: Seat, lensUserId: string): string | null {
  if (!seat.enforced) return lensUserId || null;
  return seat.ownerId;
}

/**
 * The `ownerId` whose private content this VIEW may show and offer to edit, or null
 * for "no private content on this view".
 *
 * Stricter than `writeAuthorId` by one rule: the lens has to agree. Holding a seat
 * and then pointing the lens at a leaguemate is the app working as intended - you
 * are scouting them - but a ledger that answered "your notes" while the whole rest
 * of the page answered "their team" would be reading two different people's stories
 * into one screen. So looking through someone else's lens shows the public record
 * and nothing private: not theirs, and not yours either.
 */
export function viewAuthorId(seat: Seat, lensUserId: string): string | null {
  // Legacy returns the lens VERBATIM, empty string included, because that is
  // literally what `myAnnotation` read before any of this existed and "exactly as
  // today" has to hold for the degenerate cases too. `writeAuthorId` is stricter
  // about the same value: refusing to read a nameless author's notes costs nothing,
  // while writing one would put a row in the database that belongs to nobody.
  if (!seat.enforced) return lensUserId;
  if (!seat.ownerId) return null;
  return seat.ownerId === lensUserId ? seat.ownerId : null;
}

/** Whether the UI may render capture and edit affordances at all. */
export function canCapture(seat: Seat, lensUserId: string): boolean {
  return captureBlock(seat, lensUserId) === null;
}

/**
 * Why capture is unavailable, for copy that has to say something true.
 *
 * `null` means it IS available. The two failure modes are genuinely different
 * situations for the reader ("you were never given a link" and "you are looking at
 * someone else") and collapsing them into one "not allowed" would leave a manager
 * with no idea what to do next. A stale or tampered link is not a third case: it
 * fails signature verification, so `seat.ownerId` is absent and it arrives here as
 * `unclaimed`, which is also the right thing to tell that reader to do next.
 */
export type CaptureBlock = "unclaimed" | "other-lens";

export function captureBlock(seat: Seat, lensUserId: string): CaptureBlock | null {
  if (!seat.enforced) return null;
  if (!seat.ownerId) return "unclaimed";
  return seat.ownerId === lensUserId ? null : "other-lens";
}

// ------------------------------------------------------------------ claim links

/** The path half of a claim link. The origin is added by whoever is handing it out. */
export function claimPath(ownerId: string, secret: string): string {
  const token = signSeatToken(ownerId, secret);
  return `/claim?${CLAIM_PARAM}=${encodeURIComponent(token)}`;
}

/** A full claim link for a manager, given wherever this deployment lives. */
export function claimUrl(ownerId: string, secret: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}${claimPath(ownerId, secret)}`;
}
