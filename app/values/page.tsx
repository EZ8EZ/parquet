import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { cachedValuePlayers } from "@/lib/valuation";
import { computeTiers, tierResolver } from "@/lib/rankings/tiers";
import { ValuesList, type ValueRow } from "@/components/ValuesList";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ValuesPage() {
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

  const rows: ValueRow[] = [...h.players.values()]
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
        injuryStatus: p.injuryStatus,
        // The whole reason a row is tappable: the exact chain that produced the number.
        breakdown: {
          base: v.base,
          age: v.ageMultiplier,
          injury: v.injuryMultiplier,
          role: v.roleMultiplier,
          position: v.positionMultiplier,
        },
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 260);

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
          distribution actually cliffs. Tap any row for its multipliers.
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

      <ValuesList rows={rows} />
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
