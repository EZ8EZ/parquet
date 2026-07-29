"use client";

/**
 * PlayerAvatar — the single abstraction for player imagery.
 *
 * Default: generated monogram avatars in team colors (no licensing concern, looks
 * intentional). Real photos are gated behind NEXT_PUBLIC_USE_PLAYER_PHOTOS (default
 * false) and served from Sleeper's own CDN by player_id — Sleeper's NBA payload
 * returns null espn_id for every player, so ESPN headshots aren't usable (see
 * DECISIONS.md D8). Not every player has a photo (some 404/403), so we fall back to
 * the monogram on load error — hence this is a client component.
 */
import { useState } from "react";
import { cn } from "@/lib/ui";

/** A handful of NBA team [primary, secondary] colors; extend as needed. */
const TEAM_COLORS: Record<string, [string, string]> = {
  BOS: ["#007A33", "#0b3d1f"], LAL: ["#552583", "#FDB927"], GSW: ["#1D428A", "#FFC72C"],
  MIL: ["#00471B", "#EEE1C6"], DEN: ["#0E2240", "#FEC524"], PHI: ["#006BB6", "#ED174C"],
  MIA: ["#98002E", "#F9A01B"], DAL: ["#00538C", "#002B5E"], PHX: ["#1D1160", "#E56020"],
  MEM: ["#5D76A9", "#12173F"], CLE: ["#860038", "#FDBB30"], NYK: ["#006BB6", "#F58426"],
  MIN: ["#0C2340", "#236192"], SAC: ["#5A2D81", "#63727A"], OKC: ["#007AC1", "#EF3B24"],
  NOP: ["#0C2340", "#C8102E"], ATL: ["#E03A3E", "#26282A"], TOR: ["#CE1141", "#000000"],
  CHI: ["#CE1141", "#000000"], LAC: ["#C8102E", "#1D428A"], IND: ["#002D62", "#FDBB30"],
  ORL: ["#0077C0", "#C4CED4"], HOU: ["#CE1141", "#C4CED4"], SAS: ["#C4CED4", "#000000"],
  UTA: ["#002B5C", "#00471B"], POR: ["#E03A3E", "#000000"], BKN: ["#000000", "#7c7c7c"],
  WAS: ["#002B5C", "#E31837"], CHA: ["#1D1160", "#00788C"], DET: ["#C8102E", "#1D42BA"],
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function colorsFor(team: string | null, name: string): [string, string] {
  if (team && TEAM_COLORS[team]) return TEAM_COLORS[team];
  const hue = hashHue(name);
  return [`hsl(${hue} 45% 32%)`, `hsl(${(hue + 40) % 360} 45% 22%)`];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = { sm: 32, md: 40, lg: 56 } as const;

export function PlayerAvatar({
  name,
  team,
  playerId,
  size = "md",
  className,
}: {
  name: string;
  team?: string | null;
  playerId?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZES[size];
  const [c1, c2] = colorsFor(team ?? null, name);
  // Defaults to ON. This is a private-use app and the owner asked for real photos;
  // NEXT_PUBLIC_* is inlined at BUILD time, so a Vercel deploy that forgot the var
  // would otherwise silently ship monograms with no way to tell why.
  // Set NEXT_PUBLIC_USE_PLAYER_PHOTOS=false to force monograms everywhere.
  const usePhotos = process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS !== "false";

  if (usePhotos && playerId && !failed) {
    // Sleeper CDN thumbnail (personal/local use). Falls back to monogram on error.
    const src = `https://sleepercdn.com/content/nba/players/thumb/${playerId}.jpg`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={px}
        height={px}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover object-top ring-1 ring-white/10", className)}
        style={{ width: px, height: px, background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      />
    );
  }

  const fontSize = Math.round(px * 0.38);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold text-white/90 ring-1 ring-white/10",
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
    >
      {initials(name)}
    </span>
  );
}
