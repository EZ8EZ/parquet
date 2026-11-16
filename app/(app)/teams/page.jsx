import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { PageHeader } from "@/components/ui";
import { ChevronRight } from "lucide-react";
import { TeamPicker } from "@/components/TeamPicker";
import { NEXT_PARAM, safeNextPath } from "@/lib/auth/entry";
import { readLensRosterId } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function TeamsPage({ searchParams }) {
  // A reader who arrived here by deep link (middleware bounces anyone with no lens
  // cookie - see lib/auth/entry.ts) gets sent on to the page they actually wanted
  // once they have picked. Sanitized, because this value is attacker-controlled and
  // ends in a navigation; anything that isn't a plain same-origin path is dropped.
  const raw = (await searchParams)[NEXT_PARAM];
  const nextHref = safeNextPath(typeof raw === "string" ? raw : null) ?? "/";
  const h = await getLeagueHistory();
  // Only a REAL stored choice may light up a row. `h.me.rosterId` falls back to the
  // deploy owner's roster when no lens cookie exists, so trusting it here would put a
  // checkmark next to EZ8's team on a stranger's very first visit - the exact
  // "one specific person's identity leaking" this page's own note below warns about.
  const lens = await readLensRosterId();
  const hasLens = lens != null && h.rostersById.has(lens);
  const ranked = leagueValueRanking(h);
  // `r.record` is the live roster snapshot, which is 0-0 for the whole league outside
  // the season window (see DECISIONS.md D29). `currentFormByRoster` walks back to the
  // most recent COMPLETED season instead, same as Home, and flags a fallback so the
  // label can say "2025 final" rather than passing a stale record off as current.
  const form = await currentFormByRoster(h);
  const teams = ranked.map((r) => {
    const f = form.get(r.rosterId);
    const record = f
      ? `${f.wins}-${f.losses}${f.isLive ? "" : ` (${f.season} final)`}`
      : `${r.record.wins}-${r.record.losses}`;
    // The picker rows carry the same avatar every other roster of teams in the app
    // does (TeamAvatar's source order: uploaded logo, Sleeper avatar, monogram) -
    // this used to be the one team list rendered as bare text.
    const user = h.rostersById.get(r.rosterId)?.ownerId
      ? h.usersById.get(h.rostersById.get(r.rosterId).ownerId)
      : null;
    return {
      rosterId: r.rosterId,
      teamName: r.teamName ?? r.ownerName,
      ownerName: r.ownerName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      record,
    };
  });
  // Alphabetical, not by value: this list answers "which one is mine", and a reader
  // scans for their own name, not for a rank.
  teams.sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: "base" }));
  return (
    <div>
      <PageHeader
        kicker={h.currentLeague.name}
        title="Whose team are you?"
        subtitle="Tap yours. Switch any time from the top right."
      />
      <TeamPicker
        teams={teams}
        currentRosterId={hasLens ? h.me.rosterId : null}
        username=""
        nextHref={nextHref}
      />
      <Link
        href="/about"
        className="mt-2 flex min-h-11 items-center justify-center gap-1 text-note font-semibold text-accent-text"
      >
        New to Parquet? What this is
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
