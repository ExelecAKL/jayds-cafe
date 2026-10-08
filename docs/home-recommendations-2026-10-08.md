# Home recommendations — 8 October 2026

Home now has Order Again and one discovery section. The discovery heading alternates between Just for You and Try This on Home visits; its algorithm and heading stay stable during refreshes. Guests and accounts without paid, completed orders see neither section. The featured carousel, rewards, saved favorites and active-order updates remain available.

Order Again shows up to four distinct available products, newest purchase first, and reviews one unit using the latest purchased options. It reloads the current menu and checks configuration availability before review and again before adding. Changed prices are explained; changed or unavailable options lead to customization. Existing bags are preserved, and no order or payment is submitted by these controls.

Discovery excludes every previously purchased product ID and unavailable or unpublished products. Candidates receive 70% tag Jaccard similarity and 30% category match, weighted by distinct purchase frequency and recency with a 60-day half-life. Similarly scored categories are diversified; ties use catalog sort order and product ID. Explanations identify the contributing purchased product. Empty or unrelated results are hidden. Favorites, other accounts and legacy CSV imports are not recommendation signals.

The authenticated GET /api/customer/recommendations derives its customer from verified authentication and uses a server-only SQL history aggregate. All eligible account-linked app and POS orders are included, without the previous ten-order Home preview or 200-order analytics limit. Unpaid, cancelled, refunded and parked orders are excluded. Private responses use no-store and remain outside service-worker caches. Account changes invalidate old responses and reorder operations; completion, catalog changes, Home visits and reconnection refresh the recommendations. Only the harmless heading counter is stored in session storage.

Migration `20261008000100_customer_recommendations.sql` adds one partial history index and one service-role-only read function. The linked database rollout succeeded with hashes preserving orders, order items, profiles, ingredients, vouchers, favorites, batches, reservations and stock movements.

## Verification

- All 115 regression tests passed, including the isolated 255-order history fixture, app/POS inclusion, distinct-order frequency, half-life math, RPC permissions, owner-derived API queries and late account-response isolation.
- Customer production build, customer/script TypeScript checks and changed-file lint passed.
- The isolated customer browser demo passed at 360×800, 390×844, 430×932, 768×1024, 834×1112, 844×390, 1024×768, 1180×820 and 1280×900. It verified history gating, Home-only sections, heading rotation and stability, 48px reorder controls, repricing during review, stock/configuration recovery, existing bags, API retry and offline recovery. Existing menu, checkout, vouchers and rewards checks passed with zero runtime errors.
- The real service-worker test passed private-cache exclusion including the recommendations endpoint, offline public menu/product reload and draft recovery. This does not establish installed-device Android/iOS behavior.

Release verification is recorded in `.codex-logs/customer-browser-verification.json`, `.codex-logs/customer-pwa-browser-verification.json` and the hosted recommendation report when deployment completes. Test fixtures place no real orders and complete no provider payments.
