import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteFinancials } from "../packages/shared/src/finance/quote.ts";
import { priceOrder } from "../apps/customer/app/api/orders/create/pricing.ts";

test("read-only quotes use trusted prices and configured delivery VAT without writing or spending rewards", async () => {
  const calls: string[] = [];
  const db = {
    rpc: async (name: string) => {
      calls.push(name);
      return { data: null, error: null };
    },
    from(table: string) {
      calls.push(table);
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        maybeSingle: async () => ({
          data:
            table === "finance_settings"
              ? { delivery_tax_treatment: "vat_inclusive" }
              : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [
              {
                id: "20000000-0000-4000-8000-000000000001",
                name: "Coffee",
                price: 112,
                status: "active",
                is_available: true,
                variants: [],
              },
            ],
            error: null,
          }).then(resolve),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  const item = {
    menu_item_id: "20000000-0000-4000-8000-000000000001",
    name: "Coffee",
    quantity: 1,
    price: 112,
    variants: [],
  };
  const quote = await quoteFinancials(db, { items: [item], deliveryFee: 112 });
  assert.equal(quote.total, 22400);
  assert.equal(quote.vat, 1200);
  assert.equal(quote.delivery_tax, 1200);
  assert.equal(quote.osd_gross_sales, 20000);
  const input = {
    order_type: "pickup",
    payment_method: "cash",
    points_redeemed: 0,
    items: [{ ...item, subtotal: 112 }],
    subtotal: 0,
    total: 0,
    discount: 0,
  };
  const priced = await priceOrder(db, input, null, false);
  assert.equal(priced.total, 112);
  assert.equal(priced.financialBreakdown.vat, 1200);
  await assert.rejects(priceOrder(db, input, null), /total has changed/);
  await assert.rejects(
    priceOrder(
      db,
      { ...input, items: [{ ...input.items[0], price: 1 }] },
      null,
      false,
    ),
    /price.*changed/,
  );
  assert.ok(
    calls.every((c) =>
      ["finance_check_quote", "finance_settings", "menu_items"].includes(c),
    ),
  );
});

test("SQL quote checks aggregate shared stock across products, validate options, deny callers and leave all sale records unchanged", async () => {
  const db = new PGlite();
  const admin = "10000000-0000-4000-8000-000000000001",
    item = "20000000-0000-4000-8000-000000000001",
    other = "20000000-0000-4000-8000-000000000002",
    ingredient = "30000000-0000-4000-8000-000000000001";
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text; ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false; CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false); CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz);",
    );
    await db.query("INSERT INTO profiles(id,role) VALUES($1,'admin');", [
      admin,
    ]);
    await db.query(
      "INSERT INTO ingredients(id,name,current_stock,cost_per_unit) VALUES($1,'Beans',12,2)",
      [ingredient],
    );
    await db.query(
      "INSERT INTO menu_items(id,name,price) VALUES($1,'Coffee',112),($2,'Another coffee',112)",
      [item, other],
    );
    await db.query(
      "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$3,2),($2,$3,2)",
      [item, other, ingredient],
    );
    for (const file of [
      "20261002000100_inventory_operations.sql",
      "20261002000200_atomic_orders_forecasts.sql",
      "20261002000300_operations_overview.sql",
      "20261002000400_pos_cashier.sql",
      "20261013000400_finance_invoices.sql",
      "20261016000500_finance_quotes.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','service_role',false); UPDATE inventory_settings SET enforcement_enabled=true",
    );
    const snapshot = async () =>
      (
        await db.query(
          "SELECT (SELECT count(*) FROM orders) orders,(SELECT count(*) FROM financial_events) events,(SELECT count(*) FROM finance_invoices) invoices,(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM stock_batches b) batches,(SELECT next_invoice FROM finance_settings) serial",
        )
      ).rows;
    const before = await snapshot();
    const coffee = {
      menu_item_id: item,
      name: "Coffee",
      price: 112,
      quantity: 1,
      subtotal: 112,
      variants: [],
    };
    const check = (items: unknown[]) =>
      db.query("SELECT finance_check_quote($1)", [JSON.stringify(items)]);
    await check([coffee]);
    await assert.rejects(
      check([
        { ...coffee, quantity: 4 },
        { ...coffee, menu_item_id: other, quantity: 4 },
      ]),
      /complete bag/,
    );
    await db.query(
      "INSERT INTO item_variants(menu_item_id,variant_group,label,is_default) VALUES($1,'milk_sub','Whole Milk',true)",
      [item],
    );
    await assert.rejects(check([coffee]), /required product options/);
    const selected = {
      ...coffee,
      variants: [
        { variant_group: "milk_sub", label: "Whole Milk", price_modifier: 0 },
      ],
    };
    await check([selected]);
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','authenticated',false)",
    );
    await assert.rejects(check([selected]), /Trusted quote server/);
    await assert.rejects(
      db.query("SELECT finance_unpaid_quote($1)", [item]),
      /Trusted quote server/,
    );
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.close();
  }
});
