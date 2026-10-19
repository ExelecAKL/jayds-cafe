# Customer App verification · 18–19 October 2026

The Customer App remains mobile first. Its existing brand, original artwork, local fonts, four navigation destinations, carousel, rewards, favorites, fulfillment choices, product customization, cart and checkout capabilities remain. This iteration improves discovery, filtering, voucher selection, pinned delivery review, shared semantic feedback, transient notifications and the desktop bag hierarchy. No order or payment API was changed.

## Review

- App: [localhost:4000/menu](http://localhost:4000/menu)
- Phone on the same Wi-Fi: [192.168.18.7:4000/menu](http://192.168.18.7:4000/menu)
- [Before and after viewer](http://localhost:4015), using the same isolated catalog and bundled product images. Original captures came from the original source, which was restored to the enhanced source after capture. Both comparison versions have an empty guest bag.
- [Design decisions](customer-enhancement-reference-lock.md)

## Playwright checks

The focused enhancement journey passed product discovery, the carousel, pickup/delivery routing, product and category search, combined filters, empty-result recovery, saved search/filter/category state, customization, quantity, bag persistence and a visible desktop Review checkout action. Home and Menu had zero measured horizontal overflow at 320, 360, 390, 430, 768, 1024 and 1440 pixels. Direct Tab traversal verified that focused controls remain above the persistent mobile navigation. The fixture reported no browser runtime errors.

The toast journey passed the real bag restore flow at 320, 390, 430 and 1024 pixels. The captured entrance moved from above the viewport to the safe top margin. Automatic dismissal, animated manual dismissal, replacement timer isolation and reduced-motion behavior passed. The polite live region and close button remain. Bag success messages use the toast; inline errors and the undo action remain available.

Reproduce:

```powershell
node tests/customer-enhancement-browser.mjs
node tests/customer-toast-browser.mjs
node tests/customer-checkout-enhancement-browser.mjs
```

Raw focused reports and screenshots are in `tmp/customer-enhancement/`.

## UX/UI gates actually run

The MCP runner could not execute its Python gates (`python3` resolves to a Windows Store stub), and its render gate reported Playwright missing. The repository's equivalent gate scripts were run with the installed Python and Playwright. A fixture adapter makes their file entry points render the actual hydrated app; their assertions remain unchanged.

| Gate                    | Measured result                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axe_audit`             | Home and Menu: `OK: 0 violations.`                                                                                                                                  |
| `verify_states`         | Home: 107 element-states checked; Menu: 123 checked. Both printed that every interactive element passes their default, hover and focus checks after contrast fixes. |
| `verify_responsive`     | Both: no horizontal overflow at 280/320/414 pixels with a 1.25 root-font scale.                                                                                     |
| `verify_keyboard`       | Home: 32 controls; Menu: 41 controls. Reachability and operation checks passed.                                                                                     |
| `verify_target_size`    | Home: 62 targets; Menu: 80 targets at 414/1280 pixels. Printed that targets met the threshold or an exception.                                                      |
| `verify_mobile_first`   | Both base layers rendered at 320 pixels with width media/container rules removed. Passed.                                                                           |
| `verify_reduced_motion` | Both: policy present, motion stopped, no content lost.                                                                                                              |
| `verify_screen_economy` | Both: media bounded, no hollow boxes, heading/action present, images sized.                                                                                         |
| `slop_tells --strict`   | Exit 0 on both, with advisory near-duplicate neutral/shadow observations. These are heuristics, not a taste score.                                                  |
| `lint_hardcodes`        | Changed page components and enhancement stylesheet: no hardcoded values found.                                                                                      |
| `check_no_emoji`        | Changed Home/Menu UI and stylesheet: no emoji.                                                                                                                      |
| `lint_native_select`    | Changed Home/Menu UI: no native select.                                                                                                                             |
| `validate_theme_refs`   | Every new stylesheet variable resolved against the shared theme.                                                                                                    |

Two gate findings remain explicitly recorded, rather than presented as passes:

- `verify_interactive` flags clicking an already-selected Pickup button because it leaves the value unchanged. The two-choice selector intentionally behaves this way. Actual switching between pickup and delivery passed Playwright and the keyboard gate.
- `verify_overflow` flags scrolling page content geometrically beneath the fixed bottom navigation. The existing persistent navigation is retained. Direct Playwright Tab traversal confirmed that focused Home/Menu controls scroll clear of it, and all tested controls remain reachable.

These outputs establish the stated checks, not a general accessibility certification or a score for visual quality. Raw outputs are retained in `tmp/customer-enhancement/gates*.json` and `final-menu-states.log`.

## Build and regression scope

The final production build, including its TypeScript phase, passed with two page-generation workers to reduce memory pressure. Focused ESLint and static gates passed. All browser checks use synthetic data; no live orders, provider operations, emails or push messages are submitted. The comprehensive customer audit encountered a browser diagnostic screenshot timeout, so a complete regression pass is not claimed. The existing motion suite passed startup, original-logo proportions, carousel controls and swipe behavior, keyboard focus and reduced motion. The real-service-worker suite passed after its warm-up wait used document readiness instead of network idleness, retaining the subsequent UI and cache assertions. It verified public-only caches, offline reload and editing, preserved drafts and reconnection without losing the document or notes. It reported 142 cached resources and zero runtime errors. Real Android/iOS device behavior was not measured by this browser fixture.

## Latest requested refinements

The redundant Home search shortcut was removed at the user’s request; Menu search remains. Checkout now presents an existing pin as a full wrapping address card, opens Change pin with the previous address and coordinates, and preserves the address on refresh and in quotation requests. Bag vouchers load as clickable published offers before the manual code disclosure, and both routes still use the server validator. Expired offers are hidden; applied codes remain removable.

Success, error, warning, information and destructive colors use shared CSS variables across notices, order statuses, auth errors, map coverage, receipts and confirmations. The repository contrast checker printed AA normal-text passes for the four semantic foreground/surface pairs (6.50, 7.18, 6.68 and 6.50 to 1) and destructive-action text (7.35 to 1). These are source-token measurements, not a whole-app certification. Shared press, hover, page, dialog and feedback motion includes authentication pages and respects reduced motion.

The final production checkout/voucher journey also passed scoped axe audits with zero violations on the voucher section and pinned-address card. The final focused Home/Menu journey and toast journey passed again on the production build; their raw reports include no browser runtime errors. The live preview at port 4000 runs in development mode; production QA runs separately on port 4320.
