import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { buildDossier } from "@/lib/dossier";
import { getPrincipals } from "@/lib/principals";
import { PageHeader } from "@/components/ui";
import { TeamPicker } from "@/components/TeamPicker";
import { NEXT_PARAM, safeNextPath } from "@/lib/auth/entry";
import { readLensRosterId } from "@/lib/auth/server";
import { Onward } from "@/components/Onward";
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
  const hasLens = (await readLensRosterId()) != null;
  const ranked = leagueValueRanking(h);
  const principals = await getPrincipals(h);
  // `r.record` is the live roster snapshot, which is 0-0 for the whole league outside
  // the season window (see DECISIONS.md D29). `currentFormByRoster` walks back to the
  // most recent COMPLETED season instead, same as Home, and flags a fallback so the
  // label can say "2025 final" rather than passing a stale record off as current.
  const form = await currentFormByRoster(h);
  const teams = ranked.map((r) => {
    const d = buildDossier(h, r.rosterId, principals);
    const f = form.get(r.rosterId);
    const record = f
      ? `${f.wins}-${f.losses}${f.isLive ? "" : ` (${f.season} final)`}`
      : `${r.record.wins}-${r.record.losses}`;
    return {
      rosterId: r.rosterId,
      teamName: r.teamName ?? r.ownerName,
      ownerName: r.ownerName,
      record,
      totalValue: r.totalValue,
      window: r.window,
      tags: d.tags,
    };
  });
  return (
    <div>
      <PageHeader
        kicker={h.currentLeague.name}
        title="Whose team are you?"
        subtitle="Pick a team to run the whole app as that manager - their roster, their revealed strategy, their game plan, their read on everyone else. Nothing here is permanent: tap your team's name at the bottom of any page to switch to a different one later."
      />
      {/* Empty on purpose: there is no per-visitor stored username to reflect (the
            "viewing as" cookie stores a rosterId, not a Sleeper handle - see
            /api/viewing-as), so any default here would just be one specific person's
            identity leaking into a stranger's first visit. currentRosterId above
            already reflects a RETURNING user's stored choice by highlighting their
            team in the list below. */}
      <TeamPicker
        teams={teams}
        currentRosterId={hasLens ? h.me.rosterId : null}
        username=""
        nextHref={nextHref}
      />
      {/* This page is where a leaguemate first meets the "viewing as" idea, so it is
            also the natural doorway to the page that explains the rest of the app. */}
      <p className="mt-4 text-center text-meta leading-relaxed text-secondary">
        New to Parquet?{" "}
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-accent-text hover:underline"
        >
          What this is, and what the numbers mean
        </Link>
      </p>
      <Onward from="/teams" />
    </div>
  );
}
