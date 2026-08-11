/**
 * Per-award badge icons for /awards.
 *
 * One icon per award id so the page stops rendering 22 identical trophies. The
 * mapping lives here, not on the page, so a new award added to lib/superlatives
 * can be given an icon in one place and audited at a glance.
 */
import {
  Armchair,
  Baby,
  ClipboardCheck,
  Coins,
  Crown,
  DollarSign,
  Ghost,
  Handshake,
  Landmark,
  Layers,
  PhoneIncoming,
  PhoneOutgoing,
  Rabbit,
  RefreshCw,
  Search,
  ShoppingCart,
  Siren,
  TrendingDown,
  TrendingUp,
  Trophy,
  Turtle,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AwardGroup } from "@/lib/superlatives";
import { cn } from "@/lib/ui";

/**
 * Group -> tone, using the Tag component's tone prop: one of the app's five semantic
 * colors, never a new palette.
 *
 * NOT YET FIXED, and it is the same defect posture had: `margins: "negative"` and
 * `taste: "positive"` are categories wearing pass/fail tokens. The posture maps this
 * comment used to point at were retired for exactly that reason - see the note in
 * components/PostureTag.tsx. Award groups need the same treatment and did not get it
 * in that pass, because a badge's icon already carries the category and the recolor
 * needs its own look at what each group means.
 */
export type BadgeTone = "accent" | "positive" | "negative" | "info" | "warn";

export const GROUP_TONE: Record<AwardGroup, BadgeTone> = {
  performance: "accent",
  "trade-desk": "info",
  capital: "warn",
  taste: "positive",
  margins: "negative",
};

/**
 * One icon per award id. Every id in lib/superlatives should have an entry; a miss
 * falls back to Trophy in iconForAward rather than throwing, so a newly added award
 * never breaks the page while it waits for a considered icon choice.
 */
export const AWARD_ICONS: Record<string, LucideIcon> = {
  // performance - graded with hindsight against a stated baseline
  "start-rate": ClipboardCheck, // every lineup slot filled, like a checklist run clean
  "start-rate-worst": Armchair, // points that stayed on the bench
  "draft-capture": Search, // scouting read of value against the board
  "draft-steal": Zap, // a pick that shocked its slot
  "draft-bust": TrendingDown, // value that cratered relative to where it was taken
  fragility: Layers, // a roster stacked precariously on a few load-bearing pieces
  "trade-value": TrendingUp, // net value climbing through trades

  // trade desk - who deals, how often, and who calls first
  "most-trades": Handshake,
  "fewest-trades": Ghost, // never around to make a deal
  initiator: PhoneOutgoing, // always the one making the call
  responder: PhoneIncoming, // always the one taking the call
  "trade-pairing": Users, // two managers who deal with each other more than anyone

  // draft capital - picks banked, spent, or cashed in early
  "pick-hoarder": Coins,
  "pick-spender": Landmark, // borrows against the future, a mortgage on picks
  "deadline-buyer": ShoppingCart,

  // taste and timing - age preference and emotional trading
  "youth-acquirer": Baby,
  "veteran-acquirer": Crown, // pays for the resume
  "panic-button": Siren, // trades fired off right after a loss

  // margins - the grind of waivers, FAAB, and holding periods
  "waiver-churn": RefreshCw,
  "faab-spender": DollarSign,
  // Turtle/Rabbit is a deliberate pair: slowest and fastest turnover read at a glance
  // even before the title is legible.
  "longest-hold": Turtle,
  "shortest-hold": Rabbit,
};

/** Never throws. An award without a considered icon yet still renders something. */
export function iconForAward(id: string): LucideIcon {
  return AWARD_ICONS[id] ?? Trophy;
}

const TONE_BG: Record<BadgeTone, string> = {
  accent: "bg-accent-wash border-accent-edge",
  positive: "bg-positive/16 border-positive/30",
  negative: "bg-negative/16 border-negative/30",
  info: "bg-info/16 border-info/30",
  warn: "bg-warn/16 border-warn/30",
};

const TONE_ICON: Record<BadgeTone, string> = {
  accent: "text-accent-text",
  positive: "text-positive",
  negative: "text-negative",
  info: "text-info",
  warn: "text-warn",
};

export function AwardBadge({
  icon: Icon,
  tone,
  rank,
  size,
  className,
}: {
  icon: LucideIcon;
  tone: BadgeTone;
  /**
   * Rank drives the whole visual, not a per-place color: a winner gets the group's
   * tone plus a gold ring, every runner-up gets the same muted treatment regardless
   * of whether it placed 2nd or 4th. No silver/bronze palette to invent or maintain.
   */
  rank: "winner" | "runner-up";
  size?: number;
  className?: string;
}) {
  const isWinner = rank === "winner";
  const dim = size ?? (isWinner ? 32 : 20);
  const iconSize = Math.round(dim * 0.52);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border",
        isWinner ? TONE_BG[tone] : "border-border bg-surface-2",
        className,
      )}
      style={{
        width: dim,
        height: dim,
        boxShadow: isWinner ? "0 0 0 2px var(--color-accent)" : undefined,
      }}
    >
      <Icon
        size={iconSize}
        strokeWidth={2}
        className={isWinner ? TONE_ICON[tone] : "text-faint"}
      />
    </span>
  );
}
