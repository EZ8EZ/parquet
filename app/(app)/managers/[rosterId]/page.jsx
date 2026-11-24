import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Lightbulb, Trophy } from "lucide-react";
import { PostureGlyph } from "@/components/PostureTag";
import { getLeagueHistory } from "@/lib/history";
import { buildDossier, dossiersByOwner } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { partnerIdentity } from "@/lib/dossier/partners";
import { scheduleLuckForRoster } from "@/lib/metrics/scheduleLuck";
import { windowLabel, windowsByRoster } from "@/lib/metrics/window";
import { dealHref, managerDealsHref } from "@/lib/tradegraph/url";
import { buybacksByRoster, pickDepartures } from "@/lib/agency";
import { LocalDate } from "@/components/LocalDate";
import { BarList, Card, Chip, Disclosure, List, ListRow, PageHeader, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { dossierBehaviours } from "@/lib/dossier/behaviours";
import { ManagerRail } from "@/components/ManagerRail";
import { DistributionStrip } from "@/components/DistributionStrip";
import { Onward } from "@/components/Onward";
import { signed } from "@/lib/ui";
export const dynamic = "force-dynamic";
/**
 * DOSSIER. Answers "how does this manager deal?": their behaviour figures first, the
 * approach lines, then trades, record and picks behind tabs. All figures from lib/.
 */
export default async function ManagerDetailPage({ params }) {
  const { rosterId: rid } = await params;
  const rosterId = parseInt(rid, 10);
  const h = await getLeagueHistory();
  if (!h.rostersById.has(rosterId)) notFound();
  const principals = await getPrincipals(h);
  const d = buildDossier(h, rosterId, principals);
  const luck = await scheduleLuckForRoster(h, principals, rosterId);
  const p = d.profile;
  const tradesData = p.tradesBySeason.map((s) => ({
    label: s.season,
    value: s.count,
  }));
  const isMe = h.me.rosterId === rosterId;
  const user = p.userId ? h.usersById.get(p.userId) : undefined;
  // Credited to the PERSON, via the same ownerId a roster handover would otherwise
  // get wrong - see lib/dossier/titles.ts.
  const titles = p.userId
    ? titleSummariesByOwner(h, principals).get(p.userId)
    : undefined;
  // Net pick capital for EVERY principal, so this dossier's figure has the league it
  // was earned in printed beside it. Same builder /managers and Manager Compare
  // already call - one pass over the same transactions, no new derivation (D25).
  const netPicksLeague = [...dossiersByOwner(h, principals).values()].map(
    (x) => x.profile.picks.net,
  );
  /*
   * WHEN THIS ROSTER PAYS OFF - one line, beside the posture that was already here.
   *
   * The dossier's posture chips say what this manager's roster HAS BEEN each season.
   * The window says when the roster they hold today pays off, which is the fact a
   * reader is holding when they decide whether to call. Same derivation /league's
   * window map draws from (lib/metrics/window.ts), through the league-wide entry point
   * so a straddled roster reads as straddled here too.
   */
  const win = windowsByRoster(h).get(rosterId) ?? null;
  // Round trips this manager made. One pass over transactions already in the corpus
  // (lib/agency), keyed by the roster that ORIGINALLY owned the pick, which is the
  // only roster for which "bought back" means anything.
  const buybacks = buybacksByRoster(h).get(rosterId) ?? [];
  // And the denominator, so "5" becomes "5 of 11": a count of returns says nothing
  // about how freely this manager sends their own picks out in the first place.
  const departed = [...pickDepartures(h).values()].filter(
    (original) => original === rosterId,
  ).length;
  const name = p.teamName ?? p.displayName;
  const behaviours = dossierBehaviours(d);
  const luckRounded = luck ? Math.round(luck.luckWins * 10) / 10 : null;

  const picksTab = (
    <>
      {/* The only SIGNED distribution in the app: neither end is better (D6). Position
          and the printed rank carry the reading, so hue is never load-bearing. */}
      <Card pad="sm">
        <DistributionStrip
          label="Net picks, against the league"
          values={netPicksLeague}
          mine={p.picks.net}
          format={(n) => (n > 0 ? `+${n}` : `${n}`)}
          signed
          sub="Acquired minus spent, every recorded season. Neither end is better."
        />
      </Card>
      {/* PICKS THEY BOUGHT BACK: a fact, not a read. It says what happened, never why;
          intent is not in the corpus (D19), and undated returns say so. */}
      {buybacks.length > 0 && (
        <>
          <SectionHeader
            title={`Bought back: ${buybacks.length} of ${departed}`}
            href="/deals#buybacks"
            cta="League-wide"
          />
          <List aria-label="Picks they bought back">
            {buybacks.map((b, i) => {
              const meta = b.recorded ? (
                <>
                  <LocalDate ts={b.at} />
                  {b.awayDays != null
                    ? ` · away ${b.awayDays} days${b.recordedHops && b.recordedHops > 2 ? `, changing hands ${b.recordedHops} times` : ""}`
                    : " · the trade that sent it out is not in the record"}
                </>
              ) : (
                "No transaction records this move, so it carries no date"
              );
              return (
                <li key={`${b.season}-${b.round}-${b.rosterId}-${i}`}>
                  <ListRow
                    href={b.recorded && b.transactionId ? dealHref(b.transactionId) : undefined}
                    title={`Their own ${b.label}, back from ${b.fromName}`}
                    badge={!(b.recorded && b.transactionId) ? <Chip size="sm" tone="warn" icon={AlertTriangle}>unrecorded</Chip> : null}
                    meta={meta}
                  />
                </li>
              );
            })}
          </List>
          <Disclosure className="mt-1" summary="What a buyback does not say">
            A pick that came home. It says what happened, not why: the app cannot see
            intent, and a pick can return as a throw-in as easily as on purpose.
          </Disclosure>
        </>
      )}
    </>
  );

  const recordTab = (
    <>
      {luck && luck.gamesPlayed > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              size="sm"
              label="Record"
              value={`${luck.wins}-${luck.losses}${luck.ties ? `-${luck.ties}` : ""}`}
              sub={`${luck.gamesPlayed} games`}
            />
            <StatTile
              size="sm"
              label="Scoring says"
              value={`${luck.expectedWins.toFixed(1)}-${(luck.gamesPlayed - luck.expectedWins).toFixed(1)}`}
              sub={luck.allPlay ? "all-play" : "Pythagorean"}
            />
            <StatTile
              size="sm"
              label="Schedule"
              value={`${signed(luckRounded)}`}
              sub={luckRounded >= 0 ? "wins of cushion" : "wins of drag"}
            />
          </div>
          {luck.luckiest && luck.unluckiest && luck.luckiest !== luck.unluckiest && (
            <p className="mt-2 text-note text-muted">
              Kindest schedule {luck.luckiest.season}, harshest {luck.unluckiest.season}.
            </p>
          )}
          {!luck.allPlay && (
            <Disclosure className="mt-1" summary="How schedule luck is measured">
              From season point totals (points for vs. points against), not week-by-week
              play: this league&apos;s per-week history isn&apos;t loaded for the live
              provider. Not a true all-play record, but the same question: does the record
              match the scoring.
            </Disclosure>
          )}
        </>
      ) : (
        <p className="text-note text-muted">No completed games on record.</p>
      )}
      {p.afterLoss && p.afterLoss.total > 0 && (
        <Card pad="sm" className="mt-2">
          <p className="text-meta text-secondary">After a loss</p>
          <p className="figure text-lede font-bold text-ink">
            {p.afterLoss.afterLoss} of {p.afterLoss.total}
          </p>
          <p className="text-meta text-muted">self-initiated trades came the week after a loss</p>
        </Card>
      )}
      {(p.postureBySeason.length > 0 || win) && (
        <>
          <SectionHeader title="Posture by season" />
          {win && (
            <p className="mb-2 text-note text-muted">
              {win.state === "window"
                ? `${isMe ? "Your" : "Their"} window: ${win.open}-${win.close}, peak ${win.peak}.`
                : win.state === "split"
                  ? `${isMe ? "Your" : "Their"} assets disagree about when ${isMe ? "you" : "they"} win: the middle half of the value runs ${windowLabel(win)}.`
                  : `Too few valued assets to read a window from.`}
            </p>
          )}
          {/* Postures are categories, not grades (components/PostureTag): neutral chip,
              glyph plus word. */}
          <div className="flex flex-wrap gap-1.5">
            {p.postureBySeason.map((s) => (
              <Chip key={s.season}>
                <span className="figure">{s.season}</span>
                <PostureGlyph posture={s.posture} />
                {s.posture}
              </Chip>
            ))}
          </div>
        </>
      )}
    </>
  );

  const tradesTab = (
    <>
      {tradesData.length > 0 && (
        <Card>
          <p className="mb-2 text-meta text-secondary">
            Trades by season · {p.trades} across {tradesData.length}
          </p>
          <BarList
            label="Trades by season"
            items={tradesData.map((t) => ({ key: t.label, label: `${t.label}`, value: t.value }))}
          />
        </Card>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile size="sm" label="Waiver" value={`${p.waivers}`} sub="claims" />
        <StatTile size="sm" label="Free agent" value={`${p.freeAgents}`} sub="adds" />
        <StatTile
          size="sm"
          label="Avg hold"
          value={p.avgHoldingDays != null ? `${p.avgHoldingDays}d` : "unknown"}
          sub="per player"
        />
        <StatTile
          size="sm"
          label="In"
          value={`${p.acquisitions.count}`}
          sub={p.acquisitions.avgAge != null ? `avg ${p.acquisitions.avgAge}y` : "age unknown"}
        />
        <StatTile
          size="sm"
          label="Out"
          value={`${p.disposals.count}`}
          sub={p.disposals.avgAge != null ? `avg ${p.disposals.avgAge}y` : "age unknown"}
        />
        <StatTile
          size="sm"
          label="Deadline"
          value={`${p.deadline.buys}/${p.deadline.sells}`}
          sub="buys / sells"
        />
      </div>
      {p.tradePartners.length > 0 && (
        <>
          <SectionHeader
            title="Favourite partners"
            href={p.userId ? managerDealsHref(p.userId) : "/deals"}
            cta="Their deals"
          />
          <List aria-label="Favourite trade partners">
            {p.tradePartners.slice(0, 6).map((tp) => {
              const t = partnerIdentity(h, principals, tp);
              return (
                <li key={tp.ownerId ?? `r${tp.rosterId}`}>
                  <ListRow
                    href={t.href}
                    aria-label={`Dossier: ${t.name}`}
                    avatar={
                      <TeamAvatar
                        name={t.name}
                        avatarId={t.avatarId}
                        teamLogoUrl={t.teamLogoUrl}
                        size="sm"
                        isMe={!t.isFormer && h.me.rosterId === tp.rosterId}
                      />
                    }
                    title={t.name}
                    meta={t.tenureLabel ?? undefined}
                    value={`${tp.count}`}
                    valueSub={`deal${tp.count === 1 ? "" : "s"}`}
                  />
                </li>
              );
            })}
          </List>
        </>
      )}
    </>
  );

  return (
    <div>
      <Link
        href="/managers"
        className="-ml-1 -mt-2 inline-flex min-h-11 items-center gap-1.5 px-1 text-note font-semibold text-secondary transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All managers
      </Link>

      <PageHeader
        leading={
          <TeamAvatar
            name={name}
            avatarId={user?.avatar}
            teamLogoUrl={user?.teamLogoUrl}
            size="lg"
            isMe={isMe}
          />
        }
        kicker={isMe ? "Your own file" : "Dossier"}
        /* Not truncated: the team name is the whole masthead (D111). */
        title={name}
        subtitle={p.displayName}
        below={
          titles ? (
            <div className="mt-2">
              <Chip tone="accent" icon={Trophy}>
                {titles.label}
              </Chip>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Trades"
          value={`${p.trades}`}
          sub={`${d.tradesPerSeason}/season · ${p.tradesInitiated} started`}
        />
        {/* "Picks traded", not "Pick capital": a net COUNT of picks moved, not the
            value of picks held. Ink, not green/red: neither end is better (D6). */}
        <StatTile
          label="Picks traded"
          value={signed(p.picks.net)}
          sub={`net · ${p.picks.firstsAcquired} firsts in · ${p.picks.firstsSpent} out`}
        />
        <StatTile
          label="Avg acq. age"
          value={p.acquisitions.avgAge ?? "unknown"}
          sub={`${p.acquisitions.count} players added`}
        />
        <StatTile
          label="Waiver / FA"
          value={`${p.waivers + p.freeAgents}`}
          sub={p.faabAggression != null ? `~$${p.faabAggression} avg bid` : `${p.totalTransactions} moves total`}
        />
      </div>

      {behaviours.length > 0 && (
        <ul aria-label="Behaviours on record" className="mt-3 flex flex-wrap gap-1.5">
          {behaviours.map((b) => (
            <li key={b}>
              <Chip>{b}</Chip>
            </li>
          ))}
        </ul>
      )}
      <Disclosure className="mt-1" summary="The full read">
        {d.read}
      </Disclosure>

      <SectionHeader title="From their trade record" />
      <List aria-label="From their trade record">
        {d.approachTips.map((t, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <Lightbulb size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
            <span className="text-body text-ink">{t}</span>
          </li>
        ))}
      </List>

      <Tabs
        className="mt-6"
        label="Dossier sections"
        items={[
          { id: "trades", label: "Trades", content: tradesTab },
          { id: "record", label: "Record", content: recordTab },
          { id: "picks", label: "Picks", count: buybacks.length || undefined, content: picksTab },
        ]}
      />

      {/* Same rule as everywhere else a manager is named (lib/nav managerLinks). */}
      <SectionHeader title={isMe ? "Your own file" : `More on ${name}`} />
      <ManagerRail rosterId={rosterId} ownerId={p.userId ?? null} isMe={isMe} omit={[`/managers/${rosterId}`]} />

      <Onward from="/managers" />

      <Disclosure className="mt-3" summary="How this is read">
        Read from {p.totalTransactions} recorded moves ({signed(p.picks.net)} net picks).
        Behaviour, not stated intent. The window line is the one reading here that comes
        from what they hold rather than from what they have done.
      </Disclosure>
    </div>
  );
}
