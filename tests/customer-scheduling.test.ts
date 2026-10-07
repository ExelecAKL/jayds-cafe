import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { manilaDate, slotHasCapacity, tomorrowManilaDate } from '../packages/shared/src/customer/scheduling.ts';
const admin = '10000000-0000-4000-8000-000000000001';
const customer = '10000000-0000-4000-8000-000000000002';
const menu = '20000000-0000-4000-8000-000000000001';
const stock = '30000000-0000-4000-8000-000000000001';
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync('tests/fixtures/inventory-base.sql', 'utf8'));
  await db.exec(`ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true, ADD COLUMN full_name text, ADD COLUMN email text, ADD COLUMN phone text, ADD COLUMN avatar_url text, ADD COLUMN account_qr_hash text, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();
    ALTER TABLE orders ADD COLUMN maya_checkout_id text,ADD COLUMN maya_checkout_url text,ADD COLUMN maya_payment_id text,ADD COLUMN lalamove_order_id text,ADD COLUMN lalamove_share_link text,ADD COLUMN lalamove_status text;
    CREATE SEQUENCE order_number_seq;
    CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false);
    CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days');
    ALTER TABLE guest_receipts ENABLE ROW LEVEL SECURITY;`);
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.query("INSERT INTO profiles(id,role,points) VALUES($1,'admin',100),($2,'customer',100)", [admin, customer]);
  await db.query("INSERT INTO ingredients(id,name,current_stock) VALUES($1,'Beans',100)", [stock]);
  await db.query("INSERT INTO menu_items(id,name,price) VALUES($1,'Coffee',100)", [menu]);
  await db.query('INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)', [menu, stock]);
  for (const file of ['20261002000100_inventory_operations.sql', '20261002000200_atomic_orders_forecasts.sql', '20261002000300_operations_overview.sql', '20261002000400_pos_cashier.sql', '20261002000500_inventory_admin_approval.sql', '20261002000600_inventory_readiness.sql', '20261003000100_customer_security.sql', '20261003000200_customer_scheduling.sql']) await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  await db.exec(`CREATE OR REPLACE FUNCTION customer_schedule_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT COALESCE(NULLIF(current_setting('test.pickup_now',true),'' )::timestamptz,clock_timestamp()) $$; UPDATE inventory_settings SET enforcement_enabled=true;`);
  const { rows } = await db.query<{ tomorrow: string }>("SELECT ((now() AT TIME ZONE 'Asia/Manila')::date+1)::text tomorrow");
  const start = rows[0].tomorrow + 'T12:00:00+08:00';
  return { db, start };
}
async function configure(db: PGlite, orders = 3, units = 5, closures: string[] = []) {
  const { rows } = await db.query<{ id: string }>('INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason,actor_id) SELECT id,current_stock,current_stock,stock_version,\'Actual physical count for fixture\',$1 FROM ingredients RETURNING id', [admin]);
  for (const row of rows) await db.query('SELECT inv_post_stocktake($1)', [row.id]);
  await db.query('SELECT customer_verify_production($1)', ['Operator verified actual physical counts and actual recipe portions.']);
  const settings = { name: 'Test branch', address: 'Test-only branch address', latitude: 14.346621, longitude: 120.981057, delivery_radius_km: 8, contact_phone: null, regular_hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: '00:00', closes: '23:59' })), closure_dates: closures, scheduled_pickup_enabled: true, slot_order_capacity: orders, slot_item_capacity: units, minimum_notice_minutes: 20, preparation_lead_minutes: 10 };
  await db.query('SELECT customer_save_branch_settings($1)', [JSON.stringify(settings)]);
  return settings;
}
async function create(db: PGlite, start: string | null, key = 'scheduled-order-00000000001', quantity = 1, extras: Record<string, unknown> = {}) {
  const order = { order_source: 'app', order_type: 'pickup', payment_method: 'maya', customer_id: customer, points_redeemed: 0, subtotal: quantity * 100, total: quantity * 100, discount: 0, pickup_slot_start: start, ...extras };
  const items = [{ menu_item_id: menu, price: 100, quantity, subtotal: quantity * 100, variants: [] }];
  const { rows } = await db.query<{ result: { id: string } }>('SELECT inv_create_order($1,$2,$3,$4,NULL,$5) result', [JSON.stringify(order), JSON.stringify(items), key, customer, key]);
  return rows[0].result;
}
async function pay(db: PGlite, id: string, remote = 'checkout-test-1', state = 'paid') {
  await db.query('UPDATE orders SET maya_checkout_id=$2 WHERE id=$1', [id, remote]);
  return (await db.query<{ result: { reviewRequired: boolean } }>('SELECT customer_finalize_maya_payment($1,$2,100,\'PHP\',$3) result', [remote, remote + '-payment', state])).rows[0].result;
}
test('Manila day boundaries and pickup quantity checks are stable', () => {
  assert.equal(manilaDate('2026-10-02T16:00:00Z'), '2026-10-03');
  assert.equal(tomorrowManilaDate('2026-10-02T16:00:00Z'), '2026-10-04');
  assert.equal(slotHasCapacity({ start: '', end: '', preparation_due_at: '', remaining_orders: 1, remaining_item_units: 2 }, 3), false);
});
test('Scheduling is disabled until real physical counts, recipe verification, hours and both capacities exist', async () => {
  const { db, start } = await database();
  try {
    const initial = (await db.query<{ value: { enabled: boolean; slots: unknown[] } }>('SELECT get_customer_pickup_slots($1::date) value', [start.slice(0, 10)])).rows[0].value;
    assert.equal(initial.enabled, false); assert.deepEqual(initial.slots, []);
    await assert.rejects(create(db, start), /not available/);
    await assert.rejects(db.query('SELECT customer_verify_production($1)', ['I verified actual stock and actual portions.']), /physical counts/);
    await configure(db);
    const response = (await db.query<{ value: { enabled: boolean; slots: unknown[] } }>('SELECT get_customer_pickup_slots($1::date) value', [start.slice(0, 10)])).rows[0].value;
    assert.equal(response.enabled, true); assert.ok(response.slots.length > 0);
    await db.query('UPDATE menu_item_ingredients SET quantity_used=3');
    await assert.rejects(create(db, start), /not available/);
    assert.equal((await db.query<{ enabled: boolean }>('SELECT enforcement_enabled enabled FROM inventory_settings')).rows[0].enabled, true);
  } finally { await db.close(); }
});
test('Atomic booking enforces item and order capacity, reserves pickup-eligible physical batches, and retries once', async () => {
  const { db, start } = await database();
  try {
    await configure(db, 2, 2);
    await db.exec("UPDATE stock_batches SET expires_on=inv_business_date();");
    await assert.rejects(create(db, start), /eligible stock/);
    assert.equal((await db.query<{ n: number }>('SELECT count(*)::integer n FROM orders')).rows[0].n, 0);
    assert.equal((await db.query<{ n: number }>('SELECT sum(reserved)::integer n FROM stock_batches')).rows[0].n, 0);
    await db.query('SELECT inv_post_movement($1,10,\'receipt\',\'Test future-eligible receipt\',1,\'tomorrow\',$2::date)', [stock, start.slice(0, 10)]);
    const results = await Promise.allSettled([create(db, start, 'concurrent-booking-00000001'), create(db, start, 'concurrent-booking-00000002'), create(db, start, 'concurrent-booking-00000003')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const first = results[0]; assert.equal(first.status, 'fulfilled');
    if (first.status === 'fulfilled') assert.equal((await create(db, start, 'concurrent-booking-00000001')).id, first.value.id);
    const reserved = (await db.query<{ expiry: string; quantity: number }>("SELECT b.expires_on::text expiry,sum(r.quantity)::integer quantity FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.state='reserved' GROUP BY b.expires_on")).rows;
    assert.deepEqual(reserved, [{ expiry: start.slice(0, 10), quantity: 4 }]);
    assert.equal((await db.query<{ n: number }>('SELECT count(*)::integer n FROM customer_pickup_reservations')).rows[0].n, 2);
    await assert.rejects(create(db, start.replace('12:00', '12:01'), 'invalid-window-0000000001'), /window/);
  } finally { await db.close(); }
});
test('Unpaid deadlines release stock and capacity once; late or failed Maya cannot resurrect a booking', async () => {
  const { db, start } = await database();
  try {
    await configure(db, 1, 1);
    const order = await create(db, start);
    await db.query("UPDATE orders SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [order.id]);
    await db.query('SELECT scheduled_order_expire($1)', [order.id]);
    await db.query('SELECT scheduled_order_expire($1)', [order.id]);
    assert.equal((await pay(db, order.id)).reviewRequired, true);
    assert.deepEqual((await db.query<{ status: string; payment_status: string }>('SELECT status,payment_status FROM orders WHERE id=$1', [order.id])).rows[0], { status: 'cancelled', payment_status: 'paid' });
    assert.equal((await db.query<{ state: string }>('SELECT state FROM customer_pickup_reservations WHERE order_id=$1', [order.id])).rows[0].state, 'released');
    assert.equal((await db.query<{ n: number }>('SELECT sum(reserved)::integer n FROM stock_batches')).rows[0].n, 0);
    const replacement = await create(db, start, 'replacement-booking-000001');
    await pay(db, replacement.id, 'checkout-test-2', 'failed');
    assert.equal((await db.query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [replacement.id])).rows[0].status, 'cancelled');
    assert.equal((await db.query<{ state: string }>('SELECT state FROM customer_pickup_reservations WHERE order_id=$1', [replacement.id])).rows[0].state, 'released');
    await create(db, start, 'after-failed-booking-00001');
  } finally { await db.close(); }
});
test('Preparation due gate consumes once, cancellation retains consumed stock and committed slot load, and demand uses pickup date', async () => {
  const { db, start } = await database();
  try {
    await configure(db, 1, 1);
    const order = await create(db, start);
    await pay(db, order.id);
    await assert.rejects(db.query('SELECT pos_order_action($1,$2,\'prepare\',\'confirmed\')', [admin, order.id]), /not due/);
    assert.equal((await db.query<{ n: number }>('SELECT current_stock::integer n FROM ingredients')).rows[0].n, 100);
    await db.query("SELECT set_config('test.pickup_now',$1,false)", [start.replace('12:00', '11:50')]);
    await db.query('SELECT pos_order_action($1,$2,\'prepare\',\'confirmed\')', [admin, order.id]);
    await db.query('SELECT pos_order_action($1,$2,\'prepare\',\'preparing\')', [admin, order.id]);
    assert.equal((await db.query<{ n: number }>('SELECT current_stock::integer n FROM ingredients')).rows[0].n, 98);
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::integer n FROM stock_movements WHERE movement_type='consumption'")).rows[0].n, 1);
    await db.query('SELECT pos_order_action($1,$2,\'ready\',\'preparing\')', [admin, order.id]);
    await db.query('UPDATE orders SET status=\'completed\' WHERE id=$1', [order.id]);
    assert.equal((await db.query<{ business_day: string }>('SELECT business_date::text business_day FROM inventory_daily_usage')).rows[0].business_day, start.slice(0, 10));
    assert.equal((await db.query<{ state: string }>('SELECT state FROM customer_pickup_reservations WHERE order_id=$1', [order.id])).rows[0].state, 'committed');
    await db.query("SELECT set_config('test.pickup_now','',false)");
    await assert.rejects(create(db, start, 'capacity-remains-00000001'), /full/);
    const cancelled = await create(db, start.replace('12:00', '12:30'), 'cancel-after-prep-00000001');
    await pay(db, cancelled.id, 'checkout-test-cancel');
    await db.query("SELECT set_config('test.pickup_now',$1,false)", [start.replace('12:00', '12:20')]);
    await db.query('SELECT pos_order_action($1,$2,\'prepare\',\'confirmed\')', [admin, cancelled.id]);
    await db.query('UPDATE orders SET status=\'cancelled\' WHERE id=$1', [cancelled.id]);
    assert.equal((await db.query<{ n: number }>('SELECT current_stock::integer n FROM ingredients')).rows[0].n, 96);
    assert.equal((await db.query<{ state: string }>('SELECT state FROM customer_pickup_reservations WHERE order_id=$1', [cancelled.id])).rows[0].state, 'committed');
  } finally { await db.close(); }
});
test('Near-term payment deadline is preparation due, closures and minimum notice reject stale windows, and unchanged historical fields survive migration', async () => {
  const { db, start } = await database();
  try {
    const settings = await configure(db);
    await db.query("SELECT set_config('test.pickup_now',$1,false)", [start.replace('12:00', '11:40')]);
    const order = await create(db, start);
    const snapshot = (await db.query<{ expiry: string; due: string }>('SELECT expires_at::text expiry,preparation_due_at::text due FROM orders WHERE id=$1', [order.id])).rows[0];
    assert.equal(snapshot.expiry, snapshot.due);
    await assert.rejects(create(db, start.replace('12:00', '11:45'), 'too-soon-schedule-0000001'), /window/);
    await db.query('SELECT customer_save_branch_settings($1)', [JSON.stringify({ ...settings, closure_dates: [start.slice(0, 10)] })]);
    await assert.rejects(create(db, start.replace('12:00', '13:00'), 'closed-date-schedule-0001'), /window/);
    await assert.rejects(db.query('SELECT customer_save_branch_settings($1)', [JSON.stringify({ ...settings, minimum_notice_minutes: 20, preparation_lead_minutes: 20 })]), /check constraint/);
    await assert.rejects(db.query('SELECT customer_save_branch_settings($1)', [JSON.stringify({ ...settings, regular_hours: [{ weekday: null, opens: '09:00', closes: '10:00' }] })]), /operating hours/);
    await db.exec("SELECT setval('order_number_seq',9999,true)");
    assert.equal((await db.query<{ number: string }>('SELECT generate_order_number() number')).rows[0].number, 'ORD-10000');
    const branch = (await db.query<{ value: Record<string, unknown> }>('SELECT get_customer_branch() value')).rows[0].value;
    assert.ok(branch.version); assert.equal(branch.delivery_radius_km, 8);
    assert.equal('production_verification_reason' in branch, false); assert.equal('slot_item_capacity' in branch, false);
  } finally { await db.close(); }
});
