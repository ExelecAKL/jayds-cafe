// Run after building Admin. All database/auth traffic is intercepted with
// synthetic records; this exercise never changes the cafe's live data.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, type Page } from "@playwright/test";

const root = process.cwd();
const port = 4282;
const origin = `http://127.0.0.1:${port}`;
const output = path.join(root, ".codex-logs", "admin-pagination");
mkdirSync(output, { recursive: true });
const timestamp = new Date().toISOString();
const id = (group: number, n: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const list = (count: number, make: (n: number) => Record<string, unknown>) =>
  Array.from({ length: count }, (_, i) => make(i + 1));
const admin = {
  id: id(1, 1),
  full_name: "Pagination QA",
  email: "qa@example.test",
  role: "admin",
  is_approved: true,
  points: 100,
  created_at: timestamp,
};
const user = {
  ...admin,
  role: "authenticated",
  aud: "authenticated",
  user_metadata: { role: "admin" },
  app_metadata: { provider: "email" },
};
const session = {
  access_token: "isolated-browser-fixture",
  refresh_token: "fixture",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const category = {
  id: id(2, 1),
  name: "QA drinks",
  sort_order: 1,
  is_active: true,
  status: "active",
  created_at: timestamp,
};
const menu = list(55, (n) => ({
  id: id(3, n),
  name: `Product ${String(n).padStart(2, "0")}`,
  category_id: category.id,
  category,
  price: 100,
  description: "QA product",
  is_available: true,
  status: "active",
  is_featured: false,
  variants: [],
  image_url: null,
  sort_order: n,
  tags: [],
  prep_time_minutes: 5,
  created_at: timestamp,
}));
const stock = list(49, (n) => ({
  id: id(4, n),
  name: `Stock ${String(n).padStart(2, "0")}`,
  sku: `SKU-${n}`,
  stock_kind: "ingredient",
  unit: "g",
  cost_per_unit: 1,
  current_stock: 100,
  reserved_stock: 0,
  available_stock: 100,
  incoming_stock: 0,
  min_stock_alert: 10,
  max_stock: null,
  stock_value: 100,
  expiring_stock: 0,
  pack_size: 1,
  min_purchase_packs: 1,
  lead_time_days: 1,
  stock_version: 1,
}));
const suppliers = list(23, (n) => ({
  id: id(5, n),
  name: `Supplier ${n}`,
  contact_name: "QA contact",
  email: "supplier@example.test",
  phone: "",
  lead_time_days: 1,
  is_active: true,
  notes: null,
}));
const orders = list(35, (n) => ({
  id: id(6, n),
  order_number: `QA-${String(n).padStart(3, "0")}`,
  customer_id: admin.id,
  customer: admin,
  order_source: "mobile_app",
  order_type: "pickup",
  status: "completed",
  payment_method: "maya",
  payment_status: "paid",
  subtotal: 100,
  total: 100,
  points_earned: 1,
  stock_conflict: false,
  is_parked: false,
  created_at: timestamp,
  updated_at: timestamp,
  items: [{ id: id(7, n) }],
}));
const purchases = list(23, (n) => ({
  id: id(8, n),
  number: `PO-QA-${n}`,
  supplier_id: suppliers[0].id,
  supplier: suppliers[0],
  status: "draft",
  expected_on: null,
  notes: null,
  created_at: timestamp,
  lines: list(23, (l) => ({
    id: id(9, n * 100 + l),
    ingredient_id: stock[l - 1].id,
    ingredient: stock[l - 1],
    quantity: 20,
    received_quantity: 0,
    unit_cost: 1,
  })),
}));
const tables: Record<string, Record<string, unknown>[]> = {
  profiles: [
    admin,
    ...list(23, (n) => ({
      ...admin,
      id: id(10, n),
      role: "staff",
      full_name: `Staff ${n}`,
      email: `staff${n}@example.test`,
    })),
    ...list(23, (n) => ({
      ...admin,
      id: id(11, n),
      role: "customer",
      full_name: `Customer ${n}`,
      email: `customer${n}@example.test`,
    })),
  ],
  categories: [category],
  menu_items: menu,
  stock_overview: stock,
  ingredients: stock,
  suppliers,
  orders,
  purchase_orders: purchases,
  menu_item_ingredients: menu.map((m, i) => ({
    id: id(12, i + 1),
    menu_item_id: m.id,
    ingredient_id: stock[i % stock.length].id,
    quantity_used: 1,
    ingredient: { cost_per_unit: 1 },
  })),
  variant_ingredients: [],
  item_variants: [],
  stock_batches: list(23, (n) => ({
    id: id(13, n),
    ingredient_id: stock[0].id,
    batch_code: `BATCH-${n}`,
    quantity: 10,
    reserved: 0,
    unit_cost: 1,
    expires_on: null,
    received_at: timestamp,
  })),
  stock_movements: list(23, (n) => ({
    id: id(14, n),
    ingredient_id: stock[n - 1].id,
    movement_type: "receipt",
    quantity: 10,
    balance_after: 100,
    reason: "QA receipt",
    actor_id: admin.id,
    created_at: timestamp,
  })),
  stocktakes: list(23, (n) => ({
    id: id(15, n),
    ingredient_id: stock[n - 1].id,
    expected: 100,
    counted: 100,
    state: "posted",
    reason: "QA count",
    created_at: timestamp,
  })),
  goods_receipts: list(23, (n) => ({
    id: id(16, n),
    reference: `GR-QA-${n}`,
    purchase_order_id: purchases[n - 1].id,
    actor_id: admin.id,
    created_at: timestamp,
  })),
  forecast_overview: stock.map((s) => ({
    ingredient_id: s.id,
    horizon: 14,
    demand: 10,
    coverage_days: 30,
    reorder_quantity: 0,
    excess_quantity: 0,
    expiry_risk_quantity: 0,
    incoming_stock: 0,
    history_days: 30,
    method: "weekday_8_weeks",
  })),
  inventory_settings: [
    { id: true, enforcement_enabled: true, branch_name: "QA branch" },
  ],
  admin_audit: list(23, (n) => ({
    id: id(17, n),
    actor_id: admin.id,
    action: `Action ${n}`,
    entity: "menu",
    entity_id: menu[0].id,
    reason: "QA",
    created_at: timestamp,
  })),
  void_logs: list(23, (n) => ({
    id: id(18, n),
    order_id: orders[n - 1].id,
    order: orders[n - 1],
    staff_id: admin.id,
    staff: admin,
    created_at: timestamp,
  })),
  store_settings: [{ id: "global", void_pin: "******" }],
  loyalty_tiers: [],
  order_items: menu.map((m, i) => ({
    order_id: orders[0].id,
    name: m.name,
    quantity: i + 1,
    subtotal: 100,
  })),
};
let server: ChildProcess | undefined;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [],
  blocked: string[] = [];
const seen = new Set<string>();
const serverRanges: { table: string; offset: number; limit: number }[] = [];
let slowSearchStarted!: () => void;
let releaseSlowSearch!: () => void;
let slowFinished!: () => void;
const slowStarted = new Promise<void>((resolve) => {
  slowSearchStarted = resolve;
});
const slowRelease = new Promise<void>((resolve) => {
  releaseSlowSearch = resolve;
});
const slowDone = new Promise<void>((resolve) => {
  slowFinished = resolve;
});
try {
  server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(port),
      "-H",
      "127.0.0.1",
    ],
    { cwd: path.join(root, "apps/admin"), windowsHide: true, stdio: "ignore" },
  );
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(ready, "Admin production server started");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "sb-admin-auth-token",
      value: encodeURIComponent(JSON.stringify(session)),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await context.routeWebSocket(/.*/, (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    if (url.pathname.startsWith("/auth/")) {
      await route.fulfill({ json: { user, ...user } });
      return;
    }
    if (!url.pathname.startsWith("/rest/v1/")) {
      blocked.push(url.pathname);
      await route.abort();
      return;
    }
    const name = url.pathname.split("/").at(-1)!;
    if (url.pathname.includes("/rpc/")) {
      const data =
        name === "get_published_catalog"
          ? { categories: [category], menuItems: menu }
          : name === "get_inventory_readiness"
            ? {
                ready: true,
                enforcement_enabled: true,
                active_orders: 0,
                active_stock_items: 49,
                missing_recipes: [],
                missing_counts: [],
                invalid_stock: [],
              }
            : name === "inv_dashboard"
              ? {
                  revenue: 3500,
                  orders: 35,
                  average: 100,
                  active: 0,
                  stock_conflicts: 0,
                  days: [],
                }
              : null;
      if (!data) blocked.push(name);
      await route.fulfill({
        status: data ? 200 : 503,
        json: data ?? { message: "Unknown QA RPC" },
      });
      return;
    }
    assert.equal(
      request.method(),
      "GET",
      "Pagination must not submit a mutation",
    );
    let data = [...(tables[name] ?? [])];
    for (const [field, value] of url.searchParams) {
      if (value.startsWith("eq."))
        data = data.filter((row) => String(row[field]) === value.slice(3));
      if (value.startsWith("in.(")) {
        const values = value.slice(4, -1).split(",");
        data = data.filter((row) => values.includes(String(row[field])));
      }
      if (value.startsWith("ilike.")) {
        const search = value.slice(6).replaceAll("%", "").toLowerCase();
        if (search === "slow") {
          slowSearchStarted();
          await slowRelease;
        }
        data = data.filter((row) =>
          String(row[field]).toLowerCase().includes(search),
        );
      }
    }
    const count = data.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? data.length);
    if (
      ["orders", "void_logs"].includes(name) &&
      url.searchParams.has("offset")
    )
      serverRanges.push({ table: name, offset, limit });
    data = data.slice(offset, offset + limit);
    await route.fulfill({
      json: request.headers().accept?.includes("vnd.pgrst.object")
        ? (data[0] ?? null)
        : data,
      headers: {
        "content-range": `${offset}-${offset + data.length - 1}/${count}`,
        "access-control-expose-headers": "content-range",
      },
    });
    if (url.searchParams.get("order_number") === "ilike.%slow%") slowFinished();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const table = (name: string) =>
    page.getByRole("table", { name, exact: true });
  const footer = (name: string) =>
    page.getByRole("navigation", { name: name + " pagination", exact: true });
  const rows = (name: string) =>
    table(name)
      .locator("tbody > tr")
      .filter({ hasNot: page.locator("td[colspan]") });
  async function check(name: string, count: number) {
    await expect(table(name)).toBeVisible();
    await expect(footer(name)).toContainText(
      `Showing ${count ? 1 : 0} to ${Math.min(10, count)} of ${count} entries`,
    );
    await expect(rows(name)).toHaveCount(Math.min(10, count));
    await expect(
      footer(name).getByRole("button", { name: "Previous", exact: true }),
    ).toBeDisabled();
    const next = footer(name).getByRole("button", {
      name: "Next",
      exact: true,
    });
    if (count <= 10) await expect(next).toBeDisabled();
    else {
      const first = await rows(name).first().innerText();
      await next.click();
      await expect(footer(name)).toContainText(
        `Page 2 of ${Math.ceil(count / 10)}`,
      );
      await expect(rows(name)).toHaveCount(Math.min(10, count - 10));
      assert.notEqual(
        await rows(name).first().innerText(),
        first,
        name + " changed rows",
      );
      for (let p = 2; p < Math.ceil(count / 10); p++) {
        await next.click();
        await expect(footer(name)).toContainText(`Page ${p + 1} of`);
      }
      await expect(rows(name)).toHaveCount(count % 10 || 10);
      await expect(footer(name)).toContainText(
        `Showing ${Math.floor((count - 1) / 10) * 10 + 1} to ${count} of ${count} entries`,
      );
      await expect(next).toBeDisabled();
      for (let p = Math.ceil(count / 10); p > 1; p--) {
        await footer(name)
          .getByRole("button", { name: "Previous", exact: true })
          .click();
        await expect(footer(name)).toContainText(`Page ${p - 1} of`);
      }
      await expect(footer(name)).toContainText("Page 1 of");
    }
    seen.add(name);
    console.log(JSON.stringify({ checked: name, count }));
  }
  async function open(route: string) {
    await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  }
  async function filterCheck(
    name: string,
    search: ReturnType<Page["getByPlaceholder"]>,
    match: string,
  ) {
    await footer(name)
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await search.fill(match);
    await expect(footer(name)).toContainText("Page 1 of 1");
    await expect(rows(name)).toHaveCount(1);
    await search.fill("no-results-qa");
    await expect(footer(name)).toContainText("Showing 0 to 0 of 0 entries");
    await expect(
      footer(name).getByRole("button", { name: "Next", exact: true }),
    ).toBeDisabled();
    await search.fill("");
  }
  await open("/dashboard");
  await check("Recent orders", 6);
  await open("/menu");
  await check("Menu products", 55);
  await filterCheck(
    "Menu products",
    page.getByRole("searchbox", { name: "Search menu products" }),
    "Product 55",
  );
  await open("/inventory");
  await check("Stock items", 49);
  await filterCheck("Stock items", page.getByLabel("Search stock"), "Stock 49");
  await table("Stock items").locator("tbody > tr").first().click();
  await check("Stock batches", 23);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  for (const [tab, name, count] of [
    ["Recipes", "Recipe requirements", 55],
    ["Movements", "Stock movements", 23],
    ["Stocktakes", "Physical counts", 23],
    ["Forecasts", "Demand forecasts", 49],
  ] as const) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await check(name, count);
  }
  await open("/purchasing");
  await check("Purchase orders", 23);
  await table("Purchase orders")
    .getByRole("button", { name: "PO-QA-1", exact: true })
    .click();
  await check("Purchase lines", 23);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await check("Suppliers", 23);
  await page
    .getByRole("button", { name: "Receiving history", exact: true })
    .click();
  await check("Goods receipts", 23);
  await open("/analytics");
  await check("Best sellers", 10);
  await check("Product margins", 55);
  await open("/audit");
  await check("Audit log", 23);
  await open("/loyalty");
  await check("Loyalty customers", 23);
  await open("/staff");
  await check("Staff", 47);
  await open("/staff-accounts");
  await check("Staff accounts", 24);
  await open("/void-security");
  await check("Void audit log", 23);
  await open("/orders");
  await check("Orders", 35);
  const orderSearch = page.getByPlaceholder("Search Order #...");
  await footer("Orders")
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await orderSearch.fill("slow");
  await slowStarted;
  await orderSearch.fill("QA-035");
  await expect(rows("Orders")).toHaveCount(1);
  releaseSlowSearch();
  await slowDone;
  await expect(table("Orders")).toContainText("QA-035");
  await expect(footer("Orders")).toContainText("Showing 1 to 1 of 1 entries");
  await orderSearch.fill("missing-qa");
  await expect(footer("Orders")).toContainText("Showing 0 to 0 of 0 entries");
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/menu");
  await expect(rows("Menu products")).toHaveCount(10);
  const nav = footer("Menu products");
  await nav.scrollIntoViewIfNeeded();
  const box = await nav.boundingBox();
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 391,
    "Mobile footer fits viewport",
  );
  const next = nav.getByRole("button", { name: "Next", exact: true });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toContainText("Page 2 of 6");
  await nav.screenshot({ path: path.join(output, "mobile-footer.png") });
  assert.equal(seen.size, 20, "All twenty Admin tables exercised");
  assert.deepEqual(errors, [], "No browser runtime errors");
  assert.deepEqual(blocked, [], "No unhandled external APIs");
  for (const name of ["orders", "void_logs"])
    assert.ok(
      serverRanges.some(
        (r) => r.table === name && r.offset === 10 && r.limit === 10,
      ),
      `${name} uses ten-record server ranges`,
    );
  const result = {
    checkedAt: timestamp,
    tables: [...seen],
    allTables: seen.size,
    rowLimit: 10,
    filterReset: true,
    emptyResults: true,
    latestSearchWins: true,
    mobileFooter: true,
    keyboardNavigation: true,
    serverRanges,
    runtimeErrors: errors,
    liveBusinessWrites: false,
  };
  writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await context.close();
} finally {
  releaseSlowSearch();
  await browser.close();
  server?.kill();
}
