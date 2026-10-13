import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceOrder } from "../apps/customer/app/api/orders/create/pricing.ts";

const product = "20000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000001";
const payload = { order_type: "pickup", payment_method: "cash", subtotal: 100, total: 90, discount: 10, points_redeemed: 0, voucher_code: "GOLDONLY", items: [{ menu_item_id: product, quantity: 1, price: 100, subtotal: 100, variants: [] }] };
function database(tier: string): SupabaseClient {
  return {
    from(table: string) {
      const value = table === "vouchers" ? { id: "30000000-0000-4000-8000-000000000001", target_tier: "gold", code: "GOLDONLY", is_active: true, uses_count: 0, max_uses: null, valid_from: null, valid_until: null, min_order_amount: 0, discount_type: "fixed", discount_value: 10, application_mode: "whole_order", applicable_item_ids: null, max_discount_amount: null }
        : table === "profiles" ? { id: customer, loyalty_tier: tier, points: 0 }
        : [{ id: product, name: "Isolated tier test coffee", price: 100, status: "active", is_available: true, manually_available: true, category: null, variants: [] }];
      const chain = {
        select() { return chain; }, eq() { return chain; },
        in() { return Promise.resolve({ data: value, error: null }); },
        maybeSingle() { return Promise.resolve({ data: value, error: null }); },
        single() { return Promise.resolve({ data: value, error: null }); },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}
test("Gold-only voucher pricing accepts an eligible Gold customer (positive control)", async () => {
  const priced = await priceOrder(database("gold"), payload, customer);
  assert.equal(priced.total, 90);
});
test("Gold-only voucher pricing rejects a Bronze customer before accepting a discount", async () => {
  await assert.rejects(priceOrder(database("bronze"), payload, customer), /tier|eligible|gold/i);
});
test("Gold-only voucher pricing rejects an unauthenticated guest before accepting a discount", async () => {
  await assert.rejects(priceOrder(database("bronze"), payload, null), /tier|eligible|gold|sign in/i);
});
