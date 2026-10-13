# Jayds Café — post-fix audit, 13 October 2026

**Automated post-fix audit complete: 120/120 backend tests passed; 262/263 individual checks passed, zero failed, one blocked by Maya's human CAPTCHA.** The complete Customer, Staff/POS and Admin browser suites also passed locally and through the hosted entry points. These are named checks with stated limits; they do not certify every possible input or device. The direct defense gates below remain open.

The earlier [12 October audit](2026-10-12-comprehensive-audit.md) is preserved. Its expanded checks recorded 223 passes, 17 failures and one blocked outcome; the backend suite recorded 116/119 passes. The current application release is `c70b2157d157c75a1075fb9e5e78f27a30035af0`, compared with source `b4d402f9c18b57b540f5245576c9b608460d3e4b`. The current check set adds repair regressions and phone/form guidance; the totals are not a coverage percentage.

See the [feature coverage matrix](2026-10-13-feature-coverage.md), [machine-readable evidence](../../output/defense-fixes-2026-10-13/audit-evidence.json), [source hashes](../../output/defense-fixes-2026-10-13/source-changes.json), [route inventory](../../output/defense-fixes-2026-10-13/route-inventory.md) and [device/rollback guide](2026-10-13-defense-rehearsal-and-rollback.md). The source inventory contains **54 pages and 29 API route files**; individual page existence is not a claim of every input being exercised.

## Before and after

| Finding | Earlier result | Repair and current evidence |
| --- | --- | --- |
| F01 — saved-address rename | Success notice retained the old label | Explicit label/address/coordinate writes. Isolated rename/reload and actual customer-cloud rename passed. |
| F02 — failed margin read | Spinner could not be dismissed | Close stays available during loading/error; retry, Escape, focus handling and failed-read recovery passed. |
| F03 — five Admin overlays | Missing dialog semantics and Escape | Financial Breakdown, Demographics, Traffic, Category Options and Order Details use labelled dialogs with keyboard dismissal and focus restoration. |
| F04 — Admin approval | Unapproved Admin entered the shell | Matching, approved Admin profile required. Missing profile fails closed; metadata cannot grant access. Hosted role replay passed for approved, unapproved, staff, customer and guest cases. |
| F05 — live scheduling readiness | Scheduling disabled; operating setup incomplete | Complete scheduling UI/SQL scenarios passed. Operator confirmed 13:00–22:00 hours. Weekdays/closures, slot capacities and fresh stock counts remain operator inputs; scheduling has not been enabled using invented values. |
| F06 — push setup | Missing keys and worker configuration | Production keys configured privately; service-only Vault setup and cron verified. Hosted scheduled worker returned HTTP 200. Physical background phone delivery remains a device check. |
| F07 — production dependency | High advisory in source-map-js 1.2.1 | Patched to 1.2.2; production dependency audit reports **zero vulnerabilities**. Separate build-tool advisories are disclosed below. |
| F08 — lint | 12 source errors, vendor warnings | Maintained source corrected. Final full lint: **0 errors, 0 warnings**; copied upstream MapLibre distribution is excluded. |
| F09 — category deletion | Deleted linked products through CASCADE | Forward foreign key uses SET NULL. Full-migration SQL and actual hosted hidden-fixture checks preserved the product, option and recipe. |
| F10 — voucher tier | Gold voucher accepted for Bronze/guest | Tier enforced in validation, authoritative pricing and SQL transactions. Bronze/guest rejected; eligible Gold positive controls passed; rejected attempts did not consume usage. |
| F11 — printed identifier | Order number disappeared in print media | Identifier included in printable accepted ticket. Actual hosted print-media replay passed: order number/items/total retained and print action hidden; no physical printer is expected. |
| O01 — reverse geocoder | Upstream returned 503 | Final hosted search and reverse probes both passed. This is an observed upstream recovery; continued external-service availability is not guaranteed. |

## Additional requested changes

Admin now announces errors, native invalid fields, confirmation acceptance and successful saves through dismissible toasts. Inline feedback remains beside the form. Duplicate notices collapse, focused/hovered notices pause dismissal, and success appears after the successful write. The confirmation notice says the action is being processed; it does not claim the write has already succeeded.

Required form fields have red asterisks; optional fields show `(optional)`. Conditional fields follow the selected flow, including guest help, scheduled pickup and delivery. The account email is labelled read-only. Customer registration and profile phone numbers are required, validated and normalized; delivery review and the server also reject missing or malformed recipient contacts before pricing/provider work.

## Local and hosted repeat evidence

| Check | Result and scope |
| --- | --- |
| Complete backend/migration suite | **120/120 passed**, zero failures/skips. Includes all forward migrations, tier rejection/rollback, category preservation and the new delivery-contact regression. Earlier suite: 116/119 passed. |
| Production builds | Customer, POS and Admin passed; Customer rebuilt again after final delivery-contact validation. |
| TypeScript and repository lint | Passed; lint has zero errors/warnings in its stated scope. |
| HTTP smoke | **51/51 passed** on isolated local production servers. |
| Main customer journeys | Passed locally and hosted with 55-product fixtures, seven categories, nine viewport sizes, customization, bag/review, recovery, rewards, recommendations, legal and account states. |
| Additional customer forms | **14/14 passed**, including missing/malformed phone, failed-save retention, password and saved-address flows. |
| Wallet and scheduled-pickup UI | **10/10 passed** across copying/applying/retry, tier display, capacity/date/closure/read-error and immediate-pickup scenarios. |
| Main Staff/POS and Admin operations | Passed locally and hosted: tender/change/acknowledgement, draft/park/retry, order queues/progression, collection, void, stock/receiving and connected updates in isolated SQL/Realtime fixtures. |
| Admin tables, guides and workflows | All **20 tables**, **15 guides**, paging/search races, approvals/roles/loyalty, confirmations and exports passed. |
| Remaining Admin form families | **21/21 passed**: all menu tabs, options/recipes, category preservation, suppliers/purchases/receiving, vouchers, scheduling, reconciliation, order-detail states and toast controls. |
| Analytics/category modals | **18/18 passed**, including deliberately unavailable reads, retry, close/Escape/focus and PNG export. |
| Form guidance | **9/9 passed**: visible markers/colour, phone layout, conditional guest help and blocked blank/malformed registration phone. |
| Actual hosted repair probes | **6/6 passed**: hidden category fixtures, temporary tiers/future voucher, authoritative rejection/no usage, scheduled push worker and cleanup/retirement. |
| QR decoder | **3/3 passed** with actual decoder and synthetic camera pixels at 0/90/180 degrees; physical webcam scan remains pending. |
| PWA/offline and motion | Public-only caches, offline draft editing/reconnect, responsive carousel, focus pause and reduced motion passed. |

Fixture failures found while updating label selectors, cart hydration timing and suite isolation were corrected and rerun. Intermediate logs are retained locally; only the completed final runs count above.

## Hosted release verification

All three Vercel production releases reported **READY**. The repeat tests used [Customer](https://jaydscafe.vercel.app), [Staff/POS](https://jaydscafe.vercel.app/staff) and [Admin](https://jaydscafe.vercel.app/admin). [Deployment proof](../../output/defense-fixes-2026-10-13/deployments.json) records each deployment identifier and the audited source. Final evidence was collected on 13 October 2026 in the Asia/Manila time zone.

| Hosted group | Result | What actually ran |
| --- | --- | --- |
| Public/API/role boundaries | **76/76 passed** | Public pages, invalid/unauthenticated requests, ten isolated UI role/approval identities, strict cross-origin voucher rejection and separate same-origin invalid-body feedback. |
| Approved authenticated sessions | **40/40 passed** | Actual designated Staff/Admin accounts and their protected routes; real reads only. |
| Backend projections | **15/15 passed** | Anonymous/private-table boundaries, public catalog, branch/readiness settings, approvals and nonnegative physical balances. Read checks do not certify incomplete operating setup. |
| Customer forms, wallet and scheduling | **24/24 passed** | Hosted UI with intercepted owner writes and explicit vouchers/slots/error scenarios; live scheduling remains disabled pending real operator data. |
| Signup/recovery and form guidance | **22/22 passed** | Intercepted Auth/email outcomes; red/optional markers, layouts and required contact rejection. No email was sent by these fixture checks. |
| Admin remaining forms and overlays | **39/39 passed** | Menu/options/recipes, category preservation, purchases/receiving, vouchers, scheduling, reconciliation, all order-detail states, analytics failure/retry and toasts. |
| Actual customer cloud writes | **12/12 passed** | Temporary identities: phone/profile, favorites, address rename/ownership, support visible to actual Admin, privilege rejection, password change and logout; exact cleanup. |
| Actual unpaid cash order | **6/6 passed** | Canonical duplicate retry, owner grant, actual POS/Admin visibility and Realtime, twice-idempotent cancellation, no stock consumption. Retained as cancelled `ORD-0062`. |
| Actual unpaid Maya order | **7/7 passed** | Checkout creation/reuse, provider page and signed cancellation return, cross-app visibility/Realtime, cancellation and cleanup. Retained as cancelled `ORD-0063`; no charge. |
| Actual sandbox provider probes | **5/5 passed** | Hosted signed quote, courier quotation/booking/lookup/cancel and Maya checkout/merchant-cancel return. No real rider or paid sale. |
| QR optical decoder | **3/3 passed** | Hosted actual decoder and synthetic camera pixels at three rotations, one submission and stopped tracks. Physical laptop lens remains pending. |
| Receipt and geocoding | **5/5 passed** | Browser print action/media and visible identifier; actual hosted address search/reverse. |
| Hosted repair regressions | **6/6 passed** | Hidden archived category fixtures, real tier validation/pricing rejection, no voucher usage/order, scheduled worker HTTP 200 and fixture retirement. These repair probes preceded the final UI deployment; the same forward DB and tier repairs remain in the audited release. |
| Final cleanup | **2/2 passed** | Historical and current recorded audit orders cancelled/unpaid/unconsumed; no reserved stock, active temporary account email identities or audit support cases. |
| Actual successful Maya card outcome | **1 blocked** | Published sandbox card fields filled, but Confirm and pay remained disabled beside the human reCAPTCHA. No bypass was attempted; successful payment remains unverified. |

The individual groups total **263 checks: 262 PASS, 0 FAIL, 1 BLOCKED**. The 120 backend tests, main browser assertions, 51 HTTP checks, 20-table/15-guide suite, PWA and motion runs are reported separately and are not added to that total. Hosted customer/POS/Admin fixture writes were intercepted or applied to isolated SQL; only the explicitly labelled cloud/provider probes wrote to hosted test records.

Completed final logs are retained locally under `output/defense-fixes-2026-10-13`, including `customer-hosted-final.log`, `operations-hosted-final.log`, `admin-complete-hosted-final.log`, `admin-pagination-hosted-final.log`, `cash-order-live-final.log`, `maya-order-live-final.log`, `customer-live-final.log` and `cleanup-final.log`. Selected sanitized JSON evidence is uploaded; raw logs/screenshots, local secrets and the user's thesis files are not published by this audit.

## Limits and defense acceptance gates

**A full unconditional defense sign-off remains pending the direct gates below.** These are not converted into PASS by a nearby simulation.

1. **Operating setup:** fresh counts with units for Bread Flour, Butter, Eggs, French Fries (frozen) and Frying Oil; actual slot capacities, weekdays/closures and production verification before enabling scheduled pickup. User deferred these values. Confirmed hours are 1 pm–10 pm.
2. **Defense hardware:** install/open on the intended phones, physical laptop-webcam account/pickup QR scans, audible alerts and real background push. No receipt printer is required for the confirmed setup.
3. **Payment/provider outcomes:** human Maya sandbox CAPTCHA and success/decline/expiry/refund/settlement/callback checks; actual courier rider/webhook progression. Automated merchant cancellation and courier sandbox booking/read/cancel do not certify these outcomes.
4. **Operations beyond this run:** actual verification/recovery inbox links, sustained load/soak and staging backup/restore.
5. **Build-tool dependencies:** full npm audit retains **9 advisories: 7 high, 2 moderate, 0 critical**. These derive from braces and PostCSS selector parsing in development/build tools. The braces advisory has no patched release in the current major line; npm's proposed remediation also changes major tooling versions. No app exploit was demonstrated. Production dependency audit is zero. See the [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [selector parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

Tax/VAT accounting, profit after operating expenses/tax and business net worth are not implemented. The user requested a status check only; no tax/accounting feature was added. Current sales, stock value and product gross-margin displays must not be described as full accounting.

## Data preservation and rollback

Only the two new forward migrations were applied to the hosted database. The legacy migration ledger was not repaired or old schema replayed. No production reset, financial-history deletion, existing-customer credential change or fabricated stock count was used.

Hosted fix fixtures were archived/hidden and removed after checking. The two test identities that acknowledged legal documents were soft-retired, their points reset and approval removed; immutable legal acknowledgements were retained. Temporary customer-flow records are removed normally. Unpaid order probes are cancelled before preparation and retained in order history; final cleanup verifies no active reservations or physical consumption.

The latest audited release is published through [pull request #1](https://github.com/karaagexc/jayds-cafe/pull/1) into `main`, as requested. The old `main` is preserved separately as [branch `codex/pre-defense-main-2026-10-13`](https://github.com/karaagexc/jayds-cafe/tree/codex/pre-defense-main-2026-10-13) and [tag `defense-pre-fixes-2026-10-13`](https://github.com/karaagexc/jayds-cafe/tree/defense-pre-fixes-2026-10-13), both at `b4d402f9c18b57b540f5245576c9b608460d3e4b`. The repair branch is also retained. Revisit the old source using the backup branch or tag. App rollback must retain the protective forward database migrations; do not replay old schema or reset the database.
