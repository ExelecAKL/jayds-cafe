import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "10000000-0000-4000-8000-000000000001",
  staff = "10000000-0000-4000-8000-000000000002",
  item = "20000000-0000-4000-8000-000000000001";
async function call<T>(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ result: T }>(`SELECT ${sql} result`, args)).rows[0]
    .result;
}
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec(
    "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text;ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false;CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,token_hash text,is_used boolean);CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,receipt_token text,receipt_data jsonb,created_at timestamptz,expires_at timestamptz);",
  );
  await db.query(
    "INSERT INTO profiles(id,role,full_name) VALUES($1,'admin','Fixture Admin'),($2,'staff','Fixture Staff')",
    [admin, staff],
  );
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
    [admin],
  );
  for (const file of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261013000400_finance_invoices.sql",
    "20261016000400_admin_sales_reports.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query(
    "INSERT INTO menu_items(id,name,price) VALUES($1,'Latte (signature)',112)",
    [item],
  );
  return db;
}
type Report = {
  start: string;
  end: string;
  revenue: number;
  orders: number;
  previous_revenue: number;
  chart: { label: string; revenue: number; orders: number }[];
  best_sellers: { item_key: string; name: string; qty: number }[];
  heatmap: number[][];
};
test("Sales Reports aggregate beyond 200/1000 orders, preserve product identity, exclude invalid sales and keep Philippine midnight/year/hour boundaries in another session timezone", async () => {
  const db = await database();
  try {
    await db.query(
      "WITH history AS (INSERT INTO orders(order_source,status,payment_status,total,created_at) SELECT 'app','completed','paid',132,'2026-01-01T05:00:00Z' FROM generate_series(1,1205) RETURNING id) INSERT INTO order_items(order_id,menu_item_id,name,quantity,price,subtotal,variants) SELECT id,$1,'Latte (signature) (Regular)',1,132,132,'[{\"variant_group\":\"add_on\",\"label\":\"Extra Shot\"}]' FROM history",
      [item],
    );
    await db.query(
      "WITH edge AS (INSERT INTO orders(order_source,status,payment_status,total,created_at) VALUES('app','completed','paid',112,'2025-12-31T16:00:00Z') RETURNING id) INSERT INTO order_items(order_id,menu_item_id,name,quantity,price,subtotal,variants) SELECT id,$1,'Latte (signature)',1,112,112,'[]' FROM edge",
      [item],
    );
    await db.exec(
      "INSERT INTO orders(order_source,status,payment_status,total,created_at) VALUES('app','completed','paid',500,'2025-12-31T04:00:00Z'),('app','cancelled','paid',999,'2026-01-01T05:00:00Z'),('app','pending','paid',999,'2026-01-01T05:00:00Z'),('app','completed','pending',999,'2026-01-01T05:00:00Z');INSERT INTO orders(order_source,status,payment_status,total,created_at,is_parked,payment_review_required) VALUES('app','completed','paid',999,'2026-01-01T05:00:00Z',true,false),('app','completed','paid',999,'2026-01-01T05:00:00Z',false,true);",
    );
    const asOf = "2026-01-01T05:30:00Z";
    const report = await call<Report>(db, "admin_sales_report($1,$2)", [
      "today",
      asOf,
    ]);
    assert.equal(Number(report.orders), 1206);
    assert.equal(Number(report.revenue), 1205 * 132 + 112);
    assert.equal(Number(report.previous_revenue), 500);
    assert.equal(Date.parse(report.start), Date.parse("2025-12-31T16:00:00Z"));
    assert.equal(Number(report.heatmap[4][0]), 1205);
    assert.equal(report.heatmap.length, 7);
    assert.ok(report.heatmap.every((row) => row.length === 9));
    assert.equal(
      report.chart.reduce((sum, row) => sum + Number(row.revenue), 0),
      Number(report.revenue),
    );
    assert.deepEqual(
      report.chart.map((row) => row.label),
      ["00:00", "13:00"],
    );
    assert.equal(report.best_sellers[0].name, "Latte (signature)");
    assert.equal(Number(report.best_sellers[0].qty), 1206);
    assert.equal(report.best_sellers[0].item_key, item);
    const detail = await call<{
      total_sold: number;
      addons: { name: string; qty: number }[];
      hourly: { hour: string; qty: number }[];
    }>(db, "admin_sales_item($1,$2,$3)", [report.start, report.end, item]);
    assert.equal(Number(detail.total_sold), 1206);
    assert.equal(Number(detail.addons[0].qty), 1205);
    assert.equal(detail.addons[0].name, "Extra Shot");
    const page = await call<{
      orders: unknown[];
      total: number;
      revenue: number;
    }>(db, "admin_sales_orders($1,$2,4,13,120)", [report.start, report.end]);
    assert.equal(page.orders.length, 5);
    assert.equal(Number(page.total), 1205);
    assert.equal(Number(page.revenue), 1205 * 132);
    await db.exec("SET TIME ZONE 'America/Los_Angeles'");
    const otherZone = await call<Report>(db, "admin_sales_report('today',$1)", [
      asOf,
    ]);
    assert.deepEqual(otherZone.chart, report.chart);
    assert.deepEqual(otherZone.heatmap, report.heatmap);
    assert.equal(Date.parse(otherZone.start), Date.parse(report.start));
    for (const [period, start] of [
      ["week", "2025-12-28T16:00:00Z"],
      ["month", "2025-12-31T16:00:00Z"],
      ["year", "2025-12-31T16:00:00Z"],
    ]) {
      const result = await call<Report>(db, "admin_sales_report($1,$2)", [
        period,
        asOf,
      ]);
      assert.equal(Date.parse(result.start), Date.parse(start));
    }
  } finally {
    await db.close();
  }
});
test("report permissions require approved Admin and reject invalid periods/ranges without exposing another role's sales", async () => {
  const db = await database();
  try {
    for (const args of [
      [null, "2026-01-01"],
      ["unknown", "2026-01-01"],
      ["today", "infinity"],
    ])
      await assert.rejects(
        call(db, "admin_sales_report($1,$2)", args),
        /Choose/,
      );
    await assert.rejects(
      call(db, "admin_sales_orders('2020-01-01','2026-01-01',NULL,NULL,0)"),
      /valid report range/,
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [staff],
    );
    await assert.rejects(
      call(db, "admin_sales_report('today')"),
      /Approved Admin/,
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await db.query("UPDATE profiles SET is_approved=false WHERE id=$1", [
      admin,
    ]);
    await assert.rejects(
      call(db, "admin_sales_item(now(),now(),'fixture')"),
      /Approved Admin/,
    );
  } finally {
    await db.close();
  }
});

test("Overview and Sales Reports use the same collected-sales eligibility",async()=>{
 const db=await database();try{
  await db.exec("INSERT INTO orders(order_source,status,payment_status,total) VALUES('app','completed','paid',88),('app','pending','paid',999),('app','cancelled','paid',999);INSERT INTO orders(order_source,status,payment_status,total,is_parked,payment_review_required) VALUES('app','completed','paid',999,true,false),('app','completed','paid',999,false,true);");
  const overview=await call<{revenue:number;days:{revenue:number}[]}>(db,'inv_dashboard(1)');
  const report=await call<Report>(db,"admin_sales_report('today')");
  assert.equal(Number(overview.revenue),88);assert.equal(Number(overview.days[0].revenue),88);assert.equal(Number(report.revenue),88);
 }finally{await db.close();}
});
