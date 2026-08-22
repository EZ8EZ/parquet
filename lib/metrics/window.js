import { REFUSAL_CODES, REFUSAL_CODE_LIST, refusal, refusalSentence } from "../refusal.js";
import { VALUATION_CONFIG } from "../valuation/index.js";
import { cachedLeagueTimelines } from "./duration.js";
/**
 * Fewest valued assets a window may be read from. See the header: with two, the 25th
 * and 50th percentiles land on the same asset by construction.
 */
export const MIN_ASSETS_FOR_WINDOW = 3;
/**
 * The value-weighted quantile of a set of dated assets.
 *
 * The LOWER quantile: the smallest duration at which cumulative value has reached
 * `q` of the total. No interpolation between neighbouring assets, because the
 * interpolated point is a duration no asset actually has, and this module's whole
 * claim is that every number in it is a number the roster really holds.
 */
export function weightedQuantile(assets, q) {
  const sorted = [...assets]
    .filter((a) => a.value > 0)
    .sort((a, b) => a.duration - b.duration);
  const total = sorted.reduce((s, a) => s + a.value, 0);
  if (total <= 0) return null;
  const target = q * total;
  let cum = 0;
  for (const a of sorted) {
    cum += a.value;
    // Epsilon so a clean half of the value lands on the asset that completes it
    // rather than on the next one along, which floating point would otherwise decide.
    if (cum >= target - 1e-9) return a.duration;
  }
  return sorted[sorted.length - 1].duration;
}
/**
 * The code a refused state carries when the row itself was not built here.
 *
 * `windowOf` always attaches a full `refusal`, so this is only reached by a row
 * hand-assembled by a caller or a test. It exists so that no surface can print a
 * refused window with no code at all - the failure mode lib/refusal.js's header is
 * about. `unreadable` maps to the count refusal rather than `NO_RECORD` because a row
 * without its own refusal cannot say which of the two it was, and claiming an empty
 * record when the record might merely be thin would be the more confident claim (D19).
 */
const CODE_BY_STATE = { split: "SPLIT_ROSTER", unreadable: "INSUFFICIENT_SAMPLE" };
/** A refused window's code, whoever built the row. Null for a readable one. */
export function windowRefusalCode(w) {
  if (w.state === "window") return null;
  return w.refusal?.code ?? CODE_BY_STATE[w.state] ?? "NO_RECORD";
}
/**
 * One roster's window from its own assets and its already-classified posture.
 *
 * Takes the posture rather than recomputing it: posture is RELATIVE to the league
 * (see `TimelineOptions.leagueDurations`), so a window derived with a locally
 * recomputed posture would disagree with the same roster's reading on /league.
 *
 * A REFUSED ROW CARRIES ITS REASON AS DATA, not as a word for a page to interpret.
 * `state` was doing that job alone and could not: "unreadable" collapsed two genuinely
 * different facts (a roster with no priced asset at all, and a roster with one or two)
 * into one word, and every surface that met it had to write its own sentence. The
 * `refusal` field carries a code from the closed register plus the numbers the
 * condition turned on - including, where it is computable, THE FIGURE THIS FUNCTION
 * DECLINED TO PUBLISH. That figure is deliberately not promoted into `peak`: printing
 * it beside its own disproof is honest, and printing it in the field a chart reads
 * would not be.
 */
export function windowOf(profile, assets, currentSeason, isMe) {
  const base = {
    rosterId: profile.rosterId,
    teamName: profile.teamName,
    ownerName: profile.ownerName,
    isMe,
    assetCount: assets.filter((a) => a.value > 0).length,
    tci: profile.tci,
    posture: profile.posture,
    rosterDuration: profile.rosterDuration,
  };
  const q25 = weightedQuantile(assets, 0.25);
  const q50 = weightedQuantile(assets, 0.5);
  const q75 = weightedQuantile(assets, 0.75);
  const season = (offset) => currentSeason + Math.round(offset);
  if (
    base.assetCount < MIN_ASSETS_FOR_WINDOW ||
    q25 == null ||
    q50 == null ||
    q75 == null
  ) {
    const empty = base.assetCount === 0 || q50 == null;
    return {
      ...base,
      state: "unreadable",
      // Two conditions, two codes, one state. `state` stays a three-value field
      // because every chart and sort in the app keys off it; the code is where the
      // distinction lives, and it is the distinction a reader actually needs - an
      // empty record and a two-asset record are not the same fact about a roster.
      refusal: empty
        ? refusal(
            "NO_RECORD",
            `No asset on this roster carries a price, so there is no duration to take quartiles of.`,
          )
        : refusal(
            "INSUFFICIENT_SAMPLE",
            `Read from ${base.assetCount} valued asset${base.assetCount === 1 ? "" : "s"} against a floor of ` +
              `${MIN_ASSETS_FOR_WINDOW}: below three, the 25th, 50th and 75th percentiles cannot land on ` +
              `different assets, so a span drawn from them would be an artefact of the count rather than a ` +
              `reading of the roster.`,
            // The centroid, printed and then declined. It is a real number - the
            // value-weighted median duration of what is here - and it is exactly as
            // trustworthy as one or two assets, which is the point of showing it.
            { label: "Its heaviest season", value: `${season(q50)}` },
          ),
      openOffset: null,
      peakOffset: null,
      closeOffset: null,
      open: null,
      peak: null,
      close: null,
    };
  }
  // The one place posture crosses into this module, and it crosses as a REFUSAL:
  // a straddled roster keeps its quartiles and loses the claim that the span
  // between them is a window.
  const split = profile.posture === "straddling";
  const open = season(q25);
  const close = season(q75);
  return {
    ...base,
    state: split ? "split" : "window",
    // A split roster's quartiles are all published (the chart draws both ends), so
    // the refusal is narrowly about the ONE NUMBER: the centroid of a disagreement is
    // not a window, and this is the sentence that says which is which.
    // A STRADDLER WHOSE QUARTILES ROUND INTO ONE SEASON is the case that catches a
    // sloppy sentence out. Posture is read from the UNROUNDED durations, so a roster
    // can straddle while `open` and `close` print the same year - and a refusal that
    // said "spread across 1 seasons" would be both ungrammatical and false, offering a
    // reader a visible span to disbelieve instead of the real reason. On the live
    // fixture league this fires: one of the two split rosters is exactly this shape.
    refusal: split
      ? refusal(
          "SPLIT_ROSTER",
          close > open
            ? `Its own assets put the middle half of its value across ${close - open + 1} seasons, ` +
                `${open} to ${close}, which is the spread its straddling posture is read from - so the ` +
                `season above is the value-weighted centre of a disagreement rather than a window.`
            : `Its quartiles round into the single season ${open}, but the durations underneath them sit far ` +
                `enough apart that the posture read from them is straddling - so the season above is the ` +
                `value-weighted centre of a disagreement rather than a window.`,
          { label: "A single window", value: `${season(q50)}` },
        )
      : null,
    openOffset: q25,
    peakOffset: q50,
    closeOffset: q75,
    open,
    peak: season(q50),
    close,
  };
}
/** Do two readable spans share at least one season? */
function intersects(a, b) {
  if (a.open == null || a.close == null || b.open == null || b.close == null)
    return false;
  return a.open <= b.close && b.open <= a.close;
}
/**
 * The viewer's window against everyone else's.
 *
 * Only rosters with a readable SINGLE window are placed relative to the viewer. A
 * split roster is not "later" or "earlier" - it is a roster whose own assets disagree,
 * and forcing it onto one side of the viewer's window would be inventing the
 * agreement the metric just said was absent.
 */
export function overlapFor(me, rows) {
  if (me.state !== "window" || me.open == null || me.close == null) return null;
  const shared = [];
  const earlier = [];
  const later = [];
  const samePeak = [];
  const unresolved = [];
  for (const r of rows) {
    if (r.rosterId === me.rosterId) continue;
    if (r.state !== "window" || r.open == null || r.close == null) {
      unresolved.push(r.rosterId);
      continue;
    }
    if (intersects(me, r)) shared.push(r.rosterId);
    else if (r.close < me.open) earlier.push(r.rosterId);
    else later.push(r.rosterId);
    if (r.peak != null && r.peak === me.peak) samePeak.push(r.rosterId);
  }
  return { shared, earlier, later, samePeak, unresolved };
}
/**
 * Every roster's window, plus the viewer's overlap.
 *
 * Two passes over the league, both of which `duration.ts` already owns:
 * `leagueTimelines` for the relative postures, and `getTimelineProfile` per roster for
 * the assets the quantiles are read from. No third derivation, and no roster can be
 * described here in a way that disagrees with /league's own TCI reading.
 */
export function leagueWindows(h, cfg = VALUATION_CONFIG) {
  const currentSeason = h.currentSeasonYear;
  // The memoized pass: /league asks for the league's timelines directly AND through
  // this function on the same render, and /plan does the same. Same array, one walk.
  const profiles = cachedLeagueTimelines(h, cfg);
  const meId = h.me.rosterId;
  const rows = profiles.map((p) =>
    windowOf(
      p,
      // `leagueTimelines` returns the assets already; re-reading the profile would be
      // a second full walk of the roster for nothing.
      p.assets,
      currentSeason,
      p.rosterId === meId,
    ),
  );
  rows.sort((a, b) => {
    // Unreadable rosters sink, so the axis reads as a staircase rather than as a
    // staircase with holes punched through it.
    if ((a.peakOffset == null) !== (b.peakOffset == null))
      return a.peakOffset == null ? 1 : -1;
    if (
      a.peakOffset != null &&
      b.peakOffset != null &&
      a.peakOffset !== b.peakOffset
    )
      return a.peakOffset - b.peakOffset;
    return (a.openOffset ?? 0) - (b.openOffset ?? 0);
  });
  const dated = rows.filter((r) => r.open != null && r.close != null);
  // The axis ALWAYS starts at the current season, even when no roster's window opens
  // for two more years. An axis that starts at the earliest window would draw the
  // nearest team hard against the left edge and quietly imply that somebody pays off
  // now, which in a league of rebuilds is exactly the fact worth seeing.
  const first = Math.min(currentSeason, ...dated.map((r) => r.open));
  const last = dated.length
    ? Math.max(...dated.map((r) => r.close))
    : currentSeason;
  const me = rows.find((r) => r.isMe) ?? null;
  return {
    currentSeason,
    first,
    last,
    rows,
    me,
    overlap: me ? overlapFor(me, rows) : null,
  };
}
/** A window as a printable season range. `2029` when it opens and closes in one. */
export function windowLabel(w) {
  if (w.open == null || w.close == null) return "no window";
  return w.open === w.close ? `${w.open}` : `${w.open}-${w.close}`;
}
/**
 * The same reading for a line that has no room to qualify it.
 *
 * A split roster gets the CODE rather than the range, because "2028-2033" sitting in
 * the same column as "2029-2031" reads as a very long window, which is the exact
 * misreading `state: "split"` exists to prevent. The range is still on the chart,
 * drawn as two ends with a hole between them, where the shape can carry the caveat.
 *
 * THIS RETURNED "-" FOR AN UNREADABLE ROSTER, and that dash was the whole reason
 * lib/refusal.js exists. It sat in a mono line between two figures on /league and in
 * the finder's window column, where a dash is how every other column in this app
 * spells "no value here" - so a stated refusal rendered as a missing number, which is
 * a claim the derivation had just declined to make. It returns the code now: longer,
 * unmissable, and the same token the sentence under the chart opens with.
 */
export function windowShort(w) {
  if (w.state === "window") return windowLabel(w);
  // The human label, not the raw code: the code survives on `w.refusal` for tests,
  // grep, and serialization, and the board's own `windowRefusalSummary` still pairs
  // every label with its full reason once per surface. A chip printing "SPLIT_ROSTER"
  // made the reader parse an internal constant (VISION.md kill-list #4).
  const code = windowRefusalCode(w);
  return REFUSAL_CODES[code]?.label ?? code;
}
/**
 * One roster's window read against the viewer's, as a THESIS rather than a rating.
 *
 * Returns null whenever either side has no single window, which is the honest answer
 * and not a neutral one: there is nothing to say about the timing of a roster whose
 * own assets disagree about its timing.
 *
 * Every string here is conditional on a posture that is stated in the same sentence
 * (D23) and none of them ranks the partner (D6). "Their value peaks before yours
 * opens" is arithmetic; "they will be selling" would be intent, which the app cannot
 * see (D19).
 */
export function windowThesis(me, them) {
  if (me.state !== "window" || them.state !== "window") return null;
  if (
    me.peak == null ||
    them.peak == null ||
    me.open == null ||
    me.close == null
  )
    return null;
  if (intersects(me, them)) {
    const same = me.peak === them.peak;
    return same
      ? `Their value is heaviest in ${them.peak}, the same season yours is. Rosters dated together want the same pieces at the same time, which is what makes one cost more here than its price elsewhere. Overlap is the common case in this league, so read it as the absence of a timing edge rather than as a finding.`
      : `Their span (${windowLabel(them)}) overlaps yours (${windowLabel(me)}). Neither of you is dated ahead of the other, so anything that helps them is being priced against you rather than traded past you. Overlap is the common case in this league, so read it as the absence of a timing edge rather than as a finding.`;
  }
  if (them.close != null && them.close < me.open) {
    return `Their value is dated ${windowLabel(them)}, entirely before yours begins in ${me.open}. Two rosters dated apart are the pairing where a piece is worth more to one side than the other, which is the only reason a trade clears at all - and on this league, being dated clear of somebody is rarer than overlapping them.`;
  }
  return `Their value is dated ${windowLabel(them)}, entirely after yours ends in ${me.close}. Their surplus is dated away from yours, so what is spare to them is not spare to you - and on this league, being dated clear of somebody is rarer than overlapping them.`;
}
/**
 * The viewer's own situation in two or three sentences, for /plan.
 *
 * Counts only. The synthesis is the joining of derivations the app already has - the
 * viewer's span, everyone else's, and the arithmetic of which ones intersect - and it
 * stops at the count. What to DO about an overlap is /plan's own moves engine, not
 * this module's opinion.
 *
 * THE COUNTS ARE ORDERING, NOT A CALENDAR. Duration compresses every dynasty roster
 * into a band a few seasons wide (see components/WindowMap.tsx), so on this league
 * most rosters overlap most rosters and the shared count runs high by construction.
 * The wording therefore leads with the ordering - who is dated before you and who
 * after - and says plainly that overlap is the expected case, so a reader does not
 * take a count that fires on two thirds of the league as though it had named
 * somebody. Nothing about the arithmetic changed to make this true; the arithmetic
 * was always saying this and the sentence was not.
 */
export function windowSynthesis(map) {
  const me = map.me;
  if (!me) return null;
  // The refused branches speak in the second person, which is why they carry their own
  // `because` rather than reprinting `windowOf`'s: that one describes a roster to a
  // reader looking at the board, this one describes the reader's own roster to them.
  // Same code, same withheld figure, different address.
  if (me.state === "unreadable") {
    const code = windowRefusalCode(me);
    return refusalSentence(
      refusal(
        code,
        code === "NO_RECORD"
          ? `No asset on your roster carries a price, so there are no durations to take quartiles of and nothing to line up against the league.`
          : `Too few valued assets on your roster to place it against the others, so there is nothing to line up against the league yet.`,
        me.refusal?.withheld ?? null,
      ),
    );
  }
  if (me.state === "split")
    return refusalSentence(
      refusal(
        "SPLIT_ROSTER",
        `Your assets do not agree about when your value arrives - the middle half of it is spread from ${me.open} to ${me.close}, which is a spread rather than a single span. Until it narrows there is nothing to line the rest of the league up against.`,
        me.refusal?.withheld ?? null,
      ),
    );
  const o = map.overlap;
  if (!o) return null;
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const parts = [
    `The middle half of your value is dated ${windowLabel(me)}, heaviest in ${me.peak}.`,
    o.shared.length
      ? `${n(o.shared.length, "roster overlaps", "rosters overlap")} that${o.samePeak.length ? `, ${o.samePeak.length} of them heaviest in ${me.peak} exactly as you are` : ""}.`
      : `No other roster overlaps it.`,
  ];
  if (o.earlier.length)
    parts.push(
      `${n(o.earlier.length, "roster is", "rosters are")} dated entirely before you.`,
    );
  if (o.later.length)
    parts.push(`${n(o.later.length, "is", "are")} dated entirely after you.`);
  if (o.unresolved.length)
    parts.push(
      `${n(o.unresolved.length, "roster has", "rosters have")} no single span to place at all.`,
    );
  parts.push(
    `Every roster in a dynasty league holds players in the same narrow age range, so the spans sit close together and overlapping is the ordinary case - the useful reading is who is dated before you and who after, not the season itself.`,
  );
  return parts.join(" ");
}
/**
 * WHY THE BOARD'S REFUSALS ARE COUNTED HERE AND NOT IN THE COMPONENT.
 *
 * /league printed two hand-written sentences under the chart, one per refused state,
 * with the counts interpolated at the call site. That is the pattern lib/refusal.js
 * exists to end: the words lived in JSX, nothing downstream could count them, and
 * "hold too few valued assets to place at all" did not match the sentence the same
 * condition produced two pages away. The counts are arithmetic over `rows`, so they
 * belong beside the derivation that made the rows.
 *
 * Grouped BY CODE rather than per roster, because fourteen refusals rendered
 * individually would be a wall, and because the count per condition is the reading -
 * "four rosters cannot be placed" says something a reader can use, and four identical
 * sentences say it four times. Register order, so the summary does not reshuffle when
 * a roster trades.
 *
 * The closing line is the deterministic statement, and it is not filler: a refusal
 * that appears where numbers usually load invites a reader to wait for it. Nothing
 * here is loading, and nothing on this board retries.
 */
export function windowRefusalSummary(rows) {
  const counts = new Map();
  for (const r of rows) {
    const code = windowRefusalCode(r);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const because = {
    SPLIT_ROSTER: (n) =>
      n === 1
        ? `One roster is drawn as two ends, because its own assets disagree about when its value arrives - which is what makes it the most motivated trade partner on this board.`
        : `${n} rosters are drawn as two ends, because their own assets disagree about when their value arrives - which is what makes them the most motivated trade partners on this board.`,
    INSUFFICIENT_SAMPLE: (n) =>
      `${n === 1 ? "One roster holds" : `${n} rosters hold`} fewer than ${MIN_ASSETS_FOR_WINDOW} valued assets, so quartiles cannot separate and there is no span to draw.`,
    NO_RECORD: (n) =>
      `${n === 1 ? "One roster holds" : `${n} rosters hold`} no priced asset at all, so nothing was computed rather than computed from little.`,
  };
  const parts = [];
  for (const code of REFUSAL_CODE_LIST) {
    const n = counts.get(code);
    if (!n || !because[code]) continue;
    parts.push(refusalSentence(refusal(code, because[code](n))));
  }
  parts.push(
    `None of these is a figure still arriving: each is a reading of the record as it stands, and there is nothing to retry.`,
  );
  return parts.join(" ");
}
/**
 * Windows keyed by roster id, for a caller that has one roster in hand rather than a
 * board. Same derivation, so a dossier line and the league map cannot disagree.
 */
export function windowsByRoster(h, cfg = VALUATION_CONFIG) {
  return new Map(leagueWindows(h, cfg).rows.map((r) => [r.rosterId, r]));
}
/*
 * `windowForRoster(h, rosterId)` stood here: one roster's window without walking the
 * league. It was shelved on 2026-08-10 (SHELVED.md, S4) and this note is deliberately
 * where the function was, because the next person to want one will look here first.
 *
 * It had ZERO production callers, and its one distinguishing behaviour was
 * DISAGREEING with the function every page uses. Costing a single
 * `getTimelineProfile` meant it carried the ABSOLUTE posture fallback rather than the
 * league-relative one, which differs on 6 of 14 rosters on the live league. Its own
 * docstring warned about that - which is exactly the warning the next person in a
 * hurry does not read.
 *
 * If you need one roster's window, use `windowsByRoster(h).get(rosterId)` above: same
 * derivation as /league, /plan and the finder, so a dossier line and the league map
 * cannot disagree. Bringing the standalone back means giving it a signature that
 * makes disagreement impossible - i.e. taking `leagueDurations` as a required
 * argument. Without that, it should not come back.
 */
