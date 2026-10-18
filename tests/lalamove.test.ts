import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as policy from "../apps/customer/app/api/lalamove/policy.ts";

// No local credentials or external provider calls are loaded by these tests.
const require = createRequire(import.meta.url);
function load<T>(
  file: string,
  mocks: Record<string, unknown>,
  globals = {},
): T {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod,
    exports: mod.exports,
    require: (name: string) => mocks[name] ?? require(name),
    process: {
      env: { LALAMOVE_API_KEY: "fixture", LALAMOVE_API_SECRET: "fixture" },
    },
    Response,
    Request,
    AbortSignal,
    URL,
    Buffer,
    fetch: () => {
      throw Error("External provider calls forbidden");
    },
    ...globals,
  });
  return mod.exports as T;
}

class AccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}
const accessResponse = (error: AccessError) =>
  Response.json({ error: error.message }, { status: error.status || 503 });
type ProviderResult = {
  data?: { data: Record<string, unknown> };
  error?: string;
  errorCode?: string;
  status: number;
};
type Route = { POST: (req: Request) => Promise<Response> };
const next = { NextResponse: { json: Response.json } };
const order = {
  id: "11111111-1111-4111-8111-111111111111",
  order_type: "delivery",
  payment_status: "paid",
  status: "ready",
  delivery_fee: 65,
  delivery_lat: 14.35,
  delivery_lng: 120.98,
  delivery_address: "Fixture address",
  delivery_name: "Fixture recipient",
  delivery_phone: "09171234567",
};
const branch = {
  name: "Fixture café",
  latitude: 14.346,
  longitude: 120.981,
  address: "Fixture origin",
  contact_phone: "+639181234567",
  version: "fixture",
};
const quote = (serviceType = "MOTORCYCLE"): ProviderResult => ({
  status: 201,
  data: {
    data: {
      quotationId: "quote-1",
      serviceType,
      stops: [{ stopId: "origin-1" }, { stopId: "destination-1" }],
      priceBreakdown: { total: "65", currency: "PHP" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  },
});

function dispatchFixture(
  options: {
    quote?: ProviderResult;
    booking?: ProviderResult;
    denied?: boolean;
    existing?: boolean;
  } = {},
) {
  const calls: {
    path: string;
    body: Record<string, unknown>;
    requestId?: string;
  }[] = [];
  const finishes: { state: string; failure: string | null }[] = [];
  const uncertain: string[] = [];
  const route = load<Route>(
    "apps/customer/app/api/lalamove/dispatch/route.ts",
    {
      "next/server": next,
      "@cafeos/shared/server/request-body": {
        readJsonBody: (req: Request) => req.json(),
      },
      "../lib": {
        PICKUP: { phone: branch.contact_phone },
        lalamoveRequest: async (
          _method: string,
          path: string,
          body: Record<string, unknown>,
          requestId?: string,
        ) => {
          calls.push({ path, body, requestId });
          return path === "/v3/quotations"
            ? (options.quote ?? quote())
            : (options.booking ?? {
                status: 201,
                data: { data: { orderId: "1234567890123456789" } },
              });
        },
      },
      "../policy": policy,
      "../../branch/lib": { readCustomerBranch: async () => branch },
      "../../../../lib/location": { withinCoverage: () => true },
      "../../../../lib/server-access": {
        ApiAccessError: AccessError,
        PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
        apiAccessErrorResponse: accessResponse,
        requireOrderAccess: async (
          _req: Request,
          _id: unknown,
          settings: { staffOnly: boolean },
        ) => {
          assert.equal(settings.staffOnly, true);
          if (options.denied)
            throw new AccessError("Approved staff required", 403);
          return {
            db: {},
            order: {
              ...order,
              ...(options.existing ? { lalamove_order_id: "existing-1" } : {}),
            },
            actorId: "staff",
          };
        },
      },
      "../../../../lib/provider-attempts": {
        claimProviderAttempt: async () => ({
          claimed: true,
          attempt: { id: "attempt-1", request_key: "stable-request-key" },
        }),
        finishProviderAttempt: async (
          _db: unknown,
          _attempt: unknown,
          state: string,
          _remote: unknown,
          _url: unknown,
          failure: string | null = null,
        ) => {
          finishes.push({ state, failure });
        },
        markUncertain: async (
          _db: unknown,
          _attempt: unknown,
          code: string,
        ) => {
          uncertain.push(code);
        },
        pendingAttemptError: () => {
          throw new AccessError("Already processing", 409);
        },
        safeProviderUrl: () => null,
      },
    },
  );
  const run = () =>
    route.POST(
      new Request("https://fixture.invalid/api/lalamove/dispatch", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      }),
    );
  return { run, calls, finishes, uncertain };
}

test("Lalamove distinguishes sandbox test credit from a funded production wallet", () => {
  const error = {
    errors: [
      { id: "ERR_INSUFFICIENT_CREDIT", message: "Private provider detail" },
    ],
  };
  const sandbox = policy.lalamoveFailure(402, error, true);
  assert.match(sandbox.error, /sandbox.*test credit/i);
  assert.doesNotMatch(sandbox.error, /top up the production/i);
  const live = policy.lalamoveFailure(402, error, false);
  assert.match(live.error, /top up the production wallet/i);
  assert.equal(live.errorCode, "ERR_INSUFFICIENT_CREDIT");
});

test("Lalamove maps documented errors without forwarding arbitrary messages or PII", () => {
  for (const payload of [
    { message: "ERR_INVALID_PHONE_NUMBER" },
    { errors: { id: "ERR_INVALID_PHONE_NUMBER" } },
    { errors: [{ id: "ERR_INVALID_PHONE_NUMBER" }] },
  ])
    assert.match(
      policy.lalamoveFailure(422, payload, true).error,
      /contact number/i,
    );
  for (const payload of [
    null,
    [],
    "secret",
    { message: "private@example.test +639171234567" },
    { errors: [{ id: "__proto__" }] },
  ]) {
    assert.equal(
      policy.lalamoveFailure(422, payload, true).error,
      "Courier service returned 422. Please retry or contact the café.",
    );
  }
});

test("Motorcycle booking uses the fresh Motorcycle quote and stable attempt key", async () => {
  const fixture = dispatchFixture();
  assert.equal((await fixture.run()).status, 200);
  const data = fixture.calls[0].body.data as Record<string, unknown>;
  assert.equal(data.serviceType, "MOTORCYCLE");
  assert.equal(
    (fixture.calls[1].body.data as Record<string, unknown>).quotationId,
    "quote-1",
  );
  assert.equal(fixture.calls[1].requestId, "stable-request-key");
  assert.equal(fixture.finishes[0].state, "ready");
});

test("a different or missing vehicle type never reaches the rider booking API", async () => {
  for (const vehicle of ["CAR", "VAN", ""]) {
    const fixture = dispatchFixture({ quote: quote(vehicle) });
    const response = await fixture.run();
    assert.equal(response.status, 409);
    assert.match(
      (await response.json()).error,
      /Motorcycle quote.*No rider was booked/,
    );
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.finishes[0].failure, "MOTORCYCLE_QUOTE_REQUIRED");
  }
});

test("an insufficient-credit rejection stays retryable and records the safe provider reason", async () => {
  const failure = policy.lalamoveFailure(402, {}, true);
  const fixture = dispatchFixture({ booking: { status: 402, ...failure } });
  const response = await fixture.run();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, failure.error);
  assert.deepEqual(fixture.finishes, [
    { state: "failed", failure: "ERR_INSUFFICIENT_CREDIT" },
  ]);
  assert.equal(fixture.uncertain.length, 0);
});

test("ambiguous booking responses still require reconciliation instead of a second rider", async () => {
  for (const status of [0, 408, 409, 429, 500, 503]) {
    const fixture = dispatchFixture({
      booking: { status, error: "Fixture failure" },
    });
    const response = await fixture.run();
    assert.match((await response.json()).error, /reconciliation/);
    assert.equal(fixture.uncertain.length, 1);
    assert.equal(fixture.finishes.length, 0);
  }
});

test("failed quotations and changed fees cannot book a motorcycle", async () => {
  const failure = policy.lalamoveFailure(401, {}, true);
  const auth = dispatchFixture({ quote: { status: 401, ...failure } });
  assert.equal((await (await auth.run()).json()).error, failure.error);
  assert.equal(auth.calls.length, 1);
  const changed = quote();
  changed.data!.data.priceBreakdown = { total: "66", currency: "PHP" };
  const price = dispatchFixture({ quote: changed });
  assert.equal((await price.run()).status, 409);
  assert.equal(price.calls.length, 1);
});

test("unauthorized requests and previously linked orders never create a booking", async () => {
  const denied = dispatchFixture({ denied: true });
  assert.equal((await denied.run()).status, 403);
  assert.equal(denied.calls.length, 0);
  const linked = dispatchFixture({ existing: true });
  assert.equal((await (await linked.run()).json()).reused, true);
  assert.equal(linked.calls.length, 0);
});

test("customer quotation accepts Motorcycle only before issuing a signed fee token", async () => {
  for (const vehicle of ["MOTORCYCLE", "CAR", ""]) {
    let signed = false;
    const route = load<Route>(
      "apps/customer/app/api/lalamove/quotation/route.ts",
      {
        "next/server": next,
        "@cafeos/shared/server/request-body": {
          readJsonBody: (req: Request) => req.json(),
        },
        "../policy": policy,
        "../lib": {
          lalamoveRequest: async (
            _method: string,
            _path: string,
            body: { data: { serviceType: string } },
          ) => {
            assert.equal(body.data.serviceType, "MOTORCYCLE");
            return quote(vehicle);
          },
        },
        "../quote-token": {
          createQuoteToken: () => {
            signed = true;
            return "fixture-token";
          },
        },
        "../../branch/lib": { readCustomerBranch: async () => branch },
        "../../../../lib/location": {
          withinCoverage: () => true,
          coordinates: () => true,
        },
        "../../../../lib/server-access": {
          getServerDb: () => ({}),
          assertSameOrigin() {},
          apiAccessErrorResponse: accessResponse,
        },
      },
    );
    const response = await route.POST(
      new Request("https://fixture.invalid/api/lalamove/quotation", {
        method: "POST",
        body: JSON.stringify({
          dropoffLat: 14.35,
          dropoffLng: 120.98,
          dropoffAddress: "Fixture address",
        }),
      }),
    );
    assert.equal(response.status, vehicle === "MOTORCYCLE" ? 200 : 500);
    assert.equal(signed, vehicle === "MOTORCYCLE");
  }
});

test("HTTP client retains safe credit error codes and never exposes provider details", async () => {
  const client = load<{
    lalamoveRequest: (
      method: string,
      path: string,
    ) => Promise<{ error: string; errorCode: string; status: number }>;
  }>(
    "apps/customer/app/api/lalamove/lib.ts",
    { "./policy": policy },
    {
      fetch: async () =>
        Response.json(
          {
            errors: [
              { id: "ERR_INSUFFICIENT_CREDIT", message: "secret@example.test" },
            ],
          },
          { status: 402 },
        ),
    },
  );
  const result = await client.lalamoveRequest("POST", "/v3/orders");
  assert.equal(result.status, 402);
  assert.equal(result.errorCode, "ERR_INSUFFICIENT_CREDIT");
  assert.match(result.error, /sandbox.*test credit/);
  assert.doesNotMatch(result.error, /secret@example/);
});
