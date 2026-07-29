"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, Copy, Loader2, Plus, X } from "lucide-react";
import type { TradeEvaluation, PickInput } from "@/lib/trade";
import { cn, fmtValue } from "@/lib/ui";

export interface PlayerOption {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  value: number;
  owner?: string;
}

type SelPick = PickInput & { key: string };

function PickerModal({
  title,
  options,
  onPick,
  onClose,
}: {
  title: string;
  options: PlayerOption[];
  onPick: (p: PlayerOption) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return options
      .filter((o) => !s || o.name.toLowerCase().includes(s))
      .slice(0, 60);
  }, [q, options]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full border border-border p-2 text-muted">
            <X size={18} />
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players…"
          className="mb-3 w-full rounded-[--radius-sm] border border-border bg-surface p-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="flex-1 space-y-1.5 overflow-y-auto pb-4">
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o)}
              className="flex w-full items-center justify-between rounded-[--radius-sm] border border-border bg-surface/60 px-3 py-2.5 text-left hover:border-accent"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{o.name}</div>
                <div className="text-[11px] text-faint">
                  {o.position ?? "—"}{o.age != null ? ` · ${o.age}y` : ""}{o.owner ? ` · ${o.owner}` : ""}
                </div>
              </div>
              <span className="font-mono text-sm text-muted">{fmtValue(o.value)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SideColumn({
  label,
  players,
  picks,
  onAddPlayer,
  onRemovePlayer,
  onAddPick,
  onRemovePick,
  total,
}: {
  label: string;
  players: PlayerOption[];
  picks: SelPick[];
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  onAddPick: () => void;
  onRemovePick: (key: string) => void;
  total: number;
}) {
  return (
    <div className="rounded-[--radius] border border-border bg-surface/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="font-mono text-sm font-semibold text-ink">{fmtValue(total)}</span>
      </div>
      <div className="space-y-1.5">
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-[--radius-sm] bg-elevated px-2.5 py-2">
            <span className="min-w-0 truncate text-sm text-ink">{p.name}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-faint">{fmtValue(p.value)}</span>
              <button onClick={() => onRemovePlayer(p.id)} className="text-faint hover:text-negative">
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {picks.map((pk) => (
          <div key={pk.key} className="flex items-center justify-between rounded-[--radius-sm] bg-elevated px-2.5 py-2">
            <span className="text-sm text-ink">{pk.season} Round {pk.round}</span>
            <button onClick={() => onRemovePick(pk.key)} className="text-faint hover:text-negative">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onAddPlayer} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border py-2 text-xs font-medium text-muted hover:border-accent hover:text-accent">
          <Plus size={14} /> player
        </button>
        <button onClick={onAddPick} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border py-2 text-xs font-medium text-muted hover:border-accent hover:text-accent">
          <Plus size={14} /> pick
        </button>
      </div>
    </div>
  );
}

export function TradeBuilder({
  myPlayers,
  otherPlayers,
  seasons,
}: {
  myPlayers: PlayerOption[];
  otherPlayers: PlayerOption[];
  seasons: string[];
}) {
  const [give, setGive] = useState<PlayerOption[]>([]);
  const [get, setGet] = useState<PlayerOption[]>([]);
  const [givePicks, setGivePicks] = useState<SelPick[]>([]);
  const [getPicks, setGetPicks] = useState<SelPick[]>([]);
  const [picker, setPicker] = useState<null | "give" | "get">(null);
  const [result, setResult] = useState<TradeEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const giveTotal =
    give.reduce((s, p) => s + p.value, 0) + givePicks.length * 0; // picks valued server-side
  const getTotal = get.reduce((s, p) => s + p.value, 0);

  async function evaluate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          give: { playerIds: give.map((p) => p.id), picks: givePicks.map(({ round, season }) => ({ round, season })) },
          get: { playerIds: get.map((p) => p.id), picks: getPicks.map(({ round, season }) => ({ round, season })) },
        }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function addPick(side: "give" | "get") {
    const season = seasons[0];
    const key = `${side}-${season}-1-${Date.now()}`;
    const pk = { round: 1, season, key };
    if (side === "give") setGivePicks((x) => [...x, pk]);
    else setGetPicks((x) => [...x, pk]);
  }

  const hasSomething = give.length + get.length + givePicks.length + getPicks.length > 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <SideColumn
          label="You give"
          players={give}
          picks={givePicks}
          total={giveTotal}
          onAddPlayer={() => setPicker("give")}
          onRemovePlayer={(id) => setGive((x) => x.filter((p) => p.id !== id))}
          onAddPick={() => addPick("give")}
          onRemovePick={(k) => setGivePicks((x) => x.filter((p) => p.key !== k))}
        />
        <SideColumn
          label="You get"
          players={get}
          picks={getPicks}
          total={getTotal}
          onAddPlayer={() => setPicker("get")}
          onRemovePlayer={(id) => setGet((x) => x.filter((p) => p.id !== id))}
          onAddPick={() => addPick("get")}
          onRemovePick={(k) => setGetPicks((x) => x.filter((p) => p.key !== k))}
        />
      </div>

      <button
        onClick={evaluate}
        disabled={!hasSomething || loading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-ink disabled:opacity-40"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
        Evaluate trade
      </button>

      {result && <TradeResult r={result} copied={copied} setCopied={setCopied} />}

      {picker && (
        <PickerModal
          title={picker === "give" ? "Add a player you'll send" : "Add a player you'll get"}
          options={picker === "give" ? myPlayers : otherPlayers}
          onPick={(p) => {
            if (picker === "give") setGive((x) => (x.find((q) => q.id === p.id) ? x : [...x, p]));
            else setGet((x) => (x.find((q) => q.id === p.id) ? x : [...x, p]));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function TradeResult({
  r,
  copied,
  setCopied,
}: {
  r: TradeEvaluation;
  copied: boolean;
  setCopied: (b: boolean) => void;
}) {
  const dirTone =
    r.direction === "buying" ? "text-accent" : r.direction === "selling" ? "text-info" : "text-muted";
  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-[--radius] border border-border bg-surface/60 p-4 text-center">
        <div className="text-[11px] uppercase tracking-wide text-faint">Value to you</div>
        <div className={cn("font-mono text-3xl font-semibold", r.delta >= 0 ? "text-positive" : "text-negative")}>
          {r.delta >= 0 ? "+" : ""}{fmtValue(r.delta)}
        </div>
        <div className="mt-1 text-xs text-muted">
          You&apos;re <span className={cn("font-semibold", dirTone)}>{r.direction}</span>. Value is a guide, not the verdict — read below.
        </div>
      </div>

      <Block title="What you're betting on">{r.yourBet}</Block>
      <Block title="What they're betting on">{r.theirBet}</Block>
      <Block title="The assumption that has to be true" tone="accent">{r.keyAssumption}</Block>
      <Block title="What your history says" tone="warn">{r.historyCheck}</Block>
      {r.consolidationNote && <Block title="Consolidation">{r.consolidationNote}</Block>}

      <div className="rounded-[--radius] border border-border bg-bg/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-faint">Copyable summary</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(r.copyable);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">{r.copyable}</pre>
      </div>
    </div>
  );
}

function Block({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warn";
}) {
  const border =
    tone === "accent" ? "border-accent/30" : tone === "warn" ? "border-warn/30" : "border-border";
  const head =
    tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : "text-muted";
  return (
    <div className={cn("rounded-[--radius] border bg-surface/60 p-4", border)}>
      <div className={cn("mb-1 text-[11px] font-semibold uppercase tracking-wide", head)}>{title}</div>
      <p className="text-sm leading-relaxed text-ink/90">{children}</p>
    </div>
  );
}
