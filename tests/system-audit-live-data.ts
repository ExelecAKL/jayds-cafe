// Read-only deployed configuration and data checks. Never seed, migrate,
// activate inventory, settle a payment, or save a business record here.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
nextEnv.loadEnvConfig(path.resolve("apps/admin"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Read-only live-data credentials are unavailable.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options), anon = createClient(url, anonKey, options);
const results: Record<string, unknown>[] = [];
const folder = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/live-data");
mkdirSync(folder, { recursive: true });
async function check(name: string, run: () => Promise<unknown>) {
  try { results.push({ name, status: "PASS", detail: await run() }); }
  catch (e) { results.push({ name, status: "FAIL", detail: String(e) }); }
  writeFileSync(path.join(folder, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, backendHost: new URL(url!).hostname, results }, null, 2));
}
for (const table of ["profiles", "orders", "order_items", "saved_addresses", "customer_support_cases", "customer_provider_attempts", "admin_audit", "stock_movements", "guest_receipts"]) {
  await check("Anonymous private-table boundary: " + table, async () => {
    const response = await anon.from(table).select("id", { count: "exact", head: true });
    if (response.error && ![401, 403].includes(response.status) && !["42501", "PGRST301"].includes(response.error.code)) throw new Error(`${response.status} ${response.error.code}: ${response.error.message}`);
    if (!response.error && response.count !== 0) throw new Error("Anonymous read exposes " + response.count + " records");
    return { status: response.status, code: response.error?.code ?? null, visibleCount: response.count ?? 0 };
  });
}
await check("Live public catalog", async () => {
  const { data, error } = await anon.rpc("get_published_catalog");
  if (error) throw new Error(error.message);
  const forbidden = /"(?:cost_per_unit|unit_cost|supplier_id|password|token_hash)"/;
  if (forbidden.test(JSON.stringify(data))) throw new Error("Catalog contains private operational fields");
  const items = data.menuItems ?? [];
  return { products: items.length, categories: data.categories?.length, unavailable: items.filter((i: { is_available: boolean }) => !i.is_available).length, missingImages: items.filter((i: { image_url: string }) => !i.image_url).length, negativeOrInvalidPrices: items.filter((i: { price: number }) => !Number.isFinite(Number(i.price)) || Number(i.price) < 0).length };
});
for (const rpc of ["get_inventory_readiness", "get_customer_branch", "get_customer_scheduling_admin"]) {
  await check("Live read-only RPC: " + rpc, async () => {
    const { data, error } = await service.rpc(rpc);
    if (error) throw new Error(`${error.code}: ${error.message}`);
    return data;
  });
}
await check("Live profile role and approval counts", async () => {
  const { data, error } = await service.from("profiles").select("role,is_approved");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) { const key = row.role + (row.is_approved ? ":approved" : ":unapproved"); counts[key] = (counts[key] ?? 0) + 1; }
  return counts;
});
await check("Live stock has no negative physical balances", async () => {
  const { data, error } = await service.from("ingredients").select("id,current_stock").lt("current_stock", 0);
  if (error) throw new Error(error.message);
  if (data?.length) throw new Error(`${data.length} stock records have negative balances`);
  return { negativeBalanceCount: 0 };
});
console.log(JSON.stringify({ checks: results.length, failures: results.filter(r => r.status === "FAIL"), output: folder }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
