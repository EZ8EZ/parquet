/**
 * A player's line while his game is on, and a projection of his final score from it.
 * Per-player logs update live (study section 2); a live row carries points so far and
 * seconds played so far. The projection is points so far plus a per-minute rate times
 * the minutes he can be expected to have left; its error is measured, not assumed
 * (INGAME_RECORD), and the UI should show the facts first.
 */
import { scoreGame } from "../lab/regret/index.js";
import { isPlayed } from "./model.js";

// priorMinutes Infinity = pre-game per-minute rate only; it beat blending toward tonight's
// rate at Q1 and the half and tied at Q3 (INGAME_RECORD).
export const INGAME = Object.freeze({
  usualWindow: 10,
  priorMinutes: Infinity,
  z80: 1.2816,
});

// scratchpad lockin-sequence/ingame_measure.mjs, 2026-11-16, n=2,740 games. RMSE in core points;
// with the clock = exact quarter end; without = usual minutes minus minutes so far.
export const INGAME_RECORD = Object.freeze({
  unit: "core points (0.5*pts + reb + ast); per-quarter splits exist only for those stats",
  source: "2026 games of league-rostered players with >=10 prior games, rebuilt from per-quarter splits",
  n: 2740,
  pregameOnlyRmse: 5.54,
  marks: [
    { mark: "end of Q1", rmse: 4.81, bias: 0.62, band80Coverage: 0.827, rmseNoClock: 4.99, band80CoverageNoClock: 0.807 },
    { mark: "half", rmse: 3.88, bias: 0.54, band80Coverage: 0.838, rmseNoClock: 4.47, band80CoverageNoClock: 0.759 },
    { mark: "end of Q3", rmse: 2.88, bias: 0.53, band80Coverage: 0.829, rmseNoClock: 3.74, band80CoverageNoClock: 0.671 },
  ],
});

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** Average minutes over his last 10 played games before asOf. */
export function usualMinutes(log, asOf, n = INGAME.usualWindow) {
  const played = log.filter((g) => isPlayed(g) && g.date < asOf).slice(-n);
  if (!played.length) return { minutes: null, n: 0 };
  return { minutes: played.reduce((s, g) => s + g.min, 0) / played.length, n: played.length };
}

/**
 * Share of regulation left from the schedule's per-quarter scoring while a game is on:
 * the last listed period is the one in progress, assumed half played. Null when unknown.
 * Coarse by construction (the schedule has no clock); OT counts as nothing left.
 */
export function gameFractionLeft(scheduleGame) {
  if (!scheduleGame) return null;
  if (scheduleGame.status === "complete") return 0;
  if (scheduleGame.status !== "in_game") return null;
  const periods = scheduleGame.periods ?? null;
  if (!periods) return null;
  if (periods > 4) return 0;
  return Math.max(0, (4 - (periods - 0.5)) / 4);
}

/** Facts of a live or final row under league scoring. */
export function partialLine(rawStats, scoring) {
  const st = rawStats || {};
  const sp = typeof st.sp === "number" ? st.sp : 0;
  return { fpSoFar: scoreGame(st, scoring), secondsSoFar: sp, minutesSoFar: r1(sp / 60) };
}

/**
 * Final-score projection from a partial line.
 * Remaining minutes: usual minutes x share of the game left when that share is known,
 * otherwise usual minutes minus minutes so far. Rate: pre-game per-minute rate blended
 * with tonight's, the pre-game side weighted as `priorMinutes` minutes (Infinity: pre-game only).
 * Band: pre-game SD scaled by sqrt(remaining / usual minutes), +-1.28 SD (nominal 80%).
 */
export function projectFinal({ fpSoFar, secondsSoFar, gameFractionLeft: fLeft = null, pregameMean, pregameSd, usualMinutes: U, priorMinutes = INGAME.priorMinutes }) {
  if (!(U > 0) || pregameMean == null) return null;
  const minSoFar = secondsSoFar / 60;
  const remaining = fLeft != null ? U * fLeft : Math.max(0, U - minSoFar);
  const priorRate = pregameMean / U;
  let rate;
  if (!Number.isFinite(priorMinutes)) rate = priorRate;
  else if (priorMinutes + minSoFar === 0) rate = priorRate;
  else rate = (priorRate * priorMinutes + fpSoFar) / (priorMinutes + minSoFar);
  const mean = fpSoFar + rate * remaining;
  const sd = (pregameSd ?? 0) * Math.sqrt(Math.min(1, remaining / U));
  return { mean, p10: mean - INGAME.z80 * sd, p90: mean + INGAME.z80 * sd, remainingMinutes: remaining, rate, sd };
}
