"use client";
// PARKED (SHELVED.md S13). Not imported anywhere. To revive: move back to
// components/lockin/, append chance.css to app/interaction.css, render under rows whose
// callRows(desk) entry has `chance: true`.
import { useEffect, useId, useRef, useState } from "react";
import { Dices, RotateCcw } from "lucide-react";
import { cn } from "@/lib/ui";

/** A fair coin: one random byte, even or odd (256 values, so exactly 50/50). */
export function fairSide() {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return b[0] % 2 === 0 ? "lock" : "hold";
}

const MS = 1500;

function Jumper({ side, tone }) {
  return (
    <svg aria-hidden="true" width="30" height="70" viewBox="0 0 30 70" className={cn("chance-jumper absolute bottom-1.5", side === "lock" ? "chance-jumper-l" : "chance-jumper-r")} style={{ [side === "lock" ? "right" : "left"]: "calc(50% + 6px)" }}>
      <circle cx="15" cy="9" r="7" fill={tone} />
      <rect x="8" y="18" width="14" height="28" rx="7" fill={tone} />
      <rect x="9.5" y="44" width="4.5" height="24" rx="2.25" fill={tone} opacity="0.8" />
      <rect x="16" y="44" width="4.5" height="24" rx="2.25" fill={tone} opacity="0.8" />
      <rect className="chance-arm" x={side === "lock" ? 19 : 6.5} y="20" width="4.5" height="20" rx="2.25" fill={tone} style={{ transformOrigin: `${side === "lock" ? 21 : 9}px 21px` }} />
    </svg>
  );
}

/**
 * "Too close to call? Leave it to chance": a jump ball between Lock and Hold. Offered
 * only on a genuinely close call (callRows' `chance`). The side is drawn first, from
 * crypto.getRandomValues, 50/50; the tip-off only reveals it (1.5 s, or at once under
 * reduced motion). The result is labelled as chance, announced politely, never changes
 * the model's lean or any number, and is not stored: a refresh clears it. Re-tips are
 * counted on screen so it stays obviously chance.
 */
export function ChanceTip({ name, className }) {
  const [state, setState] = useState({ side: null, tips: 0, playing: false });
  const [said, setSaid] = useState("");
  const timer = useRef(null);
  const id = useId();
  useEffect(() => () => clearTimeout(timer.current), []);

  const tip = () => {
    const side = fairSide();
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tips = state.tips + 1;
    const line = `The tip went to ${side === "lock" ? "Lock" : "Hold"}. Chance, not the model.`;
    clearTimeout(timer.current);
    setSaid("");
    if (reduced) {
      setState({ side, tips, playing: false });
      setSaid(line);
      return;
    }
    setState({ side, tips, playing: true });
    timer.current = setTimeout(() => {
      setState((s) => ({ ...s, playing: false }));
      setSaid(line);
    }, MS);
  };

  const { side, tips, playing } = state;
  const done = side && !playing;
  return (
    <div className={cn("px-3.5 pb-3", className)} data-chance={done ? side : playing ? "playing" : "idle"}>
      {tips === 0 ? (
        <button type="button" onClick={tip} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-note font-semibold text-ink transition-colors hover:bg-elevated">
          <Dices size={16} aria-hidden="true" className="shrink-0 text-secondary" />
          Too close to call? Leave it to chance
        </button>
      ) : (
        <div className="rounded-control bg-surface-2 p-2.5">
          <div
            aria-hidden="true"
            className={cn("chance-court relative h-[92px] overflow-hidden rounded-control", playing && `chance-play chance-to-${side}`, done && `chance-done chance-to-${side}`)}
            key={tips}
          >
            <span className="absolute inset-y-0 left-1/2 w-px bg-[#5a4a30]" />
            <span className="absolute left-1/2 top-[52px] size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#5a4a30]" />
            <span className={cn("chance-glow-lock absolute inset-y-0 left-0 right-1/2 bg-gradient-to-r from-accent/35 to-transparent opacity-0", done && side === "lock" && "opacity-100")} />
            <span className={cn("chance-glow-hold absolute inset-y-0 left-1/2 right-0 bg-gradient-to-l from-ink/20 to-transparent opacity-0", done && side === "hold" && "opacity-100")} />
            <span className={cn("absolute left-2 top-2 rounded-full bg-accent-wash px-2 text-micro font-extrabold leading-5 text-accent-text", done && side === "lock" && "ring-2 ring-accent-text ring-offset-2 ring-offset-surface-2")}>LOCK</span>
            <span className={cn("absolute right-2 top-2 rounded-full bg-elevated px-2 text-micro font-extrabold leading-5 text-ink", done && side === "hold" && "ring-2 ring-ink ring-offset-2 ring-offset-surface-2")}>HOLD</span>
            {/* equal weight at rest: neither side is coloured until the tip lands */}
            <Jumper side="lock" tone={done && side === "lock" ? "var(--color-accent)" : "#c3c9d3"} />
            <Jumper side="hold" tone={done && side === "hold" ? "var(--color-ink)" : "#c3c9d3"} />
            <span className="chance-ball absolute left-1/2 top-[44px] size-4 -translate-x-1/2 rounded-full" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-note text-ink">
              {done ? (
                <>
                  <span className="font-semibold">The tip went to {side === "lock" ? "Lock" : "Hold"}.</span> <span className="text-muted">Chance, not the model.</span>
                </>
              ) : (
                <span className="text-muted">Ball up…</span>
              )}
            </p>
            <button type="button" onClick={tip} disabled={playing} aria-describedby={`${id}-n`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-elevated px-3.5 text-note font-semibold text-ink transition-colors hover:bg-border-strong disabled:opacity-50">
              <RotateCcw size={15} aria-hidden="true" className="shrink-0" />
              Tip it again
            </button>
          </div>
          <p id={`${id}-n`} className="mt-1 text-micro text-secondary">
            Tipped {tips}× for {name} · nothing saved, no number changes
          </p>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
