/**
 * The window-refusal code, split out of ./window.js so a CLIENT component can read it.
 *
 * components/WindowMap.jsx renders inside the client LeagueBoard. Importing this one
 * pure function from ./window.js dragged window -> valuation -> roster -> metrics/skill
 * -> providers -> Zod schemas into the /league browser bundle (~340 KB). Keep this file
 * free of imports beyond plain data.
 */
/**
 * The code a refused state carries when the row itself was not built here.
 *
 * `windowOf` always attaches a full `refusal`, so this is only reached by a row
 * hand-assembled by a caller or a test. It exists so that no surface can print a
 * refused window with no code at all - the failure mode lib/refusal.js's header is
 * about. `unreadable` maps to the count refusal rather than `NO_RECORD` because a row
 * without its own refusal cannot say which of the two it was, and claiming an empty
 * record when the record might merely be thin would be the more confident claim (D19).
 */
const CODE_BY_STATE = { split: "SPLIT_ROSTER", unreadable: "INSUFFICIENT_SAMPLE" };
/** A refused window's code, whoever built the row. Null for a readable one. */
export function windowRefusalCode(w) {
  if (w.state === "window") return null;
  return w.refusal?.code ?? CODE_BY_STATE[w.state] ?? "NO_RECORD";
}
