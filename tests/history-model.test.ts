import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCafeHistory,
  historyId,
  quantity,
  recipeRequirements,
  type HistoryInput,
} from "../scripts/history/model.ts";
const id = (key: string) => historyId("unit:" + key);
const now = new Date("2026-10-16T10:00:00Z");
function input(): HistoryInput {
  const ingredients = [
    "Espresso Beans",
    "Whole Milk",
    "Cup 16oz",
    "Cup 22oz",
    "Oat Milk",
    "Macadamia Syrup",
    "Almond Milk",
    "Brown Sugar Syrup",
    "Bread Flour",
  ].map((name, index) => ({
    id: id("stock:" + index),
    name,
    unit:
      index === 2 || index === 3
        ? "pcs"
        : index === 0 || index === 8
          ? "g"
          : "ml",
    cost_per_unit: index === 0 ? 0.8 : index === 2 ? 3.5 : 0.05,
    current_stock: 1000,
    stock_version: 1,
    stock_kind: index === 2 || index === 3 ? "packaging" : "ingredient",
    is_active: true,
  }));
  const menu = [
    {
      id: id("latte"),
      name: "Coffee Latte",
      price: 85,
      category_id: id("espresso"),
      status: "active",
    },
    {
      id: id("americano"),
      name: "Americano",
      price: 65,
      category_id: id("espresso"),
      status: "active",
    },
  ];
  const variants = menu.flatMap((m) => [
    {
      menu_item_id: m.id,
      variant_group: "size",
      label: "Medium 16oz",
      price_modifier: 0,
      is_default: true,
    },
    {
      menu_item_id: m.id,
      variant_group: "size",
      label: "Large 22oz",
      price_modifier: 25,
      is_default: false,
    },
  ]);
  variants.push(
    ...[
      { label: "Whole Milk", price_modifier: 0, is_default: true },
      { label: "Oat Milk Sub", price_modifier: 30, is_default: false },
    ].map((v) => ({
      menu_item_id: menu[0].id,
      variant_group: "milk_sub",
      ...v,
    })),
    {
      menu_item_id: menu[0].id,
      variant_group: "add_on",
      label: "Extra Shot",
      price_modifier: 20,
      is_default: false,
    },
  );
  const recipes = menu.flatMap((m) => [
    {
      menu_item_id: m.id,
      ingredient_id: ingredients[0].id,
      quantity_used: 18,
      size_multipliers: {},
    },
    {
      menu_item_id: m.id,
      ingredient_id: ingredients[2].id,
      quantity_used: 1,
      size_multipliers: {},
    },
  ]);
  recipes.push({
    menu_item_id: menu[0].id,
    ingredient_id: ingredients[1].id,
    quantity_used: 150,
    size_multipliers: {},
  });
  return {
    menu,
    categories: [
      {
        id: id("espresso"),
        name: "Espresso",
        is_active: true,
        status: "active",
      },
    ],
    variants,
    recipes,
    variantRecipes: [
      {
        id: id("large"),
        ingredient_id: ingredients[3].id,
        quantity_used: 1,
        variant_group: "size",
        variant_label: "Large 22oz",
        size_multipliers: {},
        replaces_ingredient_id: ingredients[2].id,
      },
      {
        id: id("oat"),
        ingredient_id: ingredients[4].id,
        quantity_used: 150,
        variant_group: "milk_sub",
        variant_label: "Oat Milk Sub",
        size_multipliers: {},
        replaces_ingredient_id: ingredients[1].id,
      },
      {
        id: id("shot"),
        ingredient_id: ingredients[0].id,
        quantity_used: 18,
        variant_group: "add_on",
        variant_label: "Extra Shot",
        size_multipliers: {},
        replaces_ingredient_id: null,
      },
    ],
    ingredients,
    profiles: ["admin", "staff", "customer", "customer"].map((role, index) => ({
      id: id("profile:" + index),
      role,
      points: 200,
      total_spent: 100,
      total_orders: 2,
      loyalty_tier: "Bronze",
      last_order_at: null,
      updated_at: "2026-10-16T00:00:00Z",
    })),
    batches: ingredients.map((i) => ({
      id: id("batch:" + i.id),
      ingredient_id: i.id,
      quantity: 1000,
      reserved: 0,
      unit_cost: i.cost_per_unit,
      expires_on: null,
      received_at: "2026-10-16T00:00:00Z",
    })),
    movements: [],
  };
}
test("20-month history is deterministic, linked and conserves money, recipes, rewards and batch quantities", () => {
  const source = input(),
    before = JSON.stringify(source),
    model = buildCafeHistory(source, { now }),
    again = buildCafeHistory(source, { now });
  assert.equal(
    JSON.stringify(source),
    before,
    "Generator does not mutate source records",
  );
  assert.deepEqual(model.manifest, again.manifest);
  assert.equal(model.id, again.id);
  assert.deepEqual(model.tables.orders, again.tables.orders);
  assert.equal(model.manifest.from, "2025-02-16");
  assert.equal(model.manifest.to, "2026-10-16");
  assert.ok(model.tables.orders.length > 8000);
  assert.ok(model.tables.stocktakes.length > 200);
  assert.ok(
    model.tables.stock_movements.some((m) => m.movement_type === "waste"),
  );
  const orders = new Map(model.tables.orders.map((o) => [o.id, o])),
    byOrder = new Map<unknown, typeof model.tables.order_items>();
  for (const item of model.tables.order_items) {
    assert.ok(orders.has(item.order_id));
    byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
  }
  const expected = new Map<string, number>();
  for (const order of model.tables.orders) {
    const items = byOrder.get(order.id)!;
    assert.equal(
      quantity(items.reduce((n, i) => n + Number(i.subtotal), 0)),
      order.subtotal,
    );
    assert.equal(
      Math.round(
        (Number(order.subtotal) -
          Number(order.discount) +
          Number(order.delivery_fee)) *
          100,
      ),
      Math.round(Number(order.total) * 100),
    );
    const hour = new Date(String(order.created_at)).getUTCHours() + 8;
    assert.ok(hour >= 13 && hour < 22);
    assert.ok(Date.parse(String(order.updated_at)) <= now.getTime());
    for (const item of items)
      for (const [ingredient, amount] of Object.entries(
        recipeRequirements(
          source,
          String(item.menu_item_id),
          item.variants as HistoryInput["variants"],
        ),
      ))
        expected.set(
          String(order.id) + ingredient,
          quantity(
            (expected.get(String(order.id) + ingredient) ?? 0) +
              amount * Number(item.quantity),
          ),
        );
  }
  for (const requirement of model.tables.order_stock_requirements)
    assert.equal(
      requirement.quantity,
      expected.get(
        String(requirement.order_id) + String(requirement.ingredient_id),
      ),
    );
  const eventTotal = model.tables.financial_events.reduce(
      (n, e) =>
        n +
        (e.kind === "refund" ? -1 : 1) *
          Number((e.breakdown as { total: number }).total),
      0,
    ),
    paidTotal = model.tables.orders
      .filter((o) => o.payment_status === "paid")
      .reduce((n, o) => n + Math.round(Number(o.total) * 100), 0);
  assert.equal(eventTotal, paidTotal);
  for (const batch of model.tables.stock_batches) {
    const moved = model.tables.stock_movements
      .filter((m) => m.batch_id === batch.id)
      .reduce((n, m) => n + Number(m.quantity), 0);
    assert.ok(
      Math.abs(quantity(moved) - Number(batch.quantity)) <= 0.000001,
      "Every batch reconciles",
    );
    assert.ok(Number(batch.quantity) >= 0);
  }
  for (const p of source.profiles.filter((p) => p.role === "customer")) {
    const own = model.tables.orders.filter(
        (o) => o.customer_id === p.id && o.status === "completed",
      ),
      next = model.updates.profiles.find((r) => r.id === p.id)!;
    assert.equal(
      next.points,
      p.points +
        own.reduce(
          (n, o) => n + Number(o.points_earned) - Number(o.points_redeemed),
          0,
        ),
    );
  }
  assert.ok(model.tables.purchase_orders.some((p) => p.status === "partial"));
  assert.ok(model.tables.purchase_orders.some((p) => p.status === "ordered"));
  for (const rows of Object.values(model.tables))
    for (const row of rows)
      for (const field of ["notes", "reason", "description"])
        assert.ok(
          !/\b(thesis|demo|synthetic)\b/i.test(String(row[field] ?? "")),
        );
  assert.equal(model.tables.finance_invoices, undefined);
  assert.equal(model.tables.customer_push_outbox, undefined);
  assert.equal(model.tables.auth_users, undefined);
});
