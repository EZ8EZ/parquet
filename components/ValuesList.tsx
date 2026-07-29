"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PlayerRow } from "./PlayerRow";
import { cn } from "@/lib/ui";

export interface ValueRow {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  value: number;
  tier: string;
  espnId: string | null;
  owner?: string | null;
}

const FILTERS = ["All", "PG", "SG", "SF", "PF", "C"];

export function ValuesList({ rows }: { rows: ValueRow[] }) {
  const [pos, setPos] = useState("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        (pos === "All" || r.position === pos) &&
        (!s || r.name.toLowerCase().includes(s)),
    );
  }, [rows, pos, q]);

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players…"
            className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <div className="scroll-x flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setPos(f)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                pos === f
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {filtered.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right font-mono text-xs text-faint">
              {i + 1}
            </span>
            <div className="flex-1">
              <PlayerRow
                name={r.name}
                team={r.team}
                position={r.position}
                age={r.age}
                value={r.value}
                tier={r.tier}
                espnId={r.espnId}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No players match.</p>
        )}
      </div>
    </div>
  );
}
