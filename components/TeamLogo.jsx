"use client";
/**
 * TeamLogo - the NBA team mark, hotlinked, for the handful of places a player's REAL
 * team is context worth a picture rather than three more letters of text.
 *
 * SOURCE: `sleepercdn.com/images/team_logos/nba/{abbr}.png`, lowercase abbreviation.
 * Verified for all 30 current NBA teams (200-300px square PNGs, correct crest for
 * each one checked by eye - Celtics, Lakers, Warriors, Heat, Mavericks, Bulls, Nets,
 * Jazz, Clippers and more render as themselves, not a placeholder). Same CDN, same
 * `sleepercdn.com` host, that `PlayerAvatar` and `TeamAvatar` already hotlink.
 *
 * NOT GATED behind `NEXT_PUBLIC_USE_PLAYER_PHOTOS`, on purpose. That flag exists for
 * ONE specific reason (see PlayerAvatar's header comment): a real person's face is a
 * licensing question a fork's owner needs to have actually thought about before it
 * ships. A team crest is a trademark, not a likeness, hotlinked exactly the way every
 * fantasy product on the web already displays one - and `TeamAvatar` next door
 * hotlinks Sleeper-hosted manager avatars (real people's own uploaded photos) with no
 * gate at all, so a brand mark held to a stricter bar than a person's face would be
 * backwards, not careful.
 *
 * Falls back to rendering nothing on a 404/network error - never a broken-image icon,
 * never a monogram (a team code has no initials worth abbreviating that beat the text
 * already next to it in every dense list; this exists for the few spots that DON'T
 * print the team elsewhere, so absence just means "no logo," not "missing data").
 */
import { useState } from "react";
import { cn } from "@/lib/ui";
const SIZES = { xs: 14, sm: 18, md: 24, lg: 32 };
export function TeamLogo({ team, size = "sm", className }) {
  const [failed, setFailed] = useState(false);
  if (!team || failed) return null;
  const px = SIZES[size];
  const src = `https://sleepercdn.com/images/team_logos/nba/${team.toLowerCase()}.png`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${team} logo`}
      width={px}
      height={px}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: px, height: px }}
    />
  );
}
