# Jayds Café comprehensive flow audit — 12 October 2026

**Verdict: not ready for an all-features defense sign-off.** This expanded audit covers Customer, Staff/POS and Admin, their implemented forms and overlays, shared database transactions, hosted unpaid-order connections, and actual sandbox provider calls. It found **eleven open findings**, including category deletion destroying linked products, voucher targeting not being enforced by server pricing, and printed customer tickets losing their order number. A separate reverse-geocoding provider outage was observed. Passing simulations are not labelled as real-device or paid-provider results.

The defense target is [jaydscafe.vercel.app](https://jaydscafe.vercel.app), with `/staff` and `/admin`. The user confirmed a laptop, phones and the laptop webcam; **there is no receipt printer**. Physical printer output is out of scope. Source baseline is `b4d402f9c18b57b540f5245576c9b608460d3e4b`. Application code, migrations, dependencies and deployment were not changed. The deployed Git revision was not independently established.

## Executed scope

The [feature coverage register](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/docs/audits/2026-10-12-feature-coverage.md) maps the three apps and cross-system features to methods and remaining gates. The [source route inventory](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/route-inventory.md) lists all **54 page files and 29 API route files**. The [evidence index](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/audit-evidence.json) contains individual results and backend test names. Route existence, page loading and passing adjacent tests do not certify every input or integration on that route.

Testing used Playwright against hosted pages and freshly built local production apps, actual hosted Auth/API/database reads and limited writes, unchanged SQL migrations in isolated PostgreSQL/PGlite, a real service worker, and sandbox Maya/Lalamove APIs. UI failure cases injected controlled responses. Browser camera decoding used real decoder code with generated video pixels. Those methods remain distinguishable in the evidence.

| Verification | Final result | Evidence and practical scope |
| --- | --- | --- |
| Expanded backend suite | **119 tests: 116 pass, 3 fail, 0 skipped** | [Final log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/unit-tests-expanded.log). Failures: category preservation and two voucher-tier restrictions; the eligible-Gold control passes. |
| Indexed additional checks | **241 checks: 223 pass, 17 fail, 1 blocked** | [Individual evidence](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/audit-evidence.json). Repeated assertions can concern the same finding. One failed check is the observed upstream reverse-geocoding outage; Maya success is blocked by CAPTCHA. These counts exclude further assertions in the main browser suites and are not exhaustive-coverage percentages. |
| Production builds | All three passed | [Build log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/build-unrestricted.log). No later application changes. |
| Full TypeScript | Passed | [Expanded log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/typecheck-expanded.log) |
| Full repository lint | Failed: 12 source errors, 1,132 warnings | [Full diagnostics](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/lint-unrestricted.log); maintained application source was unchanged. |
| New/changed audit source lint | Passed | [Focused log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/audit-scripts-lint-expanded.log) |
| Local HTTP smoke | 51/51 passed | [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/http-smoke.log) |
| Main customer journeys | Passed; added address regression fails | [Expanded customer log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/customer-complete.log): 55 products, seven categories, nine viewport sizes, options, cart, explicit review, canonical retry, reorders, rewards and legal states. |
| Shared POS/Admin operations | Passed | [Expanded hosted log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-operations-expanded.log): unchanged SQL transactions, cashier checkout/park/recovery, queues, pickup, void, delivery fixtures, purchasing, stock propagation and reconnect. |
| Admin tables/guides/workflows | Passed | [Log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-admin-fixtures.log): all 20 tables, 15 guides, paging/filter races, staff/role/loyalty confirmations and exports. |
| Remaining Admin form and detail families | Executed; category deletion and Order Details keyboard/semantics fail | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/admin-complete/results.json): full product tabs, option library/add-ons/recipes, archive/restore, category CRUD, suppliers, purchase drafts/cancel, receiving retry, voucher edits, scheduling setup, both reconciliation forms and eight representative order detail states. |
| Wallet and scheduled-pickup UI | All ten checks passed | [Wallet](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/wallet/results.json), [scheduling](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/customer-scheduling/results.json): expired/future/exhausted offers, clipboard failure, empty bag, apply retry, tiers, slot capacity/closures/read recovery and immediate pickup. |
| Actual customer-role cloud flows | 11 passed, 1 failed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/customer-live/results.json): real temporary identities, profile/password change, cloud favorites, saved-address ownership, support visibility in Admin, cashier account QR and privilege boundaries. Failure: address label rename. |
| Actual hosted cash-order connection | 6/6 passed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/order-live/results.json): one unpaid guest order, duplicate reuse, guest isolation, already-open POS/Admin updates, real approved-staff Realtime, cancellation and stock comparison. |
| Actual hosted Maya cancellation connection | 7/7 passed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/maya-order-live/results.json): actual order, hosted checkout/reuse, provider page, signed cancellation return, POS/Admin visibility, terminal cancellation and unchanged physical stock. |
| Actual sandbox provider probes | 5/5 passed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/provider-live/results.json): hosted signed quotation; sandbox quotation/booking/canonical lookup/cancel; Maya checkout and merchant cancellation. No real rider or charge. |
| Actual Maya successful payment | **Blocked by human CAPTCHA** | [Result](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/maya-ui/results.json), [screenshot](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/maya-ui/provider-outcome.png). Published sandbox card fields completed; payment remains disabled beside unchecked reCAPTCHA. No bypass attempted. |
| QR decoder | 3/3 passed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/scanner/results.json): actual `html5-qrcode` reads camera pixels at 0/90/180 degrees, submits once and stops tracks. This does not test a physical lens or phone screen. |
| Actual customer browser printing | 2 passed, 1 failed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/receipt/results.json), [print-media screenshot](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/receipt/receipt-print-media.png). Print invokes once; items/total stay visible and the action hides. The order number disappears: F11. No physical printer. |
| Actual hosted geocoding | Search passed; reverse failed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/location-live/results.json). Repeated hosted reverse requests returned 503; direct upstream returned an HTML 503 response: O01. Manual pin/address UI fallback passed in controlled tests. |
| Service worker/offline and motion | Passed | [PWA log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/pwa.log), [motion log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/motion.log): public-only caches, offline editing/reconnect, carousel/reduced motion and responsive behavior. |
| Final hosted cleanup | 2/2 passed | [Results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/cleanup-live/results.json): all four audit orders cancelled/unpaid/unconsumed; no reserved stock or temporary Auth/support records remain. |

The evidence index also retains the earlier 75 public/API/role checks, 40 actual staff/Admin session checks, 15 live read-only checks, 13 extra customer form checks, 17 analytics/category modal checks and 11 isolated signup/recovery checks. Multiple assertions may describe the same defect. Counts are not a percentage of all possible system behavior.

## Findings

| ID | Severity | Confirmed result | Required correction or gate |
| --- | --- | --- | --- |
| F01 | P2 | Saved-address editing reports success but retains the old label. Confirmed with isolated UI writes and an actual customer account. | Explicitly save only the intended label/address/coordinates; rename and reload regression. |
| F02 | P2 | Margin drilldown read failure leaves an undismissible spinner overlay. | Keep close/Escape available through loading/error; add error/retry state. |
| F03 | P2 | Five legacy Admin overlays lack labelled dialog semantics and Escape: Financial Breakdown, Demographics, Traffic Breakdown, Category Options and Order Details. | Use shared dialog behavior with focus handling and dismissal. Normal close buttons work on loaded states. |
| F04 | P2 | An isolated authenticated Admin profile with `is_approved: false` enters the deployed Admin shell. | Require a verified approved Admin profile and fail closed when profile verification is unavailable. No database privilege escalation was demonstrated. |
| F05 | P1 configuration | Hosted scheduled pickup is disabled; hours/capacities/production verification are incomplete. Five stock items require fresh physical counts. | Operator supplies real counts/portions/hours/capacities, performs verification and enables scheduling; then executes a hosted scheduled booking. |
| F06 | P1 configuration | Hosted push endpoint returns `configured: false`, `publicKey: null`. | Configure keys and worker, then verify an installed backgrounded phone. In-app notices and isolated outbox rules passed. |
| F07 | P2 | Production dependency audit reports one high advisory for `source-map-js@1.2.1`. | Compatible patched resolution plus audit/build verification. App exploitability was not established. |
| F08 | P3 | Repository lint fails on 12 maintained-source errors. | Fix the source gate and rerun full lint; separate generated/vendor warning coverage. |
| F09 | **P1 data loss** | Positive category deletion deletes its linked product, contradicting the confirmation that products remain uncategorized. | Add a forward migration and preservation behavior, verify products/options/recipes/history, rerun the full-schema regression before deploying. |
| F10 | P2 discount control | A Gold-targeted voucher is accepted by server pricing for a Bronze customer and an unauthenticated guest. | Enforce persisted tier eligibility in validation and authoritative pricing/transactions; check both apps and usage boundaries. |
| F11 | P2 receipt identifier | Customer print media hides the order number while keeping the accepted ticket's items and total. | Put the order identifier in the printable ticket; retain it through print media and verify on the defense laptop. |

### F09 — category deletion

The shipped master schema defines `menu_items.category_id` with **ON DELETE CASCADE**. The later nullable-category migration removes NOT NULL but does not change that deletion behavior. CategoriesPage issues a direct DELETE while its confirmation says the products will remain without a category. The hosted UI, driven against a schema-faithful isolated database, removes the product. A second regression applies **every unchanged production migration** and observes zero remaining products where one is required.

Sources: [category handler](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/app/(admin)/categories/page.tsx:119), [master foreign key](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/supabase/migrations/20260426000100_master_setup.sql:144), [nullable migration](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/supabase/migrations/20260426001900_run12_nullable_category.sql:2), [regression](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/tests/category-delete.test.ts:6), [focused evidence](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/category-delete.log). No real hosted category/product was deleted. The exact hosted FK definition was not read independently; the finding is reproduced against the complete shipped migration schema.

### F10 — voucher target tier

Admin can save a target tier. The voucher-validation API does not check customer tier, and authoritative order pricing does not select or enforce `target_tier`. With a valid ₱100 product and a ₱10 Gold-only voucher, the unchanged pricing function accepts ₱90 for both a Bronze customer and a guest. The eligible Gold control also succeeds, isolating the failure to the missing restriction. No actual hosted voucher redemption was performed.

Sources: [pricing](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/api/orders/create/pricing.ts:94), [validation](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/api/vouchers/validate/route.ts:13), [tier regressions](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/tests/voucher-tier.test.ts:25), [focused evidence](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/voucher-tier.log).

### F11 — customer printed ticket loses the order number

The order page renders its identifier as the AppShell title, inside `.app-header`. Global print styles hide that header. The accepted-ticket section does not repeat the identifier. On actual hosted audit order ORD-0059, Playwright confirmed the print button invokes `window.print()` once and print media retains items/total while hiding the button. All exact order-number elements become invisible. The screenshot shows the resulting unidentified ticket. This is a browser print-layout defect even though no receipt printer is in the defense setup.

Sources: [order title](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/(shop)/orders/[id]/page.tsx:468), [ticket content](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/(shop)/orders/[id]/page.tsx:713), [header](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/components/AppShell.tsx:53), [print rule](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/globals.css:1523), [regression](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/tests/system-audit-receipt.ts:26), [results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/receipt/results.json).

### O01 — observed reverse-geocoding outage

Actual hosted address search returned valid destinations. Reverse lookup at public test coordinates (14.346621, 120.981057) returned 503, and a second hosted request reproduced it. A direct request to the configured Photon reverse endpoint also returned HTTP 503 with an nginx HTML error. That supports an upstream availability problem; it does not establish a persistent application-code defect. The hosted route returned its intended manual pin/address fallback message. Recheck provider availability before the defense and rehearse that fallback.

Evidence: [hosted results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/location-live/results.json), [repeat probe](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/location-diagnostic.log), [direct provider status](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/photon-reverse-diagnostic.log), [route fallback](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/api/location/route.ts:117).

### Remaining finding evidence

F01: [save payload](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/customer/app/(shop)/profile/addresses/page.tsx:59) spreads an edited address object after the new label, overwriting it. F02/F03: [AnalyticsModals](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/components/AnalyticsModals.tsx:263), [modal results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-extra-admin/results.json) and [OrderDetailsModal](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/components/OrderDetailsModal.tsx:67). F04: [Admin gate](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/apps/admin/app/(admin)/layout.tsx:26) and [role results](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/hosted-live/results.json).

F05/F06: [live data](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/live-data/results.json) and actual hosted push API. Readiness was false with missing fresh counts for Bread Flour, Butter, Eggs, French Fries (frozen) and Frying Oil. Inventory enforcement was enabled; active stock items numbered 67, missing base recipes and invalid stock entries were zero. Isolated complete scheduling setup passed, including rejection before counts, production verification, seven days/hours/closures, both capacities and real SQL slots. Those fixture counts do not certify café stock.

F07: [registry audit](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/dependency-audit.json) and [reviewed advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), patched in 1.2.2. F08: [full lint log](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/output/system-audit-2026-10-12/lint-unrestricted.log); errors are in AnalyticsModals, exportMetrics, useGeofence and useNotifications.

## Hosted write accounting

Customer test accounts used unique `jayds.audit.*@example.invalid` addresses and random credentials held only in memory. They were not existing café users. Owner-scoped profile/password, favorite, address and support actions were exercised. Cross-customer reads/updates/deletes and privileged profile changes were rejected. The approved cashier resolved the same temporary customer QR. Support was visible to the actual Admin identity. All temporary records and Auth users were removed.

Four guest audit orders remain in cancelled history: **ORD-0058, ORD-0059, ORD-0060 and ORD-0061**. Two were cash and two Maya. Retesting corrected a harness field/state expectation; these are recorded rather than silently deleting ledger history. Final verification confirms all are cancelled, unpaid (`pending` or `failed`), unconsumed and hold no active reservation. The final cash and Maya runs compared all physical stock quantities before/after and found no change. No cash tender, real charge, preparation/consumption, refund or real rider booking was made.

Actual hosted Realtime was observed during the unpaid-order runs, and the same order appeared in already-open POS/Admin pages. This establishes the tested connection; it does not certify paid handover, every reconnect race or production load. Sandbox courier bookings were cancelled through the provider API. Provider-only Maya checkouts returned to the merchant; the application-linked Maya cancellation returned with the correct order and signed return state.

## Remaining direct sign-off gates

| Gate | Why still open | Required evidence |
| --- | --- | --- |
| G01: fixes on the defense deployment | Eleven findings remain; this was an audit, not a release. | Regressions pass after fixes, migration/dependency/lint/build checks pass and hosted deployment is retested; reverse geocoding is rechecked. |
| G02: real operating readiness | Hosted schedule/push configuration is incomplete. | Operator-confirmed physical counts/recipes/hours/capacities, configured push/worker and a real hosted scheduled pickup. |
| G03: paid Maya lifecycle | Cancellation passed; human CAPTCHA prevents automated payment completion. | Success/decline/expiry, verified settlement and actual callback, then authorized refund/reconciliation in the merchant workflow. |
| G04: courier events | Sandbox quote/booking/read/cancel passed; rider progression and callbacks were not verified. | Actual supported sandbox status transitions/webhook delivery through customer/POS/Admin and recovery after late events. |
| G05: Auth email | Forms and real current-password change passed; actual verification/recovery delivery was not exercised. | Receive a designated account's verification/recovery email and follow its hosted link; validate account isolation and old-password rejection. |
| G06: laptop/phones | Desktop viewports, worker and synthetic camera are not physical devices. | Laptop webcam scans a phone QR; installed phone foreground/background, permissions, audio and background notification behavior. |
| G07: paid hosted operations/resilience | Hosted tests stopped before payment/preparation. Native transaction contention passed in isolation. | Staging/test-channel paid preparation/ready/collection with stock/reward/receipt checks, real reconnect, job history, load/soak and restore evidence. |
| G08: physical printing | No receipt printer is part of the user's defense setup. | **Out of scope**, not a failed or passed printer test. |

Maya's [official sandbox testing guide](https://developers.maya.ph/reference/testing-and-validating-your-maya-checkout-integration) describes success, decline, cancellation and expiration, and directs merchant void/refund testing through its dashboard. Its documented expiry wait is one hour. The [Lalamove API reference](https://developers.lalamove.com/) documents sandbox order and webhook interfaces. Endpoint connectivity is not proof of callback delivery.

The [defense rehearsal checklist](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/docs/audits/2026-10-12-defense-rehearsal.md) records the remaining hands-on acceptance steps. No unexecuted gate is labelled PASS. An exhaustive guarantee across every possible input, browser, timing and physical environment is not supportable.

## Reproduction

Use normal browser/process access on this Windows machine. Backend regression commands intentionally exit nonzero while the confirmed defects remain; Maya's blocked outcome exits 2. Test credentials/keys are read privately from existing configuration and are never written to evidence.

```powershell
node --no-wasm-code-gc --import tsx --test --test-concurrency=2 tests/*.test.ts
npm run typecheck
npm run lint
$env:JAYDS_AUDIT_CUSTOMER_URL='https://jaydscafe.vercel.app'
$env:JAYDS_AUDIT_POS_URL='https://jaydscafe.vercel.app/staff'
$env:JAYDS_AUDIT_ADMIN_URL='https://jaydscafe.vercel.app/admin'
$env:JAYDS_ADMIN_COMPLETE_ONLY='1'
node --no-wasm-code-gc --import tsx tests/browser-operations.ts
Remove-Item Env:JAYDS_ADMIN_COMPLETE_ONLY
$env:JAYDS_CUSTOMER_COMPLETE_ONLY='1'
node --import tsx tests/customer-browser.ts
Remove-Item Env:JAYDS_CUSTOMER_COMPLETE_ONLY
node --import tsx tests/system-audit-customer-live.ts
node --import tsx tests/system-audit-order-live.ts
$env:JAYDS_AUDIT_MAYA_ORDER='1'
node --import tsx tests/system-audit-order-live.ts
Remove-Item Env:JAYDS_AUDIT_MAYA_ORDER
node --import tsx tests/system-audit-providers.ts
node --import tsx tests/system-audit-maya-ui.ts
node --import tsx tests/system-audit-receipt.ts
node --import tsx tests/system-audit-location-live.ts
node --import tsx tests/system-audit-cleanup.ts
node --import tsx scripts/collect-system-audit.ts
```

Live-write scripts create designated temporary records or an unpaid order and run cleanup. Repeated order runs retain additional cancelled audit records. Run destructive/load cases against staging, not café sales. Initial sandbox/V8 failures, controlled fixture/locator corrections and the original 115-test passing baseline are documented in the [initial audit](C:/Users/Exelec/Downloads/pwajaydsmobilesokpos/docs/audits/2026-10-12-system-audit.md). The expanded three failing backend regressions are application findings, not infrastructure failures.
