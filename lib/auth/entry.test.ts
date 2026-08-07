import { describe, expect, it } from "vitest";
import {
  ENTRY_PATH,
  entryRedirectTarget,
  needsEntryPick,
  safeNextPath,
} from "./entry";

describe("needsEntryPick - who meets the picker", () => {
  it("sends a browser with NO LENS to the picker", () => {
    // The bug this exists to kill: with no cookie the app used to silently render
    // the deploy owner's seat, headline, record and to-do list to a stranger.
    expect(needsEntryPick("/", false)).toBe(true);
    expect(needsEntryPick("/roster", false)).toBe(true);
    expect(needsEntryPick("/ledger", false)).toBe(true);
    expect(needsEntryPick("/managers/3", false)).toBe(true);
  });

  it("never touches a RETURNING reader", () => {
    for (const path of ["/", "/roster", "/ledger", "/teams", "/web"]) {
      expect(needsEntryPick(path, true)).toBe(false);
    }
  });

  it("does not redirect the picker to itself", () => {
    expect(needsEntryPick(ENTRY_PATH, false)).toBe(false);
  });

  it("lets /claim through - it is how a manager arrives, and it sets the lens", () => {
    expect(needsEntryPick("/claim", false)).toBe(false);
    expect(needsEntryPick("/claim/invalid", false)).toBe(false);
  });

  it("lets /about through - the picker links to it, so gating it would be circular", () => {
    expect(needsEntryPick("/about", false)).toBe(false);
  });

  it("does not treat a lookalike prefix as an open path", () => {
    expect(needsEntryPick("/teamsx", false)).toBe(true);
    expect(needsEntryPick("/aboutus", false)).toBe(true);
  });
});

describe("safeNextPath - an attacker-controlled redirect target", () => {
  it("accepts a plain same-origin path", () => {
    expect(safeNextPath("/roster")).toBe("/roster");
    expect(safeNextPath("/web?trade=abc")).toBe("/web?trade=abc");
  });

  it("REJECTS protocol-relative and absolute URLs - the open redirect", () => {
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "/x://evil.example",
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it("rejects anything that is not a rooted path, and anything absurd", () => {
    expect(safeNextPath("roster")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("/" + "x".repeat(600))).toBeNull();
  });

  it("rejects smuggled control characters", () => {
    expect(safeNextPath("/roster\nSet-Cookie: x=1")).toBeNull();
    expect(safeNextPath("/roster\u0000")).toBeNull();
  });
});

describe("entryRedirectTarget - the deep link survives the detour", () => {
  it("carries the page they actually opened", () => {
    expect(entryRedirectTarget("/web", "?trade=abc")).toBe(
      `${ENTRY_PATH}?next=${encodeURIComponent("/web?trade=abc")}`,
    );
  });

  it("does not round-trip Home, which is where the picker goes anyway", () => {
    expect(entryRedirectTarget("/", "")).toBe(ENTRY_PATH);
  });

  it("drops a target it would not navigate to", () => {
    expect(entryRedirectTarget("//evil.example", "")).toBe(ENTRY_PATH);
  });
});
