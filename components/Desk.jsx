"use client";
/**
 * THE BOTTOM CHROME, bottom-up:
 *
 *   tab bar     58px  This Week, Team, Trade, League, and the Menu button
 *   status bar  40px  this week's scorebug (lib/desk.js): links to Home during a lock-in
 *                     week, to the standings otherwise
 *
 * The Menu opens a panel above the status bar: search, then the utility pages
 * (lib/nav.js `utilitySurfaces`). Collapsed, `<nav aria-label="Primary">` wraps the
 * chrome and the panel is `hidden` + `inert`. Open, the chrome is a modal dialog:
 * focus is trapped, Escape closes, the page behind is `inert`, and focus returns
 * to the Menu button.
 */
import { Fragment, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, ExternalLink, KeyRound, Menu, UserRound, X } from "lucide-react";
import { startOverAction } from "@/lib/auth/startOver";
import { primarySurfaces, tabOf, utilitySurfaces } from "@/lib/nav";
import { cn } from "@/lib/ui";
import { iconForSurface } from "./nav-icons";
import { TeamAvatar } from "./TeamAvatar";
import { SearchPanel } from "./SearchPanel";
import { Countdown } from "./lockin/TonightClock";

export const APP_CONTENT_ID = "app-content";
const DESK_SEARCH_PARAM = "find";

function TabItem({ href, label, Icon, active, current, onClick, button, buttonRef, expanded, controls, badge = null }) {
  const cls = cn(
    "flex min-w-0 flex-col items-center justify-center gap-1 transition-colors",
    active ? "text-ink" : "text-secondary hover:text-ink",
  );
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
          active && "bg-accent-wash text-accent-text",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
        {badge ? <span className="absolute -top-1.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 figure text-micro font-bold leading-none text-accent-ink">{badge}</span> : null}
      </span>
      <span className="max-w-full whitespace-nowrap text-micro font-semibold">
        {label}
        {badge ? <span className="sr-only">, {badge} {badge === 1 ? "call" : "calls"} open</span> : null}
      </span>
    </>
  );
  if (button) {
    return (
      <button ref={buttonRef} type="button" aria-expanded={expanded} aria-controls={controls} onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href} aria-current={current} className={cls}>
      {body}
    </Link>
  );
}

/**
 * The This Week tab while a what-if (?assume=) is set on This Week's own pages: the link
 * keeps it (so leaving /lockin for Home does not drop it) and the badge hides, since its
 * count comes from the board without assumptions. Inside Suspense (useSearchParams).
 */
function WeekTabItem({ pathname, ...props }) {
  const search = useSearchParams();
  const assume = search?.get("assume");
  const onWeek = pathname === "/" || pathname === "/lockin";
  if (!assume || !onWeek) return <TabItem {...props} />;
  return <TabItem {...props} href={`/?assume=${assume}`} badge={null} />;
}


export function Desk({ data }) {
  const focus = !!data?.focus;
  const pathname = usePathname() ?? "/";
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
  const menuRef = useRef(null);
  const drawerId = useId();

  const close = useCallback(() => {
    setExpanded(false);
    menuRef.current?.focus();
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

  const activeTab = tabOf(pathname);
  const menuActive = expanded || activeTab === "utility";

  return (
    <>
      {(expanded || closing) && (
        <div
          aria-hidden="true"
          onClick={expanded ? close : undefined}
          data-closing={closing ? "" : undefined}
          className={cn("desk-scrim fixed inset-0 z-40 bg-black/60", closing && "pointer-events-none")}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50">
        <div
          ref={sheetRef}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded ? true : undefined}
          aria-label={expanded ? "Menu" : undefined}
          className="mx-auto w-full max-w-2xl"
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
                "desk-drawer mx-2 mb-2 rounded-sheet bg-surface-2 shadow-[var(--shadow-pop)] outline-none",
                (expanded || closing) && "flex flex-col",
              )}
            >
              <div className="flex items-center justify-between px-4 pt-3">
                <h2 className="text-lede font-semibold text-ink">Menu</h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close the menu"
                  className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="max-h-[calc(100dvh-var(--header-h)-var(--statusbar-h)-var(--tabbar-h)-5rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] overflow-y-auto overscroll-contain px-3 pb-3">
                <Suspense fallback={null}>
                  <SearchPanel basePath={pathname} param={DESK_SEARCH_PARAM} />
                </Suspense>
                <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card bg-surface">
                  {utilitySurfaces().map((s) => {
                    const Icon = iconForSurface(s.href);
                    const active = pathname === s.href;
                    return (
                      <li key={s.href}>
                        <Link
                          href={s.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-14 items-center gap-3 px-3.5 py-2 transition-colors hover:bg-surface-2",
                            active && "bg-accent-wash",
                          )}
                        >
                          <Icon
                            size={18}
                            aria-hidden="true"
                            className={cn("shrink-0", active ? "text-accent-text" : "text-secondary")}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-semibold text-ink">{s.label}</span>
                            <span className="block text-meta text-secondary">{s.sub}</span>
                          </span>
                          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    );
                  })}
                  {data?.focusOn && !focus && (
                    <li>
                      <form action={startOverAction}>
                        <button
                          type="submit"
                          className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <UserRound size={18} aria-hidden="true" className="shrink-0 text-secondary" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-semibold text-ink">See it as a new visitor</span>
                            <span className="block text-meta text-secondary">Signs this browser out: team picker first, password needed again</span>
                          </span>
                        </button>
                      </form>
                    </li>
                  )}
                  {data?.seat?.sleeperHref && (
                    <li>
                      <a
                        href={data.seat.sleeperHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-14 items-center gap-3 px-3.5 py-2 text-body font-semibold text-ink transition-colors hover:bg-surface-2"
                      >
                        <ExternalLink size={18} aria-hidden="true" className="shrink-0 text-secondary" />
                        Open my team in Sleeper
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--color-border)]">
              {/* The scorebug never truncates: lib/desk.js keeps it short enough to fit. */}
              <div className="desk-statusbar flex h-[var(--statusbar-h)] items-center gap-2 border-b border-border px-4">
                {data?.seat ? (
                  <Link
                    href={data.bug.href}
                    aria-label={data.bug.label}
                    className="flex min-w-0 flex-1 items-center gap-2 self-stretch whitespace-nowrap figure text-meta font-semibold text-ink transition-colors hover:text-accent-text"
                  >
                    <TeamAvatar
                      name={data.seat.label}
                      avatarId={data.seat.avatarId}
                      teamLogoUrl={data.seat.teamLogoUrl}
                      size="xs"
                      className="size-5 shrink-0 rounded-full"
                    />
                    <span className="min-w-0 flex-1">
                      {data.bug.parts.map((part, i) => (
                        <Fragment key={i}>
                          {i > 0 && (
                            <span aria-hidden="true" className="mx-1.5 text-faint">
                              ·
                            </span>
                          )}
                          <span className={i === 0 && !data.bug.next ? "text-secondary" : undefined}>{part}</span>
                        </Fragment>
                      ))}
                    </span>
                    {data.bug.next?.text && (
                      <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                        {/* under 380px the countdown pill carries the next move alone (the full time is in the label) */}
                        <span className={data.bug.next.urgent ? "text-warn" : "text-secondary max-[380px]:hidden"}>{data.bug.next.text}</span>
                        {data.bug.next.at && <Countdown at={data.bug.next.at} pill compact />}
                      </span>
                    )}
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
                  </Link>
                ) : data ? (
                  <Link
                    href="/teams"
                    className="flex min-w-0 flex-1 items-center justify-between gap-1 self-stretch text-meta font-semibold text-accent-text transition-colors hover:text-ink"
                  >
                    <span className="text-secondary">No team picked yet</span>
                    <span className="inline-flex items-center gap-1">
                      Pick your team
                      <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                    </span>
                  </Link>
                ) : (
                  <span className="flex-1 text-meta text-secondary">Parquet</span>
                )}
              </div>

              {/* focus mode (lib/auth/focus.js): the lock page, and one locked door to the rest */}
              {focus && <div className="grid h-[var(--tabbar-h)] grid-cols-2">
                <TabItem href="/lockin" label="Lock or hold" Icon={iconForSurface("/lockin")} active={pathname.startsWith("/lockin")} current={pathname === "/lockin" ? "page" : undefined} badge={data?.bug?.toDecide > 0 ? data.bug.toDecide : null} />
                <TabItem href="/unlock?next=%2F" label="More" Icon={KeyRound} active={pathname === "/unlock"} current={pathname === "/unlock" ? "page" : undefined} badge={null} />
              </div>}
              {!focus && <div className="grid h-[var(--tabbar-h)] grid-cols-5">
                {primarySurfaces().map((s) => {
                  const active = activeTab === s.tab;
                  const props = {
                    href: s.href,
                    label: s.short,
                    Icon: iconForSurface(s.href),
                    active,
                    current: pathname === s.href ? "page" : active ? "true" : undefined,
                    badge: s.tab === "week" && data?.bug?.toDecide > 0 ? data.bug.toDecide : null,
                  };
                  return s.tab === "week" ? (
                    <Suspense key={s.href} fallback={<TabItem {...props} />}>
                      <WeekTabItem pathname={pathname} {...props} />
                    </Suspense>
                  ) : (
                    <TabItem key={s.href} {...props} />
                  );
                })}
                <TabItem
                    button
                    buttonRef={menuRef}
                    label={expanded ? "Close" : "Menu"}
                    Icon={expanded ? X : Menu}
                    active={menuActive}
                    expanded={expanded}
                    controls={drawerId}
                    onClick={() => setExpanded(!expanded)}
                  />
              </div>}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
