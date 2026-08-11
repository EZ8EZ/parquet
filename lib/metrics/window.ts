/**
 * VALUE WINDOWS - when each roster's existing assets pay off, on one shared time axis.
 *
 * ---------------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------------
 * `lib/metrics/duration.ts` tells a manager WHEN THEIR OWN value arrives (duration)
 * and whether their assets agree about it (TCI). It says nothing about who else
 * arrives at the same time, and that is the number that actually decides a trade. A
 * manager whose value lands in 2029 and who shares 2029 with three other rosters is
 * in a different competitive situation from one who shares it with nobody, and the
 * app has computed all fourteen timelines for rounds without ever putting them on one
 * axis.
 *
 * ---------------------------------------------------------------------------------
 * The derivation, and why it is honest
 * ---------------------------------------------------------------------------------
 * NOTHING NEW IS MODELLED. Every asset already carries a `value` and a `duration` in
 * seasons (`AssetDuration`), and those two numbers are a distribution: how much of
 * this roster's value arrives how far out. A window is read straight off that
 * distribution as its VALUE-WEIGHTED QUARTILES:
 *
 *   open  = the duration at which the 25th percentile of value has arrived
 *   peak  = the 50th (the value-weighted median arrival)
 *   close = the 75th
 *
 * so the printed window is the span of seasons holding the middle half of the
 * roster's value. There is no projection here (D19) and no growth assumption: it is
 * arithmetic on values the app already publishes, and adding the same asset twice or
 * reordering the roster cannot change the answer.
 *
 * QUARTILES RATHER THAN MEAN PLUS SIGMA, deliberately. `duration.ts` already exposes
 * `rosterDuration` and `dispersion`, and centre-plus-spread would have been one line.
 * It would also have been a lie about shape: mean +/- sigma assumes the value is
 * piled symmetrically around the centre, and the whole reason TCI exists is that
 * dynasty rosters routinely are not - a straddled roster's value sits in two lumps
 * with a hole between them, and mean +/- sigma prints a confident window centred on
 * the hole. Quantiles make no shape assumption. They read where the value actually
 * is.
 *
 * STRADDLING IS A STATE, NOT A GAP. `duration.ts` already identifies it (posture
 * `straddling`, below the coherence floor), and it means precisely "this roster's
 * assets do not agree about when it wins". A single window drawn across two lumps
 * would be the false answer, so a straddled roster gets `state: "split"` and the
 * surface draws its two ends without the filled span between them. The quartiles are
 * still carried, because "their value runs from 2028 to 2033" is true and useful; the
 * claim that is withheld is that any season in between is their window.
 *
 * TOO FEW ASSETS. Below three valued assets the three quantiles cannot resolve to
 * three distinct assets EVEN IN PRINCIPLE - with two, the 25th and 50th percentiles
 * are the same asset by construction - so the range would be one player's duration
 * wearing a window's clothes. That is `state: "unreadable"`, and it is stated rather
 * than hidden.
 *
 * ---------------------------------------------------------------------------------
 * D6 and D23
 * ---------------------------------------------------------------------------------
 * Everything here is a count or a season. "Three rosters share your window" is a
 * fact; "you are in trouble" would be a grade, and this module produces no such
 * thing. It also infers no intent: a roster whose value peaked two seasons before
 * yours opens is a roster whose value peaked earlier, not a seller.
 */
import type { LeagueHistory } from "../history";
import { VALUATION_CONFIG, type ValuationConfig } from "../valuation";
import {
  leagueTimelines,
  type AssetDuration,
  type TimelineProfile,
} from "./duration";

/**
 * Fewest valued assets a window may be read from. See the header: with two, the 25th
 * and 50th percentiles land on the same asset by construction.
 */
export const MIN_ASSETS_FOR_WINDOW = 3;

export type WindowState = "window" | "split" | "unreadable";

export interface ValueWindow {
  rosterId: number;
  teamName: string | null;
  ownerName: string;
  isMe: boolean;
  /** How many valued assets the quantiles were read from. */
  assetCount: number;
  state: WindowState;
  /** Season offsets from the current season, unrounded. Null when `unreadable`. */
  openOffset: number | null;
  peakOffset: number | null;
  closeOffset: number | null;
  /** Calendar seasons, rounded from the offsets. Null when `unreadable`. */
  open: number | null;
  peak: number | null;
  close: number | null;
  /** Carried through so a surface never has to re-derive them. */
  tci: number;
  posture: TimelineProfile["posture"];
  rosterDuration: number;
}

export interface WindowOverlap {
  /** Other rosters whose window intersects the viewer's, by roster id. */
  shared: number[];
  /** Rosters whose window closes before the viewer's opens. */
  earlier: number[];
  /** Rosters whose window opens after the viewer's closes. */
  later: number[];
  /** Rosters that peak in the same season the viewer does. */
  samePeak: number[];
  /** Rosters with no single window to compare against - split or unreadable. */
  unresolved: number[];
}

export interface WindowMap {
  currentSeason: number;
  /** Axis domain: the earliest open and latest close anything on the board has. */
  first: number;
  last: number;
  /** Every roster, earliest peak first. */
  rows: ValueWindow[];
  me: ValueWindow | null;
  /** Only present when the viewer has a readable single window to compare against. */
  overlap: WindowOverlap | null;
}

/**
 * The value-weighted quantile of a set of dated assets.
 *
 * The LOWER quantile: the smallest duration at which cumulative value has reached
 * `q` of the total. No interpolation between neighbouring assets, because the
 * interpolated point is a duration no asset actually has, and this module's whole
 * claim is that every number in it is a number the roster really holds.
 */
export function weightedQuantile(
  assets: ReadonlyArray<{ value: number; duration: number }>,
  q: number,
): number | null {
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
 * One roster's window from its own assets and its already-classified posture.
 *
 * Takes the posture rather than recomputing it: posture is RELATIVE to the league
 * (see `TimelineOptions.leagueDurations`), so a window derived with a locally
 * recomputed posture would disagree with the same roster's reading on /league.
 */
export function windowOf(
  profile: TimelineProfile,
  assets: ReadonlyArray<AssetDuration>,
  currentSeason: number,
  isMe: boolean,
): ValueWindow {
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

  if (base.assetCount < MIN_ASSETS_FOR_WINDOW || q25 == null || q50 == null || q75 == null) {
    return {
      ...base,
      state: "unreadable",
      openOffset: null,
      peakOffset: null,
      closeOffset: null,
      open: null,
      peak: null,
      close: null,
    };
  }

  const season = (offset: number) => currentSeason + Math.round(offset);
  return {
    ...base,
    // The one place posture crosses into this module, and it crosses as a REFUSAL:
    // a straddled roster keeps its quartiles and loses the claim that the span
    // between them is a window.
    state: profile.posture === "straddling" ? "split" : "window",
    openOffset: q25,
    peakOffset: q50,
    closeOffset: q75,
    open: season(q25),
    peak: season(q50),
    close: season(q75),
  };
}

/** Do two readable spans share at least one season? */
function intersects(a: ValueWindow, b: ValueWindow): boolean {
  if (a.open == null || a.close == null || b.open == null || b.close == null) return false;
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
export function overlapFor(me: ValueWindow, rows: ValueWindow[]): WindowOverlap | null {
  if (me.state !== "window" || me.open == null || me.close == null) return null;
  const shared: number[] = [];
  const earlier: number[] = [];
  const later: number[] = [];
  const samePeak: number[] = [];
  const unresolved: number[] = [];
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
export function leagueWindows(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): WindowMap {
  const currentSeason = h.currentSeasonYear;
  const profiles = leagueTimelines(h, cfg);
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
    if ((a.peakOffset == null) !== (b.peakOffset == null)) return a.peakOffset == null ? 1 : -1;
    if (a.peakOffset != null && b.peakOffset != null && a.peakOffset !== b.peakOffset)
      return a.peakOffset - b.peakOffset;
    return (a.openOffset ?? 0) - (b.openOffset ?? 0);
  });

  const dated = rows.filter((r) => r.open != null && r.close != null);
  // The axis ALWAYS starts at the current season, even when no roster's window opens
  // for two more years. An axis that starts at the earliest window would draw the
  // nearest team hard against the left edge and quietly imply that somebody pays off
  // now, which in a league of rebuilds is exactly the fact worth seeing.
  const first = Math.min(currentSeason, ...dated.map((r) => r.open!));
  const last = dated.length ? Math.max(...dated.map((r) => r.close!)) : currentSeason;

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
export function windowLabel(w: ValueWindow): string {
  if (w.open == null || w.close == null) return "no window";
  return w.open === w.close ? `${w.open}` : `${w.open}-${w.close}`;
}

/**
 * The same reading for a line that has no room to qualify it.
 *
 * A split roster gets the WORD rather than the range, because "2028-2033" sitting in
 * the same column as "2029-2031" reads as a very long window, which is the exact
 * misreading `state: "split"` exists to prevent. The range is still on the chart,
 * drawn as two ends with a hole between them, where the shape can carry the caveat.
 */
export function windowShort(w: ValueWindow): string {
  if (w.state === "window") return windowLabel(w);
  return w.state === "split" ? "split" : "-";
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
export function windowThesis(me: ValueWindow, them: ValueWindow): string | null {
  if (me.state !== "window" || them.state !== "window") return null;
  if (me.peak == null || them.peak == null || me.open == null || me.close == null) return null;

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
export function windowSynthesis(map: WindowMap): string | null {
  const me = map.me;
  if (!me) return null;
  if (me.state === "unreadable")
    return `Too few valued assets on your roster to place it against the others, so there is nothing to line up against the league yet.`;
  if (me.state === "split")
    return `Your assets do not agree about when your value arrives - the middle half of it is spread from ${me.open} to ${me.close}, which is a spread rather than a single span. Until it narrows there is nothing to line the rest of the league up against.`;

  const o = map.overlap;
  if (!o) return null;
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

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
    parts.push(
      `${n(o.later.length, "is", "are")} dated entirely after you.`,
    );
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
 * Windows keyed by roster id, for a caller that has one roster in hand rather than a
 * board. Same derivation, so a dossier line and the league map cannot disagree.
 */
export function windowsByRoster(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): Map<number, ValueWindow> {
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
