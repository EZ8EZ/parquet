import { pickCapital } from "../picks.js";
import { ordinal, rosterName } from "../derive/describe.js";
import { POSTURE_UNREAD } from "../metrics/axes.js";
/**
 * The published slot for a pick whose draft order is already set, or null.
 *
 * `inputs.slots` is a Map keyed `season|originalRoster`, because a draft slot belongs to
 * the roster that owns it in the order, not to whoever holds the pick now. Absent input
 * means absent output: nothing here derives a slot from arithmetic, so a settled pick in
 * a league whose draft has not been published yet renders without one rather than with a
 * guess (D19).
 */
function slotFor(pick, slots) {
  const entry = slots?.get(`${pick.season}|${pick.originalRoster}`);
  if (!entry || !Number.isFinite(entry.slot) || !Number.isFinite(entry.teams))
    return null;
  return {
    slot: entry.slot,
    slotOf: entry.teams,
    overall: (pick.round - 1) * entry.teams + entry.slot,
  };
}
/** Posture and TCI per roster, from the league-wide timeline pass. */
export function posturesByRoster(timelines) {
  return new Map(
    timelines.map((t) => [t.rosterId, { posture: t.posture, tci: t.tci }]),
  );
}
/** The season whose standings order the draft a season-S pick sits in. */
export function determiningSeason(pickSeason) {
  return String(parseInt(pickSeason, 10) - 1);
}
/**
 * Has the season that orders this draft already finished?
 *
 * Read off the chain rather than assumed from arithmetic: the current league's own
 * status is the only thing that knows whether the season in progress is done, and
 * `pre_draft` (which is where a dynasty league sits for most of the calendar) means
 * the current season has not even started.
 */
function seasonIsOver(h, season) {
  const year = parseInt(season, 10);
  if (year < h.currentSeasonYear) return true;
  if (year > h.currentSeasonYear) return false;
  return h.currentLeague.status === "complete";
}
function formPhrase(form) {
  if (!form) return "";
  const when = form.isLive ? "so far this season" : `in ${form.season}`;
  return ` They finished ${form.wins}-${form.losses} ${when}, ${ordinal(form.rank)} of ${form.teams}.`;
}
/**
 * The one-pick read.
 *
 * `holder` is whoever is being asked about, which is not always the viewer: the trade
 * evaluator asks the same question about a pick the OTHER side is sending.
 */
export function readPickAgency(h, holder, pick, inputs = {}) {
  const determinedBy = pick.originalRoster;
  const determinedByName = rosterName(h, determinedBy);
  const decidedIn = determiningSeason(pick.season);
  const controlled = determinedBy === holder;
  const settled = seasonIsOver(h, decidedIn);
  const read = inputs.postures?.get(determinedBy) ?? null;
  const posture = read?.posture ?? null;
  const tci = read?.tci ?? null;
  const form = inputs.forms?.get(determinedBy) ?? null;
  const label = `${pick.season} ${ordinal(pick.round)}`;
  const settledNote = settled
    ? ` The ${decidedIn} season is already over, so this pick's slot is no longer anybody's to move.`
    : "";
  let tension;
  let note;
  if (!controlled) {
    tension = "passenger";
    const postureBit = posture
      ? ` Their roster reads ${posture}${tci != null ? ` (TCI ${tci})` : ""}.`
      : "";
    note =
      `${determinedByName}'s ${decidedIn} season sets this pick's slot, not yours. ` +
      `You hold the asset; they hold the outcome.${postureBit}${formPhrase(form)}${settledNote}`;
  } else if (posture === "rebuilding") {
    tension = "aligned";
    note =
      `Your own ${decidedIn} season sets this ${label}, and your roster reads ` +
      `rebuilding. The pick and the timeline point the same way: this is one of the ` +
      `few assets whose value your own results move.${settledNote}`;
  } else if (posture === "contending") {
    tension = "opposed";
    note =
      `Your own ${decidedIn} season sets this ${label}, and your roster reads ` +
      `contending. Those two pull against each other: every win moves this pick ` +
      `later in the round. Both ends are yours, which is what makes it a decision ` +
      `rather than a problem.${settledNote}`;
  } else {
    tension = "open";
    const postureBit = posture
      ? `your roster reads ${posture}, which does not point this pick either way`
      : "your roster's timeline is not read here";
    note =
      `Your own ${decidedIn} season sets this ${label}, so the outcome is yours to ` +
      `move rather than somebody else's to hand you. Right now ${postureBit}.${settledNote}`;
  }
  const slot = settled ? slotFor(pick, inputs.slots) : null;
  return {
    pick,
    key: `${pick.season}-${pick.round}-${pick.originalRoster}`,
    shortLabel: label,
    determinedBy,
    determinedByName,
    determiningSeason: decidedIn,
    controlled,
    settled,
    // Only a settled pick can have a published slot, and only a live one is priced off
    // a spread rather than a slot. The panel prints "est" from `settled === false`,
    // which is why these two facts stay on the same object.
    slot: slot?.slot ?? null,
    slotOf: slot?.slotOf ?? null,
    overall: slot?.overall ?? null,
    posture,
    tci,
    form,
    tension,
    note,
  };
}
/** Agency for every pick a roster currently holds, in `pickCapital` order. */
export function pickAgency(h, rosterId, inputs = {}) {
  return pickCapital(h, rosterId).picks.map((p) =>
    readPickAgency(h, rosterId, p, inputs),
  );
}
function pickIdOf(p) {
  return `${p.season}|${p.round}|${p.originalRoster}`;
}
/**
 * THE RECIPROCAL READ: picks this roster originally owns that SOMEBODY ELSE now holds.
 *
 * This is the half of the ledger the panel could never see, because every previous read
 * started from `pickCapital`'s held set. It is the difference between the two ownership
 * modes `pickCapital` already supports, which is why it costs no new data: "original"
 * enumerates the picks a roster's own seasons will order, "held" enumerates the picks it
 * can actually draft with, and a pick in the first set but not the second is one whose
 * outcome is still yours to move and whose asset is not.
 *
 * `held` is a parameter so a caller that already has the held list (every real one does)
 * does not pay for a second `pickCapital` pass.
 */
export function awayPicks(h, rosterId, held) {
  const heldIds = new Set(
    (held ?? pickCapital(h, rosterId).picks).map(pickIdOf),
  );
  return pickCapital(h, rosterId, { ownership: "original" })
    .picks.filter((p) => !heldIds.has(pickIdOf(p)))
    .map((p) => ({
      pick: p,
      key: `away-${p.season}-${p.round}-${p.originalRoster}`,
      settled: seasonIsOver(h, determiningSeason(p.season)),
    }));
}
/**
 * Posture order for the grouped pick lists - longest-dated first, then the two shorter
 * reads, then the rosters with no reading. A DIFFERENT order from `TIMELINE_AXIS.words`
 * on purpose (that one reads short to long), but the same words, which `axes.test.js`
 * pins: this list may reorder the vocabulary, never extend or rename it.
 */
export const POSTURE_ORDER = [
  "rebuilding",
  "straddling",
  "ascending",
  "contending",
  POSTURE_UNREAD,
];
/**
 * THE THREE-PART LEDGER, which replaced a two-segment split bar (SHELVED.md S6).
 *
 * The shelved bar computed `controlled / held`, and the fault was structural rather than
 * cosmetic: the denominator is the picks you HOLD, so sending your own first away raises
 * the ratio. Measured on the live league, the roster with 5 of its own 9 future picks
 * already gone read 80% "controlled" while a roster that had sent away only 2 of 9 read
 * 50%. A number that goes UP as you divest your own future cannot be a reading of how
 * much of your own future you still decide.
 *
 * These three buckets are not a partition, and that is the whole point. Two overlapping
 * sets sit here, sharing one row:
 *
 *   A + B = what your own seasons decide  (whether or not you still hold it)
 *   A + C = what you hold                 (whoever decides it)
 *
 * A is the intersection, and it belongs in both sums. No single denominator exists to
 * divide by, so the ledger prints three counts and one sentence stating the overlap as a
 * fact instead of manufacturing a percentage out of sets that do not nest.
 *
 * LIVE PICKS ONLY. "Yours to set" is a present-tense claim about a season that can still
 * move; for a pick whose ordering season is over the claim is spent, and those picks get
 * their own group in the list below with their published slots (`groupAgency`). Passing
 * `away` is optional so a caller with no reciprocal read still gets rows A and C.
 */
export function summarizeAgency(reads, away = []) {
  const live = reads.filter((r) => !r.settled);
  const setAndHold = live.filter((r) => r.controlled);
  const theirsToSet = live.filter((r) => !r.controlled);
  const setNotHold = away.filter((a) => !a.settled);
  const postures = new Map();
  for (const r of theirsToSet) {
    const key = r.posture ?? POSTURE_UNREAD;
    const b = postures.get(key) ?? { picks: 0, managers: new Set() };
    b.picks++;
    b.managers.add(r.determinedByName);
    postures.set(key, b);
  }
  const ridingOn = POSTURE_ORDER.filter((p) => postures.has(p)).map(
    (posture) => ({
      posture,
      picks: postures.get(posture).picks,
      managers: [...postures.get(posture).managers].sort(),
    }),
  );
  const row = (key, setter, holder, list) => ({
    key,
    setter,
    holder,
    picks: list.length,
    firsts: list.filter((r) => r.pick.round === 1).length,
    value: list.reduce((s, r) => s + r.pick.value, 0),
    // Rows A and C have a group in the list below carrying their sentence. Row B is
    // picks you do not hold, so it has no group to sit in and its note lives here or
    // nowhere.
    note: key === "setNotHold" ? setNotHoldNote(list.length) : null,
  });
  // A ZERO-COUNT ROW IS NEVER PRINTED. The shelved bar's worst reading was a full
  // accent segment over an empty one, which looked like a finding and was an absence;
  // an absence is stated in words below instead, where it can say what it means.
  const buckets = [
    row("setAndHold", "yours", "yours", setAndHold),
    row("setNotHold", "yours", "theirs", setNotHold),
    row("holdNotSet", "theirs", "yours", theirsToSet),
  ].filter((b) => b.picks > 0);
  const both = setAndHold.length;
  const yoursToSet = setAndHold.length + setNotHold.length;
  const youHold = setAndHold.length + theirsToSet.length;
  const rides = (n) => `${n} ${n === 1 ? "pick rides" : "picks ride"}`;
  let denominator = null;
  let absence = null;
  if (!buckets.length) {
    absence = reads.length
      ? "Every pick you hold was set by a season that is already over, so none of " +
        "them is still moving."
      : null;
  } else if (!setNotHold.length && !theirsToSet.length) {
    /*
     * THE HONEST VERSION OF WHAT THE SPLIT BAR PRINTED AS 100%: not a share, an absence,
     * and both halves of it named.
     *
     * SCOPED TO THE PICKS STILL IN PLAY, which is not a quibble. The obvious phrasing -
     * "you have never sent one of your own picks elsewhere" - is a claim about all of
     * history, and this ledger counts only live picks. The live league has a roster it
     * would be false about: roster 14 reaches this branch with one of its own picks
     * genuinely sitting on another roster, settled, and therefore counted in the group
     * below instead of in row two. A sentence that says "never" while the page shows
     * otherwise two inches down is the same class of error as the bar this replaced.
     */
    absence =
      "Every pick still in play is one your own seasons set and you still hold. " +
      "None of your own undecided picks is anywhere else, and you hold none of " +
      "anybody else's.";
  } else if (both) {
    denominator =
      `${rides(yoursToSet)} on your seasons; you hold ${youHold}. ` +
      `The ${both} in the first row ${both === 1 ? "is" : "are"} both.`;
  } else {
    denominator =
      `${rides(yoursToSet)} on your seasons; you hold ${youHold}. ` +
      `No pick is in both sets.`;
  }
  return {
    total: reads.length,
    settled: reads.length - live.length,
    buckets,
    yoursToSet,
    youHold,
    both,
    ridingOn,
    denominator,
    absence,
  };
}
/**
 * BUCKET B'S SENTENCE, which this app has never said before.
 *
 * Every other agency sentence here is about a pick you hold. This one is about a pick you
 * do NOT hold and still decide, and the consequence follows from the ordering rule alone:
 * a rookie draft is ordered off the previous season's standings, so a season that goes
 * well moves the slot later. "Tends to" is not hedging for its own sake - this league's
 * draft order has deviated from strict reverse standings in every draft on record
 * (`draftOrderFidelity`), so a flat "every win moves it later" would claim a precision
 * the measurement one link away denies.
 *
 * It grades nothing (D6): sending a pick away is not called good or bad, and the reader
 * who did it is told what it means, not what it was worth. It infers no intent (D19).
 */
function setNotHoldNote(count) {
  const one = count === 1;
  return (
    `Your own ${one ? "season sets this one" : "seasons set these"}, and somebody ` +
    `else holds ${one ? "it" : "them"}. That inverts the usual reading of a good ` +
    `season: the draft is ordered off the standings, so a season that goes well ` +
    `tends to push ${one ? "this pick" : "these picks"} later in ` +
    `${one ? "its" : "their"} round. They hold the asset; you hold the outcome.`
  );
}
/** "A", "A and B", "A, B and C". No serial comma, no em dash. */
function listNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
function controlledNote(count, tension, posture) {
  const one = count === 1;
  const subject = one ? "One pick is" : `${count} picks are`;
  const own = one ? "your own season" : "your own seasons";
  const it = one ? "it" : "them";
  const head = `${subject} set by ${own}`;
  if (tension === "aligned") {
    return (
      `${head}, and your roster reads rebuilding. The picks and the timeline point ` +
      `the same way: your own results are what move ${it}.`
    );
  }
  if (tension === "opposed") {
    return (
      `${head}, and your roster reads contending. Those two pull against each other: ` +
      `every win moves ${it} later in the round. Both ends are yours, which is what ` +
      `makes ${it} a decision rather than a problem.`
    );
  }
  const tail = posture
    ? ` Right now your roster reads ${posture}, which does not point ${it} either way.`
    : " Your roster's timeline is not read here.";
  return `${head}, so the outcome is yours to move rather than somebody else's to hand you.${tail}`;
}
function passengerNote(count, posture, managers) {
  const one = count === 1;
  const many = managers.length > 1;
  const who = listNames(managers);
  const seasons = many || !one ? "seasons set" : "season sets";
  const slots = one ? "this pick's slot" : "these picks' slots";
  const assets = one ? "the asset" : "the assets";
  const outcomes = one ? "the outcome" : "the outcomes";
  const theirs = many ? "Those rosters read" : "Their roster reads";
  const tail = posture
    ? ` ${theirs} ${posture}.`
    : ` No timeline is read for ${many ? "those rosters" : "them"} here.`;
  return (
    `${who}'s ${seasons} ${slots}, not yours. You hold ${assets}; they hold ` +
    `${outcomes}.${tail}`
  );
}
const CONTROLLED_ORDER = ["aligned", "opposed", "open"];
const SETTLED_KEY = "settled";
/**
 * A settled pick's slot is published, so the group is ordered by the board rather than by
 * posture. Posture is a reading of a season that can still move; for these it cannot, and
 * sorting them by it would organise the list on a fact that no longer applies.
 *
 * Picks whose slot is not published (`overall === null`, the honest output when the draft
 * order for that season is not in the corpus) sort after the ones that are, by season and
 * round, rather than being given a position they have not earned.
 */
function bySlot(a, b) {
  const ao = a.overall ?? Number.POSITIVE_INFINITY;
  const bo = b.overall ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return (
    a.pick.season.localeCompare(b.pick.season) ||
    a.pick.round - b.pick.round ||
    a.determinedBy - b.determinedBy
  );
}
/**
 * Partition a set of reads into the four postures, the picks you set yourself, and the
 * picks whose season is already over.
 *
 * Order is fixed rather than by size: the picks whose outcome is yours come first
 * because they are the ones a decision can act on, then the rest in the same posture
 * order the ledger above prints them in, so the group list and the ledger's third row
 * read top to bottom in step. Settled picks come last, being the only group nothing can
 * still be done about.
 *
 * THEY ARE A GROUP AND NOT A FILTER. `PickAgencyPanel` used to drop them before calling
 * this, and pay for the omission with a paragraph accounting for the rows it had hidden.
 * A group header states the count in three words and the rows underneath state the one
 * thing a settled pick knows that a live one does not: the slot.
 */
export function groupAgency(reads) {
  const buckets = new Map();
  for (const r of reads) {
    const key = r.settled
      ? SETTLED_KEY
      : r.controlled
        ? `controlled:${r.tension}`
        : `passenger:${r.posture ?? POSTURE_UNREAD}`;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  const keys = [
    ...CONTROLLED_ORDER.map((t) => `controlled:${t}`),
    ...POSTURE_ORDER.map((p) => `passenger:${p}`),
    SETTLED_KEY,
  ];
  const out = [];
  for (const key of keys) {
    const picks = buckets.get(key);
    if (!picks || !picks.length) continue;
    if (key === SETTLED_KEY) {
      const sorted = [...picks].sort(bySlot);
      out.push({
        key,
        kind: "settled",
        tension: null,
        posture: null,
        picks: sorted,
        count: sorted.length,
        firsts: sorted.filter((p) => p.pick.round === 1).length,
        value: sorted.reduce((s, p) => s + p.pick.value, 0),
        managers: [],
        title: "Set by seasons that are already over",
        note:
          `These slots are published. The season that ordered them is over, so ` +
          `nobody's posture moves them anymore.`,
      });
      continue;
    }
    const kind = key.startsWith("controlled") ? "controlled" : "passenger";
    const posture = picks[0].posture;
    const tension = picks[0].tension;
    const managerMap = new Map();
    if (kind === "passenger") {
      for (const p of picks) managerMap.set(p.determinedBy, p.determinedByName);
    }
    const managers = [...managerMap]
      .map(([rosterId, name]) => ({ rosterId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    out.push({
      key,
      kind,
      tension,
      posture,
      picks,
      count: picks.length,
      firsts: picks.filter((p) => p.pick.round === 1).length,
      value: picks.reduce((s, p) => s + p.pick.value, 0),
      managers,
      title:
        kind === "controlled"
          ? "Your own seasons set these"
          : posture
            ? `Set by rosters that read ${posture}`
            : "Set by rosters with no timeline read here",
      note:
        kind === "controlled"
          ? controlledNote(picks.length, tension, posture)
          : passengerNote(
              picks.length,
              posture,
              managers.map((m) => m.name),
            ),
    });
  }
  return out;
}
function pickKey(season, round, original) {
  return `${season}|${round}|${original}`;
}
/**
 * Every pick round trip in the league's history, oldest recorded first, snapshot-only
 * round trips after.
 *
 * Handles a pick that changed hands more than twice by construction: detection reads
 * one hop (`previousOwner !== original && newOwner === original`) and never assumes
 * the pick came straight back, and `recordedHops` counts what actually happened in
 * between. It also reports the SAME pick twice when it genuinely came home twice,
 * because those are two separate decisions.
 */
export function pickBuybacks(h) {
  const out = [];
  const recordedKeys = new Set();
  // Every recorded hop of every pick, chronological, so departures and hop counts
  // can be read off the same pass that finds the returns.
  const hopsByPick = new Map();
  const trades = h.transactions
    .filter((t) => t.draftPicks.length > 0)
    .sort((a, b) => a.created - b.created);
  for (const t of trades) {
    for (const dp of t.draftPicks) {
      const key = pickKey(dp.season, dp.round, dp.rosterId);
      const list = hopsByPick.get(key) ?? [];
      list.push({
        at: t.created,
        from: dp.previousOwnerId,
        to: dp.ownerId,
        txId: t.transactionId,
      });
      hopsByPick.set(key, list);
    }
  }
  for (const [key, hops] of hopsByPick) {
    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];
      const [season, roundStr, originalStr] = key.split("|");
      const original = Number(originalStr);
      const round = Number(roundStr);
      if (hop.to !== original || hop.from === original) continue;
      // Walk back to the hop that sent it away. There may be several hops in
      // between (the live league has one that went out, moved on once more, and
      // then came home), so this is a scan and not an assumption about hops[i-1].
      let departureIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (hops[j].from === original) {
          departureIdx = j;
          break;
        }
      }
      const leftAt = departureIdx >= 0 ? hops[departureIdx].at : null;
      recordedKeys.add(key);
      out.push({
        season,
        round,
        rosterId: original,
        rosterName: rosterName(h, original),
        fromRoster: hop.from,
        fromName: rosterName(h, hop.from),
        recorded: true,
        transactionId: hop.txId,
        at: hop.at,
        leftAt,
        awayDays:
          leftAt != null ? Math.round((hop.at - leftAt) / 86_400_000) : null,
        recordedHops: departureIdx >= 0 ? i - departureIdx + 1 : null,
        label: `${season} ${ordinal(round)}`,
      });
    }
  }
  out.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  // Snapshot-only round trips. Deduped against the recorded ones by pick, and
  // against each other because the same pick appears in every season's snapshot
  // once it has settled back home.
  const seen = new Set(recordedKeys);
  const snapshots = [...h.tradedPicksHistory, ...h.tradedPicks];
  for (const tp of snapshots) {
    if (tp.ownerId !== tp.rosterId || tp.previousOwnerId === tp.rosterId)
      continue;
    const key = pickKey(tp.season, tp.round, tp.rosterId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      season: tp.season,
      round: tp.round,
      rosterId: tp.rosterId,
      rosterName: rosterName(h, tp.rosterId),
      fromRoster: tp.previousOwnerId,
      fromName: rosterName(h, tp.previousOwnerId),
      recorded: false,
      transactionId: null,
      at: null,
      leftAt: null,
      awayDays: null,
      recordedHops: null,
      label: `${tp.season} ${ordinal(tp.round)}`,
    });
  }
  return out;
}
/**
 * THE DENOMINATOR: every pick a roster originally owned that has ever left home, distinct
 * by pick. Returns a Map of pick key to the roster that originally owned it.
 *
 * SCOPE MATCHES `pickBuybacks` DELIBERATELY, and getting this wrong biases the rate in
 * one direction rather than adding noise. The numerator counts round trips from the
 * transaction log AND from the traded-picks snapshots, because a commissioner-executed
 * trade records no picks at all and the snapshot is then the only evidence. A denominator
 * built from the transaction log alone would miss exactly the same class of move while
 * the numerator kept it, so the rate would read high. Measured on the live league: 128
 * departures are recorded, 133 once the snapshot-only ones are counted, and 2 of the 17
 * returns are themselves snapshot-only.
 *
 * A snapshot row exists only for a pick that has moved, so any row whose owner or
 * previous owner is not the original roster is evidence of a departure.
 */
export function pickDepartures(h) {
  const out = new Map();
  for (const t of h.transactions) {
    for (const dp of t.draftPicks) {
      if (dp.previousOwnerId !== dp.rosterId) continue;
      out.set(pickKey(dp.season, dp.round, dp.rosterId), dp.rosterId);
    }
  }
  for (const tp of [...h.tradedPicksHistory, ...h.tradedPicks]) {
    if (tp.ownerId === tp.rosterId && tp.previousOwnerId === tp.rosterId)
      continue;
    out.set(pickKey(tp.season, tp.round, tp.rosterId), tp.rosterId);
  }
  return out;
}
/** Round trips by the roster that made them. */
export function buybacksByRoster(h) {
  const out = new Map();
  for (const b of pickBuybacks(h)) {
    const list = out.get(b.rosterId) ?? [];
    list.push(b);
    out.set(b.rosterId, list);
  }
  return out;
}
export function leagueBuybacks(h) {
  const all = pickBuybacks(h);
  const departures = pickDepartures(h);
  const departedBy = new Map();
  for (const original of departures.values()) {
    departedBy.set(original, (departedBy.get(original) ?? 0) + 1);
  }
  /*
   * THE RATE'S NUMERATOR IS DISTINCT PICKS, NOT ROUND TRIPS. `pickBuybacks` reports the
   * same pick twice when it genuinely came home twice, which is right for a list of
   * decisions and wrong for a rate whose denominator counts picks: two returns of one
   * pick against one departure of it would read as 200%. The live league happens to have
   * no pick that came home twice (17 trips over 17 distinct picks), so this costs nothing
   * today and stops the number being nonsense the first time it does.
   */
  const returnedKeys = new Set(
    all.map((b) => pickKey(b.season, b.round, b.rosterId)),
  );
  const returnedBy = new Map();
  for (const key of returnedKeys) {
    const original = departures.get(key) ?? Number(key.split("|")[2]);
    returnedBy.set(original, (returnedBy.get(original) ?? 0) + 1);
  }
  const byRoster = new Map();
  for (const b of all) {
    const m = byRoster.get(b.rosterId) ?? {
      rosterId: b.rosterId,
      rosterName: b.rosterName,
      count: 0,
      recorded: 0,
      returned: returnedBy.get(b.rosterId) ?? 0,
      departed: departedBy.get(b.rosterId) ?? 0,
    };
    m.count++;
    if (b.recorded) m.recorded++;
    byRoster.set(b.rosterId, m);
  }
  const byManager = [...byRoster.values()].sort(
    (a, b) => b.count - a.count || a.rosterName.localeCompare(b.rosterName),
  );
  const dated = all.filter((b) => b.awayDays != null);
  const longestAway = dated.length
    ? dated.reduce((best, b) => (b.awayDays > best.awayDays ? b : best))
    : null;
  const rosters = h.rosters.length;
  return {
    all,
    total: all.length,
    recorded: all.filter((b) => b.recorded).length,
    unrecorded: all.filter((b) => !b.recorded).length,
    byManager,
    rosters,
    rostersWithNone: Math.max(0, rosters - byManager.length),
    multiHop: all.filter((b) => b.recordedHops != null && b.recordedHops > 2),
    longestAway,
    // The rate the section never had: 17 round trips is a count, and a count with no
    // denominator cannot say whether picks come home often or almost never.
    returnedPicks: returnedKeys.size,
    departedPicks: departures.size,
  };
}
/** Pure comparison, so the claim above is pinned by a test rather than by a memory. */
export function compareOrder(slotToRosterId, standingsBest) {
  // Reverse standings: worst record picks first.
  const expected = [...standingsBest].reverse();
  let deviations = 0;
  let maxShift = 0;
  expected.forEach((rosterId, i) => {
    const slot = Number(
      Object.keys(slotToRosterId).find(
        (k) => slotToRosterId[Number(k)] === rosterId,
      ),
    );
    if (!Number.isFinite(slot)) return;
    const shift = Math.abs(slot - (i + 1));
    if (shift > 0) deviations++;
    if (shift > maxShift) maxShift = shift;
  });
  return { teams: expected.length, deviations, maxShift };
}
/**
 * `index` and `seasonRosters` are passed in rather than loaded here so this stays a
 * pure function over two loaders every calling page already pays for (D25) - and so
 * the test can hand it a league whose order IS exact and get the other answer.
 */
export function draftOrderFidelity(h, drafts, seasonRosters) {
  const seasons = [];
  for (const [season, draft] of drafts) {
    const from = determiningSeason(season);
    const rosters = seasonRosters.get(from);
    if (!rosters || rosters.length < 4) continue;
    const played = rosters.some(
      (r) => r.settings.wins + r.settings.losses > 0 || r.settings.fpts > 0,
    );
    if (!played) continue;
    const best = [...rosters]
      .sort((a, b) => {
        const aw = a.settings.wins - a.settings.losses;
        const bw = b.settings.wins - b.settings.losses;
        if (bw !== aw) return bw - aw;
        return b.settings.fpts - a.settings.fpts;
      })
      .map((r) => r.rosterId);
    const cmp = compareOrder(draft.slotToRosterId, best);
    seasons.push({
      season,
      fromSeason: from,
      teams: cmp.teams,
      deviations: cmp.deviations,
      maxShift: cmp.maxShift,
      exact: cmp.deviations === 0,
    });
  }
  seasons.sort((a, b) => a.season.localeCompare(b.season));
  const followsReverseStandings =
    seasons.length > 0 && seasons.every((s) => s.exact);
  const off = seasons.filter((s) => !s.exact).length;
  const worst = seasons.length
    ? Math.max(...seasons.map((s) => s.maxShift))
    : 0;
  /*
   * `note` IS THE METHODOLOGY PARAGRAPH; `panelLine` IS THE ONE LINE THAT STAYS ON THE
   * PAGE. It used to be one string, printed inside the pick-agency panel, ending in a
   * source-file path. A footnote that long, that far from the model it qualifies, was
   * paying for itself in vertical space on the panel and answering nobody: the reader
   * who wants the pricing model is on /methodology, and the reader on /roster wants the
   * one fact that changes how to read the prices above it.
   */
  const note = !seasons.length
    ? "No draft order to check against standings yet, so nothing here assumes one."
    : followsReverseStandings
      ? `Draft order in this league has matched reverse standings exactly in all ` +
        `${seasons.length} rookie drafts on record, so a season's result maps straight ` +
        `onto a slot. A future pick is still priced as a spread rather than a slot, ` +
        `because the season that will order it has not been played.`
      : `Draft order here follows the previous season's standings loosely, not exactly: ` +
        `it has differed from strict reverse standings in ${off} of ${seasons.length} ` +
        `rookie drafts on record, by up to ${worst} places. The league carries no ` +
        `draft-order rule we can read, so nothing here names the slot a pick will land ` +
        `on. Pricing does assume a lottery over reverse standings, which is why a ` +
        `future pick's price moves with the owing team's rank. Treat that price as a ` +
        `tendency, not a projection.`;
  const panelLine = !seasons.length
    ? "No draft order has been checked against standings yet, so no price here assumes one."
    : followsReverseStandings
      ? `Draft order has matched reverse standings exactly in all ${seasons.length} ` +
        `drafts on record, so a future pick's price tracks the owing roster's rank.`
      : `Draft order here follows reverse standings loosely, not exactly: it has ` +
        `differed in ${off} of ${seasons.length} drafts on record, by up to ${worst} ` +
        `places.`;
  return { seasons, followsReverseStandings, note, panelLine };
}
