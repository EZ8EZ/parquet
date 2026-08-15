/**
 * THE FRONT DOOR - what a browser with no lens yet is allowed to see.
 *
 * The old answer was "the app owner's team". With no `parquet_roster` cookie,
 * `getLeagueHistory` fell back to the configured Sleeper username, so a leaguemate
 * opening the link for the first time landed on Home already being EZ8: his revealed
 * strategy under a headline saying "you", his record, and a badge offering to capture
 * twenty-seven decisions he had never made. Nothing on the page said whose seat that
 * was, because the app had never had a reader who wasn't him.
 *
 * The fix is a redirect, not a permission: a browser that has never chosen a lens is
 * sent to `/teams`, the picker that already exists and already asks the right
 * question ("Whose team are you?"). One tap later the cookie is set and every visit
 * after that goes straight to Home as before. A RETURNING reader never sees this.
 *
 * Kept pure and free of `next/*` on purpose. Middleware runs on the edge runtime for
 * every request in the app, so the decision it makes has to be a string comparison
 * with no imports behind it - and a decision this consequential has to be unit
 * testable without standing up a request.
 */
/** The lens cookie. Duplicated as a constant here rather than imported from
 *  lib/history so middleware pulls in nothing but this file. */
export const LENS_COOKIE = "parquet_roster";
/** Where a reader with no lens is sent. */
export const ENTRY_PATH = "/teams";
/** Carries the page they were actually after, so a shared deep link survives. */
export const NEXT_PARAM = "next";
/**
 * Paths that must work before a lens exists.
 *
 * `/teams` is the destination (redirecting it to itself would loop). `/claim` is how
 * a manager arrives from the commissioner's link, and it sets the lens itself, so
 * bouncing it to the picker would defeat the entire onboarding flow. `/about` is the
 * page `/teams` links to for "new to Parquet?" and it describes the app rather than
 * any team, so gating it behind a team choice would be circular.
 */
const OPEN_PREFIXES = [ENTRY_PATH, "/claim", "/about"];
function isOpen(pathname) {
  return OPEN_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`) ||
      pathname.startsWith(`${p}?`),
  );
}
/**
 * True when this request should be bounced to the picker.
 *
 * Deliberately keyed on the LENS only, not on the seat. A seat is optional (legacy
 * mode never issues one) while a lens is what every page on the site reads to know
 * whose numbers to print, so "has a lens" is the only question that means the same
 * thing in both modes.
 */
export function needsEntryPick(pathname, hasLens) {
  if (hasLens) return false;
  return !isOpen(pathname);
}
/**
 * Sanitize a `next` value back into a path we are willing to send a browser to.
 *
 * This is attacker-controlled (it arrives in a URL anyone can craft), and it ends up
 * in a client-side navigation, so the only shape allowed through is a single-slash
 * absolute path on this origin. `//evil.example` and `/\evil.example` are both read
 * as protocol-relative URLs by browsers, which is exactly the open-redirect this
 * rejects; anything with a scheme is rejected for the same reason.
 */
export function safeNextPath(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("://")) return null;
  // Control characters (a smuggled newline or NUL) never belong in a path.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
/** The full redirect target, deep link preserved when there is one worth keeping. */
export function entryRedirectTarget(pathname, search) {
  const full = `${pathname}${search ?? ""}`;
  const next = safeNextPath(full);
  // "/" is where the picker sends people anyway; round-tripping it adds a query
  // string to the front door for no gain.
  if (!next || next === "/") return ENTRY_PATH;
  return `${ENTRY_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}
