"use client";
import { useEffect } from "react";

/** Opens a player's chart detail when a slot links to it (#lk-<id>). */
export function HashOpener() {
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.slice(1);
      if (id === "lockin-method") {
        const m = document.getElementById(id);
        if (m) m.open = true;
        return;
      }
      if (!id.startsWith("lk-")) return;
      const d = document.getElementById(id)?.querySelector("details[data-player-detail]");
      if (d) d.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
