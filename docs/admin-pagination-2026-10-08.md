# Admin pagination — 8 October 2026

Every one of the Admin application's 20 tables now uses a shared pagination wrapper with 10 data rows per page. The footer remains visible for a single page or empty results and includes the displayed entry range, total entries, page number, Previous, and Next. Disabled controls reflect the first and final pages. Wide columns scroll separately from the footer; its controls wrap on small screens.

Covered tables: recent orders; menu products; stock items; receipt batches; recipe requirements; stock movements; physical counts; demand forecasts; purchase orders; purchase lines; suppliers; goods receipts; best sellers; product margins; audit log; loyalty customers; staff; staff accounts; orders; and void audit log. Categories retain their existing 10-card pagination and receive the same footer styling.

Search/filter changes reset local tables to page 1. Refreshes that shrink a result set clamp the current page to a valid page. Orders and void logs retain database pagination with exact counts and 10-record ranges. An older request cannot replace a newer server result. Existing recent-history query limits and the dashboard's six-order preview remain in place; totals on locally paginated tables describe their loaded, filtered records.

The production Admin build and focused ESLint checks passed. `npm run check:admin-pagination` runs the production application with synthetic auth/database responses and verifies all 20 tables: first/next/final/previous pages, 55-product and 49-stock ranges, row changes, both detail drawers, filter reset, empty results, out-of-order search responses, keyboard activation, a 390px mobile footer, and 10-record server queries. No browser runtime errors occurred. This test creates no live business transactions.

Deployment and live checks will be recorded after release.
