"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet } from "@/components/ui";
import { cn } from "@/lib/ui";
import { parseTypedScore } from "@/lib/lockin/assumeView";
import { useAssumeNav } from "./AssumeTile";

const keyOf = (t) => `${t.side}:${t.index}`;

/** Starting state of one row from the board: the assumption already applied, if any. */
function initial(t) {
  if (t.assumed === "locked") return { state: "locked", score: t.typedScore != null ? String(t.typedScore) : "" };
  if (t.assumed === "open") return { state: "open", score: "" };
  return { state: null, score: "" };
}

/**
 * Every slot on both sides in one list: leave it to the model, treat it as locked (at
 * the score it holds, or a score you type), or treat it as playing on. Apply re-renders
 * the page with the new ?assume= (marks are kept until changed, D141; typed scores are not). The
 * same choices the slot tiles offer, gathered so several can be set at once.
 */
export function WhatIfPanel({ mine, theirs, themName }) {
  const rows = [...mine.map((t) => ({ ...t, side: "mine" })), ...theirs.map((t) => ({ ...t, side: "theirs" }))].filter((t) => t.choices);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => Object.fromEntries(rows.map((t) => [keyOf(t), initial(t)])));
  const { go, pending } = useAssumeNav();
  const canLockAsIs = (t) => t.choices.options.some((o) => o.state === "locked");
  const canOpen = (t) => t.choices.options.some((o) => o.state === "open");

  const problems = rows.filter((t) => {
    const s = sel[keyOf(t)];
    if (s?.state !== "locked") return false;
    const typed = s.score.trim() === "" ? null : parseTypedScore(s.score);
    return (s.score.trim() !== "" && typed == null) || (typed == null && !canLockAsIs(t));
  });

  const apply = () => {
    const list = [];
    for (const t of rows) {
      const s = sel[keyOf(t)];
      if (!s?.state) continue;
      if (s.state === "open") list.push({ side: t.side, slot: t.index, state: "open" });
      else {
        const typed = s.score.trim() === "" ? null : parseTypedScore(s.score);
        list.push(typed != null ? { side: t.side, slot: t.index, state: "locked", score: typed } : { side: t.side, slot: t.index, state: "locked" });
      }
    }
    // closing the sheet pops its history entry first (Sheet.jsx); navigate after that lands
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      go(list);
    };
    window.addEventListener("popstate", fire, { once: true });
    setTimeout(fire, 400);
    setOpen(false);
  };

  const set = (t, patch) => setSel((m) => ({ ...m, [keyOf(t)]: { ...m[keyOf(t)], ...patch } }));
  const section = (side, title) => {
    const list = rows.filter((t) => t.side === side);
    if (!list.length) return null;
    return (
      <section>
        <h3 className="text-note font-semibold text-ink">{title}</h3>
        <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-card bg-surface-2">
          {list.map((t) => {
            const s = sel[keyOf(t)] ?? { state: null, score: "" };
            const seg = (state, label, enabled = true) => (
              <button
                type="button"
                disabled={!enabled}
                aria-pressed={s.state === state}
                onClick={() => set(t, { state })}
                className={cn("min-h-10 flex-1 rounded-control px-2 text-meta font-semibold transition-colors disabled:opacity-40", s.state === state ? "bg-accent text-accent-ink" : "text-muted hover:bg-elevated")}
              >
                {label}
              </button>
            );
            return (
              <li key={keyOf(t)} className="px-3 py-2.5">
                <p className="flex items-baseline justify-between gap-2 text-note">
                  <span className="min-w-0">
                    <span className="mr-1.5 text-micro font-semibold text-secondary">{t.label}</span>
                    <span className="font-semibold text-ink">{t.name ?? "empty"}</span>
                  </span>
                  <span className="figure shrink-0 text-meta text-secondary">{t.value != null ? `has ${Number(t.value).toFixed(1)}` : "not played yet"}</span>
                </p>
                <div className="mt-1.5 flex gap-1 rounded-control bg-bg p-1" role="group" aria-label={`${t.label} ${t.name ?? ""}: treat as`}>
                  {seg(null, "Model")}
                  {seg("locked", "Locked")}
                  {seg("open", "Playing on", canOpen(t))}
                </div>
                {s.state === "locked" && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <label htmlFor={`wi-${keyOf(t)}`} className="text-meta text-secondary">
                      at
                    </label>
                    <input
                      id={`wi-${keyOf(t)}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={s.score}
                      onChange={(e) => set(t, { score: e.target.value })}
                      placeholder={canLockAsIs(t) && t.value != null ? `${Number(t.value).toFixed(1)} (now)` : "type a score"}
                      className="figure min-h-10 w-32 rounded-control bg-bg px-3 text-note text-ink outline-1 outline-border-strong focus-visible:outline-2 focus-visible:outline-accent"
                    />
                    <span className="text-micro text-secondary">{canLockAsIs(t) ? "blank = the score it holds" : "needs a score"}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  if (!rows.length) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      trigger={
        <span className={cn("mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-surface-2 px-3 text-note font-semibold text-accent-text", pending && "animate-pulse motion-reduce:animate-none")}>
          <SlidersHorizontal size={15} aria-hidden="true" />
          What if… lock players or type scores
        </span>
      }
      triggerLabel="What if: lock players or type scores, on either side"
      triggerClassName="block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      title="What if?"
      subtitle="Set any slot, then apply. Locked and playing-on marks stay until you change them or press Reset; typed scores are for this visit only."
    >
      <div className="space-y-4" data-whatif-panel>
        {section("mine", "Your slots")}
        {section("theirs", themName ? `${themName}'s slots` : "Their slots")}
        <p className="text-meta text-secondary">Locked: the slot keeps that score for the week and its later games stop counting. Playing on: the slot is not locked and keeps playing. Every number on the page follows: rough win chance, projections, the model&apos;s calls.</p>
        {problems.length > 0 && <p className="text-meta text-warn">Type a score from 0 to 150 for {problems.map((t) => `${t.label} ${t.name ?? ""}`.trim()).join(", ")}.</p>}
        <button type="button" onClick={apply} disabled={problems.length > 0 || pending} className="min-h-12 w-full rounded-control bg-accent text-body font-semibold text-accent-ink disabled:opacity-50">
          Apply
        </button>
      </div>
    </Sheet>
  );
}
