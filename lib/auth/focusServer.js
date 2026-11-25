import { cookies } from "next/headers";
import { FULL_ACCESS_COOKIE, hasFullAccess } from "./focus.js";

/** Server components: true when focus mode is on and this visitor has not unlocked. */
export async function isFocusLocked() {
  return !(await hasFullAccess((await cookies()).get(FULL_ACCESS_COOKIE)?.value));
}
