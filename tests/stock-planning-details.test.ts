import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const admin = "10000000-0000-4000-8000-000000000001",
  staff = "10000000-0000-4000-8000-000000000002",
  stock = "30000000-0000-4000-8000-000000000001";
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec(`ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text;
 ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false;
 CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false);
 CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days');`);
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
    [admin],
  );
  await db.query(
    "INSERT INTO profiles(id,role,full_name) VALUES($1,'admin','Fixture Admin'),($2,'staff','Fixture Staff')",
    [admin, staff],
  );
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock,cost_per_unit) VALUES($1,'Fixture milk',10,2)",
    [stock],
  );
  for (const name of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261013000400_finance_invoices.sql",
    "20261016000100_stock_planning_details.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  return db;
}
async function call<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<{ result: T }>(`SELECT ${sql} result`, args)).rows[0]
    .result;
}
test("stock investigation links actual order/count/batch records and refuses staff and unapproved admins", async () => {
  const db = await database();
  try {
    const order = (
      await db.query<{ id: string }>(
        "INSERT INTO orders(order_source,total) VALUES('app',112) RETURNING id",
      )
    ).rows[0].id;
    const movement = (
      await db.query<{ id: string }>(
        "INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,actor_id,reason,order_id) SELECT $1,id,-2,'consumption',8,$2,'Preparation started',$3 FROM stock_batches WHERE ingredient_id=$1 RETURNING id",
        [stock, admin, order],
      )
    ).rows[0].id;
    const detail = await call<{
      record: { order_id: string };
      order: { id: string };
      actor: { name: string };
      batch: { id: string };
      related_movements: { name: string }[];
    }>(db, "admin_stock_record('movement',$1)", [movement]);
    assert.equal(detail.order.id, order);
    assert.equal(detail.record.order_id, order);
    assert.equal(detail.actor.name, "Fixture Admin");
    assert.ok(detail.batch.id);
    assert.equal(detail.related_movements[0].name, "Fixture milk");
    const count = (
      await db.query<{ id: string }>(
        "INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason,actor_id) VALUES($1,10,9,0,'Fixture physical count',$2) RETURNING id",
        [stock, admin],
      )
    ).rows[0].id;
    const counted = await call<{ count: { id: string }; order: null }>(
      db,
      "admin_stock_record('stocktake',$1)",
      [count],
    );
    assert.equal(counted.count.id, count);
    assert.equal(counted.order, null);
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [staff],
    );
    for (const expression of [
      "admin_stock_record('movement',$1)",
      "admin_stock_insight($1,14)",
      "admin_replenishment_preview()",
    ])
      await assert.rejects(
        call(db, expression, expression.includes("$1") ? [movement] : []),
        /Approved Admin/,
      );
    await db.query("UPDATE profiles SET is_approved=false WHERE id=$1", [
      admin,
    ]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await assert.rejects(
      call(db, "admin_replenishment_preview()"),
      /Approved Admin/,
    );
  } finally {
    await db.close();
  }
});
test("stock insight keeps calendar zeros, labels historical estimates, projects the selected horizon and scheduled deliveries", async () => {
  const db = await database();
  try {
    await db.query(
      "WITH history AS (INSERT INTO orders(order_source,status,total,created_at) SELECT 'app','completed',112,(inv_business_date()-d)::timestamp AT TIME ZONE 'Asia/Manila' FROM generate_series(1,35) d RETURNING id) INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity,unit_cost) SELECT id,$1,2,2 FROM history",
      [stock],
    );
    await db.exec("SELECT inv_refresh_forecasts()");
    const supplier = (
      await db.query<{ id: string }>(
        "INSERT INTO suppliers(name) VALUES('Fixture supplier') RETURNING id",
      )
    ).rows[0].id;
    const po = (
      await db.query<{ id: string }>(
        "INSERT INTO purchase_orders(supplier_id,status,expected_on) VALUES($1,'ordered',inv_business_date()+2) RETURNING id",
        [supplier],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO purchase_order_lines(purchase_order_id,ingredient_id,quantity,unit_cost) VALUES($1,$2,100,2)",
      [po, stock],
    );
    for (const horizon of [7, 14, 30]) {
      const result = await call<{
        history: { quantity: number }[];
        projection: {
          without_deliveries: number;
          with_scheduled_deliveries: number;
        }[];
        forecast: { method: string };
        stale: boolean;
      }>(db, "admin_stock_insight($1,$2)", [stock, horizon]);
      assert.equal(result.history.length, 56);
      assert.equal(result.history[0].quantity, 0);
      assert.equal(result.projection.length, horizon + 1);
      assert.equal(result.forecast.method, "weekday_8_weeks");
      assert.equal(result.stale, false);
      assert.equal(
        Number(result.projection[2].with_scheduled_deliveries) -
          Number(result.projection[2].without_deliveries),
        100,
      );
    }
    await assert.rejects(
      call(db, "admin_stock_insight($1,200)", [stock]),
      /7, 14 or 30/,
    );
    await db.exec(
      "UPDATE inventory_forecasts SET calculated_at=now()-interval '2 days'",
    );
    assert.equal(
      (
        await call<{ stale: boolean }>(db, "admin_stock_insight($1,14)", [
          stock,
        ])
      ).stale,
      true,
    );
  } finally {
    await db.close();
  }
});
test("replenishment requires reviewed fresh quantities, leaves stock unchanged and protects edited drafts", async () => {
  const db = await database();
  try {
    const supplier = (
      await db.query<{ id: string }>(
        "INSERT INTO suppliers(name) VALUES('Fixture supplier') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "UPDATE ingredients SET supplier_id=$2,pack_size=10,min_stock_alert=20 WHERE id=$1",
      [stock, supplier],
    );
    await db.query(
      "INSERT INTO inventory_forecasts(ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate) VALUES($1,14,28,2,35,'weekday_8_weeks',false) ON CONFLICT(ingredient_id,horizon) DO UPDATE SET demand=28,daily_demand=2,history_days=35,method='weekday_8_weeks',historical_estimate=false,calculated_at=now()",
      [stock],
    );
    type Preview = { review_hash: string; lines: { quantity: number }[] };
    const first = await call<Preview>(db, "admin_replenishment_preview()");
    assert.equal(first.lines.length, 1);
    await db.query(
      "UPDATE ingredients SET safety_days=safety_days+10 WHERE id=$1",
      [stock],
    );
    await assert.rejects(
      call(db, "admin_create_replenishment($1)", [first.review_hash]),
      /Suggestions changed/,
    );
    const current = await call<Preview>(db, "admin_replenishment_preview()");
    await call(db, "admin_create_replenishment($1)", [current.review_hash]);
    const lines = (
      await db.query<{ quantity: number }>(
        "SELECT quantity FROM purchase_order_lines",
      )
    ).rows;
    assert.equal(Number(lines[0].quantity), Number(current.lines[0].quantity));
    assert.equal(
      (
        await db.query<{ current_stock: number }>(
          "SELECT current_stock FROM ingredients WHERE id=$1",
          [stock],
        )
      ).rows[0].current_stock.toString(),
      "10",
    );
    await assert.rejects(
      call(db, "admin_create_replenishment($1)", [current.review_hash]),
      /Suggestions changed/,
    );
    await db.exec("UPDATE purchase_orders SET manually_edited=true");
    const edited = await call<Preview>(db, "admin_replenishment_preview()");
    assert.equal(edited.lines.length, 0);
    await call(db, "admin_create_replenishment($1)", [edited.review_hash]);
    assert.equal(
      (await db.query("SELECT * FROM purchase_order_lines")).rows.length,
      1,
    );
    await assert.rejects(
      call(db, "inv_generate_drafts()"),
      /Review replenishment/,
    );
  } finally {
    await db.close();
  }
});
