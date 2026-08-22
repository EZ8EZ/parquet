import { describe, expect, it } from "vitest";
import {
  REFUSAL_CODES,
  REFUSAL_CODE_LIST,
  refusal,
  refusalSentence,
  refusalShort,
} from "./refusal.js";
describe("the register itself", () => {
  it("is closed and small - a seventh code is a decision, not a string", () => {
    expect(REFUSAL_CODE_LIST).toHaveLength(6);
    expect(REFUSAL_CODE_LIST).toEqual([
      "NO_RECORD",
      "INSUFFICIENT_SAMPLE",
      "CONCENTRATED_SAMPLE",
      "SPLIT_ROSTER",
      "SOURCE_GAP",
      "UNSCHEDULED",
    ]);
  });
  it("keys every entry by its own code, so a lookup cannot silently mismatch", () => {
    for (const [key, entry] of Object.entries(REFUSAL_CODES))
      expect(entry.code).toBe(key);
  });
  it("gives every code a label and a stated condition", () => {
    for (const entry of Object.values(REFUSAL_CODES)) {
      expect(entry.label.length).toBeGreaterThan(3);
      // The condition is the contract: it has to be long enough to name the
      // arithmetic, or a site can widen the code to whatever it likes.
      expect(entry.condition.length).toBeGreaterThan(80);
    }
  });
  it("is frozen, so nothing can add a code at runtime", () => {
    expect(Object.isFrozen(REFUSAL_CODES)).toBe(true);
    expect(() => {
      REFUSAL_CODES.INVENTED = { code: "INVENTED" };
    }).toThrow();
  });
  // ------------------------------------------------------------------- D6 and D19
  it("names no judgment of a roster or a manager (D6)", () => {
    for (const entry of Object.values(REFUSAL_CODES)) {
      const text = `${entry.code} ${entry.label} ${entry.condition}`;
      expect(text).not.toMatch(
        /\b(good|bad|better|worse|best|worst|weak|strong|poor|failing|mismanaged)\b/i,
      );
    }
  });
  it("claims no certainty the condition does not carry (D19)", () => {
    for (const entry of Object.values(REFUSAL_CODES)) {
      // A label that asserts the world rather than the record is the failure mode:
      // "no such player" instead of "absent from the source".
      expect(entry.label).not.toMatch(/\b(never|impossible|proven|certain)\b/i);
    }
  });
});
describe("refusal()", () => {
  it("throws on an unknown code rather than minting a seventh", () => {
    expect(() => refusal("NOT_A_CODE", "because")).toThrow(/unknown code/);
  });
  it("carries the code, its label, the proof and the withheld figure", () => {
    const r = refusal("SPLIT_ROSTER", "the parts span five seasons", {
      label: "A single window",
      value: "2031",
    });
    expect(r.code).toBe("SPLIT_ROSTER");
    expect(r.label).toBe(REFUSAL_CODES.SPLIT_ROSTER.label);
    expect(r.because).toBe("the parts span five seasons");
    expect(r.withheld).toEqual({ label: "A single window", value: "2031" });
  });
  it("defaults the withheld figure to null, never to an empty string", () => {
    // An empty string would render as a blank beside "would read", which is the
    // exact class of silent emptiness this whole module exists to prevent.
    expect(refusal("NO_RECORD", "nothing to read").withheld).toBeNull();
  });
  it("survives a round trip through JSON, which is the point of a code", () => {
    const r = refusal("SOURCE_GAP", "no entry for him", {
      label: "Placed",
      value: "10 of 11",
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
describe("refusalSentence", () => {
  it("leads with the register's human label, capitalized - the code stays on the object for grep/serialization, it no longer speaks", () => {
    const s = refusalSentence(refusal("NO_RECORD", "Nothing is priced here."));
    expect(s.startsWith("No record to read: ")).toBe(true);
    expect(s).toContain("Nothing is priced here.");
    // The code must NOT leak into reader-facing prose (VISION.md kill-list #4).
    expect(s).not.toContain("NO_RECORD");
  });
  it("prints the withheld figure and its own disproof in one string", () => {
    const s = refusalSentence(
      refusal(
        "CONCENTRATED_SAMPLE",
        "One deal carries 31% of the value returned here.",
        { label: "Back per 100 paid", value: "112" },
      ),
    );
    // The number and the reason it cannot be trusted are inseparable: a reader who
    // gets one without the other has been misled either way round.
    expect(s.indexOf("112")).toBeLessThan(s.indexOf("One deal carries"));
    expect(s).toContain("is not published");
  });
  it("says nothing about a withheld figure when none was computable", () => {
    const s = refusalSentence(refusal("UNSCHEDULED", "Nobody has scheduled it."));
    expect(s).not.toContain("would read");
    expect(s).toBe("No date exists yet: Nobody has scheduled it.");
  });
});
describe("refusalShort", () => {
  it("is the human label alone, for a cell with no room for a sentence", () => {
    expect(refusalShort(refusal("SPLIT_ROSTER", "x"))).toBe(
      "the parts do not agree",
    );
  });
  it("is never a dash, an empty string, or anything that reads as a missing value", () => {
    for (const code of REFUSAL_CODE_LIST) {
      const short = refusalShort(refusal(code, "x"));
      expect(short).not.toBe("");
      expect(short).not.toBe("-");
      expect(short.trim()).toBe(short);
    }
  });
});
