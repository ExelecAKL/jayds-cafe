import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { posUpgradeSql } from "../scripts/build-pos-upgrade.ts";

const admin = "10000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000002";
const staff = "10000000-0000-4000-8000-000000000003";
const item = "20000000-0000-4000-8000-000000000001";
const stock = "30000000-0000-4000-8000-000000000001";
const pin = "742961";

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA cron;
    CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE FUNCTION gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE PUBLICATION supabase_realtime;
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql") && file < "20261002000100")
    .sort()) {
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      ),
    );
  }
  await db.query(
    "INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4),($5,$6)",
    [
      admin,
      "admin@production.example.test",
      customer,
      "customer@production.example.test",
      staff,
      "staff@production.example.test",
    ],
  );
  await db.query(
    "UPDATE profiles SET role=CASE WHEN id=$1 THEN 'admin'::user_role WHEN id=$2 THEN 'staff'::user_role ELSE 'customer'::user_role END,is_approved=true,points=100 WHERE id=ANY($3::uuid[])",
    [admin, staff, [admin, customer, staff]],
  );
  await db.query("UPDATE store_settings SET void_pin=$1 WHERE id='global'", [
    pin,
  ]);
  await db.query(
    "INSERT INTO ingredients(id,name,unit,current_stock,cost_per_unit) VALUES($1,'Production regression beans','g',10,1)",
    [stock],
  );
  await db.query(
    "INSERT INTO menu_items(id,name,price) VALUES($1,'Production regression coffee',100)",
    [item],
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
    [item, stock],
  );
  const bundle = readFileSync("supabase/jayds_pos_upgrade.sql", "utf8");
  assert.equal(
    bundle,
    posUpgradeSql(),
    "The deployable bundle must exactly match the four current migrations.",
  );
  await db.exec(bundle);
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=true");
  return db;
}

async function identity(db: PGlite, role: string, actor: string) {
  await db.query(
    "SELECT set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",
    [role, actor],
  );
}
async function cash(db: PGlite, key: string) {
  const result = await db.query<{
    result: {
      id: string;
      receipt: { receipt_token: string; receipt_data: Record<string, unknown> };
    };
  }>("SELECT pos_cash_checkout($1,$2,$2,120,99,$3,$4,NULL) result", [
    staff,
    key,
    JSON.stringify({
      order_source: "pos",
      order_type: "pickup",
      payment_method: "cash",
      customer_id: customer,
      points_redeemed: 10,
      subtotal: 100,
      total: 99,
      discount: 1,
    }),
    JSON.stringify([
      {
        menu_item_id: item,
        price: 100,
        subtotal: 100,
        quantity: 1,
        variants: [],
        notes: "Original accepted note",
      },
    ]),
  ]);
  return result.rows[0].result;
}
async function balances(db: PGlite, orderId: string) {
  return (
    await db.query<{
      state: {
        status: string;
        payment_status: string;
        points: number;
        stock: number;
        reserved: number;
        voids: number;
      };
    }>(
      `SELECT jsonb_build_object('status',o.status,'payment_status',o.payment_status,'points',(SELECT points FROM profiles WHERE id=$2),'stock',(SELECT current_stock FROM ingredients WHERE id=$3),'reserved',(SELECT coalesce(sum(quantity),0) FROM stock_reservations WHERE order_id=o.id AND state='reserved'),'voids',(SELECT count(*) FROM void_logs WHERE order_id=o.id)) state FROM orders o WHERE o.id=$1`,
      [orderId, customer, stock],
    )
  ).rows[0].state;
}

test("production guards preserve approved manager voids, atomic reward reversals, reservation release, and actor scope", async () => {
  const db = await database();
  try {
    const sale = await cash(db, "production-void-before-0001");
    // SQL-Editor installations may retain the original hardening trigger.
    // Use its actual production function, rather than substituting business logic.
    await db.exec(
      "CREATE TRIGGER protect_profile_mutation BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_mutation()",
    );
    await identity(db, "authenticated", staff);
    const wrong = (
      await db.query<{ result: { success: boolean } }>(
        "SELECT void_order_with_pin($1,$2,$3) result",
        [sale.id, "000000", staff],
      )
    ).rows[0].result;
    assert.equal(wrong.success, false);
    assert.deepEqual(await balances(db, sale.id), {
      status: "confirmed",
      payment_status: "paid",
      points: 90,
      stock: 10,
      reserved: 2,
      voids: 0,
    });
    const voided = (
      await db.query<{ result: { success: boolean } }>(
        "SELECT void_order_with_pin($1,$2,$3) result",
        [sale.id, pin, staff],
      )
    ).rows[0].result;
    assert.equal(voided.success, true);
    assert.deepEqual(await balances(db, sale.id), {
      status: "cancelled",
      payment_status: "paid",
      points: 100,
      stock: 10,
      reserved: 0,
      voids: 1,
    });
    assert.equal(
      (await db.query<{ role: string }>("SELECT auth.role() role")).rows[0]
        .role,
      "authenticated",
    );
    assert.equal(
      (
        await db.query<{ actor_id: string }>(
          "SELECT actor_id FROM admin_audit WHERE entity_id=$1 AND action='return_rewards'",
          [sale.id],
        )
      ).rows[0].actor_id,
      staff,
    );
    await db.query("SELECT void_order_with_pin($1,$2,$3)", [
      sale.id,
      pin,
      staff,
    ]);
    assert.equal((await balances(db, sale.id)).voids, 1);
  } finally {
    await db.close();
  }
});

test("production manager void rejects null PIN and identity forgery, retains prepared consumption, and rolls back failed reversals", async () => {
  const db = await database();
  try {
    const sale = await cash(db, "production-void-after-00001");
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      staff,
      sale.id,
    ]);
    await identity(db, "authenticated", staff);
    const nullPin = (
      await db.query<{ result: { success: boolean } }>(
        "SELECT void_order_with_pin($1,NULL,$2) result",
        [sale.id, staff],
      )
    ).rows[0].result;
    assert.equal(nullPin.success, false);
    await assert.rejects(
      db.query("SELECT void_order_with_pin($1,$2,$3)", [sale.id, pin, admin]),
      /identity/,
    );
    await db.exec(
      "CREATE FUNCTION fail_void_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.points>OLD.points THEN RAISE EXCEPTION 'Reward reversal fixture failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_void_reward BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fail_void_reward();",
    );
    await assert.rejects(
      db.query("SELECT void_order_with_pin($1,$2,$3)", [sale.id, pin, staff]),
      /Reward reversal fixture failure/,
    );
    assert.deepEqual(await balances(db, sale.id), {
      status: "preparing",
      payment_status: "paid",
      points: 90,
      stock: 8,
      reserved: 0,
      voids: 0,
    });
    assert.equal(
      (await db.query<{ role: string }>("SELECT auth.role() role")).rows[0]
        .role,
      "authenticated",
    );
    await db.exec("DROP TRIGGER fail_void_reward ON profiles");
    await db.query("SELECT void_order_with_pin($1,$2,$3)", [
      sale.id,
      pin,
      staff,
    ]);
    assert.deepEqual(await balances(db, sale.id), {
      status: "cancelled",
      payment_status: "paid",
      points: 100,
      stock: 8,
      reserved: 0,
      voids: 1,
    });
    assert.equal(
      (
        await db.query(
          "SELECT * FROM stock_movements WHERE order_id=$1 AND movement_type='consumption'",
          [sale.id],
        )
      ).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

test("production receipts use accepted prices and recorded tender, reuse snapshots, and leave historical cash tender unknown", async () => {
  const db = await database();
  try {
    const paid = await cash(db, "production-receipt-000001");
    const receipt = paid.receipt.receipt_data;
    assert.equal(receipt.subtotal, 100);
    assert.equal(receipt.discount, 1);
    assert.equal(receipt.cash_received, 120);
    assert.equal(receipt.change_due, 21);
    assert.deepEqual(receipt.cash_tender, {
      cash_received: 120,
      amount_paid: 99,
      change_due: 21,
    });
    await db.query("UPDATE menu_items SET price=150 WHERE id=$1", [item]);
    assert.deepEqual(
      (
        await db.query<{ result: unknown }>(
          "SELECT pos_order_action($1,$2,'receipt') result",
          [staff, paid.id],
        )
      ).rows[0].result,
      (
        await db.query<{ result: unknown }>(
          "SELECT pos_checkout_result($1) result",
          [paid.id],
        )
      ).rows[0].result,
    );
    assert.deepEqual(
      (await cash(db, "production-receipt-000001")).receipt,
      paid.receipt,
    );
    const oldOrder = (
      await db.query<{ id: string }>(
        "INSERT INTO orders(customer_id,staff_id,order_source,order_type,payment_method,payment_status,status,subtotal,total,discount) VALUES(NULL,$1,'pos','pickup','cash','paid','confirmed',80,80,0) RETURNING id",
        [staff],
      )
    ).rows[0].id;
    const historical = (
      await db.query<{
        result: {
          payment: unknown;
          receipt: { receipt_data: Record<string, unknown> };
        };
      }>("SELECT pos_order_action($1,$2,'receipt') result", [staff, oldOrder])
    ).rows[0].result;
    assert.equal(historical.payment, null);
    assert.equal(historical.receipt.receipt_data.cash_tender, null);
    assert.equal(historical.receipt.receipt_data.cash_received, null);
    assert.equal(historical.receipt.receipt_data.change_due, null);
    await identity(db, "authenticated", admin);
    await db.query(
      "UPDATE menu_items SET manually_available=false,name='Admin product edit' WHERE id=$1",
      [item],
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      paid.id,
    ]);
    assert.equal((await balances(db, paid.id)).points, 100);
  } finally {
    await db.close();
  }
});
