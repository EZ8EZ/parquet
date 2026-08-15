import { describe, expect, it } from "vitest";
import { VALUATION_CONFIG } from "./config";
import {
  injuryAgeScale,
  injuryAssessment,
  injuryClassOf,
  injuryLabel,
  injuryMultiplier,
  maxInjuryMultiplier,
} from "./injury";
/**
 * Every body part, note and status string Sleeper actually emitted for the NBA when
 * this model was built, with live counts. These are the real vocabulary, not a
 * plausible one, and the first test below is the guard that stopped the old model
 * being wrong for a whole season: it had NFL words in it and nothing checked.
 */
const LIVE_BODY_PARTS = [
  "Knee",
  "Ankle",
  "Rest",
  "Hamstring",
  "Foot",
  "Finger",
  "Toe",
  "Shoulder",
  "Achilles",
  "Calf",
  "Undisclosed",
  "Wrist",
  "Back",
  "Hip",
  "Quadriceps",
  "Ribs",
  "Elbow",
  "Eye",
  "Illness",
  "Thumb",
  "Nose",
  "Heel",
  "Groin",
  "Lower Leg",
  "Not Injury Related",
];
const LIVE_NOTES = [
  "Surgery",
  "Sprain",
  "Strain",
  "Soreness",
  "Fracture",
  "Bruise",
  "Inflammation",
];
const LIVE_STATUSES = ["DTD", "Out", "IR"];
/** Real rows from the live feed, used as calibration fixtures. */
const HALIBURTON = {
  status: "DTD",
  bodyPart: "Achilles",
  notes: "Surgery",
  age: 26,
};
const LILLARD = {
  status: "DTD",
  bodyPart: "Achilles",
  notes: "Surgery",
  age: 36,
};
const GIANNIS = {
  status: "DTD",
  bodyPart: "Knee",
  notes: "Bruise",
  age: 31,
};
const DAVIS_FINGER = {
  status: "DTD",
  bodyPart: "Finger",
  notes: "Sprain",
  age: 33,
};
const MALUACH_REST = { status: "DTD", bodyPart: "Rest", notes: null, age: 19 };
const ADEBAYO_BACK = { status: "DTD", bodyPart: "Back", notes: null, age: 29 };
const TOPIC_BACK = {
  status: "DTD",
  bodyPart: "Back",
  notes: "Surgery",
  age: 20,
};
describe("the live Sleeper NBA vocabulary is fully mapped", () => {
  /**
   * The defect that motivated this whole rebuild. The old config was keyed on
   * Questionable / Doubtful / Sus / PUP / NA, which appear ZERO times in live NBA
   * data, and did not contain DTD, which is 110 of 120 flags. Every real injury in
   * the league fell through to a default. This test makes that class of mistake
   * impossible to reintroduce silently.
   */
  it("classifies every body part the live feed emits, none as unmapped", () => {
    for (const part of LIVE_BODY_PARTS) {
      expect(
        VALUATION_CONFIG.injury.bodyPartClass[part],
        `body part "${part}" is unmapped`,
      ).toBeDefined();
    }
  });
  it("prices every note the live feed emits", () => {
    for (const note of LIVE_NOTES) {
      expect(
        VALUATION_CONFIG.injury.noteScale[note],
        `note "${note}" is unmapped`,
      ).toBeDefined();
    }
  });
  it("prices every status the live feed emits, and only those", () => {
    for (const s of LIVE_STATUSES) {
      expect(VALUATION_CONFIG.injury.statusScale[s]).toBeDefined();
    }
    // The NFL vocabulary is gone and must stay gone. If someone re-adds one of these
    // they should have to justify it, because NBA data has never contained one.
    for (const nfl of ["Questionable", "Doubtful", "Sus", "PUP", "NA"]) {
      expect(VALUATION_CONFIG.injury.statusScale[nfl]).toBeUndefined();
    }
  });
  it("has a penalty and a slope for every class it can produce", () => {
    const classes = new Set(
      Object.values(VALUATION_CONFIG.injury.bodyPartClass),
    );
    classes.add(VALUATION_CONFIG.injury.unmappedClass);
    for (const c of classes) {
      expect(VALUATION_CONFIG.injury.classPenalty[c]).toBeDefined();
      expect(VALUATION_CONFIG.injury.classAgeSlope[c]).toBeDefined();
    }
  });
  it("falls back to the unknown class rather than throwing on a new body part", () => {
    expect(injuryClassOf("Spleen")).toBe("unknown");
    expect(
      injuryMultiplier({ status: "DTD", bodyPart: "Spleen" }),
    ).toBeLessThan(1);
  });
});
describe("the healthy case", () => {
  it("is exactly 1.0, and is the only observable healthy state", () => {
    expect(injuryMultiplier({ status: null })).toBe(1);
    expect(injuryMultiplier({})).toBe(1);
    expect(injuryAssessment({ status: null }).healthy).toBe(true);
  });
  /**
   * THE DOCUMENTED GAP. Michael Porter Jr. (Sleeper 1988, age 28) has a well-known
   * multi-surgery back history and returns `injury_status: null`, so he prices at a
   * clean 1.0 here - identical to a 22-year-old who has never been hurt. Sleeper
   * publishes no injury history and `injury_start_date` is populated on 0 of 2,106
   * players, so chronic risk is not derivable and is deliberately NOT modelled.
   * This test pins the gap so nobody later mistakes it for an oversight, and so that
   * any attempt to close it by inference (DECISIONS.md D19) has to fail here first.
   */
  it("cannot see a healed injury, and says so by pricing it at 1.0", () => {
    const mpj = { status: null, bodyPart: null, notes: null, age: 28 };
    const neverHurt = { status: null, bodyPart: null, notes: null, age: 22 };
    expect(injuryMultiplier(mpj)).toBe(1);
    expect(injuryMultiplier(mpj)).toBe(injuryMultiplier(neverHurt));
  });
});
describe("body part drives severity, not the status word", () => {
  /**
   * Sleeper marks Haliburton's ruptured Achilles and a bruised quad both "DTD". The
   * status field cannot separate them; the body part and note can, and must.
   */
  it("separates a ruptured Achilles from a bruised knee at the same status", () => {
    expect(injuryMultiplier(HALIBURTON)).toBeLessThan(
      injuryMultiplier(GIANNIS) - 0.15,
    );
    expect(injuryAssessment(HALIBURTON).statusScale).toBe(
      injuryAssessment(GIANNIS).statusScale,
    );
  });
  it("orders the classes by dynasty consequence", () => {
    const at = (bodyPart) =>
      injuryMultiplier({ status: "DTD", bodyPart, notes: "Surgery", age: 27 });
    expect(at("Achilles")).toBeLessThan(at("Knee"));
    expect(at("Knee")).toBeLessThan(at("Back"));
    expect(at("Back")).toBeLessThan(at("Hamstring"));
    expect(at("Hamstring")).toBeLessThan(at("Shoulder"));
    expect(at("Shoulder")).toBeLessThan(at("Finger"));
  });
  it("barely touches a peripheral injury even on an old player", () => {
    // Anthony Davis, 33, jammed finger. The old model charged him 3% of his dynasty
    // value for it. This charges under 1%.
    expect(injuryMultiplier(DAVIS_FINGER)).toBeGreaterThan(0.98);
  });
  it("moves the status term only slightly, and in the right direction", () => {
    const knee = { bodyPart: "Knee", notes: "Surgery", age: 27 };
    const dtd = injuryMultiplier({ ...knee, status: "DTD" });
    const out = injuryMultiplier({ ...knee, status: "Out" });
    const ir = injuryMultiplier({ ...knee, status: "IR" });
    expect(ir).toBeLessThan(out);
    expect(out).toBeLessThan(dtd);
    // Small: the whole spread from DTD to IR is worth less than the gap between a
    // sprain and surgery, because status carries far less information than the note.
    expect(dtd - ir).toBeLessThan(
      injuryMultiplier({ ...knee, status: "DTD", notes: "Sprain" }) - dtd,
    );
  });
});
describe("note type scales severity within a class", () => {
  it("ranks surgery worst and a bruise least, with sprain and strain between", () => {
    const knee = (notes) =>
      injuryMultiplier({ status: "DTD", bodyPart: "Knee", notes, age: 27 });
    expect(knee("Surgery")).toBeLessThan(knee("Fracture"));
    expect(knee("Fracture")).toBeLessThan(knee("Strain"));
    expect(knee("Strain")).toBeLessThan(knee("Sprain"));
    expect(knee("Sprain")).toBeLessThan(knee("Soreness"));
    expect(knee("Soreness")).toBeLessThan(knee("Bruise"));
  });
  it("ranks inflammation above a sprain, because tendinopathy recurs", () => {
    const knee = (notes) =>
      injuryMultiplier({ status: "DTD", bodyPart: "Knee", notes, age: 27 });
    expect(knee("Inflammation")).toBeLessThan(knee("Sprain"));
  });
  /**
   * 40 of 120 live flags carry a body part and no note. Taking the benign end would
   * systematically underprice risk on exactly the players Sleeper says least about,
   * so the missing case is the MIDPOINT and this pins it as a decision.
   */
  it("treats a missing note as the midpoint, not as benign", () => {
    const knee = (notes) =>
      injuryMultiplier({ status: "DTD", bodyPart: "Knee", notes, age: 27 });
    expect(knee(null)).toBeLessThan(knee("Bruise"));
    expect(knee(null)).toBeGreaterThan(knee("Surgery"));
    // Bam Adebayo, 29, back, no note: a real and non-trivial haircut on an unknown.
    expect(injuryMultiplier(ADEBAYO_BACK)).toBeLessThan(0.95);
  });
});
describe("age changes what an injury means", () => {
  /**
   * The owner's central ask. Same injury, two ages, materially different dynasty
   * outcomes - and the interaction lives HERE rather than in `ageMultiplier`, which
   * already prices being old on its own.
   */
  it("makes an Achilles rupture far worse at 32 than at 23", () => {
    const young = injuryMultiplier({ ...HALIBURTON, age: 23 });
    const old = injuryMultiplier({ ...HALIBURTON, age: 32 });
    expect(young).toBeGreaterThan(0.8);
    expect(old).toBeLessThan(0.6);
  });
  it("makes Lillard at 36 a far heavier write-down than Haliburton at 26", () => {
    expect(injuryMultiplier(LILLARD)).toBeLessThan(
      injuryMultiplier(HALIBURTON) - 0.2,
    );
  });
  it("climbs soft-tissue recurrence risk steeply with age", () => {
    const ham = (age) =>
      injuryMultiplier({
        status: "DTD",
        bodyPart: "Hamstring",
        notes: "Strain",
        age,
      });
    // DeMar DeRozan (36) and Peyton Watson (23), same hamstring strain, live.
    expect(1 - ham(36)).toBeGreaterThan((1 - ham(23)) * 2);
  });
  /**
   * The judgement call most likely to be argued with, so it is pinned explicitly
   * rather than left to emerge. A degenerative back or hip has a NEARLY FLAT age
   * slope: a 20-year-old is buying a decade of managed load, an older player has less
   * runway for it to compound over, and those two effects roughly cancel. Nikola
   * Topic, 20, back surgery, is live proof this matters - a naive age slope would
   * have handed him an almost free pass.
   */
  it("does not let a young player off the hook for a degenerative back", () => {
    expect(injuryMultiplier(TOPIC_BACK)).toBeLessThan(0.87);
    const old = injuryMultiplier({ ...TOPIC_BACK, age: 34 });
    // Flat, not inverted: age still costs something, just far less than for Achilles.
    expect(old).toBeLessThan(injuryMultiplier(TOPIC_BACK));
    expect(injuryMultiplier(TOPIC_BACK) - old).toBeLessThan(0.06);
  });
  it("gives a peripheral injury no age slope at all", () => {
    expect(injuryMultiplier({ ...DAVIS_FINGER, age: 20 })).toBe(
      injuryMultiplier({ ...DAVIS_FINGER, age: 38 }),
    );
  });
  it("bounds the age scale at both ends so no term can run away", () => {
    const { ageScaleMin, ageScaleMax } = VALUATION_CONFIG.injury;
    expect(injuryAgeScale(2, "achilles")).toBe(ageScaleMin);
    expect(injuryAgeScale(99, "achilles")).toBe(ageScaleMax);
    expect(
      injuryAgeScale(VALUATION_CONFIG.injury.ageReference, "achilles"),
    ).toBe(1);
  });
  it("uses the league's median age when a flagged player has no age on file", () => {
    expect(injuryMultiplier({ ...HALIBURTON, age: null })).toBe(
      injuryMultiplier({
        ...HALIBURTON,
        age: VALUATION_CONFIG.injury.unknownAge,
      }),
    );
  });
});
describe("load management is not an injury", () => {
  /**
   * Eleven live players carry body part "Rest", every one of them aged 19 to 25 and
   * flagged DTD. That is two-way shuttling and load management, not a body breaking
   * down, and the old model charged every one of them the same 3% it charged a torn
   * Achilles. Exactly zero, not merely small: pricing a rested rookie below a healthy
   * player is an error, not a conservative choice.
   */
  it("costs a rested player exactly nothing", () => {
    expect(injuryMultiplier(MALUACH_REST)).toBe(1);
    expect(
      injuryMultiplier({ status: "DTD", bodyPart: "Not Injury Related" }),
    ).toBe(1);
    expect(injuryAssessment(MALUACH_REST).loadManagement).toBe(true);
  });
  it("still treats Undisclosed as an injury, because it is one", () => {
    const undisclosed = injuryMultiplier({
      status: "DTD",
      bodyPart: "Undisclosed",
    });
    expect(undisclosed).toBeLessThan(1);
    expect(undisclosed).toBeGreaterThan(0.9);
  });
  it("keeps illness a rounding error rather than a dynasty event", () => {
    expect(
      injuryMultiplier({ status: "DTD", bodyPart: "Illness" }),
    ).toBeGreaterThan(0.99);
  });
});
describe("the ceiling invariant", () => {
  /**
   * `theoreticalMaxMultiplier` rescales every value in the app by the product of each
   * term's max (DECISIONS.md D28). If the injury term could exceed 1.0 the ceiling
   * would move and every player's value with it. In penalty form it cannot, by
   * construction - but this derives that from config rather than trusting it.
   */
  it("never exceeds 1.0, for any combination in the live vocabulary", () => {
    for (const bodyPart of [...LIVE_BODY_PARTS, "Spleen"]) {
      for (const notes of [...LIVE_NOTES, null]) {
        for (const status of [...LIVE_STATUSES, null]) {
          for (const age of [18, 27, 41, null]) {
            const m = injuryMultiplier({ status, bodyPart, notes, age });
            expect(m).toBeLessThanOrEqual(1);
            expect(m).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
  it("derives its own max as exactly 1.0 under the shipped config", () => {
    expect(maxInjuryMultiplier()).toBe(1);
  });
  /**
   * The stated max has to be a real bound on the function, not a parallel calculation
   * that happens to agree today. Swept over the whole live vocabulary rather than
   * argued about.
   */
  it("bounds the actual function across the whole live vocabulary", () => {
    let observed = 0;
    for (const bodyPart of [...LIVE_BODY_PARTS, "Spleen", null]) {
      for (const notes of [...LIVE_NOTES, "Unheard Of", null]) {
        for (const status of [...LIVE_STATUSES, "Questionable", null]) {
          for (const age of [18, 27, 41, null]) {
            observed = Math.max(
              observed,
              injuryMultiplier({ status, bodyPart, notes, age }),
            );
          }
        }
      }
    }
    expect(observed).toBeLessThanOrEqual(maxInjuryMultiplier());
    expect(observed).toBe(1);
  });
  /**
   * A "healthy bonus" written as a negative penalty is the exact shape of edit that
   * opened D28's bug. Here it cannot reopen it: the clamp inside `injuryAssessment`
   * makes the bound structural rather than merely calibrated, and `maxInjuryMultiplier`
   * mirrors that same clamp so the two can never disagree about what the ceiling is.
   */
  it("absorbs a negative penalty instead of letting it lift the ceiling", () => {
    const bonusCfg = {
      ...VALUATION_CONFIG,
      injury: {
        ...VALUATION_CONFIG.injury,
        classPenalty: { ...VALUATION_CONFIG.injury.classPenalty, minor: -0.1 },
      },
    };
    expect(
      injuryMultiplier({ status: "DTD", bodyPart: "Finger" }, bonusCfg),
    ).toBe(1);
    expect(maxInjuryMultiplier(bonusCfg)).toBe(1);
  });
});
describe("injuryLabel", () => {
  it("reads as the injury, not as a status code", () => {
    expect(injuryLabel(HALIBURTON)).toBe("Achilles · Surgery");
    expect(injuryLabel(ADEBAYO_BACK)).toBe("Back");
  });
  it("shows nothing for a healthy player or a rested one", () => {
    expect(injuryLabel({ status: null })).toBeNull();
    expect(injuryLabel(MALUACH_REST)).toBeNull();
  });
});
