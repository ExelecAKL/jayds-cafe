# Jayds discrepancy implementation progress

Updated 16 October 2026, Philippine time. This is an implementation checklist, not a defense sign-off. The small mobile-menu release was audited and published separately. The wider discrepancy release remains on the working branch until its audit.

## Scope change, 16 October 2026

The operator explicitly cancelled the SC/PWD app feature. Private ID collection, eligibility review, automatic personal-portion discounts and their retention workflow are removed from this release. The unshipped upload API, image helper, migration and tests were removed before any hosted migration or ID collection. The shared quote calculator and database validation no longer accept personal-benefit calculations. VAT-inclusive pricing, ordinary vouchers/points, invoicing and 40% OSD estimates remain in scope.

The linked Court announcement concerns non-stacking of discounts, not abolition of statutory entitlements. Removing the software feature is an operator scope decision; it is not a legal exemption or a certification of compliance. [Supreme Court press briefer, 14 October 2026](https://sc.judiciary.gov.ph/press-briefer-october-14-2026/).

## Implemented in the current working branch

- Whole Milk defaults and menu/recipe corrections; shared Customer/POS selection rules; optional Standard/+1 Extra Shot; Admin default validation and preview; required-phone copy.
- Shared VAT-inclusive calculations in centavos, immutable order financial snapshots, append-only sale/refund records, transactional invoice numbers and linked credit notes.
- Owner-reported RDO confirmation recorded as the invoice authority basis. Invoice generation is enabled in configuration. Actual taxpayer details are held in an ignored local configuration file, not in source control. Hosted configuration has not yet been changed for this release.
- Admin finance overview, daily chart and matching table, expenses with evidence-reference and input-VAT checks, expense reversal history, individual 40% OSD estimates and incomplete-setup notices.
- Customer invoice view; issued invoice through the existing expiring POS receipt token; print layout and PDF verification added to the browser audit.
- Show/Hide controls and eye icons across Customer, POS and Admin password fields, plus Manager PIN entry. Passwords start masked, preserve their value on toggle, support keyboard use and mask on leaving the field.

## Admin and Help improvements in progress, 16 October

- Bounded profile, catalog, audit and operations reads; in-page retry. Product forms do not permit a save if their recipe data failed to load. Playwright has passed stalled profile/catalog/audit recovery checks.
- Grouped navigation with one active page; Overview prioritizes key figures and compact quick actions. Purchasing uses selectable next-step stages. Hours & pickup groups opening hours and pickup limits ahead of branch/delivery details, with a 1 PM–10 PM shortcut for already-open days. No physical counts, open weekdays or capacities are invented.
- Menu product photo upload replaces the URL input: preview, removal, file validation, approved-Admin API, actual image decoding, metadata removal and fixed random storage paths. Recipe and category layouts are retained.
- Stock movements, waste and counts open linked details; planning opens historical usage and projected balance with a matching numeric table. Refresh does not generate purchases. Draft creation uses reviewed server quantities and protects edited drafts.
- Export has its own navigation page with group/table selection, consistent server snapshots, 500-row pages, CSV ZIP/JSON, manifest, secret redaction, current approved-owner checks and expiry/cleanup. Sales Reports' global CSV button is removed; its useful existing reports remain.
- Customer Help offers compact shortcuts, answers, a private form on request and scoped request history with retry. Admin Customer help separates requests from payment/delivery tools, with private replies in a drawer.
- Explicit 120 ms controls, 180 ms notices/modals and 220 ms drawer motion; reduced motion removes movement. Keyboard/focus and responsive browser checks remain part of the audit.
- Full backend repeat: 151 tests passed, 0 failed/skipped. All three builds and type checks passed; full lint passed after excluding generated audit artifacts and nested release checkouts. Customer browser suite passed with 55 products and 9 sizes. The stock-planning overflow and post-confirmation focus recovery were caught and corrected. The new graph/upload/export browser checks and the 21-case detailed Admin form audit passed. The combined Admin/POS/finance, real-worker PWA/offline and Customer motion suites also passed. The final real-time profile/catalog/audit/product-form recovery checks passed. Both export formats, all-table selection and failed-read recovery passed; the actual downloaded ZIP was opened independently and every row count matched its manifest.

## Still required before the complete plan can be called implemented

- Shared read-only server quote endpoint for ordinary Customer/POS checkout totals. The SC/PWD workflow is cancelled, not a remaining implementation gate.
- Supporting document uploads for expenses; input VAT for stock purchases and full reconciliation review. The current expense form records a document reference and reviewed operating-expense input VAT only.
- Server aggregation for the existing Sales Reports page, removal of its 200-order best-seller limit and Philippine dates/hour corrections. The stock-planning table, investigation/chart drawers, separate refresh and reviewed draft creation are implemented; their focused browser audit has passed.
- Customer carousel swipe/interruption and return-state improvements, keyboard-safe fixed actions, consistent 120/180/220 ms motion and reduced-motion behavior across affected flows.
- Full API/browser/permission/failure-path tests for those remaining workflows, phase audits and the combined audit tied to the final release commit.
- GitHub and Vercel publication of the wider release, with tagged rollback versions and hosted post-deployment checks. The isolated mobile-menu fix is already on main and the public Customer alias; pre-mobile-menu-2026-10-16 preserves the earlier main.

## Operator/direct-check gates

The confirmed hours are 1 PM–10 PM. Physical stock counts, slot capacities and closure dates remain operator inputs. Official registration/serial claims are not invented; the supplied document crop and owner-reported RDO confirmation are distinguished from independently verified invoice authorization. Delivery tax treatment and annual owner tax inputs require operator/accountant configuration. The disconnected phone, actual installation/background push, physical webcam QR and complete provider payment/delivery outcomes still need direct checks. No receipt printer is required by the operator.

ZUS inspection remains stopped while the phone is disconnected. No new phone order or Maya gateway navigation is implied by these implementation tests.
