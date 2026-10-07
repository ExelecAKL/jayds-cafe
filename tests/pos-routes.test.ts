import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as pricing from "../packages/shared/src/inventory/orders.ts";
const require = createRequire(import.meta.url);
function module<T>(
  file: string,
  mocks: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod,
    exports: mod.exports,
    require: (name: string) => mocks[name] ?? require(name),
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "fixture",
      },
    },
    Request,
    Response,
    URL,
    AbortSignal,
    console: { error() {} },
    fetch: () => {
      throw new Error("External calls forbidden");
    },
    ...globals,
  });
  return mod.exports as T;
}
const request = (body: unknown, key = "checkout-route-key-000001") =>
  new Request("http://fixture.invalid/api/orders/checkout", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture",
      "Idempotency-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const body = {
  items: [{ menu_item_id: "menu", price: 100, quantity: 1, variants: [] }],
  cash_received: 100,
  expected_total: 100,
};
test("mobile cash handover forwards its matching private QR and tender to the checked operation", async () => {
  let calls = 0;
  const orderId = "20000000-0000-4000-8000-000000000001";
  const payload = {
    order_id: orderId,
    pickup_qr: `pickup:${orderId}:private-token`,
    cash_received: 120,
    expected_total: 100,
  };
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  };
  const handler = module<{ POST: (r: Request) => Promise<Response> }>(
    "apps/pos/app/api/orders/checkout/route.ts",
    {
      "@cafeos/shared/inventory/orders": pricing,
      "../../../../lib/server": {
        requireCashier: async () => ({ db, actor: "staff" }),
        cashierRpc: async (
          _db: unknown,
          name: string,
          args: Record<string, unknown>,
        ) => {
          calls++;
          assert.equal(name, "pos_cash_pickup");
          assert.equal(args.p_actor, "staff");
          assert.equal(args.p_qr, payload.pickup_qr);
          assert.equal(args.p_cash, 120);
          assert.equal(args.p_expected, 100);
          return { status: "completed", payment_status: "paid" };
        },
        cashierError: (e: Error) =>
          Response.json({ error: e.message }, { status: 400 }),
      },
    },
  );
  assert.equal((await handler.POST(request(payload))).status, 200);
  for (const invalid of [
    { ...payload, order_id: "30000000-0000-4000-8000-000000000001" },
    { ...payload, items: body.items },
    { ...payload, pickup_qr: `cached:${orderId}:private-token` },
    { ...payload, cash_received: "120" },
  ])
    assert.equal((await handler.POST(request(invalid))).status, 400);
  assert.equal(calls, 1);
});
test("cash checkout retry returns the stored receipt before repricing an unavailable catalog", async () => {
  const req = request(body),
    identity = pricing.submissionIdentity(req, "pos-cash", "actor", body);
  const canonical = {
    id: "order",
    total: 100,
    payment_status: "paid",
    receipt: { receipt_token: "canonical" },
  };
  const db = {
    from: (name: string) => {
      assert.equal(
        name,
        "pos_checkout_attempts",
        "Retry must not read current menu",
      );
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { fingerprint: identity.fingerprint, result: canonical },
              error: null,
            }),
          }),
        }),
      };
    },
  };
  const handler = module<{ POST: (r: Request) => Promise<Response> }>(
    "apps/pos/app/api/orders/checkout/route.ts",
    {
      "@cafeos/shared/inventory/orders": pricing,
      "../../../../lib/server": {
        requireCashier: async () => ({ db, actor: "actor" }),
        cashierRpc: () => {
          throw new Error("No second checkout");
        },
        cashierError: (e: Error) =>
          Response.json({ error: e.message }, { status: 409 }),
      },
    },
  );
  const result = await handler.POST(req);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), canonical);
  const changed = await handler.POST(request({ ...body, cash_received: 200 }));
  assert.equal(changed.status, 409);
  assert.match((await changed.json()).error, /different data/);
});

test("cashier delivery bridge preserves staff identity, separates pickup, and delegates only checked booking/status endpoints", async () => {
  const id = "20000000-0000-4000-8000-000000000001";
  let order = {
    order_type: "pickup",
    status: "ready",
    payment_status: "paid",
    lalamove_order_id: null as string | null,
  };
  const calls: { url: URL; init: RequestInit }[] = [];
  const handler = module<{ POST: (r: Request) => Promise<Response> }>(
    "apps/pos/app/api/orders/delivery/route.ts",
    {
      "@cafeos/shared/inventory/orders": pricing,
      "@cafeos/shared/server/request-body": {
        readJsonBody: (r: Request) => r.json(),
        JsonBodyError: class extends Error {},
      },
      "../../../../lib/server": {
        requireCashier: async (r: Request) => {
          if (!r.headers.has("Authorization"))
            throw new pricing.CatalogValidationError("Sign in", 401);
          return {
            db: {
              from: () => ({
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: order, error: null }),
                  }),
                }),
              }),
            },
          };
        },
        cashierError: (e: pricing.CatalogValidationError) =>
          Response.json({ error: e.message }, { status: e.status }),
      },
    },
    {
      fetch: async (url: URL, init: RequestInit) => {
        calls.push({ url, init });
        return Response.json(
          init.method === "POST"
            ? { success: true, lalamoveOrderId: "1234567890123456789" }
            : {
                status: "PICKED_UP",
                shareLink: "https://share.sandbox.lalamove.com/fixture",
              },
        );
      },
    },
  );
  for (const action of ["dispatch", "status"])
    assert.equal(
      (await handler.POST(request({ order_id: id, action }))).status,
      409,
    );
  order = { ...order, order_type: "delivery", payment_status: "pending" };
  assert.equal(
    (await handler.POST(request({ order_id: id, action: "dispatch" }))).status,
    409,
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (
      await handler.POST(
        new Request("http://pos.test/api/orders/delivery", {
          method: "POST",
          body: JSON.stringify({ order_id: id, action: "dispatch" }),
        }),
      )
    ).status,
    401,
  );
  order.payment_status = "paid";
  assert.equal(
    (
      await handler.POST(
        request({
          order_id: id,
          action: "dispatch",
          url: "https://evil.test",
          delivery_fee: 0,
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls[0].url.origin, "http://localhost:4000");
  assert.equal(calls[0].url.pathname, "/api/lalamove/dispatch");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { orderId: id });
  assert.equal(
    new Headers(calls[0].init.headers).get("Authorization"),
    "Bearer fixture",
  );
  order.lalamove_order_id = "1234567890123456789";
  assert.equal(
    (await handler.POST(request({ order_id: id, action: "status" }))).status,
    200,
  );
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[1].url.pathname, "/api/lalamove/status");
  assert.equal(calls[1].url.searchParams.get("dbOrderId"), id);
  order.status = "completed";
  assert.equal(
    (await handler.POST(request({ order_id: id, action: "dispatch" }))).status,
    409,
  );
  assert.equal(
    (await handler.POST(request({ order_id: "bad", action: "collect" })))
      .status,
    400,
  );
  assert.equal(calls.length, 2);
});
test("cash checkout reports missing migration before creating any sale", async () => {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { code: "42P01" } }),
        }),
      }),
    }),
  };
  const handler = module<{ POST: (r: Request) => Promise<Response> }>(
    "apps/pos/app/api/orders/checkout/route.ts",
    {
      "@cafeos/shared/inventory/orders": pricing,
      "../../../../lib/server": {
        requireCashier: async () => ({ db, actor: "actor" }),
        cashierRpc: () => {
          throw new Error("Mutation forbidden");
        },
        cashierError: (e: pricing.CatalogValidationError) =>
          Response.json({ error: e.message }, { status: e.status }),
      },
    },
  );
  const result = await handler.POST(request(body));
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /database upgrade/);
});
test("cashier mutations verify approved database roles rather than token metadata", async () => {
  let profile: { role: string; is_approved: boolean } | null = {
    role: "staff",
    is_approved: false,
  };
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "actor", user_metadata: { role: "admin" } } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profile, error: null }),
        }),
      }),
    }),
  };
  const server = module<{ requireCashier: (r: Request) => Promise<unknown> }>(
    "apps/pos/lib/server.ts",
    {
      "@supabase/supabase-js": { createClient: () => db },
      "@cafeos/shared/inventory/orders": pricing,
    },
  );
  await assert.rejects(server.requireCashier(request(body)), /Approved staff/);
  profile = { role: "customer", is_approved: true };
  await assert.rejects(server.requireCashier(request(body)), /Approved staff/);
  profile = { role: "staff", is_approved: true };
  assert.ok(await server.requireCashier(request(body)));
  await assert.rejects(
    server.requireCashier(new Request("http://fixture.invalid")),
    /Sign in/,
  );
});
