import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { safeMayaCheckoutUrl } from "../packages/shared/src/maya-urls.ts";

// All provider responses are local fixtures; no environment file or live service is used.
const nodeRequire = createRequire(import.meta.url);
const orderId = "10000000-0000-4000-8000-000000000001";
const attemptId = "20000000-0000-4000-8000-000000000002";
const checkoutId = "30000000-0000-4000-8000-000000000003";
const differentId = "40000000-0000-4000-8000-000000000004";
const signingEnv = { CUSTOMER_GUEST_SECRET: "isolated-return-signing-key" };
class AccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}
const responses = {
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  },
};
function load<T>(
  file: string,
  mocks: Record<string, unknown>,
  env: Record<string, string> = {},
  fetchFixture?: (url: string, init: RequestInit) => Promise<Response>,
): T {
  const loadedModule = { exports: {} };
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
      module: loadedModule,
      exports: loadedModule.exports,
      require: (name: string) => mocks[name] ?? nodeRequire(name),
      process: { env },
      Buffer,
      URL,
      Request,
      Response,
      Date,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { error() {}, log() {}, warn() {} },
      fetch:
        fetchFixture ??
        (() => {
          throw Error("External requests forbidden");
        }),
    },
    { filename: file },
  );
  return loadedModule.exports as T;
}
function returnHelpers(env: Record<string, string> = signingEnv) {
  return load<typeof import("../apps/customer/lib/maya-return-state.ts")>(
    "apps/customer/lib/maya-return-state.ts",
    { "./server-access": { ApiAccessError: AccessError } },
    env,
  );
}
function jsonDb(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows[table] ?? null, error: null }).then(
            resolve,
          ),
      };
      return query;
    },
  };
}

test("Maya return state binds order, attempt and outcome, expires promptly, and rejects tampering", () => {
  const helpers = returnHelpers(),
    now = 1_800_000_000_000;
  const token = helpers.createMayaReturnState(
    orderId,
    attemptId,
    "success",
    now,
  );
  assert.equal(helpers.readMayaReturnState(token, now)?.orderId, orderId);
  assert.equal(helpers.readMayaReturnState(token, now)?.attemptId, attemptId);
  assert.equal(helpers.readMayaReturnState(token, now)?.outcome, "success");
  assert.equal(
    helpers.readMayaReturnState(
      token,
      now + helpers.MAYA_RETURN_AGE_SECONDS * 1000,
    ),
    null,
  );
  assert.equal(helpers.readMayaReturnState(token, now - 60_000), null);
  assert.notEqual(
    token,
    helpers.createMayaReturnState(orderId, attemptId, "success", now),
  );
  const [payload, signature] = token.split(".");
  for (const patch of [
    { orderId: differentId },
    { attemptId: differentId },
    { outcome: "cancelled" },
    { expiresAt: 9_999_999_999 },
  ]) {
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        ...patch,
      }),
    ).toString("base64url");
    assert.equal(
      helpers.readMayaReturnState(`${forged}.${signature}`, now),
      null,
    );
  }
  for (const value of [null, "", token + ".", token + "=", "x".repeat(2049)])
    assert.equal(helpers.readMayaReturnState(value, now), null);
  assert.equal(
    returnHelpers({ CUSTOMER_GUEST_SECRET: "other-key" }).readMayaReturnState(
      token,
      now,
    ),
    null,
  );
  assert.throws(
    () =>
      returnHelpers({}).createMayaReturnState(orderId, attemptId, "success"),
    /temporarily unavailable/,
  );
});

test("Maya returns preserve trusted LAN customers, retain cashier portal routing, and reject spoofed origins", () => {
  const helpers = returnHelpers({
    ...signingEnv,
    NEXT_PUBLIC_CUSTOMER_URL: "http://localhost:4000",
    NEXT_PUBLIC_POS_URL: "http://localhost:4001",
    CUSTOMER_ALLOWED_ORIGINS:
      "http://192.168.18.7:4000,http://192.168.23.21:4000",
  });
  const request = (origin?: string, forwardedHost?: string) =>
    new Request("http://localhost:4000/api/maya/checkout", {
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}),
      },
    });
  for (const origin of [
    "http://192.168.18.7:4000",
    "http://192.168.23.21:4000",
    "http://localhost:4000",
  ])
    assert.equal(helpers.resolveMayaReturnOrigin(request(origin)), origin);
  assert.equal(
    helpers.resolveMayaReturnOrigin(request("http://localhost:4001")),
    "http://localhost:4000",
  );
  assert.equal(
    helpers.resolveMayaReturnOrigin(request(undefined, "attacker.test")),
    "http://localhost:4000",
  );
  for (const origin of [
    "https://attacker.test",
    "null",
    "http://192.168.18.7:4000.attacker.test",
    "http://user:password@192.168.18.7:4000",
  ])
    assert.throws(
      () => helpers.resolveMayaReturnOrigin(request(origin)),
      /origin is not allowed/,
    );
});

test("signed Maya links retain existing order paths and status parameters for each return outcome", () => {
  const helpers = returnHelpers(),
    urls = helpers.createMayaReturnUrls(
      "https://cafe.test/",
      orderId,
      attemptId,
    );
  for (const [key, outcome] of [
    ["success", "success"],
    ["failure", "failed"],
    ["cancel", "cancelled"],
  ] as const) {
    const url = new URL(urls[key]);
    assert.equal(url.origin, "https://cafe.test");
    assert.equal(url.pathname, `/orders/${orderId}`);
    assert.equal(url.searchParams.get("status"), outcome);
    assert.equal(
      helpers.readMayaReturnState(url.searchParams.get("mayaReturnState"))
        ?.outcome,
      outcome,
    );
  }
});

test("browser state never bypasses order authorization or canonical payment-attempt matching", async () => {
  const helpers = returnHelpers();
  let providerCalls = 0;
  const db = jsonDb({
    customer_provider_attempts: { id: attemptId, order_id: orderId },
  });
  const route = load<{ POST: (req: Request) => Promise<Response> }>(
    "apps/customer/app/api/maya/verify/route.ts",
    {
      "next/server": responses,
      "../../../../lib/maya-return-state": helpers,
      "../../../../lib/server-access": {
        ApiAccessError: AccessError,
        PRIVATE_HEADERS: { "Cache-Control": "no-store" },
        getServerDb: () => db,
        requireOrderAccess: async (req: Request, id: string) => {
          assert.equal(id, orderId);
          if (req.headers.get("authorization") !== "Bearer owner-token")
            throw new AccessError("Order access denied.");
        },
        apiAccessErrorResponse: (error: AccessError) =>
          Response.json(
            { error: error.message },
            { status: error.status ?? 500 },
          ),
      },
      "@cafeos/shared/maya": {
        MayaService: {
          verifyAndUpdateOrder: async () => {
            providerCalls++;
            return { success: true, orderId, status: "pending" };
          },
        },
      },
    },
  );
  const request = (body: Record<string, unknown>, authorized = true) =>
    new Request("https://cafe.test/api/maya/verify", {
      method: "POST",
      headers: authorized ? { authorization: "Bearer owner-token" } : {},
      body: JSON.stringify({ checkoutId, ...body }),
    });
  const state = helpers.createMayaReturnState(orderId, attemptId, "success");
  for (const body of [
    { returnState: state, returnOutcome: "cancelled" },
    {
      returnState: helpers.createMayaReturnState(
        differentId,
        attemptId,
        "success",
      ),
      returnOutcome: "success",
    },
    {
      returnState: helpers.createMayaReturnState(
        orderId,
        differentId,
        "success",
      ),
      returnOutcome: "success",
    },
    {
      returnState: helpers.createMayaReturnState(
        orderId,
        attemptId,
        "success",
        Date.now() - 3_600_000,
      ),
      returnOutcome: "success",
    },
  ])
    assert.ok((await route.POST(request(body))).status >= 400);
  assert.equal(providerCalls, 0);
  assert.equal(
    (
      await route.POST(
        request({ returnState: state, returnOutcome: "success" }, false),
      )
    ).status,
    403,
  );
  assert.equal(providerCalls, 0);
  const valid = await route.POST(
    request({ returnState: state, returnOutcome: "success" }),
  );
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).paymentStatus, "pending"); // A signed success return does not assert payment.
  assert.equal(providerCalls, 1);
  assert.equal((await route.POST(request({}))).status, 200); // Existing manual and older checkout links still work for authorized owners.
  assert.equal(providerCalls, 2);
});

test("checkout uses real accepted buyer data, omits fabricated defaults, and embeds signed durable-attempt returns", async () => {
  const helpers = returnHelpers();
  const attemptHelpers = load<
    typeof import("../apps/customer/lib/provider-attempts.ts")
  >("apps/customer/lib/provider-attempts.ts", {
    "./server-access": { ApiAccessError: AccessError },
    "@cafeos/shared/maya-urls": { safeMayaCheckoutUrl },
  });
  for (const scenario of ["pickup", "delivery", "account"] as const) {
    const delivery = scenario === "delivery",
      account = scenario === "account";
    let sentPayload: Record<string, unknown> = {},
      providerCalls = 0,
      finished = 0;
    const maya = load<typeof import("../packages/shared/src/maya.ts")>(
      "packages/shared/src/maya.ts",
      {},
      { NEXT_PUBLIC_MAYA_PUBLIC_KEY: "isolated-public-key" },
      async (_url, init) => {
        providerCalls++;
        sentPayload = JSON.parse(String(init.body));
        return Response.json({
          checkoutId,
          redirectUrl: "https://payments.maya.ph/isolated-checkout",
        });
      },
    );
    const order = {
      id: orderId,
      customer_id: account ? differentId : null,
      order_type: delivery ? "delivery" : "pickup",
      payment_method: "maya",
      payment_status: "pending",
      status: "pending",
      subtotal: 100,
      total: delivery ? 140 : 100,
      delivery_fee: delivery ? 40 : 0,
      ...(delivery
        ? {
            delivery_name: "Real Recipient",
            delivery_phone: "09171234567",
            delivery_address: "Accepted delivery address",
          }
        : {}),
    };
    const db = jsonDb({
      order_items: [
        {
          id: differentId,
          menu_item_id: differentId,
          name: "Coffee",
          price: 100,
          quantity: 1,
        },
      ],
      profiles: {
        full_name: "Profile Name",
        phone: "09171234567",
        email: "profile@example.test",
      },
    });
    let claimed = true;
    const route = load<{ POST: (req: Request) => Promise<Response> }>(
      "apps/customer/app/api/maya/checkout/route.ts",
      {
        "next/server": responses,
        "@cafeos/shared/maya": maya,
        "../../../../lib/maya-return-state": helpers,
        "../../../../lib/server-access": {
          ApiAccessError: AccessError,
          PRIVATE_HEADERS: { "Cache-Control": "no-store" },
          requireOrderAccess: async () => ({
            db,
            order,
            actorId: null,
            isStaff: false,
          }),
          apiAccessErrorResponse: (error: AccessError) =>
            Response.json(
              { error: error.message },
              { status: error.status ?? 500 },
            ),
        },
        "../../../../lib/provider-attempts": {
          ...attemptHelpers,
          claimProviderAttempt: async () => ({
            claimed,
            attempt: {
              id: attemptId,
              remote_id: checkoutId,
              remote_url: "https://payments.maya.ph/isolated-checkout",
              state: "ready",
            },
          }),
          finishProviderAttempt: async () => {
            finished++;
          },
        },
      },
      {
        NEXT_PUBLIC_MAYA_PUBLIC_KEY: "isolated-public-key",
        NEXT_PUBLIC_CUSTOMER_URL: "https://cafe.test",
      },
    );
    const request = () =>
      new Request("https://cafe.test/api/maya/checkout", {
        method: "POST",
        body: JSON.stringify({
          orderId,
          buyer: { email: "forged@example.test" },
        }),
      });
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(providerCalls, 1);
    assert.equal(finished, 1);
    assert.equal(sentPayload.requestReferenceNumber, attemptId);
    const urls = sentPayload.redirectUrl as Record<string, string>;
    const state = helpers.readMayaReturnState(
      new URL(urls.success).searchParams.get("mayaReturnState"),
    );
    assert.equal(state?.orderId, orderId);
    assert.equal(state?.attemptId, attemptId);
    if (account)
      assert.deepEqual(sentPayload.buyer, {
        firstName: "Profile",
        lastName: "Name",
        contact: { phone: "+639171234567", email: "profile@example.test" },
      });
    else if (!delivery) assert.equal("buyer" in sentPayload, false);
    else {
      assert.deepEqual(sentPayload.buyer, {
        firstName: "Real",
        lastName: "Recipient",
        contact: { phone: "+639171234567" },
        shippingAddress: {
          line1: "Accepted delivery address",
          countryCode: "PH",
        },
      });
    }
    for (const invented of [
      "customer@jaydscafe.com",
      "+639000000000",
      "Dasmariñas",
      "forged@example.test",
    ])
      assert.equal(JSON.stringify(sentPayload).includes(invented), false);
    claimed = false;
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(providerCalls, 1);
    assert.equal(finished, 1); // Reuse does not create a second charge session.
  }
});
