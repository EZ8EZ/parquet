/**
 * The what-if layer's view helpers: which choices a slot tile offers, the URL that
 * carries them (?assume=m3L,t5O, lib/lockin/assume.js), and the What-if bar's lines.
 * Pure; nothing here is stored anywhere. Absent desk.assumptions means none.
 */
import { parseAssume, serialiseAssume } from "./assume.js";
import { fmt, pct, slotStateKey } from "./view.js";

/** "assumed_locked" | "assumed_open" | "assumed_open_live" -> "locked" | "open" | null. */
export function assumedOf(reason) {
  if (reason === "assumed_locked") return "locked";
  if (reason === "assumed_open" || reason === "assumed_open_live") return "open";
  return null;
}

const MODEL_SAYS = { unknown: "unknown until his next game", locked: "locked" };

/**
 * The choices for one slot, or null when the tile offers none (no score to lock, a
 * final score, an empty slot). Your own slot whose lock state is unknown does not offer
 * "playing on": the model already treats your unknown slots as unlocked, so it would
 * change nothing (note says so). -> { options:[{ state, label, current }], note } | null
 * state: "locked" | "open" | null (null = the model's guess).
 */
export function assumeOptions({ side, key, assumed = null, banked = null, contradiction = null, gamesLeft = null }) {
  // a slot whose occupant has no games left: its score stands either way, nothing to assume
  if (gamesLeft === 0 && !assumed) return null;
  const lockAt = `Treat as locked at ${fmt(banked ?? 0)}`;
  const opt = (state, label) => ({ state, label, current: (assumed ?? null) === state });
  if (assumed) {
    // the model's own reading under an assumption is only known when it contradicted it
    const model = contradiction?.inferred ? `Model's guess (${MODEL_SAYS[contradiction.inferred] ?? contradiction.inferred})` : "Model's guess";
    const options = side === "mine" && assumed === "locked" && !contradiction ? [opt("locked", lockAt), opt(null, model)] : [opt("locked", lockAt), opt("open", "Treat as playing on"), opt(null, model)];
    return { options, note: side === "mine" && assumed === "locked" && !contradiction ? MINE_UNKNOWN_NOTE : null };
  }
  if (key === "unknown") {
    if (side === "mine") return { options: [opt("locked", lockAt), opt(null, `Model's guess (${MODEL_SAYS.unknown})`)], note: MINE_UNKNOWN_NOTE };
    return { options: [opt("locked", lockAt), opt("open", "Treat as playing on"), opt(null, `Model's guess (${MODEL_SAYS.unknown})`)], note: null };
  }
  if (key === "locked") return { options: [opt("open", "Treat as playing on"), opt(null, `Model's guess (${MODEL_SAYS.locked})`)], note: null };
  return null;
}

export const MINE_UNKNOWN_NOTE = "Playing on changes nothing here: the model already treats your unknown slots as unlocked.";

/** The assumption list with one slot set to `state` (null clears it). */
export function withAssume(list, side, slot, state) {
  const rest = (list || []).filter((a) => !(a.side === side && a.slot === slot));
  return state ? [...rest, { side, slot, state }] : rest;
}

/**
 * The same page with the assumption param replaced (or removed when the list is empty),
 * every other param kept. `search`: the current query string or URLSearchParams.
 */
export function assumeHref(pathname, search, list) {
  const sp = new URLSearchParams(search ?? "");
  const v = serialiseAssume(list || []);
  if (v) sp.set("assume", v);
  else sp.delete("assume");
  // commas stay literal so the URL reads as written: ?assume=m3L,t0O
  const q = sp.toString().replace(/%2C/gi, ",");
  return q ? `${pathname}?${q}` : pathname;
}

/** The current list from a query string (or URLSearchParams). */
export function assumeFromSearch(search) {
  return parseAssume(new URLSearchParams(search ?? "").get("assume") ?? "").list;
}

/** A link that keeps the viewer's assumptions while they are set: "/lockin?tab=x" + "&assume=...". */
export function keepAssume(href, list) {
  const v = serialiseAssume(list || []);
  if (!v) return href;
  const [path, q = ""] = href.split("?");
  const sp = new URLSearchParams(q);
  sp.set("assume", v);
  return `${path}?${sp.toString().replace(/%2C/gi, ",")}`;
}

/** Plain wording for an assumption that disagrees with a certain inference. */
export function contradictionText(c) {
  if (!c) return null;
  const had = c.inferred === "locked" ? "locked" : c.inferred === "reset" ? "reset to 0" : c.inferred ?? "something else";
  const now = c.state === "locked" ? "locked" : "playing on";
  return `The app had this slot as ${had}; you're treating it as ${now}.`;
}

/**
 * The What-if bar: null without assumptions, else { text, count, fromPct, toPct, contradictions:[text] }.
 */
export function whatIfBar(desk) {
  const a = desk?.assumptions;
  if (!a || !Array.isArray(a.list) || !a.list.length) return null;
  const base = desk.winProb?.baseline?.p;
  const now = desk.winProb?.now;
  const ok = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  return {
    text: a.text || `${a.list.length} assumed`,
    count: a.list.length,
    fromPct: ok(base) ? pct(base) : null,
    toPct: ok(now) ? pct(now) : null,
    contradictions: (a.contradictsInferred || []).map((c) => {
      const slots = c.side === "mine" ? desk.slots || [] : desk.opponent?.slots || [];
      const label = slots.find((s) => s.index === c.slot)?.label ?? `slot ${c.slot + 1}`;
      return { side: c.side, slot: c.slot, text: `${c.side === "mine" ? "Your" : "Their"} ${label}: ${contradictionText(c)}` };
    }),
  };
}

/** The contradiction (if any) for one slot. */
export function contradictionFor(desk, side, slot) {
  return (desk?.assumptions?.contradictsInferred || []).find((c) => c.side === side && c.slot === slot) ?? null;
}

/**
 * Slot tiles with their what-if choices: `assumed` (the viewer's assumption on this
 * slot, if any), `choices` (assumeOptions, or null) and `contradiction` (plain words).
 * `side`: "mine" for slotTiles(desk), "theirs" for the opponent's slots.
 */
export function withChoices(tiles, desk, side) {
  const raw = side === "mine" ? desk?.slots || [] : desk?.opponent?.slots || [];
  const reasonBy = new Map(raw.map((s) => [s.index, s.lockStateReason]));
  return tiles.map((t) => {
    const assumed = assumedOf(reasonBy.get(t.index));
    const c = contradictionFor(desk, side, t.index);
    const banked = t.value ?? t.banked ?? null;
    const gamesLeft = side === "mine" ? t.gamesLeft ?? null : raw.find((s) => s.index === t.index)?.gamesLeft ?? null;
    // `applied`: the list the board honoured (a hand-typed token it dropped does not come back on the next tap)
    return { ...t, side, assumed, applied: desk?.assumptions?.list ?? [], choices: assumeOptions({ side, key: t.key, assumed, banked, contradiction: c, gamesLeft }), contradiction: contradictionText(c) };
  });
}

/**
 * The assumptions a board can honour, checked against the board without them: a slot
 * index the board has, "locked" only on a slot with a score above 0 whose game is not
 * in progress (locking nothing, or a partial score, is not a lock), "playing on" only on a slot whose occupant still has a game to play.
 * Anything else is dropped, so a hand-typed URL cannot set what the UI never offers.
 */
export function validAssume(list, plain) {
  if (!plain || !Array.isArray(list)) return [];
  const gamesMine = new Map((plain.cards || []).map((c) => [c.playerId, c.gamesLeft]));
  const liveMine = new Set((plain.cards || []).filter((c) => (c.weekGames || []).some((g) => g.status === "in_game")).map((c) => c.playerId));
  return list.filter((a) => {
    const slots = a.side === "mine" ? plain.slots || [] : plain.opponent?.slots || [];
    const s = slots.find((x) => x.index === a.slot);
    if (!s || !s.playerId) return false;
    // a game in progress: its partial score is not a score anyone can have locked
    const live = slotStateKey(s) === "live" || (a.side === "mine" && liveMine.has(s.playerId));
    if (a.state === "locked") return !live && typeof s.banked === "number" && s.banked > 0;
    const left = a.side === "mine" ? gamesMine.get(s.playerId) : s.gamesLeft;
    return typeof left === "number" ? left > 0 : true;
  });
}
