# Customer app enhancement · 18–19 October 2026

## Brief and reference lock

Improve the existing customer app on port 4000 for guests and returning café customers. Preserve every existing route, ordering capability, validation, original asset, font, navigation destination and the approved portrait category rail. Direct implementation is authorized by the user's request to retain and enhance the current app.

Primary reference: the existing Jayds product and `customer-mobile-reference-lock.md` (approved ZUS layout patterns, interpreted in Jayds' original brand). Secondary references: `jayds-brand-reference-lock.md`, Refero bundled typography/craft guidance and the UX/UI gate doctrine. Live Refero research returned `NO_SUBSCRIPTION`; no live styles or screens were available.

Domain: consumer café ordering. Audience and tone: welcoming, familiar, useful to first-time guests. Mood: warm. Motion: subtle feedback with reduced-motion support. Layout: greeting and branch, member shortcuts, branded carousel, fulfillment choices, product discovery, existing personalized content, help. Reference anchor: existing Jayds mobile ordering system.

## Decision ledger

| Decision                                                      | Source                                                                          | Role and rationale                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Keep espresso, cream, caramel and Founders Grotesk            | Existing Jayds brand lock; user constraint                                      | Strengthen hierarchy through spacing and type; retain the established brand.                                                          |
| Add a persistent product shelf on Home                        | Approved product-first menu pattern; existing featured catalog                  | Guests can inspect published products and prices without waiting for a rotating slide. No invented bestseller or popularity claims.   |
| Keep the carousel and all ordering choices                    | User's retention constraint; approved home lock                                 | Refine surrounding hierarchy without replacing working features.                                                                      |
| Add available/featured menu filters and category-aware search | Existing published availability and featured fields; UX gate interactive states | Help customers narrow the catalog with explicit toggle state, visible counts and reset. Keep sold-out products accessible by default. |
| Preserve search and filters on product navigation             | Existing menu restoration behavior                                              | Extend existing session draft rather than introduce another persistence mechanism.                                                    |
| Use shared CSS variables for new styles                       | UX gate token doctrine                                                          | New styling reads the existing theme; spacing and size additions live in its root token layer.                                        |
| Remove the category heading's one-sided accent rule           | UX gate taste doctrine                                                          | Typography and full-surface selection already communicate hierarchy.                                                                  |

Desktop bag refinement: the 1024px regression screenshot showed Review checkout below the viewport after the order type and voucher controls. Following the existing bag flow and the UX gate's primary-action hierarchy, display the desktop pricing summary first. Keep fulfillment, vouchers and points available below it. Mobile section order and its persistent action remain unchanged.

## Verification scope

User-requested toast motion: keep the Customer App mobile first. Success toasts enter from above the phone's safe area, settle near the top center, then slide up and disappear after the existing five-second hold. Manual dismissal uses the same exit. Replace transient bag confirmations with this provider; retain inline validation and the actionable undo notice. Use opacity-only disappearance under reduced motion, preserve the polite live region and prevent old timers from removing newer notices. Motion follows the user's explicit request and Refero's enter ease-out / exit ease-in guidance.

Before/after screenshots use an isolated published-catalog fixture, with real bundled product artwork and synthetic product data. No real orders, emails, push, payment or provider operations. Verify mobile and desktop, search, filters, zero results, category navigation and restoration, product customization, bag persistence, keyboard, reduced motion, typecheck and production build. Run the actual repository gate scripts where the MCP runner cannot execute Python. Record failures and limits honestly; gates do not measure taste.

## Latest user refinements

- Remove the extra Home search shortcut, as requested. Search remains in Menu.
- Present the selected delivery address in a readable, fully wrapping card with its saved label, factual pin-selected state and a Change pin action. Preserve the complete address and coordinates for editing, refresh and quotations.
- Put clickable published voucher offers first, with inline Apply buttons. Put manual entry second in an Enter a voucher code disclosure. Keep server validation, removal and rewards points.
- Apply shared success, error, warning, information and destructive tokens across notices, order statuses, map coverage, auth errors and confirmations. Espresso remains the primary action. Never use color without existing text or icons.
- Use shared feedback, dialog and press timings across the app, with no spatial animation under reduced motion. Preserve fixed mobile actions by keeping route transitions opacity-only.
