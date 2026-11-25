"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FULL_ACCESS_COOKIE } from "./focus.js";
import { LENS_COOKIE } from "./entry.js";
import { SAVED_ASSUME_COOKIE } from "../lockin/savedAssume.js";

/**
 * "See it as a new visitor" (D138): forget the password, the picked team and the kept
 *  what-if marks on this browser, then open the team picker, so the owner sees exactly what a
 * friend with the link sees (the team picker first). A claimed seat is left alone.
 */
export async function startOverAction() {
  const jar = await cookies();
  for (const name of [FULL_ACCESS_COOKIE, LENS_COOKIE, SAVED_ASSUME_COOKIE]) jar.delete(name);
  // straight to the picker: a redirect from an action renders its target without passing the
  // proxy, so "/" would open on the default team instead of the front door
  redirect("/teams");
}
