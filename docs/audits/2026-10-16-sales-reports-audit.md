# Sales Reports audit checkpoint

Tested application commit: `aa93e23174ab622ee7ddd394ba69f66b29433c63` on `codex/discrepancy-finance-2026-10-13`.

**Result: PASS for the completed local checks. This is not a hosted release or final defense sign-off.** The new report migration has not been applied to the hosted database.

| Area | Result |
| --- | --- |
| Complete reports | **PASS.** Server aggregation includes 1,206 eligible paid orders, exceeding the former 200-order best-seller limit and the default 1,000-row API limit. The top-ten ranking uses all matching order items. Cancelled, unpaid, parked, unconfirmed and disputed payments are excluded from collected sales. Overview uses the same sales eligibility. |
| Philippine dates | **PASS.** Midnight, week/month/year boundaries and 1 PM–10 PM peak hours are evaluated in Philippine time. Database tests change the session timezone; Playwright uses America/Los_Angeles. Sales outside operating hours remain in the daily totals and chart. |
| Charts and detail | **PASS.** Sales chart and numeric table, product quantities and real recorded extras, hourly order drill-down and ten-order pagination. Product identity survives customization labels and parentheses in product names. Recipe-cost estimates are distinguished from Finance profit/tax. |
| Recovery and interaction | **PASS.** Initial report/detail failures expose retry; a failed refresh retains the last successful report. A delayed response cannot replace a newer period. Heatmap cells and product names support keyboard activation. Phone/tablet/laptop layouts checked at 390, 834 and 1440 px. No browser runtime errors. |
| Permissions | **PASS.** Current approved Admin required; staff and unapproved Admin refused. Invalid periods and report ranges rejected. Read-only reports do not alter stock, payment or invoice records. |
| Regression | **PASS: 154/154 backend tests**, zero failures/skips, including the production-schema migration sequence and existing finance/concurrency protections. Admin production build and full TypeScript checks pass. Full lint has zero errors and one existing shared-auth ref-cleanup warning; focused changed-file lint has zero errors/warnings. |

Initial browser runs exposed missing production-schema/join fields in the isolated fixture and ambiguous repeated-value selectors. These were corrected before the passing run. A viewport assertion was moved after layout settlement; the resulting screenshots and width checks pass. A recipe-dialog phone layout was improved before the final build and browser audit.

**NOT TESTED:** this new migration and UI on the hosted deployment; complete provider payment/refund/delivery outcomes; physical phone installation, background push and webcam QR capture. **BLOCKED on operator inputs:** physical stock counts, pickup capacity/closure dates, delivery-fee tax setup and owner tax inputs. These gates are not cleared by simulated data.

The shared read-only quote endpoint, expense uploads/stock-purchase VAT reconciliation and remaining Customer interaction work are separate implementation tasks. SC/PWD software remains cancelled. Existing Orders, Categories and Recipes layouts are retained.

Compact source/log hashes and browser result: [audit evidence](evidence/2026-10-16-sales-reports.json). Raw local logs and screenshots are in ignored `.codex-logs/`; credentials and private invoice registration are excluded.
