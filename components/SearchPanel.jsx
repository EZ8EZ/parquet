"use client";
/**
 * SEARCH PANEL - one surface, for the four things a manager actually looks up mid-
 * conversation: a player, a manager, a trade, or a draft pick.
 *
 * Formerly a floating button + full-screen modal (GlobalSearch, mounted globally in
 * the root layout). Round 6 folded it into the top of `/more`, the new unified
 * surface index, instead: a floating action button collided with real content on
 * every content-heavy page added since round 1 (flagged twice), and a search box
 * living at the top of "every destination in the app" is the same job - "get me to
 * the thing I'm thinking of" - as the rest of that page, not a separate affordance
 * competing for the same screen space. The search logic itself is unchanged, just
 * un-mounted from a modal: same debounce, same endpoint, same result rendering.
 *
 * Round 8 mounted a SECOND instance inside the Desk's drawer (components/Desk.tsx),
 * which is global chrome, so this component no longer knows what page it is standing
 * on. Both things it used to assume about that page are now props:
 *
 *   `basePath`  - it hardcoded `/more`, which would have rewritten every other page's
 *                 URL to `/more` on the first keystroke.
 *   `param`     - it hardcoded `q`, which `/values` ALSO uses, for its own name
 *                 filter. On its own page the box owns the query string and keeps
 *                 `q`; as a guest on someone else's URL it takes a name of its own
 *                 and merges rather than replacing, so a host page's params survive.
 *
 * Matching happens server-side (app/api/search/route.ts): the player pool alone is
 * in the thousands, so shipping it to the client and filtering there would mean a
 * multi-megabyte payload on every cold load just to support a feature most visits
 * never open.
 *
 * All four result kinds are real navigable places. A trade result still expands its
 * full summary inline first - the summary is usually the whole answer to "what was
 * that deal again" and is worth reading without leaving the page you are on - and
 * then links to that exact deal's own page. That URL is built by lib/tradegraph/url.ts,
 * the one place the mapping lives; this file never assembles it here. A player result
 * links to `/values?focus=<id>` (lib/values/url.ts) instead of the bare list, for the
 * same reason - it's the only result kind that used to go nowhere useful - and carries
 * a second link into that player's provenance, since search is where a reader most
 * often arrives holding a name and no context at all.
 *
 * The query itself lives in the address bar too, mirrored as you type: this used to
 * be plain `useState`, so opening any result and coming back meant retyping the whole
 * search from scratch. The mirror rides the SAME debounce timer as the fetch below
 * rather than adding a second one, so it never adds latency of its own - and the
 * input's value never reads from the router, only from local state, so typing stays
 * instant regardless of what the address bar is doing.
 *
 * That write is `history.replaceState`, NOT `router.replace`. D37 chose `router.replace`
 * here, and gave a reason rather than a preference: /more's own server render does no
 * real work, so there was no per-keystroke render cost to dodge and letting Next own
 * the URL was free. Mounting this in global chrome deleted the premise of that
 * sentence - the page underneath is now whatever page you happen to be on, and two of
 * them (/values revalues every player in the league, /trade prices every roster) are
 * the exact cost D37 exists to dodge. Applying D37's reasoning to the new situation
 * gives the opposite answer to copying its letter, which is why it changed. See D39.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  GitBranch,
  Loader2,
  Search,
} from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TeamAvatar } from "./TeamAvatar";
import { Chip, List, ListRow } from "./ui";
import { fmtValue } from "@/lib/ui";
import { dealHref, playerLineageHref } from "@/lib/tradegraph/url";
import { valuesFocusHref } from "@/lib/values/url";
const DEBOUNCE_MS = 220;
const EMPTY = {
  query: "",
  players: [],
  managers: [],
  trades: [],
  picks: [],
};
function totalCount(r) {
  return (
    r.players.length + r.managers.length + r.trades.length + r.picks.length
  );
}
/**
 * Write the box's text into the address bar without navigating.
 *
 * MERGES rather than replaces the query string, which matters only because this is
 * now global chrome: /values carries `pos`, `sort`, `n` and `focus`, and a mirror
 * that rebuilt the URL from its own one param would silently drop the filters the
 * reader had set on the page underneath it.
 */
function mirrorToUrl(basePath, param, value) {
  const next = new URLSearchParams(window.location.search);
  if (value) next.set(param, value);
  else next.delete(param);
  const qs = next.toString();
  window.history.replaceState(null, "", `${basePath}${qs ? `?${qs}` : ""}`);
}
export function SearchPanel({ basePath, param = "q" }) {
  const searchParams = useSearchParams();
  // Read once at mount - a `?q=...` link (or the back button) starts the box already
  // filled in. Nothing re-derives this from a later address-bar change; the mirror
  // below only ever writes.
  const [query, setQuery] = useState(() => searchParams.get(param) ?? "");
  const [result, setResult] = useState(EMPTY);
  const [loading, setLoading] = useState(
    () => !!searchParams.get(param)?.trim(),
  );
  const abortRef = useRef(null);
  const handleQueryChange = useCallback(
    (value) => {
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
        mirrorToUrl(basePath, param, "");
      } else {
        setLoading(true);
      }
    },
    [basePath, param],
  );
  // The empty-query reset lives in the input's own onChange (above), not here -
  // deriving it from a state change inside an effect is the exact cascading-render
  // anti-pattern the react-hooks lint rule flags. This effect only ever subscribes
  // to the debounced fetch (and, alongside it, the debounced URL mirror) for a
  // non-empty query.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const handle = setTimeout(() => {
      mirrorToUrl(basePath, param, trimmed);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) =>
          res.ok ? res.json() : Promise.reject(new Error("search failed")),
        )
        .then((data) => setResult(data))
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResult(EMPTY);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, basePath, param]);
  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Player, manager, trade or pick"
          aria-label="Search"
          className="h-12 w-full rounded-full border border-border-strong bg-surface pl-10 pr-10 text-body text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
        />
        {loading && (
          <Loader2
            size={16}
            aria-hidden="true"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-secondary"
          />
        )}
      </div>

      <div className="mt-3" aria-live="polite">
        {query.trim() && !loading && totalCount(result) === 0 && (
          <p className="px-1 text-note text-muted">
            No matches for &ldquo;{result.query || query}&rdquo;.
          </p>
        )}

        {result.players.length > 0 && (
          <Section title="Players" count={result.players.length}>
            {result.players.map((p) => (
              <li key={p.id} className="flex items-stretch">
                <ListRow
                  href={valuesFocusHref(p.id)}
                  className="min-w-0 flex-1"
                  chevron={false}
                  avatar={<PlayerAvatar name={p.name} team={p.team} playerId={p.id} size="sm" />}
                  title={p.name}
                  meta={[p.position, p.team, p.age != null ? `${p.age}y` : null].filter(Boolean).join(" · ")}
                  value={fmtValue(p.value)}
                  valueSub={p.tier}
                />
                {/* A sibling, not nested: the row is already one link. Search is where a
                    reader arrives with a name and no context, so "how did he get here"
                    is one tap away. */}
                <Link
                  href={playerLineageHref(p.id)}
                  aria-label={`Where ${p.name} came from`}
                  className="flex w-12 shrink-0 items-center justify-center text-secondary transition-colors hover:bg-surface-2 hover:text-accent-text"
                >
                  <GitBranch size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </Section>
        )}

        {result.managers.length > 0 && (
          <Section title="Managers" count={result.managers.length}>
            {result.managers.map((m) => (
              <li key={m.id}>
                <ListRow
                  href={m.href}
                  avatar={
                    <TeamAvatar name={m.name} avatarId={m.avatar} teamLogoUrl={m.teamLogoUrl} size="sm" className="rounded-full" />
                  }
                  title={m.name}
                  badge={
                    m.isFormer ? (
                      <Chip size="sm">former{m.tenureLabel ? ` · ${m.tenureLabel}` : ""}</Chip>
                    ) : null
                  }
                  meta={m.displayName !== m.name ? m.displayName : null}
                />
              </li>
            ))}
          </Section>
        )}

        {result.trades.length > 0 && (
          <Section title="Trades" count={result.trades.length}>
            {result.trades.map((t) => (
              <li key={t.id}>
                <ListRow
                  href={dealHref(t.id)}
                  avatar={<ArrowLeftRight size={18} aria-hidden="true" className="text-info" />}
                  title={<span className="text-note font-medium">{t.description}</span>}
                  meta={`${t.season} · week ${t.week}`}
                />
              </li>
            ))}
          </Section>
        )}

        {result.picks.length > 0 && (
          <Section title="Picks" count={result.picks.length}>
            {result.picks.map((p) => (
              <li key={p.id}>
                <ListRow
                  href={p.href}
                  avatar={<GitBranch size={18} aria-hidden="true" className="text-secondary" />}
                  title={p.label}
                  meta={
                    p.resolved
                      ? `${p.playerName ?? "no player"} · ${p.ownerName}`
                      : `Not yet drafted · held by ${p.ownerName}`
                  }
                />
              </li>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
function Section({ title, count, children }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1.5 flex items-baseline gap-1.5 px-1 text-note font-semibold text-muted">
        {title}
        <span className="figure text-meta font-medium text-secondary">{count}</span>
      </h2>
      <List>{children}</List>
    </section>
  );
}
