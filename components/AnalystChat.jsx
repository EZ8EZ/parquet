"use client";
import { useRef, useState } from "react";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/ui";
const SUGGESTED = [
  "Audit my strategy. Where am I fooling myself?",
  "Am I really rebuilding, or am I lying to myself?",
  "Who in my league should I target for a trade, and how?",
  "What's the worst decision in my transaction history?",
];
export function AnalystChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  async function ask(question) {
    if (!question.trim() || loading) return;
    const next = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.text ?? "(no response)",
          mode: data.mode,
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Something went wrong reaching the analyst.",
          mode: "rules",
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    }
  }
  return (
    <div>
      {messages.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-[--radius] border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-negative">
              <ShieldAlert size={16} />
              <span className="text-note leading-snug font-semibold uppercase tracking-wide">
                Adversarial by design
              </span>
            </div>
            <p className="text-body leading-relaxed text-muted">
              The Analyst is not a cheerleader. It leads with the case against
              you, cites your own transactions as evidence, and won&apos;t
              validate a strategy your record contradicts. Ask it something
              you&apos;d rather not hear the answer to.
            </p>
          </div>
          <div className="space-y-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="block w-full rounded-[--radius-sm] border border-border bg-surface px-3.5 py-3 text-left text-body leading-relaxed text-ink transition-colors hover:border-accent"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-[--radius] p-3.5 text-body leading-relaxed",
                m.role === "user"
                  ? "ml-8 bg-accent-wash text-ink"
                  : "mr-2 border border-border bg-surface text-ink/90",
              )}
            >
              {m.role === "assistant" && m.mode && (
                <div className="mb-1.5 text-micro uppercase tracking-wide text-faint">
                  {m.mode === "llm" ? "analyst" : "deterministic audit"}
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="mr-2 flex items-center gap-2 rounded-[--radius] border border-border bg-surface p-3.5 text-body leading-relaxed text-muted">
              <Loader2 size={15} className="animate-spin" /> auditing your
              history…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Composer - fixed above the Desk for thumb reach.
          8.5rem, matching app/layout.tsx's main padding: the Desk's 116pt of resting
          chrome plus 20pt of air. This was a stale 64px (the old single 94pt tab
          bar's clearance, from before D65's three-row Desk) - too little once the
          Desk grew, which put the send button and most of the textarea underneath
          the Desk's own z-50 layer: tappable area reduced to a ~3px sliver, an axe
          target-size violation on top of being invisible. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8.5rem)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 py-3 sm:px-6"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Ask the analyst…"
            className="max-h-32 flex-1 resize-none rounded-[--radius] border border-border bg-surface px-3 py-2.5 text-body leading-relaxed text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Ask"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
          >
            <Send size={17} aria-hidden="true" />
          </button>
        </form>
      </div>
      {/* Spacer so content isn't hidden behind the fixed composer */}
      <div className="h-24" />
    </div>
  );
}
