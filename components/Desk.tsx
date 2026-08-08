"use client";

/**
 * THE DESK - the app's bottom chrome, replacing the six-tab bar.
 *
 * Three things stacked at the bottom of every page, bottom-up:
 *
 *   destination row  53pt  four links, and only four
 *   context row      44pt  what you are looking at, and what is outstanding
 *   handle           19pt  the grip that opens the drawer above all of it
 *
 * 116pt plus `env(safe-area-inset-bottom)`, so ~150pt at rest on a device with a home
 * indicator. The old bar was ~94pt and spent all of it on six labels; this spends the
 * extra 56 on saying what you are looking at, which no bar of tabs can do.
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
 *   collapsed  non-modal. `<nav aria-label="Primary">` with the four links (the
 *              assertion every route in e2e/ makes - see e2e/helpers.ts), and the
 *              drawer is `hidden` + `inert`, so it is not in the tab order, not in
 *              the accessibility tree, and not findable by browser find-in-page.
 *   expanded   `role="dialog" aria-modal="true"`, focus trapped inside the sheet,
 *              Escape closes, and the page behind is `inert`.
 *
 * Drag is an ACCELERATOR, never the contract. The handle is a real `<button>` with
 * `aria-expanded`/`aria-controls`, there is a second full-size chevron control in the
 * context row, and every destination in the drawer is also on /more - which stays a
 * real page for exactly that reason (no-JS, crawlers, and "see everything"). Nothing
 * in this component is reachable by drag alone. Intermediate detents are deliberately
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
          {/* ------------------------------------------------------- the drawer */}
          <div
            id={drawerId}
            ref={drawerRef}
            tabIndex={-1}
            hidden={!expanded}
            inert={!expanded}
            className="desk-drawer max-h-[min(32rem,calc(100dvh-11rem))] overflow-y-auto overscroll-contain px-3.5 pb-2 pt-3 outline-none"
          >
            <Suspense fallback={null}>
              <SearchPanel basePath={pathname} param={DESK_SEARCH_PARAM} />
            </Suspense>

            {/*
              Every group EXCEPT Primary. Those four are not omitted, they are the row
              two inches below this one, permanently on screen - printing them again
              here would be the drawer advertising a destination the reader can already
              see and touch. /more remains the index that lists literally everything,
              and it is the last link in here.
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
                              "flex min-h-11 items-start gap-2 rounded-[--radius-sm] border bg-surface/60 px-2 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2",
                              active ? "border-accent/60" : "border-border",
                            )}
                          >
                            <Icon
                              size={15}
                              aria-hidden="true"
                              className={cn(
                                "mt-[3px] shrink-0",
                                active ? "text-accent" : "text-faint",
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
              className="mt-3 flex min-h-11 items-center justify-center gap-1 rounded-[--radius-sm] border border-dashed border-border text-note font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
            >
              See everything on one page
              <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {/* ------------------------------------------------------- the handle
              19pt, and the one control in here that is under the 44pt minimum - which
              is why `min-h-0` has to override the global rule in globals.css rather
              than the rule being wrong. It is full-bleed wide, it sits ~97pt above
              `env(safe-area-inset-bottom)` so it never competes with the iOS home
              indicator's swipe, and the chevron in the row below is the same action
              at full size for anyone who wants it. */}
          <button
            ref={handleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={drawerId}
            aria-label={expanded ? "Close the drawer" : "Open search and every surface"}
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
                        "font-semibold tnum",
                        data.status.tone === "todo" ? "text-accent" : "text-ink",
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

            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={drawerId}
              aria-label={expanded ? "Close the drawer" : "Open search and every surface"}
              onClick={() => setExpanded(!expanded)}
              className="-mr-1.5 flex h-11 w-9 shrink-0 items-center justify-center text-faint transition-colors hover:text-accent"
            >
              {expanded ? (
                <ChevronDown size={17} aria-hidden="true" />
              ) : (
                <ChevronUp size={17} aria-hidden="true" />
              )}
            </button>

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

          {/* ----------------------------------------------- the destination row
              `aria-label="Primary"` is load-bearing well beyond this file: every
              registry-driven smoke test asserts it (e2e/helpers.ts) as the one piece
              of chrome that proves a route rendered at all. */}
          <nav aria-label="Primary" className="flex border-t border-border">
            {destinations.map((s) => {
              const Icon = iconForSurface(s.href);
              const active = isActive(pathname, s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-[3px] py-[9px] text-meta font-medium tracking-wide transition-colors",
                    active ? "text-accent" : "text-faint hover:text-muted",
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
                  {/* `leading-none` is load-bearing arithmetic, not taste: preflight's
                      `line-height: 1.5` on <html> is an ABSOLUTE 24px that an 11px
                      label inherits unchanged, which would make this row 66pt instead
                      of 53. 21 (icon) + 3 (gap) + 11 (label) + 18 (padding) = 53. */}
                  <span className="leading-none">{s.short ?? s.label}</span>
                </Link>
              );
            })}
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
