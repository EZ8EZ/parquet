/**
 * FOCUS MODE: share the lock-or-hold helper with friends without the rest of the app.
 *
 * When the deployment sets PARQUET_FULL_ACCESS_PASSWORD, a visitor without the access
 * cookie sees only the start-or-not pages (This Week, the lock board, the team picker
 * and the unlock page); every other page sends them to /unlock. The right password sets
 * an httpOnly cookie holding an HMAC of the password, so changing the password locks
 * everyone out again. Without the variable nothing changes (the whole app is open, as
 * before). Dependency-free and edge-safe: proxy.js runs it on every page request.
 */

export const FULL_ACCESS_COOKIE = "parquet_full";
export const FULL_ACCESS_ENV = "PARQUET_FULL_ACCESS_PASSWORD";
export const UNLOCK_PATH = "/unlock";
export const FULL_ACCESS_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

// pages a focused visitor may open (exact, or the prefix followed by "/")
const FOCUS_OPEN = ["/", "/lockin", "/teams", "/claim", UNLOCK_PATH];

/** The configured password, or null when focus mode is off. */
export function focusPassword(env = process.env) {
  const v = env?.[FULL_ACCESS_ENV];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Whether a focused visitor may open this page. */
export function isFocusOpen(pathname) {
  const p = String(pathname || "/");
  return FOCUS_OPEN.some((o) => (o === "/" ? p === "/" : p === o || p.startsWith(`${o}/`)));
}

/** Hex HMAC-SHA256 of a fixed message under the password (Web Crypto: edge and node). */
export async function accessToken(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("parquet-full-access-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two strings of hex. */
export function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** True when focus mode is off, or the cookie carries the current password's token. */
export async function hasFullAccess(cookieValue, env = process.env) {
  const pw = focusPassword(env);
  if (!pw) return true;
  if (!cookieValue) return false;
  return sameToken(cookieValue, await accessToken(pw));
}

/** Where to send a focused visitor who asked for `pathname`: /unlock?next=... */
export function unlockTarget(pathname, search = "") {
  const next = `${pathname}${search || ""}`;
  return `${UNLOCK_PATH}?next=${encodeURIComponent(next)}`;
}
