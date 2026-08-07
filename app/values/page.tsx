import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { cachedValuePlayers, injuryLabel } from "@/lib/valuation";
import { computeTiers, tierResolver } from "@/lib/rankings/tiers";
import { ValuesList, type ValueRow } from "@/components/ValuesList";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ValuesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
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
  const tiers = computeTiers(valuesDesc, { floor: (valuesDesc[0] ?? 0) * 0.1 });
  const tierFor = tierResolver(tiers);

  const sortedRows: ValueRow[] = [...h.players.values()]
    .map((p) => {
      const v = values.get(p.playerId)!;
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
      };
    })
    .sort((a, b) => b.value - a.value);

  let rows: ValueRow[] = sortedRows.filter((r) => r.value > 0).slice(0, 260);

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
      <header className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Dynasty values
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">
            Asset values
          </h1>
          <Link
            href="/methodology"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-3 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Methodology
          </Link>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted">
          A transparent, tunable model - not a scraped market. Computed from this
          league&apos;s own scoring settings. Tiers break where the value
          distribution actually cliffs.
        </p>
        <dl className="mt-2 grid grid-cols-3 divide-x divide-border rounded-[--radius-sm] border border-border bg-surface/60">
          <Figure label="ranked" value={`${rows.length}`} />
          <Figure label="top value" value={top ? fmtValue(top.value) : "-"} sub={top?.name} />
          <Figure
            label="median"
            value={fmtValue(median)}
            sub={`${franchise} franchise tier`}
          />
        </dl>
      </header>

      {/* This is somebody else's board (Sleeper's search rank). /rank is where
          that stops being true - drag your own order in and blend it against
          this one at whatever weight you trust. */}
      <nav aria-label="Values sections" className="mt-2 flex gap-1.5">
        <Link
          href="/rank"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface/60 px-3 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
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
        can never turn into a render-mode surprise later (same reasoning as /web -
        see app/web/page.tsx).
      */}
      <Suspense fallback={null}>
        <ValuesList rows={rows} />
      </Suspense>
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="min-w-0 px-2.5 py-1.5">
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="truncate font-mono text-base font-semibold tnum text-ink">
        {value}
      </dd>
      {sub && <dd className="truncate text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
