"use client";
import { useEffect, useState } from "react";
import { whenText } from "@/lib/lockin/matchupView";

/**
 * "Sat 7:30 PM EST" in the viewer's own time zone. The server renders Eastern
 * (`fallback`); after hydration it switches to local time with the zone, the same as
 * the Tonight section's deadlines.
 */
export function LocalWhen({ at, fallback, prefix = "", className }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const local = whenText(at, undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local zone is only known in the browser
    if (local) setText(local);
  }, [at]);
  if (!text) return null;
  return (
    <span className={className}>
      {prefix}
      {text}
    </span>
  );
}
