import { expect, test } from "@playwright/test";
import { expectNoConsoleErrors, expectStableChrome, primeLens, watchConsole } from "./helpers";

/**
 * CORE FLOW - the app's defining loop, both halves anchored on the same seeded
 * transaction: `fx-2022-rebuildA`, EZ8's 2022 sell of Damian Lillard to roster 8
 * for Scottie Barnes + a future first (lib/providers/fixture/generate.ts). The
 * fixture seeds exactly one Decision Ledger annotation, and it is on this trade
 * (lib/history.ts's `FIXTURE_SEED_ANNOTATIONS`, authored by "u1" - EZ8's own
 * seat, which is also the default "viewing as" identity with no cookie set).
 *
 *   1. Home -> Decision ledger -> open the annotate affordance on that trade and
 *      see the fixture's seeded reasoning ("Full rebuild...") already captured.
 *   2. Commissioner tools' transaction audit log links that SAME trade into the
 *      trade web (`tradeWebHref`, lib/tradegraph/url.ts) instead of re-showing
 *      it inline (lib/commissioner.ts's header explains why: the audit log is
 *      deliberately not a second ledger). BRAINSTORM.md's round-3 integration
 *      review calls exactly this - an audit-log link resolving a bare
 *      transaction id to the correct pair's strand on a totally different page,
 *      through a totally different derivation (the trade graph) than the one
 *      that rendered the row - "the riskiest cross-feature path this round
 *      verified end to end." This test automates that path.
 *
 * FIDELITY NOTE: round 3's manual verification used a real, commissioner-executed
 * three-team deal that Sleeper had recorded as several separate `commissioner`
 * transactions and `coalesceCommissionerTrades` (lib/derive/coalesce.ts) had to
 * stitch back into one synthetic trade (`/web?trade=coalesced-...+...`), against
 * live league data. The fixture provider's `recordTrade` only ever builds
 * ordinary two-team trades - there is no multi-transaction, commissioner-executed
 * deal in fixture data for the coalescer to reconstruct, so no `coalesced-` id
 * exists to link to offline. This test exercises the identical mechanism (an
 * audit-log row's href resolving to the right pair's strand, with the specific
 * deal tagged "this deal") on the two-team trade the fixture actually has. It is
 * not a substitute for re-checking the coalesced, multi-team case by hand against
 * real data after any change to `edgeKeyForTrade` or `coalesceCommissionerTrades`.
 */
test("ledger annotate affordance, then the audit-log deep link into the trade web", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);

  // ---- Half one: Home -> Decision ledger -> the annotate affordance ----
  await page.goto("/");
  await expectStableChrome(page);

  // "Decision ledger" (lib/nav.ts's label) appears as literal text in exactly one
  // place on Home: the curated "Go deeper" shortcut - see app/page.tsx's
  // `curatedSurfaces().map(...)`. Other links into /ledger on this page (the
  // "decisions to capture" badge, the "Trades made" figure, the activity tape)
  // use different copy, so this stays a single, unambiguous match.
  await page.getByRole("link", { name: /Decision ledger/i }).click();
  await expect(page).toHaveURL(/\/ledger$/);
  await expectStableChrome(page);

  // The seeded reasoning is fixture DATA (lib/history.ts), not UI copy that
  // shifts under a copy pass - safe to assert on directly.
  await expect(page.getByText(/Full rebuild\./)).toBeVisible();

  // Exactly one annotation exists in fresh fixture state, so exactly one "edit"
  // affordance exists on first load (components/LedgerItem.tsx). Every OTHER
  // (unannotated) entry on this page renders its textarea open by default
  // (LedgerItem defaults `editing` to true when there is no existing
  // annotation), so there are already many textareas on screen before this
  // click - `.last()` below is what picks out the one this click just opened,
  // not a generic "the only textbox" assumption.
  await page.getByRole("button", { name: "edit" }).click();

  // `.last()`, not "the only one": app/ledger/page.tsx renders "To capture"
  // before "Captured", and the fixture seeds exactly one captured entry, so
  // once this entry is in edit mode its textarea is the last one in DOM order.
  const reasoningBox = page.getByRole("textbox").last();
  await expect(reasoningBox).toBeVisible();
  await expect(reasoningBox).toHaveValue(/Full rebuild\./);

  // Every OTHER (unannotated) entry on the page also renders a full posture-pill
  // row with its own "rebuild" button (components/LedgerItem.tsx's POSTURES list
  // is the same five options everywhere), so this scopes to the specific panel
  // that just opened - the textarea's own parent, which also holds its posture
  // row - rather than asserting on "the" rebuild button page-wide.
  const editPanel = reasoningBox.locator("xpath=..");
  await expect(editPanel.getByRole("button", { name: "rebuild" })).toBeVisible();

  // ---- Half two: Commissioner audit log -> the SAME deal, via the trade web ----
  await page.goto("/commissioner");
  await expectStableChrome(page);

  // tradeWebHref("fx-2022-rebuildA") (lib/tradegraph/url.ts) - the audit row's
  // own href, not a hand-built URL, so this fails if the row ever stops linking
  // through that function.
  const auditLink = page.locator('a[href="/web?trade=fx-2022-rebuildA"]');
  await expect(auditLink).toBeVisible();
  await auditLink.click();

  await expect(page).toHaveURL(/\/web\?trade=fx-2022-rebuildA$/);
  await expectStableChrome(page);

  // Resolved to the right strand and tagged the right record - the exact two
  // things round 3 checked by hand. "this deal" (components/TradeWeb.tsx) is
  // rendered ONLY on the one trade in a pair's list whose id matches the URL's
  // `?trade=`, so its mere presence already proves the whole chain worked:
  // edgeKeyForTrade found this transaction's pair, and the pair panel is
  // showing that specific deal as linked - not just "a" deal for that pair, and
  // not the "no strand for this deal" fallback that would mean the link never
  // resolved to a pair at all. (Manager names aren't asserted here on purpose:
  // "Parquet Kings" and "The Process" also appear in the ring's own node labels
  // and the manager list elsewhere on this same page, so pinning them would
  // need scoping into TradeWeb's internal DOM structure - "this deal" is
  // already the more specific and more meaningful signal.)
  await expect(page.getByText("this deal")).toBeVisible();
  await expect(page.getByText(/no strand for/i)).toHaveCount(0);

  expectNoConsoleErrors(guard);
});
