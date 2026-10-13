# Feature coverage matrix — 13 October 2026 (post-fix)

This matrix accompanies the [post-fix audit](2026-10-13-post-fix-audit.md). PASS applies to named scenarios, not every possible input/device. PARTIAL and CONFIG GAP retain explicit direct gates. Historical failures remain in the 12 October report. Hosted writes used temporary customers and cancelled unpaid orders, with no charge or stock consumption; two repair identities with immutable legal acknowledgements were soft-retired.

Methods: **B** = backend/API/unit/migration and native contention fixtures; **HF** = hosted Playwright UI with isolated data/mutations; **LF** = local production Playwright fixtures; **R** = actual hosted public/API/database reads; **A** = actual hosted approved staff/Admin sessions; **W** = actual customer cloud writes or unpaid hosted-order connections; **SP** = actual sandbox provider API/UI; **QR** = real optical decoder with synthetic camera pixels; **PWA** = real service worker with isolated public fixture; **AF** = hosted Auth forms with intercepted Auth/email responses. Physical devices and paid settlement remain direct gates.

## Customer

| ID | Feature/path and tested behavior | Result | Method / remaining scope |
| --- | --- | --- | --- |
| C01 | Startup, authentic brand assets, loading dismissal | PASS | LF, HF, R |
| C02 | Home carousel next/previous, pause/play, focus pause, reduced motion | PASS | LF motion suite |
| C03 | Home/Menu/Orders/Account/Help navigation and public page loading | PASS | HF, R, A |
| C04 | Published catalog, categories, images, available/sold-out products | PASS | R: current hosted catalog valid with no missing images/invalid prices; HF fixture: 55 products and seven categories |
| C05 | Search, clear search, category jumps, scroll tracking, return-position preservation | PASS | HF |
| C06 | Long names, responsive grids, portrait/landscape, sticky category rail | PASS | HF, LF |
| C07 | Product details, size modifiers, quantity, item notes, total | PASS | HF, B |
| C08 | Product/configuration sold-out gating and restock propagation | PASS | HF, LF with isolated SQL/Realtime |
| C09 | Guest favorites save, reload and favorites page | PASS | HF |
| C10 | Account-scoped favorites and account-switch race isolation | PASS | B race boundaries, HF states; W real customer save/reload/idempotency, cross-customer isolation and removal |
| C11 | Cart normalized merging, distinct options/notes, corrupt-storage rejection | PASS | B, HF |
| C12 | Cart item note edit/reload, remove/undo, clear confirmation/focus | PASS | HF |
| C13 | Checkout actions fit phones, tablets, landscape and reduced-height layouts | PASS | HF |
| C14 | Pickup/cash selection, voucher/points totals and legal review | PASS | HF, B |
| C15 | Review never auto-submits; explicit submit accepts canonical order | PASS | HF, B |
| C16 | Stock conflict retains bag; lost-response recovery/reload reuses one order | PASS | HF, B |
| C17 | Scheduled pickup booking capacity, dates, deadlines and preparation timing | CONFIG GAP | B and five HF slot/date/full-capacity/closure/error-retry/immediate-pickup checks passed; live scheduling disabled/incomplete: F05 |
| C18 | Delivery map open/close, denied GPS, manual/search selection and address | PASS | HF; geocoder/search responses isolated |
| C19 | Live geocoding, delivery quotation and courier coverage/provider response | PARTIAL | R hosted address search/reverse passed: O01 recovered. SP hosted signed quote and sandbox booking/read/cancel passed; real rider callbacks remain |
| C20 | Voucher invalid/expired feedback, valid apply and combined points review | PASS | HF, B |
| C21 | Voucher caps, allowed products, usage/reward rollback and cancellation reversal | PASS | B actual SQL |
| C22 | Voucher wallet/rewards pages, filtering/copy/apply/retry and tier progress | PASS | Five HF checks plus W member account reads; B/W tier rejection, positive Gold controls and usage rollback passed: A44 |
| C23 | Account-scoped recommendations, history gate, ranking, diversification | PASS | B, HF |
| C24 | Order Again review, repricing, incompatible options, unavailable product, existing bag retention | PASS | B, HF |
| C25 | Order tracking states, cash-ready notice, private collection QR, payment-review notice | PASS | HF, B |
| C26 | Signed guest grants and account-owned order access; cancellation authorization | PASS | B, R rejection paths; W actual grant permits owner, fresh guest receives 403 |
| C27 | Customer cancellation of unpaid orders, reversal/expiry idempotency | PASS | B; W cash/Maya orders cancel idempotently, no active reservation or physical stock change |
| C28 | Paid-cancellation review and Maya return/verification/security states | PARTIAL | B passed; W/SP hosted checkout reuse and signed provider cancellation return passed. Success CAPTCHA blocked; decline/expiry/refund/settlement/callback remain |
| C29 | Support form subject/message, failed-save retention and retry | PASS | HF, B; W actual customer support create/read/ownership, visible to actual Admin, cleanup |
| C30 | Required profile phone, invalid contact, failed save, normalized retry and reload | PASS | HF rejects missing/malformed phone, preserves failed saves and normalizes retry; W actual customer update and reload |
| C31 | Password mismatch, failed current-password verification, successful change/field clearing | PASS | HF, B; W actual temporary customer's current-password change, old auth rejected/new accepted; account cleaned up |
| C32 | Address missing destination, map selection, create/reload, address text editing | PASS | HF; W actual owner create/read, other customer read/update/delete rejected |
| C33 | Saved address label renaming | PASS | HF and W rename/reload retained new label: F01 repaired |
| C34 | Address removal cancellation, failure feedback and retry | PASS | HF |
| C35 | Customer registration required phone, mismatch, save failure/retry and verification navigation | PASS | AF blank/malformed phone cannot submit; valid phone normalized before intercepted Auth; failure/retry/navigation passed |
| C36 | Forgot-password error retention/retry and resend cooldown | PASS | AF |
| C37 | Real verification/recovery email and real emailed reset-link password update | PARTIAL | AF UI passed; email/provider flow not performed |
| C38 | Authenticated routes, account isolation and logout removes private cart | PASS | HF, B; W actual customer login/account views and logout/private gates; A approved staff/Admin |
| C39 | Real customer-role cloud permissions and owner writes | PASS | W two real temporary customer identities, owner profile/favorites/address/support writes; cross-account and privileged changes rejected; cleanup verified |
| C40 | Current Terms/Privacy, contents navigation, archive, unknown-version 404, acknowledgement revision | PASS | HF, B, R |
| C41 | Public offline menu reload, product/cart draft edit, notes and document preserved on reconnect | PASS | PWA, HF |
| C42 | PWA excludes private/API/payment/auth pages from cached content | PASS | PWA, B |
| C43 | Installed Android/iOS app, background/foreground, device-specific permissions | PARTIAL | Desktop viewport/service-worker simulations passed; real phones not exercised |
| C44 | In-app ready notice/QR visibility and ready-order alert ownership | PASS | HF, B tested notice/grant paths; audible sound not physically verified |
| C45 | Background push configuration and actual delivery | PARTIAL | F06 production keys and service-only Vault worker configured; cron completed and worker returned HTTP 200. B authorization/lease/revoke passed; physical phone delivery remains |
| C46 | Customer accepted-ticket browser print action and printed identifiers | PASS | R hosted print invoked once, order number/items/total retained and action hidden: F11 repaired. No physical printer |
| C47 | Delivery recipient phone required before pricing/provider work | PASS | HF review validates contact; B server rejects empty/space-only/malformed phone before pricing/writes and normalizes valid contact |

## Staff / POS

| ID | Feature/path and tested behavior | Result | Method / remaining scope |
| --- | --- | --- | --- |
| P01 | Real approved staff login, protected Register/Orders/Cancel pages and logout | PASS | A |
| P02 | Guest/customer rejection, unapproved staff pending approval, approved Admin access | PASS | HF role identities, B database roles |
| P03 | Staff signup mismatch, failure/retry, email verification redirect | PASS | AF |
| P04 | Staff recovery request error/retry and check-email page | PASS | AF; actual email not sent |
| P05 | Register 55-product fixture, categories/search, one-tap additions | PASS | HF, LF |
| P06 | Required options, modifiers, option paging and configuration availability | PASS | HF, B |
| P07 | Line identity, note/option separation, merging, quantity and undo | PASS | HF, B |
| P08 | Long ticket, fixed primary actions, desktop/tablet/phone layout | PASS | HF, LF |
| P09 | Draft refresh/navigation recovery and customer/loyalty association | PASS | HF, B |
| P10 | Account QR lookup and linked customer/points | PASS | HF, B; W actual temporary customer QR resolved by approved cashier to same identity/points; customer-role lookup rejected. Physical lens remains P21 |
| P11 | Park/save/edit/resume, no early stock reservation, current-price/stock revalidation | PASS | HF plus actual isolated SQL |
| P12 | Cash checkout amount/acknowledgement, change and receipt | PASS | HF plus actual isolated SQL |
| P13 | Invalid tender/changed totals/stock shortfall leave no partial sale | PASS | B, HF |
| P14 | Lost checkout/park response, retry, duplicate keys and canonical receipt reuse | PASS | B, HF |
| P15 | Native simultaneous cash/customer orders contend on real stock locks | PASS | B native PostgreSQL |
| P16 | Orders progression accept/preparing/ready; consume once and terminal actions | PASS | HF, B |
| P17 | Scheduled/future/active queue separation and preparation due gate | PASS | B, HF tested queues; hosted scheduling unavailable |
| P18 | Pickup readiness/payment/token ownership, reuse rejection | PASS | B, HF |
| P19 | Mobile cash QR handover requires tender; retry awards once | PASS | B, HF |
| P20 | Scanner starts camera stream, stops tracks on close, denied camera/manual-code fallback | PASS | HF; QR actual decoder reads generated pixels at 0/90/180 degrees, submits once and stops tracks |
| P21 | Physical camera scan of actual customer QR on defense hardware | PARTIAL | Transaction/code and synthetic-camera paths passed; optical scan not performed |
| P22 | Manager PIN void, null/incorrect/forged actor rejection, refund-review and stock consequences | PASS | B, HF |
| P23 | Delivery cannot use pickup path; paid delivery dispatch/tracking/rider/completion UI | PARTIAL | B/HF provider fixtures passed; SP actual sandbox quotation/booking/read/cancel passed. Rider progression and hosted provider callbacks remain |
| P24 | Maya payment/reconciliation states and staff forwarding of identity | PARTIAL | B/HF; W/SP hosted checkout reuse, cancellation return, actual POS/Admin Realtime and unpaid cancellation passed. Paid outcome/settlement remains blocked |
| P25 | TV public projection, connected updates, offline/reconnect behavior | PASS | B, HF protocol fixture; R public TV page |
| P26 | Register/Orders/Cancel/Payment guides, focus and shortcuts in tested journeys | PASS | HF |
| P27 | Receipt snapshot, accepted prices/tender, safe URLs and legacy unknown tender | PASS | B, HF |
| P28 | Physical receipt print/printer configuration | OUT OF SCOPE | User confirmed no receipt printer. Browser customer print tested separately in C46; POS receipt data in P27 |

## Admin

| ID | Feature/path and tested behavior | Result | Method / remaining scope |
| --- | --- | --- | --- |
| A01 | Real approved Admin login/logout and all 15 protected pages | PASS | A |
| A02 | Guest/customer/staff denied Admin UI | PASS | HF role fixtures; B role policies |
| A03 | Unapproved Admin denied Admin UI | PASS | HF approved/matching profile required; unapproved profile denied and metadata cannot grant access: F04 repaired |
| A04 | Overview routes/task links, sales/stock summaries and operation retry | PASS | HF, A, B; no production load guarantee |
| A05 | Sidebar phone navigation and responsive Admin layout | PASS | HF, LF |
| A06 | All 15 guides, Escape, focus restoration and related-task links | PASS | HF |
| A07 | All 20 tables, ten-record paging, bounds, keyboard controls, mobile footer | PASS | HF |
| A08 | Order/void server ranges, empty searches, filter reset and latest search wins | PASS | HF |
| A09 | Orders/history and representative row details | PASS | HF eight scenarios: all six order states, paid/failed/refunded, App/POS, pickup/delivery/takeaway/dine-in and legacy data; close/privacy toggle and repaired keyboard semantics passed: A43 |
| A10 | Menu edit/options, failed save retains inputs, confirmed save propagates catalog | PASS | HF actual isolated SQL |
| A11 | Implemented menu create/edit/archive/restore forms and their four tabs | PASS | HF/B product create, options/recipe/multiplier, confirmation cancel, option library once, add-ons, duplicate-ingredient rejection, save retry, archive/catalog exclusion/restore. Menu UI has no permanent-delete action |
| A12 | Category archive consequences, restore and cancelled deletion | PASS | HF |
| A13 | Category add/rename/description/duplicate validation/active toggle | PASS | HF actual isolated SQL, HEAD duplicate checks, confirmed deactivate/reactivate and reload. Positive deletion preservation also passed: A42 |
| A14 | Category Options normal opening/close | PASS | HF |
| A15 | Category Options accessible dialog/Escape | PASS | HF labelled dialog and Escape dismissal: F03 repaired |
| A16 | Voucher duplicate code, create/failure/retry, pause/reactivate and confirmation preview | PASS | HF |
| A17 | Voucher edit, per-item/whole-order caps, dates and transaction consistency | PASS | B; HF selected SKU requirement, percentage/fixed/max discount/min order/tier/date/usage cap, failed-save retention and retry, whole-order edit/remove SKU. Tier enforcement also passed: A44 |
| A18 | Stock item create, receive, waste, count, forecasts and cancelled confirmation retention | PASS | HF; real isolated SQL behavior B |
| A19 | Batches, movements, physical counts, demand forecast and recipe tables | PASS | HF table/reads, B transaction logic, A actual read |
| A20 | Recipe replacements, same-ingredient/zero-sugar, size multipliers and immutable accepted requirements | PASS | B, HF availability |
| A21 | Shared menu recipe form and option-recipe editor/save/remove | PASS | B; HF base recipe/multiplier in MenuItemForm, option ingredient replacement, size multiplier, failed RPC retention/retry and mapping removal |
| A22 | Stock activation rejects incomplete setup, stale counts, active orders and missing recipe/unit data | PASS | B, HF; actual readiness missing counts noted in F05 |
| A23 | Expiry allocation, reservation reallocation/shortage, restock behavior | PASS | B, HF propagation |
| A24 | Supplier creation, purchasing review/approval/ordered/partial receipt | PASS | HF; real isolated SQL for approval/order/receipt |
| A25 | Receiving quantity limits, duplicate references/keys, concurrent duplicate physical receipt | PASS | B native and migrated SQL |
| A26 | Purchase positive create/edit/cancel, all supplier fields and receipt failure UI | PASS | B/HF all supplier create/edit/active fields, pack conversion and draft edit without movement, cancel failure/retry, blank reference/over-receipt gates, failed receive/retry and full once-only receipt |
| A27 | Forecast sparse/weekday demand, calendar zeros, expiry risk and pack rounding | PASS | B |
| A28 | Incoming stock, generated drafts, manual edit preservation and forecast refresh | PASS | B, HF |
| A29 | Branch settings confirmation/cancel/save, schedule page and database booking rules | PASS | HF, B, A page reads |
| A30 | Complete hours/closures/capacity/production verification + customer scheduled booking | CONFIG GAP | F05 actual live settings incomplete. HF/B full isolated setup passed: uncounted rejection, counted verification, seven weekdays/closures/capacities, real SQL slots; customer scheduling UI passed separately |
| A31 | Staff request approve/decline, role changes, self-lockout and failed-save recovery | PASS | HF, B; hosted accounts only read |
| A32 | Loyalty integer validation, zero floor, balance preview/cancel and failure retry | PASS | HF, B |
| A33 | Manager void PIN change confirmation/cancellation | PASS | HF; no real PIN changed |
| A34 | Customer-care review failure retention/retry and audit data reads | PASS | HF actual isolated SQL, A read |
| A35 | Provider reconciliation forms, actual paid association/refund and late-event recovery | PARTIAL | HF both Maya/Lalamove forms: blank disabled, trimmed ID, failed read retains input, retry association notice. B attempt logic and SP provider connectivity; actual paid association/refund/callback still unverified |
| A36 | Analytics Today/Week/Month/Annual, bestseller/margin tables, CSV downloads | PASS | HF, A page read |
| A37 | Analytics PNG download | PASS | HF generated/downloaded file |
| A38 | Margin/Demographics/Traffic drilldowns open/data/normal close | PASS | HF |
| A39 | Analytics three drilldowns dialog semantics/Escape | PASS | HF labelled dialogs, Escape and focus restoration: F03 repaired |
| A40 | Margin failed-read error/retry/dismissal | PASS | HF unavailable read remains dismissible; retry recovers and Escape restores focus: F02 repaired |
| A41 | Audit/void log pagination and recorded-change detail | PASS | HF, A |
| A42 | Positive category deletion preserves linked products uncategorized | PASS | HF/B every forward migration plus W hidden archived fixtures: SET NULL preserves product, option and recipe; fixtures removed: F09 repaired |
| A43 | Order Details labelled dialog and Escape dismissal | PASS | HF all six states render, labelled dialog closes with Escape: F03 repaired |
| A44 | Voucher target-tier restriction for member/guest authoritative pricing | PASS | B validation/pricing/SQL tier checks, Gold controls and usage rollback; W future voucher rejects Bronze/guest without sale or usage: F10 repaired |
| A45 | Error, invalid-form, confirmation and saved-action toasts | PASS | HF dismissible notices, first invalid-field focus/input preservation, duplicate collapse and focused-phone pause; saved/error/confirmation fixtures |
| A46 | Required red asterisks and optional form labels | PASS | HF rendered markers/colour, phone layouts and conditional requirements across all three apps |

## Cross-system and deployment

| ID | Feature/path and tested behavior | Result | Method / remaining scope |
| --- | --- | --- | --- |
| X01 | Three production builds and TypeScript | PASS | Fresh local checks |
| X02 | Hosted `/staff` and `/admin` mounts and served customer app | PASS | R, A, HF |
| X03 | 29 API route-file inventory and tested unauthenticated/error paths | PASS | Source inventory, R 36 probes and B routes; happy paths scoped elsewhere |
| X04 | Private cache headers/guest grants, ownership, origin checks and sanitized errors | PASS | B, R |
| X05 | Actual anonymous private tables expose no records | PASS | R: nine private-table boundaries |
| X06 | Actual public catalog hides operational cost/token fields; stock balances nonnegative | PASS | R |
| X07 | Migration compatibility, original-record/backfill preservation and one-time loyalty | PASS | B; not a new hosted backup/restore exercise |
| X08 | Cross-app stock contention/idempotency/receiving/stale counts | PASS | B native PostgreSQL |
| X09 | Cross-app Realtime catalog/order propagation and reconnect | PASS | HF protocol fixture/reconnect; W unpaid orders appear in open POS/Admin and approved staff receives actual events |
| X10 | Actual hosted timing, load/soak and scheduler job execution | PARTIAL | W unpaid order/cancel connection passed; push cron completed with HTTP 200. Paid preparation/collection, sustained load/soak and staging restore remain |
| X11 | Repository lint | PASS | F08 repaired: maintained-source lint zero errors/warnings; copied MapLibre distribution excluded |
| X12 | Production dependency advisories | PASS | F07 patched: production npm audit zero vulnerabilities |
| X13 | Full development/build dependency audit | PARTIAL | Nine advisories: seven high, two moderate; separate from zero-vulnerability production audit. Major tooling remediation disclosed |

The [evidence index](../../output/defense-fixes-2026-10-13/audit-evidence.json) records 120 backend results and all final individual-check groups. [Route inventory](../../output/defense-fixes-2026-10-13/route-inventory.md) lists 54 pages and 29 API files. Main browser suites contain further assertions/screenshots. Counts overlap features and do not measure exhaustive coverage; partial/configuration rows remain defense gates.
