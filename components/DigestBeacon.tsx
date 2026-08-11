"use client";

import { useEffect, useRef } from "react";
import type { MetricRow } from "@/lib/digest";

/**
 * WHAT IS LEFT OF "SINCE YOUR LAST VISIT" — the marker, without the panel.
 *
 * The digest panel was shelved on 2026-08-10 (SHELVED.md, S2): it burned its own
 * baseline on the first page view, so its steady state for a weekly visitor was a
 * labelled empty box on the front page explaining why it was empty.
 *
 * This is deliberately NOT the panel with its rendering commented out. It renders
 * nothing at all — it exists only to keep advancing the last-seen marker, which is
 * the one thing the panel did that nothing else can do (a cookie can only be written
 * from a route handler, so it has to be posted from the client).
 *
 * Keeping it matters for two reasons, both concrete:
 *  1. `homeNext()` still reads "did anything move since the last visit" to decide
 *     whether Home's onward rail should point at /deals. Freeze the marker and that
 *     fact rots into "yes, always" for every returning reader.
 *  2. The revival condition in SHELVED.md is a better BASELINE, not a rebuild. A
 *     marker that has kept advancing is the difference between switching the panel
 *     back on and starting it from nothing.
 *
 * The POST still fires after paint and is still fire-and-forget: a failed write means
 * the next visit diffs against an older marker, which is a wider net, not a wrong one.
 */
export function DigestBeacon({ metrics }: { metrics: MetricRow[] }) {
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    void fetch("/api/digest-seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metrics }),
    }).catch(() => {});
  }, [metrics]);

  return null;
}
