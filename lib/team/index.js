/**
 * The Team tab's direction card, from the game plan's own diagnosis (lib/gameplan
 * `diagnose`) plus the standings. Pure: the page passes in what it already loaded.
 */
import { ordinal } from "../derive/describe.js";

const STANCE_LABEL = {
  contend: "Contend",
  ascend: "Ascend",
  rebuild: "Rebuild",
  retool: "Retool",
};

/**
 * @param {{ dx: object|null, analysis: object|null, form?: object|null }} input
 * @returns {null | { stance, label, headline, note, inputs: object[] }}
 */
export function directionSummary({ dx, analysis, form }) {
  if (!dx?.direction) return null;
  const inputs = [];
  if (form) {
    inputs.push({
      id: "record",
      label: "Record",
      value: `${form.wins}-${form.losses}`,
      sub: `${ordinal(form.rank)} of ${form.teams}${form.isLive ? "" : `, ${form.season} final`}`,
      wins: form.wins,
      losses: form.losses,
    });
  } else {
    inputs.push({ id: "record", label: "Record", value: "unknown", sub: "no games yet" });
  }
  if (dx.valueRank > 0 && dx.teams > 0) {
    inputs.push({
      id: "value",
      label: "Value rank",
      value: ordinal(dx.valueRank),
      sub: `of ${dx.teams} by asset value`,
      rank: dx.valueRank,
      of: dx.teams,
    });
  }
  inputs.push({
    id: "age",
    label: "Core age",
    value: analysis?.coreAge != null ? String(analysis.coreAge) : "unknown",
    sub: analysis?.coreAgeBand ?? "top 8 by value",
  });
  return {
    stance: dx.direction,
    label: STANCE_LABEL[dx.direction] ?? dx.direction,
    headline: dx.headline ?? null,
    note: dx.directionNote ?? null,
    inputs,
  };
}
