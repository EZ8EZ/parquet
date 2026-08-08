"use client";

/**
 * TRADE BUILDER - the package (give/get players and picks) lives in the address
 * bar, not in plain `useState`. It used to be the latter, which meant checking a
 * player's value on /values or a manager's dossier - both one tap away, both
 * things you'd naturally want to do mid-build - silently destroyed the whole
 * package. lib/trade/url.ts is the one place the mapping between a URL and a
 * package lives (ids only - that's what makes the package addressable, not names
 * or values), and this component resolves those ids against the union of both
 * sides' pools, so a pasted `/trade?give=...&get=...` link reproduces the same
 * package for whoever opens it, on their own phone, regardless of whose roster
 * the ids nominally sit on for them. Same pattern DECISIONS D30 shipped for the
 * deal receipt.
 *
 * `history.replaceState` rather than `router.replace`, same reasoning the deleted /web carried, and
 * /values (see lib/tradegraph/url.ts and lib/values/url.ts): /trade is
 * force-dynamic and its server render prices every player on every roster in the
 * league, so routing on every add/remove tap would pay for that whole render
 * again, per tap.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Loader2, Plus, X } from "lucide-react";
import type { TradeEvaluation } from "@/lib/trade";
import { parseTradeParams, tradeQueryString, type TradePackageIds } from "@/lib/trade/url";
import { cn, fmtValue, fold } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTradeUrl } from "@/lib/sleeperLinks";
import { PlayerAvatar } from "@/components/PlayerAvatar";

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
          <h3 className="min-w-0 truncate font-display text-lede leading-tight font-semibold text-ink">
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
          className="mb-2 h-11 w-full rounded-full border border-border bg-surface px-4 text-body leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mb-1 font-mono text-meta tnum text-faint">
          {filtered.length} shown · esc to close
        </p>
        <div className="flex-1 space-y-1 overflow-y-auto pb-4">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-body leading-relaxed text-muted">{emptyText}</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold leading-tight text-ink">
                  {o.name}
                </span>
                <span className="block truncate font-mono text-meta tnum leading-tight text-faint">
                  {o.meta}
                </span>
              </span>
              <span className="shrink-0 font-mono text-body font-semibold tnum text-muted">
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
  player,
}: {
  label: string;
  meta?: string;
  value: number;
  onRemove: () => void;
  /**
   * Set for a player row, omitted for a pick row - a pick has no face to show, and a
   * monogram for "2027 1st" would just be noise. When set, the avatar replaces
   * nothing in `meta`: position and age aren't visible in a face, they still earn
   * their line. What the avatar actually buys here is the two columns reading as
   * PEOPLE at a glance - a lopsided offer shows up as a wall of strangers on one
   * side and one face on the other, before you've read a word.
   */
  player?: { name: string; team: string | null; playerId: string };
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-1.5 rounded-[--radius-sm] bg-elevated px-2 py-1">
      <span className="flex min-w-0 items-center gap-1.5">
        {player && (
          <PlayerAvatar
            name={player.name}
            team={player.team}
            playerId={player.playerId}
            size="sm"
          />
        )}
        <span className="min-w-0">
          <span className="block truncate text-body leading-tight text-ink">{label}</span>
          <span className="block truncate font-mono text-meta tnum leading-tight text-faint">
            {meta ? `${meta} · ` : ""}
            {fmtValue(value)}
          </span>
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
        <span className="text-meta font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="font-mono text-body font-semibold tnum text-ink">
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
            player={{ name: p.name, team: p.team, playerId: p.id }}
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
          <p className="px-0.5 py-2 text-meta leading-snug text-faint">
            Nothing yet - add a player or a pick.
          </p>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={onAddPlayer}
          className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-border text-note leading-snug font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden="true" /> player
        </button>
        <button
          onClick={onAddPick}
          className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-border text-note leading-snug font-medium text-muted transition-colors hover:border-accent hover:text-accent"
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
  // Every player/pick id in the URL is resolved against the UNION of both sides'
  // pools, not just "my" pool - that's what lets a shared link reproduce the same
  // package for a different viewer, whose own roster puts these ids on the
  // opposite side of the ledger.
  const playerById = useMemo(() => {
    const m = new Map<string, PlayerOption>();
    for (const p of myPlayers) m.set(p.id, p);
    for (const p of otherPlayers) m.set(p.id, p);
    return m;
  }, [myPlayers, otherPlayers]);
  const pickById = useMemo(() => {
    const m = new Map<string, PickOption>();
    for (const p of myPicks) m.set(p.id, p);
    for (const p of otherPicks) m.set(p.id, p);
    return m;
  }, [myPicks, otherPicks]);

  const searchParams = useSearchParams();
  // Read once at mount - the mirror below only ever writes, so a later address-bar
  // change (there shouldn't be one; this component owns it) never bounces back in.
  const [initial] = useState(() => {
    const ids = parseTradeParams(searchParams);
    const players = (list: string[]) =>
      list.map((id) => playerById.get(id)).filter((p): p is PlayerOption => !!p);
    const picks = (list: string[]) =>
      list.map((id) => pickById.get(id)).filter((p): p is PickOption => !!p);
    return {
      give: players(ids.give),
      get: players(ids.get),
      givePicks: picks(ids.givePicks),
      getPicks: picks(ids.getPicks),
    };
  });

  const [give, setGive] = useState<PlayerOption[]>(initial.give);
  const [get, setGet] = useState<PlayerOption[]>(initial.get);
  const [givePicks, setGivePicks] = useState<PickOption[]>(initial.givePicks);
  const [getPicks, setGetPicks] = useState<PickOption[]>(initial.getPicks);
  const [picker, setPicker] = useState<null | {
    side: "give" | "get";
    kind: "player" | "pick";
  }>(null);
  const [result, setResult] = useState<TradeEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Write-only mirror to the address bar - see the file header for why
  // `history.replaceState` rather than `router.replace`.
  useEffect(() => {
    const ids: TradePackageIds = {
      give: give.map((p) => p.id),
      get: get.map((p) => p.id),
      givePicks: givePicks.map((p) => p.id),
      getPicks: getPicks.map((p) => p.id),
    };
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${tradeQueryString(ids)}`,
    );
  }, [give, get, givePicks, getPicks]);

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
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-body leading-relaxed font-semibold text-accent-ink transition-opacity disabled:opacity-40"
      >
        {loading ? (
          <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowLeftRight size={16} aria-hidden="true" />
        )}
        Evaluate trade
      </button>

      {error && (
        <p role="alert" className="mt-2 text-center text-note text-negative">
          Couldn&apos;t evaluate: {error}. Try again.
        </p>
      )}

      <div ref={resultRef} className="scroll-mt-4">
        {result && <TradeResult r={result} leagueId={leagueId} />}
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
  leagueId,
}: {
  r: TradeEvaluation;
  leagueId?: string | null;
}) {
  const dirTone =
    r.direction === "buying" ? "text-accent" : r.direction === "selling" ? "text-info" : "text-muted";
  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-[--radius] border border-border bg-surface/60 p-3 text-center">
        <div className="text-meta uppercase tracking-wide text-faint">Value to you</div>
        <div className={cn("font-mono text-display leading-tight font-semibold tnum", r.delta >= 0 ? "text-positive" : "text-negative")}>
          {r.delta >= 0 ? "+" : ""}{fmtValue(r.delta)}
        </div>
        <div className="mt-0.5 text-note leading-snug text-muted">
          You&apos;re <span className={cn("font-semibold", dirTone)}>{r.direction}</span>. Value is a guide, not the verdict - read below.
        </div>
        {/* Both sides as the evaluator priced them - picks labelled by who owes them. */}
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-left">
          {([["send", r.give] as const, ["get", r.get] as const]).map(([k, side]) => (
            <div key={k} className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className={cn("text-meta uppercase tracking-wide", k === "send" ? "text-negative" : "text-positive")}>
                  you {k}
                </span>
                <span className="font-mono text-meta font-semibold tnum text-ink">
                  {fmtValue(side.total)}
                </span>
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {side.assets.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-1 text-meta leading-snug">
                    <span className="min-w-0 truncate text-ink/85">{a.label}</span>
                    <span className="shrink-0 font-mono text-meta tnum text-faint">
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
        {/* Sleeper has no write API, so we can't send the proposal - the trade
            centre is one tap away instead. */}
        <OpenInSleeper
          href={sleeperTradeUrl(leagueId)}
          label="Open Sleeper to send"
          className="w-full"
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
      <div className={cn("mb-1 text-meta font-semibold uppercase tracking-wide", head)}>{title}</div>
      <p className="text-body leading-relaxed text-ink/90">{children}</p>
    </div>
  );
}
