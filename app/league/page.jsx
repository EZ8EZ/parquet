import { Suspense } from "react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { cachedLeagueTimelines } from "@/lib/metrics/duration";
import {
  leagueWindows,
  windowRefusalCode,
  windowRefusalSummary,
  windowShort,
  windowSynthesis,
  windowThesis,
} from "@/lib/metrics/window";
import { leagueFragility } from "@/lib/metrics/fragility";
import { QUADRANTS, buildQuadrantView } from "@/lib/metrics/quadrant";
import { refusal, refusalSentence } from "@/lib/refusal";
import { LeagueBoard } from "@/components/LeagueBoard";
import { LeagueSelectionProvider } from "@/components/LeagueSelection";
import { PowerRanking } from "@/components/PowerRanking";
import { SeatCard } from "@/components/SeatCard";
import { SelectedRoster } from "@/components/SelectedRoster";
import { PageHeader, SectionHeader } from "@/components/ui";
import { fmtValue } from "@/lib/ui";
import { ordinal } from "@/lib/derive/describe";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperLeagueUrl } from "@/lib/sleeperLinks";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
/**
 * THE LEAGUE - one question, three facets, in that order.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS PAGE WAS, AND WHY IT WAS RESTRUCTURED RATHER THAN TIDIED
 * ---------------------------------------------------------------------------------
 * Five sections stacked, each with an uppercase tracked label, which is the typographic
 * register for a TAXONOMY - five unrelated nouns. They were not five unrelated things.
 * They were four different renderings of a single question and one tally that answered
 * nothing, and the tally was in the highest slot on the page.
 *
 * The question a manager arrives with is about their own seat. The page answers it in
 * three facets, and the section headers are literal sentence-case QUESTIONS
 * (`SectionHeader as="question"`) so they read as three parts of one enquiry rather than
 * as three categories:
 *
 *   1. Where does your value land?     the seat card - your span, your rank, and the
 *                                      other thirteen rosters named against it
 *   2. How does the league sit around  one board, two lensed views of the same fourteen
 *      you?                            rosters, plus the roster you have selected
 *   3. Who do you talk to?             the power ranking, which is simultaneously the
 *                                      text rendering of both charts and their control
 *
 * ---------------------------------------------------------------------------------
 * WHAT WAS CUT, AND THE MEASUREMENT THAT JUSTIFIED CUTTING IT
 * ---------------------------------------------------------------------------------
 * The four posture-census tiles that used to lead this page are gone (SHELVED.md S12).
 * Three of their four counts were counts of QUARTILE MEMBERSHIP - `classify` in
 * lib/metrics/duration.js hands out contending / ascending / rebuilding by
 * `shortnessPercentile`, and its own comment says the consequence out loud: "somebody
 * carries the label in every league, however that league is built."
 *
 * Measured on the live fourteen-roster league rather than asserted, and the measurement
 * found something worse than tautology. The quartiles are taken over ALL FOURTEEN
 * rosters while the three labels are only handed to the seven that clear the coherence
 * floor - so the tile read "1 contending" while three of the four shortest-dated rosters
 * were disqualified for INCOHERENCE rather than for timing. A reader took "one team is
 * trying to win now" from a tile that meant "one team is both shortest-dated-quartile and
 * coherent", and a one-word label has nowhere to put the difference.
 *
 * The fourth count, straddling, was the honest one - it comes off the ABSOLUTE coherence
 * floor rather than a quantile - and it is already said twice on this page in better
 * places: the split rows on the window map, and `windowRefusalSummary`, which states it
 * in a sentence with its reason attached.
 *
 * What replaced it as this page's league-wide tally is `buildQuadrantView().counts`,
 * rendered beside the axes it was read from rather than floating at the page head. An
 * intersection of two median splits is genuinely free to come out 0, which is the
 * property the census never had.
 *
 * ---------------------------------------------------------------------------------
 * ONE NUMBERING, ONE SELECTION, AND ALL DERIVATION ON THE SERVER
 * ---------------------------------------------------------------------------------
 * `buildQuadrantView` numbers by its own reading order (worst corner first) and the
 * window map used to number by TCI rank. Both key to the power ranking instead, because
 * a page with one list and two charts needs the dot labelled 7 to be row 7 or the charts
 * are decoration.
 *
 * Selection is one piece of page state in `?roster=` (lib/league/url.js), and every
 * string it can produce is built HERE, on the server, and passed down: the pairwise
 * thesis, the refusal sentence for the pairs that have none, and the live region's
 * announcement. Nothing in a client component composes a claim about a roster - what a
 * screen-reader user hears has to be the same claim a sighted reader sees, and one string
 * read by both is the only way to guarantee it.
 */
export default async function LeaguePage() {
  const h = await getLeagueHistory();
  const ranked = leagueValueRanking(h);
  const timelines = cachedLeagueTimelines(h);
  // Same two numbers the deleted duration scatter plotted, read as calendar seasons -
  // see lib/metrics/window.js. Not a third walk of the league: it is `leagueTimelines`
  // plus quartile arithmetic over the assets those profiles already carry.
  const windows = leagueWindows(h);
  const fragility = leagueFragility(h);
  const form = await currentFormByRoster(h);
  const meId = h.me.rosterId;
  // Most of a dynasty league's calendar has the live season sitting at 0-0 in
  // pre-draft, so the whole-league form is worth a callout when nobody has played yet.
  const seasonLive = [...form.values()].some((f) => f.isLive);
  const leaderValue = ranked[0]?.totalValue ?? 1;
  const leagueValue = ranked.reduce((s, r) => s + r.totalValue, 0);
  const median = ranked.length
    ? ranked[Math.floor(ranked.length / 2)].totalValue
    : 0;
  const myRank =
    meId != null ? ranked.findIndex((r) => r.rosterId === meId) + 1 : 0;
  // The two proprietary metrics on one pair of axes. Both passes are already computed
  // above / here, so the board costs a join rather than a third walk of the league.
  const built = buildQuadrantView(
    timelines,
    fragility.map((f) => ({
      rosterId: f.rosterId,
      fragility: f.fragility,
      percentile: f.percentile,
      band: f.band,
      spofName: f.singlePointOfFailure?.name ?? null,
      spofShare: f.singlePointOfFailure?.damageShare ?? null,
    })),
    meId,
  );
  const nByRoster = new Map(ranked.map((r, i) => [r.rosterId, i + 1]));
  const board = {
    ...built,
    points: built.points.map((p) => ({
      ...p,
      n: nByRoster.get(p.rosterId) ?? p.n,
    })),
  };
  const metricByRoster = new Map(board.points.map((p) => [p.rosterId, p]));
  const windowByRoster = new Map(windows.rows.map((w) => [w.rosterId, w]));
  const nameOf = (id) =>
    windowByRoster.get(id)?.teamName ??
    windowByRoster.get(id)?.ownerName ??
    `Roster ${id}`;
  /** A roster as a chip: the ranking's number plus a name. */
  const chip = (id) => ({
    rosterId: id,
    n: nByRoster.get(id) ?? 0,
    name: nameOf(id),
  });
  const ownerIdOf = (id) => h.rostersById.get(id)?.ownerId ?? null;
  const me = windows.me;
  /*
   * THE COMPARISON BUCKETS AS AN EXACT PARTITION OF THE OTHER THIRTEEN ROSTERS.
   *
   * `overlapFor` has always returned the real roster ids for these; every surface in the
   * app reduced them to `.length` before printing, which is how "6 rosters overlap that"
   * became a fact nobody could act on. They are names here, and each name is a selector.
   *
   * `samePeak` is a SUBSET of `shared` by construction - equal peaks means both spans
   * contain that season, so they intersect - so rendering the two as peers would print
   * some rosters twice. `shared` is split into "peaks with you" and "overlaps, peaks
   * elsewhere" instead, which makes the five groups a partition: every roster except the
   * viewer's own appears in exactly one.
   */
  const o = windows.overlap;
  const samePeak = new Set(o?.samePeak ?? []);
  const buckets = o
    ? [
        {
          key: "samePeak",
          label: `heaviest in ${me?.peak}, exactly as you are`,
          rosters: o.samePeak.map(chip),
        },
        {
          key: "shared",
          label: "overlaps your span, heaviest elsewhere",
          rosters: o.shared.filter((id) => !samePeak.has(id)).map(chip),
        },
        {
          key: "earlier",
          label: "dated entirely before you",
          rosters: o.earlier.map(chip),
        },
        {
          key: "later",
          label: "dated entirely after you",
          rosters: o.later.map(chip),
        },
        {
          key: "unresolved",
          label: "no single span to place at all",
          rosters: o.unresolved.map(chip),
        },
      ].filter((b) => b.rosters.length > 0)
    : [];
  const seat = {
    rank: myRank,
    teams: ranked.length,
    state: me?.state ?? null,
    code: me ? windowRefusalCode(me) : null,
    span: me && me.state === "window" ? windowShort(me) : null,
    peak: me?.peak ?? null,
    // THE ONE OWNER of this string. It used to render ungated here (so a refused roster
    // printed its refusal as unmarked plain text) and gated on /plan (so a refused
    // roster saw nothing at all) - one function, two pages, two different wrong
    // answers. /plan links here now; the card renders every state this can return, and
    // routes the refused ones through `RefusalMark`.
    synthesis: windowSynthesis(windows),
    buckets,
  };
  /*
   * EVERY STRING SELECTION CAN PRODUCE, BUILT HERE.
   *
   * `windowThesis(me, them)` is the lead reading of the selected-roster panel and had
   * exactly one caller in the app (the trade finder) despite /league computing both
   * windows on every render. It returns null whenever either side has no readable single
   * window, which on the live league is seven of fourteen rosters - the common case, not
   * an edge one - so the null branch gets a real stated reason from the closed refusal
   * register rather than an empty panel.
   *
   * The two refusals are genuinely different facts and are worded as such: if the
   * VIEWER'S own window is refused, nothing can be said about any pair; if THEIRS is,
   * the pair is what fails and their code is the one to print.
   */
  const thesisRefusalFor = (w) => {
    if (!me || me.state !== "window") {
      const code = me ? windowRefusalCode(me) : "NO_RECORD";
      return refusalSentence(
        refusal(
          code,
          `Your own window is not readable, so there is nothing to read this roster against - a pairing needs two spans and one of them is yours.`,
          me?.refusal?.withheld ?? null,
        ),
      );
    }
    const code = windowRefusalCode(w);
    return refusalSentence(
      refusal(
        code,
        code === "SPLIT_ROSTER"
          ? `Their own assets do not agree about when their value arrives, so there is no single span to place against yours. Forcing them onto one side of your window would invent the agreement the metric just declined to find.`
          : `There is no readable span for this roster, so there is nothing to place against yours.`,
        w.refusal?.withheld ?? null,
      ),
    );
  };
  /** The selected-roster panel's whole content, one entry per roster. */
  const rosterPanels = {};
  const factsById = {};
  for (const p of board.points) {
    const w = windowByRoster.get(p.rosterId);
    const windowText = w ? windowShort(w) : p.posture;
    const thesis = me && w ? windowThesis(me, w) : null;
    rosterPanels[String(p.rosterId)] = {
      rosterId: p.rosterId,
      n: p.n,
      name: p.name,
      isMe: p.isMe,
      ownerId: ownerIdOf(p.rosterId),
      tci: p.tci,
      posture: p.posture,
      fragility: p.fragility,
      fragilityBand: p.fragilityBand,
      window: windowText,
      quadrant: p.quadrant,
      quadrantLabel: QUADRANTS[p.quadrant].label,
      thesisQuad: QUADRANTS[p.quadrant].thesis,
      thesis,
      thesisRefusal: thesis ? null : w ? thesisRefusalFor(w) : null,
      moreFragileThan:
        board.points.length > 1
          ? Math.round(p.fragilityPercentile * (board.points.length - 1))
          : null,
      peers: board.points.length - 1,
      spofName: p.spofName,
      spofShare: p.spofShare != null ? Math.round(p.spofShare * 100) : null,
    };
    // The live region's sentence, and the ranking button's accessible name. One string,
    // so what is heard on landing on the control and what is heard when the selection
    // lands cannot drift apart.
    factsById[String(p.rosterId)] =
      `${p.name}${p.isMe ? ", your roster" : ""}. ` +
      `Window ${windowText}. TCI ${p.tci}, ${p.posture}. ` +
      `RFI ${p.fragility}, ${p.fragilityBand}. Row ${p.n} of ${board.points.length}.`;
  }
  /*
   * THE CROSSED READING - the one sentence on this page that needs both boards.
   *
   * `overlapFor(me).shared` (the window map) intersected with the quadrant's
   * above-median-fragility half. Both are computed on this page already and were never
   * crossed, and the crossing is a real statement: these rosters are dated into the same
   * seasons as the viewer AND their season runs through a shorter list of names than half
   * the league's.
   *
   * IT IS NOT `shared` x `splitTopHeavy`, which is what the obvious version of this idea
   * would be, and the arithmetic is why. A roster is only in `shared` if it has a
   * readable single window, which requires a posture other than straddling, which
   * requires TCI at or above the coherence floor of 55. `splitTopHeavy` requires TCI
   * below the league MEDIAN. So the two sets can only intersect in the sliver between 55
   * and a median that happens to exceed it - on the live league that is [55, 55.5), and
   * nothing is in it. Checked, not assumed: the intersection is empty, and it would be
   * empty on almost any league. The fragility half alone is orthogonal to the coherence
   * axis and therefore genuinely free, which is what makes this version a finding.
   *
   * A THESIS, NOT ADVICE (D6, D19). It names rosters and says where they sit. It does
   * not say they are vulnerable, does not say to trade with them, and states the median
   * as a median so nobody reads it as a bar somebody failed.
   */
  const crossedIds = (o?.shared ?? []).filter(
    (id) => (metricByRoster.get(id)?.fragility ?? -Infinity) > board.fragilityMid,
  );
  const one = crossedIds.length === 1;
  const crossed = crossedIds.length
    ? {
        rosters: crossedIds.map(chip),
        sentence:
          `${one ? "One roster is" : `${crossedIds.length} rosters are`} dated inside your ` +
          `seasons and ${one ? "sits" : "sit"} above this league's median on fragility - the ` +
          `same window as yours, and a season running through a shorter list of names than ` +
          `half the league's. That is where the two boards cross, and it is a position ` +
          `rather than a verdict: the median is a median, so half the league is above it ` +
          `by construction.`,
      }
    : null;
  /** The power ranking's rows, everything precomputed. */
  const rankingRows = ranked.map((r, i) => {
    const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
    const user = ownerId ? h.usersById.get(ownerId) : undefined;
    const f = form.get(r.rosterId);
    const m = metricByRoster.get(r.rosterId);
    const w = windowByRoster.get(r.rosterId);
    return {
      rosterId: r.rosterId,
      n: i + 1,
      isMe: r.rosterId === meId,
      name: r.teamName ?? r.ownerName,
      ownerName: r.ownerName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      record: f
        ? `${f.wins}-${f.losses}${f.isLive ? "" : " (last)"} · ${ordinal(f.rank)} of ${f.teams}`
        : `${r.record.wins}-${r.record.losses}`,
      age: `age ${r.coreAge ?? "-"}, ${r.coreAgeBand}`,
      // THE DEAD "-" FALLBACK IS GONE, and it was verified dead rather than assumed:
      // `windows.rows` is built from `h.rosters` and `leagueValueRanking` walks the same
      // array, so every ranked roster has a window row - measured at 14 of 14 on the
      // live league with zero misses. What made the dash worth removing rather than
      // leaving is that it was the SECOND dash for this value: `windowShort` itself
      // returned "-" for an unreadable roster until D95 replaced it with a code,
      // precisely because a stated refusal rendering as a missing number is a claim the
      // derivation declined to make.
      window: w ? windowShort(w) : null,
      tci: m?.tci ?? null,
      fragility: m?.fragility ?? null,
      posture: m?.posture ?? null,
      totalValue: r.totalValue,
      extraFirsts: r.picks.extraFirsts,
      pct: Math.max(3, Math.round((r.totalValue / leaderValue) * 100)),
      facts: factsById[String(r.rosterId)] ?? r.teamName ?? r.ownerName,
    };
  });
  return (
    <div>
      <PageHeader
        kicker={<span className="block line-clamp-1">{h.currentLeague.name}</span>}
        title="The League"
        aside={
          <OpenInSleeper
            href={sleeperLeagueUrl(h.currentLeague.leagueId)}
            label="Sleeper"
          />
        }
        below={
          <p className="mt-1 figure text-meta text-secondary">
            {h.currentLeague.totalRosters} teams · {h.chain.length} seasons ·{" "}
            {h.currentLeague.season} · {fmtValue(h.transactions.length)}{" "}
            transactions
          </p>
        }
      />

      {/* Suspense because the selection provider and the board read the query string
          through `useSearchParams`, the same contract /values' list is mounted under.
          This page is force-dynamic, so the boundary never actually suspends. One
          boundary around all three acts, because all three share the selection. */}
      <Suspense fallback={null}>
        <LeagueSelectionProvider
          myRosterId={meId ?? null}
          rosterIds={board.points.map((p) => p.rosterId)}
          factsById={factsById}
        >
          {/* ---------------- ACT ONE ---------------- */}
          <SectionHeader as="question" title="Where does your value land?" />
          <SeatCard seat={seat} />

          {/* ---------------- ACT TWO ---------------- */}
          <SectionHeader
            as="question"
            title="How does the league sit around you?"
            href="/methodology"
            cta="how TCI and RFI work"
          />
          <LeagueBoard
            windows={{
              rows: windows.rows.map((w) => ({
                rosterId: w.rosterId,
                n: nByRoster.get(w.rosterId) ?? 0,
                name: w.teamName ?? w.ownerName,
                isMe: w.isMe,
                state: w.state,
                // The refused row's own code and proof travel with it. This projection
                // used to drop them, which meant the chart's screen-reader label and the
                // sentence under it each had to reconstruct the reason from `state` - the
                // same word, two guesses at what it meant.
                refusal: w.refusal ?? null,
                open: w.open,
                peak: w.peak,
                close: w.close,
              })),
              first: windows.first,
              last: windows.last,
              currentSeason: windows.currentSeason,
              refusalSummary: windowRefusalSummary(windows.rows),
            }}
            view={board}
            crossed={crossed}
          />
          <SelectedRoster
            rosters={rosterPanels}
            myOwnerId={meId != null ? ownerIdOf(meId) : null}
          />

          {/* ---------------- ACT THREE ---------------- */}
          <SectionHeader
            as="question"
            title="Who do you talk to?"
            action={
              !seasonLive ? (
                <span className="min-w-0 shrink text-right text-meta leading-tight text-secondary">
                  records are last season&rsquo;s final
                </span>
              ) : undefined
            }
          />
          <p className="mb-1.5 text-meta leading-snug text-secondary">
            By roster value. Every figure both boards draw is on these rows, and
            picking one reads it on both.
          </p>
          <PowerRanking rows={rankingRows} />
        </LeagueSelectionProvider>
      </Suspense>

      <p className="mt-2 figure text-meta text-secondary">
        league value {fmtValue(leagueValue)} · median {fmtValue(median)}
      </p>

      {/* This is also /commissioner's first inbound link in the app's history, and
            the onward row is the right register for it: a page saying what THIS reader
            might want next can offer a commissioner-only tool without putting it in
            front of the twelve managers who cannot use it. The pill row that used to
            sit above the board could not make that distinction, which is part of why
            it is gone - see lib/nav.js. */}
      <Onward from="/league" />
    </div>
  );
}
