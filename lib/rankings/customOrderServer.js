/**
 * The server half of the custom-ranking store: reading the cookie written by
 * /rank out of the incoming request.
 *
 * SERVER COMPONENTS AND ROUTE HANDLERS ONLY. This is a separate module from
 * `./customOrder` for one concrete reason: that module is imported by
 * `components/RankingBoard.tsx`, which is a client component, and `next/headers`
 * must never end up in a client bundle. Keeping the codec shared and the request
 * read isolated here means neither side can accidentally pull in the other's
 * environment. (`server-only` is not installed in this project, so the boundary
 * is enforced by this file having exactly one import and one caller shape rather
 * than by a build-time guard.)
 */
import { CUSTOM_RANK_COOKIE, parseCustomOrderCookie } from "./customOrder.js";
/**
 * The viewer's own ranking, best first, or an empty array when they have never
 * ranked anything.
 *
 * Empty is a real, expected answer, not a failure: most viewers will reach a
 * decision surface before they ever open /rank, and every caller is required to
 * treat an empty order as "this viewer has no opinion on record" rather than as
 * an opinion that happens to agree with consensus. Returns empty outside a
 * request scope too (unit tests, build-time evaluation), which keeps callers
 * from having to special-case that separately.
 */
export async function readCustomOrder() {
  try {
    const { cookies } = await import("next/headers");
    return parseCustomOrderCookie(
      (await cookies()).get(CUSTOM_RANK_COOKIE)?.value,
    );
  } catch {
    return [];
  }
}
