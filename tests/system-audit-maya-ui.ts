import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { chromium } from "@playwright/test";
nextEnv.loadEnvConfig(path.resolve("apps/customer"), false, { info() {}, error() {} });
assert.equal(process.env.MAYA_ENV, "sandbox", "Never submit test cards in a live environment");
const { MayaService } = await import("../packages/shared/src/maya.ts");
const base = "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/maya-ui"); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const checkout = await MayaService.createCheckout({ totalAmount: { value: 1, currency: "PHP" }, items: [{ name: "System audit sandbox outcome", description: "Provider-only sandbox test", quantity: 1, code: "AUDIT", amount: { value: 1, currency: "PHP" }, totalAmount: { value: 1, currency: "PHP" } }], requestReferenceNumber: randomUUID(), redirectUrl: { success: base + "/menu?auditPayment=success", failure: base + "/menu?auditPayment=failure", cancel: base + "/menu?auditPayment=cancel" }, metadata: { audit: "jayds-provider-only" } });
  const page = await browser.newPage();
  await page.goto(checkout.redirectUrl);
  await page.getByText(/Back to Merchant/i).first().waitFor({ timeout: 20000 });
  // Published Maya sandbox success card (non-3DS), never a real card.
  await page.locator("#firstName").fill("System"); await page.locator("#lastName").fill("Audit");
  await page.locator("#cardNumber").fill("5123456789012346");
  await page.locator("#expiryDate").fill("12/30"); await page.locator("#cvv").fill("111");
  await page.keyboard.press("Tab");
  const pay = page.getByRole("button", { name: "Confirm and pay", exact: true });
  const enabled = await pay.isEnabled();
  if (enabled) await pay.click();
  const returned = enabled && await page.waitForURL(base + "/menu?auditPayment=success", { timeout: 20000 }).then(() => true, () => false);
  await page.screenshot({ path: path.join(out, "provider-outcome.png"), fullPage: true });
  const hasCaptcha = page.frames().some(frame => /recaptcha|hcaptcha/.test(frame.url()));
  let status = "BLOCKED", detail = !enabled && hasCaptcha ? "Published sandbox card fields completed; Confirm and pay remains disabled beside the unchecked I'm not a robot reCAPTCHA. Human completion is required. No challenge-solving/bypass attempted." : hasCaptcha ? "Sandbox card submitted but no success return within 20s; provider reCAPTCHA is present. No challenge-solving/bypass attempted. Outcome remains unverified." : "Sandbox form did not complete payment. Outcome remains unverified; see screenshot.";
  if (returned) {
    const payment = await MayaService.getCheckoutStatus(checkout.checkoutId);
    assert.ok(payment.isPaid || payment.paymentStatus === "PAYMENT_SUCCESS" || payment.status === "PAYMENT_SUCCESS");
    status = "PASS"; detail = "Actual sandbox card success returned and provider status confirms payment. Provider-only test; café order settlement, webhook delivery and refunds are not established.";
  }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, sandboxOnly: true, results: [{ feature: "Maya actual sandbox success card outcome", status, detail }] }, null, 2));
  if (status === "BLOCKED") process.exitCode = 2;
  console.log(JSON.stringify({ status, detail, providerText: returned ? "Returned to merchant" : (await page.locator("body").innerText()).slice(0, 1800) }));
  if (!returned && await page.getByText(/Back to Merchant/i).first().isVisible()) {
    await page.getByText(/Back to Merchant/i).first().click(); await page.waitForURL(base + "/menu?auditPayment=cancel");
  }
} finally { await browser.close(); }
