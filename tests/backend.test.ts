import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceOrder } from "../apps/customer/app/api/orders/create/pricing.ts";
import {
  createQuoteToken,
  readQuoteToken,
} from "../apps/customer/app/api/lalamove/quote-token.ts";

// Tests never load .env.local or contact Supabase/payment providers.
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-signing-key";
const nodeRequire = createRequire(import.meta.url);
type Row = Record<string, unknown>;
type Result = { data: unknown; error: null; count?: number };

function database(
  rows: Record<string, unknown>,
  writes: { table: string; row: Row }[] = [],
) {
  return {
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === "owner-token" ? { id: "owner" } : null },
        error: null,
      }),
    },
    rpc: async (name: string) => ({
      data:
        name === "get_customer_branch"
          ? {
              version: "test-v1",
              latitude: 14.346621,
              longitude: 120.981057,
              delivery_radius_km: 8,
            }
          : null,
      error: null,
    }),
    from(table: string) {
      let updating = false;
      const result = (): Result => ({
        data: updating ? { id: "order-1" } : (rows[table] ?? []),
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        update(row: Row) {
          updating = true;
          writes.push({ table, row });
          return query;
        },
        insert(row: Row) {
          writes.push({ table, row });
          return query;
        },
        then: (
          resolve: (value: Result) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
}

function loadModule<T>(
  file: string,
  mocks: Record<string, unknown>,
  env: Record<string, string> = {},
): T {
  const sandboxModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module: sandboxModule,
      exports: sandboxModule.exports,
      require: (name: string) => mocks[name] ?? nodeRequire(name),
      process: { env },
      Buffer,
      Request,
      Response,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { log() {}, warn() {}, error() {} },
      fetch: () => {
        throw new Error("External requests are forbidden in regression tests");
      },
    },
    { filename: path.resolve(file) },
  );
  return sandboxModule.exports as T;
}

const menuId = "11111111-1111-4111-8111-111111111111";
const catalog = {
  id: menuId,
  name: "Coffee",
  price: 100,
  is_available: true,
  status: "active",
  variants: [
    {
      variant_group: "size",
      label: "Large",
      price_modifier: 20,
      applicable_items: null,
    },
  ],
};
const input = {
  order_type: "pickup",
  payment_method: "cash",
  subtotal: 100,
  total: 100,
  discount: 0,
  points_redeemed: 0,
  items: [
    {
      menu_item_id: menuId,
      quantity: 1,
      price: 100,
      subtotal: 100,
      variants: [] as unknown[],
    },
  ],
};
const db = (rows: Record<string, unknown> = {}) =>
  database({ menu_items: [catalog], ...rows }) as unknown as SupabaseClient;

test("valid guest order uses the catalog name, price, and zero earned points", async () => {
  const priced = await priceOrder(db(), input, null);
  assert.equal(priced.total, 100);
  assert.equal(priced.items[0].name, "Coffee");
  assert.equal(priced.pointsEarned, 0);
});

test("rejects the audited zero-total order", async () => {
  await assert.rejects(
    priceOrder(db(), { ...input, subtotal: 0, total: 0 }, null),
    /order total has changed/,
  );
});

test("rejects forged unit prices and item subtotals", async () => {
  await assert.rejects(
    priceOrder(
      db(),
      {
        ...input,
        subtotal: 1,
        total: 1,
        items: [{ ...input.items[0], price: 1, subtotal: 1 }],
      },
      null,
    ),
    /price .* has changed/,
  );
});

test("uses catalog variant prices and rejects unknown variants", async () => {
  const variants = [
    { variant_group: "size", label: "Large", price_modifier: 0 },
  ];
  const priced = await priceOrder(
    db(),
    {
      ...input,
      subtotal: 120,
      total: 120,
      items: [{ ...input.items[0], price: 120, subtotal: 120, variants }],
    },
    null,
  );
  assert.equal(priced.items[0].variants[0].price_modifier, 20);
  await assert.rejects(
    priceOrder(
      db(),
      {
        ...input,
        items: [
          {
            ...input.items[0],
            variants: [{ variant_group: "size", label: "Fake" }],
          },
        ],
      },
      null,
    ),
    /customization .* has changed/,
  );
});

test("rejects unavailable items and fractional quantities", async () => {
  await assert.rejects(
    priceOrder(
      db({ menu_items: [{ ...catalog, is_available: false }] }),
      input,
      null,
    ),
    /no longer available/,
  );
  await assert.rejects(
    priceOrder(
      db(),
      { ...input, items: [{ ...input.items[0], quantity: 0.5 }] },
      null,
    ),
    /quantity/,
  );
});

const voucher = {
  id: "voucher",
  uses_count: 0,
  max_uses: 10,
  valid_from: null,
  valid_until: null,
  min_order_amount: 50,
  discount_type: "percentage",
  discount_value: 50,
  application_mode: "whole_order",
  applicable_item_ids: [],
  max_discount_amount: 20,
};

test("calculates voucher caps and points discounts from stored values", async () => {
  const priced = await priceOrder(
    db({ vouchers: voucher, profiles: { points: 100 } }),
    {
      ...input,
      voucher_code: "SAVE",
      points_redeemed: 50,
      discount: 25,
      total: 75,
    },
    "owner",
  );
  assert.equal(priced.discount, 25);
  assert.equal(priced.pointsEarned, 7);
});

test("rejects fake discounts, expired vouchers, and insufficient points", async () => {
  await assert.rejects(
    priceOrder(db(), { ...input, discount: 100, total: 0 }, null),
    /order total has changed/,
  );
  await assert.rejects(
    priceOrder(
      db({ vouchers: { ...voucher, valid_until: "2000-01-01" } }),
      { ...input, voucher_code: "OLD" },
      null,
    ),
    /not currently valid/,
  );
  await assert.rejects(
    priceOrder(
      db({ profiles: { points: 10 } }),
      { ...input, points_redeemed: 100 },
      "owner",
    ),
    /Only 10 points/,
  );
});

test("delivery fees require a valid, unaltered quote for the submitted address", async () => {
  const quote = {
    quotationId: "q1",
    fee: 40,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    lat: 14.345,
    lng: 120.98,
    address: "Delivery address",
    branchVersion: "test-v1",
  };
  const token = createQuoteToken(quote);
  const order = {
    ...input,
    order_type: "delivery",
    payment_method: "maya",
    total: 140,
    delivery_fee: 40,
    delivery_lat: quote.lat,
    delivery_lng: quote.lng,
    delivery_address: quote.address,
    delivery_quote_token: token,
  };
  assert.equal((await priceOrder(db(), order, null)).deliveryFee, 40);
  await assert.rejects(
    priceOrder(db(), { ...order, delivery_fee: 0, total: 100 }, null),
    /delivery quote/,
  );
  await assert.rejects(
    priceOrder(db(), { ...order, delivery_address: "Another address" }, null),
    /delivery quote/,
  );
  const [payload, signature] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...quote, fee: 0 }),
  ).toString("base64url");
  assert.notEqual(payload, forgedPayload);
  assert.equal(readQuoteToken(`${forgedPayload}.${signature}`), null);
  assert.equal(
    readQuoteToken(createQuoteToken({ ...quote, expiresAt: "2000-01-01" })),
    null,
  );
});

const checkoutId = "22222222-2222-4222-8222-222222222222";
type MayaModule = typeof import("../packages/shared/src/maya.ts");

function paymentVerification(
  payment: Row,
  paymentStatus = "pending",
  orderStatus = "pending",
) {
  const writes: { table: string; row: Row }[] = [];
  const calls: { name: string; args: Row }[] = [];
  const stub = {
    ...database(
      {
        orders: {
          id: "order-1",
          payment_method: "maya",
          total: 100,
          status: orderStatus,
          payment_status: paymentStatus,
        },
      },
      writes,
    ),
    async rpc(name: string, args: Row) {
      calls.push({ name, args });
      // The real locking/transition/amount checks are independently exercised against PostgreSQL in customer-security.test.ts.
      if (args.p_amount !== 100)
        return { data: null, error: { code: "P0001" } };
      return {
        data: {
          success: true,
          orderId: "order-1",
          status: ["paid", "refunded"].includes(paymentStatus)
            ? paymentStatus
            : args.p_state,
        },
        error: null,
      };
    },
  };
  const { MayaService } = loadModule<MayaModule>(
    "packages/shared/src/maya.ts",
    {},
  );
  MayaService.getCheckoutStatus = async () => ({
    id: checkoutId,
    amount: "100",
    currency: "PHP",
    ...payment,
  });
  return {
    MayaService,
    stub: stub as unknown as SupabaseClient,
    writes,
    calls,
  };
}

test("Maya verification requires the merchant key and rejects invalid checkout IDs", async () => {
  const noKey = loadModule<MayaModule>(
    "packages/shared/src/maya.ts",
    {},
  ).MayaService;
  await assert.rejects(
    noKey.getCheckoutStatus(checkoutId),
    /Missing MAYA_SECRET_KEY/,
  );
  const withKey = loadModule<MayaModule>(
    "packages/shared/src/maya.ts",
    {},
    { MAYA_SECRET_KEY: "test-key" },
  ).MayaService;
  await assert.rejects(
    withKey.getCheckoutStatus("../other-endpoint"),
    /Invalid Maya checkout ID/,
  );
});

test("only merchant-retrieved payment data reaches the checked settlement transaction", async () => {
  const { MayaService, stub, writes, calls } = paymentVerification({
    paymentStatus: "PAYMENT_SUCCESS",
  });
  assert.equal(
    (await MayaService.verifyAndUpdateOrder(checkoutId, stub)).success,
    true,
  );
  assert.equal(writes.length, 0);
  assert.equal(calls[0].name, "customer_finalize_maya_payment");
  assert.equal(calls[0].args.p_checkout, checkoutId);
  assert.equal(calls[0].args.p_amount, 100);
  assert.equal(calls[0].args.p_currency, "PHP");
  assert.equal(calls[0].args.p_state, "paid");
});

test("Maya rejects payments with the wrong amount, currency, or identity", async () => {
  for (const fields of [
    { amount: 1 },
    { currency: "USD" },
    { id: "other-payment" },
  ]) {
    const { MayaService, stub, writes } = paymentVerification({
      paymentStatus: "PAYMENT_SUCCESS",
      ...fields,
    });
    assert.equal(
      (await MayaService.verifyAndUpdateOrder(checkoutId, stub)).success,
      false,
    );
    assert.equal(writes.length, 0);
  }
});

test("merchant-retrieved Maya cancellations close the attempt as failed and never record a paid sale", async () => {
  for (const status of [
    "PAYMENT_CANCELLED",
    "CHECKOUT_CANCELLED",
    "CANCELLED",
    "PAYMENT_FAILED",
    "PAYMENT_EXPIRED",
  ]) {
    const { MayaService, stub, calls } = paymentVerification({
      status,
      isPaid: false,
    });
    assert.equal(
      (await MayaService.verifyAndUpdateOrder(checkoutId, stub)).status,
      "failed",
    );
    assert.equal(calls[0].args.p_state, "failed");
  }
});

test("delayed payment callbacks cannot undo paid or refunded payments", async () => {
  for (const status of ["paid", "refunded"]) {
    const { MayaService, stub, writes } = paymentVerification(
      { paymentStatus: "PAYMENT_FAILED" },
      status,
    );
    assert.equal(
      (await MayaService.verifyAndUpdateOrder(checkoutId, stub)).status,
      status,
    );
    assert.equal(writes.length, 0);
  }
});

test("a successful payment callback does not reopen a cancelled order", async () => {
  const { MayaService, stub, writes, calls } = paymentVerification(
    { paymentStatus: "PAYMENT_SUCCESS" },
    "pending",
    "cancelled",
  );
  assert.equal(
    (await MayaService.verifyAndUpdateOrder(checkoutId, stub)).success,
    true,
  );
  assert.equal(writes.length, 0);
  assert.equal(calls[0].args.p_state, "paid");
  assert.equal("status" in calls[0].args, false); // Browser/server code cannot request reopening.
});

test("a forged success webhook cannot bypass provider verification", async () => {
  let verifiedId: unknown;
  const route = loadModule<{ POST: (request: Request) => Promise<Response> }>(
    "apps/customer/app/api/maya/webhook/route.ts",
    {
      "next/server": {
        NextResponse: {
          json: (data: unknown, init?: ResponseInit) =>
            Response.json(data, init),
        },
      },
      "@cafeos/shared/supabase/server": {
        createAdminSupabaseClient: () => ({}),
      },
      "@cafeos/shared/maya": {
        MayaService: {
          verifyAndUpdateOrder: async (id: string) => {
            verifiedId = id;
            return { success: false };
          },
        },
      },
    },
  );
  const response = await route.POST(
    new Request("http://localhost/api/maya/webhook", {
      method: "POST",
      body: JSON.stringify({
        id: checkoutId,
        paymentStatus: "PAYMENT_SUCCESS",
        isPaid: true,
        metadata: { orderId: "other-order" },
      }),
    }),
  );
  assert.equal(verifiedId, checkoutId);
  assert.equal(response.status, 503);
});

function cancellation(customerId: string | null = "owner") {
  const writes: { table: string; row: Row }[] = [];
  const calls: { name: string; args: Row }[] = [];
  const order = {
    id: "order-1",
    customer_id: customerId,
    status: "confirmed",
    payment_method: "maya",
    payment_status: "paid",
    order_type: "pickup",
    points_redeemed: 0,
  };
  const stub = {
    ...database({ orders: order }, writes),
    rpc: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { data: { success: true, refundRequired: true }, error: null };
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
  const route = loadModule<{ POST: (request: Request) => Promise<Response> }>(
    "apps/customer/app/api/orders/cancel/route.ts",
    {
      "../../../../lib/server-access": {
        ApiAccessError: AccessError,
        PRIVATE_HEADERS: { "Cache-Control": "no-store" },
        apiAccessErrorResponse: (error: AccessError) =>
          Response.json(
            { error: error.message },
            { status: error.status ?? 500 },
          ),
        requireOrderAccess: async (req: Request) => {
          const token = req.headers.get("authorization")?.slice(7);
          const userId = token === "owner-token" ? "owner" : null;
          if (customerId && !userId)
            throw new AccessError("Sign in required", 401);
          if (customerId && customerId !== userId)
            throw new AccessError("Access denied", 403);
          if (!customerId)
            throw new AccessError("Signed guest grant required", 403);
          return { db: stub, order, actorId: userId };
        },
      },
      "../../../../lib/provider-attempts": {},
      "../../lalamove/lib": {
        lalamoveRequest: () => {
          throw Error("External provider request forbidden");
        },
      },
      "next/server": {
        NextResponse: {
          json: (data: unknown, init?: ResponseInit) =>
            Response.json(data, init),
        },
      },
    },
  );
  return { route, writes, calls };
}

function cancelRequest(token?: string) {
  return new Request("http://localhost/api/orders/cancel", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ orderId: "order-1" }),
  });
}

test("account order cannot be cancelled without authentication", async () => {
  const { route, writes } = cancellation();
  assert.equal((await route.POST(cancelRequest())).status, 401);
  assert.equal(writes.length, 0);
});

test("another account cannot cancel the order", async () => {
  const { route, writes } = cancellation("different-owner");
  assert.equal((await route.POST(cancelRequest("owner-token"))).status, 403);
  assert.equal(writes.length, 0);
});

test("paid customer cancellation requires Admin refund review and cannot alter payment or stock", async () => {
  const { route, writes, calls } = cancellation();
  assert.equal((await route.POST(cancelRequest("owner-token"))).status, 403);
  assert.equal(writes.length, 0);
  assert.deepEqual(calls, []);
});

test("guest UUID possession cannot bypass the signed guest grant", async () => {
  const { route } = cancellation(null);
  assert.equal((await route.POST(cancelRequest())).status, 403);
});
