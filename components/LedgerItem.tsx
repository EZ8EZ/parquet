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
  readOnly = false,
}: {
  transactionId: string;
  description: string;
  season: string;
  week: number;
  type: string;
  initialReasoning: string | null;
  initialPosture: string | null;
  /**
   * This reader may not author here: they hold no seat, or the lens is pointed at
   * someone else (see lib/auth/seat.ts). The API refuses the write regardless - this
   * is the UI half, so nobody is offered a textarea that leads to a 401.
   */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const alreadyAnnotated = !!initialReasoning;
  const [editing, setEditing] = useState(!alreadyAnnotated && !readOnly);
  const [reasoning, setReasoning] = useState(initialReasoning ?? "");
  const [posture, setPosture] = useState<string | null>(initialPosture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The API degrades gracefully without a database (persisted: false). That is
  // fine for the server - but silently losing a note would betray the whole
  // premise of the ledger, so the user gets told the truth about it.
  const [notPersisted, setNotPersisted] = useState(false);

  /**
   * Three outcomes, and the difference between them is the whole point.
   *
   * A REJECTED write must never look like a saved one. This component used to collapse
   * "the server said it could not persist" into a soft note under the quote and leave
   * the editor closed - which is correct when there is simply no database configured
   * (the text really is held for the session) and catastrophic when the database
   * actively refused, because the typed reasoning is then gone and the UI said it was
   * fine. On a genuine failure we stay in the editor with the text still in it, so the
   * one copy of that reasoning is still on screen and still selectable.
   */
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
      const data: { ok?: boolean; persisted?: boolean; message?: string } = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || data.ok === false) {
        setError(
          data.message ??
            (res.status === 401
              ? "This browser has not claimed a seat, so it cannot write. Ask the commissioner for your claim link."
              : "Your note was NOT saved. Copy your text somewhere safe and try again."),
        );
        return; // Stay open. The text stays where the reader can still see it.
      }

      setNotPersisted(data.persisted === false);
      setEditing(false);
      if (data.persisted !== false) router.refresh();
    } catch {
      setError("Your note was NOT saved - the request never completed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-[--radius] border p-4",
        // The accent border is a call to action ("this one still needs your why"),
        // so a reader who cannot act on it gets the calm treatment instead.
        readOnly || (alreadyAnnotated && !editing)
          ? "border-border bg-surface"
          : "border-accent-edge bg-surface",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-meta uppercase tracking-wide text-secondary">
        <span className="figure">{season}</span>
        <span>·</span>
        <span>wk {week}</span>
        <span>·</span>
        <span>{type.replace("_", " ")}</span>
      </div>
      <p className="text-body font-medium leading-snug text-ink">{description}</p>

      {editing && !readOnly ? (
        <div className="mt-3">
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={3}
            autoFocus={!alreadyAnnotated}
            placeholder="What's the reasoning? What has to be true for this to work?"
            className="w-full resize-y rounded-[--radius-sm] border border-border bg-bg p-3 font-display text-body leading-relaxed text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {POSTURES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPosture(posture === p ? null : p)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-meta font-medium transition-colors",
                  posture === p
                    ? "border-accent bg-accent-wash text-accent-text"
                    : "border-border text-muted hover:border-border-strong",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-note leading-snug text-negative">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !reasoning.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-body leading-relaxed font-semibold text-accent-ink disabled:opacity-50"
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
                className="rounded-full border border-border px-4 py-2 text-body leading-relaxed text-muted"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn(reasoning || posture ? "mt-2.5" : "")}>
          {posture && (
            <span className="mb-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-meta text-muted">
              {posture}
            </span>
          )}
          {/* The captured reasoning is the one thing in this app that is genuinely the
              viewer's own writing, so it gets the serif. Nothing around it does - see
              the note on .figure in globals.css. */}
          {reasoning && (
            <p className="font-display text-body italic leading-relaxed text-ink">
              &ldquo;{reasoning}&rdquo;
            </p>
          )}
          {notPersisted && (
            <p className="mt-1.5 text-meta leading-snug text-warn">
              Held for this session only - no database is connected, so this note
              will not survive a reload.
            </p>
          )}
          {/* No seat, no pencil. The API refuses the write anyway, so offering the
              affordance would only teach the reader that the app is broken. */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 inline-flex items-center gap-1 text-note leading-snug font-medium text-faint hover:text-accent-text"
            >
              <Pencil size={12} /> edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
