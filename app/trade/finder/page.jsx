import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ListOrdered, X } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import {
  convictionSummary,
  findTrades,
  partnerBoard,
  roomBand,
  roomBands,
  viewerAssets,
} from "@/lib/tradefinder";
import { readCustomOrder } from "@/lib/rankings/customOrderServer";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import {
  ButtonLink,
  Card,
  Chip,
  Delta,
  Disclosure,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  StatTile,
  Tabs,
} from "@/components/ui";
import { DurationStrips } from "@/components/charts";
import { PostureGlyph } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ManagerRail } from "@/components/ManagerRail";
import { Onward } from "@/components/Onward";
import { fmtValue } from "@/lib/ui";
/**
 * TRADE FINDER. The board answers "who has room for a deal with me?": a census of
 * partners where a package works both ways, grouped (never ranked) by timing in tabs.
 * A partner opens their packages as cards, each with both sides' assets and values
 * and one action; a package opens its detail. All pricing comes from lib/tradefinder.
 */
export const dynamic = "force-dynamic";
/* A stance is a category, not a grade: neutral chips, the word carries it. */
const STANCE = {
  contend: { label: "Contend" },
  ascend: { label: "Ascend" },
  rebuild: { label: "Rebuild" },
  retool: { label: "Retool" },
};
/*
 * THE BOARD IS GROUPED, NOT RANKED. `mutual` is the smaller of two fit gains on a
 * clamped preference multiplier; ordering rosters by it would imply a precision and a
 * recommendation nothing computed. Grouping by TIMING carries the fact that explains
 * why a deal is possible, and inside a group the order is alphabetical.
 */
const GROUPS = [
  {
    key: "opposite",
    title: "Opposite",
    blurb:
      "Their value peaks in seasons yours does not. This is where room comes from: the same asset is worth different amounts to each of you.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === false,
  },
  {
    key: "same",
    title: "Same window",
    blurb:
      "You are bidding for the same seasons, so you want the same players. A deal here has to be a swap of shapes rather than of timing.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === true,
  },
  {
    key: "unreadable",
    title: "No window",
    blurb:
      "One of the two rosters has no single readable window, so there is no timing claim to make. The packages are roster fit only.",
    test: (r) => r.mutual > 0 && r.sharesYourWindow === null,
  },
];
export default async function TradeFinderPage({ searchParams }) {
  const { with: withParam, pkg: pkgParam, move: moveParam } = await searchParams;
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return (
      <p className="text-body text-muted">
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
  if (partnerId != null && (!Number.isInteger(partnerId) || partnerId === rosterId)) {
    notFound();
  }
  /*
   * `move=` FORCES ONE OR TWO OF YOUR OWN ASSETS INTO EVERY PACKAGE (D114: a correlated
   * pair is a comma-joined id list). It is NEVER silent: whenever it is set the chip
   * names every asset and carries a link that clears it. All-or-nothing, matching
   * `partnerBoard`'s own gating, so a partial resolve never claims a constraint the
   * search did not apply.
   */
  const move = typeof moveParam === "string" && moveParam ? moveParam : null;
  const moveResolved = move ? viewerAssets(h, rosterId, move) : [];
  const moveAssets = moveResolved.length && moveResolved.every(Boolean) ? moveResolved : [];
  // ------------------------------------------------------------ the board view
  if (partnerId == null) {
    const rows = partnerBoard(h, principals, rosterId, { move });
    const live = rows.filter((r) => r.mutual > 0);
    const opposite = live.filter((r) => r.sharesYourWindow === false);
    const bands = roomBands(rows.map((r) => r.mutual));
    const dead = rows.filter((r) => !(r.mutual > 0));
    const tabs = GROUPS.map((g) => ({ g, group: byName(rows.filter(g.test)) }))
      .filter(({ group }) => group.length > 0)
      .map(({ g, group }) => ({
        id: g.key,
        label: g.title,
        count: group.length,
        content: (
          <>
            <PartnerList rows={group} h={h} bands={bands} move={move} label={g.title} />
            <Disclosure className="mt-1" summary="Why this group">
              {g.blurb} Listed alphabetically.
            </Disclosure>
          </>
        ),
      }));
    if (dead.length > 0) {
      tabs.push({
        id: "none",
        label: "No room",
        count: dead.length,
        content: (
          <>
            <p className="mb-2 text-note text-muted">
              {move && moveAssets.length
                ? `No package includes ${namesOf(moveAssets)} and works for both sides.`
                : "No package works either way."}
            </p>
            <PartnerList rows={byName(dead)} h={h} bands={bands} move={move} label="No room" />
          </>
        ),
      });
    }
    return (
      <div>
        <PageHeader kicker="Trade" title="Trade finder" subtitle="Who has room for a deal with you" />
        <MoveChip assets={moveAssets} requested={move} clearHref="/trade/finder" empty={move != null && live.length === 0} />
        {/* A CENSUS, NOT A WINNER: counts of the search's real output (D93). */}
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Works both ways"
            value={`${live.length} of ${rows.length}`}
            sub={move && moveAssets.length ? `including ${namesOf(moveAssets)}` : "leaguemates"}
          />
          <StatTile label="Opposite window" value={`${opposite.length} of ${live.length}`} sub="of those" />
        </div>

        {tabs.length > 0 && <Tabs className="mt-4" variant="segmented" label="Partners by timing" items={tabs} />}

        <Disclosure className="mt-2" summary="How room is measured">
          Room is the smaller of the two sides&apos; fit gain on the best package found, so
          it is a fit-adjusted difference rather than a value: the bands are terciles of the
          rooms actually on this board, honestly relative and nothing more. Scoring on the
          smaller side is deliberate: if only one team gains, it is not a trade idea, it is
          a wish.
        </Disclosure>
        <Onward from="/trade/finder" />
      </div>
    );
  }
  // ---------------------------------------------------------- one partner view
  // Read only on this branch: the partner board does not price individual packages.
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
  // Both proprietary metrics for both sides, from the same league-wide passes /league
  // and the dossiers already run (D25).
  const timelines = leagueTimelines(h);
  const fragility = leagueFragility(h);
  const theirTl = timelines.find((t) => t.rosterId === partnerId);
  const myTl = timelines.find((t) => t.rosterId === rosterId);
  const theirFr = fragility.find((f) => f.rosterId === partnerId);
  const myFr = fragility.find((f) => f.rosterId === rosterId);
  const selected = pkgParam ? result.packages.find((p) => p.id === pkgParam) : undefined;
  if (pkgParam && !selected) notFound();
  const keep = (extra) => {
    const p = new URLSearchParams({ with: String(partnerId), ...extra });
    if (move) p.set("move", move);
    return `/trade/finder?${p.toString()}`;
  };
  // `result.move` is priced through THIS partner's appetite, so it wins whenever a
  // move was requested; null reads as "none", never a fallback guess.
  const chipAssets = result.move ? (result.move.assets ?? []) : moveAssets;
  return (
    <div>
      <Link
        href={selected ? keep({}) : move ? `/trade/finder?${new URLSearchParams({ move }).toString()}` : "/trade/finder"}
        className="-ml-1 -mt-2 inline-flex min-h-11 items-center gap-1.5 px-1 text-note font-semibold text-secondary transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {selected ? "All packages" : "All partners"}
      </Link>

      <PageHeader
        leading={<TeamAvatar name={result.partner.name} avatarId={user?.avatar} teamLogoUrl={user?.teamLogoUrl} />}
        kicker="Trade finder"
        title={result.partner.name}
        subtitle={`${result.dossier.profile.trades} trade${result.dossier.profile.trades === 1 ? "" : "s"} on record${result.partner.reluctant ? " · rarely trades" : ""}`}
        below={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{stance.label}</Chip>
            {theirTl && (
              <Chip>
                <PostureGlyph posture={theirTl.posture} />
                {theirTl.posture}
              </Chip>
            )}
          </div>
        }
      />

      <MoveChip
        assets={chipAssets}
        requested={move}
        clearHref={`/trade/finder?with=${partnerId}`}
        empty={move != null && result.packages.length === 0}
      />

      {selected ? (
        <PackageDetail pkg={selected} hasRanking={hasRanking} />
      ) : (
        <>
          <SectionHeader
            className="mt-2"
            title={
              result.packages.length
                ? `${result.packages.length} package${result.packages.length === 1 ? "" : "s"} that work both ways`
                : "No package clears the bar"
            }
          />
          <ul className="space-y-2" aria-label="Packages">
            {result.packages.map((p) => (
              <li key={p.id}>
                <PackageCard p={p} href={keep({ pkg: p.id })} />
              </li>
            ))}
          </ul>
          <WantTabs mine={result.mine} theirs={result.theirs} />
        </>
      )}

      {/* The dossier's own words and both rosters' metrics: the premise the finder
          searched against, one tap away rather than above the packages. */}
      <Disclosure className="mt-4" summary="How to approach them">
        <p className="text-ink">{result.dossier.approachTips[0]}</p>
        <p className="mt-2">{result.stanceNote}</p>
        <p className="mt-2">
          Their holes: {result.partner.weakPositions.join(", ") || "none obvious"} · Their
          surplus: {result.partner.strongPositions.join(", ") || "none obvious"} · Your
          holes: {result.you.weakPositions.join(", ") || "none obvious"}
        </p>
        {theirTl && myTl && (
          <>
            <p className="mt-2 figure">
              Them: TCI {theirTl.tci} · {theirTl.posture}
              {theirFr?.fragility != null && ` · RFI ${Math.round(theirFr.fragility)}`}
              <br />
              You: TCI {myTl.tci} · {myTl.posture}
              {myFr?.fragility != null && ` · RFI ${Math.round(myFr.fragility)}`}
            </p>
            <p className="mt-2">
              {theirTl.posture === myTl.posture
                ? `You are both ${myTl.posture}. Two rosters pointed at the same season want the same players, so the room between you is narrow and any deal has to be a swap of shapes rather than of timelines.`
                : `They are ${theirTl.posture} and you are ${myTl.posture}. That disagreement about when to win is where trade room comes from: the same asset is worth different amounts to each of you.`}
            </p>
          </>
        )}
      </Disclosure>
      <ManagerRail rosterId={partnerId} ownerId={ownerId ?? null} className="mt-1" omit={["/trade/finder"]} />

      {result.caveats.length > 0 && (
        <Disclosure className="mt-2" summary="Caveats">
          <ul className="space-y-1.5">
            {result.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Onward from="/trade/finder" />
    </div>
  );
}
/** Alphabetical by team name, stated as such wherever it is used. */
function byName(rows) {
  return [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function namesOf(assets) {
  return assets.map((a) => a.label).join(" and ");
}
/** The `move=` constraint, never silent: names the assets and links to clear it. */
function MoveChip({ assets, requested, clearHref, empty }) {
  if (!requested) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-control bg-info-wash py-1 pl-3 pr-1">
      <span className="min-w-0 flex-1 text-note text-info">
        {assets.length ? (
          <>
            Only packages with <span className="font-semibold">{namesOf(assets)}</span>
            {empty && " · none found"}
          </>
        ) : (
          <>{requested.includes(",") ? "Those assets are" : "That asset is"} not on your roster, so nothing was filtered.</>
        )}
      </span>
      <Link
        href={clearHref}
        aria-label="Clear the asset filter"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-info hover:bg-surface-2"
      >
        <X size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
function roomText(mutual, bands) {
  const band = roomBand(mutual, bands);
  return band ? `${band} room` : mutual > 0 ? "room" : "no room";
}
function PartnerList({ rows, h, bands, move, label }) {
  return (
    <List aria-label={label}>
      {rows.map((r) => {
        const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
        const user = ownerId ? h.usersById.get(ownerId) : undefined;
        // The constraint travels with the click (never silently widened).
        const params = new URLSearchParams({ with: String(r.rosterId) });
        if (move) params.set("move", move);
        return (
          <li key={r.rosterId}>
            <ListRow
              href={`/trade/finder?${params.toString()}`}
              avatar={<TeamAvatar name={r.name} avatarId={user?.avatar} teamLogoUrl={user?.teamLogoUrl} size="sm" />}
              title={r.name}
              badge={<Chip size="sm">{STANCE[r.stance].label}</Chip>}
              meta={`${r.bestIdea ?? "Nothing clears the bar right now"} · window ${r.valueWindow}`}
              valueSub={roomText(r.mutual, bands)}
              value=""
            />
          </li>
        );
      })}
    </List>
  );
}
/** One side of a package: its assets with values, and the total. */
function SideAssets({ label, assets, total }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2 p-3">
      <p className="text-meta font-medium text-secondary">{label}</p>
      <p className="figure text-lede font-bold text-ink">{fmtValue(total)}</p>
      <ul className="mt-1 space-y-1">
        {assets.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-2 text-note">
            <span className="min-w-0 text-ink">{a.label}</span>
            <span className="shrink-0 figure text-secondary">{fmtValue(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
/** A package as a card: both sides, the net, the board line, one action. */
function PackageCard({ p, href }) {
  const e = p.evaluation;
  const summary = convictionSummary(p.conviction);
  return (
    <Card pad="sm">
      <h3 className="px-1 text-body font-semibold text-ink">{p.headline}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SideAssets label="You send" assets={p.give} total={e.give.total} />
        <SideAssets label="You get" assets={p.get} total={e.get.total} />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 px-1 text-note text-muted">
        <span>Net</span>
        <Delta n={e.delta} className="text-note" />
        <span className="figure">
          ({e.deltaPct > 0 ? "+" : ""}
          {e.deltaPct}%) · {e.direction}
        </span>
      </p>
      {/* Your board against the model (lib/tradefinder/conviction), one line. */}
      {summary && (
        <p className="mt-1 flex items-start gap-1.5 px-1 text-note text-muted">
          <ListOrdered size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
          {summary.text}
        </p>
      )}
      <ButtonLink href={href} variant="secondary" block className="mt-3">
        See the deal
        <ArrowRight size={16} aria-hidden="true" />
      </ButtonLink>
    </Card>
  );
}
const TOP_WANTS = 5;
function WantTabs({ mine, theirs }) {
  const items = [
    { id: "theirs-want", label: "They want", rows: mine, note: "How much more they would pay for it than you would: the gap, not a suggestion to move it." },
    { id: "you-want", label: "You want", rows: theirs, note: "Same subtraction the other way round: how much more you would pay than they would." },
  ]
    .map((t) => ({ ...t, wanted: t.rows.filter((p) => p.gap > 0) }))
    .filter((t) => t.wanted.length > 0)
    .map((t) => ({
      id: t.id,
      label: t.label,
      count: t.wanted.length,
      content: (
        <>
          <List aria-label={t.label}>
            {t.wanted.slice(0, TOP_WANTS).map((p) => (
              <WantRow key={p.asset.id} p={p} />
            ))}
          </List>
          {t.wanted.length > TOP_WANTS && (
            <Disclosure className="mt-1" summary={`${t.wanted.length - TOP_WANTS} more`} bodyClassName="p-0 bg-transparent">
              <List>
                {t.wanted.slice(TOP_WANTS).map((p) => (
                  <WantRow key={p.asset.id} p={p} />
                ))}
              </List>
            </Disclosure>
          )}
          <Disclosure className="mt-1" summary="How this is ordered">
            {t.note}
          </Disclosure>
        </>
      ),
    }));
  if (!items.length) return null;
  return (
    <>
      <SectionHeader title="Who wants what" />
      <Tabs variant="segmented" label="Who wants what" items={items} />
    </>
  );
}
function WantRow({ p }) {
  const a = p.asset;
  const meta = a.kind === "pick" ? "Draft pick" : [a.position, a.age != null ? `${a.age}` : null].filter(Boolean).join(" · ");
  const reason =
    p.taker.reasons
      .filter((r) => r.sign > 0)
      .map((r) => r.text)
      .join(" · ") || "No stated fit reason: the gap is the difference in what the two of you price him at.";
  return (
    <li>
      <ListRow title={a.label} meta={`${meta} · ${reason}`} />
    </li>
  );
}
function PackageDetail({ pkg, hasRanking }) {
  const e = pkg.evaluation;
  const caseTabs = [
    { id: "their-case", label: "Their case", lines: pkg.theirCase },
    { id: "your-case", label: "Your case", lines: pkg.yourCase },
    { id: "pushback", label: "Pushback", lines: pkg.pushback },
  ]
    .filter((t) => t.lines.length > 0)
    .map((t) => ({ id: t.id, label: t.label, count: t.lines.length, content: <Bullets lines={t.lines} /> }));
  return (
    <>
      <h2 className="mt-2 text-lede font-semibold text-ink">{pkg.headline}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile size="sm" label="You send" value={fmtValue(e.give.total)} sub={`${pkg.give.length} assets`} />
        <StatTile size="sm" label="You get" value={fmtValue(e.get.total)} sub={`${pkg.get.length} assets`} />
        {/* The net in ink with a signed arrow: value gained is not the verdict (D6). */}
        <StatTile
          size="sm"
          label="Net"
          value={`${e.delta > 0 ? "+" : ""}${fmtValue(e.delta)}`}
          sub={`${e.deltaPct > 0 ? "+" : ""}${e.deltaPct}% · ${e.direction}`}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <AssetSide title="You send" side={e.give} />
        <AssetSide title="You get" side={e.get} />
      </div>
      <ButtonLink href={pkg.builderHref} block className="mt-3">
        Open in the builder
        <ArrowRight size={16} aria-hidden="true" />
      </ButtonLink>
      <p className="mt-1 text-center text-meta text-secondary">Prefills /trade. Nothing is sent.</p>

      <AfterTrade pt={pkg.postTrade} />

      {caseTabs.length > 0 && (
        <>
          <SectionHeader title="The case" />
          <Tabs variant="segmented" label="The case" items={caseTabs} />
        </>
      )}

      {/* Neither a pro nor a con: the condition both cases are priced under. */}
      {pkg.windowThesis && (
        <Card pad="sm" className="mt-3">
          <p className="text-meta text-secondary">Timing</p>
          <p className="text-note text-ink">{pkg.windowThesis}</p>
        </Card>
      )}

      <ConvictionBlock notes={pkg.conviction} hasRanking={hasRanking} />

      {/* The thesis, straight from the evaluator /trade uses, so a suggested package
          and a hand-built one read the same way. */}
      <Disclosure className="mt-3" summary="The bet" bodyClassName="space-y-3">
        <Read label="Your bet" text={e.yourBet} />
        <Read label="Their bet" text={e.theirBet} />
        <Read label="The assumption that must hold" text={e.keyAssumption} />
        {e.consolidation ? (
          <Read
            label="Consolidation"
            text={e.consolidation.note.split(" (D117).")[0] + " (D117)."}
            numbers={[
              `${e.consolidation.side === "you" ? "You get" : "They get"} top: ${e.consolidation.bestAsset.name} ${Math.round(e.consolidation.bestAsset.value).toLocaleString()}`,
              `In ${e.consolidation.countIn} · ${Math.round(e.consolidation.sumGet).toLocaleString()}`,
              `Out ${e.consolidation.countOut} · ${Math.round(e.consolidation.sumGive).toLocaleString()}`,
              `Top share of incoming ${Math.round(e.consolidation.topShareGet * 100)}%`,
            ]}
          />
        ) : (
          e.consolidationNote && <Read label="Consolidation" text={e.consolidationNote} />
        )}
        <Read label="Against your own record" text={e.historyCheck} />
        {pkg.fragility && (
          <Read
            label={pkg.fragility.direction === "relieves" ? "What it takes off one man" : "What it puts on one man"}
            text={pkg.fragility.text}
          />
        )}
        {pkg.leverageShift && <Read label="Positional leverage" text={<LeverageShiftText shift={pkg.leverageShift} />} />}
      </Disclosure>
      <Disclosure summary={`Room ~${Math.round(pkg.fit.mutual)}`}>
        The smaller of the two sides&apos; fit gain (yours ~{Math.round(pkg.fit.yours)}, theirs ~
        {Math.round(pkg.fit.theirs)}). A fit-adjusted difference on a clamped preference
        multiplier, not a value: read it as a size, never as an amount.
      </Disclosure>
    </>
  );
}
function ConvictionBlock({ notes, hasRanking }) {
  // Three different states: no ranking, a ranking that does not touch this package,
  // and real gaps to report.
  return (
    <>
      <SectionHeader title="Against your ranking" />
      {!hasRanking ? (
        <p className="text-note text-muted">
          No board yet, so every value is consensus.{" "}
          <Link href="/rank" className="font-semibold text-accent-text underline underline-offset-2">
            Rank players
          </Link>
        </p>
      ) : notes.length === 0 ? (
        <p className="text-note text-muted">Your board and consensus agree on everyone here.</p>
      ) : (
        <>
          <List>
            {notes.map((n) => (
              <li key={`${n.side}-${n.playerId}`} className="flex gap-2 px-4 py-3 text-note text-ink">
                <Chip size="sm" className="h-fit shrink-0">
                  {n.verdict === "supports" ? "Backs it" : "Questions it"}
                </Chip>
                <span className="min-w-0">{n.text}</span>
              </li>
            ))}
          </List>
          <Disclosure className="mt-1" summary="Does my ranking reprice this?">
            No. Every value here is built from consensus ranks, which is what makes the
            comparison meaningful. Your ranking annotates the packages; it does not reprice
            them, so this package prices identically on{" "}
            <Link href="/trade" className="font-semibold text-accent-text underline underline-offset-2">
              the trade page
            </Link>
            .
          </Disclosure>
        </>
      )}
    </>
  );
}
function namedWithSeasons(assets) {
  return assets.map((asset) => `${asset.label}, ${asset.duration.toFixed(1)} seasons out`).join(", and ");
}
function AfterTrade({ pt }) {
  if (!pt) return null;
  const { before: b, after: a, departingBreak, arrivingBreak } = pt;
  const core = pt.coreDurationWithoutDeparting;
  const coreAfter = pt.coreDurationWithoutArriving;
  const depPlural = departingBreak && departingBreak.assets.length > 1;
  const arrPlural = arrivingBreak && arrivingBreak.assets.length > 1;
  const windows =
    b.window?.state === "window" && a.window?.state === "window" ? { b: b.window, a: a.window } : null;
  const label =
    `Two duration strips, x-axis seasons out. Today: TCI ${b.tci}, value centred ${b.rosterDuration.toFixed(1)} seasons out, ` +
    `plus or minus one standard deviation of ${b.dispersion.toFixed(2)} seasons. After this trade: TCI ${a.tci}, centred ` +
    `${a.rosterDuration.toFixed(1)} seasons out, band ${a.dispersion.toFixed(2)} seasons.` +
    (departingBreak
      ? ` ${namedWithSeasons(departingBreak.assets)} ${depPlural ? "are" : "is"} the asset${depPlural ? "s" : ""} this roster's own timeline names as its odd one${depPlural ? "s" : ""} out, and this package sends ${depPlural ? "them" : "him"}.`
      : "") +
    (arrivingBreak
      ? ` ${namedWithSeasons(arrivingBreak.assets)}, arriving, would become the asset${arrPlural ? "s" : ""} the roster's timeline reads as its odd one${arrPlural ? "s" : ""} out.`
      : "");
  return (
    <>
      <SectionHeader title="After this trade" />
      <Card>
        <p className="text-meta text-secondary">Timeline coherence (TCI)</p>
        <p className="flex items-center gap-2 figure text-display font-bold text-ink">
          {b.tci}
          <ArrowRight size={18} aria-hidden="true" className="text-secondary" />
          {a.tci}
        </p>
        {windows && (
          <p className="text-note text-muted">
            Middle half of your value: {windows.b.open}-{windows.b.close} today, {windows.a.open}-{windows.a.close} after
          </p>
        )}
        <div className="mt-2">
          <DurationStrips assets={pt.assets} before={b} after={a} label={label} />
        </div>
        <Disclosure className="mt-1" summary="What the timeline says">
          <p>
            TCI is 1 minus the value-weighted spread of your assets&apos; durations over a
            three-season reference, so the band behind the dots is this number: narrower
            band, higher figure. One dot per asset, sized by value; dashed line is the
            value-weighted centre; the shaded band is ±1σ. Hollow on &quot;after&quot; =
            leaving, solid = arriving.
          </p>
          {windows && (
            <p className="mt-2">
              Peaking {windows.b.peak} today, {windows.a.peak} afterwards.
            </p>
          )}
          {departingBreak && (
            <p className="mt-2">
              The piece{depPlural ? "s" : ""} you are sending {depPlural ? "are" : "is"} the
              one{depPlural ? "s" : ""} your own timeline reads as the odd one
              {depPlural ? "s" : ""} out: {namedWithSeasons(departingBreak.assets)}
              {core != null ? ` against a core at ${core.toFixed(1)}` : ""}. A coincidence of
              two readings, not a verdict: the odd one out is often a roster&apos;s best
              player, and holding one while a younger core matures is a deliberate strategy.
            </p>
          )}
          {arrivingBreak && (
            <p className="mt-2">
              This deal brings {arrPlural ? "two" : "one"} in: {namedWithSeasons(arrivingBreak.assets)}{" "}
              would become the asset{arrPlural ? "s" : ""} your timeline reads as the odd one
              {arrPlural ? "s" : ""} out
              {coreAfter != null ? `, against a core at ${coreAfter.toFixed(1)}` : ""}. Buying
              misaligned piece{arrPlural ? "s" : ""} on purpose is a real strategy; this is
              the number {arrPlural ? "they cost" : "it costs"}, not a reason to refuse.
            </p>
          )}
        </Disclosure>
      </Card>
    </>
  );
}
/** The same wording /trade's evaluator carries for this fact. */
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
      from {shift.before} to {shift.after}, at {posList} - where your own value sits relative
      to the league&apos;s own mix there, not a read on the deal itself.
    </>
  );
}
function Bullets({ lines }) {
  return (
    <List>
      {lines.map((l) => (
        <li key={l} className="px-4 py-3 text-body text-ink">
          {l}
        </li>
      ))}
    </List>
  );
}
function Read({ label, text, numbers }) {
  return (
    <div>
      <h3 className="text-note font-semibold text-ink">{label}</h3>
      <p className="mt-0.5 text-body text-muted">{text}</p>
      {numbers?.length > 0 && <p className="mt-1 figure text-meta text-secondary">{numbers.join(" · ")}</p>}
    </div>
  );
}
function AssetSide({ title, side }) {
  return (
    <div className="min-w-0 rounded-card bg-surface p-3">
      <p className="text-meta font-medium text-secondary">{title}</p>
      <p className="figure text-note text-muted">
        {fmtValue(side.total)}
        {side.avgAge != null && ` · avg age ${side.avgAge}`}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {side.assets.map((a) => (
          <li key={a.id} className="text-note">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 font-semibold text-ink">{a.label}</span>
              <span className="shrink-0 figure font-semibold text-ink">{fmtValue(a.value)}</span>
            </span>
            {(a.tier || a.age != null) && (
              <span className="block text-meta text-secondary">
                {[a.tier, a.age != null ? `${a.age}` : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
