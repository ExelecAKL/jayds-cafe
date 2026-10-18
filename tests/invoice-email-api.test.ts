import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinancials } from "../packages/shared/src/finance/calculations";
process.env.NEXT_PUBLIC_SUPABASE_URL =
  "https://invoice-email-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-server-only";
const { POST, GET } =
  await import("../apps/customer/app/api/jobs/invoice-emails/route");
test("invoice worker authenticates before reads, waits for provider setup, freezes retries and suppresses changed owners", async () => {
  const original = globalThis.fetch;
  const previous = Object.fromEntries(
    ["CUSTOMER_JOB_SECRET", "RESEND_API_KEY", "INVOICE_EMAIL_FROM"].map((k) => [
      k,
      process.env[k],
    ]),
  );
  let contexts = 0,
    providerCalls = 0,
    providerStatus = 200,
    ownershipChanged = false,
    claimFails = false;
  let frozen: unknown = null;
  const outcomes: string[] = [];
  const row = {
    id: "40000000-0000-4000-8000-000000000001",
    invoice_id: "50000000-0000-4000-8000-000000000001",
    lease_token: "60000000-0000-4000-8000-000000000001",
  };
  const invoice = {
    id: row.invoice_id,
    order_id: "20000000-0000-4000-8000-000000000002",
    kind: "invoice",
    number: "JD-42",
    issued_at: "2026-10-18T03:00:00Z",
    buyer: { name: "Fixture Customer" },
    business: {
      registered_name: "Fixture Owner",
      address: "Fixture address",
      tin: "000",
      branch_code: "000",
    },
    breakdown: calculateFinancials({
      items: [
        {
          menu_item_id: "70000000-0000-4000-8000-000000000001",
          name: "Fixture Latte",
          price: 112,
          quantity: 1,
        },
      ],
    }),
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "api.resend.com") {
      providerCalls++;
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        `jayds-invoice/${row.invoice_id}/v1`,
      );
      assert.deepEqual(JSON.parse(String(init?.body)), frozen);
      return providerStatus === 200
        ? Response.json({ id: "fixture-provider-id" })
        : Response.json(
            { error: "PRIVATE CUSTOMER DATA MUST NOT BE LOGGED" },
            { status: providerStatus },
          );
    }
    const rpc = url.pathname.split("/").at(-1),
      body = JSON.parse(String(init?.body));
    if (rpc === "invoice_email_claim")
      return claimFails
        ? Response.json({ message: "offline" }, { status: 500 })
        : Response.json([row]);
    if (rpc === "invoice_email_context") {
      contexts++;
      return Response.json(
        ownershipChanged && contexts % 2 === 0
          ? null
          : { invoice, recipient: "customer@example.test", payload: frozen },
      );
    }
    if (rpc === "invoice_email_prepare") {
      frozen ??= body.p_payload;
      return Response.json(frozen);
    }
    if (rpc === "invoice_email_finish") {
      outcomes.push(body.p_outcome);
      assert.doesNotMatch(body.p_error ?? "", /PRIVATE|customer@/);
      return Response.json(true);
    }
    throw new Error("Unexpected isolated invoice request");
  };
  const request = (authorized = true) =>
    new Request("https://customer.fixture/api/jobs/invoice-emails", {
      method: "POST",
      headers: authorized ? { Authorization: "Bearer fixture-job-secret" } : {},
    });
  try {
    process.env.CUSTOMER_JOB_SECRET = "fixture-job-secret";
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_EMAIL_FROM;
    assert.equal((await POST(request(false))).status, 401);
    assert.equal((await GET(request(false))).status, 401);
    assert.equal((await (await GET(request())).json()).configured, false);
    assert.equal(providerCalls, 0);
    const unconfigured = await POST(request());
    assert.equal(unconfigured.status, 200);
    assert.equal((await unconfigured.json()).configured, false);
    assert.equal(contexts, 0);
    process.env.RESEND_API_KEY = "fixture-key";
    process.env.INVOICE_EMAIL_FROM = "Jayds Café <receipts@example.test>";
    assert.equal((await POST(request())).status, 200);
    assert.deepEqual(outcomes, ["sent"]);
    assert.equal(providerCalls, 1);
    providerStatus = 500;
    await POST(request());
    assert.equal(outcomes.at(-1), "pending");
    providerStatus = 403;
    await POST(request());
    assert.equal(outcomes.at(-1), "review");
    const before = providerCalls;
    ownershipChanged = true;
    contexts = 0;
    await POST(request());
    assert.equal(outcomes.at(-1), "suppressed");
    assert.equal(providerCalls, before);
    claimFails = true;
    assert.equal((await POST(request())).status, 503);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
