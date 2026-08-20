"use client";
/**
 * PlayerAvatar — the single abstraction for player imagery.
 *
 * Real photos when this deploy has them on, a generated monogram in the themed disc
 * otherwise. The on/off rule and the reasoning behind its default now live in ONE
 * place, `lib/photos.js` (`photosEnabled`), which this file imports and re-exports
 * rather than re-deriving: the check used to be written out twice, here and there, and
 * two copies of a boolean are two chances to drift.
 *
 * THE DEFAULT IS ON as of D90, revising D39's OFF. Short version: `NEXT_PUBLIC_*` is
 * inlined at BUILD time, so the dashboard-plus-redeploy dance D39 left the owner with
 * silently ate four separate requests for this feature. Fork protection is kept, but
 * moved onto a check that can only fail in the owner's favour - read `lib/photos.js`'s
 * header for the full three-branch rule, and do not restore an `=== "true"` here.
 *
 * Source: Sleeper's own CDN by player_id
 * (`sleepercdn.com/content/nba/players/thumb/{id}.jpg`). Sleeper's NBA payload
 * returns null `espn_id` for every player and no field that is an NBA.com person id
 * (checked every id Sleeper does send — rotowire_id, sportradar_id, swish_id,
 * fantasy_data_id, kalshi_id, oddsjam_id — none of them is it), so a third-party
 * headshot CDN keyed by a real id isn't reachable (D8, re-verified D39). Not every
 * player has a Sleeper image, so `<PlayerAvatar>` is a client component that falls
 * back to the monogram on load error.
 *
 * HOW OFTEN THE FALLBACK ACTUALLY FIRES, measured rather than estimated (D90). All 592
 * active Sleeper NBA players with a team were probed: 475 return 200 (80.2%) and 117
 * return 403. Weighted the way a reader actually meets them - by Sleeper's own
 * `search_rank`, i.e. roughly "who is rostered and shown on /values" - it is 96% for
 * the top 100 and 93% for the top 200. Every miss inside the top 200 is a 2026 rookie
 * (Cameron Boozer, AJ Dybantsa, Darryn Peterson and the rest of that class), which is
 * a photo Sleeper has not shot yet, not a photo we are being denied. The monogram
 * fallback is therefore a real, load-bearing path on a normal page - expect a handful
 * of monograms mixed into a list of faces, and note that this is the CORRECT rendering
 * of that list, not a bug to go chase.
 *
 * The 403s are S3 `AccessDenied` bodies (`<Code>AccessDenied</Code>` plus an S3
 * RequestId), which is what that bucket returns for an object that does not exist -
 * NOT a block on us. Recorded because D73 concluded the opposite from the same 403 and
 * wrote off the whole CDN as unreachable from a sandbox: the host answers fine, team
 * logos and `api.sleeper.app` both 200, it is purely per-object. A 403 from this URL
 * means "no photo for this id", never "we are being rate-limited."
 *
 * Despite the `.jpg` in the URL and an `image/jpeg` response header, the bytes
 * Sleeper actually sends are a PNG with a real alpha channel — a proper cutout, not
 * a flat rectangle (confirmed with `file`/`sips` and an alpha histogram in D39: ~65%
 * of pixels are non-opaque on every player checked). Browsers sniff image bytes
 * rather than trust the extension or header, so this already renders as a
 * transparent cutout with NO extra work. The `background` below is not a fallback
 * hack for that — it's the intentional backdrop the cutout sits on, so a floating
 * head never looks accidental on either theme and there's no risk of a dark hairline
 * vanishing against a dark page. (Either, not "any of the three": the contrast theme
 * was retired in D64 and `THEMES` is `["dark", "light"]`. Both define
 * `--color-elevated` and `--color-border-strong`, so the disc below still resolves in
 * both after D61's token work and D62's re-themed mark - re-checked in D90.)
 *
 * THE SOURCE FRAME IS LANDSCAPE, 250x168, not a square and not a portrait - a
 * head-and-shoulders cutout with the head centred horizontally and transparent margin
 * either side. That is why `object-cover` is right and why `object-top` is harmless
 * rather than load-bearing: cover scales to the box HEIGHT here (the tighter
 * constraint), so the vertical axis already fits exactly and only the transparent side
 * margin gets cropped. Do not "fix" this to `object-contain` - that would letterbox a
 * cutout inside a circle and shrink every face.
 *
 * DO NOT MIGRATE THIS TO `next/image`. The `no-img-element` lint rule below is
 * suppressed on purpose, not out of laziness. `next/image` would route the file
 * through this app's OWN optimizer, which means Parquet would be fetching, re-encoding
 * and SERVING the headshot from its own domain - precisely the "a copy this app stores
 * or serves itself" that the personal-use posture in `.env.example` depends on not
 * doing. A plain `<img>` is a hotlink, the browser talks straight to Sleeper, and the
 * bytes never touch our infrastructure. The lint suppression is the cheaper half of
 * that trade; it also means `images.remotePatterns` is deliberately not configured for
 * this host, so a migration would be a licensing regression AND a build error.
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
import { TeamLogo } from "@/components/TeamLogo";
/**
 * NBA team primary colours. Used ONLY for the 2px identity edge now — never as a
 * fill — so the saturation that made these unusable as a background is harmless here:
 * a 2px sliver has no area to shout with.
 */
const TEAM_COLORS = {
  BOS: ["#007A33", "#0b3d1f"],
  LAL: ["#552583", "#FDB927"],
  GSW: ["#1D428A", "#FFC72C"],
  MIL: ["#00471B", "#EEE1C6"],
  DEN: ["#0E2240", "#FEC524"],
  PHI: ["#006BB6", "#ED174C"],
  MIA: ["#98002E", "#F9A01B"],
  DAL: ["#00538C", "#002B5E"],
  PHX: ["#1D1160", "#E56020"],
  MEM: ["#5D76A9", "#12173F"],
  CLE: ["#860038", "#FDBB30"],
  NYK: ["#006BB6", "#F58426"],
  MIN: ["#0C2340", "#236192"],
  SAC: ["#5A2D81", "#63727A"],
  OKC: ["#007AC1", "#EF3B24"],
  NOP: ["#0C2340", "#C8102E"],
  ATL: ["#E03A3E", "#26282A"],
  TOR: ["#CE1141", "#000000"],
  CHI: ["#CE1141", "#000000"],
  LAC: ["#C8102E", "#1D428A"],
  IND: ["#002D62", "#FDBB30"],
  ORL: ["#0077C0", "#C4CED4"],
  HOU: ["#CE1141", "#C4CED4"],
  SAS: ["#C4CED4", "#000000"],
  UTA: ["#002B5C", "#00471B"],
  POR: ["#E03A3E", "#000000"],
  BKN: ["#000000", "#7c7c7c"],
  WAS: ["#002B5C", "#E31837"],
  CHA: ["#1D1160", "#00788C"],
  DET: ["#C8102E", "#1D42BA"],
};
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
/** The one team-derived colour left in this component: the 2px identity edge. */
function edgeFor(team, name) {
  if (team && TEAM_COLORS[team]) return TEAM_COLORS[team][0];
  // No team on file. A hashed hue is still stable per player and still not load-
  // bearing; it can sit at moderate chroma because it is two pixels wide.
  return `hsl(${hashHue(name)} 45% 45%)`;
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const SIZES = { sm: 32, md: 40, lg: 56 };
/**
 * Re-exported from `lib/photos.js` (a plain, server-safe module) rather than
 * defined here: this file is `"use client"`, and Next.js refuses to call ANY
 * export of a client module from server-side code - a Server Component that needs
 * this check (app/drafts/parts.jsx, app/lab/counterfactual/page.jsx,
 * app/recap/page.jsx) has to import it from lib/photos.js directly instead. Kept
 * importable from here too so the two existing client callers (`ValuesList`,
 * `RankingBoard`) don't need to change.
 */
import { photosEnabled } from "@/lib/photos";
export { photosEnabled };
export function PlayerAvatar({
  name,
  team,
  playerId,
  size = "md",
  className,
  teamBadge,
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZES[size];
  const edge = edgeFor(team ?? null, name);
  // The disc is a themed surface, never a team colour. The team is a 2px stripe at the
  // far left, painted as a gradient stop rather than a `border-left` on purpose: a
  // border on a `rounded-full` box is drawn as an ARC, which reads as a coloured ring
  // and is exactly the loud thing this change is removing. A gradient stop is a
  // straight edge that the circle then clips to a sliver.
  const disc = {
    width: px,
    height: px,
    background: `linear-gradient(90deg, ${edge} 0 2px, var(--color-elevated) 2px)`,
  };
  // One implementation of this rule, in lib/photos.js, called rather than copied - the
  // server-side call sites (`/recap`, `/drafts`, `/lab/counterfactual`) gate on the very
  // same function, and this component disagreeing with them about the answer is a
  // hydration mismatch. Defaults ON; see this file's header and D90.
  const usePhotos = photosEnabled();
  const avatar =
    usePhotos && playerId && !failed ? (
      // Sleeper CDN thumbnail (personal/local use per .env.example). Actually a
      // transparent-cutout PNG despite the .jpg extension — see the file header.
      // Falls back to the monogram on load error (missing photo, not a licensing gate).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://sleepercdn.com/content/nba/players/thumb/${playerId}.jpg`}
        alt={name}
        width={px}
        height={px}
        decoding="async"
        // `/values` renders ~60 of these and `/rank` up to 120, one per row, which
        // with the flag now ON by default is the difference between a handful of
        // requests and every face on the list at once on a phone. Lazy is safe for the
        // fallback too: an image below the fold simply errors later, and until it
        // resolves the row shows the themed disc, which is the intended backdrop
        // rather than a hole (D73 confirmed the layout does not reflow around a
        // pending image, so nothing shifts when it lands).
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover object-top ring-1 ring-border-strong",
          !teamBadge && className,
        )}
        style={disc}
      />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          // Monogram, not a code: it is a person's initials, so it takes the sans like
          // every other name in the app rather than the identifier face.
          "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink ring-1 ring-border-strong",
          !teamBadge && className,
        )}
        style={{ ...disc, fontSize: Math.round(px * 0.38) }}
      >
        {initials(name)}
      </span>
    );
  if (!teamBadge || !team) return avatar;
  // The badge sits in its own same-sized wrapper so callers that pass a `className`
  // (a margin, most often) still land on the outer box rather than getting lost
  // inside it. `overflow-visible` is the point of the wrapper existing at all - the
  // crest pokes past the disc's own edge on purpose, so it reads as a badge and not
  // as a second, smaller face crammed inside the first.
  const BADGE_SIZE = { sm: "xs", md: "xs", lg: "sm" };
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: px, height: px }}
    >
      {avatar}
      <TeamLogo
        team={team}
        className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg p-0.5 ring-1 ring-border-strong"
        size={BADGE_SIZE[size]}
      />
    </span>
  );
}
