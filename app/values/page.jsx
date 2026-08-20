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
import { PageHeader } from "@/components/ui";
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
  return (
    <div>
      <PageHeader
        kicker="Dynasty values"
        title="Asset values"
        action={
          <Link
            href="/methodology"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-3 text-note leading-snug font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            Methodology
          </Link>
        }
        subtitle={
          <>
            A transparent, tunable model - not a scraped market. Computed from
            this league&apos;s own scoring settings. Tiers break where the value
            distribution actually cliffs.
          </>
        }
      >
        <dl className="mt-2 grid grid-cols-3 divide-x divide-border rounded-[--radius-sm] border border-border bg-surface">
          <Figure label="ranked" value={`${rows.length}`} />
          <Figure
            label="top value"
            value={top ? fmtValue(top.value) : "-"}
            sub={top?.name}
          />
          <Figure
            label="median"
            value={fmtValue(median)}
            sub={`${franchise} franchise tier`}
          />
        </dl>
      </PageHeader>

      {/* This is somebody else's board (Sleeper's search rank). /rank is where
            that stops being true - drag your own order in and blend it against
            this one at whatever weight you trust. */}
      <nav aria-label="Values sections" className="mt-2 flex gap-1.5">
        <Link
          href="/rank"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note leading-snug font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
        >
          Build your own ranking
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </nav>

      {/*
          Suspense because ValuesList reads the query string through useSearchParams -
          filters, sort, page size and a focused row are all addressable now
          (lib/values/url.ts), so returning from a dossier or a search result lands
          back where you were instead of row 1. This page is force-dynamic, so the
          boundary never actually suspends in practice; it is here so that dependency
          can never turn into a render-mode surprise later (same reasoning the deleted
          /web carried - see D30/D37).
        */}
      <Suspense fallback={null}>
        <ValuesList rows={rows} />
      </Suspense>
      <Onward from="/values" />
    </div>
  );
}
function Figure({ label, value, sub }) {
  return (
    <div className="min-w-0 px-2.5 py-1.5">
      <dt className="text-meta uppercase tracking-wide text-secondary">
        {label}
      </dt>
      <dd className="truncate figure text-lede leading-snug font-semibold text-ink">
        {value}
      </dd>
      {sub && <dd className="truncate text-meta text-muted">{sub}</dd>}
    </div>
  );
}
