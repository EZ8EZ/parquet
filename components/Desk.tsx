"use client";

/**
 * THE DESK - the app's bottom chrome, replacing the six-tab bar.
 *
 * Three things stacked at the bottom of every page, bottom-up:
 *
 *   the menu button  53pt  ONE full-bleed, worded control that opens everything
 *   context row      44pt  what you are looking at, and what is outstanding
 *   handle           19pt  the grip that opens the drawer above all of it
 *
 * 116pt plus `env(safe-area-inset-bottom)`, so ~150pt at rest on a device with a home
 * indicator - unchanged arithmetic, because the root layout's bottom padding is sized
 * to it and belongs to another owner this round.
 *
 * ROUND 8b DELETED THE DESTINATION ROW. Four fixed links were still a bar of tabs, and
 * the brief was to find out whether the app can live on summoned menus alone. What
 * replaced them is the widest, most literal affordance a phone screen can hold: a
 * full-bleed button that says the word "Menu" and, under it, what is behind it. A bar
 * teaches by being permanently visible; this teaches the same way, in words instead of
 * six-point icon captions, and it spends one row instead of one row per destination.
 *
 * THE COST IS ONE TAP, AND IT IS PAID BACK IN TWO PLACES. Reaching /roster from an
 * arbitrary page is 2 taps now where it was 1. So: (a) the four former slots are the
 * FIRST thing in the drawer and are PINNED to its bottom edge, a thumb's width above
 * the button that just opened them - the second tap is the shortest travel on screen,
 * not a hunt through a list; and (b) Home is a real hub again (app/page.tsx), so the
 * page every session starts on lists every surface itself.
 *
 * WHAT MOVES WHEN IT OPENS: nothing you can reach. The drawer is the FIRST child of
 * the sheet, above the handle, so it grows upward into the page and the three rows
 * below stay bolted to the bottom of the screen. The mockup this was built from had
 * it the other way round - drawer last, so opening pushed the four destinations up
 * the screen and out from under your thumb, which is the one thing a fixed bar is
 * uniquely good at not doing. Muscle memory is the entire budget of a bottom bar, and
 * an element that moves 500pt when you touch a grip next to it has spent it.
 *
 * TWO ACCESSIBILITY STATES, NOT THREE:
 *
 *   collapsed  non-modal. `<nav aria-label="Primary">` wraps the whole resting sheet -
 *              the seat chip, the status line and the menu button are ALL navigation,
 *              and that landmark is the assertion every route in e2e/ makes (see
 *              e2e/helpers.ts). It used to wrap only the four tabs; with the tabs gone
 *              it wraps what is actually there, and stays visible on every route. The
 *              drawer inside it is `hidden` + `inert` when closed, so it is not in the
 *              tab order, not in the accessibility tree, and not findable by
 *              browser find-in-page.
 *   expanded   `role="dialog" aria-modal="true"`, focus trapped inside the sheet,
 *              Escape closes, and the page behind is `inert`.
 *
 * Drag is an ACCELERATOR, never the contract. The handle is a real `<button>` with
 * `aria-expanded`/`aria-controls`, the menu button below it is the same action at
 * full width and in words, and every destination in the drawer is also on /more and
 * on Home - both of which stay real pages for exactly that reason (no-JS, crawlers,
 * and "see everything"). The former chevron-only toggle in the context row is gone:
 * with a control that says "Menu" two rows down, a bare glyph was a third way to do
 * one thing. Nothing in this component is reachable by drag alone. Intermediate detents are deliberately
 * NOT implemented: a third position would be a state with no name to announce and no
 * keyboard equivalent, so it would be a pointer-only nicety pretending to be part of
 * the interface.
 *
 * NEVER AUTO-HIDES ON SCROLL. Chrome that disappears when you move is chrome you
 * cannot aim at, and hiding on scroll is how every inventive navigation eventually
 * dies. It is always exactly where it was.
 */
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  LayoutGrid,
  Repeat,
  Settings,
} from "lucide-react";
import { groupedSurfaces, primarySurfaces } from "@/lib/nav";
import type { DeskData } from "@/lib/desk";
import { cn } from "@/lib/ui";
import { iconForSurface } from "./nav-icons";
import { TeamAvatar } from "./TeamAvatar";
import { SearchPanel } from "./SearchPanel";

/** The id of the page content the expanded drawer makes `inert`. */
export const APP_CONTENT_ID = "app-content";

/**
 * The Desk's own search box takes its own query-string key rather than `q`.
 *
 * `/values` already uses `q` for its name filter (lib/values/url.ts). A box that
 * lives on every page has to assume the page underneath it already owns the obvious
 * names, so it takes one nothing else uses; `/more`'s own box keeps `q`, because
 * there the box IS the page.
 */
const DESK_SEARCH_PARAM = "find";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Desk({ data }: { data: DeskData | null }) {
  const pathname = usePathname() ?? "/";
  /*
   * Both open states are stored as THE PATH THEY WERE OPENED ON rather than as a
   * boolean, which is what makes "navigating from inside the drawer closes it" a
   * derivation instead of an effect. A boolean would need a `useEffect` on `pathname`
   * whose whole body was `setExpanded(false)` - the cascading-render anti-pattern this
   * repo's lint rule rejects, and rightly: the drawer is not open independently of a
   * page, it is open ON one. Leaving it open over the page it just navigated to would
   * also mean the sheet is still modal and still covering the answer.
   */
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [seatMenuOn, setSeatMenuOn] = useState<string | null>(null);
  const expanded = openOn === pathname;
  const seatMenu = seatMenuOn === pathname;
  const setExpanded = useCallback(
    (next: boolean) => setOpenOn(next ? pathname : null),
    [pathname],
  );
  const sheetRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const seatMenuId = useId();

  const close = useCallback(() => {
    setOpenOn(null);
    // Focus returns to the control that opened the drawer, not to the top of the
    // document - the standard dialog contract, and the reason the handle is the one
    // element that stays put in both states.
    handleRef.current?.focus();
  }, []);

  // The background half of the modal contract. Set imperatively because the element
  // it applies to is rendered by the server layout, which cannot hold this state.
  useEffect(() => {
    const content = document.getElementById(APP_CONTENT_ID);
    if (!content) return;
    content.inert = expanded;
    return () => {
      content.inert = false;
    };
  }, [expanded]);

  // Escape, and the focus trap. Both are scoped to the expanded state: collapsed, the
  // Desk is ordinary page chrome and must not intercept a single key.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const items = Array.from(focusable).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, close]);

  // Opening moves focus into the drawer rather than into the search field: an
  // autofocused input raises the software keyboard, which would cover most of the
  // sheet the reader just asked to see. One Tab away, by choice rather than by force.
  useEffect(() => {
    if (expanded) drawerRef.current?.focus();
  }, [expanded]);

  // The seat popover is not modal - it is three links off a chip - so it gets the
  // light version of the same contract: Escape, and a click anywhere else.
  useEffect(() => {
    if (!seatMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSeatMenuOn(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Node;
      if (!sheetRef.current?.contains(el)) setSeatMenuOn(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [seatMenu]);

  // ---------------------------------------------------------------- drag
  // A flick up opens, a flick down closes, and a tap does whatever a tap does. The
  // pointer never gets to do anything the button cannot, so this is pure speed.
  const dragRef = useRef<{ y: number; moved: boolean } | null>(null);
  /*
   * A pointer gesture that ends on this button still fires a `click` afterwards, and
   * that click would toggle the state the drag just set - so a flick up opened the
   * drawer and the trailing click closed it again, which looked exactly like the drag
   * not being wired up at all. The suppression flag has to be SEPARATE from `dragRef`,
   * because `dragRef` is cleared on pointerup and is therefore already null by the
   * time the click arrives to be checked against it. Found by driving the real
   * gesture rather than by reading the handler; a synthesized click never reproduces
   * it.
   */
  const suppressClickRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Capture, or the gesture dies the instant the pointer leaves a 19pt-tall button -
    // which is immediately, since the whole point of the gesture is to move away from
    // it. Without this the move and up events land on whatever is under the cursor and
    // the drag silently does nothing.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientY - d.y) > 24) d.moved = true;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return; // a tap - let the click handler own it
    suppressClickRef.current = true;
    const up = e.clientY < d.y;
    setExpanded(up);
    if (!up) handleRef.current?.focus();
  };
  const onHandleClick = () => {
    // The drag already decided; consume its trailing click and leave the state alone.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setExpanded(!expanded);
  };

  const destinations = primarySurfaces();

  return (
    <>
      {/* Visible, but not reachable: the page stays legible behind an open drawer
          (that is most of the point of a sheet over a full-screen menu) while this
          absorbs the tap that dismisses it. */}
      {expanded && (
        <div
          aria-hidden="true"
          onClick={close}
          className="desk-scrim fixed inset-0 z-40 bg-bg/60"
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50">
        <div
          ref={sheetRef}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded ? true : undefined}
          aria-label={expanded ? "Everything in Parquet" : undefined}
          className="mx-auto w-full max-w-2xl rounded-t-[--radius-lg] border-t border-border bg-bg/[0.93] backdrop-blur-lg"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
        {/* `aria-label="Primary"` is load-bearing well beyond this file: every
            registry-driven smoke test asserts it (e2e/helpers.ts) as the one piece of
            chrome that proves a route rendered at all. It wraps the whole sheet now
            rather than a row of tabs, because the whole sheet is the navigation. */}
        <nav aria-label="Primary">
          {/* ------------------------------------------------------- the drawer
              A scrolling half and a pinned half. The pinned half is at the BOTTOM,
              against the button that opened it, and holds the four destinations that
              used to be a permanent row - which is what keeps "get to my roster" a
              two-tap move with almost no travel between the taps rather than a
              two-tap move plus a scan. */}
          <div
            id={drawerId}
            ref={drawerRef}
            tabIndex={-1}
            hidden={!expanded}
            inert={!expanded}
            // The display utility is applied ONLY when open. Tailwind's preflight
            // hides `[hidden]` with a plain `display: none` rule, and a `flex`
            // utility in the same class list wins on order - so a permanent `flex`
            // here would render the whole drawer on every page, closed or not.
            className={cn("desk-drawer outline-none", expanded && "flex flex-col")}
          >
          <div className="max-h-[min(26rem,calc(100dvh-16rem))] overflow-y-auto overscroll-contain px-3.5 pt-3">
            <Suspense fallback={null}>
              <SearchPanel basePath={pathname} param={DESK_SEARCH_PARAM} />
            </Suspense>

            {/*
              Every group EXCEPT Primary. Those four are the pinned block below, a
              thumb's width from the button - printing them twice in one panel would be
              the drawer advertising the same destination in two places. /more remains
              the index that lists literally everything, and it is the last link here.
            */}
            {groupedSurfaces()
              .filter((g) => g.group !== "Primary")
              .map(({ group, items }) => (
                <div key={group} className="mt-3 first:mt-2">
                  <h2 className="mb-1.5 px-0.5 text-micro font-semibold uppercase tracking-[0.16em] text-faint">
                    {group}
                  </h2>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items
                      // The "see everything" link at the bottom of the drawer is this
                      // same page; two of it in one panel is one too many.
                      .filter((s) => s.href !== "/more")
                      .map((s) => {
                        const Icon = iconForSurface(s.href);
                        const active = isActive(pathname, s.href);
                        return (
                          <Link
                            key={s.href}
                            href={s.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-start gap-2 rounded-[--radius-sm] border bg-surface px-2 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2",
                              active ? "border-accent-edge" : "border-border",
                            )}
                          >
                            <Icon
                              size={15}
                              aria-hidden="true"
                              className={cn(
                                "mt-[3px] shrink-0",
                                active ? "text-accent-text" : "text-faint",
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-note font-semibold leading-tight text-ink">
                                {s.label}
                              </span>
                              <span className="mt-px block truncate text-micro leading-snug text-faint">
                                {s.sub}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                  </div>
                </div>
              ))}

            <Link
              href="/more"
              className="mb-2 mt-3 flex min-h-11 items-center justify-center gap-1 rounded-[--radius-sm] border border-dashed border-border text-note font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
            >
              See everything on one page
              <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {/* ------------------------------------------- the pinned destinations
              The four former tabs, rendered from the SAME registry flag that used to
              draw the row (`primary`), never a list of this component's own. Pinned
              rather than scrolled: these are the four moves a reader makes most, so
              they must never be somewhere you have to scroll to, and they must sit
              where the thumb already is. */}
          <div className="shrink-0 border-t border-border px-3.5 pb-2 pt-2">
            <h2 className="mb-1.5 px-0.5 text-micro font-semibold uppercase tracking-[0.16em] text-faint">
              Go to
            </h2>
            <div className="grid grid-cols-4 gap-1.5">
              {destinations.map((s) => {
                const Icon = iconForSurface(s.href);
                const active = isActive(pathname, s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-[--radius-sm] border px-1 text-center transition-colors",
                      active
                        ? "border-accent-edge bg-accent-wash text-accent-text"
                        : "border-border bg-surface text-muted hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="text-micro font-semibold leading-none">
                      {s.short ?? s.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          </div>

          {/* ------------------------------------------------------- the handle
              19pt, and the one control in here that is under the 44pt minimum - which
              is why `min-h-0` has to override the global rule in globals.css rather
              than the rule being wrong. It is full-bleed wide, it sits ~97pt above
              `env(safe-area-inset-bottom)` so it never competes with the iOS home
              indicator's swipe, and the worded button two rows below is the same
              action at full size for anyone who wants it. Its name says "drag handle"
              so that it and the menu button are never two identically-named controls
              in one list to a screen reader. */}
          <button
            ref={handleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={drawerId}
            aria-label={expanded ? "Drag handle: close the menu" : "Drag handle: open the menu"}
            onClick={onHandleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (dragRef.current = null)}
            className="desk-handle flex w-full items-center justify-center touch-none"
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-1 w-9 rounded-full transition-colors",
                expanded ? "bg-accent" : "bg-border-strong",
              )}
            />
          </button>

          {/* --------------------------------------------------- the context row */}
          <div className="relative flex h-[44px] items-center gap-2 px-3.5">
            {data ? (
              <>
                <button
                  type="button"
                  aria-expanded={seatMenu}
                  aria-controls={seatMenuId}
                  onClick={() => setSeatMenuOn(seatMenu ? null : pathname)}
                  className={cn(
                    "flex min-h-0 shrink-0 items-center gap-1.5 rounded-full border bg-surface py-1 pl-1 pr-2.5 transition-colors",
                    seatMenu ? "border-accent" : "border-border hover:border-border-strong",
                  )}
                >
                  <TeamAvatar
                    name={data.seat.label}
                    avatarId={data.seat.avatarId}
                    teamLogoUrl={data.seat.teamLogoUrl}
                    size="xs"
                    className="rounded-full"
                  />
                  <span className="max-w-[8.5rem] truncate text-note font-semibold text-ink">
                    {data.seat.label}
                  </span>
                  <ChevronUp
                    size={12}
                    aria-hidden="true"
                    className={cn("shrink-0 text-faint", seatMenu && "rotate-180")}
                  />
                </button>

                <Link
                  href={data.status.href}
                  // `self-stretch` rather than a bare inline link: the row is 44pt and
                  // so is the target, instead of a 17pt strip of text floating in the
                  // middle of it.
                  className="flex min-w-0 flex-1 items-center justify-end gap-1 self-stretch truncate text-meta text-muted transition-colors hover:text-ink"
                >
                  <span className="truncate">
                    <b
                      className={cn(
                        "font-semibold figure",
                        data.status.tone === "todo" ? "text-accent-text" : "text-ink",
                      )}
                    >
                      {data.status.lead}
                    </b>{" "}
                    {data.status.rest}
                  </span>
                  <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
                </Link>
              </>
            ) : (
              // The corpus could not be read (lib/desk.ts returns null and says so in
              // the server log). Navigation is registry-driven and does not depend on
              // it, so the Desk keeps working with this row simply quiet.
              <span className="flex-1 truncate text-meta text-faint">Parquet</span>
            )}

            {seatMenu && data && (
              <div
                id={seatMenuId}
                className="absolute bottom-[calc(100%+6px)] left-3 z-10 w-56 overflow-hidden rounded-[--radius-sm] border border-border-strong bg-elevated shadow-lg"
              >
                <SeatAction href="/teams" icon={<Repeat size={14} aria-hidden="true" />}>
                  Switch team
                </SeatAction>
                {/* The outbound handoff. Parquet advises and cannot act, so every
                    screen that says something about your team should be one tap from
                    the app that can do something about it. Null against the fixture
                    provider, whose league ids are not Sleeper ids - see
                    lib/sleeperLinks.ts, where that is made structurally impossible to
                    get wrong rather than guarded per call site. */}
                {data.seat.sleeperHref && (
                  <SeatAction
                    href={data.seat.sleeperHref}
                    external
                    icon={<ExternalLink size={14} aria-hidden="true" />}
                  >
                    Open my team in Sleeper
                  </SeatAction>
                )}
                <SeatAction href="/settings" icon={<Settings size={14} aria-hidden="true" />}>
                  Settings
                </SeatAction>
              </div>
            )}
          </div>

          {/* ------------------------------------------------- the menu button
              What replaced four tabs. The whole width of the phone, 53pt tall (the
              destination row's exact height, because the root layout's bottom padding
              is arithmetic against this sheet and belongs to another owner this
              round), and it says what it is in a word rather than asking a reader to
              infer it from a glyph. This is the ONE thing standing between a
              first-time leaguemate and the rest of the app, so it is the most
              literal, largest, most permanently visible control in the product.

              `leading-none` on both lines is load-bearing arithmetic, not taste:
              preflight's `line-height: 1.5` on <html> is an ABSOLUTE 24px that a
              13px or 11px label inherits unchanged, which would overflow 53pt. */}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={drawerId}
            aria-label={expanded ? "Close the menu" : "Menu"}
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "flex h-[53px] w-full items-center justify-center gap-2 border-t px-3.5 transition-colors",
              expanded
                ? "border-accent-edge bg-accent-wash text-accent-text"
                : "border-border text-ink hover:bg-surface-2",
            )}
          >
            {expanded ? (
              <ChevronDown size={18} aria-hidden="true" className="shrink-0" />
            ) : (
              <LayoutGrid size={18} aria-hidden="true" className="shrink-0 text-accent-text" />
            )}
            <span className="min-w-0">
              <span className="block text-body font-semibold leading-none">
                {expanded ? "Close" : "Menu"}
              </span>
              <span
                className={cn(
                  "mt-1 block truncate text-micro leading-none",
                  expanded ? "text-accent-text" : "text-faint",
                )}
              >
                {expanded ? "Back to the page" : "Every page in Parquet, and search"}
              </span>
            </span>
            {!expanded && (
              <ChevronUp size={16} aria-hidden="true" className="shrink-0 text-faint" />
            )}
          </button>
        </nav>
        </div>
      </div>
    </>
  );
}

function SeatAction({
  href,
  external,
  icon,
  children,
}: {
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const className =
    "flex min-h-11 items-center gap-2.5 border-b border-border px-3 text-note font-medium text-ink transition-colors last:border-b-0 hover:bg-surface-2";
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <span className="shrink-0 text-faint">{icon}</span>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      <span className="shrink-0 text-faint">{icon}</span>
      {children}
    </Link>
  );
}
