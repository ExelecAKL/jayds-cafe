# Café database upgrade and preservation

Target only **`segzigvrcgxdjskfltju`**. The application REST keys are already configured for this café. Applying SQL requires the café owner's CLI account or an authorized PostgreSQL connection. An application's service-role key does not provide a database connection password.

## Deployed release

**Current thesis/demo state:** Later on 2 October 2026, the owner explicitly selected existing database quantities as the demo's opening stock. Read-only readiness migration **20261002000600** was deployed, 67 zero-difference counts were posted with a thesis/demo reason, and 15 sample recipe lines were added for the four unmapped frappe products. The checked activation function then enabled stock enforcement. All 1,433 original records remain unchanged. These are demo balances and sample recipes, not verified physical shelf counts or certified café portions. For current read-only verification, run `npx tsx scripts/check-cafe-database.ts --verify --enforcement-enabled`. The 001–005 deployment record below describes the earlier pre-activation state.

On **2 October 2026**, the café owner account authorized and applied migrations **20261002000100–20261002000400** to **`segzigvrcgxdjskfltju`**. The official Supabase CLI executed `jayds_pos_upgrade.sql` through its linked Management API query in one transaction. Additive **20261002000500** then closed the inventory approval boundary in a separate transaction, requiring an approved database Admin profile for direct inventory RPCs and RLS. It preserves trusted owner/service access and the existing helper owner, ACL, and security settings. Official `migration repair` registered 001–004; a pooler connection timeout prevented 005 repair, so the official linked Management API query registered only that committed version and its exact source in the inspected history table. No reset, seed, test sale, profile/approval edit, historical stock deduction, or enforcement activation ran against the café.

The approved local logical backup is `.codex-logs/cafe-before-upgrade-logical.json`. It contains **23 public tables and 1,433 records**, plus public definitions, policies, functions, and triggers. It excludes platform Auth users/passwords and Storage files/configuration; recovery assumes those platform resources remain available. This is a public-schema recovery artifact, not a whole-project backup. Keep the file private because it includes customer and order details. `.codex-logs/cafe-public-restore.sql` was derived from that backup and successfully restored locally before the upgrade. The full release was then rehearsed on the recovered actual café schema, preserving every original field.

The independent after-commit REST audit compared all **1,433 original records across all 23 tables**, including original timestamps, prices, profile points/approval flags, store settings, vouchers, receipts, and pickup tokens. **Every original field and record remained unchanged.** Products remain 55, ingredients 67, recipes 212, historical inventory logs 237, and orders 46. Evidence is in `.codex-logs/cafe-backup-restore-verification.json`, `.codex-logs/cafe-all-records-final.json`, and the combined `.codex-logs/cafe-hosted-upgrade-result.json`.

Legacy setup had no CLI migration history. Only the five applied release versions were registered; old setup/seed versions were deliberately not replayed. **Do not run either applied upgrade bundle again or run an unrestricted root `db push` to fill that older history.** Future migrations must account for the existing legacy schema/history first.

Hosted verification found **67 opening batches, 67 opening movements, zero balance mismatches, zero new cash payments/retry records, and stock enforcement disabled**. The existing one Admin and one staff profile both retained approval. All three cron jobs are active; the two minute jobs have already completed successfully. The daily forecast job is registered at 18:00 UTC (02:00 Manila); its next scheduled execution still needs observation. Realtime publishes `catalog_state` and `pos_order_state`, without adding the new private stock, purchasing, or cash tables.

To inspect the current target using an authorized owner session, keeping credentials outside chat and source files:

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref segzigvrcgxdjskfltju
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

## Apply only the prepared upgrade

The authorized release consists of these additive migrations, in order:

1. `20261002000100_inventory_operations.sql`
2. `20261002000200_atomic_orders_forecasts.sql`
3. `20261002000300_operations_overview.sql`
4. `20261002000400_pos_cashier.sql`
5. `20261002000500_inventory_admin_approval.sql`

Inventory migrations preserve existing ingredient IDs, recipes, products, orders, and historical inventory logs. New-column backfills temporarily pause only existing user UPDATE triggers on affected tables and restore their original enabled modes within the transaction, preserving old timestamps and avoiding legacy lifecycle side effects. Opening batches represent existing nonnegative balances. They do not consume historical completed orders. Cashier migration adds tender records, retry results, restricted status-board signals, checked checkout/progression/pickup operations, and receipt access; it does not fabricate historical tender or change old payment amounts. New receipts save accepted subtotal, discounts, and recorded cash/change. Existing receipt snapshots are reused, and historical payments without a tender record expose nullable cash/change values.

The manager void operation requires an approved cashier identity and a six-digit PIN. It rejects NULL PINs before invoking the legacy verifier. A narrowly scoped trusted operation allows atomic rewards and stock reversal even when an older profile guard remains installed, then restores the caller's role. Voiding before preparation releases reservations; voiding after preparation retains ingredient consumption. Existing payment/refund behavior remains separate.

Use a quiet maintenance window and confirm a restorable Supabase backup. Capture a read-only preservation baseline before applying SQL:

```powershell
npx tsx scripts/check-cafe-database.ts --snapshot
```

The baseline stores record IDs and SHA-256 digests of original fields, not customer details or secret values. It is verification evidence, not a restorable backup. New columns are excluded from comparisons. Order progression and update timestamps are excluded because they legitimately change. Pause normal stock/catalog editing during the comparison.

If remote migration history already matches the earlier repository versions, and the dry run lists only the five release versions, apply:

```powershell
npx supabase db push --linked
```

An older café database may have been built in SQL Editor with empty or divergent CLI history. In that case, inspect its actual schema and reconcile only already-existing migrations before using CLI push. Never replay the older master setup, dummy data, or recipe seed against the live café merely to repair history.

For a separate verified database with the prior café schema and none of these five release migrations applied, an authorized owner can instead execute the two release bundles once using SQL Editor or the official CLI:

```powershell
npx supabase db query --linked --agent=no --file supabase/jayds_pos_upgrade.sql --output json
npx supabase db query --linked --agent=no --file supabase/jayds_inventory_admin_approval_upgrade.sql --output json
```

The POS bundle contains exactly migrations 001–004 in one transaction, followed by a schema-cache reload. The separate approval bundle applies only 005; the already-applied 001–004 source and bundle are unchanged. Neither includes earlier setup migrations or seed data. The older `jayds_inventory_upgrade.sql` contains only 001–003; do not run that alongside the POS bundle. If any release versions were already applied, apply only the remaining migration files in order, each transactionally. Do not rerun either applied bundle on the café.

When SQL Editor was used, record only versions actually applied in CLI migration history, after confirming successful commit:

```powershell
npx supabase migration repair 20261002000100 20261002000200 20261002000300 20261002000400 20261002000500 --status applied --linked
```

Do not deploy the new order mutation routes before their database functions exist. Missing functions produce an explicit setup error instead of falling back to a partial sale.

## Verify after the commit

```powershell
npx tsx scripts/check-cafe-database.ts --verify
```

This uses the existing local application configuration to perform read-only REST checks. It verifies that original records and financial fields remain, enforcement is still disabled, the public catalog/status projection works, and anonymous callers cannot read private stock or tender data. The release's additional strict all-table audit includes every original column and timestamp, and passed again after 005. Changes from actual business operations must be investigated separately rather than classified as migration deletion.

If an authorized connection is already supplied through **`JAYDS_DATABASE_URL` in the process environment**, the same checker also reads migration history, opening-balance reconciliation, and cron schedules. It rejects a different project's host or pooler username and requires verified TLS. Keep that connection string out of command arguments, chat, logs, and tracked files. The script executes no DDL, mutations, reset, seed, or activation.

Using the café SQL Editor, check:

```sql
select enforcement_enabled, branch_name from public.inventory_settings;
select count(*) as balance_mismatches
from public.ingredients i
where i.current_stock <> (
  select coalesce(sum(b.quantity), 0)
  from public.stock_batches b where b.ingredient_id = i.id
);
select public.get_published_catalog();
select public.get_pos_status_board();
select version from supabase_migrations.schema_migrations
where version >= '20261002000100' order by version;
select jobname, schedule, active from cron.job
where jobname like 'jayds-%';
```

Expected opening balance mismatches are zero for existing nonnegative balances. Existing negative balances remain a reconciliation issue; the upgrade does not conceal them. Scheduled jobs are daily forecasts at 18:00 UTC (02:00 Manila), minute stock maintenance, and minute generated-draft refresh. If `pg_cron` is unavailable, enable it and register the schedules from migration 002; local fixture tests do not prove hosted cron execution.

**Keep stock enforcement disabled** until physical counts, units, recipes, and expiry are reconciled and active orders have settled, following [inventory activation](inventory-operations.md#reconcile-and-activate). Apply the upgrade separately from activation. Validate actual hosted staff/Admin access, Realtime recovery, receipt reuse, cash checkout, manager voids, and pickup in a controlled staging workflow before cutover. Use isolated fixtures for failure/concurrency tests instead of creating test transactions in the café.

## Database validation evidence

`tests/migrations.test.ts` applies the full production schema and all additive migrations while checking opening balances. `tests/pos.test.ts` verifies checkout/reward/stock/receipt rollback, tender validation, accepted snapshots, and atomic pickup failure/retry. `tests/concurrency.test.ts` runs isolated native PostgreSQL 17 with independent connections and observes real lock waits: competing sales cannot oversell, and simultaneous checkout retries reuse one canonical order, tender, and receipt. Local fixture results remain distinct from the hosted deployment and preservation evidence above. `tests/backfill.test.ts` also verifies old timestamps, absence of legacy backfill side effects, and restoration of enabled, disabled, ALWAYS, and REPLICA UPDATE trigger modes.

`tests/pos-production.test.ts` executes the combined 001–004 transaction on the full older production schema and checks that the bundle exactly matches its source migrations. It verifies manager voids with the actual legacy profile guard, NULL-PIN rejection, atomic reversal failures, retained post-preparation consumption, caller-role restoration, Admin edits/cancellation, and recorded versus unknown historical tender. The builder `npx tsx scripts/build-pos-upgrade.ts` reproduces that exact four-migration bundle; new changes to the deployed café require additive migration files.

`tests/inventory-approval.test.ts` applies the separate 005 wrapper and verifies its exact source, preservation of helper owner/ACL/security settings, approved Admin reads/waste/supplier writes, denied unapproved Admin/staff RLS and mutation paths, and trusted owner/service access. The actual restored-hosted-schema rehearsal also checks approved/unapproved Admin behavior and unchanged original records after 005. Do not edit previously deployed migration files to introduce follow-up changes.

Final serial validation passed **52 tests**, typecheck, changed-file lint, and **31 HTTP checks**. Read-only browser verification exercised actual Admin/staff access, the cashier catalog and fixed viewport, Admin stock records, the anonymous TV board with Realtime/offline/reconnect recovery, and mobile published catalog. Hosted failure/concurrency transactions remain covered by isolated fixtures, without writing café test orders.
