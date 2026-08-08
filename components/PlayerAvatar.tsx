"use client";

/**
 * PlayerAvatar — the single abstraction for player imagery.
 *
 * Default: generated monogram avatars in team colors (no licensing concern, looks
 * intentional). Real photos are gated behind NEXT_PUBLIC_USE_PLAYER_PHOTOS, which
 * defaults OFF now that this repo is public (see D39) — a fork or a Vercel deploy
 * that never set the var must not silently ship real, unlicensed headshots. Set it
 * to "true" to opt in.
 *
 * Source: Sleeper's own CDN by player_id
 * (`sleepercdn.com/content/nba/players/thumb/{id}.jpg`). Sleeper's NBA payload
 * returns null `espn_id` for every player and no field that is an NBA.com person id
 * (checked every id Sleeper does send — rotowire_id, sportradar_id, swish_id,
 * fantasy_data_id, kalshi_id, oddsjam_id — none of them is it), so a third-party
 * headshot CDN keyed by a real id isn't reachable (D8, re-verified D39). Not every
 * player has a Sleeper image (some 403/404 — genuinely missing, not blocked; see
 * D39), so `<PlayerAvatar>` is a client component that falls back to the monogram
 * on load error.
 *
 * Despite the `.jpg` in the URL and an `image/jpeg` response header, the bytes
 * Sleeper actually sends are a PNG with a real alpha channel — a proper cutout, not
 * a flat rectangle (confirmed with `file`/`sips` and an alpha histogram in D39: ~65%
 * of pixels are non-opaque on every player checked). Browsers sniff image bytes
 * rather than trust the extension or header, so this already renders as a
 * transparent cutout with NO extra work. The `background` below is not a fallback
 * hack for that — it's the intentional backdrop the cutout sits on, so a floating
 * head never looks accidental on any of the three themes and there's no risk of a
 * dark hairline vanishing against a dark page.
 *
 * WHY THE TEAM COLOURS ARE NOT THE BACKGROUND ANY MORE.
 *
 * This used to paint the whole disc in a full-saturation two-stop team gradient —
 * about 30 of them, most at chroma well above anything else in the palette. On
 * /values that made ~40 avatars the loudest objects on the page, louder than the
 * accent, which is supposed to be the only saturated thing in this app. And they
 * encoded nothing: the team abbreviation is already printed as text three characters
 * to the right of the disc, so the colour was a second, less legible copy of a datum
 * the reader already had.
 *
 * Now: the disc is --color-elevated, the monogram is real ink on it, and the team hue
 * survives as a 2px left edge — present if you know to look for it, never competing
 * with the row's actual content. Themed surface means it re-colours with the theme
 * for free instead of being three hard-coded near-blacks.
 */
import { useState } from "react";
import { cn } from "@/lib/ui";

/**
 * NBA team primary colours. Used ONLY for the 2px identity edge now — never as a
 * fill — so the saturation that made these unusable as a background is harmless here:
 * a 2px sliver has no area to shout with.
 */
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
/** The one team-derived colour left in this component: the 2px identity edge. */
function edgeFor(team: string | null, name: string): string {
  if (team && TEAM_COLORS[team]) return TEAM_COLORS[team][0];
  // No team on file. A hashed hue is still stable per player and still not load-
  // bearing; it can sit at moderate chroma because it is two pixels wide.
  return `hsl(${hashHue(name)} 45% 45%)`;
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
  const edge = edgeFor(team ?? null, name);
  // The disc itself is a themed surface, never a team colour. `borderLeft` carries the
  // team, and `background-clip: padding-box` keeps the surface from bleeding under it.
  const disc = {
    width: px,
    height: px,
    background: "var(--color-elevated)",
    borderLeft: `2px solid ${edge}`,
    backgroundClip: "padding-box" as const,
  };
  // Defaults to OFF (D39). NEXT_PUBLIC_* is inlined at BUILD time, so this deploy's
  // own env needs NEXT_PUBLIC_USE_PLAYER_PHOTOS=true set explicitly — the unset case
  // now means "forked or configured without thinking about licensing," which must
  // read as monograms, not real headshots.
  const usePhotos = process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS === "true";

  if (usePhotos && playerId && !failed) {
    // Sleeper CDN thumbnail (personal/local use per .env.example). Actually a
    // transparent-cutout PNG despite the .jpg extension — see the file header.
    // Falls back to the monogram on load error (missing photo, not a licensing gate).
    const src = `https://sleepercdn.com/content/nba/players/thumb/${playerId}.jpg`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={px}
        height={px}
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover object-top ring-1 ring-border-strong", className)}
        style={disc}
      />
    );
  }

  const fontSize = Math.round(px * 0.38);
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Monogram, not a code: it is a person's initials, so it takes the sans like
        // every other name in the app rather than the identifier face.
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink ring-1 ring-border-strong",
        className,
      )}
      style={{ ...disc, fontSize }}
    >
      {initials(name)}
    </span>
  );
}
