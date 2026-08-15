/**
 * href -> icon for the surface registry (lib/nav.ts). Kept out of that file on
 * purpose: lib/ never imports lucide-react anywhere in this app, and a plain data
 * registry should stay importable without pulling a UI library along with it.
 */
import {
  Award,
  Beaker,
  BookText,
  CalendarCheck,
  Compass,
  FlaskConical,
  GitBranch,
  GitCompare,
  GraduationCap,
  Handshake,
  Home,
  Info,
  ListOrdered,
  MessageSquareText,
  ScrollText,
  Settings,
  Share2,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  ArrowLeftRight,
} from "lucide-react";
export const NAV_ICONS = {
  "/": Home,
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
  "/analyst": MessageSquareText,
  "/about": Info,
  "/methodology": FlaskConical,
  "/settings": Settings,
  "/more": Compass,
  // Not FlaskConical: /methodology already wears that, and two surfaces sharing a
  // mark in the same list is how a reader learns to stop trusting the marks.
  "/lab": Beaker,
};
/** Falls back to a generic mark rather than throwing - a registry entry added
 *  without a matching icon should still render, just plainly. */
export function iconForSurface(href) {
  return NAV_ICONS[href] ?? Share2;
}
