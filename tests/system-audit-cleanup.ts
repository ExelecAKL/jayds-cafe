import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/cleanup-live"); mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: string }[] = [];
const check = async (feature: string, work: () => Promise<void>) => {
  try { await work(); results.push({ feature, status: "PASS", detail: "Actual hosted final read-only cleanup verification" }); }
  catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1600) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), liveBusinessWrites: false, results }, null, 2)); console.log(results.at(-1)?.status, feature);
};
const orderIds = ["21a55591-84cc-4ac1-a7e9-fc27c2772da7", "323e2610-0740-48f6-b06f-395bf8d219fe", "fdb6ce59-63af-4502-98d0-39c836f20f9c", "39c6be60-f8db-472f-a312-ad697c12feda"];
for (const folder of ["order-live", "maya-order-live"]) {
  const file = path.resolve(process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12", folder, "results.json");
  if (existsSync(file)) { const id = JSON.parse(readFileSync(file, "utf8")).orderId; if (id && !orderIds.includes(id)) orderIds.push(id); }
}
await check("All recorded audit orders are cancelled, unpaid and unconsumed, with no active stock reservations", async () => {
  const { data, error } = await db.from("orders").select("id,status,payment_status,inventory_consumed").in("id", orderIds);
  assert.equal(error, null); assert.equal(data?.length, orderIds.length);
  for (const order of data ?? []) { assert.equal(order.status, "cancelled"); assert.ok(["pending", "failed"].includes(order.payment_status)); assert.equal(order.inventory_consumed, false); }
  const reservations = await db.from("stock_reservations").select("id").in("order_id", orderIds).eq("state", "reserved"); assert.equal(reservations.error, null); assert.deepEqual(reservations.data, []);
});
await check("No active temporary audit Auth identities or support cases remain; immutable legal records may be retained", async () => {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 }); assert.equal(error, null);
    assert.equal(data.users.filter(user => /^jayds\.audit\.[a-f0-9]+\.[ab]@example\.invalid$/.test(user.email || "")).length, 0);
    if (data.users.length < 100) break;
  }
  const cases = await db.from("customer_support_cases").select("id", { count: "exact", head: true }).ilike("subject", "SYSTEM AUDIT %"); assert.equal(cases.error, null); assert.equal(cases.count, 0);
});
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
