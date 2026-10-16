# Customer milk, Account and startup audit

Tested Customer release commit: `fe5985952546fe6f1c04850aea2693eceb4c8dc2`. Equivalent wider-branch Customer changes: `476c7d4504a435f9cc73c4c10c8ff849d751c2ad`.

**PASS for the checks below. This checkpoint does not certify the entire discrepancy plan or the physical defense setup.**

| Check | Result |
| --- | --- |
| Startup | **PASS.** Logo alone for 2,500 ms; cup icon and “Getting your café ready” removed. Banner and loading dots then wait for session/catalogue readiness. A held catalogue request does not dismiss the banner after the former fixed fallback. Reads have deadlines and stalled startup offers recovery. |
| Customer regression | **PASS.** 55 products and nine widths (360–1280 px), category navigation, sold-out grey prices, favorites on detail only, automatic menu return after Add to Bag, cart/repricing/checkout fixtures, voucher/points review and recovery. Three checkout requests produce one canonical sale in the isolated fixture. No browser runtime errors. |
| Milk and historical orders | **PASS.** Free Whole Milk defaults; Oat/Almond remain optional paid substitutions. Historical reorders add an available zero-price Whole Milk default without changing the historical record or silently selecting a paid replacement. Targeted menu/cart/recommendation tests: 14 passed. |
| Actual hosted catalogue | **PASS.** Migration `20261013000300` applied and nine milk groups inspected in the public hosted mobile UI: Whole Milk selected, paid substitutions unselected. Existing orders, order items, stock quantities/batches/movements/reservations/requirements, profiles and vouchers preserved by transaction assertions. This is real catalogue verification, separate from checkout fixtures. |
| Account | **PASS.** Footer subtext removed, collapsed QR row compact, sign-out description updated. Authenticated fixture and screenshot checked. |
| Motion | **PASS.** Touch swipe in both directions, autoplay interruption, vertical scrolling, no accidental link activation, keyboard focus, reduced motion and five phone/tablet widths. Controlled local CLS 0.00155; this is not a production performance benchmark. |
| Offline/PWA | **PASS.** Real service worker, 135 cached public resources, offline reload/draft edits and reconnection preserve the draft. Private data excluded from cache; zero runtime errors. Actual Android/iOS installation remains unverified. |
| Build/static checks | **PASS.** Production Customer build, wider-branch full TypeScript checks and focused changed-file lint. |
| Lalamove credentials | **PASS for credentials only.** New sandbox pair saved locally and in Customer Vercel Production/Preview. Authenticated read-only PH cities request returned 200 with seven cities. No quotation, dispatch or delivery is established by that check. A new deployment is needed to activate the hosted values. |

**FAIL:** no unresolved failure in the checks above. Earlier harness and reorder failures were fixed before the passing run.

**NOT TESTED:** complete external payment/refund/delivery outcomes, physical phone installation/background push and webcam QR capture. No new phone/ZUS exploration occurred. Wider Admin, Sales Reports, finance/quote/document tasks and the coherent 20-month dataset are outside this Customer release. The full database backup is private and ignored; the dataset has not been loaded at this checkpoint.

**BLOCKED on operator/direct inputs:** actual physical stock counts, pickup capacities/closures, delivery-fee tax treatment, owner tax inputs and the remaining physical/provider checks. Sample history cannot clear these gates. This is not a clean defense sign-off.

Evidence hashes and compact results: [Customer audit evidence](evidence/2026-10-16-customer-startup.json). Raw logs, screenshots and all private configuration stay in ignored `.codex-logs/`.

## Hosted staging follow-up

The first Preview build failed because that environment did not contain the public Supabase settings. A Production-target deployment was then staged with `--skip-domain`, retaining the public site's existing alias during verification. That staged build passed.

A fresh anonymous browser used the actual hosted catalogue, delayed its read and inspected the result without creating orders or changing records. **PASS:** the configured 2,500 ms logo (2,930 ms observed from the first visible hosted frame, including hydration), no cup/old sentence, banner retained beyond the former fixed fallback, then 52 actual published products, free Whole Milk selected and Oat Milk unselected. No runtime errors or writes. The 55-product matrix above is a separate fixture dataset.

The initial probe was corrected to use normal hosted time, the menu browsing route, the actual catalogue count and the read-only configuration-availability RPC. Pausing browser time before hydration and expecting a Home page to contain menu cards were probe errors, not passing evidence.

Cross-page offline navigation is verified by `customer-pwa-browser.ts` with the real service worker installed. The general Customer fixture harness disables service workers to isolate remote writes; its former cross-page offline check depended on an incidental warm router cache and failed on the hosted run. That unsuitable check was moved out of its scope; its ordinary Add to Bag/return/cart assertion remains. The separate real-worker offline test passed and is the evidence for offline navigation/draft recovery.

**Final hosted fixture regression: PASS.** The complete 55-product/nine-width matrix passed against the staged Vercel build, followed by a passing local repeat with the same corrected harness. Three fixture checkout requests yielded one canonical fixture sale; Account/QR, milk defaults, return-to-menu, promotions, recommendations and recovery passed with zero browser runtime errors. Remote writes were intercepted into the fixture, not sent to the hosted business database.

## Publication

Published to `https://jaydscafe.vercel.app` as deployment `dpl_DnWYAGQBdREdi6j7X4aDEzVD87eC` after the passing audit. Promotion and explicit alias assignment succeeded. **Public post-deployment read-only check: PASS**, including the actual 52-product catalogue, loading sequence and milk defaults, zero writes/runtime errors. The deployment uses the updated Production Lalamove sandbox environment; a completed courier transaction remains untested by this release.

`main` contains the current Customer release and its audit. Previous main is preserved by `pre-customer-startup-2026-10-16` (`bf101ebef96a8fcac2583bfc5bef9fc64a63d13b`); the prior Customer deployment `dpl_S36hPizqYGg97PwzPFTspxka6xk2` remains the deployment rollback reference. Wider Admin/finance work is preserved on `codex/discrepancy-finance-2026-10-13` and is not included in this Customer publication.
