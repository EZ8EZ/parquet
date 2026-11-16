"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * The methodology index: every section one tap away, grouped by topic. Once the
 * index scrolls out of view, a slim bar pins under the app header with the four
 * topics and a way back up, and marks the topic being read (aria-current plus a
 * filled pill, so position is never colour alone).
 *
 * Plain anchor links, so it works before hydration and with JavaScript off; the
 * script only shows the pinned bar and tracks the current topic. Under
 * prefers-reduced-motion the browser's own smooth scrolling is not requested.
 */
export function SectionIndex({ groups }) {
  const indexRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  const [current, setCurrent] = useState(groups[0]?.label);

  useEffect(() => {
    const el = indexRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const topicOf = new Map();
    for (const g of groups) for (const it of g.items) topicOf.set(it.id, g.label);
    const els = [...topicOf.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    const visible = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = els.find((x) => visible.get(x.id));
        if (first) setCurrent(topicOf.get(first.id));
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [groups]);

  return (
    <>
      <nav ref={indexRef} id="index" aria-label="Sections" className="grid scroll-mt-20 grid-cols-3 gap-1.5 rounded-card bg-surface p-2">
        {/* One grid, in topic order, so all twelve fit in four rows of three and the
            first section's figure still lands above the fold. The topic of each group
            is read by the pinned bar and spoken here via the list's label. */}
        {groups.map((g) => (
          <ul key={g.label} aria-label={g.label} className="contents">
            {g.items.map((it) => (
              <li key={it.id}>
                <a
                  href={`#${it.id}`}
                  className="flex min-h-11 items-center justify-center rounded-full bg-surface-2 px-2 text-center text-note font-semibold text-ink transition-colors hover:bg-elevated"
                >
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <nav
        aria-label="Topics"
        hidden={!pinned}
        className="fixed inset-x-0 top-[calc(var(--header-h)+env(safe-area-inset-top))] z-20 mx-auto max-w-2xl bg-bg px-4 pb-2 sm:px-6"
      >
        <ul className="flex items-center gap-1 rounded-full bg-surface p-1">
          {groups.map((g) => {
            const on = g.label === current;
            return (
              <li key={g.label} className="min-w-0 flex-1">
                <a
                  href={`#${g.items[0].id}`}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-full px-2 text-note font-semibold transition-colors",
                    on ? "bg-elevated text-ink" : "text-secondary hover:text-ink",
                  )}
                >
                  {g.label}
                </a>
              </li>
            );
          })}
          <li className="shrink-0">
            <a
              href="#index"
              aria-label="All sections"
              className="flex size-11 items-center justify-center rounded-full text-secondary transition-colors hover:text-ink"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </nav>
    </>
  );
}
