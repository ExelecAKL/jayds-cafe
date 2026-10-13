import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { LEGAL_VERSION } from "../apps/customer/lib/legal.ts";
nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const mayaOrder = process.env.JAYDS_AUDIT_MAYA_ORDER === "1";
const base = "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/" + (mayaOrder ? "maya-order-live" : "order-live"));
mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: string }[] = [];
let orderId = "", orderNumber = "", guestCookie = "";
const key = "audit_" + randomUUID().replaceAll("-", "");
const save = () => writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: true, scope: `One unpaid pickup ${mayaOrder ? "Maya" : "cash"} order, cancelled before preparation; retained cancelled test record, no charge or physical consumption`, orderId, orderNumber, results }, null, 2));
const check = async (feature: string, work: () => Promise<string | void>) => {
  try { const detail = await work(); results.push({ feature, status: "PASS", detail: detail || "Actual hosted applications, API, PostgreSQL and Auth" }); }
  catch (error) { results.push({ feature, status: "FAIL", detail: String(error).replace(/https?:\/\/\S+/g, "[URL redacted]").slice(0, 1600) }); }
  save(); console.log(results.at(-1)?.status, feature);
};
const notes = readFileSync("docs/local-supabase.md", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const pos = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
const cp = await guest.newPage(), pp = await pos.newPage(), ap = await admin.newPage();
const staffClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
let realtimeAt = 0, beforeStock: { id: string; current_stock: number }[] = [], afterCreateAt = 0;
let payload: Record<string, unknown> = {};
const channel = staffClient.channel("audit-order-" + randomUUID());
try {
  await check("Live interconnection setup: authenticated POS/Admin and approved-staff Realtime subscription", async () => {
    for (const [role, prefix, p] of [["POS", "/staff", pp], ["Admin", "/admin", ap]] as const) {
      const stored = notes.match(new RegExp(role + ":\\s+(\\S+)\\s*/\\s*(\\S+)"))!;
      await p.goto(base + prefix + "/login");
      await p.locator("input[type=email]").fill(stored[1]); await p.locator("input[type=password]").fill(stored[2]);
      await p.locator("button[type=submit]").click(); await p.waitForURL(base + prefix + "/dashboard");
      if (role === "Admin") await p.goto(base + "/admin/orders");
      else assert.equal((await staffClient.auth.signInWithPassword({ email: stored[1], password: stored[2] })).error, null);
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "pos_order_state" }, () => { realtimeAt = Date.now(); });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("Realtime subscription did not become ready")), 12000);
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timeout); reject(Error("Realtime " + status)); }
      });
    });
    const { data, error } = await service.from("ingredients").select("id,current_stock"); assert.equal(error, null); beforeStock = data ?? [];
    await cp.goto(base + "/menu");
  });
  await check("Live guest order creation and canonical duplicate retry reserve one order", async () => {
    const { data: catalog, error } = await service.rpc("get_published_catalog"); assert.equal(error, null);
    const product = catalog.menuItems.find((item: { is_available: boolean; variants: unknown[] }) => item.is_available && !item.variants?.length);
    assert.ok(product, "An available option-free product exists for the single unpaid test");
    payload = { order_type: "pickup", payment_method: mayaOrder ? "maya" : "cash", subtotal: Number(product.price), total: Number(product.price), discount: 0, points_earned: 0, points_redeemed: 0, notes: "SYSTEM AUDIT: unpaid automatic cancellation before preparation", advance_order_key: "audit-device-" + randomUUID(), pickup_confirmation_hash: randomUUID(), legal_version: LEGAL_VERSION, legal_acknowledged: true, items: [{ menu_item_id: product.id, name: product.name, price: Number(product.price), quantity: 1, subtotal: Number(product.price), variants: [] }] };
    realtimeAt = 0; afterCreateAt = Date.now();
    const response = await guest.request.post(base + "/api/orders/create", { headers: { Origin: base, "Idempotency-Key": key }, data: payload });
    assert.equal(response.status(), 200, "Hosted order creation succeeds");
    const body = await response.json(); orderId = body.id; orderNumber = body.order_number; assert.ok(orderId); save();
    const cookie = (await guest.cookies(base)).find(cookie => cookie.name === "jayds_guest_device"); assert.ok(cookie); guestCookie = cookie.value;
    const retry = await guest.request.post(base + "/api/orders/create", { headers: { Origin: base, "Idempotency-Key": key }, data: payload });
    assert.equal(retry.status(), 200); assert.equal((await retry.json()).id, orderId);
    const { count, error: countError } = await service.from("orders").select("id", { count: "exact", head: true }).eq("id", orderId); assert.equal(countError, null); assert.equal(count, 1);
  });
  await check("Live original guest sees private order; fresh guest is denied", async () => {
    assert.ok(orderId);
    assert.equal((await guest.request.get(base + "/api/orders/" + orderId)).status(), 200);
    const fresh = await browser.newContext();
    try { assert.equal((await fresh.request.get(base + "/api/orders/" + orderId)).status(), 403); }
    finally { await fresh.close(); }
    await cp.goto(base + "/orders/" + orderId); await expect(cp.getByText(orderNumber, { exact: true }).first()).toBeVisible();
  });
  if (mayaOrder) await check("Live Maya integration: hosted checkout creation/reuse, provider page and signed cancellation return to same guest order", async () => {
    assert.ok(orderId);
    const response = await guest.request.post(base + "/api/maya/checkout", { headers: { Origin: base }, data: { orderId } }); assert.equal(response.status(), 200);
    const checkout = await response.json(); assert.ok(checkout.checkoutId); assert.ok(checkout.redirectUrl);
    const retry = await guest.request.post(base + "/api/maya/checkout", { headers: { Origin: base }, data: { orderId } }); assert.equal(retry.status(), 200);
    assert.equal((await retry.json()).checkoutId, checkout.checkoutId);
    await cp.goto(checkout.redirectUrl); await cp.getByText(/Back to Merchant/i).first().click();
    await cp.waitForURL(u => u.origin === base && u.pathname === "/orders/" + orderId);
    const returned = new URL(cp.url()); assert.equal(returned.searchParams.get("status"), "cancelled"); assert.ok(returned.searchParams.get("mayaReturnState"));
    await expect(cp.getByText(orderNumber, { exact: true }).first()).toBeVisible();
    const { data, error } = await service.from("orders").select("payment_status").eq("id", orderId).single(); assert.equal(error, null); assert.notEqual(data?.payment_status, "paid");
  });
  await check("Live order appears in already-open POS and Admin; stock version broadcasts to approved staff", async () => {
    assert.ok(orderNumber);
    await expect(pp.getByText(orderNumber, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(ap.getByText(orderNumber, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    assert.ok(realtimeAt >= afterCreateAt, "Actual hosted Realtime delivered an order-state change");
    await pp.screenshot({ path: path.join(out, "pos-unpaid-order.png"), fullPage: true });
    await ap.screenshot({ path: path.join(out, "admin-unpaid-order.png"), fullPage: true });
    return `Actual approved-staff database event observed ${realtimeAt - afterCreateAt}ms after submission; same order visible in both open apps`;
  });
  await check("Live customer cancellation twice is idempotent and releases all unconsumed reservations", async () => {
    assert.ok(orderId);
    for (let n = 0; n < 2; n++) {
      const response = await guest.request.post(base + "/api/orders/cancel", { headers: { Origin: base }, data: { orderId } }); assert.equal(response.status(), 200);
    }
    const { data: order, error } = await service.from("orders").select("status,payment_status,inventory_consumed").eq("id", orderId).single();
    assert.equal(error, null); assert.equal(order?.status, "cancelled");
    if (mayaOrder) assert.notEqual(order?.payment_status, "paid"); else assert.equal(order?.payment_status, "pending");
    assert.equal(order?.inventory_consumed, false);
    const reservations = await service.from("stock_reservations").select("id").eq("order_id", orderId).eq("state", "reserved"); assert.equal(reservations.error, null); assert.deepEqual(reservations.data, []);
    const { data: stock, error: stockError } = await service.from("ingredients").select("id,current_stock"); assert.equal(stockError, null);
    assert.deepEqual(stock?.sort((a, b) => a.id.localeCompare(b.id)), beforeStock.sort((a, b) => a.id.localeCompare(b.id)), "All physical stock quantities remain unchanged");
    await expect(pp.getByText(orderNumber, { exact: true })).toHaveCount(0, { timeout: 15000 });
  });
} finally {
  // Cancellation goes through the supported transaction. Never delete café
  // ledger rows or mark a fake sale paid. Retain this cancelled audit record.
  if (orderId) await check("Live test cleanup: unpaid order is cancelled and physical stock was never consumed", async () => {
    const response = await fetch(base + "/api/orders/cancel", { method: "POST", headers: { Origin: base, "Content-Type": "application/json", Cookie: "jayds_guest_device=" + guestCookie }, body: JSON.stringify({ orderId }) }); assert.equal(response.status, 200);
    const { data, error } = await service.from("orders").select("status,payment_status").eq("id", orderId).single(); assert.equal(error, null); assert.equal(data?.status, "cancelled");
    if (mayaOrder) assert.notEqual(data?.payment_status, "paid"); else assert.equal(data?.payment_status, "pending");
  });
  await staffClient.removeChannel(channel); await staffClient.auth.signOut(); await browser.close();
}
console.log(JSON.stringify({ checks: results.length, failures: results.filter(row => row.status === "FAIL").map(row => row.feature), orderId, orderNumber, output: out }));
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
