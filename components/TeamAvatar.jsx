"use client";
/**
 * TeamAvatar - the single abstraction for manager/team imagery.
 *
 * Source order, best first (all verified against the live league):
 *   1. `teamLogoUrl` - a custom team logo the manager uploaded. Sleeper exposes this
 *      as a FULL URL in the league-user's `metadata.avatar`. Only some managers set
 *      one (7 of 14 in this league).
 *   2. `avatarId` - the Sleeper user avatar, rendered from the thumbs CDN. Note some
 *      managers share the same default avatar id, so this is not identifying.
 *   3. A generated monogram in a deterministic colour derived from the name, so
 *      every team still reads as distinct.
 *
 * Client component because steps 1 and 2 need an onError fallback: not every id
 * resolves, and a broken image is worse than a monogram.
 */
import { useState } from "react";
import { cn } from "@/lib/ui";
const SIZES = { xs: 22, sm: 28, md: 36, lg: 48 };
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
/** Up to 2 initials from a team name ("5-Year Plan" -> "5P", "eddie house" -> "EH"). */
function initials(name) {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
export function TeamAvatar({
  name,
  avatarId,
  teamLogoUrl,
  size = "md",
  isMe = false,
  className,
}) {
  const [failed, setFailed] = useState({});
  const px = SIZES[size];
  const candidates = [];
  if (teamLogoUrl) candidates.push(teamLogoUrl);
  if (avatarId)
    candidates.push(`https://sleepercdn.com/avatars/thumbs/${avatarId}`);
  const src = candidates.find((c) => !failed[c]);
  const hue = hashHue(name);
  const bg = `linear-gradient(135deg, hsl(${hue} 42% 30%), hsl(${(hue + 44) % 360} 42% 19%))`;
  const ring = isMe ? "ring-2 ring-accent" : "ring-1 ring-ink/10";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        onError={() => setFailed((f) => ({ ...f, [src]: true }))}
        className={cn("shrink-0 rounded-lg object-cover", ring, className)}
        style={{ width: px, height: px, background: bg }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight text-white/90",
        ring,
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize: Math.round(px * 0.36),
        background: bg,
      }}
    >
      {initials(name)}
    </span>
  );
}
