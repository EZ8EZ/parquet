import { describe, expect, it } from "vitest";
import { dossierBehaviours, tagBehaviour } from "./behaviours.js";

const p = {
  trades: 17,
  tradesInitiated: 12,
  totalTransactions: 170,
  picks: { net: 4 },
  acquisitions: { avgAge: 23.5 },
  afterLoss: { afterLoss: 5, total: 8 },
  deadline: { buys: 3, sells: 1 },
  waivers: 132,
  freeAgents: 21,
  faabAggression: 14,
};

describe("tagBehaviour", () => {
  it("turns each label into the behaviour and count behind it", () => {
    expect(tagBehaviour("Usually starts trades", p, 3.4)).toBe("12/17 trades started");
    expect(tagBehaviour("Trades often", p, 3.4)).toBe("3.4 trades a season");
    expect(tagBehaviour("Adds picks on net", p, 3.4)).toBe("+4 picks net");
    expect(tagBehaviour("Gives up picks on net", { ...p, picks: { net: -5 } }, 1)).toBe("-5 picks net");
    expect(tagBehaviour("Works waivers and FA heavily", p, 3.4)).toBe("153 waiver and FA moves");
    expect(tagBehaviour("Trades more after losses", p, 3.4)).toBe("5/8 trades after a loss");
    expect(tagBehaviour("Buys at the deadline", p, 3.4)).toBe("3 deadline buys");
  });
  it("states the rule's floor where the profile stores no count", () => {
    expect(tagBehaviour("Trades for established names", p, 3.4)).toBe("3+ trades for 30+ veterans");
  });
  it("passes an unknown tag through unchanged", () => {
    expect(tagBehaviour("Something new", p, 1)).toBe("Something new");
  });
});

describe("dossierBehaviours", () => {
  it("keeps the dossier's tag order", () => {
    const d = { tags: ["Works waivers and FA heavily", "Usually starts trades"], profile: p, tradesPerSeason: 3.4 };
    expect(dossierBehaviours(d)).toEqual(["153 waiver and FA moves", "12/17 trades started"]);
  });
});
