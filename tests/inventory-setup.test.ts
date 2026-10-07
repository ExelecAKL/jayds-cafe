import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("Inventory setup reports exact blockers and activates demo balances without changing old stock or orders", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true; INSERT INTO profiles(id,role) VALUES('10000000-0000-4000-8000-000000000001','admin');",
    );
    for (const name of [
      "Whole Milk",
      "Ice",
      "Cookies Crumble",
      "Strawberry Puree",
      "Espresso Beans",
      "Chocolate Chips",
      "Biscoff Spread",
    ])
      await db.query(
        "INSERT INTO ingredients(name,current_stock,unit) VALUES($1,10000,$2)",
        [name, ["Whole Milk", "Strawberry Puree"].includes(name) ? "ml" : "g"],
      );
    for (const [suffix, name] of [
      ["002", "Cookies & Cream"],
      ["005", "Strawberries & Cream"],
      ["008", "Java Chip"],
      ["00a", "Biscoff Frappe"],
    ])
      await db.query(
        "INSERT INTO menu_items(id,name,price) VALUES($1,$2,110)",
        ["e3000000-0000-4000-a000-000000000" + suffix, name],
      );
    await db.exec(
      "INSERT INTO orders(status,total,payment_status) VALUES('completed',110,'paid')",
    );
    for (const file of [
      "20261002000100_inventory_operations.sql",
      "20261002000200_atomic_orders_forecasts.sql",
      "20261002000300_operations_overview.sql",
      "20261002000500_inventory_admin_approval.sql",
      "20261002000600_inventory_readiness.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    const readiness = async () =>
      (
        await db.query<{
          value: {
            ready: boolean;
            missing_counts: unknown[];
            missing_recipes: unknown[];
          };
        }>("SELECT get_inventory_readiness() value")
      ).rows[0].value;
    const before = await readiness();
    assert.equal(before.ready, false);
    assert.equal(before.missing_counts.length, 7);
    assert.equal(before.missing_recipes.length, 4);
    const stockBefore = (
      await db.query("SELECT * FROM ingredients ORDER BY id")
    ).rows;
    const ordersBefore = (await db.query("SELECT * FROM orders ORDER BY id"))
      .rows;
    const script = readFileSync(
      "supabase/operations/activate_thesis_inventory.sql",
      "utf8",
    );
    await db.query(
      "UPDATE ingredients SET is_active=false WHERE name='Biscoff Spread'",
    );
    await assert.rejects(db.exec(script), /Demo ingredient unavailable/);
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM menu_item_ingredients",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stocktakes",
        )
      ).rows[0].count,
      0,
    );
    await db.query(
      "UPDATE ingredients SET is_active=true WHERE name='Biscoff Spread'",
    );
    await db.exec(script);
    assert.equal((await readiness()).ready, true);
    assert.equal(
      (
        await db.query<{ enabled: boolean }>(
          "SELECT enforcement_enabled enabled FROM inventory_settings",
        )
      ).rows[0].enabled,
      true,
    );
    assert.deepEqual(
      (await db.query("SELECT * FROM ingredients ORDER BY id")).rows,
      stockBefore,
    );
    assert.deepEqual(
      (await db.query("SELECT * FROM orders ORDER BY id")).rows,
      ordersBefore,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stocktakes WHERE state='posted' AND reason LIKE 'Thesis demo%'",
        )
      ).rows[0].count,
      7,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stock_movements WHERE movement_type='count' AND quantity<>0",
        )
      ).rows[0].count,
      0,
    );
    const recipesBeforeRetry = (
      await db.query("SELECT * FROM menu_item_ingredients ORDER BY id")
    ).rows;
    await db.exec(script);
    assert.deepEqual(
      (await db.query("SELECT * FROM menu_item_ingredients ORDER BY id")).rows,
      recipesBeforeRetry,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stocktakes",
        )
      ).rows[0].count,
      7,
    );
    await db.exec(
      "INSERT INTO menu_items(name,price,status) VALUES('Archived drink',110,'archived'); INSERT INTO menu_items(name,price,manually_available) VALUES('Disabled drink',110,false)",
    );
    assert.equal((await readiness()).ready, true);
    await db.exec(
      "SELECT inv_post_movement((SELECT id FROM ingredients WHERE name='Whole Milk'),1,'receipt','After opening count')",
    );
    const changed = await readiness();
    assert.equal(changed.ready, false);
    assert.equal(changed.missing_counts.length, 1);
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false); UPDATE profiles SET is_approved=false;",
    );
    await assert.rejects(
      db.query("SELECT get_inventory_readiness()"),
      /Admin access required/,
    );
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','anon',false); SET ROLE anon",
    );
    await assert.rejects(
      db.query("SELECT get_inventory_readiness()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
