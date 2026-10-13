import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { chromium, expect } from "@playwright/test";
nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
// The live courier booking probe is strictly restricted to its sandbox host.
assert.equal(process.env.MAYA_ENV, "sandbox");
assert.equal(process.env.LALAMOVE_BASE_URL, "https://rest.sandbox.lalamove.com");
const { lalamoveRequest } = await import("../apps/customer/app/api/lalamove/lib.ts");
const { MayaService } = await import("../packages/shared/src/maya.ts");
const base = "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/provider-live");
mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: string }[] = [];
const check = async (feature: string, work: () => Promise<string | void>) => {
  try { const detail = await work(); results.push({ feature, status: "PASS", detail: detail || "Real external sandbox API; no café sale or physical stock change" }); }
  catch (error) { results.push({ feature, status: "FAIL", detail: String(error).replace(/https?:\/\/\S+/g, "[URL redacted]").slice(0, 1800) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveProviderCalls: true, sandboxOnly: true, liveCafeBusinessWrites: false, results }, null, 2));
  console.log(results.at(-1)?.status, feature);
};
type Quote = { data: { quotationId: string; priceBreakdown: { currency: string; total: string }; expiresAt: string; stops: { stopId: string }[] } };
let quote: Quote["data"] | undefined, bookingId = "", checkout: { checkoutId: string; redirectUrl: string } | undefined;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await check("Hosted courier quotation: real sandbox quote, PHP fee, signed token and unexpired result", async () => {
    const branch = await (await fetch(base + "/api/branch")).json();
    const response = await fetch(base + "/api/lalamove/quotation", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ dropoffLat: Number(branch.latitude) + 0.003, dropoffLng: Number(branch.longitude) + 0.003, dropoffAddress: "Sandbox audit delivery destination near Jayds Café" }) });
    assert.equal(response.status, 200, "Hosted Lalamove quotation succeeds");
    const body = await response.json();
    assert.equal(body.currency, "PHP"); assert.ok(Number.isFinite(body.deliveryFee));
    assert.ok(body.quoteToken); assert.ok(Date.parse(body.expiresAt) > Date.now());
    return `Actual hosted quotation returned ${body.currency}, valid expiry and signed destination token`;
  });
  await check("Courier sandbox: real quotation and supported motorcycle route", async () => {
    const response = await lalamoveRequest<Quote>("POST", "/v3/quotations", { data: { serviceType: "MOTORCYCLE", language: "en_PH", stops: [{ coordinates: { lat: "14.346621", lng: "120.981057" }, address: "Sandbox audit origin at Jayds Café" }, { coordinates: { lat: "14.349621", lng: "120.984057" }, address: "Sandbox audit destination" }] } });
    assert.equal(response.error, undefined, `Quotation status ${response.status}`);
    quote = response.data?.data; assert.ok(quote); assert.equal(quote.priceBreakdown.currency, "PHP");
  });
  await check("Courier sandbox: booking, retrieve canonical order and cancellation", async () => {
    assert.ok(quote, "Real successful sandbox quotation is required before booking");
    const response = await lalamoveRequest<{ data: { orderId: string } }>("POST", "/v3/orders", { data: { quotationId: quote.quotationId, sender: { stopId: quote.stops[0].stopId, name: "System audit sandbox sender", phone: "+639900100900" }, recipients: [{ stopId: quote.stops[1].stopId, name: "System audit sandbox recipient", phone: "+639900100901" }], isPODEnabled: false, metadata: { audit: "jayds-system-audit", auditId: randomUUID() } } });
    bookingId = response.data?.data.orderId || "";
    assert.equal(response.error, undefined, `Sandbox booking status ${response.status}`); assert.ok(bookingId);
    const detail = await lalamoveRequest<{ data: { orderId: string } }>("GET", "/v3/orders/" + bookingId);
    assert.equal(detail.data?.data.orderId, bookingId);
    const cancelled = await lalamoveRequest("DELETE", "/v3/orders/" + bookingId);
    assert.equal(cancelled.status, 204);
    return "Actual sandbox booking and canonical lookup succeeded; cancellation returned 204. Rider transitions/webhook delivery are separate gates.";
  });
  await check("Maya sandbox: real checkout creation through maintained service", async () => {
    checkout = await MayaService.createCheckout({ totalAmount: { value: 1, currency: "PHP" }, items: [{ name: "System audit sandbox checkout", description: "Isolated sandbox provider verification", quantity: 1, code: "AUDIT", amount: { value: 1, currency: "PHP" }, totalAmount: { value: 1, currency: "PHP" } }], requestReferenceNumber: randomUUID(), redirectUrl: { success: base + "/menu?auditPayment=success", failure: base + "/menu?auditPayment=failure", cancel: base + "/menu?auditPayment=cancel" }, metadata: { audit: "jayds-system-audit-provider-only" } });
    assert.ok(checkout.checkoutId); assert.equal(new URL(checkout.redirectUrl).protocol, "https:");
    return "Actual provider checkout created. This provider-only checkout is not a café order and cannot establish café settlement.";
  });
  await check("Maya sandbox: hosted provider page opens and Back to Merchant follows cancellation URL", async () => {
    assert.ok(checkout);
    const p = await browser.newPage();
    try {
      await p.goto(checkout.redirectUrl);
      const back = p.getByText(/Back to Merchant/i).first();
      await expect(back).toBeVisible({ timeout: 20000 });
      await back.click();
      await p.waitForURL(base + "/menu?auditPayment=cancel", { timeout: 20000 });
      return "Real provider UI cancellation redirected to the merchant. Success/decline/expiry and real webhook settlement remain unverified.";
    } finally { await p.close(); }
  });
} finally {
  if (bookingId) await lalamoveRequest("DELETE", "/v3/orders/" + bookingId).catch(() => {});
  await browser.close();
}
console.log(JSON.stringify({ checks: results.length, failures: results.filter(row => row.status === "FAIL").map(row => row.feature), output: out }));
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
