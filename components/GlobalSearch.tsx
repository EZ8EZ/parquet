"use client";

/**
 * GLOBAL SEARCH - one surface, reachable from anywhere, for the four things a
 * manager actually looks up mid-conversation: a player, a manager, a trade, or a
 * draft pick.
 *
 * Mounted once in the root layout (not per page) so the trigger survives
 * navigation. Placed as a floating button above the bottom tab bar rather than a
 * header icon - there is no shared page header to hang it from (every page owns
 * its own), and the bottom-right corner is clear on every screen this app has.
 *
 * Matching happens server-side (app/api/search/route.ts): the player pool alone is
 * in the thousands, so shipping it to the client and filtering there would mean a
 * multi-megabyte payload on every cold load just to support a feature most visits
 * never open.
 *
 * All four result kinds are real navigable places. A trade result still expands its
 * full summary inline first - the summary is usually the whole answer to "what was
 * that deal again" and is worth reading without leaving the page you are on - and
 * then links to that exact deal on the trade web, which marks it inside its pair's
 * history. That trade URL is built by lib/tradegraph/url.ts, the one place the
 * mapping lives; this file never assembles the query string itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ChevronRight,
  GitBranch,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TeamAvatar } from "./TeamAvatar";
import { Tag } from "./ui";
import { cn, fmtValue } from "@/lib/ui";
import { tradeWebHref } from "@/lib/tradegraph/url";
import type {
  ManagerResult,
  PickResult,
  PlayerResult,
  SearchResponse,
  TradeResult,
} from "@/app/api/search/route";

const DEBOUNCE_MS = 220;

const EMPTY: SearchResponse = {
  query: "",
  players: [],
  managers: [],
  trades: [],
  picks: [],
};

function totalCount(r: SearchResponse): number {
  return r.players.length + r.managers.length + r.trades.length + r.picks.length;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    // Both branches respond directly to the keystroke that caused them, rather
    // than deriving state from a change inside an effect (the cascading-render
    // anti-pattern the react-hooks lint rule flags) - clearing the box clears the
    // results immediately, and typing shows the spinner immediately rather than
    // waiting out the debounce window to react.
    if (!value.trim()) {
      abortRef.current?.abort();
      setResult(EMPTY);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResult(EMPTY);
    setExpandedTrade(null);
    abortRef.current?.abort();
  }, []);

  // Body scroll lock while the overlay is up - a full-screen panel with its own
  // internal scroller shouldn't also let the page behind it scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The empty-query reset lives in the input's own onChange (below), not here -
  // deriving it from a state change inside an effect is the exact cascading-render
  // anti-pattern the react-hooks lint rule flags. This effect only ever subscribes
  // to the debounced fetch for a non-empty query.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("search failed"))))
        .then((data: SearchResponse) => setResult(data))
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResult(EMPTY);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search players, managers, trades and picks"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg shadow-black/40 transition-transform active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}
      >
        <Search size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[60] flex flex-col bg-bg/98 backdrop-blur-sm"
        >
          <div
            className="flex items-center gap-2 border-b border-border px-4 pb-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
          >
            <div className="relative flex-1">
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search a player, manager, trade or pick"
                aria-label="Search"
                className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              {loading && (
                <Loader2
                  size={15}
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-faint"
                />
              )}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
            {!query.trim() && (
              <p className="px-1 text-[12.5px] leading-snug text-muted">
                Start typing to search across every player, manager, trade and
                draft pick in the league.
              </p>
            )}

            {query.trim() && !loading && totalCount(result) === 0 && (
              <p className="px-1 text-[12.5px] leading-snug text-muted">
                No matches for &ldquo;{result.query || query}&rdquo;.
              </p>
            )}

            {result.players.length > 0 && (
              <Section title="Players">
                <ul className="space-y-1">
                  {result.players.map((p) => (
                    <PlayerRow key={p.id} p={p} onNavigate={close} />
                  ))}
                </ul>
              </Section>
            )}

            {result.managers.length > 0 && (
              <Section title="Managers">
                <ul className="space-y-1">
                  {result.managers.map((m) => (
                    <ManagerRow key={m.id} m={m} onNavigate={close} />
                  ))}
                </ul>
              </Section>
            )}

            {result.trades.length > 0 && (
              <Section title="Trades">
                <ul className="space-y-1">
                  {result.trades.map((t) => (
                    <TradeRow
                      key={t.id}
                      t={t}
                      expanded={expandedTrade === t.id}
                      onToggle={() =>
                        setExpandedTrade((cur) => (cur === t.id ? null : t.id))
                      }
                      onNavigate={close}
                    />
                  ))}
                </ul>
              </Section>
            )}

            {result.picks.length > 0 && (
              <Section title="Picks">
                <ul className="space-y-1">
                  {result.picks.map((p) => (
                    <PickRow key={p.id} p={p} onNavigate={close} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {title}
      </h2>
      {children}
    </div>
  );
}

function PlayerRow({ p, onNavigate }: { p: PlayerResult; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href="/values"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <PlayerAvatar name={p.name} team={p.team} playerId={p.id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink">
            {p.name}
          </div>
          <div className="truncate text-[11px] leading-tight text-faint">
            {[p.position, p.team, p.age != null ? `${p.age}y` : null]
              .filter(Boolean)
              .join(" - ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[12.5px] font-semibold tnum text-ink">
            {fmtValue(p.value)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-accent/85">
            {p.tier}
          </div>
        </div>
      </Link>
    </li>
  );
}

function ManagerRow({ m, onNavigate }: { m: ManagerResult; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={m.href}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <TeamAvatar name={m.name} avatarId={m.avatar} teamLogoUrl={m.teamLogoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-semibold leading-tight text-ink">
              {m.name}
            </span>
            {m.displayName !== m.name && (
              <span className="shrink-0 truncate text-[11px] leading-tight text-faint">
                {m.displayName}
              </span>
            )}
          </div>
          {m.isFormer && (
            <Tag className="mt-0.5">former{m.tenureLabel ? ` - ${m.tenureLabel}` : ""}</Tag>
          )}
        </div>
        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-faint" />
      </Link>
    </li>
  );
}

function TradeRow({
  t,
  expanded,
  onToggle,
  onNavigate,
}: {
  t: TradeResult;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <li
      className={cn(
        "overflow-hidden rounded-[--radius-sm] border transition-colors",
        expanded ? "border-border-strong bg-surface-2" : "border-border bg-surface/60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-start gap-2.5 px-2.5 py-1.5 text-left"
      >
        <ArrowLeftRight size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
        <div className="min-w-0 flex-1">
          <div className={cn("text-[12.5px] leading-snug text-ink", !expanded && "truncate")}>
            {t.description}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] tnum text-faint">
            {t.season} - week {t.week}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-1.5">
          <Link
            href={tradeWebHref(t.id)}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center gap-1 text-[11.5px] font-semibold text-accent"
          >
            Open this deal on the trade web
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}
    </li>
  );
}

function PickRow({ p, onNavigate }: { p: PickResult; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={p.href}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <GitBranch size={16} aria-hidden="true" className="shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink">
            {p.label}
          </div>
          <div className="truncate text-[11px] leading-tight text-faint">
            {p.resolved
              ? `${p.playerName ?? "no player"} - ${p.ownerName}`
              : `Not yet drafted - held by ${p.ownerName}`}
          </div>
        </div>
        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-faint" />
      </Link>
    </li>
  );
}
