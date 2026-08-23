/**
 * MANAGER COMPARE - two managers, one sheet, no averaging.
 *
 * Zero new derivation on purpose. Every figure here comes from the module that already
 * owns it: behaviour from `lib/dossier` (which is principal-aware, so a former manager
 * is their own person rather than a blend with whoever took the team over), roster
 * timeline and posture from `leagueTimelines`, fragility from `leagueFragility`, and
 * the head-to-head count from the trade ledger's own owner-keyed pairings. If this page
 * ever needs a number none of them expose, the fix is to expose it there - two
 * surfaces disagreeing about the same manager is the exact failure this app cannot
 * afford.
 *
 * The pair lives in the URL (`?a={ownerId}&b={ownerId}`), so a comparison is
 * shareable and bookmarkable, same as every filtered view of /deals.
 *
 * ONE HONEST ASYMMETRY, and it is the whole reason this page needs care: dossier
 * numbers are scoped to the person, but TCI, posture, duration and fragility describe
 * a ROSTER AS IT STANDS TONIGHT. A departed manager holds no roster, so those four
 * belong to their successor, not to them. Rather than borrow the successor's numbers
 * (the exact bug `ManagerLink` in components/TradeParts.tsx guards against), a comparison
 * involving a former manager says so and shows only what is genuinely theirs.
 */
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { dossiersByOwner } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { buildTradeLedger, pairEdgeKey } from "@/lib/tradegraph";
import { pairDealsHref } from "@/lib/tradegraph/url";
import { leagueTimelines } from "@/lib/metrics/duration";
import { fragilityTone, leagueFragility } from "@/lib/metrics/fragility";
import { Card, PageHeader, SectionHeader, Tag } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { MetricGloss } from "@/components/MetricGloss";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ManagerComparePicker } from "@/components/ManagerComparePicker";
import { ManagerRail } from "@/components/ManagerRail";
import { Onward } from "@/components/Onward";
import { cn, signed } from "@/lib/ui";
export const dynamic = "force-dynamic";
/** Marks the better side, or neither when they tie. */
function leadOf(a, b, better) {
  if (a == null || b == null || a === b) return null;
  const aWins = better === "high" ? a > b : a < b;
  return aWins ? "a" : "b";
}
/**
 * Whether both rosters are trying to win a season they can still win. The only footing
 * on which a lower fragility score is an advantage rather than a description.
 */
function bothPlayingToWin(a, b) {
  const playing = (p) => p === "contending" || p === "ascending";
  return playing(a) && playing(b);
}
function Val({ cell, lead }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "figure text-body leading-tight",
          lead ? "font-semibold text-accent-text" : "text-ink",
        )}
      >
        {cell.main}
      </div>
      {cell.sub != null && (
        <div className="mt-px text-micro leading-tight text-faint">
          {cell.sub}
        </div>
      )}
    </div>
  );
}
/** Where a dossier lives, current or former - the routing already in the app. */
function dossierHref(d) {
  return d.identity.kind === "former"
    ? `/managers/former/${d.identity.ownerId}`
    : `/managers/${d.identity.rosterId}`;
}
/**
 * One side's identity column: avatar, name, former tenure, titles, top dossier tags.
 *
 * Titles sit ABOVE the behaviour tags on purpose - a ring is an achievement, not a
 * behavioural tell, and this is the one surface that puts two managers' identities
 * side by side, which makes it the natural home for the single most emotionally
 * loaded number in a dynasty league (see DECISIONS.md D6: a thesis, not a grade -
 * this isn't a grade either, just a fact, and it earns its own line rather than
 * getting lost among "Pick hoarder" and "Deadline buyer").
 */
function Side({ d, principal, isMe, titles }) {
  const p = d.profile;
  const shown = d.tags.slice(0, 3);
  return (
    <div className="min-w-0">
      <TeamAvatar
        name={p.teamName ?? p.displayName}
        avatarId={principal?.avatar}
        teamLogoUrl={principal?.teamLogoUrl}
        size="sm"
        isMe={isMe}
      />
      <Link
        href={dossierHref(d)}
        className="mt-1 flex min-h-11 items-center line-clamp-1 text-body font-semibold leading-tight text-ink transition-colors hover:text-accent-text"
      >
        {p.teamName ?? p.displayName}
      </Link>
      <div className="line-clamp-1 text-meta leading-tight text-secondary">
        {p.displayName}
      </div>
      {d.identity.kind === "former" && (
        <Tag className="mt-1">former {d.identity.tenureLabel}</Tag>
      )}
      {titles && (
        <div className="mt-1 flex items-center gap-1 text-meta font-semibold text-accent-text">
          <Trophy size={11} aria-hidden="true" className="shrink-0" />
          <span className="line-clamp-1">{titles.label}</span>
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-1 text-meta font-medium leading-snug text-accent-text">
          {shown.join(" · ")}
        </div>
      )}
    </div>
  );
}
/**
 * The sheet. A 76px label rail with two equal value columns fits 390px without
 * horizontal scroll, and keeps the two sides genuinely side by side - stacking them
 * into two separate blocks would just be the two dossier pages again.
 */
function CompareSheet({ rows }) {
  return (
    <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[76px_1fr_1fr] items-start gap-2 px-2.5 py-1.5"
          >
            <div className="text-micro uppercase leading-tight tracking-wide text-faint">
              {r.label}
            </div>
            <Val cell={r.a} lead={r.lead === "a"} />
            <Val cell={r.b} lead={r.lead === "b"} />
          </li>
        ))}
      </ul>
    </div>
  );
}
export default async function CompareManagersPage({ searchParams }) {
  const { a: aParam, b: bParam } = await searchParams;
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const dossiers = dossiersByOwner(h, principals);
  const titlesByOwnerId = titleSummariesByOwner(h, principals);
  const options = principals.principals
    .filter((pr) => dossiers.has(pr.ownerId))
    .map((pr) => ({
      ownerId: pr.ownerId,
      label: pr.teamName ?? pr.displayName,
      isMe: pr.ownerId === h.me.userId,
      isFormer: pr.isFormer,
      tenureLabel:
        dossiers.get(pr.ownerId)?.identity.kind === "former"
          ? dossiers.get(pr.ownerId).identity.tenureLabel
          : undefined,
    }));
  // A URL is untrusted input: an owner id nobody in this league has ever held reads as
  // "not picked yet" rather than erroring, and the same id twice resolves to one pick,
  // because a manager compared against themselves has nothing to say.
  const aId = aParam && dossiers.has(aParam) ? aParam : null;
  const bId = bParam && dossiers.has(bParam) && bParam !== aId ? bParam : null;
  const aD = aId ? dossiers.get(aId) : null;
  const bD = bId ? dossiers.get(bId) : null;
  const header = (
    <>
      <Link
        href="/managers"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All dossiers
      </Link>
      <PageHeader
        kicker="Manager compare"
        title="Side by side"
        subtitle="The same numbers for two managers, from the same reads their own dossiers use."
      >
        <div className="mt-1 flex flex-wrap items-center gap-x-2 figure text-meta text-faint">
          <span>{options.length} managers</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-warn">
            <Lock size={11} aria-hidden="true" />
            private
          </span>
        </div>
      </PageHeader>
      <ManagerComparePicker options={options} a={aId} b={bId} />
    </>
  );
  if (!aD || !bD) {
    // Suggested pairs resolve through each side's CURRENT holder on purpose: a
    // suggestion should open a live comparison, and the numbers on the page itself are
    // the ones that have to be principal-exact, not this shortcut.
    const meD = h.me.userId ? dossiers.get(h.me.userId) : undefined;
    const suggestions = [];
    if (h.me.userId && meD) {
      const top = meD.profile.tradePartners[0];
      const topOwner = top
        ? principals.principals.find(
            (pr) => pr.currentRosterId === top.rosterId,
          )
        : undefined;
      if (topOwner) {
        suggestions.push({
          href: `/managers/compare?a=${h.me.userId}&b=${topOwner.ownerId}`,
          label: `You vs ${topOwner.teamName ?? topOwner.displayName}`,
        });
      }
      const busiest = [...dossiers.values()]
        .filter((d) => d.profile.userId !== h.me.userId)
        .sort((x, y) => y.profile.trades - x.profile.trades)[0];
      if (busiest?.profile.userId) {
        suggestions.push({
          href: `/managers/compare?a=${h.me.userId}&b=${busiest.profile.userId}`,
          label: `You vs the busiest trader`,
        });
      }
    }
    return (
      <div>
        {header}
        <Card className="mt-3">
          <p className="text-body leading-relaxed text-muted">
            {aD || bD
              ? "Pick a second manager to compare against."
              : "Pick two managers. Former managers are in the list too - their behaviour is scoped to the seasons they actually ran the team."}
          </p>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-note font-semibold text-ink transition-colors hover:border-accent-edge hover:text-accent-text"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )}
        </Card>
        {/* The empty branch is a dead end too, and it is the one a reader most often
                lands on: arriving with no pair chosen and no idea who to pick. */}
        <Onward from="/managers/compare" />
      </div>
    );
  }
  // --------------------------------------------------------------- both sides chosen
  const aP = aD.profile;
  const bP = bD.profile;
  const aPr = principals.byOwnerId.get(aId);
  const bPr = principals.byOwnerId.get(bId);
  /** Null for a former manager - see the asymmetry note at the top of this file. */
  const rosterOf = (d) =>
    d.identity.kind === "current" ? d.identity.rosterId : null;
  const aRoster = rosterOf(aD);
  const bRoster = rosterOf(bD);
  const bothCurrent = aRoster != null && bRoster != null;
  const ledger = buildTradeLedger(h, principals);
  const edge = ledger.pairings.find((e) => e.key === pairEdgeKey(aId, bId));
  /**
   * The number of deals that actually exist as records - `dealCount`, never
   * `dossierCount`.
   *
   * The two can disagree when a commissioner-executed multi-team deal arrives as
   * several transactions that coalesce into ONE record while the dossier still counts
   * each encounter. (They also used to disagree because the dossier fold was
   * roster-keyed and blended two managers who had shared a seat - fixed at the source
   * in `TradePartner`, so on this corpus all 46 pairings now agree.) `/deals?pair=`
   * shows the listable figure; this page has to say the same number or the two
   * surfaces disagree about the same two people. The gap itself is worth showing,
   * which is why the footnote below exists rather than the larger number being
   * hidden.
   */
  const dealsListed = edge?.dealCount ?? 0;
  const dossierCount = edge?.dossierCount ?? 0;
  // Two managers who never shared a season could not have traded even in principle,
  // which is a different fact from choosing not to - worth separating, since one is a
  // read on them and the other is just the calendar.
  const overlap = [...(aPr?.seasons ?? [])].filter((s) =>
    (bPr?.seasons ?? []).includes(s),
  );
  let aTl;
  let bTl;
  let aFr;
  let bFr;
  if (bothCurrent) {
    // League-wide passes, not the per-roster helpers: posture is only meaningful
    // against the league's duration spread and a fragility band is a percentile, so
    // asking for one roster in isolation would mean rebuilding that context here.
    const timelines = leagueTimelines(h);
    const frag = leagueFragility(h);
    aTl = timelines.find((t) => t.rosterId === aRoster);
    bTl = timelines.find((t) => t.rosterId === bRoster);
    aFr = frag.find((f) => f.rosterId === aRoster);
    bFr = frag.find((f) => f.rosterId === bRoster);
  }
  const behaviour = [
    {
      label: "Trades",
      a: { main: aP.trades, sub: `${aD.tradesPerSeason}/szn` },
      b: { main: bP.trades, sub: `${bD.tradesPerSeason}/szn` },
    },
    {
      label: "Initiates",
      a: {
        main: `${aP.tradesInitiated}/${aP.trades || 0}`,
        sub: "self-initiated",
      },
      b: {
        main: `${bP.tradesInitiated}/${bP.trades || 0}`,
        sub: "self-initiated",
      },
    },
    {
      // A net COUNT of picks traded, not the VALUE of picks held - which is what
      // /roster's "Pick capital" strip measures. One label per quantity.
      label: "Picks traded",
      a: {
        main: signed(aP.picks.net),
        sub: `${aP.picks.firstsAcquired} firsts in / ${aP.picks.firstsSpent} out`,
      },
      b: {
        main: signed(bP.picks.net),
        sub: `${bP.picks.firstsAcquired} firsts in / ${bP.picks.firstsSpent} out`,
      },
      lead: leadOf(aP.picks.net, bP.picks.net, "high"),
    },
    {
      label: "Avg acq. age",
      a: {
        main: aP.acquisitions.avgAge ?? "-",
        sub: `${aP.acquisitions.count} added`,
      },
      b: {
        main: bP.acquisitions.avgAge ?? "-",
        sub: `${bP.acquisitions.count} added`,
      },
    },
    {
      label: "Avg hold",
      a: { main: aP.avgHoldingDays != null ? `${aP.avgHoldingDays}d` : "-" },
      b: { main: bP.avgHoldingDays != null ? `${bP.avgHoldingDays}d` : "-" },
    },
    {
      label: "Deadline",
      a: { main: `${aP.deadline.buys}B / ${aP.deadline.sells}S` },
      b: { main: `${bP.deadline.buys}B / ${bP.deadline.sells}S` },
    },
    {
      label: "All moves",
      a: {
        main: aP.totalTransactions,
        sub: `${aP.waivers + aP.freeAgents} waiver/FA`,
      },
      b: {
        main: bP.totalTransactions,
        sub: `${bP.waivers + bP.freeAgents} waiver/FA`,
      },
    },
  ];
  const rosterRows =
    aTl && bTl
      ? [
          {
            label: "TCI",
            a: {
              main: aTl.tci,
              sub: <PostureTag posture={aTl.posture} />,
            },
            b: {
              main: bTl.tci,
              sub: <PostureTag posture={bTl.posture} />,
            },
          },
          {
            label: "Duration",
            a: {
              main: `${aTl.rosterDuration.toFixed(1)}s`,
              sub: "value-weighted",
            },
            b: {
              main: `${bTl.rosterDuration.toFixed(1)}s`,
              sub: "value-weighted",
            },
          },
          ...(aFr && bFr
            ? [
                {
                  label: "Fragility",
                  a: {
                    main: Math.round(aFr.fragility),
                    sub: (
                      <Tag tone={fragilityTone(aFr.band, aTl.posture)}>
                        {aFr.band}
                      </Tag>
                    ),
                  },
                  b: {
                    main: Math.round(bFr.fragility),
                    sub: (
                      <Tag tone={fragilityTone(bFr.band, bTl.posture)}>
                        {bFr.band}
                      </Tag>
                    ),
                  },
                  /**
                   * RFI has a stated direction (higher is more fragile) and no stated
                   * WINNER, which is not the same thing. This row used to hand the row
                   * to whoever scored lower, which crowned the most torn-down roster in
                   * the league for having nothing left to lose - the exact misreading
                   * D23 exists to forbid.
                   *
                   * The lead survives only where the comparison means something: two
                   * rosters both playing for a season they can still win. There, less
                   * of the season riding on one man is a real advantage over the other
                   * man's roster. Everywhere else the two numbers are still shown side
                   * by side and neither is called better, because a rebuild's low score
                   * and a contender's low score are not the same fact.
                   */
                  lead: bothPlayingToWin(aTl.posture, bTl.posture)
                    ? leadOf(aFr.fragility, bFr.fragility, "low")
                    : null,
                },
              ]
            : []),
        ]
      : [];
  return (
    <div>
      {header}

      <div className="mt-3 grid grid-cols-[76px_1fr_1fr] gap-2">
        <div />
        <Side
          d={aD}
          principal={aPr}
          isMe={aP.userId === h.me.userId}
          titles={titlesByOwnerId.get(aId)}
        />
        <Side
          d={bD}
          principal={bPr}
          isMe={bP.userId === h.me.userId}
          titles={titlesByOwnerId.get(bId)}
        />
      </div>

      <SectionHeader
        title="Between the two of them"
        action={
          edge && (
            <Link
              href={pairDealsHref(edge.key)}
              className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
            >
              their deals
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          )
        }
      />
      <Card>
        {edge ? (
          <>
            <p className="text-body leading-relaxed text-ink">
              <span className="figure font-semibold text-accent-text">
                {dealsListed} deal{dealsListed === 1 ? "" : "s"}
              </span>{" "}
              <span className="text-muted">
                between them, in {edge.seasons.join(", ")}.
              </span>
            </p>
            {dossierCount > dealsListed && (
              <p className="mt-1 text-meta leading-relaxed text-secondary">
                Their dossiers count {dossierCount}. A commissioner-executed
                multi-team deal collapses several transactions into one record
                here, so the listable number is the smaller one.
              </p>
            )}
          </>
        ) : (
          <p className="text-body leading-relaxed text-muted">
            {overlap.length === 0
              ? "They were never in the league at the same time, so no deal between them was ever possible."
              : `No deals between them, across ${overlap.length} shared season${overlap.length === 1 ? "" : "s"}.`}
          </p>
        )}
      </Card>

      <SectionHeader title="How they trade" />
      <CompareSheet rows={behaviour} />

      <SectionHeader title="Where the roster stands tonight" />
      {rosterRows.length > 0 ? (
        <>
          <CompareSheet rows={rosterRows} />
          {/* First-time readers meet both indexes as bare numbers here - one quiet,
                closed-by-default definition beats sending them to another page. */}
          <MetricGloss className="mt-1" />
        </>
      ) : (
        <Card className="border-warn/30 bg-warn/[0.06]">
          <p className="text-body leading-relaxed text-muted">
            Only shown when both managers currently hold a roster. TCI, duration
            and fragility describe a roster as it stands tonight, and a former
            manager holds none - showing these would quietly be describing
            whoever took their team over.
          </p>
        </Card>
      )}

      <SectionHeader title="The read" />
      <div className="space-y-2">
        {[aD, bD].map((d) => (
          <div
            key={d.profile.userId ?? d.profile.displayName}
            className="rounded-[--radius] border border-border bg-surface p-2.5"
          >
            <div className="mb-0.5 text-meta font-semibold uppercase tracking-wide text-accent-text">
              {d.profile.teamName ?? d.profile.displayName}
            </div>
            <p className="text-note leading-[1.42] text-ink">{d.read}</p>
          </div>
        ))}
      </div>

      {/*
       * WHAT TO DO WITH THE COMPARISON. This was two dossier links, and the whole
       * point of reading two rivals side by side is deciding whether to call one of
       * them - which was the one thing this page could not get you to. Every surface
       * the app holds about each of them, per side, from the one rule in lib/nav.ts.
       */}
      <SectionHeader title="Take it further" />
      <div className="space-y-1.5">
        {[aD, bD].map((d) => (
          <div key={dossierHref(d)} className="min-w-0">
            <p className="mb-0.5 line-clamp-1 text-meta font-semibold uppercase tracking-wide text-secondary">
              {d.profile.teamName ?? d.profile.displayName}
            </p>
            <ManagerRail
              rosterId={
                d.identity.kind === "former" ? null : d.identity.rosterId
              }
              ownerId={d.profile.userId ?? null}
              isFormer={d.identity.kind === "former"}
              isMe={d.profile.userId === h.me.userId}
            />
          </div>
        ))}
      </div>

      <p className="mt-3 text-meta leading-relaxed text-secondary">
        Gold marks a side only where more is plainly more: pick capital, and the
        lower fragility index when both rosters are playing to win now. A low
        fragility score on a team that has already sold means it has little left
        to lose, so that comparison gets no winner. Every other row is a
        difference, not a score. Behaviour is scoped to each manager&apos;s own
        tenure, so a roster that changed hands reads as two people rather than
        one blended average.
      </p>

      <Onward from="/managers/compare" />
    </div>
  );
}
