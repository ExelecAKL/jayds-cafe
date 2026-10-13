import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

// Temporary, uniquely named customer accounts only. Never change an existing
// customer's credentials/profile. Cleanup uses exact recorded account IDs.
nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const base = "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/customer-live");
mkdirSync(out, { recursive: true });
const run = randomBytes(6).toString("hex"), ids: string[] = [];
const results: { feature: string; status: string; detail: string }[] = [];
const save = () => writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: true, scope: "Temporary customer accounts, own profile/address/favorite/support only; no sale, stock or provider payment", results }, null, 2));
const check = async (feature: string, work: () => Promise<void>) => {
  try { await work(); results.push({ feature, status: "PASS", detail: "Actual hosted Auth, customer identity, API and database" }); }
  catch (e) { results.push({ feature, status: "FAIL", detail: String(e).replace(/https?:\/\/\S+/g, "[URL redacted]").slice(0, 1600) }); }
  save(); console.log(results.at(-1)?.status, feature);
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const page = await context.newPage();
const a = { email: `jayds.audit.${run}.a@example.invalid`, password: randomBytes(24).toString("base64url"), id: "" };
const b = { email: `jayds.audit.${run}.b@example.invalid`, password: randomBytes(24).toString("base64url"), id: "" };
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const second = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
let productId = "", addressId = "", supportId = "";
try {
  await check("Real customer identities: create isolated test accounts and verify customer-only profiles", async () => {
    for (const account of [a, b]) {
      const { data, error } = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { role: "customer", full_name: "System audit temporary customer" } });
      assert.equal(error, null, "Temporary customer account creation succeeds");
      assert.ok(data.user); account.id = data.user.id; ids.push(account.id);
      const { data: profile, error: read } = await service.from("profiles").select("role,is_approved").eq("id", account.id).single();
      assert.equal(read, null); assert.equal(profile?.role, "customer");
      // All changes apply only to a brand-new audit account.
      if (!profile?.is_approved) {
        const { error: approval } = await service.from("profiles").update({ is_approved: true }).eq("id", account.id);
        assert.equal(approval, null);
      }
    }
    assert.equal((await client.auth.signInWithPassword({ email: a.email, password: a.password })).error, null);
    assert.equal((await second.auth.signInWithPassword({ email: b.email, password: b.password })).error, null);
  });
  if (!a.id || !b.id) throw Error("Temporary identity setup failed; dependent writes were not attempted");
  const api = async (pathname: string, method = "GET", body?: unknown, who = client) => {
    const { data } = await who.auth.getSession();
    assert.ok(data.session);
    return fetch(base + pathname, { method, headers: { Authorization: `Bearer ${data.session.access_token}`, Origin: base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
  await check("Hosted customer login uses real customer role and all protected account pages load", async () => {
    await page.goto(base + "/login");
    await page.locator("input[type=email]").fill(a.email);
    await page.locator("input[type=password]").fill(a.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL(base + "/menu");
    for (const route of ["account", "favorites", "rewards", "vouchers", "orders", "help", "profile/edit", "profile/addresses"]) {
      await page.goto(base + "/" + route);
      await expect(page.locator(".jayds-app")).toBeVisible();
      await expect(page.getByText("This page couldn’t load", { exact: true })).toHaveCount(0);
    }
  });
  await check("Real profile form: normalized phone/name save persists across new session", async () => {
    await page.goto(base + "/profile/edit");
    await expect(page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, { exact: true })).toHaveValue("System audit temporary customer");
    await page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill("System audit renamed customer");
    await page.getByLabel(/^Phone number/).fill("0912 345 6789");
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByText("Your details were saved.", { exact: true })).toBeVisible();
    const { data, error } = await client.from("profiles").select("full_name,phone").eq("id", a.id).single();
    assert.equal(error, null); assert.equal(data?.phone, "09123456789"); assert.equal(data?.full_name, "System audit renamed customer");
    await page.reload(); await expect(page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, { exact: true })).toHaveValue("System audit renamed customer");
  });
  await check("Real cloud favorites: add/idempotent retry, reload in UI, second account isolation and remove", async () => {
    const { data: catalog, error } = await client.rpc("get_published_catalog");
    assert.equal(error, null); productId = catalog.menuItems.find((item: { is_available: boolean }) => item.is_available)?.id;
    assert.ok(productId);
    const body = { menu_item_id: productId, configuration: [] };
    for (let i = 0; i < 2; i++) assert.equal((await api("/api/customer/favorites", "POST", body)).status, 200);
    const items = (await (await api("/api/customer/favorites")).json()).items;
    assert.equal(items.filter((item: { menu_item_id: string }) => item.menu_item_id === productId).length, 1);
    assert.deepEqual((await (await api("/api/customer/favorites", "GET", undefined, second)).json()).items, []);
    await page.goto(base + "/favorites");
    await expect(page.locator(`a[href*="${productId}"]`).first()).toBeVisible();
    assert.equal((await api("/api/customer/favorites", "DELETE", body)).status, 200);
    assert.deepEqual((await (await api("/api/customer/favorites")).json()).items, []);
  });
  await check("Real account QR: customer UI generates image, approved cashier resolves same customer, customer-role lookup denied", async () => {
    const { data, error } = await client.from("profiles").select("account_qr_hash").eq("id", a.id).single(); assert.equal(error, null); assert.ok(data?.account_qr_hash);
    await page.goto(base + "/account");
    await page.getByText("Your account QR", { exact: true }).click();
    await expect(page.getByAltText("Jayds account QR for the cashier")).toBeVisible();
    const qr = "account:" + data.account_qr_hash;
    assert.equal((await api("/staff/api/account/lookup", "POST", { qr }, second)).status, 403);
    const stored = readFileSync("docs/local-supabase.md", "utf8").match(/POS:\s+(\S+)\s*\/\s*(\S+)/)!;
    const cashier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      assert.equal((await cashier.auth.signInWithPassword({ email: stored[1], password: stored[2] })).error, null);
      const response = await api("/staff/api/account/lookup", "POST", { qr }, cashier); assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.customer.id, a.id); assert.equal(body.customer.points, 0);
    } finally { await cashier.auth.signOut(); }
  });
  await check("Real saved address: customer owns create/read; other customer cannot read/update/delete it", async () => {
    const { data, error } = await client.from("saved_addresses").insert({ user_id: a.id, label: "Audit Home", address: "Isolated audit destination", lat: 14.346621, lng: 120.981057 }).select("id").single();
    assert.equal(error, null); assert.ok(data); addressId = data.id;
    const cross = await second.from("saved_addresses").select("id").eq("id", addressId);
    assert.equal(cross.error, null); assert.deepEqual(cross.data, []);
    const update = await second.from("saved_addresses").update({ label: "Unauthorized rename" }).eq("id", addressId).select("id");
    assert.ok(update.error || update.data?.length === 0);
    const remove = await second.from("saved_addresses").delete().eq("id", addressId).select("id");
    assert.ok(remove.error || remove.data?.length === 0);
    const own = await client.from("saved_addresses").select("label").eq("id", addressId).single();
    assert.equal(own.data?.label, "Audit Home");
    await page.goto(base + "/profile/addresses"); await expect(page.getByText("Audit Home", { exact: true })).toBeVisible();
  });
  await check("Real saved address UI rename and reload", async () => {
    assert.ok(addressId);
    await page.goto(base + "/profile/addresses");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel(/^Label(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill("Audit Office");
    await page.getByRole("button", { name: "Save destination", exact: true }).click();
    await expect(page.getByText("Address saved.", { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText("Audit Office", { exact: true })).toBeVisible();
  });
  await check("Real support: customer submission/read, other account isolation, actual Admin inbox sees the same case", async () => {
    const response = await api("/api/customer/support", "POST", { kind: "account", subject: "SYSTEM AUDIT " + run, message: "Automated designated test account case. Cleanup follows this audit." });
    assert.equal(response.status, 200); supportId = (await response.json()).id; assert.ok(supportId);
    assert.equal((await (await api("/api/customer/support")).json()).cases.some((item: { id: string }) => item.id === supportId), true);
    assert.equal((await (await api("/api/customer/support", "GET", undefined, second)).json()).cases.some((item: { id: string }) => item.id === supportId), false);
    const stored = readFileSync("docs/local-supabase.md", "utf8").match(/Admin:\s+(\S+)\s*\/\s*(\S+)/)!;
    const admin = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      assert.equal((await admin.auth.signInWithPassword({ email: stored[1], password: stored[2] })).error, null);
      const { data, error } = await admin.from("customer_support_cases").select("id,user_id").eq("id", supportId).single();
      assert.equal(error, null); assert.equal(data?.user_id, a.id);
      await page.goto(base + "/help"); await expect(page.getByText("SYSTEM AUDIT " + run, { exact: true })).toBeVisible();
    } finally { await admin.auth.signOut(); }
  });
  await check("Real customer privilege boundaries: role/points escalation rejected and Admin/POS access denied", async () => {
    for (const update of [{ role: "admin" }, { points: 9999 }]) {
      const result = await client.from("profiles").update(update).eq("id", a.id);
      assert.ok(result.error, "Customer privileged profile update fails");
    }
    const { data } = await service.from("profiles").select("role,points").eq("id", a.id).single();
    assert.equal(data?.role, "customer"); assert.equal(data?.points, 0);
    const { error } = await client.rpc("get_customer_scheduling_admin"); assert.ok(error);
  });
  await check("Real current-password verification + password change, old login rejected and new login accepted", async () => {
    await page.goto(base + "/profile/edit");
    const password = randomBytes(24).toString("base64url");
    await page.getByLabel(/^Current password(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill(a.password);
    await page.getByLabel(/^New password(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill(password);
    await page.getByLabel(/^Confirm new password(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill(password);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText("Your password was changed.", { exact: true })).toBeVisible();
    const verify = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await verify.auth.signInWithPassword({ email: a.email, password: a.password })).error);
    a.password = password;
    assert.equal((await verify.auth.signInWithPassword({ email: a.email, password: a.password })).error, null);
    await verify.auth.signOut();
  });
  await check("Real customer logout removes private account access", async () => {
    await page.goto(base + "/account"); await page.getByRole("button", { name: /Sign out/i }).click();
    await page.goto(base + "/account"); await expect(page.getByRole("link", { name: /Sign in/ }).first()).toBeVisible();
  });
} finally {
  await context.close(); await browser.close();
  await client.auth.signOut(); await second.auth.signOut();
  await check("Cleanup: exact temporary customer records/accounts removed; no café transaction created", async () => {
    for (const id of ids) {
      for (const table of ["customer_support_cases", "customer_favorites"]) {
        const { error } = await service.from(table).delete().eq("user_id", id); assert.equal(error, null);
      }
      const { error: addressError } = await service.from("saved_addresses").delete().eq("user_id", id); assert.equal(addressError, null);
      const { error } = await service.auth.admin.deleteUser(id); assert.equal(error, null);
      assert.equal((await service.auth.admin.getUserById(id)).data.user, null);
    }
  });
}
console.log(JSON.stringify({ checks: results.length, failures: results.filter(row => row.status === "FAIL").map(row => row.feature), output: out }));
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
