# Customer survey usability fixes — 18 October 2026

Registration limits the mobile field to eleven digits, normalizes a Philippine country-code paste, and validates customer mobile numbers before signup. The strength meter shows one red, two yellow or three green segments, with an accessible text label. Existing password requirements remain unchanged. Successful registration and sign-out use a persistent, dismissible status toast.

The bag now owns order notes, vouchers, rewards points and pickup/delivery selection. Checkout presents those saved selections without repeating their editors. Voucher discovery has a full action card, the folded order-note row is compact, and each screen size has one checkout action. Item photos and estimated included VAT appear in checkout; final review uses the existing server-verified financial quote. VAT is not added to existing prices.

Bag, checkout and final review show estimated points to earn, using the current paid-completion loyalty rules and tier multiplier. The estimate uses the total after discounts and redeemed points; delivery is included where the existing rule includes it. Guests see an explanation instead of promised points. Empty orders do not show an award. This display does not credit balances or alter the server's award logic.

Selecting Place order opens a five-second countdown with a cancel action. No submission request or durable attempt is created before it finishes. Cancelling, leaving the page or hiding the document stops it. Existing idempotent recovery remains in place for uncertain submissions.

Address results move the delivery pin; moving the pin fills its address without changing the exact selected coordinates. Manual edits invalidate the prior match. Unavailable searches retain manual confirmation as a fallback, with coverage validation and stale-response fencing. GPS remains an explicit action. Saved-address editing uses the same picker.

The menu emphasizes names and prices on desktop. The duplicate Home orders action is removed; favorite controls remain on product details as previously requested. Guest ordering remains available, with a clear checkout explanation and a bag entry in the header. Closed operating hours or closure dates produce a modal when selecting an item, with homepage and menu actions. Unknown/unconfigured hours are not invented.

Sign-out requires confirmation. Customer dialogs keep keyboard focus within their controls, support Escape where cancellation is allowed, and preserve busy-state locks. Errors and warnings use stronger rust/brown styling with an icon.

Implementation: `04ee5aa72039ca2cfd969b94b5cdae7669cd1596`. Rollback: `pre-survey-ux-2026-10-18`, pointing to `ea15c5372605cb6830fe948254c85f9d1f42f2cf`; the points-only rollback is `pre-order-points-2026-10-18`, pointing to `290b52dbb543d15366790198e9375c7ba38e9b17`.

| Check | Result |
| --- | --- |
| Backend regression suite | PASS: 194 tests |
| Final focused phone, password, operating-hours and loyalty-preview tests | PASS: 5 tests |
| Customer, POS, Admin, shared package and script type checks | PASS |
| Changed-file lint | PASS with one pre-existing shared Auth cleanup warning; final follow-up files have no warnings |
| Vercel production build with public domain held | PASS |
| Final staged browser interactions and direct accessibility checks | PASS: 320/390/768/1280px layouts, exact meter colors, guest and account rewards flows, earned-point estimates in checkout and final review, countdown cancellation/one submission, address races/fallback/coverage, closed modal, sign-out cancel/Escape/Tab/confirmation; zero axe violations on registration, bag, guest checkout and member checkout |
| Public alias and read-only HTTP smoke | PASS: verified deployment identity, six customer pages, branch data and 404 for an unknown order |
| Physical phones, assistive screen-reader software and real customer payment/delivery operations | NOT TESTED in this release |

Browser checks use intercepted catalog, account, order, quote and provider fixtures. They do not create hosted orders, signups, financial records or bookings. Earlier browser attempts exposed ambiguous test selectors and a keyboard focus issue; the selectors and dialog handling were corrected before final verification. An initial accessibility check found low-contrast password requirement text; its color was darkened.

The requested MCP investigation was stopped when the user asked. No complete MCP certification is claimed. Final validation uses direct browser interaction and accessibility checks. This release contains Customer changes and customer signup validation; unrelated local Admin work is excluded.

The public site is [jaydscafe.vercel.app](https://jaydscafe.vercel.app), pointing to deployment `dpl_D2nz1PzazaFXgWKfWgwuikLYtyuf`. Sanitized results and private-log hashes are in the [release evidence](evidence/2026-10-18-customer-survey-ux.json).
