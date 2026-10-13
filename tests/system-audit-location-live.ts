import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const base = process.env.JAYDS_AUDIT_CUSTOMER_URL || "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/location-live"); mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: string }[] = [];
for (const [feature, query] of [["Actual hosted address search returns bounded Philippine destinations", "q=Dasmarinas%20Cavite"], ["Actual hosted reverse geocoding returns a valid destination", "lat=14.346621&lng=120.981057"]]) {
  try {
    const response = await fetch(base + "/api/location?" + query); assert.equal(response.status, 200, "Hosted geocoder succeeds");
    const body = await response.json(); assert.ok(Array.isArray(body.results)); assert.ok(body.results.length > 0 && body.results.length <= 5);
    for (const result of body.results) { assert.ok(Number.isFinite(result.lat) && Number.isFinite(result.lng)); assert.ok(typeof result.address === "string" && result.address.trim()); }
    results.push({ feature, status: "PASS", detail: "Actual hosted route and Photon provider response; public test coordinates only" });
  } catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1500) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: false, results }, null, 2)); console.log(results.at(-1)?.status, feature);
  await new Promise(resolve => setTimeout(resolve, 700));
}
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
