import { afterEach, describe, expect, it } from "vitest";
import {
  authSecret,
  canCapture,
  captureBlock,
  claimPath,
  claimUrl,
  isMultiUser,
  isSafeOwnerId,
  LEGACY_SEAT,
  resolveSeat,
  signSeatToken,
  verifySeatToken,
  viewAuthorId,
  writeAuthorId,
} from "./seat.js";
const SECRET = "a-long-random-string-for-tests-only";
const OTHER_SECRET = "a-different-long-random-string";
/** The real league's owner ids are numeric strings; the fixture's are `u1`. */
const EZ8 = "462383675828461568";
const RIVAL = "u7";
describe("token signing and verification", () => {
  it("round-trips a real owner id", () => {
    const token = signSeatToken(EZ8, SECRET);
    expect(verifySeatToken(token, SECRET)).toBe(EZ8);
  });
  it("is deterministic - the same link works forever until the secret rotates", () => {
    expect(signSeatToken(EZ8, SECRET)).toBe(signSeatToken(EZ8, SECRET));
  });
  it("gives different owners different tokens", () => {
    expect(signSeatToken(EZ8, SECRET)).not.toBe(signSeatToken(RIVAL, SECRET));
  });
  it("rejects a TAMPERED owner id - the whole point of signing it", () => {
    // Swap the id but keep EZ8's signature: this is the attack, spelled out.
    const token = signSeatToken(EZ8, SECRET);
    const [version, , sig] = token.split(".");
    expect(verifySeatToken(`${version}.${RIVAL}.${sig}`, SECRET)).toBeNull();
  });
  it("rejects a tampered SIGNATURE", () => {
    const token = signSeatToken(EZ8, SECRET);
    const flipped = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifySeatToken(flipped, SECRET)).toBeNull();
  });
  it("rejects a token signed with the WRONG secret", () => {
    const token = signSeatToken(EZ8, OTHER_SECRET);
    expect(verifySeatToken(token, SECRET)).toBeNull();
  });
  it("rejects truncated, over-long and malformed tokens without throwing", () => {
    const token = signSeatToken(EZ8, SECRET);
    for (const bad of [
      "",
      "garbage",
      token.slice(0, 10), // truncated: signature is the wrong LENGTH, which
      `${token}extra`, //   timingSafeEqual would throw on if unguarded
      token.split(".").slice(0, 2).join("."),
      `${token}.extra`,
      `s2.${EZ8}.${token.split(".")[2]}`, // a future token shape replayed as s1
    ]) {
      expect(verifySeatToken(bad, SECRET)).toBeNull();
    }
    expect(verifySeatToken(null, SECRET)).toBeNull();
    expect(verifySeatToken(undefined, SECRET)).toBeNull();
  });
  it("rejects an owner id carrying a separator, rather than escaping it", () => {
    expect(isSafeOwnerId("u1.u2")).toBe(false);
    expect(isSafeOwnerId("")).toBe(false);
    expect(isSafeOwnerId("u1")).toBe(true);
    expect(() => signSeatToken("u1.u2", SECRET)).toThrow();
  });
  it("verifies nothing when there is no secret", () => {
    const token = signSeatToken(EZ8, SECRET);
    expect(verifySeatToken(token, null)).toBeNull();
  });
});
describe("AUTH_SECRET, the one switch the feature hangs off", () => {
  const original = process.env.AUTH_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });
  it("is absent by default in this suite - legacy mode is the tested default", () => {
    delete process.env.AUTH_SECRET;
    expect(authSecret()).toBeNull();
    expect(isMultiUser()).toBe(false);
  });
  it("treats a blank or whitespace-only value as absent, not as a one-space secret", () => {
    process.env.AUTH_SECRET = "";
    expect(authSecret()).toBeNull();
    process.env.AUTH_SECRET = "   ";
    expect(authSecret()).toBeNull();
    expect(isMultiUser()).toBe(false);
  });
  it("trims, so a stray newline in a .env file does not become part of the key", () => {
    process.env.AUTH_SECRET = `  ${SECRET}\n`;
    expect(authSecret()).toBe(SECRET);
    expect(isMultiUser()).toBe(true);
  });
});
describe("resolveSeat", () => {
  it("MISSING SECRET IS LEGACY MODE - no enforcement, whatever the cookie says", () => {
    const token = signSeatToken(EZ8, SECRET);
    expect(resolveSeat(token, null)).toEqual(LEGACY_SEAT);
    expect(resolveSeat("anything at all", null)).toEqual(LEGACY_SEAT);
    expect(resolveSeat(undefined, null).enforced).toBe(false);
  });
  it("enforces with a secret, and a valid cookie proves an owner", () => {
    expect(resolveSeat(signSeatToken(EZ8, SECRET), SECRET)).toEqual({
      enforced: true,
      ownerId: EZ8,
    });
  });
  it("enforces with a secret and no usable cookie, which is NOT the same as legacy", () => {
    for (const bad of [undefined, "", "forged"]) {
      expect(resolveSeat(bad, SECRET)).toEqual({
        enforced: true,
        ownerId: null,
      });
    }
  });
});
// ------------------------------------------------------------------ the matrix
const legacy = LEGACY_SEAT;
const unclaimed = { enforced: true, ownerId: null };
const seated = { enforced: true, ownerId: EZ8 };
describe("writeAuthorId - what a write gets stamped with", () => {
  it("LEGACY: the lens, exactly as before seats existed", () => {
    expect(writeAuthorId(legacy, EZ8)).toBe(EZ8);
    expect(writeAuthorId(legacy, RIVAL)).toBe(RIVAL);
  });
  it("refuses an unclaimed browser", () => {
    expect(writeAuthorId(unclaimed, EZ8)).toBeNull();
  });
  it("STAMPS THE SEAT, NEVER THE LENS - the forged-cookie bug, pinned", () => {
    // The lens cookie says "I am the rival". The seat says otherwise, and the seat
    // is the only one of the two that is signed.
    expect(writeAuthorId(seated, RIVAL)).toBe(EZ8);
    expect(writeAuthorId(seated, "")).toBe(EZ8);
  });
});
describe("viewAuthorId - whose private content a view may show", () => {
  it("LEGACY: the lens, so every existing read path is unchanged", () => {
    expect(viewAuthorId(legacy, EZ8)).toBe(EZ8);
  });
  it("shows nothing to an unclaimed browser", () => {
    expect(viewAuthorId(unclaimed, EZ8)).toBeNull();
  });
  it("shows your own content when the lens is on your own team", () => {
    expect(viewAuthorId(seated, EZ8)).toBe(EZ8);
  });
  it("shows NOTHING through someone else's lens - not theirs, and not yours", () => {
    expect(viewAuthorId(seated, RIVAL)).toBeNull();
  });
});
describe("canCapture / captureBlock - what the UI is allowed to offer", () => {
  it("always allows capture in legacy mode", () => {
    expect(canCapture(legacy, EZ8)).toBe(true);
    expect(captureBlock(legacy, RIVAL)).toBeNull();
  });
  it("names the two blocked states apart, because the copy differs", () => {
    expect(captureBlock(unclaimed, EZ8)).toBe("unclaimed");
    expect(captureBlock(seated, RIVAL)).toBe("other-lens");
    expect(captureBlock(seated, EZ8)).toBeNull();
  });
  it("agrees with viewAuthorId in every case", () => {
    for (const seat of [legacy, unclaimed, seated]) {
      for (const lens of [EZ8, RIVAL, ""]) {
        expect(canCapture(seat, lens)).toBe(viewAuthorId(seat, lens) !== null);
        expect(captureBlock(seat, lens) === null).toBe(canCapture(seat, lens));
      }
    }
  });
  it("never refuses anything in legacy mode, not even a nameless lens", () => {
    // The corpus always has users, so this is degenerate - but "exactly as today"
    // has to hold for the degenerate cases too, and today there is no gate at all.
    expect(canCapture(legacy, "")).toBe(true);
    expect(viewAuthorId(legacy, "")).toBe("");
    // Writes are the one place that value is refused, because a row authored by
    // nobody is worse than a refused write.
    expect(writeAuthorId(legacy, "")).toBeNull();
  });
});
describe("claim links", () => {
  it("is a /claim path carrying a verifiable token", () => {
    const path = claimPath(EZ8, SECRET);
    expect(path.startsWith("/claim?t=")).toBe(true);
    const token = decodeURIComponent(path.slice("/claim?t=".length));
    expect(verifySeatToken(token, SECRET)).toBe(EZ8);
  });
  it("does not double up the slash when the origin has a trailing one", () => {
    expect(claimUrl(EZ8, SECRET, "https://parquet.example/")).toBe(
      `https://parquet.example${claimPath(EZ8, SECRET)}`,
    );
  });
  /**
   * `isSafeOwnerId` IS the throw condition, exactly - not an approximation of it.
   *
   * /commissioner builds one link per manager inside a `.map`, so an id `signSeatToken`
   * refuses is an unhandled throw in a server component: the whole page, not one row.
   * That surface now pre-filters on `isSafeOwnerId` and reports the skipped managers,
   * which is only correct while the predicate and the throw agree on every input. If a
   * future change loosens one without the other, this fails here rather than in a
   * blank /commissioner.
   */
  it("throws for exactly the ids isSafeOwnerId rejects, and no others", () => {
    const ids = [
      EZ8,
      "u1",
      "467123456789012345",
      "a-b_c",
      "A".repeat(64),
      // Rejected: the token's own separator, whitespace, empty, over-length, unicode.
      "u.1",
      "u 1",
      "",
      "A".repeat(65),
      "ü1",
      "u/1",
    ];
    for (const id of ids) {
      const attempt = () => claimUrl(id, SECRET, "https://parquet.example");
      if (isSafeOwnerId(id)) expect(attempt).not.toThrow();
      else expect(attempt).toThrow(/unsafe owner id/);
    }
  });
});
