"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { cn, fmtValue } from "@/lib/ui";

export interface TeamOption {
  rosterId: number;
  teamName: string;
  ownerName: string;
  record: string;
  totalValue: number;
  window: string;
  tags: string[];
}

const WINDOW_TONE: Record<string, string> = {
  "win-now": "text-accent",
  rebuilding: "text-info",
  balanced: "text-muted",
};

export function TeamPicker({
  teams,
  currentRosterId,
  username,
}: {
  teams: TeamOption[];
  currentRosterId: number | null;
  username: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState(username);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(rosterId: number) {
    setPending(rosterId);
    try {
      await fetch("/api/viewing-as", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rosterId }),
      });
      router.push("/");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function resolveUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || resolving) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch("/api/resolve-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't find that username.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setResolving(false);
    }
  }

  const filtered = q
    ? teams.filter(
        (t) =>
          t.teamName.toLowerCase().includes(q.toLowerCase()) ||
          t.ownerName.toLowerCase().includes(q.toLowerCase()),
      )
    : teams;

  return (
    <div>
      {/* Username entry - the primary path: type your own Sleeper handle and we
          resolve it to your roster in this league. Team name works too, since
          people often type that instead. */}
      <form
        onSubmit={resolveUsername}
        className="mb-5 rounded-[--radius] border border-border bg-surface/60 p-4"
      >
        <label
          htmlFor="sleeper-username"
          className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted"
        >
          Your Sleeper username
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              id="sleeper-username"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              placeholder="e.g. EZ8"
              className="w-full rounded-full border border-border bg-bg/60 py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={resolving || !name.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {resolving ? <Loader2 size={15} className="animate-spin" /> : null}
            Go
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-[11px] leading-relaxed text-negative">{error}</p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Your team name works too. Not in this league? Pick a team below to explore.
          </p>
        )}
      </form>

      <div className="relative mb-3">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a team…"
          className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>

      <ul className="space-y-2">
        {filtered.map((t) => {
          const active = t.rosterId === currentRosterId;
          return (
            <li key={t.rosterId}>
              <button
                onClick={() => choose(t.rosterId)}
                disabled={pending !== null}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[--radius] border p-4 text-left transition-colors",
                  active
                    ? "border-accent/50 bg-accent/[0.07]"
                    : "border-border bg-surface/60 hover:border-border-strong hover:bg-surface-2",
                  pending !== null && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">
                      {t.teamName}
                    </span>
                    {active && <Check size={14} className="shrink-0 text-accent" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
                    <span>{t.ownerName}</span>
                    <span>·</span>
                    <span className="font-mono tnum">{t.record}</span>
                    <span>·</span>
                    <span className={WINDOW_TONE[t.window] ?? "text-muted"}>
                      {t.window}
                    </span>
                  </div>
                  {t.tags.length > 0 && (
                    <div className="mt-1.5 truncate text-[11px] text-muted">
                      {t.tags.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold tnum text-ink">
                    {fmtValue(t.totalValue)}
                  </div>
                  <div className="text-[10px] text-faint">total value</div>
                </div>
                {pending === t.rosterId && (
                  <Loader2 size={16} className="animate-spin text-accent" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
