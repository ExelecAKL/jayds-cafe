# Jayds Café — post-fix audit, 13 October 2026

**Pre-publication repeat audit: passed. Hosted release verification: pending the final deployment.** This report covers Customer, Staff/POS and Admin. It is a record of named checks and their limits; passing counts do not certify every possible input or device.

The earlier [12 October audit](2026-10-12-comprehensive-audit.md) is preserved. The source before these repairs is commit `b4d402f9c18b57b540f5245576c9b608460d3e4b`. Final hosted evidence and release references will be appended after publication checks.

## Before and after

| Finding | Earlier result | Repair and current evidence |
| --- | --- | --- |
| F01 — saved-address rename | Success notice retained the old label | Explicit label/address/coordinate writes. Isolated rename/reload and actual customer-cloud rename passed. |
| F02 — failed margin read | Spinner could not be dismissed | Close stays available during loading/error; retry, Escape, focus handling and failed-read recovery passed. |
| F03 — five Admin overlays | Missing dialog semantics and Escape | Financial Breakdown, Demographics, Traffic, Category Options and Order Details use labelled dialogs with keyboard dismissal and focus restoration. |
| F04 — Admin approval | Unapproved Admin entered the shell | Verified matching, approved Admin profile required. Missing profile fails closed; metadata cannot grant access. Hosted role replay is part of the final release checks. |
| F05 — live scheduling readiness | Scheduling disabled; operating setup incomplete | Complete scheduling UI/SQL scenarios passed. Operator confirmed 13:00–22:00 hours. Weekdays/closures, slot capacities and fresh stock counts remain operator inputs; scheduling has not been enabled using invented values. |
| F06 — push setup | Missing keys and worker configuration | Production keys configured privately; service-only Vault setup and cron verified. Hosted scheduled worker returned HTTP 200. Physical background phone delivery remains a device check. |
| F07 — production dependency | High advisory in source-map-js 1.2.1 | Patched to 1.2.2; production dependency audit reports **zero vulnerabilities**. Separate build-tool advisories are disclosed below. |
| F08 — lint | 12 source errors, vendor warnings | Maintained source corrected. Final full lint: **0 errors, 0 warnings**; copied upstream MapLibre distribution is excluded. |
| F09 — category deletion | Deleted linked products through CASCADE | Forward foreign key uses SET NULL. Full-migration SQL and actual hosted hidden-fixture checks preserved the product, option and recipe. |
| F10 — voucher tier | Gold voucher accepted for Bronze/guest | Tier enforced in validation, authoritative pricing and SQL transactions. Bronze/guest rejected; eligible Gold positive controls passed; rejected attempts did not consume usage. |
| F11 — printed identifier | Order number disappeared in print media | Identifier included in printable accepted ticket. Actual hosted print-media replay is included in the release checks; no physical printer is expected. |
| O01 — reverse geocoder | Upstream returned 503 | Hosted search/reverse recovered in the current session; the final release replay checks the provider again. |

## Additional requested changes

Admin now announces errors, native invalid fields, confirmation acceptance and successful saves through dismissible toasts. Inline feedback remains beside the form. Duplicate notices collapse, focused/hovered notices pause dismissal, and success appears after the successful write. The confirmation notice says the action is being processed; it does not claim the write has already succeeded.

Required form fields have red asterisks; optional fields show `(optional)`. Conditional fields follow the selected flow, including guest help, scheduled pickup and delivery. The account email is labelled read-only. Customer registration and profile phone numbers are required, validated and normalized; delivery review and the server also reject missing or malformed recipient contacts before pricing/provider work.

## Repeat audit evidence before publication

| Check | Result and scope |
| --- | --- |
| Complete backend/migration suite | **120/120 passed**, zero failures/skips. Includes all forward migrations, tier rejection/rollback, category preservation and the new delivery-contact regression. Earlier suite: 116/119 passed. |
| Production builds | Customer, POS and Admin passed; Customer rebuilt again after final delivery-contact validation. |
| TypeScript and repository lint | Passed; lint has zero errors/warnings in its stated scope. |
| HTTP smoke | **51/51 passed** on isolated local production servers. |
| Main customer journeys | Passed with 55-product fixtures, seven categories, nine viewport sizes, customization, bag/review, recovery, rewards, recommendations, legal and account states. |
| Additional customer forms | **14/14 passed**, including missing/malformed phone, failed-save retention, password and saved-address flows. |
| Wallet and scheduled-pickup UI | **10/10 passed** across copying/applying/retry, tier display, capacity/date/closure/read-error and immediate-pickup scenarios. |
| Main Staff/POS and Admin operations | Passed: tender/change/acknowledgement, draft/park/retry, order queues/progression, collection, void, stock/receiving and connected updates in isolated SQL/Realtime fixtures. |
| Admin tables, guides and workflows | All **20 tables**, **15 guides**, paging/search races, approvals/roles/loyalty, confirmations and exports passed. |
| Remaining Admin form families | **21/21 passed**: all menu tabs, options/recipes, category preservation, suppliers/purchases/receiving, vouchers, scheduling, reconciliation, order-detail states and toast controls. |
| Analytics/category modals | **18/18 passed**, including deliberately unavailable reads, retry, close/Escape/focus and PNG export. |
| Form guidance | **9/9 passed**: visible markers/colour, phone layout, conditional guest help and blocked blank/malformed registration phone. |
| Actual hosted repair probes | **6/6 passed**: hidden category fixtures, temporary tiers/future voucher, authoritative rejection/no usage, scheduled push worker and cleanup/retirement. |
| QR decoder | **3/3 passed** with actual decoder and synthetic camera pixels at 0/90/180 degrees; physical webcam scan remains pending. |
| PWA/offline and motion | Public-only caches, offline draft editing/reconnect, responsive carousel, focus pause and reduced motion passed. |

Fixture failures found while updating label selectors, cart hydration timing and suite isolation were corrected and rerun. Intermediate logs are retained locally; only the completed final runs count above.

## Hosted release verification

Pending final publication. The repeat run will cover public/API/role boundaries, actual Staff/Admin sessions, live read projections, actual temporary customer writes, unpaid cash/Maya order interconnection and cancellation, sandbox providers, print media, geocoding and final cleanup. It will also replay the UI fixture suites through the hosted Customer, `/staff` and `/admin` entry points and verify the new phone requirement.

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

The GitHub previous-version tag and release branch will be recorded after the requested upload. Revisit the old source using that tag. App rollback must retain the protective forward database migrations; do not replay the old schema or reset the database.
