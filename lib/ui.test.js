import { describe, expect, it } from "vitest";
import { fold } from "./ui";
/**
 * `fold` is the one shared query/name matcher (see its doc comment) - three
 * surfaces previously carried private near-copies, so these cases pin the
 * shared behaviour every one of them relied on.
 */
describe("fold", () => {
  it("strips the diacritics this league actually types around", () => {
    expect(fold("Nikola Jokić")).toBe("nikola jokic");
    expect(fold("Luka Dončić")).toBe("luka doncic");
    expect(fold("Alperen Şengün")).toBe("alperen sengun");
  });
  it("lowercases, so matching is case-insensitive on both sides", () => {
    expect(fold("WEMBANYAMA")).toBe("wembanyama");
  });
  it("leaves plain ASCII untouched apart from case", () => {
    expect(fold("RJ Barrett 2027 1st")).toBe("rj barrett 2027 1st");
  });
  it("is idempotent - folding a folded string changes nothing", () => {
    const once = fold("Vít Krejčí");
    expect(fold(once)).toBe(once);
  });
});
