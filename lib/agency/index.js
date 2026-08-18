import { pickCapital } from "../picks.js";
import { ordinal, rosterName } from "../derive/describe.js";
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
  return {
    pick,
    key: `${pick.season}-${pick.round}-${pick.originalRoster}`,
    shortLabel: label,
    determinedBy,
    determinedByName,
    determiningSeason: decidedIn,
    controlled,
    settled,
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
const POSTURE_ORDER = [
  "rebuilding",
  "straddling",
  "ascending",
  "contending",
  "unread",
];
export function summarizeAgency(reads) {
  const controlled = reads.filter((r) => r.controlled);
  const passenger = reads.filter((r) => !r.controlled);
  const buckets = new Map();
  for (const r of passenger) {
    const key = r.posture ?? "unread";
    const b = buckets.get(key) ?? { picks: 0, managers: new Set() };
    b.picks++;
    b.managers.add(r.determinedByName);
    buckets.set(key, b);
  }
  const ridingOn = POSTURE_ORDER.filter((p) => buckets.has(p)).map(
    (posture) => ({
      posture,
      picks: buckets.get(posture).picks,
      managers: [...buckets.get(posture).managers].sort(),
    }),
  );
  const sum = (list) => list.reduce((s, r) => s + r.pick.value, 0);
  const headline = reads.length
    ? `${controlled.length} of ${reads.length} picks are set by your own seasons. ` +
      `The other ${passenger.length} ${passenger.length === 1 ? "rides" : "ride"} on somebody else's.`
    : "No picks held, so no agency to read.";
  return {
    total: reads.length,
    controlled: controlled.length,
    passenger: passenger.length,
    firstsControlled: controlled.filter((r) => r.pick.round === 1).length,
    firstsPassenger: passenger.filter((r) => r.pick.round === 1).length,
    controlledValue: sum(controlled),
    passengerValue: sum(passenger),
    ridingOn,
    headline,
  };
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
/**
 * Partition a set of reads into the four postures plus the picks you set yourself.
 *
 * Order is fixed rather than by size: the picks whose outcome is yours come first
 * because they are the ones a decision can act on, then the rest in the same posture
 * order `summarizeAgency` already prints above them, so the group list and the
 * "what the seasons you ride on are doing" summary read top to bottom in step.
 */
export function groupAgency(reads) {
  const buckets = new Map();
  for (const r of reads) {
    const key = r.controlled
      ? `controlled:${r.tension}`
      : `passenger:${r.posture ?? "unread"}`;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  const keys = [
    ...CONTROLLED_ORDER.map((t) => `controlled:${t}`),
    ...POSTURE_ORDER.map((p) => `passenger:${p}`),
  ];
  const out = [];
  for (const key of keys) {
    const picks = buckets.get(key);
    if (!picks || !picks.length) continue;
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
  const byRoster = new Map();
  for (const b of all) {
    const m = byRoster.get(b.rosterId) ?? {
      rosterId: b.rosterId,
      rosterName: b.rosterName,
      count: 0,
      recorded: 0,
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
  const note = !seasons.length
    ? "No draft order to check against standings yet, so nothing here assumes one."
    : followsReverseStandings
      ? `Draft order in this league has matched reverse standings exactly in all ${seasons.length} rookie drafts on record, so a season's result maps straight onto a slot.`
      : `Draft order here follows the previous season's standings loosely, not exactly: ` +
        `it has differed from strict reverse standings in ${seasons.filter((s) => !s.exact).length} of ` +
        `${seasons.length} rookie drafts on record, by up to ${Math.max(...seasons.map((s) => s.maxShift))} places. ` +
        `The league carries no draft-order rule we can read, so nothing here names the slot a pick will land on. ` +
        `Pricing does assume a lottery over reverse standings (lib/valuation slotDistribution), which is why a future ` +
        `pick's price moves with the owing team's rank - treat that price as a tendency, not a projection.`;
  return { seasons, followsReverseStandings, note };
}
