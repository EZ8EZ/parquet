"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const FADE = 28;

/**
 * A horizontally scrolling pill rail (Segmented, and Tabs in its segmented style).
 *
 * The decision: when the options do not fit at 390px (four or five labels with
 * counts), the rail scrolls sideways rather than wrapping. A wrapped pill control
 * reads as two controls and breaks the one-track shape; a scroll keeps the shape,
 * and the cost (an option off-screen) is paid back with two things here:
 *   - an edge fade on whichever side has more, so the overflow is visible;
 *   - the active option scrolled into view on mount and on every change, so the
 *     current choice is never the hidden one.
 * When everything fits, items grow to fill the track exactly as the old grid did.
 *
 * Returns [ref for the scroller, style carrying the fade mask].
 */
export function useRail(activeKey) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  // Scroll only the rail (never the page) so the active option is in view.
  const reveal = useCallback((smooth) => {
    const el = ref.current;
    const item = el?.querySelector('[data-active="true"]');
    if (!el || !item || el.clientWidth === 0) return;
    const left = item.offsetLeft - FADE;
    const right = item.offsetLeft + item.offsetWidth + FADE - el.clientWidth;
    const target = el.scrollLeft > left ? left : el.scrollLeft < right ? right : null;
    if (target == null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: Math.max(0, target), behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // A rail that mounts hidden (inside an inactive tab panel) has no size until it is
    // shown, so the resize that reveals it is also when the active option is placed.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            reveal(false);
            measure();
          })
        : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure, reveal]);

  useEffect(() => {
    reveal(true);
  }, [activeKey, reveal]);

  const a = edges.start ? "transparent" : "black";
  const b = edges.end ? "transparent" : "black";
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${a} 0, black ${FADE}px, black calc(100% - ${FADE}px), ${b} 100%)`
      : undefined;
  return [ref, mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined];
}
