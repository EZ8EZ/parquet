/**
 * SEATS - the commissioner's half of the identity flow.
 *
 * Multi-user Parquet has no signup, no invite email and no user table (see
 * lib/auth/seat.ts for why). Onboarding a league is therefore one physical act: the
 * commissioner copies each manager's claim link out of this section and sends it to
 * them however they already talk. This is the surface that makes that act possible,
 * and it lives on the commissioner page because that is already the page for things
 * only the person running the league does.
 *
 * WHO MAY SEE IT. A claim link is a bearer credential - anyone holding EZ8's link can
 * write as EZ8 - so the list renders only for the deploy owner's own seat. Everybody
 * else gets nothing at all rather than a locked panel, because a panel that announces
 * "there are fourteen credentials behind this door" is an invitation. In legacy mode
 * there are no credentials to leak, so it renders the setup note instead, which is
 * the only place in the app that tells the owner this capability exists.
 */
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import type { LeagueHistory } from "@/lib/history";
import {
  authSecret,
  claimUrl,
  deployOwnerId,
  isSafeOwnerId,
  readSeat,
  requestOrigin,
} from "@/lib/auth/server";
import { CopyBlock } from "@/components/CopyBlock";
import { SectionHeader, Tag } from "@/components/ui";

export async function SeatLinks({ h }: { h: LeagueHistory }) {
  const secret = authSecret();

  if (!secret) {
    return (
      <>
        <SectionHeader
          title="Seats"
          action={<Tag tone="neutral">single user</Tag>}
        />
        <div className="rounded-[--radius] border border-border bg-surface p-3">
          <div className="flex items-start gap-2.5">
            <KeyRound size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
            <div className="min-w-0">
              <p className="text-body font-semibold leading-tight text-ink">
                Everyone who opens this app can write as whoever they are viewing
              </p>
              <p className="mt-1 text-meta leading-relaxed text-muted">
                That is the right default for one person running Parquet on their own
                machine. To hand the app to the league, set an{" "}
                <span className="font-mono">AUTH_SECRET</span> environment variable to
                any long random string. Private authorship then requires a signed seat,
                and this section turns into one claim link per manager for you to hand
                out. Nothing else about the app changes: every public number stays
                readable as any team, by anyone.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const [seat, ownerId, origin] = await Promise.all([
    readSeat(),
    deployOwnerId(),
    requestOrigin(),
  ]);

  // Not the deploy owner (or we could not confirm who that is): render nothing.
  if (!ownerId || seat.ownerId !== ownerId) return null;

  // Current managers only. A departed principal keeps their annotations (D22) but
  // has no reason to be handed a fresh link into a league they have left.
  const allManagers = h.rosters
    .filter((r) => !!r.ownerId)
    .map((r) => {
      const user = h.usersById.get(r.ownerId!);
      return {
        rosterId: r.rosterId,
        ownerId: r.ownerId!,
        displayName: user?.displayName ?? r.ownerId!,
        teamName: user?.teamName ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // ONE UNSIGNABLE ID MUST NOT TAKE DOWN THE PAGE. `claimUrl` -> `signSeatToken`
  // THROWS on an owner id the token format cannot carry unambiguously (lib/auth/seat.ts),
  // and a throw inside this map is an unhandled error in a server component: the whole
  // /commissioner render, not one row. So the check happens here, where the answer can
  // be "thirteen links, and here is the one manager who could not get one and why".
  const managers = allManagers.filter((m) => isSafeOwnerId(m.ownerId));
  const unsignable = allManagers.filter((m) => !isSafeOwnerId(m.ownerId));

  // THE ORIGIN IS NOT OPTIONAL, AND A MISSING ONE IS NOT A SMALLER LINK. Concatenating
  // `""` produced a relative `/claim?t=...` that renders in the copy block looking
  // exactly like a working claim link, so the commissioner would copy it, send it, and
  // it would go nowhere. Say so instead - and do NOT guess a hostname, because a claim
  // link is a bearer credential and one pointed at the wrong host is worse than none.
  // Falsy rather than `=== null`, because the empty string is the shape this bug
  // actually shipped in and "no origin" must mean the same thing however it arrives.
  if (!origin) {
    return (
      <>
        <SectionHeader title="Seats" action={<Tag tone="warn">unavailable</Tag>} />
        <div className="rounded-[--radius] border border-warn/30 bg-warn/[0.06] p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="text-body font-semibold leading-tight text-ink">
                Claim links cannot be built on this request
              </p>
              <p className="mt-1 text-meta leading-relaxed text-muted">
                A claim link needs to know where this deployment lives, and this request
                arrived with no <span className="font-mono">Host</span> header to read it
                from. Rather than hand you links missing their front half - which copy and
                send exactly like working ones and resolve nowhere - the list is withheld.
                Reload the page; if it keeps happening, run{" "}
                <span className="font-mono">pnpm claim-links https://your-host</span> from
                a checkout, which takes the origin as an argument and prints the same
                links this section would.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title="Seats"
        action={<Tag tone="positive">{managers.length} links</Tag>}
      />
      <div className="mb-2 flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
        <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-positive" />
        <p className="min-w-0 text-meta leading-relaxed text-muted">
          Send each manager their own link, once. Opening it in the browser they use
          claims that seat and lets them capture reasoning as themselves. Treat a link
          like a key: whoever holds it holds that seat. Rotating{" "}
          <span className="font-mono">AUTH_SECRET</span> invalidates every one of them
          at once, which is also how you undo a mistake.
        </p>
      </div>
      <div className="space-y-2">
        {managers.map((m) => (
          <div
            key={m.ownerId}
            className="rounded-[--radius] border border-border bg-surface p-2.5"
          >
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="min-w-0 truncate text-body font-semibold text-ink">
                {m.displayName}
              </span>
              {m.teamName && (
                <span className="min-w-0 truncate text-meta text-secondary">
                  {m.teamName}
                </span>
              )}
              {m.ownerId === ownerId && <Tag tone="accent">you</Tag>}
            </div>
            <CopyBlock
              text={claimUrl(m.ownerId, secret, origin)}
              label={`Claim link for ${m.displayName}`}
            />
          </div>
        ))}
        {unsignable.length > 0 && (
          <div className="rounded-[--radius] border border-warn/30 bg-warn/[0.06] p-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-warn"
              />
              <div className="min-w-0">
                <p className="text-body font-semibold leading-tight text-ink">
                  {unsignable.length === 1
                    ? "One manager has no link"
                    : `${unsignable.length} managers have no link`}
                </p>
                <p className="mt-1 text-meta leading-relaxed text-muted">
                  A seat token is separator-delimited, so an owner id containing a{" "}
                  <span className="font-mono">.</span> (or anything outside letters,
                  digits, <span className="font-mono">_</span> and{" "}
                  <span className="font-mono">-</span>) would make the token ambiguous and
                  cannot be signed. Everyone else above is unaffected.
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {unsignable.map((m) => (
                    <li key={m.ownerId} className="text-meta leading-snug text-muted">
                      <span className="font-semibold text-ink">{m.displayName}</span>{" "}
                      <span className="font-mono text-secondary">
                        (id {JSON.stringify(m.ownerId)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
