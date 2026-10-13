# Jayds Café system audit — 12 October 2026

**Historical initial audit — superseded by the [comprehensive audit](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/docs/audits/2026-10-12-comprehensive-audit.md).** Results and no-write scope below describe the first phase only. The expanded audit added real temporary customer writes, unpaid cancelled orders, sandbox providers, deeper forms and new failing regressions. Use the comprehensive report for the current verdict and counts.

**Verdict: the system does not yet qualify for an all-features, bug-free defense sign-off.** Core customer ordering, cash POS, inventory transactions and the main Admin workflows passed. The audit found eight open items: three behavior/accessibility defects, one Admin approval-gate defect, two configuration gaps, one dependency advisory and a failing repository lint gate.

The defense target is [jaydscafe.vercel.app](https://jaydscafe.vercel.app), including `/staff` and `/admin`. Testing used Playwright against both the hosted deployment and freshly built local production applications. Source baseline: `b4d402f9c18b57b540f5245576c9b608460d3e4b`. Dates in this report use Asia/Manila. The hosted deployment's Git revision was not independently established; its served UI was tested directly.

This is an audit of the current system, with reproducible tests added. Application code and the hosted deployment were not changed. Live staff/Admin sign-in, sign-out and reads were exercised using the designated stored test accounts. No new hosted sales, payments, stock movements, roles, addresses, vouchers or support messages were submitted. Mutation and failure-injection cases ran with isolated fixtures. No actual email was sent and no actual password was changed.

## Results and evidence

| Verification | Result | Scope and evidence |
| --- | --- | --- |
| Complete backend suite | **115/115 passed; zero skipped** | Actual migration functions in isolated PostgreSQL/PGlite, API/unit cases and native database contention. [Final log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/unit-tests-final.log) |
| Customer production build | Passed | Fresh local build, including service worker |
| POS production build | Passed | Fresh local production build |
| Admin production build | Passed | Fresh local production build. [Build log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/build-unrestricted.log) |
| TypeScript | Passed | Customer, POS, Admin, shared code and scripts. [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/typecheck-final.log) |
| Repository lint | **Failed** | 12 errors and 1,132 warnings. [Diagnostics](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/lint-unrestricted.log) |
| Production HTTP smoke | **51/51 passed** | Local pages and unauthenticated API checks. A protected page returning HTTP 200 was not counted as proof of authorized access. [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/http-smoke.log) |
| Main customer browser journeys | Passed locally and hosted | Menu, customizations, cart, checkout/recovery, recommendations, legal review and account states, using isolated data. [Hosted log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-customer-fixtures.log) |
| Main POS/Admin operational journeys | Passed locally and hosted | Cashier operations, pickup, voids, purchasing, inventory and cross-app availability; actual isolated SQL transactions. [Hosted log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-operations-fixtures.log) |
| Admin pagination and workflows | Passed locally and hosted | All **20 tables**, **15 page guides**, confirmation cancellation, save failures, exports and forms. [Hosted log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-admin-fixtures.log) |
| Real service-worker/offline suite | Passed | Public-only caching, legacy private-cache removal, offline reload, draft editing and reconnect preservation. Isolated local production build. [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/pwa.log) |
| Startup/carousel/motion suite | Passed | Responsive layout, focus behavior, reduced motion and 48px controls. [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/motion.log) |
| Additional hosted public/API/role checks | **74 passed, 1 failed** | 36 API checks, 28 live page checks, uncaught-error check and 10 role scenarios. Failure: unapproved Admin UI gate. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-live/results.json) |
| Actual hosted authenticated sessions | **40/40 passed** | Real approved staff and Admin test accounts; all 15 Admin pages, 3 POS pages, login/logout and errors. Customer UI was also checked with the staff test account, whose role is permitted there. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/authenticated-live/results.json) |
| Actual hosted backend read-only checks | **15/15 passed** | Anonymous private-table boundaries, public catalog projection, operational configuration, approval counts and nonnegative physical balances. RPC readability passing does not mean the returned readiness state is ready. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/live-data/results.json) |
| Extra customer form checks | **12 passed, 1 failed** | Profile/password validation and retry; address creation, map selection, edit/removal and failure recovery. Failure: label rename. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-extra-customer/results.json) |
| Extra Admin modal checks | **8 passed, 9 failed** | Three analytics drilldowns, category options, Escape, semantics, failed reads and PNG. Nine failed assertions represent two grouped findings, rather than nine distinct defects. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-extra-admin/results.json) |
| Signup and email-recovery forms | **11/11 passed** | Customer/staff mismatch validation, failure retention, retry, verification navigation and customer resend cooldown. Auth responses were intercepted; email delivery was not tested. [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/auth-forms/results.json) |
| Production dependency audit | **1 high advisory** | Installed production dependency tree. Exploitability in this app was not established. [Registry output](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/dependency-audit.json) |

The six additional result groups contain **171 explicit checks: 160 passed and 11 failed**. This does not include every assertion inside the larger existing browser suites. These counts overlap in feature coverage and are not a percentage of all possible system behavior.

The source inventory contains **54 page files and 29 API route files**. Every source route is listed in the [route inventory](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/route-inventory.md). The [feature matrix](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/docs/audits/2026-10-12-feature-coverage.md) identifies the tested paths and remaining gaps. The [machine-readable evidence](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/audit-evidence.json) contains individual test names/results and the inventory.

## Open findings

Severity reflects the impact observed: P1 is a major missing defense feature, P2 is a functional/accessibility/control defect, and P3 is a quality gate issue. No P0 defect was confirmed. A provider or device path that was not completed cannot be certified free of defects.

### F01 — P2: editing a saved address silently retains its old label

**Confirmed on hosted UI with isolated address storage.** Create an address named `Home`, edit it to `Office`, change the address text and save. The page reports `Address saved.` and shows the new address text, but the heading still says `Home`.

The save payload builds `{ label: label.trim(), ...destination }`. Editing stores the entire saved-address object in `destination`, including its original `label`; spreading that object overwrites the newly entered label. Use an explicit payload containing only the intended `label`, `address`, `lat` and `lng`. Add a rename-and-reload regression after fixing it.

Source: [addresses save payload](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/(shop)/profile/addresses/page.tsx:59). Evidence: `saved addresses: edit complete address` in the extra customer results; the adjacent successful address CRUD/retry checks narrow this to renaming.

### F02 — P2: an analytics read failure traps the user behind a loading overlay

**Confirmed through hosted failure injection.** Open Analytics → Product margins → a product, and fail its selected menu-item read with HTTP 503. `MarginModal` remains in the `loading || !item` branch. That branch contains a spinner, no close button, no error/retry state and no Escape dismissal. Reloading or navigating externally is required to recover.

Keep the modal shell and close control available during loading and errors. Show an actionable failure message and retry the read. Source: [loading/null-item branch](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/components/AnalyticsModals.tsx:263). Evidence: `margin: failed item read remains dismissible` and its failure screenshot in the [modal evidence folder](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-extra-admin/results.json).

### F03 — P2: four older Admin overlays lack dialog semantics and Escape dismissal

**Confirmed on hosted UI.** Financial Breakdown, best-seller Demographics, Traffic Breakdown and Category Options open and their normal close buttons work, but none exposes an accessible `dialog` role and Escape leaves the overlay open. This produced eight failed checks. The newer shared drawers/help/confirmation components passed their separate keyboard tests.

Use the existing shared drawer/dialog behavior for these four overlays, including a labelled dialog, focus capture/containment, Escape and focus restoration. The clickable analytics rows/cells also merit keyboard activation verification. Sources: [AnalyticsModals](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/components/AnalyticsModals.tsx) and [Category Options](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/app/(admin)/categories/page.tsx).

### F04 — P2: the Admin UI admits an unapproved Admin profile

**Confirmed against the deployed role gate using an isolated identity.** An authenticated fixture profile with `role: admin` and `is_approved: false` renders `.admin-shell`. The POS gate correctly rejects its unapproved staff case. Admin's gate checks the role without checking approval, and can fall back to role metadata when the profile is unavailable.

Require the verified database profile to have both `role === admin` and `is_approved === true`. Fail closed when profile verification is unavailable. This is a UI gate finding: the audit did **not** demonstrate unauthorized database access or privilege escalation. The isolated SQL role/RLS tests passed, and live anonymous reads exposed no private records.

Source: [Admin access gate](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/app/(admin)/layout.tsx:26). Evidence: `Unapproved Admin cannot enter Admin (isolated identity)` in the hosted role results.

### F05 — P1 configuration gap: scheduled pickup cannot be demonstrated on the hosted setup

**Confirmed from actual hosted branch/settings/readiness reads.** `scheduled_pickup_enabled` is false, regular hours are empty, both order/item capacities are null, production verification is absent and `production_ready` is false. The scheduling SQL paths passed isolated tests, including capacity, expiry, preparation gates and cancellation. They are not currently an available hosted customer feature.

Stock enforcement is **enabled**, but readiness reports five stock items needing fresh physical counts: Bread Flour, Butter, Eggs, French Fries (frozen) and Frying Oil. There are 67 active stock items, zero missing base recipes, zero invalid-stock entries and zero active orders in that response. Resolve the count requirements, perform production verification, enter actual hours/capacities, then enable scheduling through the supported Admin workflow. Do not bypass readiness checks to prepare a demo.

Evidence: `get_inventory_readiness`, `get_customer_branch` and `get_customer_scheduling_admin` in the [live data results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/live-data/results.json).

### F06 — P1 configuration gap: hosted background push alerts are unavailable

**Confirmed from the hosted API.** `GET /api/customer/push` returns `configured: false` and `publicKey: null`. In-app tracking and the isolated push-authorization/lease-recovery tests passed; background device delivery was not possible to certify with this configuration.

Configure the push keys and worker authorization/schedule, then verify delivery on an installed supported phone while the app is backgrounded. Include denial, unsubscribe and logout behavior in that device check. Evidence: the hosted API result and the isolated customer feature tests.

### F07 — P2 maintenance/security finding: a production dependency has a high advisory

`npm audit --omit=dev` reports one high advisory for installed `source-map-js@1.2.1`, reached through Next.js → PostCSS. The reviewed advisory concerns denial of service while processing malicious indexed source maps; it lists `1.2.2` as patched. This audit did not establish that an attacker can reach that parsing path in Jayds. [Reviewed advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Update the affected dependency through a compatible resolution, inspect the lockfile change, rerun the three builds and repeat the dependency audit. A high registry advisory is not proof of an exploited hosted vulnerability.

### F08 — P3: repository lint remains failing

The lint gate reports 12 errors: nine explicit `any` uses in AnalyticsModals, one in exportMetrics and two synchronous effect/state findings in useGeofence/useNotifications. There are also 1,132 warnings; generated/vendor MapLibre code contributes heavily to the warning volume. Builds and TypeScript passed, so this is a separate quality gate failure.

Resolve the source errors and distinguish generated bundles from maintained source in lint coverage. Do not describe repository lint as passing until the complete command succeeds. [Full diagnostics](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/lint-unrestricted.log).

## What the passing core tests establish

- Server pricing rejects forged prices/totals, unknown variants, unavailable products, invalid quantities, fake discounts, expired vouchers and insufficient points. Delivery fee/address changes cannot reuse an unaltered signed quotation incorrectly.
- Real database locks serialize competing customer/POS stock reservations, cash sales, duplicate retries, physical receiving and stale stocktakes. Rejected transactions leave no partial sale, receipt, reward or stock change.
- Accepted order requirements/prices remain stable after recipe or catalog edits. Preparation consumes once; pickup completion credits rewards once; unpaid expiry/cancellation returns reservations, points and voucher usage once. Prepared cancellations retain the consumed stock as designed.
- Cash checkout validates tender/change and acknowledgement, preserves the receipt across lost responses/retries and does not duplicate payment. Parked drafts reserve nothing, retain customer/options/notes and revalidate on resume.
- Customer-owned orders and signed guest grants enforce their ownership boundaries. Paid customer cancellations require the supported review process. Forged Maya success events cannot directly mark a sale paid; settlement checks provider identity, amount and currency.
- Delivery and pickup are separated: delivery cannot use a pickup token, unpaid cash pickup requires the correct private QR and recorded tender, and the TV projection avoids exposing private customer data.
- Purchases separate approval, ordering and physical receiving; partial receiving validates the remaining amount. Duplicate delivery references, reused keys with changed data and stale count baselines fail atomically.
- Admin confirmations can be cancelled without submitting a write, failed saves retain data, self-lockout protection works, staff requests can be approved/rejected in fixtures, and CSV/PNG downloads produce files.
- Customer search, category position restoration, menu options, cart notes, removal/undo, review-before-submission, lost-confirmation recovery, recommendations/reorders, legal versions, offline public browsing and draft preservation passed their tested cases.

Phone/tablet/desktop cases included widths from 360 to 1440px, portrait, landscape and reduced-height layouts, with responsive scenarios differing by suite. These were desktop Chromium viewport simulations. The tested PWA worker cached 134 public resources, excluded private routes and preserved notes/document state across reconnection. These are not real Android/iOS measurements or field performance statistics.

## Remaining sign-off coverage

The matrix distinguishes passing tested paths from incomplete integrations. In particular, the following cannot be called fully end-to-end verified from this audit:

1. A real customer-role session performing owner-scoped cloud writes against the deployed backend. The stored usable credentials were staff/Admin; customer-role behavior was tested with isolated identities/SQL, and the actual customer portal was read-tested with the staff account.
2. Maya sandbox success/failure/cancel/timeout through the provider page, hosted return, real webhook settlement and the operational refund/reconciliation process. The business functions and tampering cases passed in isolation, but no new actual provider checkout/payment was made.
3. Actual Lalamove quotation/booking, rider state transitions, cancellation/recovery and provider callbacks across customer/POS/Admin. Fixtures tested the interfaces, ownership and dispatch/reconciliation rules; no real booking was submitted.
4. Actual verification/recovery email delivery and an emailed recovery link changing a real account password. UI/Auth-response cases passed without sending email or changing accounts.
5. Installed Android/iOS behavior, camera decoding of a physical customer QR, real background notifications, notification sound on the defense devices, and physical receipt printing. Synthetic camera start/stop, denial/manual fallback and QR transaction logic passed.
6. Hosted real-time propagation under concurrent business writes, scheduler job execution and recovery under production network interruption/load. The protocol/concurrency fixtures and actual read-only connections passed; hosted write traffic/cron history were not exercised.
7. Some CRUD variants remain narrower than their whole feature families: all positive destructive actions were not executed against the hosted database. See the explicit partial rows for menu/category deletion, purchase edits, complete scheduling UI setup and reconciliation submissions.

These limitations are kept visible instead of treating mocked success as a real provider result. Testing every possible input, timing, browser and failure combination is not an achievable guarantee. This report supplies the executed scope and the remaining defense gate.

## Defense gate and sequence

1. Fix F01–F04 and rerun the added hosted regression cases after deploying the fixes. A local fix alone does not repair the defense site.
2. Complete F05/F06 if scheduled pickup and background push are claimed in the presentation; verify those workflows on the hosted setup and intended phones.
3. Resolve F07/F08, repeat dependency/lint/build checks and save the new evidence.
4. Complete the provider, real customer-role, device, hosted real-time and scheduled-worker items above in the designated test/staging workflow. Record test orders/payments and their outcomes explicitly; preserve audit trails.
5. Run a final rehearsal on the exact defense laptop, network, phones and deployed version. Perform guest/member order review, payment, staff preparation/ready/collection, stock/reward verification, Admin history/detail/export and permitted cancellation/refund paths. Check both the customer receipt and Admin/POS records for the same order.

Until those steps pass, the supported statement is **“core tested paths passed; eight findings and explicit integration/device gaps remain.”** It is not “everything is clean.”

## Reproduction commands

Run from the repository root. Environment variables below select the hosted UI while retaining isolated business fixtures. The live-data script only reads the configured backend. The authenticated script reads the already stored designated test credentials without emitting them. The added audit mode intentionally exits nonzero while its confirmed defects remain.

```powershell
npm run build
node --no-wasm-code-gc --import tsx --test --test-concurrency=2 tests/*.test.ts *> output/system-audit-2026-10-12/unit-tests-final.log
npm run typecheck
npm run lint
npm run check:http
npm run check:browser
npm run check:customer
npm run check:admin-pagination
npm run check:pwa
npm run check:motion

$env:JAYDS_AUDIT_CUSTOMER_URL='https://jaydscafe.vercel.app'
$env:JAYDS_AUDIT_POS_URL='https://jaydscafe.vercel.app/staff'
$env:JAYDS_AUDIT_ADMIN_URL='https://jaydscafe.vercel.app/admin'
node --no-wasm-code-gc --import tsx tests/browser-operations.ts
node --import tsx tests/system-audit-hosted.ts
node --import tsx tests/system-audit-live-data.ts
node --import tsx tests/system-audit-authenticated.ts
node --import tsx tests/system-audit-auth-forms.ts

$env:JAYDS_SYSTEM_AUDIT='1'
node --import tsx tests/customer-browser.ts
node --import tsx tests/admin-pagination-browser.ts
npm audit --omit=dev --json
node --import tsx scripts/collect-system-audit.ts
```

The first sandboxed run hit native fixture cleanup `EPERM`, a Node/V8 WebAssembly crash, and a Next/SWC filesystem access denial. Normal process/filesystem access allowed the native contention test and all builds to complete. A normal targeted scheduling retry passed all six cases; the final full 115-test run also disabled WebAssembly code GC. Initial failure logs were retained and were not relabelled as application defects or passing runs. Earlier exploratory locator/fixture errors were corrected and rerun before inclusion in the final findings.
