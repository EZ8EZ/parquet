/**
 * WHERE A DEPTH CHART LEAVES YOU.
 *
 * `/depth/[team]` is a leaf route, like `/lineage/[assetKey]` and
 * `/deals/[transactionId]` before it, so `ONWARD` in lib/nav.js cannot hold its steps:
 * that registry is keyed by literal href and a route with a parameter has no single
 * one. What it CAN hold is the same contract, and the contract is the part that
 * matters - the no-dead-ends rule (lib/nav.test.js: "gives EVERY registered surface at
 * least two ways out") exists because four surfaces once shipped with zero outbound
 * links, and a route being dynamic is not a reason to reopen that.
 *
 * So the steps live here, they are computed from what the page actually knows about
 * the player it is anchored on, and `onward.test.js` pins the same four properties the
 * registry's own suite pins: at least two ways out, no repeats, no self-link, a why in
 * the reader's voice with no em dash, and a label taken from the registry wherever the
 * destination is registered rather than retyped here.
 *
 * The steps are DELIBERATELY the app's own surfaces rather than more NBA data. A
 * reader on this page has just learned a fact about a player's real team; the useful
 * next questions are all fantasy questions - what he is worth here, how he got onto
 * this roster, who holds him - and answering them is the whole reason this feature
 * lives inside Parquet instead of being a link to Sleeper.
 */
import { ALL_SURFACES } from "../nav.js";
import { valuesFocusHref } from "../values/url.js";
import { playerLineageHref } from "../tradegraph/url.js";
/**
 * The registry's own name for a destination, so a rename there renames it here too.
 * Query strings are stripped before the lookup: `/values?focus=123` is the /values
 * surface, and hardcoding "Asset values" at this call site is exactly the label drift
 * the registry test forbids.
 * @param {string} href
 * @returns {string|null}
 */
function registryLabel(href) {
  const path = href.split("?")[0];
  return ALL_SURFACES.find((s) => s.href === path)?.label ?? null;
}
/**
 * @typedef {Object} DepthOnwardInput
 * @property {string|null} [playerId] the anchored player, when there is one
 * @property {number|null} [ownerRosterId] the roster holding him in THIS league, if any
 * @property {boolean} [ownedByViewer] true when that roster is the viewer's own
 */
/**
 * @param {DepthOnwardInput} input
 * @returns {{href: string, label: string, why: string}[]}
 */
export function depthOnwardSteps(input = {}) {
  const { playerId, ownerRosterId, ownedByViewer } = input;
  /** @type {{href: string, label: string, why: string}[]} */
  const steps = [];
  if (playerId) {
    steps.push({
      href: valuesFocusHref(playerId),
      label: registryLabel("/values") ?? "Asset values",
      why: "What is he worth in this league?",
    });
    steps.push({
      href: playerLineageHref(playerId),
      // Unregistered destination, so it carries its own label - the one case the
      // registry test allows one.
      label: "How this got here",
      why: "How did he end up on that roster?",
    });
  }
  if (ownerRosterId != null && !ownedByViewer) {
    steps.push({
      href: `/managers/${ownerRosterId}`,
      label: "Dossier",
      why: "Who is holding him here?",
    });
  }
  if (ownedByViewer) {
    steps.push({
      href: "/roster",
      label: registryLabel("/roster") ?? "Roster",
      why: "Back to the rest of your team",
    });
  }
  // The floor, and it applies hardest to the case with no anchor at all: a reader who
  // typed a team code into the address bar still gets two real ways out.
  if (steps.length < 2) {
    for (const fallback of [
      {
        href: "/values",
        label: registryLabel("/values") ?? "Asset values",
        why: "What is everyone worth?",
      },
      {
        href: "/roster",
        label: registryLabel("/roster") ?? "Roster",
        why: "Back to your own team",
      },
    ]) {
      if (!steps.some((s) => s.href.split("?")[0] === fallback.href)) {
        steps.push(fallback);
      }
    }
  }
  return steps.slice(0, 3);
}
