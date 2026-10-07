# Jayds Café inventory operations and rollout

Admin runs on 4002, POS on 4001, and mobile/customer on 4000. The existing Supabase project `segzigvrcgxdjskfltju` remains the shared source of truth. Defaults are one branch, PHP, Asia/Manila business dates, online sales, and approved purchasing.

## What is implemented

The Admin shell uses the local café font, espresso navigation, warm surfaces, compact tables, line icons, contextual top bar, and responsive navigation. Overview connects stock, expiry, replenishment, and blocked-order alerts to filtered workflows. Catalog includes archived and manually disabled products. Inventory has Stock Items, Recipes, Movements, Waste, Stocktakes, and Forecasts. Purchasing includes suppliers, draft editing, approval, ordered confirmation, partial receiving, and receipt history. The activity log records operational and catalog changes. Existing orders, vouchers, loyalty, staff, analytics, and void workflows remain accessible.

Centralized menus, channel availability, and ingredient consumption are the capability benchmark described in [Zeoniq's delivery integration documentation](https://www.zeoniq.com/delivery-platform-integration/). Jayds implements these capabilities using its own Supabase schema and APIs.

Stock items preserve existing ingredient IDs and recipe relationships. Ingredients, packaging, and finished goods use grams (`g`), milliliters (`ml`), or pieces (`pcs`). Purchasing packs convert directly to the configured base unit: a 1 kg bag is a pack of 1000 g; a sleeve of 50 cups is a pack of 50 pcs. Suppliers are linked through each stock item's preferred supplier, pack size, minimum packs, and replenishment settings.

Public clients use `get_published_catalog` and `get_configuration_availability`. These expose categories, products, options, prices, availability, and catalog version; they expose no costs, recipes, batches, suppliers, or purchasing data. Operational tables and views require an Admin session. Mutating operational RPCs also check that role. Trusted order creation requires the service role and stays on the server.

POS and mobile retain their existing order routes and response fields. Both pass authoritative prices and a scoped `Idempotency-Key` to `inv_create_order`; the database revalidates catalog records and commits orders, items, vouchers, points, requirement/cost snapshots, and reservations together. Failed transactions leave none of these partially committed. Browsers cannot write order items directly.

## Apply the database upgrade before deploying these order routes

The new order routes require the atomic order RPC. They return a setup error when it is missing; they do not silently submit through the old, nontransactional path.

There are three additive migrations:

1. `supabase/migrations/20261002000100_inventory_operations.sql`
2. `supabase/migrations/20261002000200_atomic_orders_forecasts.sql`
3. `supabase/migrations/20261002000300_operations_overview.sql`

For a project with migration history matching this repository, log into the Supabase CLI with an account authorized for the café project, then inspect before pushing:

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref segzigvrcgxdjskfltju
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Only proceed with `npx supabase db push --linked` if the pending list contains the intended migrations and any earlier migrations are already reconciled. A project originally set up through SQL Editor may have an empty CLI history despite already containing the old tables. Do not replay old setup migrations blindly against that project.

For that situation, `supabase/jayds_inventory_upgrade.sql` combines only the three new migrations inside one transaction, with a PostgREST schema reload notification. An authorized project owner can run it **once** in the café project's SQL Editor after taking a database backup. It is intended for a database already running this repository's prior schema, not an empty database. Reconcile the CLI history afterwards through the normal migration-history process, recording only versions actually applied. Do not apply both the combined script and the three migrations twice.

Keep credentials in the CLI or local environment, never in chat, source files, or logs. Do not change the application's project URL to another account's unrelated project to work around missing access.

After applying, verify:

```sql
select enforcement_enabled, branch_name from public.inventory_settings;
select public.get_published_catalog();
select count(*) as balance_mismatches
from public.ingredients i
where i.current_stock <> (
  select coalesce(sum(b.quantity), 0)
  from public.stock_batches b where b.ingredient_id = i.id
);
```

Enforcement starts **false**. Opening batches import nonnegative existing balances without deducting old completed orders. Historical inventory logs stay intact. Existing negative balances or unknown expiry dates need physical reconciliation.

## Reconcile and activate

1. Review stock master units, supplier mappings, purchasing packs, costs, thresholds, lead time, safety coverage, and review interval. Defaults are 3 lead days, 2 safety days, and 7 days between reviews.
2. Review each product's manual availability. The upgrade preserves the old availability setting; an older automatic sold-out flag may need a conscious manual review.
3. Map every enabled product's base ingredients, packaging, and finished goods. Configure size multipliers and option additions/replacements. Option recipes are shared by group and label, so changes affect every product using that option.
4. Use explicit replacements for substitutions. An alternative milk replaces the configured dairy ingredient. A smaller sugar amount can replace that same sugar ingredient. A zero-quantity replacement implements "no sugar"; a zero-quantity additive line is rejected. Replacement lines inherit the replaced base ingredient's size multiplier unless an explicit option multiplier overrides it.
5. Record physical receipts and expiry where known. Dispose of expired or damaged stock through Waste with a reason. Count all active stock items and post those counts. If inventory or reservations change after counting, start a new recount; do not reuse the stale baseline.
6. Settle active submitted orders before cutover. Parked orders reserve nothing and revalidate when resumed. Post fresh counts after any additional receipts or other stock movements.
7. Activate from Inventory's Stock Enforcement action. The database rejects activation if active orders, missing base recipes, invalid base units, negative balances, or stale/missing physical counts remain.

Before activation, legacy completion deductions continue for unmanaged orders and are mirrored into the movement ledger. After activation, new managed orders use reservations and preparation consumption. Historical completed orders are never consumed again. Do not disable enforcement during active operations as a routine way to bypass a shortage.

## Daily stock and order behavior

Submitted orders reserve eligible batches under sorted stock-row locks. Batches allocate by earliest expiry, then receipt date. An expiry date remains eligible through that Asia/Manila business date; past expiry is never sellable. Stock value shows physical stock, while availability excludes expired and reserved quantities.

Unpaid submissions have a database-controlled 30-minute deadline. Maintenance cancels expired unpaid orders. Cancellation before preparation releases reservations. Cancellation and expiry return redeemed points and voucher usage once, in the same transaction; a reversal failure leaves the order and reservations intact. Preparation rechecks and consumes once; later Ready/Completed changes do not deduct again. Cancellation after preparation records a disposition and keeps ingredients consumed. Monetary refunds continue through the existing payment workflow.

Waste, expiry, and counts can invalidate reservations. The engine attempts reallocation against the accepted requirement snapshot. A shortage flags the order, exposes it through the Overview alert and Orders filter, and blocks preparation until stock is resolved. Receiving stock can clear the conflict after reallocation. Recipe edits cannot change accepted requirements or historical consumption.

Published sold-out products remain visible. Exact size/option configurations can be disabled individually while other configurations remain orderable. Restocking never changes the separate manual availability flag. Archived products and inactive categories stay outside the published ordering catalog.

Realtime uses the public `catalog_state` signal and refetches the safe projection. Clients refetch after subscription recovery and coming online, and poll every 30 seconds as a fallback. Cached public catalogs support browsing during an outage; sales still require server confirmation. Admin data is not written into the public browser catalog cache.

## Purchasing and forecasting

Purchase approval records intent and incoming stock; it never increases physical balance. Confirm Ordered after placing the order with the supplier. Receiving records physical quantity, actual unit cost, batch code, optional expiry, and a delivery reference. Partial receipts leave the remaining quantity outstanding. Receiving more than outstanding, duplicate delivery references on the same purchase order, or a reused key with different data fails atomically. Cancellation of a partially received order retains stock already physically received.

Forecasts offer 7, 14, and 30 days, with 14 days selected initially. Each item uses its own historical demand coverage. At least 28 calendar days of history selects weekday averages over up to eight weeks. Less history uses a zero-filled trailing 14-calendar-day mean. Completed accepted orders use saved requirements; older orders without snapshots use current recipes and show an estimate label. No historical orders are physically deducted by this calculation.

Suggestions show coverage, pack-rounded reorder quantities, incoming approved/ordered/partial purchases, excess stock, expiry exposure, and estimated cost. Eligible stock and expected incoming deliveries are subtracted. Items with fewer than 14 days of coverage require manual purchase draft creation; configured thresholds still appear as suggestions. Automatic drafts are generated only with adequate history, grouped by supplier, updated when untouched, and preserved after a manual edit. Approval and physical receiving always remain Admin decisions.

`forecast_overview` calculates replenishment against current stock and purchasing data, so those suggestions change when stock or purchasing changes. Forecast history snapshots are immutable.

When `pg_cron` is enabled, the migrations register:

| Job | Schedule | Action |
| --- | --- | --- |
| `jayds-daily-forecast` | 18:00 UTC daily, 02:00 Asia/Manila | Refresh forecasts and generated drafts |
| `jayds-stock-maintenance` | Every minute | Expire unpaid orders and reconcile invalid reservations |
| `jayds-replenishment-drafts` | Every minute | Update untouched generated purchase drafts |

Maintenance and draft generation use separate jobs to keep purchasing work outside the stock-lock transaction. Manual forecast refresh is available in Admin.

Verify the hosted schedule and recent results after deployment:

```sql
select jobname, schedule, active from cron.job where jobname like 'jayds-%';
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 20;
```

If those jobs are absent, enable `pg_cron` in the project's Supabase extensions and register the three schedules from the end of migration 002. A local PostgreSQL fixture cannot confirm the hosted extension or scheduler is functioning.

## Validation and remaining rollout checks

Run from the repository root:

```powershell
npm test
npm run typecheck
npm run build
npm run check:http
npm run check:browser
```

The final serial test suite has 52 passing tests: the original backend tests plus PostgreSQL inventory/forecast cases, cashier transactions, the complete production migration chain, backfill preservation, approved Admin boundaries, and native PostgreSQL contention tests. It covers cross-channel stock contention, insufficient stock, idempotency, reservation release, one-time consumption, substitutions (including zero/same-ingredient replacement), immutable accepted snapshots, reward/voucher rollback and cancellation reversals (including guest vouchers), expiry, reallocation, receiving, duplicate deliveries, stale counts, activation, incoming stock, sparse forecasts, pack rounding, and edited draft preservation.

The database fixtures execute the actual migration functions in PGlite. `tests/concurrency.test.ts` additionally starts isolated native PostgreSQL 17 on a temporary loopback port and executes the combined upgrade. Separate POS/mobile connections hold overlapping transactions; an observer verifies that the competing connection waits on real database locks. It tests overselling/reward rollback, simultaneous idempotent retries, duplicate physical receiving, and stale stocktake posting. Its own cluster is stopped and removed afterwards. Native test binaries are development dependencies; Unix hosts must run this test as a non-root user. The production-schema compatibility test supplies Supabase auth/crypto/scheduling shims; it does not exercise real payment providers or `pg_cron`.

`check:http` validates 31 production HTTP/auth checks. `check:browser` starts isolated app servers and Chrome contexts, intercepts Supabase browser requests into a PostgreSQL fixture, and verifies Admin at 1440, 834, and 390 px, keyboard focus, failed saves retaining data, approval without stock changes, partial receiving, operations routes, configuration sold-out behavior in POS/mobile, connected availability propagation within five seconds, and reconnect recovery. Additional hosted read-only browser checks passed actual staff/Admin access, the cashier workspace, stock records, anonymous TV Realtime/offline/reconnect recovery, and mobile catalog. No test orders, receipts, or profiles are written into the hosted café database. Screenshots and command logs are in `.codex-logs`.

Typecheck and all three production builds pass. ESLint passes on the new operations components, shared inventory/catalog code, and new tests. Repository-wide lint still reports unrelated pre-existing React-hook, type, and escaping errors; the full lint result must not be reported as passing.

Before a production cutover, verify real project RLS with anon/customer/staff/admin sessions, independent concurrent POS/mobile requests under contention, connected Realtime delivery within five seconds and reconnection on the hosted project, cron execution, a supplier receipt/count cycle, and payment/void workflows with the actual environment. Use a staging database for destructive load fixtures.

On 2 October 2026, the café owner authorized and applied migrations 001–004 to `segzigvrcgxdjskfltju` in one transaction, followed by additive 005 approval hardening and exact history registration through the official CLI. Direct inventory RPCs and RLS now require an approved database Admin profile, while trusted owner/service access remains. An approved public-schema/data backup was restored locally and both upgrades rehearsed before commit. The independent live after-check confirms all 1,433 original records across 23 tables remain unchanged in every original field, including after 005. There are 67 imported opening batches and movements, zero opening balance mismatches, and no test sales. Stock enforcement remains disabled pending physical counts, recipe/unit validation, and the activation workflow above. All three scheduled jobs are active; minute maintenance and draft-refresh executions have succeeded. Full Auth/Storage recovery and the next daily scheduled forecast execution are outside this public-backup verification. See [the database rollout record](pos-database-rollout.md) for the backup scope and deployed evidence.
