# Jayds Café combined release audit — 17 October 2026

Application source: `622655c7e0503f1950396b2d272727d389fa3483`.
Backend regression source: `baf9b9f` (backend unchanged by the final UI commit).

**Software checks pass within the coverage below. Complete defense sign-off remains BLOCKED on the listed operator, device and provider checks.** Passing simulated payment or camera checks does not certify physical hardware or a settled external transaction.

## Discrepancies and corrections

| Finding | Status | Correction and verification |
| --- | --- | --- |
| Catalog query timed out after the history import | PASS | Stop enumerating customization combinations when a required, nonreplaceable ingredient is unavailable. Check the smallest possible size before rejecting a product; valid milk replacements remain possible. Production-schema tests cover each case. The live catalog returned successfully in 2,936 ms in the measured read. |
| Slow stock history and purchase reads | PASS | Add timeline/source indexes and a protected purchase aggregation endpoint. The actual Admin endpoint returned all 2,410 purchase orders. Movement reads fell from 5,651 ms before the indexes to 670 ms afterward in sequential spot checks. These are individual observations, not a sustained-load benchmark. |
| Forecast queries repeatedly expanded old recipes | PASS | Aggregate usage once, materialize only legacy orders without recorded requirements, and retain recorded usage for imported orders. Existing 7/14/30-day methods and calendar safeguards remain; old/new forecast equivalence passed. Actual stock outlook read: 1,545 ms. |
| Unrelated pages repeatedly loaded stock/purchase history | PASS | Limit operations reads to the pages that use them, poll visible pages every 60 seconds, and coalesce concurrent refreshes. Browser checks prove Categories performs no unrelated stock/purchase reads and a focus-event burst shares one active read plus one fresh follow-up. |
| Indefinite or plain loading screens | PASS | Bounded reads and in-place recovery for profile verification, catalog, audit, product editor and Categories. Category retry retains typed entries. Failed product loading cannot save empty recipes. Branded Admin/POS opening states and shared skeletons replace the affected plain loaders. |
| Sold-out cards retained colorful artwork and buttons | PASS | Grey artwork, text, prices and Details buttons together; Details remains accessible. Latest public check verified all six currently sold-out cards. |
| Duplicate password reveal control in Edge | PASS | Suppress Edge's native reveal control while retaining the accessible shared toggle. Twelve fields across Customer, POS and Admin passed keyboard/pointer, masking, preserved-value and no-submit checks in Edge. Screenshot inspected. |
| Whole Milk appeared to require a paid substitution | PASS | Included Whole Milk is the shared zero-price default; Oat/Almond remain optional +₱30 substitutions. Availability never silently chooses a paid replacement. Canonical recipes and extra-shot stock consumption are tested. Actual public Coffee Latte opened with Whole Milk selected. |
| Customer add-to-bag and Account details | PASS | Add returns automatically to the menu; favorites remain on product details. Compact folded QR, revised Account/sign-out copy, required phone and persistent form labels pass Customer browser checks. |
| Startup sequence | PASS | Logo configured for 2,500 ms, then the banner waits for actual catalog completion. Cup icon and old sentence removed. The latest hosted browser observed 2,966 ms including observation/render overhead and successfully waited through an intentionally delayed catalog. |

The screenshot's catalog timeout was a real database query failure. Later DNS checks also temporarily failed for the app, Vercel and Supabase hostnames. DNS recovered and ten fresh staff/Admin login, read and logout checks passed. The user has only tested laptop/Wi-Fi; a mobile-data comparison and the underlying network cause remain unverified. Database activity/cron diagnostics could not connect during the outage, so no lock, cron or provider-incident cause is asserted.

## Application coverage

| Area | Result | Scope and evidence |
| --- | --- | --- |
| Customer catalog/customization | PASS | 55 fixture products at nine widths; category navigation, stock failures, defaults, paid options, cart edits, repricing and automatic return after add. Published catalog separately checked with real public data. |
| Customer checkout and Help | PASS | Required phone, review quote, VAT breakdown, vouchers/points, lost-response retry, private Help submission/history and recovery using isolated SQL/provider fixtures. |
| Customer recommendations and motion | PASS | History-gated ranking, cached-draft recovery, carousel swipe/pause, stable geometry, keyboard focus and reduced motion. Timings and CLS are controlled local observations. |
| Real browser service worker | PASS | Public-only caching, offline reload/edit, retained draft/notes and reconnection; 138 cached resources. Remote writes denied in the fixture. |
| POS | PASS | 55-product cashier coverage, quote reconciliation, cash, parked edits, pickup, order progression, manager void, duplicate/lost-response recovery and permission checks. Provider results are fixtures unless explicitly identified as live. |
| Admin forms/dialogs | PASS | 22 detailed Admin checks plus the UX journeys: product tabs/options/recipes, categories, suppliers, purchasing/receiving, vouchers, scheduling, provider recovery, orders, dialogs, validation and toasts. |
| Stock investigation/planning | PASS | Movement, waste and count details expose recorded references and connected orders. Usage bars, projected-balance lines and equivalent tables support 7/14/30 days. Refresh and reviewed purchase-draft creation are separate. Sparse/stale/estimated usage is identified. Forecast accuracy against real café demand is NOT TESTED. |
| Menu photo upload | PASS | File selection/preview/removal, byte validation, size limit, metadata removal, approved-Admin/origin checks, failed upload retention and retry. |
| Purchasing | PASS | Draft/approve/order/receive, partial quantities, receiving history, cost snapshots, duplicate guards, supplier-invoice VAT review and reversal. Purchases do not also become operating expenses. |
| Sales Reports | PASS | Server aggregation beyond 200 orders, Philippine dates/year boundaries, 1 PM–10 PM operating window, alternate browser timezone, charts, drilldowns and equivalent tables. Global CSV moved into Export. |
| Export | PASS | Group/table choices, CSV ZIP and JSON, frozen snapshots, pagination over 1,205 fixture records, independently opened ZIP, manifest reconciliation, failed-read retry, permissions/revocation, credential redaction and spreadsheet-formula safety. Auth secrets and private file bytes are excluded. |
| Finance and invoices | PASS for software behavior | Shared integer-centavo quote, immutable accepted breakdowns, VAT-inclusive totals, discount allocation, append-only sale/refund entries, linked credit notes, duplicate webhook protection and concurrent numbering. A ₱112 ordinary taxable sale reconciles to ₱100 sales + ₱12 VAT. |
| Expenses and tax estimates | PASS for software behavior | Private supporting-photo upload/access, expense posting/reversal, evidence-controlled input VAT, recorded COGS/write-offs and OSD bracket/boundary tests. Business profit and income-tax estimates remain separate; actual costs are not deducted again under selected 40% individual OSD. |
| SC/PWD | Removed by request | No eligibility verification or automatic statutory-benefit program is included in this release. |

Invoice issuance was enabled on the owner's explicit instruction and reported RDO confirmation that the supplied Form 2303 suffices. The application does not invent an ATP/PTU, VAT registration entry or official verification. Independent registration/format/serial compliance remains unverified. Income-tax estimates require the owner's complete inputs and recorded credits; they are not filed returns.

## Hosted history and preservation

The authorized current database contains the installed 20-month sample history, 16 February 2025 through 16 October 2026: **10,625 added orders**, seven plausible fictional suppliers, 2,410 purchase orders, 2,404 receipts, 86,754 movements, 261 counts, 607 shifts and 120 monthly operating-expense entries. The checkpoint total was 10,683 orders including 58 existing orders.

The guarded importer reconciled financials and stock, preserved existing orders/ledger/reservations, recorded before-images for 78 permitted existing-record updates and retained internal provenance. Ordinary business notes contain no thesis/demo labels. It made **zero provider calls**, created **zero push events** and issued **zero official invoices** for the sample history. Sample data must remain identifiable through internal provenance and must not be represented as actual historical café transactions or physical stock verification.

Private pre-import backups are saved locally under ignored `.codex-logs/`. They contain the public-schema backup, not Auth passwords or stored file bytes. No new backup data, credential material, registration images or provider keys is included in this release's source/upload set.

After the owner delegated the two missing prices, Nachos was set to **₱99** and Chicken Pop to **₱119**, VAT-inclusive. Only the two current menu prices and automatic audit/update metadata changed; stock and historical orders were not edited. The public catalog confirmed both products remain sold out. These are chosen entry-level prices, not a verified margin calculation. For context, a nearby [Q&Co Tanza merchant menu](https://www.foodpanda.ph/restaurant/g8h8/qandco-cafe-tanza) lists fries from ₱102 and chicken poppers from ₱135; portions and delivery pricing differ. Confirm portion cost when the products are restocked.

## Regression evidence

| Check | Result |
| --- | --- |
| Complete backend suite | **165/165 PASS**, zero failures/skips |
| Final loading/recovery and request-count journeys | **7/7 PASS** |
| Final Admin UX journeys | **5/5 PASS**, including 1440/834/390 px layouts |
| Edge password fields | **12/12 PASS** |
| Production builds | Customer/POS/Admin PASS; final Admin/POS rebuilt after the last changes |
| TypeScript | All workspaces and script checks PASS |
| Lint | Zero errors; one existing `useAuth` cleanup-ref warning remains |
| Actual public Customer | PASS; 53 currently published products, six grey sold-out cards, included milk, banner/loading and zero business writes |
| Final hosted Admin/POS | **16/16 PASS** through the main café domain: actual designated-account logins, populated menu/stock/purchases, both outlook charts, Categories, audit, Sales Reports, Finance, Customer Help, Export and logout; zero uncaught errors, failed REST reads or attempted business writes |

Sanitized evidence and log hashes: [release evidence](evidence/2026-10-17-combined-release.json). Earlier detailed checkpoints remain available in this directory; this report supersedes their unfinished implementation lists for the areas explicitly covered above.

## Remaining readiness gates

| Status | Requirement |
| --- | --- |
| BLOCKED — operator input | Fresh physical stock counts, pickup capacities and closure dates. The hours shortcut uses confirmed 1 PM–10 PM; it does not invent open weekdays. |
| BLOCKED — operator input | Confirm delivery-fee tax treatment, business registration/invoice configuration, owner income and tax credits/payments. |
| NOT TESTED — direct devices | Physical phone installation, background push, real keyboard behavior on the defense phones and optical scanning through the laptop webcam. No receipt printer is planned. |
| NOT TESTED — external outcomes | Complete real Maya payment/refund settlement and Lalamove booking/delivery outcomes. The sandbox city lookup is not a completed delivery. |
| NOT TESTED — performance | Sustained production load, field Web Vitals, all product/option permutations and statistical prediction accuracy. Spot timings and finite browser journeys are not an exhaustive proof. |

## Publication and rollback

Final Admin/POS source is `622655c`; the verified public Customer artifact is from `548779b` (subsequent application changes affect Admin/POS and database maintenance only). All required release migrations through `20261016001500_catalog_availability_scaling.sql` are applied. Vercel's production targets are READY and identify these source commits:

| Public entry | Deployment |
| --- | --- |
| [Customer](https://jaydscafe.vercel.app/menu/browse) | `dpl_5RGD4gAu1UYQCRWQG8pQrtupHQ7i` |
| [POS](https://jaydscafe.vercel.app/staff/login) | `dpl_Vrn5DDnQrGoLd2HzbiU7xSt2x3Pa` |
| [Admin](https://jaydscafe.vercel.app/admin/login) | `dpl_FdCiZ5sDm1Zc77pRNptqN3r5ryTi` |

Keep `main` as the current release and preserve previous `main` (`bece5f40023b32a865027e4d727007e3c008c926`) under `pre-wider-admin-finance-2026-10-17`. Git/Vercel rollback restores application code; it does **not** undo database migrations or sample records. Data rollback requires scoped maintenance using the private backup/provenance, preserving any newer real activity.
