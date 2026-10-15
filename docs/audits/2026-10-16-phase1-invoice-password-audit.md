# Jayds Café — phase checkpoint audit, 16 October 2026

**PASS for menu corrections, password visibility and the implemented finance/invoice foundation. The complete approved plan remains INCOMPLETE. This is not a clean defense sign-off or a new hosted release.**

Audited application commit: `0b197cd0d2aaa25c1dd2648db582ae5af8c587a6`, branch `codex/discrepancy-finance-2026-10-13`. The [source manifest](evidence/2026-10-16-discrepancy-sources.json) records SHA-256 hashes for 40 changed application, migration, script and test files against previous main `457f2c701b02cd589f3b6df640f899716b0e0d5c`. Private registration details, test credentials and the user's documents are excluded.

## Verification results

| Scope | Result | Evidence and limits |
| --- | --- | --- |
| Full backend regression | **138/138 PASS**, no skips | Actual unchanged test entry points, including every forward migration and native PostgreSQL concurrency. The completed run used serial execution and `--no-wasm-code-gc` after an earlier V8 cleanup crash. The crashed run is not counted as passing. |
| Production builds | **PASS**, all three apps | Customer, POS and Admin production builds, including the final print layout, shared POS financial snapshots and income-tax readiness notices. |
| TypeScript and lint | **PASS** | All app/shared/script type checks; repository lint has no errors or warnings. |
| Combined Admin/POS browser regression | **PASS** | Desktop/tablet/phone operations, dialogs, failed-save retention, approvals, partial receiving, menu options, parked tickets, lost-response retry, cash tender/change, progression, collection, manager void and connected fixture updates. Data and provider responses were isolated. |
| Password visibility | **PASS**, 12 password fields across 7 pages | Customer login/register/profile/reset, POS login/register and Admin login. Pointer and keyboard toggles preserve values, start masked, expose their state accessibly, mask after leaving/clearing a field, and issue no authentication mutations. Manager PIN entry also uses the shared control and remains covered by the POS void journey. |
| Customer journeys | **PASS**, 55 products and 9 viewport sizes | Categories, search, options, voucher/points review, saved draft, retry/recovery and recommendations. Three fixture checkout requests produced one canonical sale. No runtime errors. |
| New finance and invoice screens | **PASS** | Required-field feedback and success toasts, invoice setup, actual fixture POS cash sale → issued invoice → Customer receipt view, expenses with reviewed input VAT, linked expense reversal and responsive report/table views. |
| PDF/printing | **PASS** | The one-item invoice produces one A4 page, with no Admin navigation, blank trailing page or clipped content. Exported PDF was rendered and visually inspected; phone invoice view was also inspected. Uses fictional fixture taxpayer details. |
| PWA/offline | **PASS** | Real service worker, public-only caches, offline reload/draft editing and reconnection preserve the draft. No actual Android/iOS installation or background push certification. |
| Motion/accessibility checks | **PASS** | Five viewport widths, 48 px carousel targets, preserved focus, focus-paused autoplay and reduced-motion behavior. Local layout-shift measurements are fixture measurements, not production performance certification. |

## Implemented discrepancies verified

- Whole Milk is the included zero-price default in the nine existing milk-substitution groups. Paid Oat/Almond substitutions stay optional at their existing price. An unavailable default does not select a paid replacement. Quantity-two inventory calculation consumes the base milk once per drink.
- Customer and POS use the same default-selection helper. Extra Shot is opt-in, retains the existing price/recipe, and shows Standard / +1 Extra Shot. Americano milk and Matcha Latte espresso-bean recipe corrections preserve stored orders and stock balances.
- Admin rejects invalid/duplicate option defaults and shows the customer default preview. The stale phone-optional helper is corrected.
- VAT-inclusive calculation preserves ₱112 as ₱100 product sales plus ₱12 VAT. Product/delivery VAT, Maya amount details and configured delivery income reconcile to the accepted charged total. Maya receives the same financial snapshot, without a second VAT charge. [Maya API reference](https://developers.maya.ph/reference/createv1checkout)
- Accepted financial snapshots and posted sale/refund/expense records are immutable. Retries and duplicate callbacks do not create duplicate sales, receipts, invoices or reward redemptions. Refunds create linked credit notes; late/disputed payments do not fabricate normal sales.
- Two simultaneous independent settlements issue distinct invoice numbers. Two cash checkouts for different stock items cross a synchronized snapshot barrier and both commit without a tax-settings lock-upgrade deadlock. Exhausted configured numbering preserves payment and flags pending issuance.
- Reports aggregate more than 200 sales on the server, use Philippine business dates and retain unknown historical tax/cost data as unknown. Actual consumption unit cost is recorded; operating expenses exclude inventory purchases. OSD estimates do not deduct actual costs again and remain incomplete when required annual/historical data is missing.
- Invoice generation is enabled in the new configuration. Owner-reported RDO confirmation is recorded; no permit/reference or approved serial range is invented. The taxpayer identity is held privately for the later audited hosted configuration step. **No new migrations or registration configuration were applied to the hosted database in this checkpoint.**

## Remaining scope and readiness gates

| Item | Status |
| --- | --- |
| SC/PWD calculation examples and rounding | **PASS for isolated arithmetic only**. ₱112 qualifying personal sale → ₱80; this does not establish a working verification/checkout workflow. |
| Private front/back ID uploads, review, expiry/revocation, retention and live benefit checkout | **NOT TESTED — implementation still required**. |
| Expense supporting-document uploads and stock-purchase input-VAT review | **NOT TESTED — implementation still required**. Existing form records supporting document references and reviewed operating-expense input VAT. |
| Existing Analytics page aggregation/200-order limit and Philippine hour corrections | **NOT TESTED for the planned replacement — implementation still required**. The new Finance report is separately verified. |
| Simpler stock planning and reviewed purchase-draft creation | **NOT TESTED for the planned changes — implementation still required**. Existing forecast safeguards remain. |
| Carousel swipe/return-state and remaining Customer/motion changes | **NOT TESTED for the planned additions — implementation still required**. Existing carousel/motion checks pass. |
| Fresh physical stock, pickup capacities and closures | **BLOCKED on operator inputs**. Confirmed hours are 1 PM–10 PM; this alone does not activate scheduled pickup. |
| Formal invoice authorization/serial claims and delivery/annual tax configuration | **BLOCKED on independent verification or required operator/accountant inputs**. This does not disable system-generated invoicing. |
| Phone installation/background push, physical laptop webcam QR and full Maya/courier outcomes | **BLOCKED on direct checks**. Phone is disconnected; no ZUS agent/phone flow was restarted. No receipt printer is required. |
| Final combined audit and GitHub/Vercel publication | **NOT TESTED / NOT PUBLISHED for this feature branch**. Remains after completion of the remaining plan. Existing production main and preserved rollback history are untouched. |

The [implementation checklist](../discrepancy-implementation-progress.md) remains the work list. Local passing checks are not a substitute for those unimplemented workflows or direct production/device gates. This audit does not claim every possible input, sustained load, completed provider payment/refund, or independently certified BIR compliance.
