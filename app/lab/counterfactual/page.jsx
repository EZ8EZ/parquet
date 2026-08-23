import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex } from "@/lib/lineage";
import {
  buildCounterfactual,
  counterfactualOverlaps,
  describeCounterfactual,
} from "@/lib/lab/counterfactual";
import {
  Card,
  Disclosure,
  PageHeader,
  SectionHeader,
  Tag,
} from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The roster you never kept - Parquet Lab",
};
/**
 * Two split bars, hand-rolled (D3). Every coordinate is an integer: an unrounded
 * float serializes differently server-side and client-side, which React reports as a
 * hydration mismatch - a lesson this codebase has now learned twice.
 */
function SplitBars({ rows }) {
  const W = 320;
  const X = 4;
  const TRACK = W - X * 2;
  const max = Math.max(1, ...rows.map((r) => r.players + r.picks));
  const rowH = 46;
  const H = rows.length * rowH;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Roster value today against the trade-free roster"
    >
      {rows.map((r, i) => {
        const top = i * rowH;
        const pw = Math.round((r.players / max) * TRACK);
        const kw = Math.round((r.picks / max) * TRACK);
        return (
          <g key={r.label}>
            <text x={X} y={top + 12} fontSize="11" fill="var(--color-muted)">
              {r.label}
            </text>
            <text
              x={W - X}
              y={top + 12}
              fontSize="11"
              textAnchor="end"
              fill="var(--color-ink)"
              className="figure"
            >
              {fmtValue(r.players + r.picks)}
            </text>
            <rect
              x={X}
              y={top + 20}
              width={TRACK}
              height={16}
              rx={3}
              fill="var(--color-border)"
              opacity={0.5}
            />
            <rect
              x={X}
              y={top + 20}
              width={Math.max(1, pw)}
              height={16}
              rx={3}
              fill="var(--color-accent)"
            />
            <rect
              x={X + pw}
              y={top + 20}
              width={Math.max(1, kw)}
              height={16}
              rx={3}
              fill="var(--color-info)"
            />
          </g>
        );
      })}
    </svg>
  );
}
function Column({
  title,
  total,
  players,
  playerCount,
  picks,
  tci,
  duration,
  hypothetical,
}) {
  return (
    <div
      className={`rounded-[--radius-sm] border bg-surface p-3 ${hypothetical ? "border-dashed border-border-strong" : "border-border"}`}
    >
      <div className="text-meta uppercase tracking-wide text-secondary">
        {title}
      </div>
      <div className="figure text-display font-semibold leading-tight text-ink">
        {fmtValue(total)}
      </div>
      <dl className="mt-2 space-y-0.5 text-meta text-muted">
        <div className="flex justify-between gap-2">
          <dt>{playerCount} players</dt>
          <dd className="figure">{fmtValue(players)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Picks</dt>
          <dd className="figure">{fmtValue(picks)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>TCI</dt>
          <dd className="figure">{tci}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Duration</dt>
          <dd className="figure">{duration.toFixed(1)}s</dd>
        </div>
      </dl>
    </div>
  );
}
function PlayerLine({ p }) {
  return (
    <li className="flex items-center gap-2.5 border-b border-border py-1.5 last:border-0">
      {/* Same D73 gate as ValueAssetRow, /rank and the drafts board: a monogram disc
          repeated identically down every roster row (up to c.rosterSlots here) is
          decoration duplicating the name already printed beside it, so it only
          renders when this deploy has real photos on. */}
      {photosEnabled() && (
        <PlayerAvatar name={p.name} playerId={p.playerId} size="sm" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-1 text-note font-semibold leading-tight text-ink">
          {p.name}
        </span>
        <span className="block line-clamp-1 text-micro leading-snug text-faint">
          {p.origin}
        </span>
      </span>
      {p.stillHeld ? (
        <Tag tone="neutral">held</Tag>
      ) : (
        <Tag tone="accent">gone</Tag>
      )}
      <span className="w-14 shrink-0 text-right figure text-note text-ink">
        {p.priced ? fmtValue(p.value) : "n/a"}
      </span>
    </li>
  );
}
function Gaps({ c, overlaps, rosters }) {
  const lines = [
    `The pick is not the player. Where one of your picks was traded away, this credits you with whoever was actually taken at your slot, not whoever you would have taken. ${c.picksUsedByOthers} of your original picks were used by somebody else.`,
    "Waiver knock-on is invisible. Adds are kept whole, but a pickup that was only possible because a trade opened a roster spot cannot be told apart from one that would have happened anyway.",
    "Draft order was itself traded. Rookie order comes from the standings, and the standings were shaped by trades, so in a trade-free league every draft after the startup would have run in a different order. Not modelled.",
    `The record starts at ${c.boundarySeason}. Nothing before the first season in the league chain exists, so the counterfactual begins there.`,
  ];
  if (c.overflow > 0) {
    lines.push(
      `Roster limits are real. The trade-free version holds ${c.counterfactual.playerCount + c.overflow} priced players and you can only field ${c.rosterSlots}, so the ${c.overflow} least valuable are cut. Untrimmed they total ${fmtValue(c.hoardValue)}.`,
    );
  }
  if (c.unpriced.length > 0) {
    lines.push(
      `${c.unpriced.length} of these players are on no NBA roster today. The model prices from a consensus rank that no longer means anything for them, so they are listed separately and left out of every total rather than scored zero.`,
    );
  }
  if (!c.teamCheckAvailable) {
    lines.push(
      "This data source carries no NBA team affiliation, so the check for players who have left the league could not run. Everyone is priced.",
    );
  }
  if (overlaps > 0) {
    lines.push(
      `The ${rosters} counterfactuals do not add up to one league. ${overlaps} players are claimed by more than one, because each of those managers picked them up off waivers at some point and a trade-free wire would not have played out the same way.`,
    );
  }
  if (c.draftless) {
    lines.push(
      "No draft data is available, so only the waiver record is reconstructed.",
    );
  }
  return (
    <ul className="space-y-1.5">
      {lines.map((l, i) => (
        <li key={i} className="text-meta leading-snug text-muted">
          {l}
        </li>
      ))}
    </ul>
  );
}
export default async function CounterfactualPage() {
  const h = await getLeagueHistory();
  const index = await buildDraftIndex(h);
  const rosterId = h.me.rosterId ?? h.rosters[0]?.rosterId;
  if (rosterId == null) {
    return (
      <div>
        <PageHeader kicker="The Lab" title="The roster you never kept" />
        <Card>
          <p className="text-body text-muted">
            No roster to read. Pick a team first.
          </p>
        </Card>
      </div>
    );
  }
  const c = buildCounterfactual(h, rosterId, index);
  const overlaps = counterfactualOverlaps(h, index).size;
  const thesis = describeCounterfactual(c);
  const kept = c.players.filter((p) => p.kept);
  return (
    <div>
      <PageHeader
        kicker="The Lab"
        title="The roster you never kept"
        subtitle={`${c.teamName ?? c.ownerName}, if no trade had ever happened.`}
        action={<ExperimentBadge />}
      />

      <Card>
        {thesis.map((line, i) => (
          <p
            key={i}
            className={`text-body leading-relaxed ${i === 0 ? "text-ink" : "mt-1.5 text-muted"}`}
          >
            {line}
          </p>
        ))}
      </Card>

      <div className="mt-3">
        <SplitBars
          rows={[
            {
              label: "Today",
              players: c.actual.playerValue,
              picks: c.actual.pickValue,
            },
            {
              label: "Never traded",
              players: c.counterfactual.playerValue,
              picks: c.counterfactual.pickValue,
            },
          ]}
        />
        <div className="flex gap-3 text-micro text-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            Players
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-info" />
            Picks
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Column
          title="You hold"
          total={c.actual.total}
          players={c.actual.playerValue}
          playerCount={c.actual.playerCount}
          picks={c.actual.pickValue}
          tci={c.actual.coherence.tci}
          duration={c.actual.coherence.rosterDuration}
        />
        <Column
          title="Never traded"
          total={c.counterfactual.total}
          players={c.counterfactual.playerValue}
          playerCount={c.counterfactual.playerCount}
          picks={c.counterfactual.pickValue}
          tci={c.counterfactual.coherence.tci}
          duration={c.counterfactual.coherence.rosterDuration}
          hypothetical
        />
      </div>

      <SectionHeader title="The trade-free roster" />
      <p className="mb-2 text-meta leading-snug text-secondary">
        Your startup haul, every pick you were born with resolved to the player
        it became, and every waiver add you never dropped. Trimmed by value to
        the {c.rosterSlots} spots you actually field.
      </p>
      <ul>
        {kept.map((p) => (
          <PlayerLine key={p.playerId} p={p} />
        ))}
      </ul>

      {c.unpriced.length > 0 && (
        <>
          <SectionHeader title="Not priced" />
          <p className="mb-2 text-meta leading-snug text-secondary">
            On no NBA roster today. Listed rather than scored zero, and excluded
            from every total above.
          </p>
          <ul>
            {c.unpriced.map((p) => (
              <PlayerLine key={p.playerId} p={p} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-5">
        <Disclosure summary="What this cannot know">
          <Gaps c={c} overlaps={overlaps} rosters={h.rosters.length} />
        </Disclosure>
      </div>

      <p className="mt-2 text-meta leading-snug text-secondary">
        Both columns are priced with the same model as{" "}
        <Link href="/values" className="text-accent-text">
          asset values
        </Link>
        , and scored for coherence with the same index as{" "}
        <Link href="/league" className="text-accent-text">
          the league timeline
        </Link>
        . There is no verdict here on purpose: trading value for pick capital is
        a strategy, and the two columns are the argument, not the answer.
      </p>
    </div>
  );
}
