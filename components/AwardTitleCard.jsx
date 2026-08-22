/**
 * THE AWARD TITLE CARD - one family, two scales (VISION M7).
 *
 * The Superlatives have 30-for-30 names and had phone-book bodies: twelve sections,
 * each the identical 4-row list. The names deserved title cards, so each award now
 * OPENS on one - the name set huge in Fraunces on the poster ground (near-black in
 * dark, deep cream on paper; see --color-poster in globals.css), one stat as the
 * deck line in the broadcast voice (mono, tabular), the winner's team mark - and the
 * existing ranked list runs beneath, unchanged in content. /recap's three held-award
 * mini-cards are the same family at mini scale, so recap and awards read as one
 * system rather than two treatments of the same object.
 *
 * HOUSE RULES, load-bearing:
 *  - D6: everything a poster sets is a MEASUREMENT the model already publishes -
 *    the award title, the stat line, the winner's name. No grade, no verdict is
 *    introduced here, and the honesty caveats stay in the subtitles below.
 *  - Monochrome + gold ONLY. These are league-wide awards - there is no "yours vs
 *    the field" comparison on a poster, so no second hue enters. The winner being
 *    you is marked by the caller (a Tag on the winner line), not by tinting the card.
 *  - No truncation anywhere in the family (kill-list #8): the title balances and
 *    wraps, the deck wraps. A deck like "Brayden Adeyemi · pick 11, 29th best in
 *    2024" is a full clause and loses its meaning cut mid-number.
 *  - The deck is set in the mono face deliberately, against .figure's usual
 *    "identifiers only" rule: VISION names title-card numbers as the broadcast
 *    voice's one job ("mono numerals... exists as a font choice, gets a job").
 *  - No entrance animation: the motion register (VISION M8) is closed at three
 *    moments and a poster fade-in is not one of them.
 */
import Link from "next/link";
import { cn } from "@/lib/ui";

/**
 * Full-scale poster, the head of one award's section on /awards.
 *
 * `as` is the heading element, decided by the page's own outline (h3 under the
 * group h2s on /awards) - the poster changes the size of the heading, never its
 * level. `children` is the winner line (team mark + name), page-local components
 * the family should not import.
 */
export function AwardPoster({ as: Heading = "h3", title, deck, children }) {
  return (
    <div className="bg-poster px-3 pb-3 pt-4">
      {/* The gold floor-line - the one accent element a monochrome card gets. */}
      <span aria-hidden="true" className="block h-[3px] w-7 bg-accent" />
      <Heading className="mt-2.5 text-balance font-display text-display font-bold leading-[1.05] tracking-[-0.02em] text-ink">
        {title}
      </Heading>
      <p className="figure mt-1.5 font-mono text-note font-medium leading-snug text-accent-text">
        {deck}
      </p>
      {children}
    </div>
  );
}

/**
 * Mini scale, for /recap's "awards you hold". A whole card is one link to /awards;
 * the icon is the award's own (AwardBadge's mapping) as a gold watermark rather
 * than a toned badge - the badge tones are the LIST's grammar, and a title card is
 * monochrome + gold by rule.
 */
export function AwardMiniCard({ href, icon: Icon, title, deck }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative block min-h-11 overflow-hidden rounded-[--radius] border border-border bg-poster px-3 py-2.5",
        "transition-colors hover:border-accent-edge",
      )}
    >
      {Icon && (
        <Icon
          size={44}
          strokeWidth={1.5}
          aria-hidden="true"
          className="absolute -right-1 -top-1 text-accent opacity-[0.16]"
        />
      )}
      <span aria-hidden="true" className="block h-0.5 w-5 bg-accent" />
      <span className="mt-1.5 block text-balance font-display text-lede font-bold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </span>
      <span className="figure mt-0.5 block font-mono text-meta leading-snug text-accent-text">
        {deck}
      </span>
    </Link>
  );
}
