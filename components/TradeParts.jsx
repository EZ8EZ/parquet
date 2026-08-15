/**
 * The pieces every trade surface shares: a manager, and a player's standing today.
 *
 * These three components were written for the trade web and were the only part of
 * that 1,546-line file worth keeping. They are server components now (the web had to
 * be a client component because its selection lived in `useState`, then in the query
 * string; a receipt and a rail have no selection at all), so nothing here ships JS
 * beyond the avatars' own error fallbacks.
 *
 * The FORMER-MANAGER GUARD is the reason `ManagerLink` exists as a component rather
 * than as markup at each call site. A departed principal routes to
 * `/managers/former/{ownerId}` rather than to the roster they no longer hold, and
 * never shows metric pills: fragility and TCI are properties of a roster as it stands
 * tonight, so attaching them to a departed manager silently borrows whoever replaced
 * them. That guard lives here so it cannot be forgotten at a new call site - and this
 * league's biggest trade in five seasons was made with a manager who has since left,
 * so it is load-bearing, not hypothetical.
 */
import Link from "next/link";
import { Layers } from "lucide-react";
import { Tag } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmtValue } from "@/lib/ui";
import { fragilityTone } from "@/lib/metrics/bands";
import { assetPlayerId } from "@/lib/tradegraph";
import { playerLineageHref } from "@/lib/tradegraph/url";
/**
 * Both proprietary metrics as two small tappable pills - the one place a PAST
 * decision connects to where things stand TODAY. The band's colour is conditioned on
 * posture for the same reason the lead is on /managers/compare: brittle is a threat
 * to a team playing for this season and a description of one that has already sold.
 */
function ManagerMetricPills({ metric, rosterId }) {
  if (!metric) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Link
        href="/league"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-micro font-semibold leading-normal text-muted transition-colors hover:text-ink"
      >
        <PostureTag posture={metric.posture}>{metric.tci} TCI</PostureTag>
        <span className="text-faint">{metric.posture}</span>
      </Link>
      {metric.fragility != null && metric.fragilityBand && (
        <Link
          href={`/managers/${rosterId}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-micro font-semibold leading-normal text-muted transition-colors hover:text-ink"
        >
          <Layers size={10} aria-hidden="true" className="shrink-0" />
          <Tag tone={fragilityTone(metric.fragilityBand, metric.posture)}>
            {Math.round(metric.fragility)} RFI
          </Tag>
        </Link>
      )}
    </span>
  );
}
export function ManagerLink({ node, metric, isMe }) {
  const href = node.isFormer
    ? `/managers/former/${node.ownerId}`
    : `/managers/${node.rosterId}`;
  // Two links side by side, deliberately NOT nested: the dossier link wraps only the
  // avatar and name, and the metric pills link out on their own. An <a> cannot
  // contain another <a> - the pills used to sit inside this link and React flagged
  // the resulting hydration mismatch (D30).
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0.5">
      <Link
        href={href}
        className="group -m-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[--radius-sm] p-1 text-left transition-colors hover:bg-surface-2"
      >
        <TeamAvatar
          name={node.name}
          avatarId={node.avatarId}
          teamLogoUrl={node.teamLogoUrl}
          size="xs"
          isMe={isMe}
        />
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-body font-semibold leading-snug text-ink group-hover:text-accent-text">
            {node.name}
          </span>
          {isMe ? (
            <Tag tone="accent">you</Tag>
          ) : (
            node.isFormer && (
              <Tag>former{node.tenureLabel ? ` ${node.tenureLabel}` : ""}</Tag>
            )
          )}
        </span>
      </Link>
      {!node.isFormer && (
        <ManagerMetricPills metric={metric} rosterId={node.rosterId} />
      )}
    </span>
  );
}
/**
 * A player-kind asset's CURRENT standing: avatar, value, tier, duration, holder.
 *
 * Priced with the exact `/values` recipe by the caller, so a tier label here never
 * disagrees with that page. The whole row links to the player's own provenance rail,
 * which is what closes the loop this feature is built around: trade -> asset ->
 * trade.
 */
export function PlayerNowRow({ assetKey, label, now, names }) {
  const pid = assetPlayerId(assetKey);
  if (!pid || !now) return null;
  return (
    <Link
      href={playerLineageHref(pid)}
      className="mt-1.5 flex items-center gap-1.5 rounded-[--radius-sm] border border-border bg-surface px-2 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
      aria-label={`${label}: worth ${fmtValue(now.value)} today. Open where he came from.`}
    >
      {/* The receipt never prints the player's NBA team anywhere in this row (value,
            tier and duration are all this app's own numbers) - the crest is the only
            place that context appears here, not a second copy of it. */}
      <PlayerAvatar
        name={label}
        team={now.team}
        playerId={pid}
        size="sm"
        teamBadge
      />
      <span className="min-w-0 flex-1">
        {/* THE NAME. It was absent for rounds, because this row only ever appeared
            underneath a tree node that had already printed it - on a receipt it is
            the whole row, and the first live render showed a value with nobody
            attached to it. */}
        <span className="block truncate text-body font-semibold leading-snug text-ink">
          {label}
        </span>
        <span className="block text-meta leading-snug text-muted">
          worth{" "}
          <span className="figure font-semibold text-ink">
            {fmtValue(now.value)}
          </span>{" "}
          today · {now.tier} · {now.duration.toFixed(1)}s
        </span>
        <span className="block truncate text-meta leading-snug text-secondary">
          {now.heldBy != null && names[now.heldBy]
            ? `now on ${names[now.heldBy]} · where he came from`
            : "where he came from"}
        </span>
      </span>
    </Link>
  );
}
