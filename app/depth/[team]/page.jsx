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
  depthChartFor,
  standingFor,
  teamsPresent,
  normalizeTeam,
} from "@/lib/depth";
import { teamName, teamShortName } from "@/lib/depth/teams";
import { readAnchorId } from "@/lib/depth/url";
import { depthOnwardSteps } from "@/lib/depth/onward";
import { Card, Disclosure, PageHeader, SectionHeader, Tag } from "@/components/ui";
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
            <p className="text-body leading-relaxed text-muted">
              {/* `{" "}` explicitly: JSX drops the space that follows an
                  expression at the end of a line, and without it this rendered
                  "Los Angeles Lakersin Sleeper's data" (caught by e2e, not by
                  eye). */}
              The player in this link is not on {teamName(abbr)}{" "}
              in Sleeper&apos;s data, so nothing below is about him. The chart
              itself is unaffected.
            </p>
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
              <p className="mt-1 text-body leading-relaxed text-muted">
                Sleeper places {chart.chartedCount} of{" "}
                {teamName(abbr)}&apos;s {chart.rosterCount} players on its depth
                chart. He is one of the {chart.rosterCount - chart.chartedCount}{" "}
                it does not, so there is nothing here about where he sits.
              </p>
              <RefusalMark className="mt-2">
                A missing entry is a gap in the source, not a statement about
                the player. Roughly one on-team player in five has none.
              </RefusalMark>
            </>
          )}
        </Card>
      )}

      {chart.groups.length === 0 ? (
        <Card>
          <p className="text-body leading-relaxed text-muted">
            Sleeper has no depth chart for {teamName(abbr)} right now.{" "}
            {chart.rosterCount > 0
              ? `Its ${chart.rosterCount} players are all listed below, unplaced.`
              : "It has no players in the payload either."}
          </p>
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
            />
            <Card>
              {/* A UL, not an OL. An ordered list would tell a screen reader these
                  are items 1 through 5, which is the exact ordinal this feature
                  refuses to publish: 43 of the live 149 groups contain a duplicate
                  order and 18 have no order 1 at all. */}
              <ul className="space-y-1">
                {group.entries.map((entry) => {
                  const own = holder(entry.playerId);
                  const href = valueHref(entry.playerId);
                  const isAnchor = entry.playerId === anchorId;
                  return (
                    <li
                      key={entry.playerId}
                      aria-current={isAnchor ? "true" : undefined}
                      className={
                        isAnchor
                          ? "rounded-[--radius-sm] border border-accent-edge bg-accent-wash px-2.5 py-1.5"
                          : "rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5"
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-semibold leading-tight text-ink">
                            {href ? (
                              <Link
                                href={href}
                                className="hover:text-accent-text"
                              >
                                {entry.name}
                              </Link>
                            ) : (
                              entry.name
                            )}
                          </span>
                          <span className="block truncate figure text-meta leading-tight text-secondary">
                            {entry.offPosition
                              ? `listed ${entry.listedPosition}`
                              : (entry.listedPosition ?? "position not stated")}
                            {entry.age != null ? ` · ${entry.age}y` : ""}
                            {entry.injuryStatus
                              ? ` · ${entry.injuryStatus}`
                              : ""}
                            {own
                              ? own.isMe
                                ? " · your roster"
                                : ` · ${own.name}`
                              : " · not held in this league"}
                          </span>
                        </span>
                        {own && !own.isMe && (
                          <Link
                            href={`/managers/${own.rosterId}`}
                            className="inline-flex min-h-11 shrink-0 items-center px-1 text-meta font-semibold text-accent-text"
                            aria-label={`${own.name}: read the dossier`}
                          >
                            Dossier
                          </Link>
                        )}
                        {isAnchor && <Tag tone="accent">Him</Tag>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {group.hasTies && (
                <p className="mt-1.5 text-meta leading-snug text-secondary">
                  Sleeper gives two or more of these the same order, so they are
                  level rather than ranked. The order they print in here is
                  alphabetical, which claims nothing.
                </p>
              )}
            </Card>
          </section>
        ))
      )}

      {chart.unplaced.length > 0 && (
        <section>
          <SectionHeader title={`Not placed · ${chart.unplaced.length}`} />
          <Card>
            <p className="mb-2 text-body leading-relaxed text-muted">
              On the roster, absent from the depth chart. Roughly one on-team
              player in five is, every night. That is a gap in the source and
              says nothing about any of them.
            </p>
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
                      <span className="block truncate text-body font-semibold leading-tight text-ink">
                        {href ? (
                          <Link href={href} className="hover:text-accent-text">
                            {entry.name}
                          </Link>
                        ) : (
                          entry.name
                        )}
                      </span>
                      <span className="block truncate figure text-meta leading-tight text-secondary">
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
        <p className="text-body leading-relaxed text-muted">
          This is Sleeper&apos;s depth chart, not Parquet&apos;s reading of one.
          Every name, position and order above came from the same
          <code className="mx-1 font-mono text-meta">/players/nba</code>
          payload the rest of the app is built on, and the league ownership
          beside each name is this league&apos;s own rosters.
        </p>
        <Disclosure summary="Where this chart can be wrong" className="mt-1">
          <p>
            Sleeper&apos;s orders are not ranks. Measured across the live
            payload, 116 of 149 team-and-position groups are non-contiguous (one
            team&apos;s centres come back 1, 2, 5), 43 contain two players on
            the same number, and 18 have nobody at 1 at all. So this page sorts
            by the order and never counts with it: no page in Parquet will tell
            you a player is &quot;third string&quot;, because on those groups
            that number would be arithmetic on something that was never a count.
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
            one are charted at a position other than the one they are listed
            at. Both are stated where they occur rather than smoothed over.
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
 * The anchored player's standing, in a sentence, and every branch of it is a fact
 * about the feed rather than a claim about the player.
 *
 * `level` is why this is prose and not a number: when Sleeper gives two players the
 * same order there is no ordinal to print, and inventing one would be the whole
 * mistake this feature was built to avoid.
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
    parts.push(
      `Sleeper lists ${s.ahead.length} ahead of him at ${pos} (${s.ahead
        .map((e) => e.name)
        .join(", ")})`,
    );
  }
  if (s.level.length > 0) {
    parts.push(
      `${s.level.length === 1 ? "one player is" : `${s.level.length} players are`} level with him on the same number (${s.level
        .map((e) => e.name)
        .join(", ")})`,
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
