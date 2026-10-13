import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.env.JAYDS_AUDIT_CUSTOMER_URL || "https://jaydscafe.vercel.app";
const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/hosted-live");
mkdirSync(out, { recursive: true });
type Result = { feature: string; status: "PASS" | "FAIL"; detail: unknown };
const results: Result[] = [];
const write = () => writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveWrites: false, results }, null, 2));
async function check(feature: string, work: () => Promise<unknown>) {
  try { results.push({ feature, status: "PASS", detail: await work() }); }
  catch (e) { results.push({ feature, status: "FAIL", detail: String(e).slice(0, 1600) }); }
  write();
}
const id = "00000000-0000-4000-8000-000000000099";
// Invalid inputs, disallowed origins and unauthenticated requests cannot create
// any sale, provider transaction, account or physical stock movement.
const probes: [string, string, unknown, number[]][] = [
  ["GET", "/api/branch", null, [200]],
  ["GET", "/api/customer/push", null, [200]],
  ["GET", "/api/location?q=a", null, [400]],
  ["GET", "/api/pickup/slots?date=invalid&item_units=0", null, [400]],
  ["GET", "/api/customer/recommendations", null, [401]],
  ["GET", "/api/customer/favorites", null, [401]],
  ["GET", "/api/customer/legal", null, [401]],
  ["GET", "/api/customer/support", null, [400, 401, 403]],
  ["GET", "/api/orders/" + id, null, [401, 403, 404]],
  ["GET", "/api/lalamove/status", null, [400, 401, 403]],
  ["POST", "/api/orders/guest", {}, [400]],
  ["POST", "/api/orders/guest", { orderIds: [id] }, [403]],
  ["POST", "/api/orders/create", {}, [400, 403]],
  ["POST", "/api/orders/cancel", {}, [400, 403]],
  ["POST", "/api/maya/checkout", {}, [400, 403]],
  ["POST", "/api/maya/verify", {}, [400, 403]],
  ["POST", "/api/maya/webhook", {}, [400]],
  ["POST", "/api/lalamove/quotation", {}, [400, 403]],
  ["POST", "/api/lalamove/order", {}, [400, 403]],
  ["POST", "/api/lalamove/dispatch", {}, [400, 403]],
  ["POST", "/api/vouchers/validate", {}, [403]],
  ["POST", "/api/customer/favorites", {}, [401, 403]],
  ["DELETE", "/api/customer/favorites", {}, [401, 403]],
  ["POST", "/api/customer/legal", {}, [400, 403]],
  ["POST", "/api/customer/support", {}, [400, 403]],
  ["POST", "/api/customer/push", {}, [400, 403]],
  ["DELETE", "/api/customer/push", {}, [400, 403]],
  ["POST", "/api/jobs/customer-notifications", {}, [401]],
  ...["create", "checkout", "action", "pickup", "delivery", "queue"].map(name =>
    ["POST", `/staff/api/orders/${name}`, {}, [401]] as [string, string, unknown, number[]]),
  ["POST", "/staff/api/account/lookup", {}, [401]],
  ["POST", "/admin/api/customer-care/reconcile", {}, [400, 401]],
];
for (const [method, route, body, statuses] of probes) {
  await check(`${method} ${route}`, async () => {
    const response = await fetch(base + route, {
      method, redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: body === null ? {} : { "Content-Type": "application/json", Origin: "https://audit.invalid" },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    const content = await response.json();
    assert.ok(statuses.includes(response.status), `Expected ${statuses}, received ${response.status}`);
    assert.ok(!/PostgresError|at .*\.ts:|SUPABASE_SERVICE_ROLE_KEY|relation .* does not exist/.test(JSON.stringify(content)), "Response discloses implementation details");
    return route === "/api/branch" || route === "/api/customer/push"
      ? { status: response.status, publicConfiguration: content }
      : { status: response.status, error: content.error ?? content.message ?? null, cache: response.headers.get("cache-control") };
  });
}

await check("Voucher validation rejects malformed same-origin input", async () => {
  const response = await fetch(base + "/api/vouchers/validate", {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "Enter a valid voucher code and cart.");
  return { status: response.status, error: body.error };
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const live = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await live.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const route of ["/menu", "/menu/browse", "/cart", "/checkout", "/checkout/confirm", "/orders", "/account", "/favorites", "/rewards", "/vouchers", "/help", "/notifications", "/terms", "/privacy", "/login", "/register", "/forgot-password", "/reset-password", "/check-email", "/profile/edit", "/profile/addresses", "/staff/login", "/staff/register", "/staff/forgot-password", "/staff/check-email", "/staff/pending-approval", "/staff/kds", "/admin/login"]) {
    await check("Live page " + route, async () => {
      const response = await page.goto(base + route);
      assert.equal(response?.status(), 200);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      assert.ok(await page.locator("body").innerText(), "Empty document");
      assert.equal(await page.getByText("This page couldn’t load", { exact: true }).count(), 0);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText.slice(0, 180) }));
      assert.ok(layout.scroll <= layout.width + 1, `Horizontal overflow: ${layout.scroll}/${layout.width}`);
      await page.screenshot({ path: path.join(out, route.replaceAll("/", "_") + ".png") });
      return { url: page.url(), ...layout };
    });
  }
  await check("Live pages have no uncaught browser errors", async () => { assert.deepEqual(errors, []); return errors; });
  await live.close();

  // These cases test the deployed UI's role gate, while Supabase identities and
  // reads are fixtures. The real database-role/RLS assertions are SQL tests.
  for (const c of [
    { name: "Guest cannot enter Admin", scope: "admin", role: null, approved: false, allowed: false },
    { name: "Customer cannot enter Admin", scope: "admin", role: "customer", approved: true, allowed: false },
    { name: "Staff cannot enter Admin", scope: "admin", role: "staff", approved: true, allowed: false },
    { name: "Approved Admin can enter Admin", scope: "admin", role: "admin", approved: true, allowed: true },
    { name: "Unapproved Admin cannot enter Admin", scope: "admin", role: "admin", approved: false, allowed: false },
    { name: "Guest cannot enter POS", scope: "pos", role: null, approved: false, allowed: false },
    { name: "Customer cannot enter POS", scope: "pos", role: "customer", approved: true, allowed: false },
    { name: "Unapproved staff cannot enter POS", scope: "pos", role: "staff", approved: false, allowed: false },
    { name: "Approved staff can enter POS", scope: "pos", role: "staff", approved: true, allowed: true },
    { name: "Approved Admin can enter POS", scope: "pos", role: "admin", approved: true, allowed: true },
  ]) {
    await check(c.name + " (isolated identity)", async () => {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const user = { id, role: "authenticated", aud: "authenticated", email: "audit@example.test", user_metadata: { role: c.role }, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
      if (c.role) await context.addCookies([{ name: `sb-${c.scope}-auth-token`, value: encodeURIComponent(JSON.stringify({ user, access_token: "isolated-fixture", refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 })), domain: new URL(base).hostname, path: "/" }]);
      await context.routeWebSocket("**", socket => socket.close());
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith("/auth/")) return route.fulfill({ status: c.role ? 200 : 401, json: c.role ? { user, ...user } : { message: "No fixture account" } });
        if (url.pathname.startsWith("/rest/v1/")) {
          const name = url.pathname.split("/").at(-1);
          return route.fulfill({ json: name === "profiles" ? { ...user, full_name: "Audit member", role: c.role, is_approved: c.approved, points: 0 } : name === "get_inventory_readiness" ? { ready: false, enforcement_enabled: false, active_orders: 0, active_stock_items: 0, missing_counts: [], missing_recipes: [], invalid_stock: [] } : name === "get_published_catalog" ? { categories: [], menuItems: [] } : name === "inventory_settings" ? { id: true, branch_name: "Audit", enforcement_enabled: false } : name === "inv_dashboard" ? { revenue: 0, average: 0, orders: 0, days: [], active: 0, stock_conflicts: 0 } : [] });
        }
        if (url.pathname.includes("/api/")) return route.fulfill({ json: { orders: [], total: 0, page: 0 } });
        if (url.origin === new URL(base).origin) return route.continue();
        return route.abort();
      });
      const p = await context.newPage();
      try {
        await p.goto(base + (c.scope === "admin" ? "/admin/dashboard" : "/staff/new-order"));
        await p.waitForLoadState("networkidle");
        const shell = p.locator(c.scope === "admin" ? ".admin-shell" : ".pos-shell");
        if (c.allowed) await expect(shell).toBeVisible();
        else await expect(shell).toHaveCount(0, { timeout: 2500 });
        await p.screenshot({ path: path.join(out, c.name.replaceAll(" ", "-") + ".png") });
        return { url: p.url(), allowed: c.allowed };
      } catch (e) {
        await p.screenshot({ path: path.join(out, c.name.replaceAll(" ", "-") + "-FAIL.png") });
        throw e;
      } finally { await context.close(); }
    });
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ checks: results.length, passed: results.filter(r => r.status === "PASS").length, failures: results.filter(r => r.status === "FAIL"), output: out }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
