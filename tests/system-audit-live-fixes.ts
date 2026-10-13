import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSION } from "../apps/customer/lib/legal.ts";

nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const base = "https://jaydscafe.vercel.app", out = path.resolve(process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/defense-fixes-2026-10-13", "live-fixes");
mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: unknown }[] = [];
const ids: string[] = [], clients: SupabaseClient[] = [], keys: string[] = [];
let category = "", product = "", voucher = "";
const run = randomBytes(6).toString("hex");
async function check(feature: string, work: () => Promise<unknown>) {
  try { results.push({ feature, status: "PASS", detail: await work() ?? "Verified on hosted backend" }); }
  catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1200) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, scope: "Own hidden archived fixtures and temporary customers only; future voucher cannot be redeemed; no order, payment or stock movement", results }, null, 2));
  console.log(results.at(-1)?.status, feature);
}
try {
  await check("Hosted category deletion preserves an archived product, its option and its recipe", async () => {
    const c = await db.from("categories").insert({ name: "SYSTEM AUDIT HIDDEN " + run, status: "archived", is_active: false }).select("id").single(); assert.equal(c.error, null); category = c.data!.id;
    const p = await db.from("menu_items").insert({ name: "SYSTEM AUDIT HIDDEN " + run, price: 100, category_id: category, status: "archived", is_available: false, manually_available: false }).select("id").single(); assert.equal(p.error, null); product = p.data!.id;
    assert.equal((await db.from("item_variants").insert({ menu_item_id: product, variant_group: "add_on", label: "Hidden test option", price_modifier: 0 })).error, null);
    const stock = await db.from("ingredients").select("id").limit(1).single(); assert.equal(stock.error, null);
    assert.equal((await db.from("menu_item_ingredients").insert({ menu_item_id: product, ingredient_id: stock.data!.id, quantity_used: 1 })).error, null);
    const catalog = await db.rpc("get_published_catalog"); assert.equal(catalog.error, null);
    assert.ok(!catalog.data.menuItems.some((item: { id: string }) => item.id === product), "Test product is hidden from public catalog");
    assert.equal((await db.from("categories").delete().eq("id", category)).error, null);
    const retained = await db.from("menu_items").select("category_id,status").eq("id", product).single(); assert.equal(retained.error, null); assert.equal(retained.data?.category_id, null); assert.equal(retained.data?.status, "archived");
    for (const table of ["item_variants", "menu_item_ingredients"]) { const rows = await db.from(table).select("id").eq("menu_item_id", product); assert.equal(rows.error, null); assert.equal(rows.data?.length, 1); }
  });
  await check("Temporary Bronze/Gold identities and an unpublished future voucher are isolated", async () => {
    for (const [i, suffix] of ["a", "b"].entries()) {
      const password = randomBytes(24).toString("base64url"), email = `jayds.audit.${run}.${suffix}@example.invalid`;
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: "customer", full_name: "System audit tier fixture" } }); assert.equal(created.error, null); ids.push(created.data.user!.id);
      assert.equal((await db.from("legal_acknowledgements").insert({ user_id: ids[i], version: LEGAL_VERSION, source: "customer_review" })).error, null);
      if (i === 1) assert.equal((await db.from("profiles").update({ points: 100000 }).eq("id", ids[i])).error, null);
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client); assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
    }
    const profiles = await db.from("profiles").select("id,loyalty_tier").in("id", ids); assert.equal(profiles.error, null);
    assert.equal(profiles.data?.find(p => p.id === ids[0])?.loyalty_tier?.toLowerCase(), "bronze"); assert.equal(profiles.data?.find(p => p.id === ids[1])?.loyalty_tier?.toLowerCase(), "gold");
    const saved = await db.from("vouchers").insert({ code: "AUDITGOLD" + run.toUpperCase(), description: "Hidden future audit fixture", target_tier: "gold", discount_type: "fixed", discount_value: 1, application_mode: "whole_order", is_active: true, valid_from: new Date(Date.now() + 86400000).toISOString(), valid_until: new Date(Date.now() + 172800000).toISOString() }).select("id").single(); assert.equal(saved.error, null); voucher = saved.data!.id;
  });
  async function headers(index: number | null) { const token = index === null ? null : (await clients[index].auth.getSession()).data.session?.access_token; return { Origin: base, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }; }
  await check("Hosted voucher validation rejects Bronze and guests; Gold passes tier checking", async () => {
    assert.ok(voucher && ids.length === 2);
    for (const index of [0, null, 1]) {
      const response = await fetch(base + "/api/vouchers/validate", { method: "POST", headers: await headers(index), body: JSON.stringify({ code: "AUDITGOLD" + run.toUpperCase(), subtotal: 100, itemIds: [] }) });
      assert.equal(response.status, index === null ? 401 : 400); const body = await response.json(); assert.match(body.error, index === 1 ? /not yet active/i : index === null ? /sign in|authentication/i : /gold|tier/i);
    }
  });
  await check("Hosted authoritative order pricing rejects ineligible tiers before any order or voucher usage", async () => {
    const catalog = await db.rpc("get_published_catalog"); assert.equal(catalog.error, null);
    const item = catalog.data.menuItems.find((p: { is_available: boolean; variants?: unknown[] }) => p.is_available && !p.variants?.length); assert.ok(item);
    for (const index of [0, null]) {
      const key = "audit_fix_" + randomUUID().replaceAll("-", ""); keys.push(key);
      const response = await fetch(base + "/api/orders/create", { method: "POST", headers: { ...await headers(index), "Idempotency-Key": key }, body: JSON.stringify({ order_type: "pickup", payment_method: "cash", subtotal: Number(item.price), discount: 1, total: Number(item.price) - 1, points_redeemed: 0, legal_version: LEGAL_VERSION, legal_acknowledged: true, advance_order_key: "audit-" + run, pickup_confirmation_hash: randomUUID(), voucher_code: "AUDITGOLD" + run.toUpperCase(), items: [{ menu_item_id: item.id, name: item.name, quantity: 1, price: Number(item.price), subtotal: Number(item.price), variants: [] }] }) });
      assert.equal(response.status, 400); assert.match((await response.json()).error, /gold|tier|sign in/i);
    }
    const orders = await db.from("orders").select("id").in("idempotency_key", keys); assert.equal(orders.error, null); assert.deepEqual(orders.data, []);
    const uses = await db.from("vouchers").select("uses_count").eq("id", voucher).single(); assert.equal(uses.error, null); assert.equal(uses.data?.uses_count, 0);
  });
  await check("Configured push cron has executed and its hosted worker returned HTTP 200", async () => {
    const status = await db.rpc("customer_push_setup_status"); assert.equal(status.error, null);
    assert.equal(status.data.vault_configured, true); assert.equal(status.data.cron_active, true); assert.equal(status.data.last_http_status, 200);
    return status.data;
  });
} finally {
  await check("Exact temporary fixtures/accounts removed; no transaction or stock movement created", async () => {
    for (const client of clients) await client.auth.signOut();
    for (const [table, id] of [["menu_items", product], ["categories", category], ["vouchers", voucher]]) if (id) assert.equal((await db.from(table).delete().eq("id", id)).error, null);
    // Legal acknowledgements are immutable. Retire these identities rather
    // than deleting retained legal evidence or bypassing its database trigger.
    for (const id of ids) {
      assert.equal((await db.from("profiles").update({ points: 0, is_approved: false, full_name: "Retired system audit fixture", phone: null }).eq("id", id)).error, null);
      assert.equal((await db.auth.admin.deleteUser(id, true)).error, null);
    }
  });
}
process.exitCode = results.some(result => result.status === "FAIL") ? 1 : 0;
