/**
 * ONE NBA TEAM'S DEPTH CHART, at its own address, anchored on the player you came from.
 *
 * WHY THIS SURFACE EXISTS HERE AND NOT SOMEWHERE ELSE. The question a dynasty manager
 * has is player-shaped ("is my guy behind someone?") but the ANSWER is team-shaped:
 * it is fifteen names in five groups, and twelve of them are usually players nobody in
 * the league owns. Three placements were on the table and this is why the other two
 * lost:
 *
 *   An in-row expansion on /values and /roster. Those rows already expand
 *   (`ValueAssetRow`), and a whole team's chart is 12-19 names in 5 groups - at 390px
 *   that is a row that grows to a screen and a half, and it would destroy the one
 *   property the expansion is FOR ("open three rows and compare"). What does fit in a
 *   row is the one-line fact, so that is exactly what went there, with a link here.
 *
 *   A new /player/[playerId] page. The app already has a player-anchored page -
 *   /lineage/[assetKey], which carries his crest, name, position, age, value and tier
 *   in its header - so a second one would be two surfaces about one subject, which is
 *   the failure DECISIONS.md keeps recording (D62's one mark everywhere, the /drafts
 *   label drift). And a depth chart is not a fact about a player: it is a fact about
 *   his team that mentions him. Keying the route by team keeps one page per chart
 *   instead of nineteen pages showing the same fifteen names.
 *
 * So the team is the path and the player is the lens - `?player=`, the same split
 * /values?focus= already uses.
 *
 * WHAT IT REFUSES TO SAY. Everything here is Sleeper's own published chart, sorted,
 * with the league's ownership joined onto it. Nothing on this page says what a slot
 * means for minutes, role, or value, because a depth-chart feed cannot support that
 * claim (D19: refuse the inference, publish the gap; D6: theses, never grades). The
 * reader gets the fact and its age and draws their own conclusion - which is also why
 * the freshness line is not optional chrome: 559 of 593 live records carry a
 * `news_updated`, and they range from hours old to three years old.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import {
  chartRefusal,
  depthChartFor,
  standingFor,
  standingRefusal,
  teamsPresent,
  normalizeTeam,
  unplacedRefusal,
} from "@/lib/depth";
import { refusalSentence } from "@/lib/refusal";
import { teamName, teamShortName } from "@/lib/depth/teams";
import { readAnchorId } from "@/lib/depth/url";
import { depthOnwardSteps } from "@/lib/depth/onward";
import { Card, Disclosure, PageHeader, SectionHeader } from "@/components/ui";
import { DepthLadder, OwnershipStrip } from "@/components/DepthLadder";
import { Onward } from "@/components/Onward";
import { RefusalMark } from "@/components/RefusalMark";
import { TeamLogo } from "@/components/TeamLogo";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperPlayerUrl } from "@/lib/sleeperLinks";
import { LocalDate } from "@/components/LocalDate";
import { valuesFocusHref } from "@/lib/values/url";
import { cachedValuePlayers } from "@/lib/valuation";
export const dynamic = "force-dynamic";
export default async function DepthChartPage({ params, searchParams }) {
  const { team: raw } = await params;
  const abbr = normalizeTeam(decodeURIComponent(raw ?? ""));
  const anchorId = readAnchorId(await searchParams);
  const h = await getLeagueHistory();
  // THE DATA DECIDES WHETHER THE ROUTE EXISTS, never the name table in
  // lib/depth/teams.js: a team Sleeper starts reporting under a code we have not
  // heard of still gets a page (headed by the code), and a code nobody plays for is
  // a 404 rather than an empty chart pretending to be one.
  if (!teamsPresent(h.players).includes(abbr)) notFound();
  const chart = depthChartFor(h.players, abbr);
  const standing = standingFor(chart, anchorId);
  const anchor = anchorId ? h.players.get(anchorId) : undefined;
  const anchorOnTeam = !!anchor && normalizeTeam(anchor.team) === abbr;
  // Ownership in THIS league, which is the whole reason this chart lives in Parquet
  // rather than being a link to Sleeper: an NBA depth chart is public, "and three of
  // these five are held in your league, one of them by you" is not.
  const ownerOf = new Map();
  for (const r of h.rosters) {
    for (const pid of r.players) ownerOf.set(pid, r.rosterId);
  }
  /** @param {string} playerId */
  function holder(playerId) {
    const rosterId = ownerOf.get(playerId);
    if (rosterId == null) return null;
    const roster = h.rostersById.get(rosterId);
    const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;
    return {
      rosterId,
      isMe: rosterId === h.me.rosterId,
      name: user?.teamName ?? user?.displayName ?? `Roster ${rosterId}`,
    };
  }
  // Only link a name onward when the destination actually has something to show: a
  // fringe NBA player with no value never appears on /values, and a link that lands
  // on nothing is worse than plain text.
  const values = cachedValuePlayers(h);
  /** @param {string} playerId */
  const valueHref = (playerId) => {
    const v = values.get(playerId);
    return v && v.value > 0 ? valuesFocusHref(playerId) : null;
  };
  const anchorHolder = anchorId ? holder(anchorId) : null;
  return (
    <div>
      <PageHeader
        kicker="Depth chart"
        leading={<TeamLogo team={abbr} size="lg" />}
        title={teamShortName(abbr) || abbr}
        subtitle={
          <>
            Sleeper&apos;s own depth chart for {teamName(abbr)}, the same data
            their app shows. Sorted by their order, never ranked by it.
          </>
        }
        below={
          <p className="mt-1 figure text-meta text-secondary">
            <span className="font-semibold text-ink">{chart.chartedCount}</span>{" "}
            of {chart.rosterCount} players placed
            {chart.newestRecord != null && (
              <>
                {" · newest record "}
                <LocalDate ts={chart.newestRecord} />
              </>
            )}
            {chart.oldestRecord != null &&
              chart.oldestRecord !== chart.newestRecord && (
                <>
                  {" · oldest "}
                  <LocalDate ts={chart.oldestRecord} />
                </>
              )}
          </p>
        }
      />

      {/* THE ANCHOR, first, because it is the question the reader arrived with. */}
      {anchorId && (
        <Card className="mb-3">
          {!anchorOnTeam ? (
            /* NOT THE SAME NOTHING as the case below, and it used to render as
               though it were. `standingRefusal` returned one `SOURCE_GAP` for both
               "on this team, absent from the chart" and "not on this team", carrying
               THIS team's placement counts either way - so the second case produced a
               sentence claiming Sleeper's chart for this team "does not place" a
               player who was never on it. Nothing caught it because this branch ran
               first and the refusal was never reached. The distinction is in the code
               now (`NO_RECORD` vs `SOURCE_GAP`), so the ordering of these two branches
               is a layout choice again rather than the thing keeping the page honest. */
            <RefusalMark>
              <span className="text-body leading-relaxed text-muted">
                {refusalSentence(standingRefusal(chart, anchorId))}
              </span>
            </RefusalMark>
          ) : standing ? (
            <>
              <h2 className="font-display text-lede leading-tight font-semibold text-ink">
                {anchor?.fullName}
              </h2>
              <p className="mt-1 text-body leading-relaxed text-muted">
                {standingSentence(standing, anchor?.fullName ?? "He")}
              </p>
              {standing.entry.offPosition && (
                <p className="mt-1.5 text-body leading-relaxed text-muted">
                  Sleeper lists him as a{" "}
                  <span className="font-semibold text-ink">
                    {standing.entry.listedPosition}
                  </span>{" "}
                  and charts him at{" "}
                  <span className="font-semibold text-ink">
                    {standing.position}
                  </span>
                  . Both are theirs; the chart&apos;s own position is the one
                  this page groups by.
                </p>
              )}
              <RefusalMark className="mt-2">
                Where a player sits on a depth chart is not a claim about his
                minutes, his role or his value, and this page does not make one.
              </RefusalMark>
              <div className="mt-2">
                <OpenInSleeper
                  href={sleeperPlayerUrl(anchorId)}
                  label="See him in Sleeper"
                />
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-lede leading-tight font-semibold text-ink">
                {anchor?.fullName ?? "This player"}
              </h2>
              {/* ONE STATEMENT, from the module that knows the condition. This was a
                  body paragraph with the counts interpolated here, plus a mark
                  underneath carrying the caveat - two elements saying one thing, and
                  the counts and the caveat could be separated by a copy-paste. The
                  refusal is `SOURCE_GAP` and it comes from lib/depth with its numbers
                  already in it; the mark is the drawn half of the same object. */}
              <RefusalMark className="mt-2">
                <span className="text-body leading-relaxed text-muted">
                  {refusalSentence(standingRefusal(chart, anchorId))}
                </span>
              </RefusalMark>
            </>
          )}
        </Card>
      )}

      {chart.groups.length === 0 ? (
        /* The whole-team gap, as a code rather than a sentence. This was prose that
           named the team and counted its players, which is the same information the
           register carries with a token in front of it and the withheld figure ("0 of
           17") attached - and unlike the prose it survives being read aloud or pasted
           into a chat, which is the entire argument of lib/refusal.js. */
        <Card>
          <RefusalMark>
            <span className="text-body leading-relaxed text-muted">
              {refusalSentence(chartRefusal(chart))}
            </span>
          </RefusalMark>
        </Card>
      ) : (
        chart.groups.map((group) => (
          <section key={group.position}>
            <SectionHeader
              title={
                group.standard
                  ? `${group.position} · ${group.entries.length}`
                  : `${group.position} · ${group.entries.length} (not one of the five)`
              }
              action={
                <OwnershipStrip entries={group.layers.flat()} holder={holder} />
              }
            />
            <Card>
              <DepthLadder
                group={group}
                anchorId={anchorId}
                holder={holder}
                valueHref={valueHref}
              />
            </Card>
          </section>
        ))
      )}

      {chart.unplaced.length > 0 && (
        <section>
          <SectionHeader title={`Not placed · ${chart.unplaced.length}`} />
          <Card>
            {/* Same condition as the single-player refusal above, counted once for
                the section instead of once per name, and carrying the same withheld
                figure. It was a paragraph holding the base rate in prose - the right
                fact in a channel that does not survive being copied out. */}
            <RefusalMark className="mb-2">
              <span className="text-body leading-relaxed text-muted">
                {refusalSentence(unplacedRefusal(chart))}
              </span>
            </RefusalMark>
            <ul className="space-y-1">
              {chart.unplaced.map((entry) => {
                const own = holder(entry.playerId);
                const href = valueHref(entry.playerId);
                return (
                  <li
                    key={entry.playerId}
                    className="flex items-center gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-1 text-body font-semibold leading-tight text-ink">
                        {href ? (
                          <Link href={href} className="hover:text-accent-text">
                            {entry.name}
                          </Link>
                        ) : (
                          entry.name
                        )}
                      </span>
                      <span className="block line-clamp-1 figure text-meta leading-tight text-secondary">
                        {entry.listedPosition ?? "position not stated"}
                        {own
                          ? own.isMe
                            ? " · your roster"
                            : ` · ${own.name}`
                          : " · not held in this league"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      <SectionHeader title="Where this chart comes from" />
      <Card>
        {/* The paragraph that used to open this card said "this is Sleeper's depth
            chart, not Parquet's reading of one" - which is the page subtitle, three
            inches above, at three times the length. The Disclosure below is the
            caveat layer and stays whole. */}
        <Disclosure summary="Where this chart can be wrong">
          <p>
            Sleeper&apos;s orders are not ranks, and this page draws them as
            rungs rather than rows for that reason. Measured across the live
            payload, 117 of 149 team-and-position groups are non-contiguous (one
            team&apos;s centres come back 1, 2, 5), 44 put two or more players
            on the same number, and 18 have nobody at 1 at all - so on those 18
            the top rung is nobody&apos;s starter, which is why no rung on this
            page is styled as first and no number is printed beside any of them.
            Players sharing a number share a rung; a gap in the numbers is not
            drawn as an empty slot, because the number was never a count.
          </p>
          <p className="mt-1.5">
            It can also simply be stale. Each record carries the time Sleeper
            last touched it, and those range from hours to years old; the two
            dates at the top of this page are the freshest and stalest on this
            team. A chart that has not moved since last season will still render
            here, looking exactly as current as one that moved this morning.
          </p>
          <p className="mt-1.5">
            And it is incomplete by construction: about one on-team player in
            five has no entry at all, and a quarter of the players who do have
            one are charted at a position other than the one they are listed at.
            Both are stated where they occur rather than smoothed over.
          </p>
        </Disclosure>
      </Card>

      <Onward
        steps={depthOnwardSteps({
          playerId: anchorOnTeam ? anchorId : null,
          ownerRosterId: anchorHolder?.rosterId ?? null,
          ownedByViewer: anchorHolder?.isMe ?? false,
        })}
      />
    </div>
  );
}
/**
 * The anchored player's standing as COUNTS, and every branch of it is a fact about the
 * feed rather than a claim about the player.
 *
 * WHY THE NAMES CAME OUT. This sentence used to name the players in each list - "Sleeper
 * lists 2 ahead of him at C (Walker Kessler, Sandro Mamukelashvili)" - and the ladder
 * naming the same two men sits about 90px below it. Two copies of one list, and the
 * ladder is the better copy: it shows the relation as geometry, marks who holds each
 * man, and links each name onward. The counts are what the ladder cannot say in one
 * breath, so the counts are what stayed.
 *
 * WHY THE SENTENCE DID NOT GO WITH THEM. It is the only channel that survives leaving
 * the screen. A reader who copies this card into a group chat, or hears it read aloud,
 * or reads it before the ladder has painted, gets "Sleeper lists 2 ahead of him at C,
 * and 1 level with him on the same number" - a complete answer with no geometry in it.
 * Deleting the sentence entirely would have made the page's whole reading visual, which
 * is the failure lib/refusal.js was written about one layer down.
 *
 * `level` is still why this counts rather than ranks: when Sleeper gives two players the
 * same order there is no ordinal to print, and inventing one would be the whole mistake
 * this feature was built to avoid.
 *
 * @param {import('@/lib/depth').DepthStanding} s
 * @param {string} name
 */
function standingSentence(s, name) {
  const pos = s.position;
  if (s.unplacedInOrder) {
    return `Sleeper places ${name} at ${pos} but gives him no order there, so this chart cannot say who is ahead of him.`;
  }
  const parts = [];
  if (s.ahead.length === 0) {
    parts.push(`Sleeper lists nobody ahead of him at ${pos}`);
  } else {
    parts.push(`Sleeper lists ${s.ahead.length} ahead of him at ${pos}`);
  }
  if (s.level.length > 0) {
    parts.push(
      `${s.level.length === 1 ? "one player is" : `${s.level.length} players are`} level with him on the same number`,
    );
  }
  if (s.behind.length > 0) {
    parts.push(`${s.behind.length} behind`);
  }
  if (s.unordered.length > 0) {
    parts.push(
      `${s.unordered.length} more at the position with no order given, so they sit outside the comparison`,
    );
  }
  return `${parts.join(", and ")}.`;
}
