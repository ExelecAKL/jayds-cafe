// UI fixtures only: no hosted database, provider, email or push mutations.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { LEGAL_VERSION } from "../apps/customer/lib/legal.ts";
const root = process.cwd(),
  base =
    process.env.JAYDS_DEMO_EXISTING_PORTS === "1"
      ? `http://${process.env.JAYDS_DEMO_HOST || "127.0.0.1"}:4000`
      : "http://127.0.0.1:4320",
  output = path.join(root, ".codex-logs/customer-screens");
mkdirSync(output, { recursive: true });
const server =
  process.env.JAYDS_DEMO_EXISTING_PORTS === "1"
    ? null
    : spawn(
        process.execPath,
        [
          path.join(root, "node_modules/next/dist/bin/next"),
          "start",
          "-p",
          "4320",
          "-H",
          "127.0.0.1",
        ],
        {
          cwd: path.join(root, "apps/customer"),
          windowsHide: true,
          stdio: "ignore",
          env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: "" },
        },
      );
const browser = await chromium.launch({ channel: "chrome", headless: true });
const categories = Array.from({ length: 7 }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  name: [
    "Espresso",
    "Tea",
    "Chocolate",
    "Frappes",
    "Refreshers",
    "Breakfast",
    "Café treats",
  ][i],
  sort_order: i,
  is_active: true,
  status: "active",
}));
const products = Array.from({ length: 55 }, (_, i) => {
  const id = `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  return {
    id,
    name:
      i === 0
        ? "Spanish Latte"
        : i === 1
          ? "Salted Caramel Latte"
          : i === 2
            ? "Sold-out Matcha"
            : i === 54
              ? "Benguet Espresso with Oat Milk and Caramel, a very long café product name"
              : `Jayds café favorite ${i + 1}`,
    description: "A little cup of happy, made your way.",
    price: 145,
    image_url: "/startup/jayds-logo.png",
    category_id: categories[i % 7].id,
    category: categories[i % 7],
    status: "active",
    is_available: i !== 2,
    is_featured: i < 4,
    prep_time_minutes: 5,
    tags: ["coffee"],
    sort_order: i,
    variants:
      i === 0
        ? [
            {
              id: "size-regular",
              menu_item_id: id,
              variant_group: "size",
              label: "16oz",
              is_default: true,
              price_modifier: 0,
              sort_order: 0,
              is_available: true,
            },
            {
              id: "size-large",
              menu_item_id: id,
              variant_group: "size",
              label: "22oz",
              is_default: false,
              price_modifier: 25,
              sort_order: 1,
              is_available: true,
            },
          ]
        : [],
  };
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const orders = new Map<string, Record<string, unknown>>(),
  submissions = new Map<string, string>();
let createRequests = 0,
  conflictNext = true,
  loseNext = true,
  supportFailure = true,
  gpsCalls = 0,
  voucherValidations = 0;
const fixtureAccount = {
  id: "10000000-0000-4000-8000-000000000099",
  aud: "authenticated",
  role: "authenticated",
  email: "member@example.test",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
let fixtureSignedIn = false,
  currentLegalAccepted = false;
const fixtureProfile = {
  id: fixtureAccount.id,
  email: fixtureAccount.email,
  full_name: "Fixture Member",
  phone: "",
  role: "customer",
  is_approved: false,
  points: 120,
  loyalty_tier: "Bronze",
  total_spent: 0,
};
const fixtureSession = () => ({
  access_token: [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: fixtureAccount.id,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "isolated-signature",
  ].join("."),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "isolated-refresh-token",
  user: fixtureAccount,
});
await context.addInitScript(() => {
  // Exercise the same browser API availability as the user's LAN HTTP URL.
  Object.defineProperty(crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  (window as unknown as { fixtureGpsCalls: number }).fixtureGpsCalls = 0;
  navigator.geolocation.getCurrentPosition = (_success, error) => {
    (window as unknown as { fixtureGpsCalls: number }).fixtureGpsCalls++;
    error?.({
      code: 1,
      message: "Permission denied",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  };
  const metrics = { lcp: 0, cls: 0, interaction: 0 };
  (window as unknown as { fixtureMetrics: typeof metrics }).fixtureMetrics =
    metrics;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        hadRecentInput: boolean;
        value: number;
      })[])
        if (!entry.hadRecentInput) metrics.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        metrics.interaction = Math.max(metrics.interaction, entry.duration);
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  } catch {}
});
await context.routeWebSocket(/supabase\.co\/realtime/, (socket) => {
  socket.onMessage((m) => {
    const a = JSON.parse(String(m));
    if (Array.isArray(a))
      socket.send(
        JSON.stringify([
          a[0],
          a[1],
          a[2],
          "phx_reply",
          { status: "ok", response: { postgres_changes: [] } },
        ]),
      );
    else
      socket.send(
        JSON.stringify({
          topic: a.topic,
          ref: a.ref,
          event: "phx_reply",
          payload: { status: "ok", response: { postgres_changes: [] } },
        }),
      );
  });
});
await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
  const url = new URL(route.request().url()),
    name = url.pathname.split("/").at(-1);
  if (url.pathname.includes("/auth/")) {
    if (name === "token" && route.request().method() === "POST") {
      fixtureSignedIn = true;
      await route.fulfill({ json: fixtureSession() });
      return;
    }
    if (name === "user" && fixtureSignedIn) {
      await route.fulfill({ json: fixtureAccount });
      return;
    }
    if (name === "logout") {
      fixtureSignedIn = false;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      status: 401,
      json: { message: "No fixture session" },
    });
    return;
  }
  if (name === "profiles") {
    await route.fulfill({ json: fixtureProfile });
    return;
  }
  if (name === "get_published_catalog") {
    await route.fulfill({
      json: { version: 1, categories, menuItems: products },
    });
    return;
  }
  if (name === "get_configuration_availability") {
    await route.fulfill({ json: { available: true, reason: null } });
    return;
  }
  await route.fulfill({ json: [] });
});
await context.route(base + "/api/**", async (route) => {
  const req = route.request(),
    pathname = new URL(req.url()).pathname;
  if (pathname === "/api/branch") {
    await route.fulfill({
      json: {
        name: "Jayds Café",
        address: "Verified branch fixture",
        latitude: 14.346621,
        longitude: 120.981057,
        delivery_radius_km: 8,
        version: "fixture-1",
        scheduled_pickup_enabled: false,
      },
    });
    return;
  }
  if (pathname === "/api/pickup/slots") {
    await route.fulfill({
      json: {
        enabled: false,
        slots: [],
        reason: "Admin must configure hours and capacity.",
      },
    });
    return;
  }
  if (pathname === "/api/customer/push") {
    await route.fulfill({ json: { configured: false } });
    return;
  }
  if (pathname === "/api/customer/favorites") {
    await route.fulfill({ json: { items: [] } });
    return;
  }
  if (pathname === "/api/customer/legal") {
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      assert.equal(body.version, LEGAL_VERSION);
      assert.equal(body.acknowledged, true);
      currentLegalAccepted = true;
    }
    await route.fulfill({
      json: { version: LEGAL_VERSION, acknowledged: currentLegalAccepted },
    });
    return;
  }
  if (pathname === "/api/vouchers/validate") {
    const body = req.postDataJSON();
    voucherValidations++;
    assert.ok(body.subtotal > 0 && body.itemIds.includes(products[0].id));
    await route.fulfill({
      status: body.code === "DEMO10" ? 200 : 400,
      json:
        body.code === "DEMO10"
          ? {
              code: "DEMO10",
              description: "Isolated demo voucher",
              discount_type: "fixed",
              discount_value: 10,
              applicable_item_ids: null,
              application_mode: "whole_order",
              max_discount_amount: null,
            }
          : { error: "This demo voucher has expired." },
    });
    return;
  }
  if (pathname === "/api/orders/guest") {
    await route.fulfill({ json: { orders: [...orders.values()] } });
    return;
  }
  if (pathname === "/api/customer/support") {
    if (req.method() === "GET") {
      await route.fulfill({ json: { cases: [] } });
      return;
    }
    if (supportFailure) {
      supportFailure = false;
      await route.fulfill({
        status: 503,
        json: { error: "Simulated save failure. Your entries are retained." },
      });
      return;
    }
    await route.fulfill({ json: { id: "support-fixture" } });
    return;
  }
  if (pathname === "/api/lalamove/quotation") {
    await route.fulfill({
      status: 503,
      json: {
        error: "Map/courier fixture unavailable. Pickup remains available.",
      },
    });
    return;
  }
  if (pathname === "/api/orders/create") {
    createRequests++;
    const body = req.postDataJSON();
    assert.equal(body.voucher_code, "DEMO10");
    assert.equal(body.discount, 10);
    assert.equal(body.total, 280);
    if (conflictNext) {
      conflictNext = false;
      await route.fulfill({
        status: 409,
        json: { error: "Current stock changed. Review your bag." },
      });
      return;
    }
    const key = req.headers()["idempotency-key"];
    assert.ok(key);
    let id = submissions.get(key);
    if (!id) {
      id = "30000000-0000-4000-8000-000000000001";
      submissions.set(key, id);
      orders.set(id, {
        ...body,
        id,
        order_number: "ORD-10000",
        status: "pending",
        payment_status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1800000).toISOString(),
      });
    }
    if (loseNext) {
      loseNext = false;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: { id, order_number: "ORD-10000" } });
    return;
  }
  if (pathname.startsWith("/api/orders/")) {
    const order = orders.get(pathname.split("/").at(-1)!);
    await route.fulfill({
      status: order ? 200 : 403,
      json: order ? { order } : { error: "Order access denied" },
    });
    return;
  }
  await route.fulfill({
    status: 403,
    json: { error: "Unsupported isolated fixture operation" },
  });
});
await context.route(
  (url) => url.protocol === "https:" && !url.hostname.endsWith(".supabase.co"),
  (route) => route.abort(),
);
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/login")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  await page.goto(base + "/menu/browse");
  await page.getByText("55 products", { exact: true }).waitFor();
  await page.locator(".startup-overlay").waitFor({ state: "detached" });
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [834, 1112],
    [1024, 768],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: path.join(output, `menu-${width}.png`),
      animations: "disabled",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Menu horizontal overflow at " + width,
    );
    const target = await page
      .getByRole("link", { name: "Select Spanish Latte", exact: true })
      .boundingBox();
    assert.ok(
      target && target.width >= 48 && target.height >= 48,
      "Consistent Select touch target",
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Portrait uses a category rail; returning from an item retains browsing
  // context. Search deliberately spans all categories, even after filtering.
  const rail = await page
    .getByRole("navigation", { name: "Menu categories" })
    .boundingBox();
  const results = await page
    .getByRole("region", { name: "Menu products" })
    .boundingBox();
  assert.ok(
    rail && results && rail.x + rail.width <= results.x,
    "Portrait category rail beside products",
  );
  await page.getByRole("button", { name: "Tea", exact: true }).click();
  await page.getByText("8 products", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: "View Salted Caramel Latte", exact: true })
    .click();
  await page.getByRole("link", { name: "Go back", exact: true }).click();
  await page.getByText("8 products", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Tea", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("searchbox").fill("Spanish Latte");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByText("8 products", { exact: true }).waitFor();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByText("55 products", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: "View Spanish Latte", exact: true })
    .click();
  await page.getByRole("button", { name: /22oz/ }).click();
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.getByLabel("A little note", { exact: true }).fill("Less ice");
  await page
    .locator(".detail-mobile-summary strong")
    .filter({ hasText: "₱340.00" })
    .waitFor();
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
    [390, 440],
    [768, 1024],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    const action = await page
      .getByRole("button", { name: /Add to bag/ })
      .boundingBox();
    assert.ok(
      action && action.y + action.height <= height,
      "Customization action visible at " + width + "×" + height,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Customization overflow at " + width,
    );
    await page.screenshot({
      path: path.join(output, `detail-${width}-${height}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page
    .getByRole("link", { name: /View bag/ })
    .first()
    .click();
  await page.getByText("Note: Less ice", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Spanish Latte quantity", { exact: true })
      .textContent(),
    "2",
  );
  await page
    .getByRole("button", { name: "Clear your bag", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear bag", exact: true }).click();
  await page.goto(base + "/menu/browse");
  await page.getByText("55 products", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Add Sold-out Matcha/ }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Save Spanish Latte to favorites" })
    .click();
  await page.goto(base + "/favorites");
  await page.getByRole("link", { name: "View Spanish Latte" }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: "View Spanish Latte" }).waitFor();
  await page.goto(base + "/menu/browse");
  await page
    .getByRole("link", { name: "Select Spanish Latte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page
    .getByLabel("2 items in bag", { exact: true })
    .waitFor({ state: "attached" });
  await page.goto(base + "/cart");
  await page.getByLabel("Spanish Latte quantity", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Spanish Latte quantity", { exact: true })
      .textContent(),
    "2",
  );
  await page
    .getByRole("button", { name: "Add item note", exact: true })
    .click();
  await page.getByLabel("Optional request for this item").fill("Less ice");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.reload();
  await page.getByText("Note: Less ice", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Remove Spanish Latte", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await page.getByText("Note: Less ice", { exact: true }).waitFor();
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1024, 540],
  ]) {
    await page.setViewportSize({ width, height });
    const c = page.getByRole("link", {
      name: width >= 1024 && height > 700 ? "Review checkout" : "Checkout",
      exact: true,
    });
    const box = await c.boundingBox();
    assert.ok(
      box && box.y + box.height <= height,
      "Checkout action visible at " + width,
    );
    await page.screenshot({
      path: path.join(output, `bag-${width}-${height}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Clear your bag" }).click();
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  );
  await page.getByRole("button", { name: "Keep my items" }).click();
  await page.goto(base + "/checkout");
  const reviewAction = await page
    .getByRole("button", { name: /Review order/ })
    .boundingBox();
  assert.ok(
    reviewAction && reviewAction.y + reviewAction.height <= 844,
    "Portrait checkout action stays visible",
  );
  await page
    .getByRole("button", { name: "Schedule pickup", exact: true })
    .click();
  await page.getByText("Admin must configure hours and capacity.").waitFor();
  await page.getByRole("button", { name: "As soon as possible" }).click();
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByRole("button", { name: "Choose destination on map" }).click();
  const map = page.getByRole("dialog");
  const secureGpsContext = await page.evaluate(() => window.isSecureContext);
  await map.getByRole("button", { name: "Use my location" }).click();
  await map
    .getByText(
      secureGpsContext
        ? /Location access was unavailable/
        : /GPS needs a secure connection/,
    )
    .waitFor();
  gpsCalls = await page.evaluate(
    () => (window as unknown as { fixtureGpsCalls: number }).fixtureGpsCalls,
  );
  assert.equal(gpsCalls, secureGpsContext ? 1 : 0);
  await map.getByRole("button", { name: "Close map", exact: true }).click();
  await page.getByRole("button", { name: "Pickup", exact: true }).click();
  await page.getByText("Voucher and rewards", { exact: true }).click();
  await page.getByLabel("Voucher code", { exact: true }).fill("EXPIRED");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByText("This demo voucher has expired.", { exact: true })
    .waitFor();
  await page.getByLabel("Voucher code", { exact: true }).fill("DEMO10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByText("DEMO10 applied", { exact: false }).waitFor();
  await page
    .locator(".checkout-action-total strong")
    .filter({ hasText: "₱280.00" })
    .waitFor();
  await page
    .getByRole("button", { name: "Cash at counter", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm review" }).click();
  await page.screenshot({
    path: path.join(output, "checkout-390.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Review order/ }).click();
  await page
    .getByRole("button", { name: "Place order", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "confirm-390.png"),
    animations: "disabled",
  });
  assert.equal(createRequests, 0, "Review never automatically submits");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("Current stock changed. Review your bag.").waitFor();
  assert.equal(orders.size, 0);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cafeos-cart:guest") ?? "{}").items
          .length,
    ),
    1,
  );
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByRole("button", { name: "Recover confirmation" }).waitFor();
  await page.screenshot({
    path: path.join(output, "confirmation-recovery-390.png"),
    animations: "disabled",
  });
  assert.equal(orders.size, 1);
  await page.reload();
  await page.getByRole("button", { name: "Recover confirmation" }).click();
  await page.getByRole("heading", { name: "ORD-10000", exact: true }).waitFor();
  assert.equal(submissions.size, 1);
  assert.equal(createRequests, 3);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cafeos-cart:guest") ?? "{}").items
          .length,
    ),
    0,
    "Only confirmed success clears the draft",
  );
  const acceptedOrder = [...orders.values()][0];
  acceptedOrder.order_source = "app";
  acceptedOrder.order_type = "pickup";
  acceptedOrder.payment_method = "cash";
  acceptedOrder.payment_status = "pending";
  acceptedOrder.status = "ready";
  acceptedOrder.expires_at = null;
  acceptedOrder.pickup_qr = `pickup:${acceptedOrder.id}:isolated-private-token`;
  await page.reload();
  await page.getByText("Pay at pickup", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Pay & collect at the café", exact: true })
    .waitFor();
  await page
    .getByRole("img", { name: "Pickup QR for collection", exact: true })
    .waitFor();
  assert.equal(await page.getByText("Paid", { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Dismiss order notice", exact: true })
      .count(),
    0,
    "The ready notice must not cover the current order’s pickup QR",
  );
  await page
    .getByText("Getting your café ready…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.screenshot({
    path: path.join(output, "cash-ready-pickup-390.png"),
  });
  acceptedOrder.payment_review_required = true;
  await page.reload();
  await page
    .getByText(/The café needs to review a payment linked to this order/)
    .waitFor();
  await page.getByRole("button", { name: "Review & order again" }).click();
  await page.getByRole("button", { name: "Add reviewed items" }).click();
  await page.getByText("Note: Less ice", { exact: true }).waitFor();
  await page.goto(base + "/help?order=30000000-0000-4000-8000-000000000001");
  await page.getByLabel("Subject", { exact: true }).fill("Order question");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please check this isolated fixture.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page
    .getByText("Simulated save failure. Your entries are retained.")
    .waitFor();
  assert.equal(
    await page.getByLabel("Message", { exact: true }).inputValue(),
    "Please check this isolated fixture.",
  );
  await page.getByRole("button", { name: "Send request" }).click();
  await page
    .getByText("Your request is saved. Staff replies will appear here.")
    .waitFor();
  for (const route of [
    "/account",
    "/rewards",
    "/vouchers",
    "/notifications",
    "/terms",
    "/privacy",
    "/register",
    "/forgot-password",
    "/reset-password",
  ]) {
    await page.goto(base + route);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Phone overflow " + route,
    );
  }
  await page.goto(base + "/menu/browse");
  await page.getByText("55 products", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Select Spanish Latte", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Spanish Latte", exact: true })
    .waitFor();
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page
    .getByRole("link", { name: /View bag/ })
    .first()
    .waitFor();
  await context.setOffline(false);
  // Let reconnect requests and any Next navigation recovery settle before
  // reading a frame. Verify the offline addition survives that recovery.
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("3 items in bag", { exact: true })
    .waitFor({ state: "attached" });
  // Formal legal pages stay readable and provide exact archived text.
  for (const width of [360, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 844 });
    for (const kind of ["terms", "privacy"]) {
      await page.goto(base + "/" + kind);
      await page.waitForLoadState("networkidle");
      await page.locator(".legal-document").waitFor();
      assert.ok((await page.locator(".legal-section").count()) >= 15);
      await page.locator(".legal-contents summary").click();
      await page.locator(".legal-contents a").last().click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Legal phone overflow",
      );
    }
  }
  await page.goto(base + "/privacy?version=2026-10-03");
  await page.waitForLoadState("networkidle");
  await page.getByText(/Archived version/).waitFor();
  assert.equal(await page.locator(".legal-section").count(), 6);
  await page
    .getByRole("link", { name: "Read the current document", exact: true })
    .click();
  await page
    .getByText("Effective 7 October 2026 · Version " + LEGAL_VERSION, {
      exact: true,
    })
    .waitFor();
  const unpublished = await page.goto(base + "/terms?version=2030-01-01");
  assert.ok(
    unpublished?.status() === 404 ||
      (await page.getByText("404", { exact: true }).count()) > 0,
    "Unknown legal versions show a missing page rather than a current policy",
  );
  // Sign in using wholly intercepted synthetic credentials. This exercises
  // the order subscription that previously crashed on the LAN URL.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixtureAccount.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-test-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByText("Hello, Fixture.", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Hello, Fixture.", { exact: true }).waitFor();
  for (const route of [
    "/menu/browse",
    "/orders",
    "/account",
    "/favorites",
    "/rewards",
    "/vouchers",
    "/profile/edit",
    "/profile/addresses",
    "/notifications",
    "/help",
  ]) {
    await page.goto(base + route);
    await page.waitForLoadState("networkidle");
    await page.locator(".jayds-app").waitFor();
    assert.equal(
      new URL(page.url()).pathname,
      route,
      "Authenticated route remains stable after session initialization",
    );
    assert.equal(
      await page.getByText("This page couldn’t load", { exact: true }).count(),
      0,
      "Authenticated page " + route,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Authenticated overflow " + route,
    );
  }
  await page.goto(base + "/menu/browse/" + products[0].id);
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page.goto(base + "/checkout");
  await page.getByRole("checkbox", { name: /I agree to the/ }).check();
  await page
    .getByRole("button", { name: "Confirm review", exact: true })
    .click();
  await page
    .getByText("Terms and Privacy Notice reviewed · " + LEGAL_VERSION, {
      exact: true,
    })
    .waitFor();
  assert.ok(
    currentLegalAccepted,
    "Historical account must separately acknowledge the current version",
  );
  await page.getByText("Voucher and rewards", { exact: true }).click();
  await page.getByLabel("Voucher code", { exact: true }).fill("DEMO10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByText("DEMO10 applied", { exact: false }).waitFor();
  await page.getByLabel(/Use points · up to/).fill("10");
  await page
    .locator(".checkout-action-total strong")
    .filter({ hasText: "₱134.00" })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "voucher-and-points-390.png"),
    animations: "disabled",
  });
  await page.goto(base + "/account");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL(base + "/menu");
  await page.goto(base + "/account");
  await page
    .getByRole("link", { name: /Sign in/ })
    .first()
    .waitFor();
  assert.equal(fixtureSignedIn, false);
  assert.equal(
    await page.evaluate(
      (id) => localStorage.getItem("cafeos-cart:" + id),
      fixtureAccount.id,
    ),
    null,
    "Private draft removed after logout",
  );
  const metrics = await page.evaluate(
    () =>
      (window as unknown as { fixtureMetrics: Record<string, number> })
        .fixtureMetrics,
  );
  const report = {
    base,
    isolated: true,
    products: 55,
    widths: [360, 390, 430, 768, 834, 1024, 1280],
    gpsOnlyAfterTap: gpsCalls,
    checkoutRequests: createRequests,
    canonicalSales: orders.size,
    voucherValidations,
    voucherAndPointsReview: true,
    controlledLocalMetrics: metrics,
    metricScope:
      "Local fixture browser timings, not production measurements or field INP.",
    errors,
  };
  writeFileSync(
    path.join(root, ".codex-logs/customer-browser-verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  assert.deepEqual(errors, []);
} finally {
  server?.kill();
  await browser.close();
}
