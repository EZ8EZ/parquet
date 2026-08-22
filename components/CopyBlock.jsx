"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
/**
 * Copyable text block, for handing the user a string to paste elsewhere rather
 * than typing it themselves. Its remaining caller is the commissioner's seat
 * screen, which uses it to hand out per-manager claim-link URLs.
 */
export function CopyBlock({ text, label = "Copy for Sleeper" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[--radius-sm] border border-border bg-bg/60">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-micro uppercase tracking-wide text-faint">
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-meta font-semibold text-accent-text hover:bg-accent-wash"
        >
          {/* Only the checkmark pops (`.copy-pop`, interaction.css) - it is the one
                state a tap actually produced. The plain copy icon is also this
                block's very first paint, and popping it on every mount would fire
                for every manager's claim link on /commissioner at once. `key`
                forces the remount that lets the animation replay on a second tap. */}
          {copied ? (
            <Check key="check" size={12} className="copy-pop" />
          ) : (
            <Copy size={12} />
          )}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {/* `break-words` breaks a token ONLY when it has no other option, which leaves
            the prose-shaped trade summaries wrapping exactly as they did and stops an
            unbroken 80-character claim link from running off the side of a 390px
            screen - the one payload this block has ever carried with no spaces in it. */}
      <pre className="whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-meta leading-relaxed text-muted">
        {text}
      </pre>
    </div>
  );
}
