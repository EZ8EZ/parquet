"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/ui";

const POSTURES = ["rebuild", "win-now", "value", "depth", "fit"];

export function LedgerItem({
  transactionId,
  description,
  season,
  week,
  type,
  initialReasoning,
  initialPosture,
}: {
  transactionId: string;
  description: string;
  season: string;
  week: number;
  type: string;
  initialReasoning: string | null;
  initialPosture: string | null;
}) {
  const router = useRouter();
  const alreadyAnnotated = !!initialReasoning;
  const [editing, setEditing] = useState(!alreadyAnnotated);
  const [reasoning, setReasoning] = useState(initialReasoning ?? "");
  const [posture, setPosture] = useState<string | null>(initialPosture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!reasoning.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId, reasoning: reasoning.trim(), posture }),
      });
      if (!res.ok) throw new Error("save failed");
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-[--radius] border p-4",
        alreadyAnnotated && !editing
          ? "border-border bg-surface/60"
          : "border-accent/30 bg-surface/80",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-faint">
        <span className="font-mono">{season}</span>
        <span>·</span>
        <span>wk {week}</span>
        <span>·</span>
        <span>{type.replace("_", " ")}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-ink">{description}</p>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={3}
            autoFocus={!alreadyAnnotated}
            placeholder="What's the reasoning? What has to be true for this to work?"
            className="w-full resize-y rounded-[--radius-sm] border border-border bg-bg/60 p-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {POSTURES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPosture(posture === p ? null : p)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  posture === p
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted hover:border-border-strong",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-negative">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !reasoning.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Save
            </button>
            {alreadyAnnotated && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setReasoning(initialReasoning ?? "");
                  setPosture(initialPosture);
                }}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2.5">
          {posture && (
            <span className="mb-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {posture}
            </span>
          )}
          <p className="text-sm italic leading-relaxed text-muted">
            &ldquo;{reasoning}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-faint hover:text-accent"
          >
            <Pencil size={12} /> edit
          </button>
        </div>
      )}
    </div>
  );
}
