import { describe, expect, it } from "vitest";
import { DEFAULT_TZ, clockText, dateIn, dayClockText, deadlineText, displayTz, stripZone, tipShort, zoneLabel } from "./time.js";

describe("one display zone", () => {
  const at = "2026-11-24T19:00:00-05:00";
  it("formats clock times in the board's zone with no suffix", () => {
    expect(clockText(at)).toBe("7:00 PM");
    expect(dayClockText(at)).toBe("Tue 7:00 PM");
    expect(clockText(at, "America/Los_Angeles")).toBe("4:00 PM");
    expect(tipShort(at)).toBe("7p");
    expect(tipShort("2026-11-24T22:30:00-05:00")).toBe("10:30p");
    expect(clockText("nope")).toBeNull();
  });
  it("drops the day for a deadline today", () => {
    expect(deadlineText(at, DEFAULT_TZ, "2026-11-24")).toBe("7:00 PM");
    expect(deadlineText(at, DEFAULT_TZ, "2026-11-23")).toBe("Tue 7:00 PM");
    expect(dateIn("2026-11-25T03:00:00Z")).toBe("2026-11-24");
  });
  it("takes desk.displayTz when Intl knows it, else Eastern", () => {
    expect(displayTz({ displayTz: "America/Chicago" })).toBe("America/Chicago");
    expect(displayTz({ displayTz: "Not/AZone" })).toBe(DEFAULT_TZ);
    expect(displayTz(null)).toBe(DEFAULT_TZ);
  });
  it("names US zones without EST/EDT churn and strips zones from engine text", () => {
    expect(zoneLabel("America/New_York", "2026-07-01T12:00:00Z")).toBe("ET");
    expect(zoneLabel("America/Los_Angeles")).toBe("PT");
    expect(stripZone("Kip Arden in for Dane Okafor before 8:00 PM ET")).toBe("Kip Arden in for Dane Okafor before 8:00 PM");
    expect(stripZone("Wait until Fri 7:30 PM EST")).toBe("Wait until Fri 7:30 PM");
  });
});
