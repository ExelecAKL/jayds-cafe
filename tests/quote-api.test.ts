import assert from "node:assert/strict";
import test from "node:test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://quotes-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-server-only";
const { POST: customerQuote } =
  await import("../apps/customer/app/api/orders/quote/route.ts");
const { POST: cashierQuote } =
  await import("../apps/pos/app/api/orders/quote/route.ts");
const item = "20000000-0000-4000-8000-000000000001";
test("quote APIs enforce current sessions, roles, body limits and retryable failures without writes", async () => {
  const original = globalThis.fetch;
  let role = "staff",
    approved = true,
    valid = true,
    stock = true,
    tax = true,
    writes = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.origin, "https://quotes-fixture.supabase.co");
    if (url.pathname === "/auth/v1/user")
      return valid
        ? Response.json({
            id: "10000000-0000-4000-8000-000000000001",
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-10-16",
          })
        : Response.json({ message: "Invalid token" }, { status: 401 });
    if (url.pathname === "/rest/v1/profiles")
      return Response.json({
        id: "10000000-0000-4000-8000-000000000001",
        role,
        is_approved: approved,
        points: 50,
      });
    if (url.pathname === "/rest/v1/menu_items")
      return Response.json([
        {
          id: item,
          name: "Coffee",
          price: 112,
          status: "active",
          is_available: true,
          variants: [],
        },
      ]);
    if (url.pathname === "/rest/v1/finance_settings")
      return tax
        ? Response.json({ delivery_tax_treatment: "pending" })
        : Response.json({ message: "Unavailable" }, { status: 503 });
    if (url.pathname === "/rest/v1/rpc/finance_check_quote")
      return stock
        ? Response.json(null)
        : Response.json(
            { message: "Coffee is sold out", code: "P0001" },
            { status: 400 },
          );
    if (url.pathname === "/rest/v1/rpc/finance_unpaid_quote")
      return Response.json({ breakdown: null, total: 112 });
    writes++;
    throw Error("Unexpected quote mutation");
  };
  const body = {
    order_type: "pickup",
    payment_method: "cash",
    points_redeemed: 0,
    items: [
      {
        menu_item_id: item,
        name: "Coffee",
        price: 112,
        quantity: 1,
        subtotal: 112,
        variants: [],
      },
    ],
    subtotal: 112,
    total: 112,
    discount: 0,
  };
  const request = (
    value: unknown = body,
    headers: Record<string, string> = {},
  ) =>
    new Request("https://app.fixture/api/orders/quote", {
      method: "POST",
      headers: {
        Origin: "https://app.fixture",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(value),
    });
  const auth = { Authorization: "Bearer fixture" };
  try {
    assert.equal(
      (await customerQuote(request(body, { Origin: "https://evil.example" })))
        .status,
      403,
    );
    const guest = await customerQuote(request());
    assert.equal(guest.status, 200);
    assert.match(guest.headers.get("cache-control") ?? "", /no-store/);
    const quote = await guest.json();
    assert.equal(quote.total, 11200);
    assert.equal(quote.breakdown.vat, 1200);
    assert.equal((await cashierQuote(request())).status, 401);
    valid = false;
    assert.equal((await customerQuote(request(body, auth))).status, 401);
    assert.equal((await cashierQuote(request(body, auth))).status, 401);
    valid = true;
    role = "customer";
    assert.equal((await cashierQuote(request(body, auth))).status, 403);
    role = "staff";
    approved = false;
    assert.equal((await cashierQuote(request(body, auth))).status, 403);
    approved = true;
    assert.equal((await cashierQuote(request(body, auth))).status, 200);
    assert.equal(
      (await cashierQuote(request({ order_id: item }, auth))).status,
      200,
    );
    assert.equal((await customerQuote(request({ items: [] }))).status, 400);
    assert.equal(
      (await cashierQuote(request({ items: [] }, auth))).status,
      400,
    );
    assert.equal(
      (await customerQuote(request(body, { "content-length": "9999999" })))
        .status,
      413,
    );
    assert.equal(
      (
        await cashierQuote(
          request(body, { ...auth, "content-length": "9999999" }),
        )
      ).status,
      413,
    );
    stock = false;
    assert.equal((await customerQuote(request())).status, 409);
    assert.equal((await cashierQuote(request(body, auth))).status, 409);
    stock = true;
    tax = false;
    assert.equal((await customerQuote(request())).status, 503);
    assert.equal((await cashierQuote(request(body, auth))).status, 503);
    tax = true;
    assert.equal((await customerQuote(request())).status, 200);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = original;
  }
});
