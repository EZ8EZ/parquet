"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copyable text block. The app can't execute anything (Sleeper is read-only), so
 * every recommendation terminates in text the user pastes into Sleeper themselves.
 */
export function CopyBlock({ text, label = "Copy for Sleeper" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[--radius-sm] border border-border bg-bg/60">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">
        {text}
      </pre>
    </div>
  );
}
