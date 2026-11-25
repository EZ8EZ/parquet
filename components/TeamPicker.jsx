"use client";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Chip, Disclosure, List, ListRow } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";

/**
 * The first-run picker: one row per team, one tap to choose. The row is the whole
 * target (avatar, team name, manager and record), and the team you are already
 * viewing as carries a "Viewing" chip with a check, never colour alone. The Sleeper
 * username path is kept as a secondary route behind a Disclosure: most people
 * recognise their team faster than they type their handle.
 */
export function TeamPicker({ teams, currentRosterId, username = "", nextHref = "/" }) {
  const [pending, setPending] = useState(null);
  const [name, setName] = useState(username);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);

  // A full load, not router.push: before a team was picked the router prefetched the
  // tab links (Home among them) while the proxy still redirected them to this picker,
  // and push() would replay that cached redirect and leave the visitor here.
  function go(href) {
    window.location.assign(href);
  }

  async function choose(rosterId) {
    setPending(rosterId);
    try {
      await fetch("/api/viewing-as", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rosterId }),
      });
      go(nextHref);
    } finally {
      setPending(null);
    }
  }

  async function resolveUsername(e) {
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
      go(nextHref);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div>
      <List aria-label="Teams in this league">
        {teams.map((t) => {
          const active = t.rosterId === currentRosterId;
          return (
            <li key={t.rosterId}>
              <button
                type="button"
                onClick={() => choose(t.rosterId)}
                disabled={pending !== null}
                aria-current={active ? "true" : undefined}
                className="block w-full text-left disabled:cursor-wait"
              >
                <ListRow
                  as="span"
                  highlight={active}
                  avatar={
                    <TeamAvatar
                      name={t.teamName}
                      avatarId={t.avatarId}
                      teamLogoUrl={t.teamLogoUrl}
                      size="md"
                      isMe={active}
                      className="rounded-full"
                    />
                  }
                  title={t.teamName}
                  badge={
                    active ? (
                      <Chip tone="accent" size="sm" icon={Check}>
                        Viewing
                      </Chip>
                    ) : null
                  }
                  meta={`${t.ownerName} · ${t.record}`}
                  chevron={pending !== t.rosterId}
                  value={
                    pending === t.rosterId ? (
                      <Loader2 size={18} aria-label="Opening" className="animate-spin text-accent-text" />
                    ) : null
                  }
                />
              </button>
            </li>
          );
        })}
      </List>

      <Disclosure summary="Use your Sleeper username instead" className="mt-3">
        <form onSubmit={resolveUsername}>
          <label htmlFor="sleeper-username" className="mb-1.5 block text-meta font-semibold text-muted">
            Sleeper username or team name
          </label>
          <div className="flex gap-2">
            <input
              id="sleeper-username"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              placeholder="e.g. EZ8"
              className="min-h-11 w-full min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 text-body text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={resolving || !name.trim()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 text-body font-semibold text-accent-ink disabled:bg-elevated disabled:text-secondary"
            >
              {resolving ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : null}
              Go
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-note text-negative">
              {error}
            </p>
          )}
        </form>
      </Disclosure>
    </div>
  );
}
