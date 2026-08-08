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
 *      deal receipt (`dealHref`, lib/tradegraph/url.ts) instead of re-showing
 *      it inline (lib/commissioner.ts's header explains why: the audit log is
 *      deliberately not a second ledger). BRAINSTORM.md's round-3 integration
 *      review calls exactly this - an audit-log link resolving a bare
 *      transaction id to the right deal on a totally different page, through a
 *      totally different derivation than the one that rendered the row - "the
 *      riskiest cross-feature path this round verified end to end." This test
 *      automates that path. It got SHORTER when the ring was deleted: the id no
 *      longer has to be resolved to a pairing first, it is just the address.
 *
 * FIDELITY NOTE: round 3's manual verification used a real, commissioner-executed
 * three-team deal that Sleeper had recorded as several separate `commissioner`
 * transactions and `coalesceCommissionerTrades` (lib/derive/coalesce.ts) had to
 * stitch back into one synthetic trade, against live league data. The fixture
 * provider's `recordTrade` only ever builds ordinary two-team trades - there is no
 * multi-transaction, commissioner-executed deal in fixture data for the coalescer
 * to reconstruct, so no `coalesced-` id exists to link to offline. This test
 * exercises the identical mechanism on the two-team trade the fixture actually has.
 * It is not a substitute for re-checking the coalesced, multi-team case by hand
 * against real data - and note that a coalesced id now rides in a PATH segment
 * rather than a query string, so `dealHref`'s encoding of `+` is the part to
 * re-check (`lib/tradegraph/url.test.ts` pins it, live data confirms it).
 */
test("ledger annotate affordance, then the audit-log deep link into the deal receipt", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);

  // ---- Half one: Home -> Decision ledger -> the annotate affordance ----
  await page.goto("/");
  await expectStableChrome(page);

  // Through the Desk's own destination row, which is where the ledger now lives:
  // it is one of the four permanent slots (lib/nav.ts, `primary`), so it is no
  // longer a curated shortcut in Home's "Go deeper" grid and the old
  // `/Decision ledger/i` link text no longer exists on this page. Scoped to the
  // Primary navigation on purpose - "Record" is also the label of Home's
  // record figure, which links to /league, and this test means the slot.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Record", exact: true })
    .click();
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

  // ---- Half two: Commissioner audit log -> the SAME deal's own receipt ----
  await page.goto("/commissioner");
  await expectStableChrome(page);

  // dealHref("fx-2022-rebuildA") (lib/tradegraph/url.ts) - the audit row's own
  // href, not a hand-built URL, so this fails if the row ever stops linking
  // through that function.
  const auditLink = page.locator('a[href="/deals/fx-2022-rebuildA"]');
  await expect(auditLink).toBeVisible();
  await auditLink.click();

  await expect(page).toHaveURL(/\/deals\/fx-2022-rebuildA$/);
  await expectStableChrome(page);

  // The deal resolved to its own page rather than to a list. This used to assert
  // "this deal" - the marker the trade web put on the one row in a pair's list
  // matching the URL's `?trade=`, which was the only way to prove the link had
  // landed anywhere specific. A receipt needs no such marker: the page IS the
  // deal, so the assertions are the deal's own facts instead. "What each side is
  // worth today" is the receipt's own section heading (D6's wording - not a grade
  // and not a winner), and the party count comes from `tradeParties`.
  await expect(
    page.getByRole("heading", { name: /what each side is worth today/i }),
  ).toBeVisible();
  // The fixture's `fx-2022-rebuildA` is EZ8 selling Damian Lillard to roster 8 for
  // Scottie Barnes plus a future first, so both players must appear on the receipt,
  // on opposite sides. Fixture DATA, not UI copy, so this survives a copy pass.
  await expect(page.getByText(/Damian Lillard/).first()).toBeVisible();
  await expect(page.getByText(/Scottie Barnes/).first()).toBeVisible();

  // And the loop this feature is built around: every player row on a receipt opens
  // that player's provenance rail. `lineageHref` encodes the `p:` prefix, so this
  // also pins the URL contract the /lineage route decodes.
  await expect(page.locator('a[href^="/lineage/p%3A"]').first()).toBeVisible();

  expectNoConsoleErrors(guard);
});
