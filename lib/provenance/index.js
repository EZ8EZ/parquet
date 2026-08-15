/**
 * PROVENANCE - why this asset is on this roster, walked backwards.
 *
 * This replaces the trade tree, and the shape change is the whole point. Forward from
 * a departure the story BRANCHES: you gave up one player and got three things back,
 * each of which can be flipped for more things, and the result is a tree nobody can
 * hold in their head. Backwards from something you hold, every hop has EXACTLY ONE
 * predecessor - a thing arrived on your roster from precisely one place - so the
 * story is a chain. Measured over all 418 addressable assets in the real league (264
 * that have ever moved in a trade, plus every player on a roster today): 151 are at
 * their origin already, 154 are one hop from it, 73 are two, 20 are three, 12 are
 * four, and 8 are five. THE LONGEST CHAIN IN FIVE SEASONS OF THIS LEAGUE IS FIVE
 * HOPS. That is a list, not a tree, and the recursion the tree needed is gone with
 * it - along with its depth cap, its seen-set, and its "chain continues" truncation,
 * none of which have anything to answer for in one direction.
 *
 * The chain has four kinds of node and they are drawn on one time rail, oldest at
 * top:
 *
 *   ORIGIN      where the asset entered this lineage. Five sanctioned sentences and
 *               no sixth - see `ORIGIN_TEXT`. A never-traded player still has one,
 *               which is why there is deliberately no empty state anywhere in this
 *               feature.
 *   HOP         one trade. Carries the seats on both ends AND the principals who
 *               actually held those seats that season (D22), so a chain crossing a
 *               handover names the right person at each hop.
 *   RESOLUTION  the moment a pick became a player. This is the only place the chain
 *               changes species and it is the most interesting thing that happens in
 *               it, so it is a labelled event with its own node rather than a
 *               parenthetical on a pick's label.
 *   TODAY       who holds it now, or that it has left the league.
 *
 * EVERY NODE CARRIES A REAL TIMESTAMP, and that is what the rail draws. `AssetMove`
 * has had `created` since it was written and it was only ever used for sorting; the
 * y-axis is the thing that turns "unresolved for eighteen months" from arithmetic
 * into a fact you can see.
 *
 * Pure and provider-free on purpose. Everything the walk needs is passed in
 * (`ProvenanceContext`), so the derivation is testable against a hand-built corpus
 * and the expensive loaders (`buildDraftIndex`, `getPrincipals`) stay on the page
 * that needs them - see D25.
 */
import { ordinal } from "../derive/describe";
import { pickKey } from "../tradegraph";
/**
 * The five sentences a chain is allowed to end on, and there is no sixth.
 *
 * `pick-pending` is deliberately absent: an undrafted pick's terminal text is
 * `lib/lineage`'s own `REASON_TEXT`, passed in as `pendingPickText` and printed
 * verbatim, so /drafts and this rail can never describe the same unresolved pick in
 * two different ways.
 */
export const ORIGIN_TEXT = {
  "startup-draft": (a) => `Acquired in the ${a.season} startup draft.`,
  waiver: () => "Signed off waivers.",
  "free-agent": () => "Signed as a free agent.",
  "pre-record": () => "On this roster before the record begins.",
  "pick-original": (a) =>
    `${a.who}'s own ${a.season} ${ordinal(a.round ?? 1)} pick.`,
};
// ---------------------------------------------------------------- the walk
/**
 * Index every asset's hops by asset key.
 *
 * `buildAssetMoves` already sorts chronologically and this preserves that, so any
 * slice of the returned array is ascending without a second sort.
 */
export function indexMovesByAsset(moves) {
  const byAsset = new Map();
  for (const m of moves) {
    const list = byAsset.get(m.assetKey);
    if (list) list.push(m);
    else byAsset.set(m.assetKey, [m]);
  }
  return byAsset;
}
/** `k:<season>-<round>-<orig>` back into its three parts. Null for a player key. */
export function parsePickKey(key) {
  if (!key.startsWith("k:")) return null;
  const m = /^k:(\d{4})-(\d+)-(\d+)$/.exec(key);
  if (!m) return null;
  return { season: m[1], round: Number(m[2]), originalRoster: Number(m[3]) };
}
const DAY = 86_400_000;
/**
 * "How did this get here?" - the backwards walk.
 *
 * A `while` loop, and that is the headline. The tree this replaces was mutual
 * recursion over a branching structure with a depth cap, a seen-set and a
 * "chain continues" escape hatch, because forward the story fans out and there is
 * no natural end. Backwards there is exactly one predecessor at every step and
 * therefore no branching, no depth cap, and no truncation: the loop simply runs out
 * of predecessors and the origin is whatever it ran out at.
 *
 * `guard` is not a depth cap. It is a cycle brake for corrupt data - a chain that
 * somehow claimed to precede itself would otherwise hang the render - and it is set
 * far above the longest chain this league has ever produced (five hops).
 */
export function buildProvenance(
  ctx,
  assetKey,
  /** Internal. Stops the spent-pick redirect below from bouncing back and forth. */
  noRedirect = false,
) {
  const byAsset = indexMovesByAsset(ctx.moves);
  const nameOf = (rid) => ctx.names[rid] ?? `Roster ${rid}`;
  const askedFor = assetKey;
  const isPick = assetKey.startsWith("k:");
  if (isPick) {
    if (!parsePickKey(assetKey)) return null;
  } else if (!assetKey.startsWith("p:") || assetKey.length <= 2) {
    return null;
  }
  /**
   * A spent pick has TWO addresses, and only sometimes are they the same chain.
   *
   * Usually they are: the player is still where the pick delivered him, so the
   * player's own walk runs back through the draft and picks up every hop the pick
   * ever made. Asking for `k:2025-1-11` and being told "not drafted yet" when it
   * became Cooper Flagg at 1.01 was simply false, and live verification caught it.
   *
   * But NOT always, and the over-eager version of this redirect was the second thing
   * live verification caught: if the player was later dropped and picked up off
   * waivers, his chain correctly and honestly stops at that signing - so redirecting
   * the PICK's question there would answer it by deleting the pick's entire history.
   * So the redirect only stands when the player's walk actually arrives back at this
   * pick, and otherwise the pick keeps its own chain and says what it was spent on.
   */
  const became = !noRedirect && isPick ? ctx.playerOfPick[assetKey] : undefined;
  if (became) {
    const viaPlayer = buildProvenance(ctx, `p:${became}`, true);
    const reaches = viaPlayer?.events.some(
      (e) => e.node === "resolution" && e.pickKey === askedFor,
    );
    if (viaPlayer && reaches) return { ...viaPlayer, requestedKey: askedFor };
  }
  // ---- where the chain ENDS (today), which is where the walk STARTS ----
  const today = terminusOf(ctx, byAsset, assetKey, nameOf);
  // The walk needs a seat and a time to ask "how did THIS seat come to hold it just
  // before THEN". Today's holder and now, to begin with.
  let seat = today.rosterId;
  let before = Number.MAX_SAFE_INTEGER;
  let key = assetKey;
  let label = labelOf(ctx, byAsset, key);
  let kind = isPick ? "pick" : "player";
  const topKind = kind;
  const events = [];
  let origin = null;
  let crossesDraft = false;
  let guard = 0;
  /**
   * The principal who held `seat` at the moment the walk last stepped through it.
   *
   * Not the same thing as `names[seat]`, and live verification caught the difference:
   * `k:2025-1-11` is roster 11's own 2025 first, roster 11 changed hands between 2024
   * and 2025, and the pick was traded away in January 2024 - so naming its original
   * owner from the CURRENT holder credited the successor with an asset the departed
   * manager had already sold. `AssetMove.fromOwnerId` is resolved at the hop's own
   * season by `buildAssetMoves`, so carrying it down the walk is the fix (D22).
   */
  let seatOwnerName = null;
  while (guard++ < 64) {
    const hops = byAsset.get(key) ?? [];
    // The most recent trade that PUT this asset on this seat. `seat` can be null for
    // an asset nobody holds any more (a dropped player), in which case the last hop
    // on record is still the right predecessor to explain.
    let hop =
      seat == null
        ? [...hops].reverse().find((m) => m.created < before)
        : [...hops].reverse().find((m) => m.to === seat && m.created < before);
    /**
     * A PICK's two records are allowed to disagree, and where they do, the recorded
     * hops win over silence.
     *
     * The made pick's own `rosterId` is ground truth for who used it, but
     * commissioner-executed trades carry no picks at all (D19), so the traded-pick
     * trail can stop one hop short of whoever actually walked to the podium. When
     * that happens the seat-matched search above finds nothing and the pick's entire
     * history would vanish from the chain - measured on the real league, this was 20
     * picks, one of them losing all five of its hops. Falling back to the last
     * recorded hop keeps them. Deliberately NOT applied to players: their current
     * holder comes from the live roster, which does not have this gap, and guessing
     * there would attach a trade that did not deliver them.
     */
    if (!hop && seat != null && kind === "pick") {
      hop = [...hops].reverse().find((m) => m.created < before);
    }
    // A non-trade acquisition can be MORE RECENT than the last trade into this seat -
    // a player traded to you in 2023, dropped, and re-signed off waivers in 2025 did
    // not get here by that trade. Whichever event is later is the true predecessor.
    const signing =
      kind === "player" ? latestSigning(ctx, key.slice(2), seat, before) : null;
    const drafted = kind === "player" ? ctx.draftedFrom[key.slice(2)] : null;
    const draftedHere =
      drafted &&
      (seat == null || drafted.usedByRoster === seat) &&
      (drafted.at ?? ctx.recordStart) < before
        ? drafted
        : null;
    const hopAt = hop?.created ?? -1;
    const signAt = signing?.at ?? -1;
    const draftAt = draftedHere ? (draftedHere.at ?? ctx.recordStart) : -1;
    if (hopAt >= signAt && hopAt >= draftAt && hop) {
      const node = hopOf(ctx, hop, nameOf);
      events.push(node);
      seat = hop.from;
      seatOwnerName = node.fromName;
      before = hop.created;
      // key/kind/label are unchanged - the same asset, one seat earlier.
      continue;
    }
    if (draftAt >= signAt && draftedHere) {
      // THE SPECIES CHANGE. Everything above this node in the rail is about a pick;
      // everything below it is about a person.
      const pk = pickKey(
        draftedHere.season,
        draftedHere.round,
        draftedHere.originalRoster,
      );
      events.push({
        node: "resolution",
        at: draftAt,
        dated: draftedHere.at != null,
        pickKey: pk,
        pickLabel: `${draftedHere.season} ${ordinal(draftedHere.round)}`,
        season: draftedHere.season,
        round: draftedHere.round,
        pickNo: draftedHere.pickNo,
        usedByRoster: draftedHere.usedByRoster,
        usedByName:
          draftedHere.usedByRoster != null
            ? nameOf(draftedHere.usedByRoster)
            : null,
        playerId: key.slice(2),
        playerName: ctx.playerNames[key.slice(2)] ?? label,
      });
      crossesDraft = true;
      if (draftedHere.isStartup) {
        // A league holds exactly one startup ever and its slots are not tradeable
        // pick identities, so the chain ends here rather than pretending there is a
        // pick above it to walk (D27).
        origin = {
          node: "origin",
          reason: "startup-draft",
          at: draftAt,
          dated: draftedHere.at != null,
          text: ORIGIN_TEXT["startup-draft"]({
            season: draftedHere.season,
            round: draftedHere.round,
            who:
              draftedHere.usedByRoster != null
                ? nameOf(draftedHere.usedByRoster)
                : "",
          }),
          rosterId: draftedHere.usedByRoster,
        };
        break;
      }
      key = pk;
      kind = "pick";
      label = `${draftedHere.season} ${ordinal(draftedHere.round)}`;
      seat = draftedHere.usedByRoster;
      seatOwnerName = null;
      // NOT `draftAt`. A draft's `startTime` is when it was SCHEDULED, and picks get
      // traded on draft day - measured on the real league, several picks carry a
      // recorded hop stamped after their own draft's start time. Bounding the pick's
      // walk by that stamp silently dropped those hops. A pick cannot move after it
      // has been used, so every recorded hop of it genuinely precedes the selection
      // and none of them needs an upper bound; `orderInTime` below then puts the
      // draft node after any hop that outruns it.
      before = Number.MAX_SAFE_INTEGER;
      continue;
    }
    if (signing) {
      origin = {
        node: "origin",
        reason: signing.type === "waiver" ? "waiver" : "free-agent",
        at: signing.at,
        dated: true,
        text: ORIGIN_TEXT[signing.type === "waiver" ? "waiver" : "free-agent"]({
          season: "",
          round: null,
          who: nameOf(signing.rosterId),
        }),
        rosterId: signing.rosterId,
      };
      break;
    }
    // Nothing else precedes it. A pick that has run out of hops was its original
    // roster's own; a player that has run out of everything predates the record.
    const pk = parsePickKey(key);
    if (pk) {
      origin = {
        node: "origin",
        reason: "pick-original",
        at: ctx.recordStart,
        dated: false,
        text: ORIGIN_TEXT["pick-original"]({
          season: pk.season,
          round: pk.round,
          // Whoever held the seat when the chain actually starts, not whoever holds
          // it tonight - see `seatOwnerName`.
          who: seatOwnerName ?? nameOf(pk.originalRoster),
        }),
        rosterId: pk.originalRoster,
      };
    } else {
      origin = {
        node: "origin",
        reason: "pre-record",
        at: ctx.recordStart,
        dated: false,
        text: ORIGIN_TEXT["pre-record"]({ season: "", round: null, who: "" }),
        rosterId: seat,
      };
    }
    break;
  }
  if (!origin) {
    // Only reachable if the cycle brake tripped, which real data cannot do. Say so
    // rather than rendering a chain with no beginning.
    origin = {
      node: "origin",
      reason: "pre-record",
      at: ctx.recordStart,
      dated: false,
      text: ORIGIN_TEXT["pre-record"]({ season: "", round: null, who: "" }),
      rosterId: seat,
    };
  }
  events.push(origin);
  events.reverse();
  orderInTime(events);
  const hopCount = events.filter((e) => e.node === "hop").length;
  return {
    assetKey,
    requestedKey: askedFor,
    label: labelOf(ctx, byAsset, assetKey),
    kind: topKind,
    events,
    today,
    hops: hopCount,
    crossesDraft,
    spanDays: Math.max(0, Math.round((today.at - origin.at) / DAY)),
  };
}
/**
 * The rail's y-axis is time, so the events have to be non-decreasing in it.
 *
 * Two of the app's own timestamps can disagree by a few hours in one specific place:
 * a draft's `startTime` is when it was SCHEDULED, and picks get traded on draft day,
 * so a recorded pick hop can carry a stamp later than the draft it precedes. The
 * causal order is not in doubt - a pick cannot move after being used - so what gets
 * adjusted is the DRAFT node, raised to sit after the last hop, and it stops claiming
 * an exact moment (`dated: false`, which the rail draws as an open dot) rather than
 * quietly asserting one. Nothing else is touched, and a recorded trade timestamp is
 * never moved.
 */
function orderInTime(events) {
  let floor = Number.NEGATIVE_INFINITY;
  for (const e of events) {
    if (e.at < floor) {
      e.at = floor;
      e.dated = false;
    } else {
      floor = e.at;
    }
  }
}
/** The most recent waiver/FA add of a player onto `seat` strictly before `before`. */
function latestSigning(ctx, playerId, seat, before) {
  const all = ctx.signings[playerId];
  if (!all) return null;
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i];
    if (s.at >= before) continue;
    if (seat != null && s.rosterId !== seat) continue;
    return s;
  }
  return null;
}
function hopOf(ctx, m, nameOf) {
  // A principal's own name from the hop's own season beats the seat's current label,
  // which would otherwise print the successor's name for a departed manager's deal.
  const who = (ownerId, seatId) =>
    (ownerId && ctx.ownerNames[ownerId]) || nameOf(seatId);
  return {
    node: "hop",
    at: m.created,
    dated: true,
    tradeId: m.tradeId,
    season: m.season,
    week: m.week,
    assetKey: m.assetKey,
    assetLabel: m.label,
    assetKind: m.kind,
    from: m.from,
    to: m.to,
    fromOwnerId: m.fromOwnerId,
    toOwnerId: m.toOwnerId,
    fromName: who(m.fromOwnerId, m.from),
    toName: who(m.toOwnerId, m.to),
    // Undefined for a hand-built test context that predates this field; the rail
    // treats that exactly like 2 (no note), which is the correct fallback since every
    // trade this app has ever recorded involves at least two parties.
    parties: m.parties,
  };
}
/** Where the chain is now. */
function terminusOf(ctx, byAsset, assetKey, nameOf) {
  const now = Date.now();
  const pk = parsePickKey(assetKey);
  if (pk) {
    const hops = byAsset.get(assetKey) ?? [];
    const holder = hops.length ? hops[hops.length - 1].to : pk.originalRoster;
    // Only reached when the pick was NOT spent, or was spent on a player whose own
    // line has since moved on from it - see the redirect in `buildProvenance`. Either
    // way the pick's story ends here and the player's continues elsewhere.
    const spentOn = ctx.playerOfPick[assetKey];
    if (spentOn) {
      const name = ctx.playerNames[spentOn] ?? "a player";
      return {
        node: "today",
        at: now,
        dated: true,
        rosterId: holder,
        name: nameOf(holder),
        pending: false,
        text: `Used on ${name}, whose own line has moved on from this pick.`,
      };
    }
    return {
      node: "today",
      at: now,
      dated: true,
      rosterId: holder,
      name: nameOf(holder),
      pending: true,
      text: `${nameOf(holder)} holds it. ${ctx.pendingPickText}`,
    };
  }
  const pid = assetKey.slice(2);
  const held = ctx.holdings[pid];
  if (held == null) {
    return {
      node: "today",
      at: now,
      dated: true,
      rosterId: null,
      name: null,
      pending: false,
      text: "No longer on a roster in this league.",
    };
  }
  return {
    node: "today",
    at: now,
    dated: true,
    rosterId: held,
    name: nameOf(held),
    pending: false,
    text: `On ${nameOf(held)} today.`,
  };
}
function labelOf(ctx, byAsset, assetKey) {
  const pk = parsePickKey(assetKey);
  if (pk) return `${pk.season} ${ordinal(pk.round)}`;
  const pid = assetKey.slice(2);
  return (
    ctx.playerNames[pid] ?? byAsset.get(assetKey)?.[0]?.label ?? `Player ${pid}`
  );
}
