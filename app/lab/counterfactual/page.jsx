import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex } from "@/lib/lineage";
import { buildCounterfactual, counterfactualOverlaps, describeCounterfactual } from "@/lib/lab/counterfactual";
import { BarList, Card, Chip, Disclosure, EmptyState, List, ListRow, PageHeader, SectionHeader, StatTile } from "@/components/ui";
import { Onward } from "@/components/Onward";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The roster you never kept - Parquet Lab",
};
/*
 * THE ROSTER YOU NEVER KEPT. The page answers "what would this roster be worth if no
 * trade had ever happened?": today's total against the trade-free total as tiles and
 * bars, the two side by side on players, picks, TCI and duration, then the trade-free
 * roster as rows. Both are priced by the same model as /values (lib/lab/counterfactual).
 * No verdict (D6): trading value for pick capital is a strategy; the two columns are
 * the argument, not the answer. The gaps are one tap away.
 */
function PlayerLine({ p }) {
  return (
    <li>
      <ListRow
        avatar={photosEnabled() ? <PlayerAvatar name={p.name} playerId={p.playerId} size="sm" /> : null}
        title={p.name}
        badge={p.stillHeld ? <Chip size="sm">held</Chip> : <Chip size="sm" tone="accent">gone</Chip>}
        meta={p.origin}
        value={p.priced ? fmtValue(p.value) : "unknown"}
      />
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
    <ul className="list-disc space-y-1.5 pl-4">
      {lines.map((l, i) => (
        <li key={i}>
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
  const badge = (
    <Chip tone="warn" size="sm" icon={FlaskConical}>
      Experiment
    </Chip>
  );
  if (rosterId == null) {
    return (
      <div>
        <PageHeader kicker="Team" title="The roster you never kept" aside={badge} />
        <EmptyState title="No roster to read" cta={{ href: "/teams", label: "Pick a team" }}>
          Pick a team first.
        </EmptyState>
      </div>
    );
  }
  const c = buildCounterfactual(h, rosterId, index);
  const overlaps = counterfactualOverlaps(h, index).size;
  const thesis = describeCounterfactual(c);
  const kept = c.players.filter((p) => p.kept);
  const sides = [
    { key: "today", label: "You hold", s: c.actual },
    { key: "never", label: "Never traded", s: c.counterfactual },
  ];
  return (
    <div>
      <PageHeader
        kicker={c.teamName ?? c.ownerName}
        title="The roster you never kept"
        subtitle="If no trade had ever happened"
        aside={badge}
      />

      <div className="grid grid-cols-2 gap-2">
        {sides.map(({ key, label, s }) => (
          <StatTile
            key={key}
            label={label}
            value={fmtValue(s.total)}
            tone={key === "today" ? "accent" : "neutral"}
            sub={`${fmtValue(s.playerValue)} players · ${fmtValue(s.pickValue)} picks`}
          />
        ))}
      </div>
      <Card className="mt-2">
        <BarList
          label="Total value today against the trade-free roster"
          format={fmtValue}
          items={[
            { key: "today", label: "You hold", value: c.actual.total, highlight: true },
            { key: "never", label: "Never traded", value: c.counterfactual.total },
          ]}
        />
        <table className="mt-3 w-full text-note">
          <thead>
            <tr className="text-meta text-secondary">
              <th scope="col" className="pb-1.5 text-left font-medium">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="pb-1.5 text-right font-medium">You hold</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Never traded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ["Players", (s) => `${s.playerCount}`],
              ["TCI", (s) => `${s.coherence.tci}`],
              ["Duration", (s) => `${s.coherence.rosterDuration.toFixed(1)}s`],
            ].map(([name, f]) => (
              <tr key={name}>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">{name}</th>
                <td className="py-1.5 text-right figure font-semibold text-ink">{f(c.actual)}</td>
                <td className="py-1.5 text-right figure font-semibold text-ink">{f(c.counterfactual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {thesis.length > 0 && (
          <Disclosure className="-mb-2 mt-1" summary="The read">
            {thesis.map((line, i) => (
              <p key={i} className={i ? "mt-2" : undefined}>
                {line}
              </p>
            ))}
          </Disclosure>
        )}
      </Card>

      <SectionHeader title="The trade-free roster" />
      <p className="-mt-1 mb-2 text-meta text-secondary">
        Startup haul, original picks as the players they became, waiver adds kept; top {c.rosterSlots} by value.
      </p>
      <List aria-label="The trade-free roster">
        {kept.map((p) => (
          <PlayerLine key={p.playerId} p={p} />
        ))}
      </List>

      {c.unpriced.length > 0 && (
        <Disclosure
          className="mt-2"
          summary={`${c.unpriced.length} not priced: on no NBA roster, left out of totals`}
          bodyClassName="bg-transparent p-0"
        >
          <List aria-label="Not priced">
            {c.unpriced.map((p) => (
              <PlayerLine key={p.playerId} p={p} />
            ))}
          </List>
        </Disclosure>
      )}

      <Disclosure summary="What this cannot know">
        <Gaps c={c} overlaps={overlaps} rosters={h.rosters.length} />
        <p className="mt-2">
          Both columns use the same model as{" "}
          <Link href="/values" className="font-semibold text-accent-text underline underline-offset-2">
            asset values
          </Link>{" "}
          and the same coherence index as{" "}
          <Link href="/league" className="font-semibold text-accent-text underline underline-offset-2">
            the league timeline
          </Link>
          . No verdict on purpose: the two columns are the argument, not the answer.
        </p>
      </Disclosure>
      <Onward from="/lab/counterfactual" />
    </div>
  );
}
