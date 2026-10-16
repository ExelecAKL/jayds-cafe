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
