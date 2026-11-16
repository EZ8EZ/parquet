import { cachedValuePlayers } from "@/lib/valuation";
import { leagueCrunch } from "@/lib/crunch";
import { seasonPhase } from "@/lib/actions";
import { fmtValue } from "@/lib/ui";
import { AlertTriangle } from "lucide-react";
import { Card, Disclosure, StatTile, Tag } from "@/components/ui";
/**
 * BEFORE TIP-OFF: THE ROSTER CRUNCH, AS COUNTS.
 *
 * After the rookie draft a roster can hold more players than it has active slots, and
 * Sleeper blocks an over-limit team at lock until it complies. This panel prints the
 * arithmetic lib/crunch already does - active count against the limit, taxi slots
 * open, which taxi-eligible players sit outside the roster's top-N by value, and the
 * lowest-value players by the same value - plus the league-wide list of players that
 * arithmetic counts as releases on OTHER over-limit rosters (pickup targets).
 *
 * It measures; it does not choose (D6). "Cut candidate" means "lowest value on this
 * roster", nothing more; the engine's own header lists what it ignores (positional
 * slot fit, taxi_allow_vets, acquisition-date taxi rules, validity of players already on IR). Players with
 * yearsExp 0 are treated as just drafted: listed last, labelled, and never counted as
 * likely releases - an owner may still cut one, we just do not predict it (D19).
 *
 * Names are plain text: PlayerRow, the house player-row, links nowhere, so a link here
 * would invent a pattern rather than follow one. No `truncate`/`line-clamp` on names -
 * a cut list whose names are clipped is a list you cannot act on.
 */

/** Rookies, read as yearsExp === 0 on the player record (unknown exp is not a rookie). */
function rookieIdsOf(h) {
  const ids = new Set();
  for (const r of h?.rosters ?? []) {
    for (const id of r.players ?? []) {
      if (h.players?.get?.(id)?.yearsExp === 0) ids.add(id);
    }
  }
  return ids;
}

/**
 * The league crunch with the viewer's roster picked out. Null when the roster is not
 * in this corpus (rosterCrunch throws on an unknown id; a page must not).
 */
export function crunchFor(h, rosterId) {
  if (!(h?.rosters ?? []).some((r) => r.rosterId === rosterId)) return null;
  const values = cachedValuePlayers(h);
  const valueOf = (id) => values.get(id)?.value ?? 0;
  const league = leagueCrunch(h, valueOf, { rookieIds: rookieIdsOf(h) });
  const mine = league.rosters.find((c) => c.rosterId === rosterId) ?? null;
  return mine ? { mine, likelyReleases: league.likelyReleases } : null;
}

/** Whether there is anything to measure: over the limit, or a stash available. */
export function crunchIsRelevant(c) {
  return (
    c != null &&
    (c.overBy > 0 ||
      (c.taxiOpen > 0 && c.taxiDeadline?.passed !== true && c.taxiSuggestions.length > 0) ||
      (c.reserveOpen > 0 && (c.irSuggestions ?? []).length > 0))
  );
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function teamLabel(h, ownerId, rosterId) {
  const u = ownerId ? h.usersById?.get(ownerId) : undefined;
  return u?.teamName ?? u?.displayName ?? `Roster ${rosterId}`;
}

function NameRow({ name, value, children }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="text-body font-semibold text-ink">{name}</span>
        {children && <span className="mt-0.5 flex flex-wrap items-center gap-1.5">{children}</span>}
      </span>
      <span className="figure shrink-0 text-body font-semibold text-ink">{fmtValue(Math.round(value))}</span>
    </li>
  );
}

/** A sub-list's heading inside the panel: sentence case, one size up from a label. */
function ListTitle({ children }) {
  return <h3 className="mt-4 text-note font-semibold text-ink">{children}</h3>;
}

function Injured({ children = "injured" }) {
  return (
    <Tag size="sm" tone="warn" icon={AlertTriangle}>
      {children}
    </Tag>
  );
}

/**
 * @param {{ h: any, rosterId: number|string, onlyWhenRelevant?: boolean, className?: string }} props
 */
export function RosterCrunchPanel({ h, rosterId, onlyWhenRelevant = false, className }) {
  const crunch = crunchFor(h, rosterId);
  if (!crunch) return null;
  const { mine: c, likelyReleases } = crunch;
  if (onlyWhenRelevant && !crunchIsRelevant(c)) return null;

  const limit = c.limits.active;
  const countValue = `${c.counts.active} of ${limit}`;
  const countSub =
    c.overBy > 0 ? `${c.overBy} over` : c.openSpots > 0 ? `${c.openSpots} open` : "full";

  // One standfirst line: a count, not a command.
  const relief = [
    c.taxiMoves > 0 ? `${c.taxiMoves} can go to taxi` : null,
    c.irMoves > 0 ? `${c.irMoves} to IR` : null,
  ].filter(Boolean);
  const standfirst =
    c.overBy > 0
      ? `Sleeper will require ${plural(c.overBy, "move")} before lock` +
        (relief.length > 0
          ? ` - ${relief.join(", ")}, ${plural(c.mustCut, "release")} by count.`
          : ".")
      : `${c.counts.active} of ${limit} active spots used; ${plural(c.taxiOpen, "taxi slot")} open.`;

  // Taxi deadline, as a fact: closed (no taxi moves counted), or when it closes.
  const deadline = c.taxiDeadline ?? { week: null, passed: false };
  const deadlineNote =
    deadline.week == null
      ? null
      : deadline.passed === true
        ? `Taxi moves closed after week ${deadline.week}; none are counted.`
        : `Taxi moves close after week ${deadline.week}.`;

  const irList = c.reserveOpen > 0 ? (c.irSuggestions ?? []).slice(0, Math.max(c.reserveOpen, 2)) : [];

  const stash = c.taxiOpen > 0 && deadline.passed !== true ? c.taxiSuggestions.slice(0, Math.max(c.taxiOpen, 2)) : [];
  const unprotected = c.cutCandidates.filter(
    (p) => !p.protected && !p.reasonFlags.includes("taxiStash") && !p.reasonFlags.includes("irStash"),
  );
  const cuts = unprotected.slice(0, Math.max(c.mustCut + 2, 3));
  const rookies = c.cutCandidates.filter((p) => p.protected).slice(0, 3);
  const pickups = likelyReleases.filter((p) => p.rosterId !== rosterId).slice(0, 6);

  return (
    <Card className={className}>
      <h2 className="text-lede font-semibold text-ink">
        {seasonPhase(h).phase === "preseason" ? "Before tip-off" : "Roster limits"}
      </h2>
      <p className="mt-0.5 text-note text-muted">{standfirst}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile
          className="bg-surface-2"
          size="sm"
          label="Active roster"
          value={countValue}
          sub={countSub}
          tone={c.overBy > 0 ? "negative" : "neutral"}
        />
        <StatTile
          className="bg-surface-2"
          size="sm"
          label="Taxi"
          value={`${c.counts.taxi} of ${c.limits.taxi}`}
          sub={`${c.taxiOpen} open`}
        />
      </div>
      {deadlineNote && <p className="mt-1.5 text-meta text-secondary">{deadlineNote}</p>}

      {stash.length > 0 && (
        <>
          <ListTitle>Taxi-eligible, outside your top starters</ListTitle>
          <ul className="divide-y divide-border">
            {stash.map((p) => (
              <NameRow key={p.playerId} name={p.name} value={p.value}>
                {p.reasonFlags.includes("rookie") && <Tag size="sm">just drafted</Tag>}
                {p.reasonFlags.includes("injured") && <Injured />}
              </NameRow>
            ))}
          </ul>
        </>
      )}

      {irList.length > 0 && (
        <>
          <ListTitle>IR-eligible, with an open IR slot</ListTitle>
          <ul className="divide-y divide-border">
            {irList.map((p) => (
              <NameRow key={p.playerId} name={p.name} value={p.value}>
                <Injured>{h.players?.get?.(p.playerId)?.injuryStatus ?? "injured"}</Injured>
              </NameRow>
            ))}
          </ul>
        </>
      )}

      {c.overBy > 0 && (
        <>
          <ListTitle>Lowest value on this roster</ListTitle>
          <ul className="divide-y divide-border">
            {cuts.map((p) => (
              <NameRow key={p.playerId} name={p.name} value={p.value}>
                {p.reasonFlags.includes("injured") && <Injured />}
                {p.reasonFlags.includes("noTeam") && <Tag size="sm">no NBA team</Tag>}
              </NameRow>
            ))}
            {rookies.map((p) => (
              <NameRow key={p.playerId} name={p.name} value={p.value}>
                <Tag size="sm" tone="accent">
                  just drafted
                </Tag>
              </NameRow>
            ))}
          </ul>
        </>
      )}

      {(c.overBy > 0 || pickups.length > 0) && (
        <Disclosure
          className="-mb-2 mt-2"
          summary={
            pickups.length > 0
              ? `Likely to hit waivers (${pickups.length})`
              : "Likely to hit waivers: none counted"
          }
        >
          {pickups.length > 0 ? (
            <ul className="divide-y divide-border">
              {pickups.map((p) => (
                <NameRow key={`${p.rosterId}:${p.playerId}`} name={p.name} value={p.value}>
                  <span className="text-meta text-secondary">{teamLabel(h, p.ownerId, p.rosterId)}</span>
                </NameRow>
              ))}
            </ul>
          ) : (
            <p>No other roster is over the limit, so no releases are counted league-wide.</p>
          )}
          <p className="mt-2">
            Each over-limit roster&apos;s lowest-value players after taxi and IR, by count - not a report
            of what any owner will do. Just-drafted rookies are never counted.
          </p>
        </Disclosure>
      )}
    </Card>
  );
}
