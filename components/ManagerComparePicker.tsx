"use client";

/**
 * The two-manager picker for /managers/compare.
 *
 * Holds NO state of its own. Both selects render from the URL the server already
 * parsed, and changing one navigates - so a comparison is always exactly what its
 * address says, and the back button walks your previous comparisons. That is the same
 * rule the trade web now follows (lib/tradegraph/url.ts); the difference is `push`
 * rather than `replaceState`, because picking a different manager is a deliberate
 * move worth going back from, not an incidental gesture like tapping a strand.
 *
 * Native `select` on purpose: a custom listbox would have to re-solve focus
 * trapping, scroll containment and the mobile keyboard, and a 390px viewport already
 * gets a properly sized native picker for free.
 */

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

export interface CompareOption {
  ownerId: string;
  /** Team name, or the handle when no team name is set. */
  label: string;
  isMe: boolean;
  isFormer: boolean;
  /** e.g. "2022-2024", set only for a former manager. */
  tenureLabel?: string;
}

function optionText(o: CompareOption): string {
  return `${o.label}${o.isMe ? " (you)" : ""}${o.tenureLabel ? ` - ${o.tenureLabel}` : ""}`;
}

function SideSelect({
  label,
  value,
  /** The other side's pick, disabled in this list. */
  taken,
  current,
  former,
  onPick,
}: {
  label: string;
  value: string | null;
  taken: string | null;
  current: CompareOption[];
  former: CompareOption[];
  onPick: (ownerId: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onPick(e.target.value || null)}
      aria-label={label}
      className="min-h-11 w-full min-w-0 rounded-[--radius-sm] border border-border bg-surface px-2 text-[12.5px] font-semibold text-ink focus:border-accent focus:outline-none"
    >
      <option value="">Pick a manager…</option>
      <optgroup label="In the league">
        {current.map((o) => (
          // The other side's pick is disabled rather than merely flagged: a manager
          // compared against themselves has nothing to say, so the picker declines to
          // build that URL at all.
          <option key={o.ownerId} value={o.ownerId} disabled={o.ownerId === taken}>
            {optionText(o)}
          </option>
        ))}
      </optgroup>
      {former.length > 0 && (
        <optgroup label="Former managers">
          {former.map((o) => (
            <option key={o.ownerId} value={o.ownerId} disabled={o.ownerId === taken}>
              {optionText(o)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function ManagerComparePicker({
  options,
  a,
  b,
}: {
  options: CompareOption[];
  a: string | null;
  b: string | null;
}) {
  const router = useRouter();

  const go = (next: { a?: string | null; b?: string | null }) => {
    const nextA = next.a !== undefined ? next.a : a;
    const nextB = next.b !== undefined ? next.b : b;
    const p = new URLSearchParams();
    if (nextA) p.set("a", nextA);
    if (nextB) p.set("b", nextB);
    const q = p.toString();
    router.push(q ? `/managers/compare?${q}` : "/managers/compare");
  };

  const current = options.filter((o) => !o.isFormer);
  const former = options.filter((o) => o.isFormer);

  return (
    <div className="flex items-center gap-1.5">
      <SideSelect
        label="First manager"
        value={a}
        taken={b}
        current={current}
        former={former}
        onPick={(next) => go({ a: next })}
      />
      <button
        type="button"
        onClick={() => go({ a: b, b: a })}
        disabled={!a && !b}
        aria-label="Swap the two sides"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[--radius-sm] border border-border bg-surface/60 text-faint transition-colors hover:text-accent disabled:opacity-40 motion-reduce:transition-none"
      >
        <ArrowLeftRight size={14} aria-hidden="true" />
      </button>
      <SideSelect
        label="Second manager"
        value={b}
        taken={a}
        current={current}
        former={former}
        onPick={(next) => go({ b: next })}
      />
    </div>
  );
}
