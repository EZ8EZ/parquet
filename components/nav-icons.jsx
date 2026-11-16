/**
 * href -> icon for the surface registry (lib/nav.ts). Kept out of that file on
 * purpose: lib/ never imports lucide-react anywhere in this app, and a plain data
 * registry should stay importable without pulling a UI library along with it.
 */
import {
  Award,
  Activity,
  BookText,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Repeat,
  Scale,
  FlaskConical,
  GitBranch,
  GitCompare,
  GraduationCap,
  Handshake,
  Info,
  ListOrdered,
  Palette,
  ScrollText,
  Search,
  Share2,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  ArrowLeftRight,
} from "lucide-react";
export const NAV_ICONS = {
  "/": CalendarDays,
  "/roster": Users,
  "/plan": Target,
  "/trade": ArrowLeftRight,
  "/league": Trophy,
  "/recap": CalendarCheck,
  "/ledger": ScrollText,
  "/managers": Users,
  "/managers/compare": GitCompare,
  "/awards": Award,
  "/commissioner": ShieldCheck,
  "/trade/finder": Handshake,
  "/deals": Share2,
  "/drafts": GitBranch,
  "/drafts/grades": GraduationCap,
  "/values": BookText,
  "/rank": ListOrdered,
  // "/analyst": MessageSquareText stood here. The surface is shelved (SHELVED.md,
  // S7); `iconForSurface` falls back rather than throwing, so a stale entry would
  // never have been noticed by anything - which is exactly why it goes now.
  "/about": Info,
  "/methodology": FlaskConical,
  "/settings": Search,
  "/design": Palette,
  "/teams": Repeat,
  "/lab/pulse": Activity,
  "/lab/regret": CalendarRange,
  "/lab/counterfactual": GitBranch,
  "/lab/leverage": Scale,
  // Not FlaskConical: /methodology already wears that, and two surfaces sharing a
  // mark in the same list is how a reader learns to stop trusting the marks.
};
/** Falls back to a generic mark rather than throwing - a registry entry added
 *  without a matching icon should still render, just plainly. */
export function iconForSurface(href) {
  return NAV_ICONS[href] ?? Share2;
}
