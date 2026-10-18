# Accepted ticket VAT and item photos — 18 October 2026

The customer order tracking ticket now shows a compact photo beside each accepted item, its saved included item VAT, and separately saved delivery VAT when applicable. Subtotal, discounts, delivery fee and payable total remain unchanged. Photos use the existing optimized image family and a small fixed layout, with a missing-image fallback.

The existing authorized order-details request reads the linked menu photo and immutable `order_financials` snapshot. It exposes only the item and delivery VAT centavos, not internal accounting fields. Names, options and prices remain the accepted order values. Archived linked products can still supply a photo. No additional menu-catalog request is needed to display ticket photos.

Tax is never reconstructed from current settings for old orders. Missing, inconsistent or temporarily unavailable snapshots display “Unavailable” without preventing the ticket from loading. A read-only check of the screenshot’s reference order confirmed its existing photo and saved item VAT of ₱9.64, with its accepted total unchanged.

| Check | Result |
| --- | --- |
| Six ticket API/snapshot cases and six existing financial-calculation tests | PASS |
| Customer and script type checks; changed-file lint | PASS |
| Hosted photo relation and reference order financial snapshot, without writes | PASS |
| Focused ticket browser at 320/390/768/1280px, photo fallback and print VAT | PASS |
| Vercel production build, with domain held until browser verification | PASS |
| Local production build | BLOCKED: process exhausted available memory; Vercel build used for verification |
| Physical printer and phone installation | NOT TESTED |

Implementation commit: `5e87155cd93ff3164a3b924ec8c64bff31b68b36`. Rollback tag: `pre-ticket-vat-photos-2026-10-18`, pointing to `def0062e4673f6da52c6b730872b9a82f9b6c0a7`. No database migrations, financial writes or provider configuration changes are part of this update.

The first staged browser attempt encountered Vercel SSO; subsequent checks used existing private automation access without changing protection. The extended Customer suite passed the ticket assertions but later timed out during sign-in while the browser displayed offline; that extended run is FAIL and is not certified. A fresh isolated sign-in and account QR check passed. Full backend and PWA suites were not rerun for this ticket display update. See [release evidence](evidence/2026-10-18-ticket-vat-photos.json) for sanitized browser results, deployment identity and private log hashes.
