# SC/PWD feature cancellation — 16 October 2026

The operator explicitly requested removal of the SC/PWD app feature before publication. This changes the approved release scope; it does not remove tax, invoices, ordinary promotions, loyalty points or income-tax estimates.

## Removed

- Unshipped Customer ID upload/read API and private image processing helper.
- Unapplied verification/retention database migration, including the private storage bucket and review/upload functions, and its draft tests.
- Personal-portion calculation input and automatic statutory-discount selection in the shared financial calculator.
- Personal-portion annotation in the invoice view.

The removed upload work was local only. It was not deployed, its migration was not applied to the hosted database and no customer IDs were collected through it. Financial snapshot version 1 retains its existing numeric fields for compatibility, with zero personal eligibility, VAT relief and exempt sales in this release. Both application calculations and database validation reject stale or forged personal-benefit requests.

## Validation

Tested source commit: `10d35036ff90e5c2a1d8feb0ae2ca306198c9f34` on `codex/discrepancy-finance-2026-10-13`.

| Check | Result |
| --- | --- |
| Full backend regression, including native PostgreSQL concurrency | **PASS — 138/138**, zero failures/skips. Serial execution with `--no-wasm-code-gc`. |
| Targeted finance/migration tests | **PASS — 14/14**. Includes rejection of stale calculation inputs and forged personal-benefit snapshots, with checkout fully rolled back. |
| Production builds | **PASS — Customer, POS and Admin**. |
| TypeScript and lint | **PASS**. |
| Combined browser regression | **PASS**. Admin operations, POS cashier/retry/progression, 12 password fields, finance setup, expenses/reversals, POS invoice and Customer invoice view. Fixtures isolate data/provider writes. |
| Removed ID API | **PASS**. Actual running Customer server returns 404 for both GET and POST `/api/customer/benefits`. |
| Customer journeys | **PASS**. 55 products, nine viewport sizes, voucher/points review, options, drafts, retry and offline recovery; three fixture checkout requests produce one canonical sale; zero runtime errors. |
| Invoice printing | **PASS**. One A4 page, rendered and visually inspected after removal. Uses synthetic taxpayer data. |
| New hosted migrations, configuration and publication | **NOT PERFORMED**. Main and the hosted release are unchanged by this checkpoint. |

Machine-readable [results](evidence/2026-10-16-sc-pwd-removal-results.json) include source/log hashes and the isolated finance browser assertions. PWA/motion suites passed at the preceding checkpoint; they were not repeated for this removal, which changes no service-worker or motion code. No actual phone installation, background push, physical webcam, provider payment/refund or courier outcome is certified here.

**PASS for the cancelled-feature removal. The overall implementation remains INCOMPLETE; this is not the final combined release audit or a clean defense sign-off.** The current [implementation checklist](../discrepancy-implementation-progress.md) identifies the remaining authorized work and operator/device gates.

## Source context

The linked Facebook post could not be fetched directly. The Supreme Court's indexed [14 October 2026 press briefer](https://sc.judiciary.gov.ph/press-briefer-october-14-2026/) addresses combining senior-citizen discounts with promotional discounts and choosing the more favorable discount. This cancellation is the operator's software-scope instruction; the announcement is not treated as abolishing statutory entitlements or as a legal exemption.
