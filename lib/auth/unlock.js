"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FULL_ACCESS_COOKIE, FULL_ACCESS_MAX_AGE, accessToken, focusPassword, sameToken } from "./focus.js";
import { safeNextPath } from "./entry.js";

/**
 * The unlock form's action: the right password sets the full-access cookie (an HMAC of
 * the password, httpOnly) and goes on to `next`; a wrong one comes back with ?wrong=1.
 * Compared as tokens in constant time, so the password itself is never echoed or stored.
 */
export async function unlockAction(formData) {
  const pw = focusPassword();
  const next = safeNextPath(String(formData.get("next") ?? "")) ?? "/";
  if (!pw) redirect(next);
  const given = String(formData.get("password") ?? "");
  const [want, got] = await Promise.all([accessToken(pw), accessToken(given)]);
  if (!given || !sameToken(want, got)) redirect(`/unlock?wrong=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(FULL_ACCESS_COOKIE, want, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: FULL_ACCESS_MAX_AGE });
  redirect(next);
}
