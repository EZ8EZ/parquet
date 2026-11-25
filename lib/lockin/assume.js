/**
 * User assumptions about lock state. Sleeper does not expose lock state (lockState.js infers it,
 * often only after the slot's next game), so the viewer may say "treat this slot as locked" or
 * "treat it as playing on" for any starter slot on either side. Ephemeral: carried in the URL
 * (`?assume=m3L,t5O`), never stored.
 *
 * Token: side (m = mine, t = theirs) + starter slot index (0-based, the slot's `index`) + state
 * (L = locked, O = open / playing on).
 */

export const ASSUME_MAX = 20;
// slot index without leading zeros ("m01L" is not a token)
const TOKEN = /^([mt])(0|[1-9]\d?)([LO])$/;

/**
 * Parse the URL param. slotCount: starter slots per side (an index at or past it is rejected).
 * Duplicates (same side and slot): the last one wins. At most ASSUME_MAX entries are kept.
 * Returns { list: [{ side, slot, state }], rejected: [token] } with list in first-seen order.
 */
export function parseAssume(param, { slotCount = Infinity } = {}) {
  const raw = Array.isArray(param) ? param.join(",") : typeof param === "string" ? param : "";
  const bySlot = new Map();
  const rejected = [];
  for (const tok of raw.split(",").map((t) => t.trim()).filter(Boolean)) {
    const m = TOKEN.exec(tok);
    const slot = m ? Number(m[2]) : NaN;
    if (!m || !(slot < slotCount)) {
      rejected.push(tok);
      continue;
    }
    const key = `${m[1]}${slot}`;
    if (!bySlot.has(key) && bySlot.size >= ASSUME_MAX) {
      rejected.push(tok);
      continue;
    }
    bySlot.set(key, { side: m[1] === "m" ? "mine" : "theirs", slot, state: m[3] === "L" ? "locked" : "open" });
  }
  return { list: [...bySlot.values()], rejected };
}

/** Inverse of parseAssume for a normalised list. */
export function serialiseAssume(list) {
  return normaliseAssume(list)
    .map((a) => `${a.side === "mine" ? "m" : "t"}${a.slot}${a.state === "locked" ? "L" : "O"}`)
    .join(",");
}

/** Validate a list given directly (buildWeekDesk input): same rules as the parser. */
export function normaliseAssume(list, { slotCount = Infinity } = {}) {
  if (!Array.isArray(list)) return [];
  const tokens = list
    .filter((a) => a && (a.side === "mine" || a.side === "theirs") && Number.isInteger(a.slot) && a.slot >= 0 && (a.state === "locked" || a.state === "open"))
    .map((a) => `${a.side === "mine" ? "m" : "t"}${a.slot}${a.state === "locked" ? "L" : "O"}`);
  return parseAssume(tokens.join(","), { slotCount }).list;
}

/**
 * The slot's lock state under an assumption. ls: inferLockState output; gamesLeft: the
 * occupant's games not yet started; live: his game is on. Returns { ls, contradicts }.
 * locked: the banked score is final for the week (no later game counts for the slot).
 * open: the slot is known not locked. A held score with games left stays a holder with no
 * chance of being locked already (it can still be locked by the rule before the next tip);
 * a zero or empty slot is open for the policy's fill; a game in progress counts at its
 * in-game projection; with nothing left to play the banked score stands either way.
 * contradicts: the assumption disagrees with a certain inference (locked vs a certain reset,
 * open vs a certain lock).
 */
export function assumedLockState(ls, state, { banked, gamesLeft, live }) {
  if (state === "locked") {
    const contradicts = ls.certain === true && ls.state === "reset";
    return { ls: { state: "locked", reason: "assumed_locked", certain: true, score: banked ?? 0 }, contradicts };
  }
  const contradicts = ls.certain === true && ls.state === "locked";
  let next;
  if (live) next = { state: null, reason: "assumed_open_live", certain: true, score: banked };
  else if (gamesLeft > 0 && (banked ?? 0) > 0) next = { state: "unknown_until_next_tip", reason: "assumed_open", certain: true, score: banked };
  else if (gamesLeft > 0) next = { state: "reset", reason: "assumed_open", certain: true, score: 0 };
  else next = { state: null, reason: "final_game_score_stands", certain: true, score: banked };
  return { ls: next, contradicts };
}

const fmt = (x) => (Math.round((x ?? 0) * 10) / 10).toFixed(1);

/** One line for the desk: "2 assumed: your PG locked at 33.0; their C playing on". */
export function assumeText(applied) {
  if (!applied.length) return null;
  const parts = applied.map((a) => `${a.side === "mine" ? "your" : "their"} ${a.label ?? `slot ${a.slot + 1}`} ${a.state === "locked" ? `locked at ${fmt(a.banked)}` : "playing on"}`);
  return `${applied.length} assumed: ${parts.join("; ")}`;
}
