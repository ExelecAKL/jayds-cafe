import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  forecastDemand,
  replenishment,
} from "../packages/shared/src/inventory/forecast.ts";

const adminId = "10000000-0000-4000-8000-000000000001";
const customerId = "10000000-0000-4000-8000-000000000002";
const menuId = "20000000-0000-4000-8000-000000000001";
const ingredientId = "30000000-0000-4000-8000-000000000001";
async function database(stock = 10) {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false)",
  );
  await db.query(
    "INSERT INTO profiles(id,role,points) VALUES($1,'admin',100),($2,'customer',100)",
    [adminId, customerId],
  );
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock) VALUES($1,'Beans',$2)",
    [ingredientId, stock],
  );
  await db.query(
    "INSERT INTO menu_items(id,name,price) VALUES($1,'Coffee',100)",
    [menuId],
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
    [menuId, ingredientId],
  );
  for (const migration of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + migration, "utf8"));
  await db.query("UPDATE inventory_settings SET enforcement_enabled=true");
  return db;
}
async function create(
  db: PGlite,
  key = "test-order-0000000001",
  quantity = 1,
  extra: Record<string, unknown> = {},
) {
  const order = {
    order_source: "pos",
    customer_id: null,
    order_type: "pickup",
    payment_method: "cash",
    subtotal: 100 * quantity,
    total: 100 * quantity,
    discount: 0,
    points_redeemed: 0,
    ...extra,
  };
  const items = [
    {
      menu_item_id: menuId,
      price: 100,
      quantity,
      subtotal: 100 * quantity,
      variants: [],
    },
  ];
  const result = await db.query<{ result: { id: string; total: number } }>(
    "SELECT inv_create_order($1::jsonb,$2::jsonb,$3,$4,NULL,$5) result",
    [
      JSON.stringify(order),
      JSON.stringify(items),
      key,
      order.order_source === "app" ? order.customer_id : adminId,
      key,
    ],
  );
  return result.rows[0].result;
}
test("PostgreSQL reserves stock across simultaneous channel submissions and rejects overselling atomically", async () => {
  const db = await database(2);
  try {
    const results = await Promise.allSettled([
      create(db, "pos-order-00000000001"),
      create(db, "app-order-00000000001", 1, {
        order_source: "app",
        customer_id: customerId,
      }),
    ]);
    assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM orders",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query<{ available_stock: string }>(
          "SELECT available_stock FROM stock_overview",
        )
      ).rows[0].available_stock,
      "0",
    );
  } finally {
    await db.close();
  }
});
test("stock is consumed once at preparation and cancellation releases only unconsumed reservations", async () => {
  const db = await database();
  try {
    const order = await create(db);
    await db.query(
      "UPDATE orders SET payment_status='paid',status='preparing' WHERE id=$1",
      [order.id],
    );
    await db.query("UPDATE orders SET status='ready' WHERE id=$1", [order.id]);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      order.id,
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      8,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stock_movements WHERE movement_type='consumption'",
        )
      ).rows[0].count,
      1,
    );
    const second = await create(db, "second-order-00000001");
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      second.id,
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ available_stock: string }>(
            "SELECT available_stock FROM stock_overview",
          )
        ).rows[0].available_stock,
      ),
      8,
    );
  } finally {
    await db.close();
  }
});
test("submission retries are idempotent and snapshots survive recipe edits", async () => {
  const db = await database();
  try {
    const order = await create(db);
    assert.equal((await create(db)).id, order.id);
    await db.query("UPDATE menu_item_ingredients SET quantity_used=9");
    await db.query(
      "UPDATE orders SET status='preparing',payment_status='paid' WHERE id=$1",
      [order.id],
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      8,
    );
  } finally {
    await db.close();
  }
});
test("expired batches cannot be sold and unauthenticated callers cannot access operational records or RPCs", async () => {
  const db = await database();
  try {
    await db.query("UPDATE stock_batches SET expires_on=inv_business_date()-1");
    await assert.rejects(create(db), /Insufficient stock/);
    await db.exec(
      "SET ROLE anon; SELECT set_config('request.jwt.claim.role','anon',false)",
    );
    assert.equal((await db.query("SELECT * FROM ingredients")).rows.length, 0);
    await assert.rejects(
      db.query("SELECT inv_post_movement($1,1,'receipt','forged')", [
        ingredientId,
      ]),
      /permission denied/,
    );
    const catalog = await db.query<{
      catalog: { menuItems: { is_available: boolean }[] };
    }>("SELECT get_published_catalog() catalog");
    assert.equal(catalog.rows[0].catalog.menuItems[0].is_available, false);
  } finally {
    await db.close();
  }
});
test("receipts remain idempotent, waste is audited, and stale physical counts require recounting", async () => {
  const db = await database();
  try {
    const key = "40000000-0000-4000-8000-000000000001";
    const call = () =>
      db.query(
        "SELECT inv_post_movement($1,5,'receipt','Delivery',2,'Batch A',NULL,$2)",
        [ingredientId, key],
      );
    await call();
    await call();
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      15,
    );
    const count = await db.query<{ id: string }>(
      "INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason) SELECT id,current_stock,14,stock_version,'Physical count' FROM ingredients RETURNING id",
    );
    await db.query("SELECT inv_post_movement($1,1,'waste','Spill')", [
      ingredientId,
    ]);
    await assert.rejects(
      db.query("SELECT inv_post_stocktake($1)", [count.rows[0].id]),
      /Recount/,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stock_movements WHERE movement_type='waste'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
test("purchase approval never adds stock; partial receiving validates outstanding quantities", async () => {
  const db = await database();
  try {
    const supplier = await db.query<{ id: string }>(
      "INSERT INTO suppliers(name) VALUES('Supplier') RETURNING id",
    );
    const po = await db.query<{ id: string }>(
      "SELECT inv_save_po(NULL,$1,NULL,'Order',$2::jsonb) id",
      [
        supplier.rows[0].id,
        JSON.stringify([
          { ingredient_id: ingredientId, quantity: 10, unit_cost: 2 },
        ]),
      ],
    );
    await db.query("SELECT inv_po_transition($1,'approved')", [po.rows[0].id]);
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      10,
    );
    await db.query("SELECT inv_po_transition($1,'ordered')", [po.rows[0].id]);
    const lines = JSON.stringify([
      { ingredient_id: ingredientId, quantity: 6, batch_code: "Lot 1" },
    ]);
    await db.query(
      "SELECT inv_receive_po($1,'Delivery 1',$2::jsonb,'40000000-0000-4000-8000-000000000002')",
      [po.rows[0].id, lines],
    );
    await assert.rejects(
      db.query(
        "SELECT inv_receive_po($1,' Delivery 1 ',$2::jsonb,'40000000-0000-4000-8000-000000000004')",
        [
          po.rows[0].id,
          JSON.stringify([{ ingredient_id: ingredientId, quantity: 1 }]),
        ],
      ),
      /duplicate|unique/i,
    );
    await assert.rejects(
      db.query(
        "SELECT inv_receive_po($1,'Delivery 2',$2::jsonb,'40000000-0000-4000-8000-000000000003')",
        [po.rows[0].id, lines],
      ),
      /outstanding/,
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      16,
    );
  } finally {
    await db.close();
  }
});
test("forecast math includes calendar zeros, uses weekday history, and rounds replenishment packs", () => {
  const history = [{ date: "2026-09-18", quantity: 14 }];
  const forecast = forecastDemand(history, "2026-10-02", 14);
  assert.equal(forecast.demand, 14);
  assert.equal(forecast.method, "trailing_14_days");
  const reorder = replenishment({
    dailyDemand: 10,
    available: 20,
    incoming: 10,
    minStock: 0,
    leadDays: 3,
    safetyDays: 2,
    reviewDays: 7,
    packSize: 25,
    minPacks: 1,
  });
  assert.equal(reorder.reorder, 100);
  assert.equal(forecastDemand([], "2026-10-02", 7).demand, 0);
  assert.equal(
    forecastDemand([{ date: "2026-08-07", quantity: 80 }], "2026-10-02", 7)
      .method,
    "weekday_8_weeks",
  );
});

test("rewards and voucher counters roll back completely when reservations fail", async () => {
  const db = await database(1);
  try {
    const voucher = (
      await db.query<{ id: string }>(
        "INSERT INTO vouchers(discount_type,discount_value) VALUES('fixed',5) RETURNING id",
      )
    ).rows[0].id;
    const body = JSON.stringify({
      order_source: "app",
      customer_id: customerId,
      order_type: "pickup",
      payment_method: "cash",
      subtotal: 100,
      total: 85,
      discount: 15,
      points_redeemed: 100,
    });
    const lines = JSON.stringify([
      {
        menu_item_id: menuId,
        price: 100,
        quantity: 1,
        subtotal: 100,
        variants: [],
      },
    ]);
    await assert.rejects(
      db.query("SELECT inv_create_order($1,$2,$3,$4,$5,$6)", [
        body,
        lines,
        "failed-rewards-000001",
        customerId,
        voucher,
        "fingerprint",
      ]),
      /Insufficient stock/,
    );
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM profiles WHERE id=$1",
          [customerId],
        )
      ).rows[0].points,
      100,
    );
    assert.equal(
      (
        await db.query<{ uses_count: number }>(
          "SELECT uses_count FROM vouchers",
        )
      ).rows[0].uses_count,
      0,
    );
    assert.equal((await db.query("SELECT * FROM orders")).rows.length, 0);
    await db.query("SELECT inv_post_movement($1,10,'receipt','Replenish')", [
      ingredientId,
    ]);
    const result = await db.query(
      "SELECT inv_create_order($1,$2,$3,$4,$5,$6)",
      [
        body,
        lines,
        "success-rewards-00001",
        customerId,
        voucher,
        "fingerprint",
      ],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM profiles WHERE id=$1",
          [customerId],
        )
      ).rows[0].points,
      0,
    );
  } finally {
    await db.close();
  }
});

test("replacement ingredients and size multipliers resolve exact configuration availability", async () => {
  const db = await database(0);
  try {
    const replacement = (
      await db.query<{ id: string }>(
        "INSERT INTO ingredients(name,unit) VALUES('Alternative','ml') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "SELECT inv_post_movement($1,20,'receipt','Alternative milk')",
      [replacement],
    );
    await db.query(
      "INSERT INTO item_variants(menu_item_id,variant_group,label) VALUES($1,'milk_sub','Alternative'),($1,'size','Large')",
      [menuId],
    );
    await db.query("UPDATE menu_item_ingredients SET size_multipliers=$1", [
      JSON.stringify({ Large: 2 }),
    ]);
    await db.query(
      "INSERT INTO variant_ingredients(variant_group,variant_label,ingredient_id,quantity_used,replaces_ingredient_id) VALUES('milk_sub','Alternative',$1,3,$2)",
      [replacement, ingredientId],
    );
    const options = JSON.stringify([
      { variant_group: "milk_sub", label: "Alternative", price_modifier: 0 },
      { variant_group: "size", label: "Large", price_modifier: 0 },
    ]);
    const req = (
      await db.query<{ ingredient_id: string; quantity: string }>(
        "SELECT * FROM inv_requirements($1,$2,2)",
        [menuId, options],
      )
    ).rows;
    assert.equal(req.length, 1);
    assert.equal(req[0].ingredient_id, replacement);
    assert.equal(Number(req[0].quantity), 12);
    const availability = (
      await db.query<{ value: { options: Record<string, boolean> } }>(
        "SELECT get_configuration_availability($1,$2,1) value",
        [menuId, "[]"],
      )
    ).rows[0].value;
    assert.equal(availability.options["milk_sub:Alternative"], true);
    const body = JSON.stringify({
      order_source: "pos",
      order_type: "pickup",
      payment_method: "cash",
      subtotal: 100,
      total: 100,
      discount: 0,
    });
    await db.query("SELECT inv_create_order($1,$2,$3,$4,NULL,$3)", [
      body,
      JSON.stringify([
        {
          menu_item_id: menuId,
          price: 100,
          quantity: 1,
          subtotal: 100,
          variants: JSON.parse(options),
        },
      ]),
      "substitution-00000001",
      adminId,
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ available_stock: string }>(
            "SELECT available_stock FROM stock_overview WHERE id=$1",
            [replacement],
          )
        ).rows[0].available_stock,
      ),
      14,
    );
  } finally {
    await db.close();
  }
});

test("maintenance reallocates expired batches, flags unresolved shortages, and expires unpaid orders", async () => {
  const db = await database(2);
  try {
    const order = await create(db);
    await db.query("UPDATE stock_batches SET expires_on=inv_business_date()-1");
    await db.query("SELECT inv_maintenance()");
    assert.equal(
      (
        await db.query<{ stock_conflict: boolean }>(
          "SELECT stock_conflict FROM orders WHERE id=$1",
          [order.id],
        )
      ).rows[0].stock_conflict,
      true,
    );
    await assert.rejects(
      db.query(
        "UPDATE orders SET payment_status='paid',status='preparing' WHERE id=$1",
        [order.id],
      ),
      /Insufficient stock/,
    );
    await db.query("SELECT inv_post_movement($1,2,'receipt','Fresh lot')", [
      ingredientId,
    ]);
    await db.query("SELECT inv_maintenance()");
    assert.equal(
      (
        await db.query<{ stock_conflict: boolean }>(
          "SELECT stock_conflict FROM orders WHERE id=$1",
          [order.id],
        )
      ).rows[0].stock_conflict,
      false,
    );
    assert.equal(
      Number(
        (
          await db.query<{ reserved: string }>(
            "SELECT reserved FROM stock_batches WHERE batch_code='Opening balance · reconcile before activation'",
          )
        ).rows[0].reserved,
      ),
      0,
    );
    await db.query(
      "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [order.id],
    );
    await db.query("SELECT inv_maintenance()");
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [order.id],
        )
      ).rows[0].status,
      "cancelled",
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM stock_reservations WHERE state='reserved'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("forecast fixtures generate pack-rounded drafts and preserve human edits without duplicates", async () => {
  const db = await database(10);
  try {
    const supplier = (
      await db.query<{ id: string }>(
        "INSERT INTO suppliers(name) VALUES('Preferred') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "UPDATE ingredients SET supplier_id=$1,pack_size=25,min_stock_alert=0",
      [supplier],
    );
    await db.query(
      "WITH o AS(INSERT INTO orders(status,payment_status,subtotal,total,created_at) SELECT 'completed','paid',100,100,(inv_business_date()-d)::timestamp AT TIME ZONE 'Asia/Manila' FROM generate_series(1,56) d RETURNING id) INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity) SELECT id,$1,20 FROM o",
      [ingredientId],
    );
    await db.query("SELECT inv_refresh_forecasts()");
    await db.query("SELECT inv_generate_drafts()");
    await db.query("SELECT inv_generate_drafts()");
    const forecasts = (
      await db.query<{ horizon: number; demand: string; history_days: number }>(
        "SELECT * FROM inventory_forecasts ORDER BY horizon",
      )
    ).rows;
    assert.deepEqual(
      forecasts.map((f) => Number(f.demand)),
      [140, 280, 600],
    );
    assert.equal(forecasts[0].history_days, 56);
    const po = (
      await db.query<{ id: string }>("SELECT id FROM purchase_orders")
    ).rows[0].id;
    assert.equal(
      (await db.query("SELECT * FROM purchase_orders")).rows.length,
      1,
    );
    assert.equal(
      Number(
        (
          await db.query<{ quantity: string }>(
            "SELECT quantity FROM purchase_order_lines",
          )
        ).rows[0].quantity,
      ),
      250,
    );
    await db.query("SELECT inv_save_po($1,$2,NULL,'Human decision',$3)", [
      po,
      supplier,
      JSON.stringify([
        { ingredient_id: ingredientId, quantity: 300, unit_cost: 2 },
      ]),
    ]);
    await db.query("SELECT inv_generate_drafts()");
    assert.equal(
      (await db.query("SELECT * FROM purchase_orders")).rows.length,
      1,
    );
    assert.equal(
      Number(
        (
          await db.query<{ quantity: string }>(
            "SELECT quantity FROM purchase_order_lines",
          )
        ).rows[0].quantity,
      ),
      300,
    );
    await db.query("SELECT inv_po_transition($1,'approved')", [po]);
    const live = (
      await db.query<{ incoming_stock: string; reorder_quantity: string }>(
        "SELECT * FROM forecast_overview WHERE horizon=14",
      )
    ).rows[0];
    assert.equal(Number(live.incoming_stock), 300);
    assert.equal(Number(live.reorder_quantity), 0);
    assert.ok(
      (await db.query("SELECT * FROM forecast_snapshots")).rows.length >= 3,
    );
  } finally {
    await db.close();
  }
});

test("manual disabling and archived publication survive receiving; private RPCs reject customer roles", async () => {
  const db = await database();
  try {
    await db.query(
      "UPDATE menu_items SET manually_available=false,is_available=false",
    );
    await db.query("SELECT inv_post_movement($1,10,'receipt','Restock')", [
      ingredientId,
    ]);
    assert.equal(
      (
        await db.query<{ manually_available: boolean }>(
          "SELECT manually_available FROM menu_items",
        )
      ).rows[0].manually_available,
      false,
    );
    await db.query("UPDATE menu_items SET status='archived'");
    const catalog = (
      await db.query<{ value: { menuItems: unknown[] } }>(
        "SELECT get_published_catalog() value",
      )
    ).rows[0].value;
    assert.equal(catalog.menuItems.length, 0);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      customerId,
    ]);
    await db.exec(
      "SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false)",
    );
    assert.equal(
      (await db.query("SELECT * FROM stock_overview")).rows.length,
      0,
    );
    assert.equal((await db.query("SELECT * FROM suppliers")).rows.length, 0);
    await assert.rejects(
      db.query("SELECT inv_dashboard(7)"),
      /Admin access required/,
    );
    await assert.rejects(
      db.query("SELECT inv_refresh_forecasts()"),
      /Admin access required/,
    );
    assert.equal(
      (await db.query("UPDATE ingredients SET current_stock=999 RETURNING id"))
        .rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("parked orders reserve nothing and revalidate stock, prices, recipes, and cost when resumed", async () => {
  const db = await database(2);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      adminId,
    ]);
    const parked = await create(db, "parked-order-00000001", 1, {
      is_parked: true,
    });
    assert.equal(
      (await db.query("SELECT * FROM stock_reservations")).rows.length,
      0,
    );
    const regular = await create(db, "regular-order-0000001");
    await assert.rejects(
      db.query("SELECT inv_resume_order($1)", [parked.id]),
      /availability|stock/i,
    );
    assert.equal(
      (
        await db.query<{ is_parked: boolean }>(
          "SELECT is_parked FROM orders WHERE id=$1",
          [parked.id],
        )
      ).rows[0].is_parked,
      true,
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      regular.id,
    ]);
    await db.query("UPDATE menu_items SET price=110 WHERE id=$1", [menuId]);
    await assert.rejects(
      db.query("SELECT inv_resume_order($1)", [parked.id]),
      /Prices changed/,
    );
    await db.query("UPDATE menu_items SET price=100 WHERE id=$1", [menuId]);
    await db.query("UPDATE menu_item_ingredients SET quantity_used=1");
    await db.query(
      "SELECT inv_post_movement($1,2,'receipt','Fresh lot',4,'New batch')",
      [ingredientId],
    );
    await db.query("SELECT inv_resume_order($1)", [parked.id]);
    const accepted = (
      await db.query<{ quantity: string; unit_cost: string }>(
        "SELECT quantity,unit_cost FROM order_stock_requirements WHERE order_id=$1",
        [parked.id],
      )
    ).rows[0];
    assert.equal(Number(accepted.quantity), 1);
    assert.equal(
      Number(accepted.unit_cost),
      1,
      "Cost comes from the allocated opening batch",
    );
    await assert.rejects(
      db.query("SELECT inv_resume_order($1)", [parked.id]),
      /already resumed/,
    );
    await db.query(
      "UPDATE orders SET payment_status='paid',status='preparing' WHERE id=$1",
      [parked.id],
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      3,
    );
  } finally {
    await db.close();
  }
});

test("same-ingredient substitutions can reduce or remove sugar without changing accepted requirements", async () => {
  const db = await database(10);
  try {
    const sugar = (
      await db.query<{ id: string }>(
        "INSERT INTO ingredients(name,unit) VALUES('Sugar','g') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "SELECT inv_post_movement($1,20,'receipt','Sugar received')",
      [sugar],
    );
    await db.query(
      "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used,size_multipliers) VALUES($1,$2,4,$3)",
      [menuId, sugar, JSON.stringify({ Large: 2 })],
    );
    await db.query(
      "INSERT INTO item_variants(menu_item_id,variant_group,label) VALUES($1,'sugar_level','Half'),($1,'sugar_level','None'),($1,'size','Large')",
      [menuId],
    );
    const save = (
      label: string,
      quantity: number,
      replacement: string | null = sugar,
    ) =>
      db.query("SELECT inv_save_variant_recipes('sugar_level',$1,$2)", [
        label,
        JSON.stringify([
          {
            ingredient_id: sugar,
            quantity_used: quantity,
            replaces_ingredient_id: replacement,
          },
        ]),
      ]);
    await save("Half", 2);
    await save("None", 0);
    const config = JSON.stringify([
      { variant_group: "sugar_level", label: "Half", price_modifier: 0 },
      { variant_group: "size", label: "Large", price_modifier: 0 },
    ]);
    const req = (
      await db.query<{ ingredient_id: string; quantity: string }>(
        "SELECT * FROM inv_requirements($1,$2,1)",
        [menuId, config],
      )
    ).rows;
    assert.equal(
      Number(req.find((r) => r.ingredient_id === sugar)?.quantity),
      4,
    );
    const none = (
      await db.query<{ ingredient_id: string }>(
        "SELECT * FROM inv_requirements($1,$2,1)",
        [
          menuId,
          JSON.stringify([{ variant_group: "sugar_level", label: "None" }]),
        ],
      )
    ).rows;
    assert.equal(
      none.some((r) => r.ingredient_id === sugar),
      false,
    );
    assert.equal(none.length, 1, "The coffee base remains required");
    await assert.rejects(save("Half", 0, null), /replacement required/i);
    assert.equal(
      Number(
        (
          await db.query<{ quantity_used: string }>(
            "SELECT quantity_used FROM variant_ingredients WHERE variant_label='Half'",
          )
        ).rows[0].quantity_used,
      ),
      2,
      "Failed recipe save rolls back the old mapping",
    );
  } finally {
    await db.close();
  }
});

test("sparse forecasts include calendar zeros, expose expiry, and leave threshold purchases to an administrator", async () => {
  const db = await database(10);
  try {
    const supplier = (
      await db.query<{ id: string }>(
        "INSERT INTO suppliers(name) VALUES('Sparse supplier') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "UPDATE ingredients SET supplier_id=$1,pack_size=25,min_stock_alert=50",
      [supplier],
    );
    await db.query("UPDATE stock_batches SET expires_on=inv_business_date()+1");
    const old = (
      await db.query<{ id: string }>(
        "INSERT INTO orders(status,payment_status,subtotal,total,created_at) VALUES('completed','paid',100,100,(inv_business_date()-2)::timestamp AT TIME ZONE 'Asia/Manila') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity) VALUES($1,$2,14)",
      [old, ingredientId],
    );
    await db.query("SELECT inv_refresh_forecasts()");
    const forecast = (
      await db.query<{
        demand: string;
        history_days: number;
        expiry_risk_quantity: string;
        reorder_quantity: string;
      }>("SELECT * FROM forecast_overview WHERE horizon=14")
    ).rows[0];
    assert.equal(Number(forecast.demand), 14);
    assert.equal(forecast.history_days, 2);
    assert.equal(Number(forecast.expiry_risk_quantity), 8);
    assert.equal(Number(forecast.reorder_quantity), 50);
    await db.query("SELECT inv_generate_drafts()");
    assert.equal(
      (await db.query("SELECT * FROM purchase_orders")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("activation requires fresh physical counts and settled orders", async () => {
  const db = await database(10);
  try {
    await db.query("UPDATE inventory_settings SET enforcement_enabled=false");
    const count = async () => {
      const id = (
        await db.query<{ id: string }>(
          "INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason) SELECT id,current_stock,current_stock,stock_version,'Opening reconciliation' FROM ingredients RETURNING id",
        )
      ).rows[0].id;
      await db.query("SELECT inv_post_stocktake($1)", [id]);
    };
    await assert.rejects(
      db.query("SELECT inv_activate(true)"),
      /physical counts/,
    );
    await count();
    await db.query("SELECT inv_post_movement($1,1,'receipt','New delivery')", [
      ingredientId,
    ]);
    await assert.rejects(
      db.query("SELECT inv_activate(true)"),
      /current physical counts/,
    );
    await count();
    const pending = await create(db, "activation-order-001");
    await assert.rejects(
      db.query("SELECT inv_activate(true)"),
      /Settle active/,
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      pending.id,
    ]);
    await db.query("SELECT inv_activate(true)");
    assert.equal(
      (
        await db.query<{ enforcement_enabled: boolean }>(
          "SELECT enforcement_enabled FROM inventory_settings",
        )
      ).rows[0].enforcement_enabled,
      true,
    );
  } finally {
    await db.close();
  }
});

test("expiry and cancellation atomically return points and vouchers once; reversal failures retain stock reservations", async () => {
  const db = await database(10);
  try {
    const voucher = (
      await db.query<{ id: string }>(
        "INSERT INTO vouchers(discount_type,discount_value) VALUES('fixed',5) RETURNING id",
      )
    ).rows[0].id;
    const submit = async (key: string) =>
      (
        await db.query<{ result: { id: string } }>(
          "SELECT inv_create_order($1,$2,$3,$4,$5,$3) result",
          [
            JSON.stringify({
              order_source: "app",
              customer_id: customerId,
              order_type: "pickup",
              payment_method: "cash",
              subtotal: 100,
              total: 94,
              discount: 6,
              points_redeemed: 10,
            }),
            JSON.stringify([
              {
                menu_item_id: menuId,
                price: 100,
                subtotal: 100,
                quantity: 1,
                variants: [],
              },
            ]),
            key,
            customerId,
            voucher,
          ],
        )
      ).rows[0].result.id;
    const state = async () =>
      (
        await db.query<{
          points: number;
          uses_count: number;
          available_stock: string;
        }>(
          "SELECT p.points,v.uses_count,s.available_stock FROM profiles p CROSS JOIN vouchers v CROSS JOIN stock_overview s WHERE p.id=$1 AND v.id=$2 AND s.id=$3",
          [customerId, voucher, ingredientId],
        )
      ).rows[0];
    const expired = await submit("expiry-rewards-00000001");
    assert.equal((await state()).points, 90);
    await db.query(
      "UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired],
    );
    await db.query("SELECT inv_maintenance()");
    let current = await state();
    assert.equal(current.points, 100);
    assert.equal(current.uses_count, 0);
    assert.equal(Number(current.available_stock), 10);
    assert.equal(
      (await db.query("SELECT * FROM voucher_claims")).rows.length,
      0,
    );
    const prepared = await submit("prepared-rewards-00001");
    await db.query(
      "UPDATE orders SET payment_status='paid',status='preparing' WHERE id=$1",
      [prepared],
    );
    const returned = (
      await db.query<{ rewards_returned: boolean }>(
        "UPDATE orders SET status='cancelled' WHERE id=$1 RETURNING rewards_returned",
        [prepared],
      )
    ).rows[0];
    assert.equal(
      returned.rewards_returned,
      true,
      "RETURNING exposes the database reversal to the existing cancellation API",
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      prepared,
    ]);
    current = await state();
    assert.equal(current.points, 100);
    assert.equal(current.uses_count, 0);
    assert.equal(
      Number(current.available_stock),
      8,
      "Preparation ingredients stay consumed",
    );
    const pending = await submit("failed-rewards-0000001");
    await db.exec(
      "CREATE FUNCTION fixture_fail_return() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.points>OLD.points THEN RAISE EXCEPTION 'Fixture reward failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_fail_return BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fixture_fail_return();",
    );
    await assert.rejects(
      db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [pending]),
      /Fixture reward failure/,
    );
    current = await state();
    assert.equal(current.points, 90);
    assert.equal(current.uses_count, 1);
    assert.equal(Number(current.available_stock), 6);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [pending],
        )
      ).rows[0].status,
      "pending",
    );
    assert.equal(
      (
        await db.query("SELECT * FROM voucher_claims WHERE order_id=$1", [
          pending,
        ])
      ).rows.length,
      1,
    );
    await db.exec("DROP TRIGGER fixture_fail_return ON profiles");
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      pending,
    ]);
    assert.equal((await state()).points, 100);
    const guest = (
      await db.query<{ result: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,NULL,$4,$3) result",
        [
          JSON.stringify({
            order_source: "app",
            customer_id: null,
            order_type: "pickup",
            payment_method: "cash",
            subtotal: 100,
            total: 95,
            discount: 5,
            points_redeemed: 0,
          }),
          JSON.stringify([
            {
              menu_item_id: menuId,
              price: 100,
              subtotal: 100,
              quantity: 1,
              variants: [],
            },
          ]),
          "guest-rewards-00000001",
          voucher,
        ],
      )
    ).rows[0].result.id;
    assert.equal((await state()).uses_count, 1);
    assert.equal(
      (await db.query("SELECT * FROM voucher_claims")).rows.length,
      0,
      "Guest voucher usage has no profile claim",
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [guest]);
    current = await state();
    assert.equal(current.uses_count, 0);
    assert.equal(current.points, 100);
    assert.equal(Number(current.available_stock), 8);
  } finally {
    await db.close();
  }
});
