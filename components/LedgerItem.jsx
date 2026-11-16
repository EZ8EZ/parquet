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
  showChrome = true,
  autoFocus = false,
}) {
  const router = useRouter();
  const alreadyAnnotated = !!initialReasoning;
  const [editing, setEditing] = useState(!alreadyAnnotated && !readOnly);
  const [reasoning, setReasoning] = useState(initialReasoning ?? "");
  const [posture, setPosture] = useState(initialPosture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // The API degrades gracefully without a database (persisted: false). That is
  // fine for the server - but silently losing a note would betray the whole
  // premise of the ledger, so the user gets told the truth about it.
  const [notPersisted, setNotPersisted] = useState(false);
  // True only after THIS component captured a save in this session - never on a
  // normal mount of already-annotated history, so scrolling the ledger never
  // replays it. Its only job is to gate `.arrive` (interaction.css) on the quote
  // that replaces the editor, so the one moment this app calls a decision
  // "captured" gets an answer instead of a snap.
  const [justSaved, setJustSaved] = useState(false);
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
        body: JSON.stringify({
          transactionId,
          reasoning: reasoning.trim(),
          posture,
        }),
      });
      const data = await res.json().catch(() => ({}));
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
      setJustSaved(true);
      if (data.persisted !== false) router.refresh();
    } catch {
      setError(
        "Your note was NOT saved - the request never completed. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={showChrome ? "rounded-card bg-surface p-4" : "px-4 pb-4"}>
      {/* The full sentence stays in front of you while you write down why: the row
          that summarises it elsewhere is one line. */}
      {showChrome && (
        <p className="mb-1 figure text-meta text-secondary">
          {season} · wk {week} · {type.replace("_", " ")}
        </p>
      )}
      <p className="text-body font-medium text-ink">{description}</p>

      {editing && !readOnly ? (
        <div className="mt-3">
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={3}
            autoFocus={autoFocus}
            aria-label="Your reasoning"
            placeholder="What's the reasoning? What has to be true for this to work?"
            className="w-full resize-y rounded-control border border-border-strong bg-surface-2 p-3 text-body text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Posture">
            {POSTURES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={posture === p}
                onClick={() => setPosture(posture === p ? null : p)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-3.5 text-note font-semibold transition-colors",
                  posture === p ? "bg-accent-wash text-accent-text" : "bg-elevated text-muted hover:text-ink",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-note text-negative">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !reasoning.trim()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-body font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
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
                className="inline-flex min-h-11 items-center rounded-full bg-elevated px-5 text-body font-semibold text-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn(reasoning || posture ? "mt-2.5" : "", justSaved && "arrive")}>
          {posture && (
            <span className="mb-1.5 inline-flex rounded-full bg-elevated px-2.5 py-0.5 text-meta font-semibold text-muted">
              {posture}
            </span>
          )}
          {reasoning && <p className="text-body text-ink">&ldquo;{reasoning}&rdquo;</p>}
          {notPersisted && (
            <p className="mt-1.5 text-meta text-warn">Saved for this session only; no database is connected.</p>
          )}
          {/* No seat, no pencil: the API refuses the write anyway. */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-accent-text"
            >
              <Pencil size={14} aria-hidden="true" /> edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
