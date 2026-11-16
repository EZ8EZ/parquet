import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { depthChartsByTeam, depthRowFor } from "@/lib/depth";
import { cachedValuePlayers, injuryLabel } from "@/lib/valuation";
import {
  productionRowRefusal,
  rosteredWeeksBelowFloor,
} from "@/lib/valuation/production";
import { refusalSentence } from "@/lib/refusal";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { ValuesList } from "@/components/ValuesList";
import { VALUE_ROWS } from "@/lib/values/url";
import { fmtValue } from "@/lib/ui";
import { Onward } from "@/components/Onward";
import { ButtonLink, Disclosure, PageHeader, StatTile } from "@/components/ui";
import { MarketGapList } from "@/components/MarketGapList";
import { marketGaps, marketSourceCounts } from "@/lib/marketgap";
export const dynamic = "force-dynamic";
export default async function ValuesPage({ searchParams }) {
  const sp = await searchParams;
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const h = await getLeagueHistory();
  const values = cachedValuePlayers(h);
  // Tiers break where the value distribution actually cliffs, not at hardcoded
  // thresholds. The floor (10% of the top asset) bounds the cliff search to assets
  // anyone actually tiers - without it the biggest relative drops all sit between
  // junk values in the tail. Same recipe as /roster, so labels agree everywhere.
  const valuesDesc = [...values.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tiers = leagueTiers(valuesDesc);
  const tierFor = tierResolver(tiers);
  // Thirty charts built ONCE and read 260 times: `depthLineFor` off a prebuilt index
  // is O(1) per row, where deriving per row would walk all 2,108 players 260 times
  // (see lib/depth's `depthChartsByTeam`).
  const charts = depthChartsByTeam(h.players);
  const sortedRows = [...h.players.values()]
    .map((p) => {
      const v = values.get(p.playerId);
      return {
        id: p.playerId,
        name: p.fullName,
        team: p.team,
        position: p.position,
        age: p.age,
        value: v.value,
        tier: tierFor(v.value)?.label ?? "Fringe",
        espnId: p.espnId,
        injury: injuryLabel(
          {
            status: p.injuryStatus,
            bodyPart: p.injuryBodyPart,
            notes: p.injuryNotes,
          },
          { short: true },
        ),
        injuryDetail: injuryLabel({
          status: p.injuryStatus,
          bodyPart: p.injuryBodyPart,
          notes: p.injuryNotes,
        }),
        consensusRank: p.searchRank,
        // BOTH RANKS, plus whether the second one rests on anything. The row used to
        // carry only the consensus ordinal, which is the one number the model had
        // already stopped pricing from - see components/ValuesList.jsx.
        pricedRank: v.rank,
        productionBacked: v.productionBacked,
        // The refusal, built HERE rather than in the row: the row is a client
        // component, and the words plus the rostered-week count behind them belong to
        // the module that owns the condition. Null means this league never rostered
        // him in the window, which `productionRowRefusal` words differently from a
        // count - it never prints an invented zero.
        productionRefusal: v.productionBacked
          ? null
          : refusalSentence(
              productionRowRefusal(
                p.fullName,
                rosteredWeeksBelowFloor(p.playerId),
              ),
            ),
        depth: depthRowFor(charts, p),
      };
    })
    .sort((a, b) => b.value - a.value);
  let rows = sortedRows.filter((r) => r.value > 0).slice(0, VALUE_ROWS);
  // A `?focus=` link (search's only deep link for a player - see
  // lib/values/url.ts) must never land on nothing. Most searched players are
  // already inside the top 260, but a deep bench name with real but tiny value
  // would otherwise fall off the cap and the link would silently show an empty
  // page. Appended rather than re-sorted in: the list order is "value desc",
  // and a focused row this far down does not deserve to look like a top asset.
  if (focus && !rows.some((r) => r.id === focus)) {
    const extra = sortedRows.find((r) => r.id === focus);
    if (extra) rows = [...rows, extra];
  }
  // Cheap headline figures so the top of the page carries data, not just prose.
  const top = rows[0];
  const median = rows.length ? rows[Math.floor(rows.length / 2)].value : 0;
  const franchise = rows.filter((r) => r.tier === "Franchise").length;
  // Model vs market, whole league (lib/marketgap). Owner labels come off the corpus;
  // the viewer's own rows are marked in the list, not filtered to.
  const gaps = marketGaps(h, { values });
  const ownerName = new Map(
    h.rosters.map((r) => {
      const u = r.ownerId ? h.usersById.get(r.ownerId) : undefined;
      return [r.rosterId, u?.teamName || u?.displayName || `Roster ${r.rosterId}`];
    }),
  );
  // Which market the priced ordinals start from, stated once rather than per row.
  const sources = marketSourceCounts(values);
  const sourceLine = [
    sources.blend && `${sources.blend} dynasty/redraft blend`,
    sources.dynasty && `${sources.dynasty} dynasty ADP only`,
    sources.redraft && `${sources.redraft} redraft rank only`,
  ]
    .filter(Boolean)
    .join(", ");
  // The dataset's own caveat, said once: how many values rest on consensus alone.
  const consensusOnly = rows.filter((r) => r.productionBacked === false).length;
  return (
    <div>
      <PageHeader
        kicker="Trade"
        title="Asset values"
        subtitle="This league's scoring, one value scale"
        aside={
          <ButtonLink href="/rank" variant="secondary" size="sm">
            Your ranking
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <StatTile size="sm" label="Ranked" value={`${rows.length}`} sub="players" />
        <StatTile size="sm" label="Top value" value={top ? fmtValue(top.value) : "-"} sub={top?.name} />
        <StatTile size="sm" label="Median" value={fmtValue(median)} sub={`${franchise} franchise tier`} />
      </div>
      <Disclosure className="mt-1" summary="How values are built">
        <p>
          A transparent, tunable model, not a scraped market, computed from this
          league&apos;s scoring settings. Tiers break where the value distribution cliffs.
        </p>
        {sourceLine && <p className="mt-2">Market ordinal: Sleeper, as of today ({sourceLine}).</p>}
        {consensusOnly > 0 && (
          <p className="mt-2">
            {consensusOnly === rows.length
              ? "Every value here is priced from consensus alone: this league has no eight-week production record to reorder them with."
              : `${consensusOnly} of ${rows.length} players are priced from consensus alone (under eight rostered weeks here); each says so in its sheet.`}
          </p>
        )}
        <Link href="/methodology" className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent-text">
          Methodology
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </Disclosure>

      {/* Hidden entirely when there are no disagreements (the production term is off,
          D121), so no empty heading is left behind. */}
      <MarketGapList gaps={gaps} ownerName={ownerName} myRosterId={h.me?.rosterId ?? null} />

      {/* Suspense because ValuesList reads the query string through useSearchParams. */}
      <div className="mt-3">
        <Suspense fallback={null}>
          <ValuesList rows={rows} />
        </Suspense>
      </div>
      <Onward from="/values" />
    </div>
  );
}
