import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

// Credentials stay in the existing local notes; never write them, auth cookies,
// or provider/customer tokens to this report or stdout.
const notes = readFileSync("docs/local-supabase.md", "utf8");
const base = "https://jaydscafe.vercel.app";
const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/authenticated-live");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results: { feature: string; status: string; detail: string }[] = [];
async function check(feature: string, work: () => Promise<void>) {
  try { await work(); results.push({ feature, status: "PASS", detail: "Verified against live authentication and database" }); }
  catch (e) { results.push({ feature, status: "FAIL", detail: String(e).slice(0, 1800) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: false, results }, null, 2));
}
const readRpcs = new Set(["get_published_catalog", "get_configuration_availability", "get_item_availability", "inv_dashboard", "get_inventory_readiness", "get_customer_operations", "get_customer_branch", "get_customer_scheduling_admin", "get_pos_status_board"]);
try {
  for (const role of ["POS", "Admin", "Customer UI (staff test account)"]) {
    const customer = role.startsWith("Customer");
    const match = notes.match(new RegExp((customer ? "POS" : role) + ":\\s+(\\S+)\\s*/\\s*(\\S+)"));
    assert.ok(match, "Stored designated test login exists: " + role);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    const blocked: string[] = [];
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) return route.continue();
      if (url.pathname.startsWith("/auth/") && (url.pathname.endsWith("/token") || url.pathname.endsWith("/logout"))) return route.continue();
      if (url.pathname.startsWith("/rest/v1/rpc/") && readRpcs.has(url.pathname.split("/").at(-1)!)) return route.continue();
      if (url.origin === base && url.pathname === "/staff/api/orders/queue") return route.continue();
      blocked.push(method + " " + url.pathname);
      return route.abort();
    });
    const p = await context.newPage(), errors: string[] = [];
    p.on("pageerror", e => errors.push(e.message));
    const prefix = customer ? "" : role === "POS" ? "/staff" : "/admin";
    const shell = customer ? ".jayds-app" : role === "POS" ? ".pos-shell" : ".admin-shell";
    try {
      let signedIn = false;
      await check(role + ": real designated account login", async () => {
        await p.goto(base + prefix + "/login");
        await p.locator("input[type=email]").fill(match[1]);
        await p.locator("input[type=password]").fill(match[2]);
        const auth = p.waitForResponse(r => new URL(r.url()).pathname === "/auth/v1/token" && r.request().method() === "POST");
        await p.locator("button[type=submit]").click();
        const response = await auth;
        assert.equal(response.status(), 200, "Stored test credentials successfully authenticate");
        await p.waitForURL(base + prefix + (customer ? "/menu" : "/dashboard"));
        signedIn = true;
        await expect(p.locator(shell)).toBeVisible();
      });
      if (!signedIn) continue;
      const routes = customer ? ["menu", "menu/browse", "orders", "account", "favorites", "rewards", "vouchers", "help", "notifications", "profile/edit", "profile/addresses", "cart", "checkout"] : role === "POS" ? ["dashboard", "new-order", "void"] : ["dashboard", "orders", "menu", "categories", "vouchers", "inventory", "purchasing", "scheduling", "customer-care", "analytics", "staff", "staff-accounts", "loyalty", "void-security", "audit"];
      for (const route of routes) {
        await check(role + ": live " + route, async () => {
          await p.goto(base + prefix + "/" + route);
          await p.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
          await expect(p.locator(shell)).toBeVisible();
          assert.equal(await p.getByText("This page couldn’t load", { exact: true }).count(), 0);
          await p.screenshot({ path: path.join(out, `${customer ? "Customer-staff-session" : role}-${route.replaceAll("/", "-")}.png`), fullPage: true });
        });
      }
      await check(role + ": no uncaught errors or attempted business writes", async () => {
        assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      });
      await check(role + ": real logout clears protected access", async () => {
        if (customer) await p.goto(base + "/account");
        await p.getByRole("button", { name: /Sign out/i }).click();
        await p.goto(base + prefix + (customer ? "/account" : "/dashboard"));
        if (customer) await expect(p.getByRole("link", { name: /Sign in/ }).first()).toBeVisible();
        else await p.waitForURL(base + prefix + "/login");
      });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ checks: results.length, failures: results.filter(r => r.status !== "PASS"), output: out }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
