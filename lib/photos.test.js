import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { photosEnabled } from "./photos.js";
/**
 * This file exists because the photo flag has been the same bug four separate times.
 * Every one of those rounds ended with a human being told to go set an env var, and
 * every one of them shipped monograms anyway. The default is the feature, so the
 * default gets a test that fails loudly the next time somebody "tidies" it back to
 * `=== "true"`.
 *
 * `photosEnabled` reads `process.env` at call time, which is what makes it testable
 * here at all. In a real Next build these are `NEXT_PUBLIC_*` and therefore inlined as
 * literals at BUILD time - the very property that made the old default so hard to
 * change on a live deploy. Under vitest there is no inlining step, so mutating
 * `process.env` between cases exercises the same branches.
 */
const VARS = [
  "NEXT_PUBLIC_USE_PLAYER_PHOTOS",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER",
];
/** @type {Record<string, string | undefined>} */
let saved = {};
beforeEach(() => {
  saved = {};
  for (const k of VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
describe("photosEnabled", () => {
  it("defaults ON when nothing is configured at all", () => {
    // The whole point of D90. Local dev, CI, and a Vercel deploy whose dashboard was
    // never touched all land here, and all three must show real faces.
    expect(photosEnabled()).toBe(true);
  });
  it("honours an explicit opt-out", () => {
    process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = "false";
    expect(photosEnabled()).toBe(false);
  });
  it("honours an explicit opt-in", () => {
    process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = "true";
    expect(photosEnabled()).toBe(true);
  });
  it("lets an explicit setting beat the fork check in BOTH directions", () => {
    // A fork that has read the licensing note can opt in, and the canonical repo can
    // still opt out - neither is allowed to be overridden by the repo-owner heuristic.
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER = "some-other-user";
    process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = "true";
    expect(photosEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER = "EZ8EZ";
    process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = "false";
    expect(photosEnabled()).toBe(false);
  });
  it("turns photos OFF for a fork's own Vercel deploy, unasked", () => {
    // This is the protection D39 actually wanted, and the reason flipping the default
    // is not simply deleting it: somebody else's deploy of this PUBLIC repo renders
    // monograms with no configuration on their part.
    process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER = "some-other-user";
    expect(photosEnabled()).toBe(false);
  });
  it("keeps photos on for the canonical repo, whatever the casing", () => {
    // GitHub logins are case-insensitive; the exact casing Vercel forwards is not a
    // thing to bet the feature on.
    for (const owner of ["EZ8EZ", "ez8ez", "Ez8Ez"]) {
      process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER = owner;
      expect(photosEnabled()).toBe(true);
    }
  });
  it("FAILS OPEN when the repo owner cannot be determined", () => {
    // The single most important case. If Vercel's system-env-vars setting is off, or
    // the var is renamed, or the deploy is not git-connected, the owner's site must
    // still show photos. A missing env var silently downgrading production is the
    // exact failure this design exists to make impossible.
    for (const owner of ["", undefined]) {
      if (owner === undefined) delete process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER;
      else process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER = owner;
      expect(photosEnabled()).toBe(true);
    }
  });
  it("treats an unrecognised value as unset rather than as OFF", () => {
    // "1", "yes", "TRUE" are all things a person types into a dashboard field at 1am.
    // None of them is the documented opt-out, so none of them may turn the feature
    // off - only the exact string "false" does.
    for (const v of ["1", "yes", "TRUE", "on", ""]) {
      process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = v;
      expect(photosEnabled()).toBe(true);
    }
  });
});
