import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lightbulb, ListOrdered, ThumbsDown } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import {
  convictionSummary,
  findTrades,
  partnerBoard,
  type ConvictionNote,
  type FinderAsset,
  type FragilityNote,
} from "@/lib/tradefinder";
import { readCustomOrder } from "@/lib/rankings/customOrderServer";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import { PageHeader, SectionHeader, Stat, Tag, DeltaValue } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ManagerRail } from "@/components/ManagerRail";
import { Onward } from "@/components/Onward";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

const STANCE: Record<
  string,
  { label: string; tone: "accent" | "info" | "warn" | "positive" }
> = {
  contend: { label: "Contend", tone: "accent" },
  ascend: { label: "Ascend", tone: "positive" },
  rebuild: { label: "Rebuild", tone: "info" },
  retool: { label: "Retool", tone: "warn" },
};

export default async function TradeFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; pkg?: string }>;
}) {
  const { with: withParam, pkg: pkgParam } = await searchParams;
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
  if (partnerId != null && (!Number.isInteger(partnerId) || partnerId === rosterId)) {
    notFound();
  }

  // ------------------------------------------------------------ the board view
  if (partnerId == null) {
    const rows = partnerBoard(h, principals, rosterId);
    const live = rows.filter((r) => r.mutual > 0);
    return (
      <div>
        <PageHeader
          kicker="Trade finder"
          title="Who should you call?"
          subtitle="Ranked by how much room actually exists between your two rosters, not by who is best. A trade needs the same asset to be worth more to them than to you, so this reads their behaviour and their holes alongside the values."
        />
        <dl className="grid grid-cols-2 gap-1.5">
          <Stat
            label="live matches"
            value={`${live.length}`}
            sub={`of ${rows.length} leaguemates`}
          />
          <Stat
            label="best room"
            value={live.length ? fmtValue(live[0].mutual) : "-"}
            sub={live.length ? live[0].name : "nothing clears the bar"}
            tone={live.length ? "accent" : "neutral"}
          />
        </dl>

        <SectionHeader title="Every leaguemate, best room first" />
        <ul className="space-y-1">
          {rows.map((r) => {
            const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
            const user = ownerId ? h.usersById.get(ownerId) : undefined;
            const stance = STANCE[r.stance];
            return (
              <li key={r.rosterId}>
                <Link
                  href={`/trade/finder?with=${r.rosterId}`}
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
                      <span className="min-w-0 truncate text-body font-semibold leading-tight text-ink">
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
                    {/* WHEN they pay off, beside how they behave. The board is still
                        ordered on mutual fit alone - this is printed, never scored,
                        because "their window is opposite yours" is why a deal is
                        possible rather than a rating of this one (D6). */}
                    <span className="mt-0.5 block truncate figure text-micro leading-tight text-faint">
                      {r.valueWindow}
                      {r.sharesYourWindow === true && " · shares your window"}
                      {r.tags.length > 0 && ` · ${r.tags.join(" · ")}`}
                      {` · ${r.trades} trades`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block figure text-body font-semibold text-accent-text">
                      {r.mutual > 0 ? fmtValue(r.mutual) : "-"}
                    </span>
                    <span className="block text-micro uppercase tracking-wide text-faint">
                      room
                    </span>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-meta leading-snug text-secondary">
          Room is the smaller of the two sides&apos; fit gain on the best package found.
          Scoring it on the smaller side is deliberate: if only one team gains, it is not
          a trade idea, it is a wish.
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

  return (
    <div>
      <Link
        href={selected ? `/trade/finder?with=${partnerId}` : "/trade/finder"}
        className="mb-1 -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {selected ? "All ideas" : "All partners"}
      </Link>

      <header className="mb-3 flex items-start gap-2.5">
        <TeamAvatar
          name={result.partner.name}
          avatarId={user?.avatar}
          teamLogoUrl={user?.teamLogoUrl}
        />
        <div className="min-w-0">
          <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
            Trade finder
          </p>
          <h1 className="min-w-0 font-display text-display font-semibold leading-tight text-ink">
            {result.partner.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Tag tone={stance.tone}>{stance.label}</Tag>
            {result.dossier.tags.slice(0, 3).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        </div>
      </header>

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
        <p className="mt-1 text-meta leading-snug text-secondary">
          Their holes: {result.partner.weakPositions.join(", ") || "none obvious"} · Their
          surplus: {result.partner.strongPositions.join(", ") || "none obvious"} · Your
          holes: {result.you.weakPositions.join(", ") || "none obvious"}
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
                <span className="font-semibold text-ink">{theirTl.tci}</span> TCI ·{" "}
                {theirTl.posture}
                {theirFr && (
                  <>
                    {" "}
                    · <span className="font-semibold text-ink">{Math.round(theirFr.fragility)}</span>{" "}
                    RFI
                  </>
                )}
              </span>
              <span>
                you <span className="font-semibold text-ink">{myTl.tci}</span> TCI ·{" "}
                {myTl.posture}
                {myFr && (
                  <>
                    {" "}
                    · <span className="font-semibold text-ink">{Math.round(myFr.fragility)}</span>{" "}
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
                  href={`/trade/finder?with=${partnerId}&pkg=${p.id}`}
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
                    <span className="text-accent-text">room {fmtValue(p.fit.mutual)}</span>
                  </div>
                  {p.theirCase[0] && (
                    <p className="mt-1.5 text-note leading-snug text-muted">
                      <span className="font-semibold text-ink">Why they say yes: </span>
                      {p.theirCase[0]}
                    </p>
                  )}
                  <ConvictionLine notes={p.conviction} />
                  <FragilityLine note={p.fragility} />
                </Link>
              </li>
            ))}
          </ul>
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

function AssetLine({ label, assets }: { label: string; assets: FinderAsset[] }) {
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
            <span className="figure text-meta text-secondary"> {fmtValue(a.value)}</span>
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
function ConvictionLine({ notes }: { notes: ConvictionNote[] }) {
  const summary = convictionSummary(notes);
  if (!summary) return null;
  return (
    <p
      className={`mt-1.5 text-note leading-snug ${
        summary.verdict === "supports" ? "text-accent-text" : "text-warn"
      }`}
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
function FragilityLine({ note }: { note: FragilityNote | null }) {
  if (!note) return null;
  const share = Math.round(note.after.damageShare * 100);
  return (
    <p className="mt-1.5 text-note leading-snug text-muted">
      <span className="font-semibold text-ink">
        {note.direction === "relieves" ? "Leans less on one man: " : "Leans more on one man: "}
      </span>
      {note.after.name} at {share}% of startable value afterwards, from{" "}
      {Math.round(note.before.damageShare * 100)}% on {note.before.name} today.
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
function ConvictionBlock({
  notes,
  hasRanking,
}: {
  notes: ConvictionNote[];
  hasRanking: boolean;
}) {
  // Three genuinely different states, and the difference matters: no ranking at all,
  // a ranking that simply does not touch this package, and real gaps to report.
  if (!hasRanking) {
    return (
      <>
        <SectionHeader title="Against your own ranking" />
        <div className="rounded-[--radius-sm] border border-border bg-surface p-2.5">
          <p className="text-note leading-snug text-muted">
            You have not ranked anyone yet, so every value here is consensus only.
            Rank a board and this package will show you where you and consensus
            disagree about the players in it.
          </p>
          <Link
            href="/rank"
            className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text"
          >
            Rank the board
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
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
              className={`mt-0.5 shrink-0 ${
                n.verdict === "supports" ? "text-accent-text" : "text-warn"
              }`}
            />
            {n.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-meta leading-snug text-secondary">
        Every value on this page is built from consensus ranks, which is what makes
        the comparison meaningful. Your ranking annotates the packages here; it does
        not reprice them, so a package this page suggests still prices identically on{" "}
        <Link href="/trade" className="text-accent-text underline">
          the hand-built trade page
        </Link>
        .
      </p>
    </>
  );
}

function PackageDetail({
  pkg,
  hasRanking,
}: {
  pkg: NonNullable<ReturnType<typeof findTrades>>["packages"][number];
  hasRanking: boolean;
}) {
  const e = pkg.evaluation;
  return (
    <>
      <h2 className="mt-4 font-display text-lede font-semibold leading-tight text-ink">
        {pkg.headline}
      </h2>

      <dl className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat label="you send" value={fmtValue(e.give.total)} sub={`${pkg.give.length} assets`} />
        <Stat label="you get" value={fmtValue(e.get.total)} sub={`${pkg.get.length} assets`} />
        <Stat
          label="net"
          value={<DeltaValue n={e.delta} />}
          sub={`${e.deltaPct > 0 ? "+" : ""}${e.deltaPct}% · ${e.direction}`}
          tone={e.delta >= 0 ? "positive" : "negative"}
        />
      </dl>

      <div className="mt-2 grid gap-1.5">
        <AssetTable title="You send" side={e.give} />
        <AssetTable title="You get" side={e.get} />
      </div>

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
                <ThumbsDown size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
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
        <Read label="The assumption that must hold" text={e.keyAssumption} accent />
        {e.consolidationNote && <Read label="Consolidation" text={e.consolidationNote} />}
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
      </div>
    </>
  );
}

function Bullets({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1">
      {lines.map((l) => (
        <li key={l} className="flex gap-1.5 text-note leading-snug text-muted">
          <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
          {l}
        </li>
      ))}
    </ul>
  );
}

function Read({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: boolean;
}) {
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

function AssetTable({
  title,
  side,
}: {
  title: string;
  side: NonNullable<ReturnType<typeof findTrades>>["packages"][number]["evaluation"]["give"];
}) {
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-micro uppercase tracking-wide text-faint">{title}</span>
        <span className="figure text-meta text-muted">
          {fmtValue(side.total)}
          {side.avgAge != null && ` · avg ${side.avgAge}`}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {side.assets.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-note text-ink">{a.label}</span>
            {a.tier && <span className="shrink-0 text-micro text-faint">{a.tier}</span>}
            {a.age != null && (
              <span className="shrink-0 figure text-micro text-faint">{a.age}</span>
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
