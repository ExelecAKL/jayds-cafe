# Admin and Customer Help audit checkpoint

Tested application commit: `e712e2cb54b47fd3ba4303bd6035e81638dd45a8` on `codex/discrepancy-finance-2026-10-13`.

**Result: the completed checks pass. This is a local software checkpoint, not the final defense sign-off or a hosted release.** This commit’s application changes and new migrations are not live on the hosted site. The previously audited mobile-menu release remains live separately.

## What changed

| Area | Result and evidence |
| --- | --- |
| Admin loading | **PASS.** Stalled profile, catalog, audit and product-detail reads stop waiting and recover through in-page retry. Tests use real elapsed deadlines. Unverified profiles cannot open Admin; failed recipe loading cannot save an empty recipe. |
| Overview and navigation | **PASS.** Figures precede compact actions; related pages are grouped and only the current page is active. Orders, categories and the recipe editor retain their established structure. |
| Menu photographs | **PASS.** Upload, preview and removal replace URL entry. Oversize/invalid files fail clearly; failed uploads retain edits. The API requires current approved Admin access, decodes actual bytes, removes metadata and writes a generated path. Configured public Admin origins work through the mounted deployment route; unrelated origins are refused. |
| Stock investigation | **PASS.** Movements, waste and counts open details with actual linked orders, actors, batches and source records where present. Linked order details return to the stock record. Missing legacy references are not fabricated. |
| Stock planning | **PASS.** A shorter table opens usage and projected-balance charts, 7/14/30-day controls and an equivalent numeric table. Forecasts retain existing calendar/weekday methods. Delivery projections include scheduled outstanding purchases. Sparse or stale data is identified. These are estimates, not measured prediction accuracy. |
| Purchase suggestions | **PASS.** Refresh changes forecasts only. Draft creation requires reviewed quantities; changed suggestions are rejected and manually edited drafts are protected. Creating a draft does not add stock. Purchasing stages filter the actual purchase list. |
| Hours and vouchers | **PASS.** Aligned opening-day rows, a 1 PM–10 PM shortcut for already-open days, grouped pickup limits and secondary branch settings. No open weekdays or capacities are invented. Voucher restrictions sit in a disclosure; save validation, tier/date/cap rules and failure retention pass. |
| Help | **PASS.** Customer Help offers short answers, order links, a private form and owner-scoped history/retry. Admin separates requests from payment/delivery tools; private replies open in a drawer. Empty request filters have a clear state. |
| Export | **PASS.** Group/table selection, CSV ZIP and JSON downloads, contents manifest, frozen snapshots and 500-row pagination. A 1,205-record fixture survives source changes without omission. Tests cover failed reads/retry, empty selection, current approved-owner checks, revocation, expiry, nested credential redaction and spreadsheet formula safety. The actual downloaded ZIP was opened independently and every row count matched its manifest. Authentication records/secrets, credential-only tables and private file bytes are explicitly excluded. |
| Layout and motion | **PASS.** New Admin screens checked at 1440, 834 and 390 px; Customer at nine widths. Drawers/modal feedback use restrained motion with reduced-motion support, Escape dismissal and keyboard containment. A tablet overflow and focus loss following a failed save were found and corrected. |

## Regression results

| Check | Result |
| --- | --- |
| Complete backend suite | **PASS: 151/151**, no failures or skips. Includes production-schema migrations, permissions, native PostgreSQL concurrency, financial snapshots/invoices, refunds, OSD boundaries and stock safeguards. |
| Latest photo API origin check | **PASS**, including the configured public `/admin` origin after an upstream rewrite. |
| Detailed Admin forms/dialogs | **PASS: 21/21**; categories, all product tabs/options/recipes, suppliers, purchases, receiving, vouchers, scheduling, provider-reference recovery, order states and toasts. |
| Combined Admin/POS/finance browser suite | **PASS**; 55-product cashier coverage, lost-response retries, parked edits, order progression, pickup, manager void, invoices, expenses and reversals. Provider responses and data are isolated fixtures. |
| Customer browser suite | **PASS**; 55 products, 9 widths, customization, checkout retries, required contact, Help failure/retry, favorites and automatic return to menu after adding. |
| Real service-worker/offline suite | **PASS**; public-only cache, offline reload/draft editing and reconnection preserve the draft; 138 cached resources, no runtime errors. |
| Customer motion suite | **PASS**; responsive geometry, focus interruption, reduced motion and published carousel fixtures. Local timings do not establish production performance. |
| Builds, types and lint | **PASS** for all three production builds, full TypeScript checks and full lint. Focused checks were repeated after later corrections. |

Initial test failures included missing platform storage fixtures, an ambiguous locator and simulated-clock timer ordering; fixtures/locators were corrected and timeout recovery was repeated with real time. The discovered application overflow and focus-recovery defects were fixed and rechecked. No unresolved failure remains in these completed checks.

## Remaining scope and direct checks

**NOT TESTED / not yet implemented:** server aggregation and Philippine date/hour corrections for the older Sales Reports workspace; the shared read-only quote endpoint; expense-document uploads and stock-purchase input-VAT reconciliation; remaining Customer interaction refinements. These remain on the implementation checklist and are not covered by this checkpoint's pass claim.

**BLOCKED on operator configuration or direct checks:** fresh physical counts, pickup capacities/closure dates, delivery-fee tax treatment and owner tax inputs; physical phone installation/background push, actual webcam QR capture and complete external payment/refund/delivery outcomes. The disconnected phone and ZUS exploration were not restarted. Invoice authority remains the owner's reported RDO confirmation, distinguished from independent authorization verification.

**NOT TESTED:** hosted behavior of this new commit and its new migrations. Publication and a hosted check follow the release audit. A passing nearby fixture is not a substitute for any of the above checks.

Compact evidence and source hashes: [checkpoint evidence](evidence/2026-10-16-admin-ux.json). Raw local browser logs/screenshots remain in the ignored `.codex-logs/` directory; designated-account credentials and invoice registration files are excluded from source control.
