"use client";
/**
 * THE DESK - the app's bottom chrome, bottom-up:
 *
 *   tab row      53pt  This Week, Team, Trade, League, and the Menu button
 *   context row  44pt  your team and this week's scorebug
 *   handle       24pt  the grip that opens the menu above it
 *
 * The menu is small on purpose: search, then the utility pages (lib/nav.js
 * `utilitySurfaces`). Everything else lives under a tab, so the tab that owns the
 * current page stays lit (`tabOf`).
 *
 * Collapsed, `<nav aria-label="Primary">` wraps the sheet (the landmark every e2e
 * route asserts) and the drawer is `hidden` + `inert`. Expanded, the sheet is a modal
 * dialog: focus is trapped, Escape closes, and the page behind is `inert`. Drag is an
 * accelerator only; the handle and the Menu tab are real buttons.
 */
import { Fragment, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Menu } from "lucide-react";
import { primarySurfaces, tabOf, utilitySurfaces } from "@/lib/nav";
import { cn } from "@/lib/ui";
import { iconForSurface } from "./nav-icons";
import { TeamAvatar } from "./TeamAvatar";
import { SearchPanel } from "./SearchPanel";

export const APP_CONTENT_ID = "app-content";
const DESK_SEARCH_PARAM = "find";

export function Desk({ data }) {
  const pathname = usePathname() ?? "/";
  // Keyed to the pathname so a navigation from inside the menu closes it.
  const [openOn, setOpenOn] = useState(null);
  const [closingOn, setClosingOn] = useState(null);
  const closeTimer = useRef(null);
  const expanded = openOn === pathname;
  const closing = !expanded && closingOn === pathname;

  const setExpanded = useCallback(
    (next) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      if (next) {
        setClosingOn(null);
      } else {
        setClosingOn(pathname);
        closeTimer.current = setTimeout(() => setClosingOn(null), 180);
      }
      setOpenOn(next ? pathname : null);
    },
    [pathname],
  );
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const sheetRef = useRef(null);
  const drawerRef = useRef(null);
  const handleRef = useRef(null);
  const drawerId = useId();

  const close = useCallback(() => {
    setExpanded(false);
    handleRef.current?.focus();
  }, [setExpanded]);

  useEffect(() => {
    const content = document.getElementById(APP_CONTENT_ID);
    if (!content) return;
    content.inert = expanded;
    return () => {
      content.inert = false;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const items = Array.from(
        sheet.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
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

  useEffect(() => {
    if (expanded) drawerRef.current?.focus();
  }, [expanded]);

  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (d && Math.abs(e.clientY - d.y) > 24) d.moved = true;
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    suppressClickRef.current = true;
    const up = e.clientY < d.y;
    setExpanded(up);
    if (!up) handleRef.current?.focus();
  };
  const onHandleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setExpanded(!expanded);
  };

  const activeTab = tabOf(pathname);
  const menuActive = expanded || activeTab === "utility";

  return (
    <>
      {(expanded || closing) && (
        <div
          aria-hidden="true"
          onClick={expanded ? close : undefined}
          data-closing={closing ? "" : undefined}
          className={cn(
            "desk-scrim fixed inset-0 z-40 bg-bg/60",
            closing && "pointer-events-none",
          )}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50">
        <div
          ref={sheetRef}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded ? true : undefined}
          aria-label={expanded ? "Menu" : undefined}
          className="desk-sheet mx-auto w-full max-w-2xl rounded-t-[--radius-lg] border-t border-border"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <nav aria-label="Primary">
            <div
              id={drawerId}
              ref={drawerRef}
              tabIndex={-1}
              hidden={!expanded && !closing}
              inert={!expanded}
              data-closing={closing ? "" : undefined}
              className={cn(
                "desk-drawer outline-none",
                (expanded || closing) && "flex flex-col",
              )}
            >
              <div className="max-h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain px-3.5 pb-2 pt-3">
                <Suspense fallback={null}>
                  <SearchPanel basePath={pathname} param={DESK_SEARCH_PARAM} />
                </Suspense>
                <ul className="mt-2 space-y-1">
                  {utilitySurfaces().map((s) => {
                    const Icon = iconForSurface(s.href);
                    const active = pathname === s.href;
                    return (
                      <li key={s.href}>
                        <Link
                          href={s.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2",
                            active ? "border-accent-edge" : "border-border",
                          )}
                        >
                          <Icon
                            size={15}
                            aria-hidden="true"
                            className={cn("shrink-0", active ? "text-accent-text" : "text-faint")}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-note font-semibold leading-tight text-ink">
                              {s.label}
                            </span>
                            <span className="block text-micro leading-snug text-secondary">
                              {s.sub}
                            </span>
                          </span>
                          <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    );
                  })}
                  {data?.seat?.sleeperHref && (
                    <li>
                      <a
                        href={data.seat.sleeperHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5 text-note font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
                      >
                        <ExternalLink size={15} aria-hidden="true" className="shrink-0 text-faint" />
                        Open my team in Sleeper
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>

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

            {/* The scorebug never truncates: lib/desk.js keeps it short enough to fit. */}
            <div className="flex h-[44px] items-center gap-2 px-3.5">
              {data?.seat ? (
                <Link
                  href={data.bug.href}
                  aria-label={data.bug.label}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch whitespace-nowrap font-mono figure text-meta font-medium text-ink transition-colors hover:text-accent-text"
                >
                  <TeamAvatar
                    name={data.seat.label}
                    avatarId={data.seat.avatarId}
                    teamLogoUrl={data.seat.teamLogoUrl}
                    size="xs"
                    className="shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    {data.bug.parts.map((part, i) => (
                      <Fragment key={i}>
                        {i > 0 && (
                          <span aria-hidden="true" className="mx-1 text-faint">
                            ·
                          </span>
                        )}
                        {part}
                      </Fragment>
                    ))}
                  </span>
                  <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
                </Link>
              ) : data ? (
                <Link
                  href="/teams"
                  className="flex min-w-0 flex-1 items-center justify-between gap-1 self-stretch text-meta font-semibold text-accent-text transition-colors hover:text-ink"
                >
                  <span className="text-faint">No team picked yet</span>
                  <span className="inline-flex items-center gap-1">
                    Pick your team
                    <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
                  </span>
                </Link>
              ) : (
                <span className="flex-1 text-meta text-faint">Parquet</span>
              )}
            </div>

            <div className="grid h-[53px] grid-cols-5 border-t border-border">
              {primarySurfaces().map((s) => {
                const Icon = iconForSurface(s.href);
                const active = activeTab === s.tab;
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    aria-current={pathname === s.href ? "page" : active ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                      active ? "tab-glow text-accent-text" : "text-muted hover:text-ink",
                    )}
                  >
                    <Icon size={18} aria-hidden="true" className="shrink-0" />
                    <span className="max-w-full whitespace-nowrap text-micro font-semibold leading-none">
                      {s.short}
                    </span>
                  </Link>
                );
              })}
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={drawerId}
                onClick={() => setExpanded(!expanded)}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                  menuActive ? "tab-glow text-accent-text" : "text-muted hover:text-ink",
                )}
              >
                {expanded ? (
                  <ChevronDown size={18} aria-hidden="true" className="shrink-0" />
                ) : (
                  <Menu size={18} aria-hidden="true" className="shrink-0" />
                )}
                <span className="max-w-full text-micro font-semibold leading-none">
                  {expanded ? "Close" : "Menu"}
                </span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
