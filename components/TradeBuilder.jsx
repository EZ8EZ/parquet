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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Loader2, Plus, X } from "lucide-react";
import { parseTradeParams, tradeQueryString } from "@/lib/trade/url";
import { fmtValue, fold } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTradeUrl } from "@/lib/sleeperLinks";
import { ManagerRail } from "@/components/ManagerRail";
import { Button, Disclosure } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
function PickerModal({
  title,
  items,
  searchLabel,
  emptyText,
  onPick,
  onClose,
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
    const onKey = (e) => {
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
      className="fixed inset-0 z-[60] flex flex-col bg-bg"
    >
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="min-w-0 text-lede font-semibold text-ink">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="mb-2 h-11 w-full rounded-full border border-border-strong bg-surface px-4 text-body text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
        />
        <p className="mb-1 px-1 figure text-meta text-secondary">{filtered.length} shown</p>
        <div className="flex-1 overflow-y-auto pb-4">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-body text-muted">{emptyText}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onPick(o.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-ink">{o.name}</span>
                      <span className="block text-meta text-secondary">{o.meta}</span>
                    </span>
                    <span className="shrink-0 figure text-body font-bold text-ink">
                      {fmtValue(o.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
function AssetRow({ label, meta, value, onRemove }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-1.5 rounded-control bg-surface-2 py-1 pl-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0">
          <span className="block text-body font-semibold leading-tight text-ink">{label}</span>
          <span className="block figure text-meta leading-tight text-secondary">
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
}) {
  return (
    <div className="rounded-card bg-surface p-2">
      <div className="mb-1.5 px-1 pt-0.5">
        <span className="block text-meta font-medium text-secondary">{label}</span>
        {/* The column's running total: the number the column exists to accumulate. */}
        <span className="block figure text-display font-bold tracking-tight text-ink">
          {fmtValue(total)}
        </span>
        {players.length > 0 && (
          // Faces in a row of their own, so they never squeeze the wrapping names below.
          <span aria-hidden="true" className="mt-1 flex -space-x-2">
            {players.map((p) => (
              <PlayerAvatar key={p.id} name={p.name} team={p.team} playerId={p.id} size="sm" decorative />
            ))}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {players.map((p) => (
          <AssetRow
            key={p.id}
            label={p.name}
            meta={[p.position, p.team, p.age != null ? `${p.age}y` : null]
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
          <p className="px-1 py-1 text-note text-secondary">Nothing yet</p>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Button variant="secondary" size="sm" className="flex-1 px-2" onClick={onAddPlayer}>
          <Plus size={14} aria-hidden="true" /> Player
        </Button>
        <Button variant="secondary" size="sm" className="flex-1 px-2" onClick={onAddPick}>
          <Plus size={14} aria-hidden="true" /> Pick
        </Button>
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
}) {
  // Every player/pick id in the URL is resolved against the UNION of both sides'
  // pools, not just "my" pool - that's what lets a shared link reproduce the same
  // package for a different viewer, whose own roster puts these ids on the
  // opposite side of the ledger.
  const playerById = useMemo(() => {
    const m = new Map();
    for (const p of myPlayers) m.set(p.id, p);
    for (const p of otherPlayers) m.set(p.id, p);
    return m;
  }, [myPlayers, otherPlayers]);
  const pickById = useMemo(() => {
    const m = new Map();
    for (const p of myPicks) m.set(p.id, p);
    for (const p of otherPicks) m.set(p.id, p);
    return m;
  }, [myPicks, otherPicks]);
  const searchParams = useSearchParams();
  // Read once at mount - the mirror below only ever writes, so a later address-bar
  // change (there shouldn't be one; this component owns it) never bounces back in.
  const [initial] = useState(() => {
    const ids = parseTradeParams(searchParams);
    const players = (list) =>
      list.map((id) => playerById.get(id)).filter((p) => !!p);
    const picks = (list) =>
      list.map((id) => pickById.get(id)).filter((p) => !!p);
    return {
      give: players(ids.give),
      get: players(ids.get),
      givePicks: picks(ids.givePicks),
      getPicks: picks(ids.getPicks),
    };
  });
  const [give, setGive] = useState(initial.give);
  const [get, setGet] = useState(initial.get);
  const [givePicks, setGivePicks] = useState(initial.givePicks);
  const [getPicks, setGetPicks] = useState(initial.getPicks);
  const [picker, setPicker] = useState(null);
  const [result, setResult] = useState(null);
  // Counts evaluations, and exists only to KEY the result panel: a new number on
  // this key remounts <TradeResult>, which is what makes the receipt reveal
  // (`.receipt`, interaction.css - M8's second signature moment) replay for a
  // fresh answer while ordinary re-renders of the same answer never replay it.
  const [evalSeq, setEvalSeq] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef(null);
  // Write-only mirror to the address bar - see the file header for why
  // `history.replaceState` rather than `router.replace`.
  useEffect(() => {
    const ids = {
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
    give.reduce((s, p) => s + p.value, 0) +
    givePicks.reduce((s, p) => s + p.value, 0);
  const getTotal =
    get.reduce((s, p) => s + p.value, 0) +
    getPicks.reduce((s, p) => s + p.value, 0);
  async function evaluate() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const pickBody = (pks) =>
        pks.map(({ round, season, originalRosterId }) => ({
          round,
          season,
          originalRosterId,
        }));
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          give: {
            playerIds: give.map((p) => p.id),
            picks: pickBody(givePicks),
          },
          get: { playerIds: get.map((p) => p.id), picks: pickBody(getPicks) },
        }),
      });
      if (!res.ok) throw new Error(`evaluation failed (${res.status})`);
      setResult(await res.json());
      setEvalSeq((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setLoading(false);
    }
  }
  // Bring the verdict into view once it exists - on a phone it renders below the fold.
  useEffect(() => {
    if (result)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);
  const hasSomething =
    give.length + get.length + givePicks.length + getPicks.length > 0;
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
            meta: [
              o.position ?? "-",
              o.age != null ? `${o.age}y` : null,
              o.owner,
            ]
              .filter(Boolean)
              .join(" · "),
            value: o.value,
          })),
        pick: (id) => {
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
      emptyText: giving ? "You own no tradeable picks." : "No picks match.",
      items: source
        .filter((o) => !chosen.has(o.id))
        .map((o) => ({
          id: o.id,
          name: o.label,
          meta: o.owner ? `owned by ${o.owner}` : "your pick",
          value: o.value,
        })),
      pick: (id) => {
        const o = source.find((x) => x.id === id);
        if (!o) return;
        if (giving) setGivePicks((x) => [...x, o]);
        else setGetPicks((x) => [...x, o]);
        setPicker(null);
      },
    };
  }, [
    picker,
    give,
    get,
    givePicks,
    getPicks,
    myPlayers,
    otherPlayers,
    myPicks,
    otherPicks,
  ]);
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
          onRemovePick={(id) =>
            setGivePicks((x) => x.filter((p) => p.id !== id))
          }
        />
        <SideColumn
          label="You get"
          players={get}
          picks={getPicks}
          total={getTotal}
          onAddPlayer={() => setPicker({ side: "get", kind: "player" })}
          onRemovePlayer={(id) => setGet((x) => x.filter((p) => p.id !== id))}
          onAddPick={() => setPicker({ side: "get", kind: "pick" })}
          onRemovePick={(id) =>
            setGetPicks((x) => x.filter((p) => p.id !== id))
          }
        />
      </div>

      {/* THE BEAM (round 10): the package's two totals as one piece of geometry,
          live while you build - the first read of a deal ("which way does this
          lean, and by how much") without pressing anything. Two strengths of the
          one accent, split at the ledger's own midpoint; the printed totals above
          carry the numbers, the beam carries the shape. Never a verdict: lean is
          a fact about the package, not advice about it (D6). */}
      {hasSomething && giveTotal + getTotal > 0 && (
        <BalanceBeam give={giveTotal} get={getTotal} className="mt-2" />
      )}

      {/* Disabled reads as a plain secondary control with its reason as the label,
          not a washed-out primary. */}
      <Button
        block
        variant={hasSomething ? "primary" : "secondary"}
        onClick={evaluate}
        disabled={!hasSomething || loading}
        className="mt-3 disabled:cursor-not-allowed disabled:opacity-100 disabled:text-secondary"
      >
        {loading ? (
          <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowLeftRight size={16} aria-hidden="true" />
        )}
        {hasSomething ? "Evaluate trade" : "Add assets to evaluate"}
      </Button>

      {error && (
        <p role="alert" className="mt-2 text-center text-note text-negative">
          Couldn&apos;t evaluate: {error}. Try again.
        </p>
      )}

      <div ref={resultRef} className="scroll-mt-4">
        {result && (
          <TradeResult
            key={evalSeq}
            r={result}
            leagueId={leagueId}
            counterparty={counterpartyOf([...get, ...getPicks])}
          />
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
/**
 * WHO YOU ARE ACTUALLY TRADING WITH.
 *
 * The evaluation names two sides and, until now, named neither of the PEOPLE. "What
 * does this manager actually value" was the third most common complaint in a survey
 * of dynasty tooling, and this app answers it better than most - on a dossier the
 * trade result had no link to. The package itself knows: whoever holds the most
 * value on the incoming side is the counterparty. A package assembled out of two
 * rivals' rosters (the builder allows it, Sleeper does not) resolves to the larger
 * contributor rather than refusing to name anyone.
 */
function counterpartyOf(incoming) {
  const byRoster = new Map();
  for (const a of incoming) {
    if (a.ownerRosterId == null) continue;
    const cur = byRoster.get(a.ownerRosterId) ?? {
      value: 0,
      name: a.owner ?? "",
    };
    byRoster.set(a.ownerRosterId, {
      value: cur.value + a.value,
      name: cur.name || a.owner || "",
    });
  }
  let best = null;
  let bestValue = -1;
  for (const [rosterId, v] of byRoster) {
    if (v.value > bestValue) {
      bestValue = v.value;
      best = { rosterId, name: v.name };
    }
  }
  return best && best.name ? best : null;
}
/**
 * Give vs get as one centre-split bar, in the app's two OWNED hues (VISION M4:
 * gold = yours, court blue = the field): what leaves your roster fills leftward
 * in gold, what arrives from the other side fills rightward in blue, each
 * proportional to its share of the package. Direction and size are geometry;
 * the printed totals beside/above it carry the numbers. Identity, never a
 * verdict (D6) - neither hue is the good one, they are the two parties.
 */
function BalanceBeam({ give, get, className }) {
  const total = give + get;
  if (!total) return null;
  const givePct = (give / total) * 100;
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Package balance: you send ${fmtValue(give)}, you get ${fmtValue(get)}.`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-elevated"
      >
        <span
          className="absolute inset-y-0 left-0"
          style={{
            width: `${givePct}%`,
            background: "var(--color-accent)",
          }}
        />
        <span
          className="absolute inset-y-0 right-0"
          style={{
            width: `${100 - givePct}%`,
            background: "var(--color-info)",
          }}
        />
        <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-bg" />
      </div>
      <div className="mt-1 flex items-baseline justify-between figure text-meta">
        <span className="text-accent-text">send {fmtValue(give)}</span>
        <span className="text-info">get {fmtValue(get)}</span>
      </div>
    </div>
  );
}
function TradeResult({ r, leagueId, counterparty }) {
  // The evaluation leads with figures: what each side totals and the difference.
  // The difference is ink, never green/red: value gained is not the verdict (D6).
  // The theses and history checks sit behind one Disclosure.
  const diff = `${r.delta >= 0 ? "+" : ""}${fmtValue(r.delta)}`;
  return (
    <div className="receipt mt-4 space-y-2">
      <section aria-label="Evaluation" className="rounded-card bg-surface p-3">
        <p className="text-meta font-medium text-secondary">Value to you</p>
        <p className="figure text-hero font-bold tracking-tight text-ink">{diff}</p>
        <p className="text-note text-muted">
          You&apos;re <span className="font-semibold text-ink">{r.direction}</span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ["You give", r.give],
            ["You get", r.get],
          ].map(([label, side]) => (
            <div key={label} className="min-w-0 rounded-control bg-surface-2 p-3">
              <p className="text-meta font-medium text-secondary">{label}</p>
              <p className="figure text-display font-bold tracking-tight text-ink">
                {fmtValue(side.total)}
              </p>
              <ul className="mt-1 space-y-1">
                {side.assets.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-2 text-note">
                    <span className="min-w-0 text-ink">{a.label}</span>
                    <span className="shrink-0 figure text-secondary">{fmtValue(a.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <Disclosure summary="What each side is betting on" bodyClassName="space-y-3 text-body">
        <Block title="What you're betting on">{r.yourBet}</Block>
        <Block title="What they're betting on">{r.theirBet}</Block>
        <Block title="The assumption that has to be true">{r.keyAssumption}</Block>
        <Block title="What your history says">{r.historyCheck}</Block>
        {r.consolidationNote && <Block title="Consolidation">{r.consolidationNote}</Block>}
        {/* The finder's two shape-of-the-deal reads (D75, D77), reused rather than
            re-derived; null when the shift is under either metric's noise floor. */}
        {r.fragility && (
          <Block
            title={
              r.fragility.direction === "relieves"
                ? "What it takes off one man"
                : "What it puts on one man"
            }
          >
            {r.fragility.text}
          </Block>
        )}
        {r.leverageShift && (
          <Block title="Positional leverage">
            <LeverageShiftText shift={r.leverageShift} />
          </Block>
        )}
        {r.agencyNotes.length > 0 && (
          <Block title="Whose season decides the picks" block>
            <ul className="space-y-1.5">
              {r.agencyNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Block>
        )}
      </Disclosure>

      {counterparty && (
        <section aria-label="Before you send it" className="rounded-card bg-surface p-3">
          <p className="text-note text-muted">
            You are asking <span className="font-semibold text-ink">{counterparty.name}</span> to say yes.
          </p>
          <ManagerRail rosterId={counterparty.rosterId} ownerId={null} className="mt-1.5" />
        </section>
      )}

      {/* Sleeper has no write API, so the trade centre is one tap away instead.
          Conditional because OpenInSleeper renders nothing for fixture ids. */}
      {sleeperTradeUrl(leagueId) && (
        <OpenInSleeper href={sleeperTradeUrl(leagueId)} label="Open Sleeper to send" className="w-full" />
      )}
    </div>
  );
}
/**
 * The exact wording `/trade/finder`'s `PackageDetail` already carries for the same
 * fact (see that page's own `LeverageShiftText`) - a hand-built deal and a suggested
 * one must read identically, which is only true if neither copies the sentence by
 * hand. `/lab/leverage` is the one place the rest of this metric's own caveats live,
 * so the link goes there rather than restating them here.
 */
function LeverageShiftText({ shift }) {
  const posList =
    shift.positions.length > 1
      ? `${shift.positions.slice(0, -1).join(", ")} and ${shift.positions.at(-1)}`
      : shift.positions[0];
  return (
    <>
      This deal would move your{" "}
      <Link href="/lab/leverage" className="text-accent-text underline">
        Positional Leverage
      </Link>{" "}
      from {shift.before} to {shift.after}, at {posList} - where your own value
      sits relative to the league&apos;s own mix there, not a read on the deal
      itself.
    </>
  );
}
/**
 * One thesis inside the evaluation's Disclosure. `block` skips the wrapping <p> for
 * the pick-agency list (a <ul> inside a <p> is invalid HTML, D30).
 */
function Block({ title, children, block = false }) {
  return (
    <div>
      <h3 className="text-note font-semibold text-ink">{title}</h3>
      {block ? (
        <div className="mt-0.5 text-body text-muted">{children}</div>
      ) : (
        <p className="mt-0.5 text-body text-muted">{children}</p>
      )}
    </div>
  );
}
