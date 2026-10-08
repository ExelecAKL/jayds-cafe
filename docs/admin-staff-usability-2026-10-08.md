# Admin and staff usability verification — 8 October 2026

The existing Admin layout, routes, features, fields, reports and tables remain available. This update adds guidance and review steps to help the owner and staff understand their consequences.

## What changed

- Contextual Help on all 15 Admin pages explains the page's purpose, three practical steps, relevant consequences and related tasks. Navigation uses plain labels such as Stock & recipes, Account roles and Buy & receive stock. The overview has four everyday-task shortcuts above the existing metrics and reports.
- Confirmation dialogs show specific consequences before stock movements/counts, stock activation, menu saves, purchase receipts, access changes, staff approvals, point corrections, vouchers, category changes, branch settings and manager PIN changes. Closing or cancelling the dialog submits no change. Keyboard focus stays inside the dialog and returns to the original control.
- Stock confirmations show item, quantity, unit and before/after stock. Access changes prevent editing the signed-in administrator's own role. Points corrections show the resulting balance and require whole points. Voucher prices/discounts preserve decimals rather than truncating them.
- Failed voucher, points and role saves show errors; voucher and points forms retain entered values for retry. Category actions report failed or partial updates accurately. A missing forecast refresh timestamp has a readable fallback.
- Staff Help explains register, order, payment and cancellation workflows. New POS cash sales require acknowledgement that the money was received; editing the cash amount clears that acknowledgement. Cancellation requires reviewing its consequences before the existing manager PIN check. First courier booking asks staff to review the order and destination.
- Existing pickup QR verification, Maya payment checks, delivery tracking, stock enforcement, idempotent retries and server permissions remain in place. No database migration or provider configuration change is part of this update.

The optional points review note is explicitly described as confirmation-only: the existing backend does not save it to customer history.

## Verification

| Check                                                    | Result                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin and POS production builds                          | Passed                                                                                                                                                               |
| Admin, POS, shared package and scripts TypeScript checks | Passed                                                                                                                                                               |
| ESLint on changed TypeScript files                       | Passed                                                                                                                                                               |
| Node/SQL suite                                           | All 107 tests passed across the main run and targeted rerun; the first Windows PostgreSQL cleanup failed with EPERM, then passed with bounded cleanup retries        |
| Production browser demo across customer, POS and Admin   | Passed using isolated PostgreSQL/Realtime fixtures, including ordering, stock, receiving, permissions, retries, pickup and cancellation                              |
| Admin pagination                                         | All 20 tables passed: 10-row limit, next/previous, filter/page reset, empty results, delayed search responses, server ranges and mobile/keyboard controls            |
| Owner workflow demo                                      | All 15 guides plus stock entries/counts, access, staff approval/rejection, points, vouchers, categories, suppliers, scheduling, PIN changes and CSV downloads passed |
| Cancelled and failed operations                          | No writes on cancelled confirmations; failed saves retained drafts and permitted retry                                                                               |
| Visual review                                            | Desktop overview, confirmation dialog and phone Help drawer inspected                                                                                                |

The owner workflow browser test submits 23 writes to an isolated in-memory API fixture. Stock, purchase and concurrency rules are also tested against isolated PostgreSQL. These checks do not change live business data.

Reproduce with `npm test`, `npm run check:browser` and `npm run check:admin-pagination`. On restricted Windows environments the browser/server and native PostgreSQL checks require permission to launch local processes.

## Hosted release

Commit `e33f269` was pushed to the existing private GitHub repository and deployed through the Vercel CLI to Admin and Staff. Both production deployments report READY and identify that commit. The customer deployment also remains READY.

- Admin: https://jaydscafe.vercel.app/admin
- Staff: https://jaydscafe.vercel.app/staff

Hosted read-only browser checks passed for 19 populated or empty table views, all 15 Admin Help drawers, three Staff Help drawers, menu images, filter reset and phone pagination/Help layout. The purchase-lines drawer was skipped on production because there are no saved purchases; its 23-line fixture passed in the isolated test. No runtime errors or business writes were recorded.

## Practical limits

This is broad regression coverage, not a guarantee that every possible bug is absent. Actual Maya CAPTCHA/payment completion remains deferred at the user's request. This release does not book a real Lalamove rider or perform destructive changes against production business records. Hosted verification uses read-only data access.
