/**
 * Whether a band is worth FLAGGING as a problem.
 *
 * The band alone cannot answer this and never could (D23). "Brittle" on a team playing
 * for this season is a live threat: the roster is spending its season on a handful of
 * names and cannot absorb the night one of them is out. The identical band on a team
 * that has already sold is just a description of a teardown, and colouring it as an
 * alarm tells the reader to fix something they chose on purpose. Same number, different
 * meaning, and only the posture knows which.
 *
 * Straddling counts as not-alarming here for a narrow reason: a straddling roster's
 * problem is already named by TCI, and stacking a second red flag on it would report
 * one problem twice rather than two problems once.
 */
export function fragilityIsAlarming(band, posture) {
  if (band !== "brittle") return false;
  return posture === "contending" || posture === "ascending";
}
/**
 * Tag tone for a band, conditioned on posture. Brittle earns the negative tone only
 * where it is actually a threat; otherwise it renders neutral and the word does the
 * work.
 *
 * `resilient` deliberately never returns a positive tone. Low fragility is not the same
 * as good - the most torn-down roster in this league scores low precisely because it has
 * nothing left to lose - and a green chip is the shortest possible way of saying
 * otherwise.
 */
export function fragilityTone(band, posture) {
  return fragilityIsAlarming(band, posture) ? "negative" : "neutral";
}
