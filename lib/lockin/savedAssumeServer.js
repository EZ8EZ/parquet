import { cookies } from "next/headers";
import { SAVED_ASSUME_COOKIE, decodeSaved } from "./savedAssume.js";

/** The kept what-if marks for this roster (D141), as an ?assume= string, or null. */
export async function savedAssumeFor(rosterId) {
  if (rosterId == null) return null;
  try {
    return decodeSaved((await cookies()).get(SAVED_ASSUME_COOKIE)?.value, rosterId);
  } catch {
    return null;
  }
}
