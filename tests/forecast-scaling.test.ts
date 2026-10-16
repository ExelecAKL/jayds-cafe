import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("single-scan forecasting preserves every horizon, calendar zero, sparse/weekday method and estimate flag", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true; INSERT INTO profiles(id,role) VALUES('10000000-0000-4000-8000-000000000001','admin'); INSERT INTO ingredients(id,name,current_stock) VALUES('30000000-0000-4000-8000-000000000001','Long history',100),('30000000-0000-4000-8000-000000000002','Sparse',100),('30000000-0000-4000-8000-000000000003','No history',100)",
    );
    for (const file of [
      "20261002000100_inventory_operations.sql",
      "20261002000200_atomic_orders_forecasts.sql",
      "20261002000300_operations_overview.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false)",
    );
    for (let day = 1; day <= 60; day++) {
      if (day % 5 === 0) continue;
      const id = (
        await db.query<{ id: string }>(
          "INSERT INTO orders(status,created_at) VALUES('completed',(inv_business_date()-$1::integer)+interval '6 hours') RETURNING id",
          [day],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity) VALUES($1,'30000000-0000-4000-8000-000000000001',$2)",
        [id, (day % 7) + 1],
      );
      if (day <= 9)
        await db.query(
          "INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity) VALUES($1,'30000000-0000-4000-8000-000000000002',3)",
          [id],
        );
    }
    const read = async () =>
      (
        await db.query<{
          ingredient_id: string;
          horizon: number;
          demand: number;
          daily_demand: number;
          history_days: number;
          method: string;
          historical_estimate: boolean;
        }>(
          "SELECT ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate FROM inventory_forecasts ORDER BY ingredient_id,horizon",
        )
      ).rows;
    await db.exec("SELECT inv_refresh_forecasts()");
    const old = await read();
    await db.exec(
      readFileSync(
        "supabase/migrations/20261016001100_forecast_scaling.sql",
        "utf8",
      ),
    );
    await db.exec("SELECT inv_refresh_forecasts()");
    const current = await read();
    assert.equal(current.length, 9);
    for (let index = 0; index < old.length; index++) {
      const { demand, daily_demand, ...metadata } = old[index],
        next = current[index];
      assert.deepEqual(
        { ...next, demand: undefined, daily_demand: undefined },
        { ...metadata, demand: undefined, daily_demand: undefined },
      );
      assert.ok(Math.abs(Number(next.demand) - Number(demand)) < 1e-9);
      assert.ok(
        Math.abs(Number(next.daily_demand) - Number(daily_demand)) < 1e-9,
      );
    }
    assert.equal(
      (await db.query("SELECT 1 FROM purchase_orders")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
