import { describe, expect, it } from "vitest";
import { Trophy } from "lucide-react";
import { AWARD_ICONS, iconForAward } from "./AwardBadge";
import { AWARD_GROUPS } from "@/lib/superlatives";
import { GROUP_TONE } from "./AwardBadge";
// Every id currently defined in lib/superlatives, kept in sync by hand: this guards
// against a new award silently landing on the generic Trophy fallback.
const KNOWN_AWARD_IDS = [
  "start-rate",
  "start-rate-worst",
  "draft-capture",
  "draft-steal",
  "draft-bust",
  "fragility",
  "trade-value",
  "most-trades",
  "fewest-trades",
  "initiator",
  "responder",
  "trade-pairing",
  "pick-hoarder",
  "pick-spender",
  "deadline-buyer",
  "youth-acquirer",
  "veteran-acquirer",
  "panic-button",
  "waiver-churn",
  "faab-spender",
  "longest-hold",
  "shortest-hold",
];
describe("iconForAward", () => {
  it("gives every known award a distinct, considered icon", () => {
    for (const id of KNOWN_AWARD_IDS) {
      expect(AWARD_ICONS[id]).toBeDefined();
    }
    const icons = KNOWN_AWARD_IDS.map((id) => AWARD_ICONS[id]);
    expect(new Set(icons).size).toBe(icons.length);
  });
  it("falls back to Trophy for an id with no mapping yet, rather than throwing", () => {
    expect(iconForAward("some-future-award-nobody-has-mapped")).toBe(Trophy);
  });
});
describe("GROUP_TONE", () => {
  it("gives every award group a tone", () => {
    for (const g of AWARD_GROUPS) {
      expect(GROUP_TONE[g.id]).toBeTruthy();
    }
  });
});
