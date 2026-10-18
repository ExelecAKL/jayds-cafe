import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { acceptedTicketTax } from "../apps/customer/lib/accepted-ticket.ts";
import { calculateFinancials } from "../packages/shared/src/finance/calculations.ts";

test("accepted ticket shows the saved item VAT without taxing pass-through delivery or changing the total", () => {
  const f = calculateFinancials({
    items: [
      { menu_item_id: "soda", name: "Strawberry Soda", price: 90, quantity: 1 },
    ],
    deliveryFee: 97,
    deliveryTaxTreatment: "pass_through",
  });
  assert.deepEqual(acceptedTicketTax(f, 187), {
    item_vat_centavos: 964,
    delivery_vat_centavos: 0,
  });
  assert.equal(f.total, 18700);
});

test("discounted item and configured delivery VAT are read separately from the immutable centavo snapshot", () => {
  const f = calculateFinancials({
    items: [{ menu_item_id: "latte", name: "Latte", price: 112, quantity: 2 }],
    promotion: { kind: "fixed", value: 22.4 },
    deliveryFee: 112,
    deliveryTaxTreatment: "vat_inclusive",
  });
  assert.deepEqual(acceptedTicketTax(f, 313.6), {
    item_vat_centavos: 2160,
    delivery_vat_centavos: 1200,
  });
  assert.deepEqual(
    acceptedTicketTax({ ...f, vat: 0, delivery_tax: null }, 313.6),
    { item_vat_centavos: 0, delivery_vat_centavos: null },
  );
});

test("missing, mismatched and corrupt snapshots remain unknown instead of inventing VAT", () => {
  const valid = {
    version: 1,
    currency: "PHP",
    vat: 964,
    delivery_tax: null,
    total: 18700,
  };
  for (const value of [
    null,
    {},
    { ...valid, version: 2 },
    { ...valid, currency: "USD" },
    { ...valid, total: 18000 },
    { ...valid, vat: -1 },
    { ...valid, vat: 9.64 },
    { ...valid, vat: Infinity },
    { ...valid, delivery_tax: -1 },
    { ...valid, delivery_tax: 19000 },
  ]) {
    assert.equal(acceptedTicketTax(value, 187), null);
  }
});

const require = createRequire(import.meta.url);
function fixture({
  denied = false,
  financeError = false,
  missing = false,
} = {}) {
  const reads: { table: string; columns?: string; orderId?: string }[] = [];
  const order = {
    id: "order-1",
    subtotal: 90,
    discount: 0,
    delivery_fee: 97,
    total: 187,
    name: "private",
  };
  const db = {
    from(table: string) {
      const read = { table } as (typeof reads)[number];
      reads.push(read);
      const query = {
        select(columns: string) {
          read.columns = columns;
          return query;
        },
        eq(field: string, value: string) {
          assert.equal(field, "order_id");
          read.orderId = value;
          return query;
        },
        order() {
          return Promise.resolve({
            data:
              table === "order_items"
                ? [
                    {
                      id: "line-1",
                      menu_item_id: "archived-menu",
                      name: "Accepted name",
                      subtotal: 90,
                      menu_item: {
                        image_url: "https://images.fixture/photo.webp",
                      },
                    },
                  ]
                : [],
            error: null,
          });
        },
        maybeSingle() {
          return Promise.resolve({
            data: missing
              ? null
              : {
                  breakdown: {
                    version: 1,
                    currency: "PHP",
                    vat: 964,
                    delivery_tax: null,
                    total: 18700,
                    private_accounting: "private",
                  },
                },
            error: financeError ? { message: "private database detail" } : null,
          });
        },
      };
      return query;
    },
  };
  class AccessError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } },
    "../../../../lib/accepted-ticket": { acceptedTicketTax },
    "../../../../lib/server-access": {
      ApiAccessError: AccessError,
      PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
      requireOrderAccess: async (_req: Request, id: string) => {
        assert.equal(id, order.id);
        if (denied) throw new AccessError("Order access denied", 403);
        return { db, order, canManage: true };
      },
      publicOrder: () => ({
        id: order.id,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        total: order.total,
      }),
      orderPickupCredentials: async () => ({}),
      apiAccessErrorResponse: (error: AccessError) =>
        Response.json({ error: error.message }, { status: error.status }),
    },
  };
  const mod = { exports: {} };
  const compiled = ts.transpileModule(
    readFileSync("apps/customer/app/api/orders/[id]/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    require: (name: string) => mocks[name] ?? require(name),
    Response,
    Promise,
  });
  const route = mod.exports as {
    GET: (
      req: Request,
      options: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  };
  return {
    reads,
    run: () =>
      route.GET(new Request("https://fixture.invalid/api/orders/order-1"), {
        params: Promise.resolve({ id: order.id }),
      }),
  };
}

test("order access scopes photo and snapshot reads, preserving accepted names/prices and exposing only the tax summary", async () => {
  const { reads, run } = fixture();
  const response = await run(),
    { order } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.ok(reads.every((read) => read.orderId === "order-1"));
  assert.match(
    reads.find((read) => read.table === "order_items")!.columns!,
    /menu_items\(image_url\)/,
  );
  assert.equal(order.items[0].image_url, "https://images.fixture/photo.webp");
  assert.equal(order.items[0].name, "Accepted name");
  assert.equal(order.items[0].subtotal, 90);
  assert.equal(order.total, 187);
  assert.deepEqual(order.tax_summary, {
    item_vat_centavos: 964,
    delivery_vat_centavos: null,
  });
  assert.ok(!("menu_item" in order.items[0]));
  assert.doesNotMatch(
    JSON.stringify(order),
    /private_accounting|private database/,
  );
});

test("a missing or temporarily unavailable tax snapshot does not prevent ticket items and totals loading", async () => {
  for (const options of [{ financeError: true }, { missing: true }]) {
    const response = await fixture(options).run(),
      { order } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(order.tax_summary, null);
    assert.equal(order.total, 187);
    assert.equal(order.items.length, 1);
  }
});

test("unauthorized callers cannot read order photos or financial snapshots", async () => {
  const { reads, run } = fixture({ denied: true });
  assert.equal((await run()).status, 403);
  assert.equal(reads.length, 0);
});
