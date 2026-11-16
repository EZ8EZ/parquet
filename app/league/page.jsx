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
import { refusal, refusalSentence, refusalShort } from "@/lib/refusal";
import { LeagueBoard } from "@/components/LeagueBoard";
import { LeagueSelectionProvider } from "@/components/LeagueSelection";
import { PowerRanking } from "@/components/PowerRanking";
import { SeatCard } from "@/components/SeatCard";
import { SelectedRoster } from "@/components/SelectedRoster";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip, Disclosure, PageHeader, RankStrip, StatTile, Tabs } from "@/components/ui";
import { fmtValue } from "@/lib/ui";
import { ordinal } from "@/lib/derive/describe";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperLeagueUrl } from "@/lib/sleeperLinks";
import { Onward } from "@/components/Onward";
import { Standings } from "@/components/league/Standings";
import { TabIndex } from "@/components/TabIndex";
import { standingsRows } from "@/lib/league/standings";
export const dynamic = "force-dynamic";
/**
 * THE LEAGUE. The first screen answers "where do I stand?": your place, points for and
 * value rank as tiles, then the standings as tappable rows (detail in a bottom sheet).
 * Power ranking and the window boards sit behind segmented tabs and share one
 * selection (`?roster=`, lib/league/url.js). Every string a selection can produce is
 * built here on the server so what is heard and what is seen cannot drift. The posture
 * census that once led this page stays retired (SHELVED.md S12).
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
  const standings = standingsRows({
    forms: form,
    ranked,
    users: h.usersById,
    rostersById: h.rostersById,
    meId,
  });
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
  // The board drops a refused fragility read entirely (it has no coordinate to plot -
  // see buildQuadrantView), but the power ranking below is a list, not a chart, and a
  // list can still carry a row for every roster. So it joins against the RAW pass
  // rather than the board's filtered one, the same way `windowByRoster` already does
  // for TCI's own refused states.
  const fragilityByRoster = new Map(fragility.map((f) => [f.rosterId, f]));
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
    const frag = fragilityByRoster.get(r.rosterId);
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
      // A refused fragility read prints its code the same way a refused window
      // already does above - never the bare number's absence, which reads as a
      // missing value rather than a stated refusal.
      fragility: frag?.fragility ?? (frag?.refusal ? refusalShort(frag.refusal) : null),
      posture: m?.posture ?? null,
      totalValue: r.totalValue,
      extraFirsts: r.picks.extraFirsts,
      pct: Math.max(3, Math.round((r.totalValue / leaderValue) * 100)),
      facts: factsById[String(r.rosterId)] ?? r.teamName ?? r.ownerName,
    };
  });
  const detailsById = Object.fromEntries(rankingRows.map((r) => [r.rosterId, r]));
  const mine = standings.me;
  const season = standings.season ?? h.currentLeague.season;
  return (
    <div>
      <PageHeader
        kicker={h.currentLeague.name}
        title="League"
        aside={<OpenInSleeper href={sleeperLeagueUrl(h.currentLeague.leagueId)} label="Sleeper" />}
        below={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{h.currentLeague.totalRosters} teams</Chip>
            <Chip>
              {season}
              {standings.hasRecords && !standings.isLive ? " final" : ""}
            </Chip>
            <Chip>{h.chain.length} seasons on record</Chip>
          </div>
        }
      />

      {mine && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Your place"
            value={standings.hasRecords && mine.rank ? ordinal(mine.rank) : "–"}
            sub={
              standings.hasRecords && mine.wins != null
                ? `${mine.wins}-${mine.losses} record`
                : "no games yet"
            }
            visual={standings.hasRecords ? <RankStrip rank={mine.rank} of={standings.rows.length} /> : null}
          />
          <StatTile
            label="Points for"
            value={mine.pointsFor != null ? Math.round(mine.pointsFor).toLocaleString("en-US") : "–"}
            sub={mine.pfRank ? `${ordinal(mine.pfRank)} most` : "no games yet"}
            visual={mine.pfRank ? <RankStrip rank={mine.pfRank} of={standings.rows.length} /> : null}
          />
          <StatTile
            label="Value rank"
            value={ordinal(mine.valueRank)}
            sub="by asset value"
            href="/roster"
            visual={<RankStrip rank={mine.valueRank} of={standings.rows.length} />}
          />
        </div>
      )}

      {/* One selection is shared by the power ranking and both boards (?roster=). */}
      <Suspense fallback={null}>
        <LeagueSelectionProvider
          myRosterId={meId ?? null}
          rosterIds={board.points.map((p) => p.rosterId)}
          factsById={factsById}
        >
          <Tabs
            className="mt-5"
            variant="segmented"
            label="League views"
            items={[
              {
                id: "standings",
                label: "Standings",
                content: (
                  <>
                    <Standings standings={standings} details={detailsById} />
                    <p className="mt-2 px-1 text-meta text-secondary">
                      {standings.hasRecords
                        ? `${season}${standings.isLive ? "" : " final"} · tap a team for its detail`
                        : "No games yet, so ordered by asset value · tap a team for its detail"}
                    </p>
                  </>
                ),
              },
              {
                id: "power",
                label: "Power",
                content: (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-3 px-1">
                      <p className="figure text-meta text-secondary">
                        By roster value · median {fmtValue(median)}
                      </p>
                      {!seasonLive && (
                        <p className="text-right text-meta text-secondary">records are last season&rsquo;s</p>
                      )}
                    </div>
                    <PowerRanking rows={rankingRows} />
                    <Disclosure className="mt-1" summary="How the power ranking works">
                      Rosters ordered by total asset value (league total {fmtValue(leagueValue)}).
                      Each row carries the same window, TCI and fragility figures the Windows
                      boards draw, and selecting one reads it on both boards.
                    </Disclosure>
                  </>
                ),
              },
              {
                id: "windows",
                label: "Windows",
                content: (
                  <>
                    <SeatCard seat={seat} />
                    <div className="mt-3">
                      <LeagueBoard
                        windows={{
                          rows: windows.rows.map((w) => ({
                            rosterId: w.rosterId,
                            n: nByRoster.get(w.rosterId) ?? 0,
                            name: w.teamName ?? w.ownerName,
                            isMe: w.isMe,
                            state: w.state,
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
                    </div>
                    <SelectedRoster rosters={rosterPanels} myOwnerId={meId != null ? ownerIdOf(meId) : null} />
                    <Link
                      href="/methodology"
                      className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text"
                    >
                      How TCI and RFI work
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </>
                ),
              },
            ]}
          />
        </LeagueSelectionProvider>
      </Suspense>

      <TabIndex tab="league" section="Record" title="Record" className="mt-6" />
      <TabIndex tab="league" section="History" title="History" className="mt-5" />

      <Onward from="/league" />
    </div>
  );
}
