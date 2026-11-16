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
    expect(tagBehaviour("Initiator", p, 3.4)).toBe("12/17 trades started");
    expect(tagBehaviour("High-volume trader", p, 3.4)).toBe("3.4 trades a season");
    expect(tagBehaviour("Pick hoarder", p, 3.4)).toBe("+4 picks net");
    expect(tagBehaviour("Pick spender", { ...p, picks: { net: -5 } }, 1)).toBe("-5 picks net");
    expect(tagBehaviour("Streamer", p, 3.4)).toBe("153 waiver and FA moves");
    expect(tagBehaviour("Reactive after losses", p, 3.4)).toBe("5/8 trades after a loss");
    expect(tagBehaviour("Deadline buyer", p, 3.4)).toBe("3 deadline buys");
  });
  it("states the rule's floor where the profile stores no count", () => {
    expect(tagBehaviour("Name chaser", p, 3.4)).toBe("3+ trades for 30+ veterans");
  });
  it("passes an unknown tag through unchanged", () => {
    expect(tagBehaviour("Something new", p, 1)).toBe("Something new");
  });
});

describe("dossierBehaviours", () => {
  it("keeps the dossier's tag order", () => {
    const d = { tags: ["Streamer", "Initiator"], profile: p, tradesPerSeason: 3.4 };
    expect(dossierBehaviours(d)).toEqual(["153 waiver and FA moves", "12/17 trades started"]);
  });
});
