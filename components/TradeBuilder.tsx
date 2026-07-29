"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Copy, Loader2, Plus, X } from "lucide-react";
import type { TradeEvaluation } from "@/lib/trade";
import { cn, fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTradeUrl } from "@/lib/sleeperLinks";

export interface PlayerOption {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  value: number;
  owner?: string;
}

/**
 * A REAL owned pick, not a season/round guess. `originalRosterId` is what lets the
 * evaluator price the pick by who owes it - the whole point of slot-aware valuation.
 */
export interface PickOption {
  id: string;
  season: string;
  round: number;
  originalRosterId: number;
  /** e.g. "2027 1st (via Old Man Ball)" */
  label: string;
  value: number;
  /** Current owner's team name (for the other side's picker). */
  owner?: string;
}

interface ModalItem {
  id: string;
  name: string;
  meta: string;
  value: number;
}

/** Fold diacritics so "jokic" finds Jokić and "sengun" finds Şengün. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function PickerModal({
  title,
  items,
  searchLabel,
  emptyText,
  onPick,
  onClose,
}: {
  title: string;
  items: ModalItem[];
  searchLabel: string;
  emptyText: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = fold(q.trim());
    return items
      .filter((o) => !s || fold(`${o.name} ${o.meta}`).includes(s))
      .slice(0, 60);
  }, [q, items]);

  // Escape closes; the page behind must not scroll while the sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur"
    >
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-display text-lg font-semibold text-ink">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="mb-2 h-11 w-full rounded-full border border-border bg-surface px-4 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mb-1 font-mono text-[11px] tnum text-faint">
          {filtered.length} shown · esc to close
        </p>
        <div className="flex-1 space-y-1 overflow-y-auto pb-4">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                  {o.name}
                </span>
                <span className="block truncate font-mono text-[11px] tnum leading-tight text-faint">
                  {o.meta}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[13px] font-semibold tnum text-muted">
                {fmtValue(o.value)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssetRow({
  label,
  meta,
  value,
  onRemove,
}: {
  label: string;
  meta?: string;
  value: number;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-1.5 rounded-[--radius-sm] bg-elevated px-2 py-1">
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-tight text-ink">{label}</span>
        <span className="block truncate font-mono text-[11px] tnum leading-tight text-faint">
          {meta ? `${meta} · ` : ""}
          {fmtValue(value)}
        </span>
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-negative"
      >
        <X size={14} aria-hidden="true" />
      </button>
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
  picks: PickOption[];
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  onAddPick: () => void;
  onRemovePick: (id: string) => void;
  total: number;
}) {
  return (
    <div className="rounded-[--radius] border border-border bg-surface/60 p-2">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="font-mono text-[13px] font-semibold tnum text-ink">
          {fmtValue(total)}
        </span>
      </div>
      <div className="space-y-1">
        {players.map((p) => (
          <AssetRow
            key={p.id}
            label={p.name}
            meta={[p.position, p.age != null ? `${p.age}y` : null]
              .filter(Boolean)
              .join(" · ")}
            value={p.value}
            onRemove={() => onRemovePlayer(p.id)}
          />
        ))}
        {picks.map((pk) => (
          <AssetRow
            key={pk.id}
            label={pk.label}
            value={pk.value}
            onRemove={() => onRemovePick(pk.id)}
          />
        ))}
        {players.length + picks.length === 0 && (
          <p className="px-0.5 py-2 text-[11px] leading-snug text-faint">
            Nothing yet - add a player or a pick.
          </p>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={onAddPlayer}
          className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-border text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden="true" /> player
        </button>
        <button
          onClick={onAddPick}
          className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-border text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden="true" /> pick
        </button>
      </div>
    </div>
  );
}

export function TradeBuilder({
  myPlayers,
  otherPlayers,
  myPicks,
  otherPicks,
  leagueId,
}: {
  myPlayers: PlayerOption[];
  otherPlayers: PlayerOption[];
  /** Picks YOU actually own, valued and labelled by who owes them. */
  myPicks: PickOption[];
  /** Picks the rest of the league owns. */
  otherPicks: PickOption[];
  /** Current Sleeper league id - used to link out to the trade centre. */
  leagueId?: string | null;
}) {
  const [give, setGive] = useState<PlayerOption[]>([]);
  const [get, setGet] = useState<PlayerOption[]>([]);
  const [givePicks, setGivePicks] = useState<PickOption[]>([]);
  const [getPicks, setGetPicks] = useState<PickOption[]>([]);
  const [picker, setPicker] = useState<null | {
    side: "give" | "get";
    kind: "player" | "pick";
  }>(null);
  const [result, setResult] = useState<TradeEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const giveTotal =
    give.reduce((s, p) => s + p.value, 0) + givePicks.reduce((s, p) => s + p.value, 0);
  const getTotal =
    get.reduce((s, p) => s + p.value, 0) + getPicks.reduce((s, p) => s + p.value, 0);

  async function evaluate() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const pickBody = (pks: PickOption[]) =>
        pks.map(({ round, season, originalRosterId }) => ({
          round,
          season,
          originalRosterId,
        }));
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          give: { playerIds: give.map((p) => p.id), picks: pickBody(givePicks) },
          get: { playerIds: get.map((p) => p.id), picks: pickBody(getPicks) },
        }),
      });
      if (!res.ok) throw new Error(`evaluation failed (${res.status})`);
      setResult((await res.json()) as TradeEvaluation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  // Bring the verdict into view once it exists - on a phone it renders below the fold.
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const hasSomething = give.length + get.length + givePicks.length + getPicks.length > 0;

  const modal = useMemo(() => {
    if (!picker) return null;
    const giving = picker.side === "give";
    if (picker.kind === "player") {
      const chosen = new Set((giving ? give : get).map((p) => p.id));
      const source = giving ? myPlayers : otherPlayers;
      return {
        title: giving ? "Add a player you'll send" : "Add a player you'll get",
        searchLabel: "Search players",
        emptyText: "No players match.",
        items: source
          .filter((o) => !chosen.has(o.id))
          .map((o) => ({
            id: o.id,
            name: o.name,
            meta: [o.position ?? "-", o.age != null ? `${o.age}y` : null, o.owner]
              .filter(Boolean)
              .join(" · "),
            value: o.value,
          })),
        pick: (id: string) => {
          const o = source.find((x) => x.id === id);
          if (!o) return;
          if (giving) setGive((x) => [...x, o]);
          else setGet((x) => [...x, o]);
          setPicker(null);
        },
      };
    }
    const chosen = new Set((giving ? givePicks : getPicks).map((p) => p.id));
    const source = giving ? myPicks : otherPicks;
    return {
      title: giving ? "Add a pick you'll send" : "Add a pick you'll get",
      searchLabel: "Search picks (year, round, team)",
      emptyText: giving
        ? "You own no tradeable picks."
        : "No picks match.",
      items: source
        .filter((o) => !chosen.has(o.id))
        .map((o) => ({
          id: o.id,
          name: o.label,
          meta: o.owner ? `owned by ${o.owner}` : "your pick",
          value: o.value,
        })),
      pick: (id: string) => {
        const o = source.find((x) => x.id === id);
        if (!o) return;
        if (giving) setGivePicks((x) => [...x, o]);
        else setGetPicks((x) => [...x, o]);
        setPicker(null);
      },
    };
  }, [picker, give, get, givePicks, getPicks, myPlayers, otherPlayers, myPicks, otherPicks]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <SideColumn
          label="You give"
          players={give}
          picks={givePicks}
          total={giveTotal}
          onAddPlayer={() => setPicker({ side: "give", kind: "player" })}
          onRemovePlayer={(id) => setGive((x) => x.filter((p) => p.id !== id))}
          onAddPick={() => setPicker({ side: "give", kind: "pick" })}
          onRemovePick={(id) => setGivePicks((x) => x.filter((p) => p.id !== id))}
        />
        <SideColumn
          label="You get"
          players={get}
          picks={getPicks}
          total={getTotal}
          onAddPlayer={() => setPicker({ side: "get", kind: "player" })}
          onRemovePlayer={(id) => setGet((x) => x.filter((p) => p.id !== id))}
          onAddPick={() => setPicker({ side: "get", kind: "pick" })}
          onRemovePick={(id) => setGetPicks((x) => x.filter((p) => p.id !== id))}
        />
      </div>

      <button
        onClick={evaluate}
        disabled={!hasSomething || loading}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-ink transition-opacity disabled:opacity-40"
      >
        {loading ? (
          <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowLeftRight size={16} aria-hidden="true" />
        )}
        Evaluate trade
      </button>

      {error && (
        <p role="alert" className="mt-2 text-center text-[12px] text-negative">
          Couldn&apos;t evaluate: {error}. Try again.
        </p>
      )}

      <div ref={resultRef} className="scroll-mt-4">
        {result && (
          <TradeResult r={result} copied={copied} setCopied={setCopied} leagueId={leagueId} />
        )}
      </div>

      {picker && modal && (
        <PickerModal
          title={modal.title}
          items={modal.items}
          searchLabel={modal.searchLabel}
          emptyText={modal.emptyText}
          onPick={modal.pick}
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
  leagueId,
}: {
  r: TradeEvaluation;
  copied: boolean;
  setCopied: (b: boolean) => void;
  leagueId?: string | null;
}) {
  const dirTone =
    r.direction === "buying" ? "text-accent" : r.direction === "selling" ? "text-info" : "text-muted";
  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-[--radius] border border-border bg-surface/60 p-3 text-center">
        <div className="text-[11px] uppercase tracking-wide text-faint">Value to you</div>
        <div className={cn("font-mono text-3xl font-semibold tnum", r.delta >= 0 ? "text-positive" : "text-negative")}>
          {r.delta >= 0 ? "+" : ""}{fmtValue(r.delta)}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          You&apos;re <span className={cn("font-semibold", dirTone)}>{r.direction}</span>. Value is a guide, not the verdict - read below.
        </div>
        {/* Both sides as the evaluator priced them - picks labelled by who owes them. */}
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-left">
          {([["send", r.give] as const, ["get", r.get] as const]).map(([k, side]) => (
            <div key={k} className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className={cn("text-[11px] uppercase tracking-wide", k === "send" ? "text-negative/80" : "text-positive/80")}>
                  you {k}
                </span>
                <span className="font-mono text-[11px] font-semibold tnum text-ink">
                  {fmtValue(side.total)}
                </span>
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {side.assets.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-1 text-[11.5px] leading-snug">
                    <span className="min-w-0 truncate text-ink/85">{a.label}</span>
                    <span className="shrink-0 font-mono text-[11px] tnum text-faint">
                      {fmtValue(a.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <Block title="What you're betting on">{r.yourBet}</Block>
      <Block title="What they're betting on">{r.theirBet}</Block>
      <Block title="The assumption that has to be true" tone="accent">{r.keyAssumption}</Block>
      <Block title="What your history says" tone="warn">{r.historyCheck}</Block>
      {r.consolidationNote && <Block title="Consolidation">{r.consolidationNote}</Block>}

      <div className="rounded-[--radius] border border-border bg-bg/70 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-faint">Copyable summary</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(r.copyable);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-accent"
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{" "}
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">{r.copyable}</pre>
        {/* Sleeper has no write API, so we can't send the proposal - but copy above
            then tap here and the trade centre is one screen away. */}
        <OpenInSleeper
          href={sleeperTradeUrl(leagueId)}
          label="Open Sleeper to send"
          className="mt-2.5 w-full"
        />
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
    <div className={cn("rounded-[--radius] border bg-surface/60 p-3", border)}>
      <div className={cn("mb-1 text-[11px] font-semibold uppercase tracking-wide", head)}>{title}</div>
      <p className="text-[13px] leading-relaxed text-ink/90">{children}</p>
    </div>
  );
}
