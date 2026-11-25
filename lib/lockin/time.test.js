import { describe, expect, it } from "vitest";
import { DECIDE_BUFFER_MIN, DEFAULT_TZ, clockText, dateIn, dayClockText, deadlineText, decideBy, displayTz, stripZone, tipShort, zoneLabel } from "./time.js";

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

describe("decide-by buffer", () => {
  const tip = "2026-11-25T19:30:00-05:00"; // Wed 7:30 PM ET
  it("asks for the call DECIDE_BUFFER_MIN before the listed tip and keeps the tip visible", () => {
    expect(DECIDE_BUFFER_MIN).toBe(10);
    const d = decideBy(tip, DEFAULT_TZ, { today: "2026-11-25", nowMs: Date.parse("2026-11-25T17:00:00-05:00") });
    expect(d.byText).toBe("7:20 PM");
    expect(d.tipText).toBe("7:30");
    expect(Date.parse(d.tip) - Date.parse(d.by)).toBe(10 * 60_000);
    expect(d.passed).toBe(false);
  });
  it("names the day when it is not today, including across midnight", () => {
    expect(decideBy(tip, DEFAULT_TZ, { today: "2026-11-24", nowMs: 0 }).byText).toBe("Wed 7:20 PM");
    const late = decideBy("2026-11-26T00:05:00-05:00", DEFAULT_TZ, { today: "2026-11-25", nowMs: 0 }); // Thu 12:05 AM tip
    expect(late.byText).toBe("11:55 PM"); // decide-by falls on Wednesday, today
    expect(late.tipText).toBe("12:05 AM"); // after midnight: AM/PM kept
    // decide-by and tip on different days (an 12:05 AM tip's 11:55 PM decide-by is the day before)
    expect(decideBy("2026-11-26T00:05:00-05:00", DEFAULT_TZ, { today: "2026-11-24", nowMs: 0 }).byText).toBe("Wed 11:55 PM");
    expect(decideBy("2026-11-25T00:20:00-05:00", DEFAULT_TZ, { nowMs: 0 }).tipText).toBe("12:20 AM"); // same day, still AM
    expect(decideBy("2026-11-25T19:30:00-05:00", DEFAULT_TZ, { nowMs: 0 }).tipText).toBe("7:30"); // same evening: bare clock
  });
  it("flags the window between the decide-by time and the tip", () => {
    const at = (s) => decideBy(tip, DEFAULT_TZ, { today: "2026-11-25", nowMs: Date.parse(s) });
    expect(at("2026-11-25T19:19:00-05:00")).toMatchObject({ passed: false, tipPassed: false });
    expect(at("2026-11-25T19:25:00-05:00")).toMatchObject({ passed: true, tipPassed: false });
    expect(at("2026-11-25T19:31:00-05:00")).toMatchObject({ passed: false, tipPassed: true });
    expect(decideBy(tip, DEFAULT_TZ, { bufferMin: 30, today: "2026-11-25", nowMs: 0 }).byText).toBe("7:00 PM");
    expect(decideBy(null)).toBeNull();
  });
});
