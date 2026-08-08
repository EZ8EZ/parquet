/**
 * PICK AGENCY - whose season decides the pick you are holding.
 *
 * ---------------------------------------------------------------------------------
 * The idea
 * ---------------------------------------------------------------------------------
 * Every future pick in this app already carries two numbers: what it is worth
 * (`lib/picks.ts`, priced by the strength of the team that owes it) and when it pays
 * off (`lib/metrics/duration.ts`). Neither of them answers the question an
 * experienced dynasty manager asks first:
 *
 *   Is this pick's outcome mine to move, or am I a passenger on somebody else's
 *   season?
 *
 * Those are categorically different assets. A pick whose slot is set by YOUR OWN
 * season is an instrument: the same decisions that set your record set the pick. A
 * pick whose slot is set by somebody else's season is a claim on a stranger's
 * intentions - it is worth what THEY do next, and you have no say in it at all.
 *
 * The join is small and it was sitting in plain sight. Every pick already knows its
 * ORIGINAL roster (`OwnedPick.originalRoster`, straight off Sleeper's traded-picks
 * records), and the original roster is exactly the roster whose season orders the
 * draft that pick sits in. Posture per roster already exists. Nobody had put the two
 * beside each other.
 *
 * ---------------------------------------------------------------------------------
 * What this module refuses to say
 * ---------------------------------------------------------------------------------
 * 1. IT NEVER CLAIMS ANYONE IS TANKING (D19). Intent is not in the corpus. What is
 *    in the corpus: who holds the pick, whose season sets it, and what that roster's
 *    asset timeline reads as. When a manager holds their own pick and their roster
 *    reads rebuilding, this module says those two point the same way and stops. The
 *    reader can draw the conclusion; the app is not entitled to.
 *
 * 2. IT NEVER GRADES (D6). "You control this pick and your roster reads contending"
 *    is a fact and a real tension. "That is bad" is a verdict, and we do not ship
 *    verdicts.
 *
 * 3. IT DOES NOT MODEL THE DRAFT ORDER, and that is a measured decision rather than
 *    a shrug. See `draftOrderFidelity` below: in this league the rookie draft order
 *    has tracked the previous season's standings without ever matching them exactly.
 *    Sleeper's league settings carry no draft-order rule at all (there is no lottery
 *    field), so the mechanism is not knowable from the data, and no lottery odds are
 *    computed anywhere in this file.
 *
 * ---------------------------------------------------------------------------------
 * Which season sets a pick
 * ---------------------------------------------------------------------------------
 * The draft labelled season S is ordered by season S-1's standings. Verified against
 * all four completed rookie drafts of the live league: the 2026 draft's slot order
 * tracks the 2025 final standings (the 3-17 roster took slot 1), 2025's tracks 2024,
 * and so on. This is read as a convention of the sport, never computed from a league
 * setting, because no such setting exists.
 */
import type { LeagueHistory } from "../history";
import { pickCapital, type OwnedPick } from "../picks";
import type { TimelineProfile } from "../metrics/duration";
import type { CurrentForm } from "../roster";
import { ordinal, rosterName } from "../derive/describe";
import type { Roster } from "../providers/types";

export type Posture = TimelineProfile["posture"];

/**
 * How a pick's outcome relates to the person holding it.
 *
 * Deliberately four descriptive states and no ranking between them. "opposed" is not
 * a criticism: a contender holding its own first is a real and interesting position,
 * and naming the pull is the product.
 */
export type AgencyTension =
  /** The holder sets the pick, and their roster's timeline points the same way. */
  | "aligned"
  /** The holder sets the pick, and their roster's timeline points the other way. */
  | "opposed"
  /** The holder sets the pick, and their timeline does not point either way. */
  | "open"
  /** Somebody else's season sets it. */
  | "passenger";

export interface PickAgency {
  pick: OwnedPick;
  key: string;
  /**
   * "2027 1st", without the "(via X)" qualifier `OwnedPick.label` carries.
   *
   * A row that prints the agency read already names the manager on its own line, so
   * repeating them inside the label pushed the season and round off a 375px screen
   * to say the same thing twice.
   */
  shortLabel: string;
  /** The roster whose season orders the draft this pick sits in. */
  determinedBy: number;
  determinedByName: string;
  /** The season whose standings set the slot: the pick's season minus one. */
  determiningSeason: string;
  /** True when the holder is also the roster whose season sets it. */
  controlled: boolean;
  /**
   * True when the determining season is already over. Agency is a live quantity: once
   * the season that orders the draft has finished, nobody's decisions move this pick
   * any more, whoever holds it.
   */
  settled: boolean;
  posture: Posture | null;
  tci: number | null;
  form: CurrentForm | null;
  tension: AgencyTension;
  /** Plain language, stating the position and never judging it. */
  note: string;
}

export interface AgencySummary {
  total: number;
  controlled: number;
  passenger: number;
  firstsControlled: number;
  firstsPassenger: number;
  /** Value split, so "half my picks" and "half my pick capital" stay distinguishable. */
  controlledValue: number;
  passengerValue: number;
  /** For the picks you do not control: what those managers' timelines read as. */
  ridingOn: { posture: Posture | "unread"; picks: number; managers: string[] }[];
  headline: string;
}

/** Posture and TCI per roster, from the league-wide timeline pass. */
export function posturesByRoster(
  timelines: TimelineProfile[],
): Map<number, { posture: Posture; tci: number }> {
  return new Map(
    timelines.map((t) => [t.rosterId, { posture: t.posture, tci: t.tci }]),
  );
}

export interface AgencyInputs {
  postures?: Map<number, { posture: Posture; tci: number }>;
  forms?: Map<number, CurrentForm>;
}

/** The season whose standings order the draft a season-S pick sits in. */
export function determiningSeason(pickSeason: string): string {
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
function seasonIsOver(h: LeagueHistory, season: string): boolean {
  const year = parseInt(season, 10);
  if (year < h.currentSeasonYear) return true;
  if (year > h.currentSeasonYear) return false;
  return h.currentLeague.status === "complete";
}

function formPhrase(form: CurrentForm | null): string {
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
export function readPickAgency(
  h: LeagueHistory,
  holder: number,
  pick: OwnedPick,
  inputs: AgencyInputs = {},
): PickAgency {
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

  let tension: AgencyTension;
  let note: string;

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
export function pickAgency(
  h: LeagueHistory,
  rosterId: number,
  inputs: AgencyInputs = {},
): PickAgency[] {
  return pickCapital(h, rosterId).picks.map((p) =>
    readPickAgency(h, rosterId, p, inputs),
  );
}

const POSTURE_ORDER: (Posture | "unread")[] = [
  "rebuilding",
  "straddling",
  "ascending",
  "contending",
  "unread",
];

export function summarizeAgency(reads: PickAgency[]): AgencySummary {
  const controlled = reads.filter((r) => r.controlled);
  const passenger = reads.filter((r) => !r.controlled);

  const buckets = new Map<Posture | "unread", { picks: number; managers: Set<string> }>();
  for (const r of passenger) {
    const key: Posture | "unread" = r.posture ?? "unread";
    const b = buckets.get(key) ?? { picks: 0, managers: new Set<string>() };
    b.picks++;
    b.managers.add(r.determinedByName);
    buckets.set(key, b);
  }
  const ridingOn = POSTURE_ORDER.filter((p) => buckets.has(p)).map((posture) => ({
    posture,
    picks: buckets.get(posture)!.picks,
    managers: [...buckets.get(posture)!.managers].sort(),
  }));

  const sum = (list: PickAgency[]) => list.reduce((s, r) => s + r.pick.value, 0);

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

// ---------------------------------------------------------------- the buyback

/**
 * A pick that came HOME: a manager reacquiring a pick they originally owned.
 *
 * This is a genuine behavioural tell and it is computable from data already in the
 * corpus, which is the whole reason it is here. It is also the exact transaction the
 * owner of this app describes as the precondition for a full reset, because it is the
 * one purchase that converts a season from a result into an instrument.
 *
 * WHAT THIS IS NOT. It is not evidence of intent, and nothing downstream may present
 * it as such (D19). A pick can come home in a salary-dump, as a throw-in, or because
 * somebody wanted a different asset in the same deal. All this says is: it left, and
 * it came back, on these dates.
 *
 * TWO SOURCES, LABELLED DIFFERENTLY, because the record is honestly uneven:
 *
 *  - RECORDED. A trade transaction names the pick, so there is a date, a deal to link
 *    to, and a countable set of hops it made while it was away.
 *  - SNAPSHOT-ONLY. Sleeper's traded-picks snapshot shows the pick sitting back with
 *    its original roster having arrived from somebody else, but no transaction in the
 *    log explains the move. This is the D19 gap: commissioner-executed trades always
 *    carry `draft_picks: []`, so their pick component leaves no transaction record at
 *    all. The round trip is a FACT; which deal did it, and when, is not recoverable,
 *    and these carry no date rather than a guessed one.
 */
export interface PickBuyback {
  season: string;
  round: number;
  /** The roster that originally owned it, and reacquired it. */
  rosterId: number;
  rosterName: string;
  /** Who it came back from. */
  fromRoster: number;
  fromName: string;
  /** False when only the traded-picks snapshot evidences this (see above). */
  recorded: boolean;
  transactionId: string | null;
  /** ms epoch of the reacquiring trade. Null for snapshot-only round trips. */
  at: number | null;
  /** ms epoch it first left its original owner, when the log records that too. */
  leftAt: number | null;
  /** Days between leaving and returning. Null when either end is undated. */
  awayDays: number | null;
  /**
   * Recorded trades this pick appeared in from its departure through its return,
   * inclusive. 2 is a straight there-and-back; 3 or more means it changed hands
   * elsewhere before coming home.
   */
  recordedHops: number | null;
  label: string;
}

function pickKey(season: string, round: number, original: number): string {
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
export function pickBuybacks(h: LeagueHistory): PickBuyback[] {
  const out: PickBuyback[] = [];
  const recordedKeys = new Set<string>();

  // Every recorded hop of every pick, chronological, so departures and hop counts
  // can be read off the same pass that finds the returns.
  const hopsByPick = new Map<
    string,
    { at: number; from: number; to: number; txId: string }[]
  >();
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
    if (tp.ownerId !== tp.rosterId || tp.previousOwnerId === tp.rosterId) continue;
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
export function buybacksByRoster(h: LeagueHistory): Map<number, PickBuyback[]> {
  const out = new Map<number, PickBuyback[]>();
  for (const b of pickBuybacks(h)) {
    const list = out.get(b.rosterId) ?? [];
    list.push(b);
    out.set(b.rosterId, list);
  }
  return out;
}

// ------------------------------------------------------- how the order is set

/**
 * Does this league's rookie draft order actually follow reverse standings?
 *
 * This exists because the whole premise of "your own pick is an instrument" rests on
 * a mapping from your record to your slot, and it would have been very easy to assume
 * that mapping is the identity. It is not, in this league. Sleeper carries no
 * draft-order setting of any kind, so the only way to know is to compare the assigned
 * slot order against the previous season's final standings, which is what this does.
 *
 * Measured on the live league, all four completed rookie drafts deviate from strict
 * reverse standings, twice by a lot (a 10-10 roster picked 2nd in 2026; an 11th-place
 * roster picked 1st in 2025). So the app states the relationship as a tendency, does
 * not model the mechanism, and computes no lottery odds. That refusal is the point of
 * this function, not a limitation of it.
 */
export interface SeasonOrderCheck {
  /** The draft's season. */
  season: string;
  /** The season whose standings it should follow. */
  fromSeason: string;
  teams: number;
  /** Slots whose holder is not the one strict reverse standings would put there. */
  deviations: number;
  /** Biggest gap, in places, between a roster's slot and its reverse-standings slot. */
  maxShift: number;
  exact: boolean;
}

export interface DraftOrderFidelity {
  /** Null when the provider has no draft data at all. */
  seasons: SeasonOrderCheck[];
  /** True only when every checked season matched reverse standings exactly. */
  followsReverseStandings: boolean;
  /** One sentence, safe to print verbatim, stating what was measured. */
  note: string;
}

/** Pure comparison, so the claim above is pinned by a test rather than by a memory. */
export function compareOrder(
  slotToRosterId: Record<number, number>,
  standingsBest: number[],
): { teams: number; deviations: number; maxShift: number } {
  // Reverse standings: worst record picks first.
  const expected = [...standingsBest].reverse();
  let deviations = 0;
  let maxShift = 0;
  expected.forEach((rosterId, i) => {
    const slot = Number(
      Object.keys(slotToRosterId).find((k) => slotToRosterId[Number(k)] === rosterId),
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
export function draftOrderFidelity(
  h: LeagueHistory,
  drafts: Map<string, { slotToRosterId: Record<number, number>; rounds: number }>,
  seasonRosters: Map<string, Roster[]>,
): DraftOrderFidelity {
  const seasons: SeasonOrderCheck[] = [];
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

  const followsReverseStandings = seasons.length > 0 && seasons.every((s) => s.exact);
  const note = !seasons.length
    ? "No draft order to check against standings yet, so nothing here assumes one."
    : followsReverseStandings
      ? `Draft order in this league has matched reverse standings exactly in all ${seasons.length} rookie drafts on record, so a season's result maps straight onto a slot.`
      : `Draft order here follows the previous season's standings loosely, not exactly: ` +
        `it has differed from strict reverse standings in ${seasons.filter((s) => !s.exact).length} of ` +
        `${seasons.length} rookie drafts on record, by up to ${Math.max(...seasons.map((s) => s.maxShift))} places. ` +
        `The league carries no draft-order rule we can read, so we do not model the slot, and no odds are computed anywhere.`;

  return { seasons, followsReverseStandings, note };
}
