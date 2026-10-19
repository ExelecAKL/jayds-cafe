// Browser-only fixture. Every auth/database/API request is isolated from live services.
import { chromium } from "playwright";

export const base = process.env.JAYDS_DASHBOARD_URL || "http://localhost:4002";
export const admin = {
  id: "00000001-0000-4000-8000-000000000001",
  full_name: "Alex Rivera",
  email: "alex@example.test",
  role: "admin",
  is_approved: true,
  points: 0,
  created_at: "2026-10-18T04:00:00Z",
};
const user = {
  ...admin,
  role: "authenticated",
  aud: "authenticated",
  user_metadata: { role: "admin" },
  app_metadata: { provider: "email" },
};
const session = {
  access_token: "isolated-dashboard-fixture",
  refresh_token: "fixture",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const amounts = [4800, 6200, 5600, 8100, 7400, 9800, 8400];
export const fixtureOrders = [
  "completed",
  "preparing",
  "pending",
  "completed",
  "ready",
  "cancelled",
].map((status, index) => ({
  id: `00000002-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  order_number: `JAY-${1042 - index}`,
  customer_id: admin.id,
  customer: {
    full_name: [
      "Isabel Santos",
      "Miguel Reyes",
      "Walk-in guest",
      "Sofia Cruz",
      "Daniel Garcia",
      "Maria Lopez",
    ][index],
  },
  status,
  order_source: index % 2 ? "pos" : "mobile",
  order_type: "pickup",
  total: [385, 240, 520, 165, 310, 195][index],
  subtotal: [385, 240, 520, 165, 310, 195][index],
  payment_status: "paid",
  payment_method: "cash",
  discount: 0,
  items: [],
  status_history: [],
  created_at: "2026-10-18T04:00:00Z",
  updated_at: "2026-10-18T04:00:00Z",
}));
export async function isolateDashboard(page, state = {}) {
  await page
    .context()
    .addCookies([
      {
        name: "sb-admin-auth-token",
        value: encodeURIComponent(JSON.stringify(session)),
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);
  await page.context().routeWebSocket(/.*/, (socket) => socket.close());
  await page.context().route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (
      url.origin === new URL(base).origin &&
      !url.pathname.startsWith("/api/")
    )
      return route.continue();
    if (url.pathname.startsWith("/auth/"))
      return route.fulfill({
        json: url.pathname.endsWith("/token") ? session : { ...user, user },
      });
    if (!url.pathname.startsWith("/rest/v1/")) return route.abort();
    const name = url.pathname.split("/").at(-1);
    const single = req.headers().accept?.includes("vnd.pgrst.object");
    if (process.env.JAYDS_FIXTURE_TRACE)
      console.log("fixture", req.method(), name, single ? "single" : "list");
    const respond = (rows) =>
      route.fulfill({
        json: single ? (rows[0] ?? null) : rows,
        headers: {
          "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
        },
      });
    if (name === "profiles") return respond([admin]);
    if (name === "inv_dashboard") {
      if (state.delay)
        await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.fail)
        return route.fulfill({
          status: 503,
          json: { message: "Isolated sales service failure" },
        });
      const days = req.postDataJSON()?.p_days ?? 7;
      state.periods?.push(days);
      const series = Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.UTC(2026, 9, 19 - days + i))
          .toISOString()
          .slice(0, 10),
        revenue: state.empty ? 0 : amounts[i % 7],
      }));
      return route.fulfill({
        json: {
          revenue: series.reduce((s, d) => s + d.revenue, 0),
          orders: state.empty ? 0 : days === 7 ? 184 : 752,
          average: state.empty ? 0 : 273.37,
          active: state.empty ? 0 : 8,
          stock_conflicts: state.empty ? 0 : 2,
          days: series,
        },
      });
    }
    if (name === "orders") {
      if (state.ordersFail)
        return route.fulfill({
          status: 503,
          json: { message: "Isolated order read failure" },
        });
      const match = url.searchParams.get("id");
      return respond(
        state.empty
          ? []
          : match
            ? fixtureOrders.filter((order) => "eq." + order.id === match)
            : fixtureOrders,
      );
    }
    if (name === "stock_overview")
      return respond(
        state.empty
          ? []
          : [
              {
                id: "stock1",
                name: "Whole milk",
                unit: "L",
                available_stock: 4,
                min_stock_alert: 8,
                stock_value: 680,
                expiring_stock: 2,
              },
              {
                id: "stock2",
                name: "Coffee beans",
                unit: "kg",
                available_stock: 2,
                min_stock_alert: 3,
                stock_value: 6400,
                expiring_stock: 0,
              },
              {
                id: "stock3",
                name: "Syrup",
                unit: "L",
                available_stock: 12,
                min_stock_alert: 4,
                stock_value: 8200,
                expiring_stock: 0,
              },
              {
                id: "stock4",
                name: "Cups",
                unit: "pc",
                available_stock: 360,
                min_stock_alert: 80,
                stock_value: 2160,
                expiring_stock: 0,
              },
            ],
      );
    if (name === "inventory_settings")
      return respond([
        { enforcement_enabled: true, branch_name: "Jayds Café" },
      ]);
    if (name === "admin_purchase_orders")
      return respond(
        state.empty
          ? []
          : [
              { id: "po1", status: "draft", lines: [] },
              { id: "po2", status: "draft", lines: [] },
              { id: "po3", status: "draft", lines: [] },
              { id: "po4", status: "ordered", lines: [] },
            ],
      );
    if (name === "forecast_overview")
      return respond(
        state.empty
          ? []
          : [
              {
                horizon: 14,
                excess_quantity: 5,
                history_days: 30,
                calculated_at: "2026-10-18T04:00:00Z",
              },
            ],
      );
    if (name === "get_inventory_readiness")
      return route.fulfill({
        json: { ready: true, missing_counts: [], missing_recipes: [] },
      });
    if (req.method() !== "GET" && req.method() !== "HEAD")
      throw new Error(`Blocked unexpected business write: ${name}`);
    return respond([]);
  });
}

// The installed kit accepts files. This opt-in adapter makes its unmodified gates
// render the real hydrated route, with the same isolated fixture as the UI tests.
if (process.env.JAYDS_DESIGN_GATES === "1") {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...pageArgs) => {
      const page = await newPage(...pageArgs);
      await isolateDashboard(page);
      const goto = page.goto.bind(page);
      page.goto = async (url, options) => {
        const response = await goto(
          String(url).startsWith("file:") ? base + "/dashboard" : url,
          options,
        );
        await page
          .locator(".dashboard .revenue-value")
          .filter({ hasText: "50,300" })
          .waitFor();
        await page
          .locator(".orders-panel .dashboard-table tbody tr")
          .first()
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        // Next's development launcher is outside the product's UI.
        await page.addStyleTag({
          content: "nextjs-portal{display:none!important}",
        });
        return response;
      };
      return page;
    };
    return browser;
  };
}
