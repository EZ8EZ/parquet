import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Lightbulb,
  ListOrdered,
  ThumbsDown,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import {
  convictionSummary,
  findTrades,
  partnerBoard,
  roomBand,
  roomBands,
  viewerAsset,
} from "@/lib/tradefinder";
import { readCustomOrder } from "@/lib/rankings/customOrderServer";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import {
  PageHeader,
  SectionHeader,
  Stat,
  Tag,
  DeltaValue,
  ButtonLink,
  Disclosure,
} from "@/components/ui";
import { DurationStrips } from "@/components/charts";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ManagerRail } from "@/components/ManagerRail";
import { Onward } from "@/components/Onward";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
const STANCE = {
  contend: { label: "Contend", tone: "accent" },
  ascend: { label: "Ascend", tone: "positive" },
  rebuild: { label: "Rebuild", tone: "info" },
  retool: { label: "Retool", tone: "warn" },
};
/*
 * THE BOARD IS GROUPED, NOT RANKED.
 *
 * It used to be one list sorted by mutual room with the top row's figure promoted into
 * a highlighted "best room" Stat tile, which is a leaderboard however carefully the
 * subtitle disclaims it - and this engine genuinely has no verdict to give. `mutual` is
 * the smaller of two fit gains computed from a clamped preference multiplier; ordering
 * fourteen rosters by it to two significant figures implies a precision it does not
 * have, and the top row implies a recommendation nothing computed.
 *
 * Grouping by TIMING carries the one fact that actually explains why a deal is possible:
 * two rosters that disagree about when they win want different assets. That is the
 * finder's own premise, printed as structure instead of as a sentence nobody reads. And
 * because the groups are not ordered against each other, the reader picks the group
 * their situation is in rather than the row the app put first.
 *
 * Inside a group: alphabetical, and the subhead says so. Any other within-group order
 * would smuggle the ranking back in one level down.
 */
const GROUPS = [
  {
    key: "opposite",
    title: "Opposite timelines",
    blurb:
      "Their value peaks in seasons yours does not. This is where room comes from: the same asset is worth different amounts to each of you.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === false,
  },
  {
    key: "same",
    title: "Same window as you",
    blurb:
      "You are bidding for the same seasons, so you want the same players. A deal here has to be a swap of shapes rather than of timing.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === true,
  },
  {
    key: "unreadable",
    title: "No window either way",
    blurb:
      "One of the two rosters has no single readable window, so there is no timing claim to make. The packages are roster fit only.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === null,
  },
];
export default async function TradeFinderPage({ searchParams }) {
  const {
    with: withParam,
    pkg: pkgParam,
    move: moveParam,
  } = await searchParams;
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return (
      <p className="text-muted">
        Couldn&apos;t identify your roster.{" "}
        <Link href="/teams" className="text-accent-text underline">
          Pick a team
        </Link>
        .
      </p>
    );
  }
  const principals = await getPrincipals(h);
  const partnerId = withParam ? Number(withParam) : null;
  if (
    partnerId != null &&
    (!Number.isInteger(partnerId) || partnerId === rosterId)
  ) {
    notFound();
  }
  /*
   * `move=` FORCES ONE OF YOUR OWN ASSETS INTO EVERY PACKAGE.
   *
   * The give pool is partner-driven by construction (see `searchPackages`), so an asset
   * nobody is asking for can be structurally invisible to every suggestion the finder
   * will ever make - including, most usefully, the asset /plan's own timeline check
   * already names as this roster's odd one out. This param is the way in.
   *
   * It is NEVER silent. A URL param that changed the results with no visible indicator
   * would leave a reader comparing two boards and unable to see why they differ, so
   * whenever it is set the chip below is rendered, it names the asset, and it carries a
   * link that clears it.
   */
  const move = typeof moveParam === "string" && moveParam ? moveParam : null;
  const moveAsset = move ? viewerAsset(h, rosterId, move) : null;
  // ------------------------------------------------------------ the board view
  if (partnerId == null) {
    const rows = partnerBoard(h, principals, rosterId, { move });
    const live = rows.filter((r) => r.mutual > 0);
    const opposite = live.filter((r) => r.sharesYourWindow === false);
    const bands = roomBands(rows.map((r) => r.mutual));
    const dead = rows.filter((r) => !(r.mutual > 0));
    return (
      <div>
        <PageHeader
          kicker="Trade finder"
          title="Where the room is."
          subtitle="Grouped by whether a leaguemate's value peaks in the same seasons yours does, because that is what makes a deal possible. Not ranked: this reads their behaviour and their holes alongside the values, and none of that adds up to a verdict about who to call first."
        />
        <MoveChip
          asset={moveAsset}
          requested={move}
          clearHref="/trade/finder"
          empty={move != null && live.length === 0}
        />
        {/*
         * A CENSUS, NOT A WINNER. The old second tile promoted one roster's `mutual`
         * into a highlighted figure, which read as the answer. Counts state the same
         * search's real output without electing anybody, the same correction D93 made
         * to /league's three tiles.
         */}
        <div className="grid grid-cols-2 gap-1.5">
          <Stat
            label="a package works both ways"
            value={`${live.length} of ${rows.length}`}
            sub={move && moveAsset ? `including ${moveAsset.label}` : "leaguemates"}
          />
          <Stat
            label="sit opposite your window"
            value={`${opposite.length} of ${live.length}`}
            sub="of those"
          />
        </div>

        {GROUPS.map((g) => {
          const group = byName(rows.filter(g.test));
          if (!group.length) return null;
          return (
            <section key={g.key}>
              <SectionHeader title={g.title} />
              <p className="-mt-1 mb-1.5 text-meta leading-snug text-secondary">
                {g.blurb} {group.length} team{group.length === 1 ? "" : "s"},
                alphabetically.
              </p>
              <ul className="space-y-1">
                {group.map((r) => (
                  <PartnerRow
                    key={r.rosterId}
                    r={r}
                    h={h}
                    bands={bands}
                    move={move}
                  />
                ))}
              </ul>
            </section>
          );
        })}

        {dead.length > 0 && (
          <>
            <SectionHeader title="Nothing clears the bar" />
            <Disclosure
              summary={`${dead.length} leaguemate${dead.length === 1 ? "" : "s"} with no package either way`}
            >
              <p className="mb-1.5">
                {move && moveAsset
                  ? `No package with these teams includes ${moveAsset.label} and still works for both sides. That is a real answer rather than an empty list.`
                  : "Either both rosters want the same things or the value does not line up. A forced offer here is a wasted ask."}
              </p>
              <ul className="space-y-1">
                {byName(dead).map((r) => (
                  <PartnerRow
                    key={r.rosterId}
                    r={r}
                    h={h}
                    bands={bands}
                    move={move}
                  />
                ))}
              </ul>
            </Disclosure>
          </>
        )}

        <p className="mt-1.5 text-meta leading-snug text-secondary">
          Room is the smaller of the two sides&apos; fit gain on the best package
          found, so it is a fit-adjusted difference rather than a value: the bands
          above are terciles of the rooms actually on this board, which makes them
          honestly relative and nothing more. Scoring on the smaller side is
          deliberate - if only one team gains, it is not a trade idea, it is a wish.
        </p>
        {/* Was a hand-kept chip row here. Same three destinations, from the registry
                now, so a rename or a route change cannot leave this page pointing at a
                name the destination no longer uses. */}
        <Onward from="/trade/finder" />
      </div>
    );
  }
  // ---------------------------------------------------------- one partner view
  // Read only on this branch: the partner board does not price individual packages,
  // so a ranking would have nothing to attach to there.
  const customOrder = await readCustomOrder();
  const result = findTrades(h, principals, {
    rosterId,
    partnerRosterId: partnerId,
    max: 3,
    customOrder,
    move,
  });
  if (!result) notFound();
  const hasRanking = customOrder.length > 0;
  const ownerId = h.rostersById.get(partnerId)?.ownerId;
  const user = ownerId ? h.usersById.get(ownerId) : undefined;
  const stance = STANCE[result.partner.stance];
  // Both proprietary metrics for both sides of the deal being contemplated. Same two
  // league-wide passes /league and the dossiers already run.
  const timelines = leagueTimelines(h);
  const fragility = leagueFragility(h);
  const theirTl = timelines.find((t) => t.rosterId === partnerId);
  const myTl = timelines.find((t) => t.rosterId === rosterId);
  const theirFr = fragility.find((f) => f.rosterId === partnerId);
  const myFr = fragility.find((f) => f.rosterId === rosterId);
  const selected = pkgParam
    ? result.packages.find((p) => p.id === pkgParam)
    : undefined;
  if (pkgParam && !selected) notFound();
  const keep = (extra) => {
    const p = new URLSearchParams({ with: String(partnerId), ...extra });
    if (move) p.set("move", move);
    return `/trade/finder?${p.toString()}`;
  };
  return (
    <div>
      <Link
        href={
          selected
            ? keep({})
            : move
              ? `/trade/finder?${new URLSearchParams({ move }).toString()}`
              : "/trade/finder"
        }
        className="mb-1 -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {selected ? "All ideas" : "All partners"}
      </Link>

      <PageHeader
        leading={
          <TeamAvatar
            name={result.partner.name}
            avatarId={user?.avatar}
            teamLogoUrl={user?.teamLogoUrl}
          />
        }
        kicker="Trade finder"
        title={result.partner.name}
      >
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Tag tone={stance.tone}>{stance.label}</Tag>
          {result.dossier.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      </PageHeader>

      <MoveChip
        asset={result.move?.asset ?? moveAsset}
        requested={move}
        clearHref={`/trade/finder?with=${partnerId}`}
        empty={move != null && result.packages.length === 0}
      />

      {/* The dossier's own words, not a paraphrase: this is the read the finder
            searched against, so the user can judge the premise before the packages. */}
      <div className="rounded-[--radius-sm] border border-border bg-surface p-2.5">
        <div className="flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-accent-text">
          <Lightbulb size={12} aria-hidden="true" />
          How to approach them
        </div>
        <p className="mt-1 text-note leading-snug text-muted">
          {result.dossier.approachTips[0]}
        </p>
        {/* The stance sentence, printed ONCE per partner. It used to be appended to
              every package's "why they say yes" list, which stated a fact about the
              partner three times on one screen (lib/tradefinder/index.js). */}
        <p className="mt-1 text-note leading-snug text-muted">
          {result.stanceNote}
        </p>
        <p className="mt-1 text-meta leading-snug text-secondary">
          Their holes:{" "}
          {result.partner.weakPositions.join(", ") || "none obvious"} · Their
          surplus: {result.partner.strongPositions.join(", ") || "none obvious"}{" "}
          · Your holes: {result.you.weakPositions.join(", ") || "none obvious"}
        </p>
        {/* Moved off the board's window line, which was clipping mid-word with this
              on the end of it. It reads better here anyway: a trade count is a fact
              about the partner you have already chosen, not a sort key. */}
        <p className="mt-1 figure text-meta leading-snug text-secondary">
          {result.dossier.profile.trades} completed trade
          {result.dossier.profile.trades === 1 ? "" : "s"} on record
          {result.partner.reluctant ? " · rarely trades" : ""}
        </p>

        {/*
         * BOTH PROPRIETARY METRICS, ON THE SURFACE WHERE THEY CHANGE A DECISION.
         * TCI and RFI were reported on /league and on the dossiers and were absent
         * from the one screen where a trade is actually being weighed - which made
         * them figures to admire rather than figures to use. Two rosters that agree
         * about WHEN they win have very little to trade; two that disagree have a
         * lot, and that is the single most useful thing to know before reading a
         * package. Both passes are already computed elsewhere in this app and are
         * cheap synchronous walks over data in hand (D25) - no new derivation.
         */}
        {theirTl && myTl && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 figure text-meta text-secondary">
              <span>
                them{" "}
                <span className="font-semibold text-ink">{theirTl.tci}</span>{" "}
                TCI · {theirTl.posture}
                {// `theirFr` is now always an object (leagueFragility answers for
                // every roster), so the guard has to be on the number, not the
                // object - `Math.round(null)` is 0, which would have printed the
                // exact fabricated-zero this app refuses to make elsewhere.
                theirFr?.fragility != null && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-semibold text-ink">
                      {Math.round(theirFr.fragility)}
                    </span>{" "}
                    RFI
                  </>
                )}
              </span>
              <span>
                you <span className="font-semibold text-ink">{myTl.tci}</span>{" "}
                TCI · {myTl.posture}
                {myFr?.fragility != null && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-semibold text-ink">
                      {Math.round(myFr.fragility)}
                    </span>{" "}
                    RFI
                  </>
                )}
              </span>
            </div>
            <p className="mt-1 text-meta leading-snug text-muted">
              {theirTl.posture === myTl.posture
                ? `You are both ${myTl.posture}. Two rosters pointed at the same season want the same players, so the room between you is narrow and any deal has to be a genuine swap of shapes rather than of timelines.`
                : `They are ${theirTl.posture} and you are ${myTl.posture}. That disagreement about when to win is where trade room comes from - the same asset is worth different amounts to each of you.`}
            </p>
          </div>
        )}

        <ManagerRail
          rosterId={partnerId}
          ownerId={ownerId ?? null}
          className="mt-1.5"
          omit={["/trade/finder"]}
        />
      </div>

      {selected ? (
        <PackageDetail pkg={selected} hasRanking={hasRanking} />
      ) : (
        <>
          <SectionHeader
            title={
              result.packages.length
                ? `${result.packages.length} package${result.packages.length === 1 ? "" : "s"} that work both ways`
                : "No package clears the bar"
            }
          />
          <ul className="space-y-2">
            {result.packages.map((p) => (
              <li key={p.id}>
                <Link
                  href={keep({ pkg: p.id })}
                  className="block min-h-11 rounded-[--radius] border border-border bg-surface p-3 transition-colors hover:border-accent-edge hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 font-display text-lede font-semibold leading-tight text-ink">
                      {p.headline}
                    </h3>
                    <ChevronRight
                      size={15}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-faint"
                    />
                  </div>
                  <div className="mt-2 space-y-1">
                    <AssetLine label="You send" assets={p.give} />
                    <AssetLine label="You get" assets={p.get} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 figure text-meta text-secondary">
                    <span>
                      value <DeltaValue n={p.evaluation.delta} /> (
                      {p.evaluation.deltaPct > 0 ? "+" : ""}
                      {p.evaluation.deltaPct}%)
                    </span>
                    <span>{p.evaluation.direction}</span>
                  </div>
                  {p.theirCase[0] && (
                    <p className="mt-1.5 text-note leading-snug text-muted">
                      <span className="font-semibold text-ink">
                        Why they say yes:{" "}
                      </span>
                      {p.theirCase[0]}
                    </p>
                  )}
                  <ConvictionLine notes={p.conviction} />
                  <FragilityLine note={p.fragility} />
                  <LeverageLine shift={p.leverageShift} />
                </Link>
              </li>
            ))}
          </ul>
          <WantLists mine={result.mine} theirs={result.theirs} />
        </>
      )}

      <ul className="mt-3 space-y-1">
        {result.caveats.map((c) => (
          <li key={c} className="text-meta leading-snug text-secondary">
            {c}
          </li>
        ))}
      </ul>

      <Onward from="/trade/finder" />
    </div>
  );
}
/** Alphabetical by team name, stated as such wherever it is used. */
function byName(rows) {
  return [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
/**
 * The `move=` indicator. Persistent while the param is set, and dismissable by the only
 * honest means available: a link that drops the param and re-runs the search without it.
 * "Dismiss the chip but keep the filter" would be the invisible state this exists to
 * prevent.
 */
function MoveChip({ asset, requested, clearHref, empty }) {
  if (!requested) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[--radius-sm] border border-info-edge bg-info-wash px-2.5 py-1.5">
      <span className="text-note leading-snug text-info">
        {asset ? (
          <>
            Only packages that include{" "}
            <span className="font-semibold">{asset.label}</span>
            {empty && " · none found"}
          </>
        ) : (
          <>That asset is not on your roster, so nothing here was filtered.</>
        )}
      </span>
      <Link
        href={clearHref}
        className="-my-2 ml-auto inline-flex min-h-11 items-center text-meta font-semibold text-info underline-offset-2 hover:underline"
      >
        clear
      </Link>
    </div>
  );
}
/**
 * One leaguemate. The window line was `truncate` and then `line-clamp-2`, and was still
 * carrying four facts (window, whether it shares yours, every behaviour tag, and a trade
 * count) on one string - which is why it clipped mid-word on real cards whatever the
 * clamp. It is now a LABELLED micro-row with a hard cap of two tags plus a "+N", and the
 * trade count moved to the partner view. Structure rather than a third clamp.
 */
function PartnerRow({ r, h, bands, move }) {
  const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
  const user = ownerId ? h.usersById.get(ownerId) : undefined;
  const stance = STANCE[r.stance];
  const shown = r.tags.slice(0, 2);
  const extra = r.tags.length - shown.length;
  // The constraint travels with the click. Dropping `move` here would silently widen
  // the search one tap after a chip promised it was narrowed.
  const params = new URLSearchParams({ with: String(r.rosterId) });
  if (move) params.set("move", move);
  return (
    <li>
      <Link
        href={`/trade/finder?${params.toString()}`}
        className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <TeamAvatar
          name={r.name}
          avatarId={user?.avatar}
          teamLogoUrl={user?.teamLogoUrl}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 line-clamp-1 text-body font-semibold leading-tight text-ink">
              {r.name}
            </span>
            <Tag tone={stance.tone}>{stance.label}</Tag>
          </span>
          {/* Two lines rather than one: a package name is the whole point of
              the row, and truncating it to "Stephon Castle + Onyeka Ok..."
              tells the reader nothing. */}
          <span className="mt-0.5 block text-meta leading-snug text-muted line-clamp-2">
            {r.bestIdea ?? "Nothing clears the bar right now."}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-micro uppercase tracking-wide text-faint">
              window
            </span>
            <span className="figure text-micro text-secondary">
              {r.valueWindow}
            </span>
            {shown.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border px-1.5 text-micro text-faint"
              >
                {t}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-micro text-faint">+{extra}</span>
            )}
          </span>
        </span>
        <RoomMeter mutual={r.mutual} bands={bands} />
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
/**
 * THE COARSE METER THAT REPLACED AN EXACT FIGURE.
 *
 * `room` was printed with `fmtValue` in `text-accent-text` - the formatter for real
 * value-in-model-units figures, in the colour that means "you" everywhere else in the
 * app. It is neither. It is the smaller of two fit gains, each a sum of league values
 * scaled by a clamped appetite multiplier, so its third digit is noise and its units
 * are not comparable with anything else on the row. Three bands off this board's own
 * terciles say what the number can honestly support; the exact figure survives in
 * exactly one place, the package detail footer, with a `~` and a definition.
 *
 * Neutral ink rather than accent: this is a property of the pairing, not of the viewer.
 */
function RoomMeter({ mutual, bands }) {
  const band = roomBand(mutual, bands);
  const filled = band === "narrow" ? 1 : band === "real" ? 2 : band === "wide" ? 3 : 0;
  return (
    <span className="shrink-0 text-right">
      <span className="flex items-end justify-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${i < filled ? "bg-ink/55" : "bg-border"}`}
            style={{ height: `${5 + i * 3}px` }}
          />
        ))}
      </span>
      <span className="mt-0.5 block text-micro uppercase tracking-wide text-faint">
        {band ? `${band} room` : mutual > 0 ? "room" : "no room"}
      </span>
    </span>
  );
}
/**
 * WHAT EACH SIDE WANTS FROM THE OTHER - the two lists the search already built.
 *
 * `price()` returns every asset on a roster, valued through both sides' appetites and
 * sorted by gap. `searchPackages` took a ten-item and a six-item slice off the front of
 * these and `findTrades` returned neither, so the most legible output of the whole pass
 * was computed on every request and thrown away on every request.
 *
 * RANKED, AND THE SUBHEAD SAYS ON WHAT. A package ranking would be a verdict on a whole
 * hypothetical deal (D6); a gap is one subtraction between two numbers this app already
 * publishes, per asset, and it makes no claim about whether to trade the asset.
 *
 * STACKED, NEVER SIDE BY SIDE. At 390px each column would be ~150px and every row here
 * is a name plus a reason phrase, which needs the full width - the lesson D72 and the
 * board's own window line already paid for twice.
 */
function WantLists({ mine, theirs }) {
  return (
    <>
      <WantList
        title="What they want from you"
        subtitle="Ordered by how much more they would pay for it than you would - the gap, not a suggestion that you move it."
        rows={mine}
      />
      <WantList
        title="What you want from them"
        subtitle="Same subtraction, the other way round: how much more you would pay than they would."
        rows={theirs}
      />
    </>
  );
}
const TOP_WANTS = 5;
function WantList({ title, subtitle, rows }) {
  const wanted = rows.filter((p) => p.gap > 0);
  if (!wanted.length) return null;
  const top = wanted.slice(0, TOP_WANTS);
  const rest = wanted.slice(TOP_WANTS);
  return (
    <>
      <SectionHeader title={title} />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-secondary">
        {subtitle}
      </p>
      <ul className="divide-y divide-border rounded-[--radius-sm] border border-border bg-surface">
        {top.map((p) => (
          <WantRow key={p.asset.id} p={p} />
        ))}
      </ul>
      {rest.length > 0 && (
        <Disclosure summary={`${rest.length} more`} className="mt-0.5">
          <ul className="divide-y divide-border">
            {rest.map((p) => (
              <WantRow key={p.asset.id} p={p} />
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}
function WantRow({ p }) {
  const a = p.asset;
  const meta =
    a.kind === "pick"
      ? "draft pick"
      : [a.position, a.age != null ? `${a.age}` : null]
          .filter(Boolean)
          .join(" · ");
  /*
   * EVERY reason the TAKER has for wanting it, not the first one.
   *
   * A negative reason is pushback and never an argument (the same rule `pros`/`cons`
   * keep in the engine), so those never land here. Taking only the first read badly for
   * a real reason rather than an aesthetic one: `perceive` emits its tells in a fixed
   * order, so the positional one wins almost every time and five consecutive rows all
   * said "fills their thinnest spot at SF" - the list looked like a bug and hid the
   * facts (age, prime, a manager's habit) that actually differ row to row.
   */
  const reason =
    p.taker.reasons
      .filter((r) => r.sign > 0)
      .map((r) => r.text)
      .join(" · ") || null;
  return (
    <li className="px-2.5 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 line-clamp-1 text-note font-semibold text-ink">
          {a.label}
        </span>
        <span className="shrink-0 figure text-micro text-faint">{meta}</span>
      </div>
      {/*
       * `line-clamp-2`, NOT `truncate`. D72's finding, re-confirmed by the board's own
       * window line one screen back: a reason phrase cut mid-word ("fills their
       * thinnest spot at...") tells the reader strictly less than nothing, because they
       * cannot tell whether the missing half changes the meaning.
       */}
      <p className="mt-0.5 text-meta leading-snug text-muted line-clamp-2">
        {reason ??
          "No stated fit reason - the gap here is the difference in what the two of you already price him at."}
      </p>
    </li>
  );
}
function AssetLine({ label, assets }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[62px] shrink-0 text-micro uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-note leading-snug text-ink">
        {assets.map((a, i) => (
          <span key={a.id}>
            {i > 0 && <span className="text-secondary"> + </span>}
            {a.label}
            <span className="figure text-meta text-secondary">
              {" "}
              {fmtValue(a.value)}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}
/**
 * One line on a package card, so the viewer's own ranking is visible BEFORE they
 * drill into a package rather than only after. Renders nothing at all when there is
 * no gap to report, which is also what a viewer with no saved ranking gets.
 */
function ConvictionLine({ notes }) {
  const summary = convictionSummary(notes);
  if (!summary) return null;
  return (
    <p
      className={`mt-1.5 text-note leading-snug ${summary.verdict === "supports" ? "text-accent-text" : "text-warn"}`}
    >
      {summary.text}
    </p>
  );
}
/**
 * The one fragility fact a package can honestly state, on the card rather than only in
 * the detail: whether the season ends up leaning less on one name, or more.
 *
 * Both directions get the SAME neutral treatment on purpose. Concentrating value into
 * one better player is a move this app recommends elsewhere (D32) and it necessarily
 * raises this number, so colouring "creates" as a warning would contradict the finder's
 * own advice one line below it. The words carry the direction; the colour does not.
 */
function FragilityLine({ note }) {
  if (!note) return null;
  const share = Math.round(note.after.damageShare * 100);
  return (
    <p className="mt-1.5 text-note leading-snug text-muted">
      <span className="font-semibold text-ink">
        {note.direction === "relieves"
          ? "Leans less on one man: "
          : "Leans more on one man: "}
      </span>
      {note.after.name} at {share}% of startable value afterwards, from{" "}
      {Math.round(note.before.damageShare * 100)}% on {note.before.name} today.
    </p>
  );
}
/**
 * The one Positional Leverage fact a package can honestly state (D75): what accepting
 * it would do to the viewer's OWN score, at whichever position(s) it actually moves -
 * never the other thirteen rosters', and never printed at all when the package leaves
 * the score exactly where /lab/leverage already reads it (see `LEVERAGE_SHIFT_MIN`).
 *
 * A number and the position(s) it moved at, nothing about whether that move is good -
 * the same discipline `FragilityLine` above already keeps (D6, D19). Up and down get
 * identical neutral treatment for the identical reason: this is a supply-side shape
 * read, not a grade, and gaining leverage at a position nobody wants to deal with you
 * about is not obviously a win any more than losing it at one you were never trading
 * from is obviously a cost.
 */
function LeverageLine({ shift }) {
  if (!shift) return null;
  const posList =
    shift.positions.length > 1
      ? `${shift.positions.slice(0, -1).join(", ")} and ${shift.positions.at(-1)}`
      : shift.positions[0];
  return (
    <p className="mt-1.5 text-note leading-snug text-muted">
      <span className="font-semibold text-ink">Positional Leverage: </span>
      {shift.before} to {shift.after}, at {posList}.
    </p>
  );
}
/**
 * The viewer's own ranking as a distinct class of evidence.
 *
 * Kept in its own block rather than folded into "Why it helps you" on purpose: every
 * other line in this rationale is derived from rosters and behaviour, and this one is
 * derived from an opinion the viewer typed in themselves. Mixing the two would make
 * it impossible to tell which lines you are allowed to disagree with.
 */
function ConvictionBlock({ notes, hasRanking }) {
  // Three genuinely different states, and the difference matters: no ranking at all,
  // a ranking that simply does not touch this package, and real gaps to report.
  if (!hasRanking) {
    /*
     * THE SECOND "RANK THE BOARD" CTA IS GONE. This branch used to render a bordered
     * card with its own button, two screens above the identical CTA the Onward registry
     * already prints on this same page - the same destination, twice, on one scroll. The
     * teaching sentence is the part that was doing work, so it stays and the link is
     * folded into it as inline text.
     */
    return (
      <>
        <SectionHeader title="Against your own ranking" />
        <p className="text-note leading-snug text-muted">
          You have not{" "}
          <Link href="/rank" className="text-accent-text underline">
            ranked anyone
          </Link>{" "}
          yet, so every value here is consensus only. Rank a board and this
          package will show you where you and consensus disagree about the
          players in it.
        </p>
      </>
    );
  }
  if (notes.length === 0) {
    return (
      <>
        <SectionHeader title="Against your own ranking" />
        <p className="text-note leading-snug text-muted">
          Your board and consensus agree closely on everyone in this package, so
          there is no edge here either way.
        </p>
      </>
    );
  }
  return (
    <>
      <SectionHeader title="Against your own ranking" />
      <ul className="space-y-1">
        {notes.map((n) => (
          <li
            key={`${n.side}-${n.playerId}`}
            className={`flex gap-1.5 rounded-[--radius-sm] border px-2.5 py-1.5 text-note leading-snug text-muted ${
              n.verdict === "supports"
                ? "border-accent-edge bg-accent-wash"
                : "border-warn/25 bg-warn/10"
            }`}
          >
            <ListOrdered
              size={12}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${n.verdict === "supports" ? "text-accent-text" : "text-warn"}`}
            />
            {n.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-meta leading-snug text-secondary">
        Every value on this page is built from consensus ranks, which is what
        makes the comparison meaningful. Your ranking annotates the packages
        here; it does not reprice them, so a package this page suggests still
        prices identically on{" "}
        <Link href="/trade" className="text-accent-text underline">
          the hand-built trade page
        </Link>
        .
      </p>
    </>
  );
}
function PackageDetail({ pkg, hasRanking }) {
  const e = pkg.evaluation;
  return (
    <>
      <h2 className="mt-4 font-display text-lede font-semibold leading-tight text-ink">
        {pkg.headline}
      </h2>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat
          label="you send"
          value={fmtValue(e.give.total)}
          sub={`${pkg.give.length} assets`}
        />
        <Stat
          label="you get"
          value={fmtValue(e.get.total)}
          sub={`${pkg.get.length} assets`}
        />
        <Stat
          label="net"
          value={<DeltaValue n={e.delta} />}
          sub={`${e.deltaPct > 0 ? "+" : ""}${e.deltaPct}% · ${e.direction}`}
          tone={e.delta >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="mt-2 grid gap-1.5">
        <AssetTable title="You send" side={e.give} />
        <AssetTable title="You get" side={e.get} />
      </div>

      {/*
       * THE LINK `tradeHref` WAS WRITTEN FOR.
       *
       * Only here, and deliberately not on the board's list rows: each of those rows is
       * one big <Link>, so a second interactive control inside it would be a nested
       * interactive element - a real accessibility bug rather than a styling problem.
       * This view is plain content, so a button belongs.
       */}
      <div className="mt-2 rounded-[--radius-sm] border border-border bg-surface p-2.5">
        <ButtonLink href={pkg.builderHref}>
          Open this package in the builder
          <ArrowRight size={14} aria-hidden="true" />
        </ButtonLink>
        <p className="mt-1.5 text-meta leading-snug text-secondary">
          Loads these exact assets into /trade pre-filled, where you can add or
          drop pieces and re-price the whole thing. Nothing is sent anywhere -
          the link is the package, so it also survives being shared or bookmarked.
        </p>
      </div>

      <AfterTrade pt={pkg.postTrade} />

      <SectionHeader title="Why they say yes" />
      <Bullets lines={pkg.theirCase} />

      <SectionHeader title="Why it helps you" />
      <Bullets lines={pkg.yourCase} />

      <ConvictionBlock notes={pkg.conviction} hasRanking={hasRanking} />

      {pkg.pushback.length > 0 && (
        <>
          <SectionHeader title="What they will push back on" />
          <ul className="space-y-1">
            {pkg.pushback.map((l) => (
              <li
                key={l}
                className="flex gap-1.5 rounded-[--radius-sm] border border-warn/25 bg-warn/10 px-2.5 py-1.5 text-note leading-snug text-muted"
              >
                <ThumbsDown
                  size={12}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-warn"
                />
                {l}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Neither a pro nor a con, and filed under neither heading for exactly that
            reason - see `windowThesis` on SuggestedPackage. It sits between the two
            cases and the bet because it is the condition both of them are priced under. */}
      {pkg.windowThesis && (
        <p className="mt-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5 text-note leading-snug text-ink/85">
          <span className="mr-1 text-meta font-semibold uppercase tracking-wide text-secondary">
            Timing
          </span>
          {pkg.windowThesis}
        </p>
      )}

      {/* The thesis, straight from the evaluator /trade uses. A suggested package and
            a hand-built one must read the same way, so this is not re-derived here. */}
      <SectionHeader title="The bet" />
      <div className="space-y-1.5">
        <Read label="Your bet" text={e.yourBet} />
        <Read label="Their bet" text={e.theirBet} />
        <Read
          label="The assumption that must hold"
          text={e.keyAssumption}
          accent
        />
        {e.consolidationNote && (
          <Read label="Consolidation" text={e.consolidationNote} />
        )}
        <Read label="Against your own record" text={e.historyCheck} />
        {pkg.fragility && (
          <Read
            label={
              pkg.fragility.direction === "relieves"
                ? "What it takes off one man"
                : "What it puts on one man"
            }
            text={pkg.fragility.text}
          />
        )}
        {pkg.leverageShift && (
          <Read
            label="Positional leverage"
            text={<LeverageShiftText shift={pkg.leverageShift} />}
          />
        )}
      </div>

      {/*
       * THE ONE EXACT ROOM FIGURE IN THE APP.
       *
       * `~` because it is an approximation by construction, and unformatted rather than
       * through `fmtValue` because that formatter is for real value-in-model-units
       * figures and this is not one. Not `text-accent-text` either: gold means "you"
       * everywhere else, and this is a property of the pairing.
       */}
      <p className="mt-2 border-t border-border pt-1.5 figure text-meta leading-snug text-secondary">
        Room ~{Math.round(pkg.fit.mutual)} - the smaller of the two sides&apos; fit
        gain (yours ~{Math.round(pkg.fit.yours)}, theirs ~
        {Math.round(pkg.fit.theirs)}). A fit-adjusted difference on a clamped
        preference multiplier, not a value: read it as a size, never as an amount.
      </p>
    </>
  );
}
/**
 * AFTER THIS TRADE - the roster's own timeline, either side of the package.
 *
 * The highest-value thing this feature can say, and it is a reading rather than a
 * recommendation: whether the asset the package sends is the SAME asset the roster's own
 * timeline already names as its odd one out (lib/metrics/duration.js,
 * `findTimelineBreak`). That function's docstring is explicit that the named asset is
 * very often the roster's best player and that holding one while a young core matures is
 * a real strategy, not a mistake - so the copy here states a coincidence of diagnoses
 * and stops. It never says the trade fixes anything, and the inverse case (the deal
 * IMPORTS the outlier, TCI falls) gets the identical register and no colour.
 */
function AfterTrade({ pt }) {
  if (!pt) return null;
  const { before: b, after: a, departingBreak, arrivingBreak } = pt;
  const core = pt.coreDurationWithoutDeparting;
  const coreAfter = pt.coreDurationWithoutArriving;
  const windows =
    b.window?.state === "window" && a.window?.state === "window"
      ? { b: b.window, a: a.window }
      : null;
  const label =
    `Two duration strips, x-axis seasons out. Today: TCI ${b.tci}, value centred ${b.rosterDuration.toFixed(1)} seasons out, ` +
    `plus or minus one standard deviation of ${b.dispersion.toFixed(2)} seasons. After this trade: TCI ${a.tci}, centred ` +
    `${a.rosterDuration.toFixed(1)} seasons out, band ${a.dispersion.toFixed(2)} seasons.` +
    (departingBreak
      ? ` ${departingBreak.label}, at ${departingBreak.duration.toFixed(1)} seasons out, is the asset this roster's own timeline names as its odd one out, and this package sends him.`
      : "") +
    (arrivingBreak
      ? ` ${arrivingBreak.label}, arriving at ${arrivingBreak.duration.toFixed(1)} seasons out, would become the asset the roster's timeline reads as its odd one out.`
      : "");
  return (
    <>
      <SectionHeader title="After this trade" />
      <div className="rounded-[--radius-sm] border border-border bg-surface p-2.5">
        <div className="flex items-baseline gap-1.5 figure text-lede font-semibold leading-tight text-ink">
          <span className="text-meta font-semibold uppercase tracking-wide text-secondary">
            TCI
          </span>
          <span>{b.tci}</span>
          <ArrowRight size={13} aria-hidden="true" className="text-faint" />
          <span>{a.tci}</span>
        </div>
        <p className="mt-1 text-meta leading-snug text-secondary">
          Timeline Coherence is 1 minus the value-weighted spread of your assets&apos;
          durations over a three-season reference, so the band behind the dots below
          IS this number: narrower band, higher figure.
        </p>

        {departingBreak && (
          <p className="mt-1.5 border-t border-border pt-1.5 text-note leading-snug text-ink/85">
            The piece you are sending is the one your own timeline reads as the odd
            one out - {departingBreak.label},{" "}
            {departingBreak.duration.toFixed(1)} seasons
            {core != null ? ` against a core at ${core.toFixed(1)}` : ""}. That is
            a coincidence of two readings, not a verdict: the odd one out is often a
            roster&apos;s best player, and holding one while a younger core matures is
            a deliberate strategy rather than an error. What it says is that the deal
            and the diagnosis are pointing at the same asset.
          </p>
        )}
        {arrivingBreak && (
          <p className="mt-1.5 border-t border-border pt-1.5 text-note leading-snug text-ink/85">
            This deal brings one in: {arrivingBreak.label} would become the asset
            your timeline reads as the odd one out,{" "}
            {arrivingBreak.duration.toFixed(1)} seasons
            {coreAfter != null ? ` against a core at ${coreAfter.toFixed(1)}` : ""}.
            Same register as above - buying one misaligned piece on purpose is a real
            strategy, and this is the number it costs, not a reason to refuse.
          </p>
        )}

        <div className="mt-1.5">
          <DurationStrips assets={pt.assets} before={b} after={a} label={label} />
        </div>
        <p className="mt-0.5 text-micro leading-snug text-faint">
          One dot per asset, sized by value; dashed line is the value-weighted
          centre; the shaded band is ±1σ. Hollow on &quot;after&quot; = leaving,
          solid = arriving.
        </p>

        {windows && (
          <p className="mt-1.5 text-meta leading-snug text-secondary">
            The middle half of your value sits {windows.b.open}-{windows.b.close}{" "}
            today and {windows.a.open}-{windows.a.close} afterwards, peaking{" "}
            {windows.b.peak} then {windows.a.peak}.
          </p>
        )}
      </div>
    </>
  );
}
/**
 * The expanded-view wording for the same fact `LeverageLine` states on the card - the
 * link to `/lab/leverage` earns its place here rather than on the card, since this is
 * the one screen a reader can actually stop on to read the rest of the metric's own
 * caveats before deciding what the number means for this package.
 */
function LeverageShiftText({ shift }) {
  const posList =
    shift.positions.length > 1
      ? `${shift.positions.slice(0, -1).join(", ")} and ${shift.positions.at(-1)}`
      : shift.positions[0];
  return (
    <>
      This deal would move your{" "}
      <Link href="/lab/leverage" className="text-accent-text underline">
        Positional Leverage
      </Link>{" "}
      from {shift.before} to {shift.after}, at {posList} - where your own value sits
      relative to the league&apos;s own mix there, not a read on the deal itself.
    </>
  );
}
function Bullets({ lines }) {
  return (
    <ul className="space-y-1">
      {lines.map((l) => (
        <li key={l} className="flex gap-1.5 text-note leading-snug text-muted">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1 shrink-0 rounded-full bg-accent"
          />
          {l}
        </li>
      ))}
    </ul>
  );
}
function Read({ label, text, accent }) {
  return (
    <div
      className={
        accent
          ? "rounded-[--radius-sm] border border-accent-edge bg-accent-wash p-2.5"
          : "rounded-[--radius-sm] border border-border bg-surface p-2.5"
      }
    >
      <div
        className={`text-micro font-semibold uppercase tracking-wide ${accent ? "text-accent-text" : "text-faint"}`}
      >
        {label}
      </div>
      <p className="mt-0.5 text-note leading-snug text-muted">{text}</p>
    </div>
  );
}
function AssetTable({ title, side }) {
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-micro uppercase tracking-wide text-faint">
          {title}
        </span>
        <span className="figure text-meta text-muted">
          {fmtValue(side.total)}
          {side.avgAge != null && ` · avg ${side.avgAge}`}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {side.assets.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 line-clamp-1 text-note text-ink">
              {a.label}
            </span>
            {a.tier && (
              <span className="shrink-0 text-micro text-faint">{a.tier}</span>
            )}
            {a.age != null && (
              <span className="shrink-0 figure text-micro text-faint">
                {a.age}
              </span>
            )}
            <span className="shrink-0 figure text-note font-semibold text-ink">
              {fmtValue(a.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
