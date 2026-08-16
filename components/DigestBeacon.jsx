"use client";
import { useEffect, useRef } from "react";
/**
 * WHAT IS LEFT OF "SINCE YOUR LAST VISIT" — the marker, without the panel.
 *
 * The digest panel was shelved on 2026-08-10 (SHELVED.md, S2): it burned its own
 * baseline on the first page view, so its steady state for a weekly visitor was a
 * labelled empty box on the front page explaining why it was empty.
 *
 * This is deliberately NOT the panel with its rendering commented out. It renders
 * nothing at all — it exists only to post the current snapshot so the route handler
 * can decide whether to advance the last-seen marker (a cookie can only be written
 * from a route handler, so the post has to come from the client either way).
 *
 * It still fires on every mount, unconditionally - the FLOOR now lives server-side, in
 * `shouldAdvanceMarker` (lib/digest), not here. `/api/digest-seen` only actually moves
 * the marker once `DIGEST_ADVANCE_FLOOR_MS` has elapsed since the last one it wrote;
 * inside that window it is a no-op that leaves the existing cookie untouched. That is
 * the fix SHELVED.md's S2 named as the condition for reviving the panel: the baseline
 * stops burning itself on every render, which is what `/lab/pulse` now depends on.
 *
 * `homeNext()` still reads "did anything move since the last visit" from the same
 * marker to decide whether Home's onward rail should point at /deals - unaffected by
 * the floor, since it only cares whether the diff is non-empty, not how often the
 * marker moves.
 *
 * The POST still fires after paint and is still fire-and-forget: a failed write means
 * the next visit diffs against an older marker, which is a wider net, not a wrong one.
 */
export function DigestBeacon({ metrics }) {
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
