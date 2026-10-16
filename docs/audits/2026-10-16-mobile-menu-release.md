# Mobile menu release — 16 October 2026

Application source: `96333b830a0294be7ba22b78649c08c81b2ff623`, based on production main `457f2c701b02cd589f3b6df640f899716b0e0d5c`.

- Sold-out prices stay visible in readable grey, with the Sold out label retained.
- Favorite hearts appear on product details; menu cards and the menu header no longer show them.
- Add to bag saves the chosen quantity/options/notes and automatically returns to the menu. The green confirmation panel is removed. The saved category/search position and cart remain available. Offline navigation waits for draft persistence and uses the real cached menu document.

## Verification before domain promotion

| Check | Result |
| --- | --- |
| Local Customer build, app/shared type checks and changed TypeScript lint | PASS |
| Customer browser journeys | PASS — 55 products, nine widths, sold-out grey price, detail favorites, automatic return, vouchers/points, retry and cart preservation; zero runtime errors |
| Real service-worker/offline browser journey | PASS — public-only cache, automatic offline return, saved draft/reload and reconnection retain the draft; zero runtime errors |
| Exact Vercel release build | READY — `dpl_S36hPizqYGg97PwzPFTspxka6xk2` |
| Customer journeys against that protected Vercel build | PASS — same 55 products/nine widths, three checkout requests produce one canonical fixture sale, zero runtime errors |

Tests use isolated business/provider fixtures and perform no real sale, payment or stock mutation. The deployment bypass credential is restricted to the audited deployment origin and is not written into these reports.

The earlier preview attempt was not executed because usage limits prevented automatic approval review. After the operator requested continuation, review succeeded and the exact-deployment browser audit passed. This was a review availability failure, not an unsafe-action determination.

## Scope and rollback

This release includes only the mobile menu/navigation fixes. Unfinished finance/invoice migrations, Admin improvements and the wider defense audit remain on the separate implementation branch. No database migration is required or applied for this release.

Previous Customer deployment: `dpl_CRUTaNSArgYonL1abnYBqFRuc1H7`. Previous source main is preserved by tag `pre-mobile-menu-2026-10-16`. The release branch is retained for reference. This focused release is not the final defense sign-off.
