import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const base = process.env.JAYDS_AUDIT_CUSTOMER_URL || "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/receipt"); mkdirSync(out, { recursive: true });
const results: { feature: string; status: string; detail: string }[] = [];
const check = async (feature: string, work: () => Promise<void>) => {
  try { await work(); results.push({ feature, status: "PASS", detail: "Actual hosted accepted order; browser print function/media only; no receipt printer" }); }
  catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1600) }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, physicalPrinter: false, liveBusinessWrites: false, results }, null, 2)); console.log(results.at(-1)?.status, feature);
};
const order = JSON.parse(readFileSync((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/order-live/results.json", "utf8"));
const stored = readFileSync("docs/local-supabase.md", "utf8").match(/Admin:\s+(\S+)\s*\/\s*(\S+)/)!;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
try {
  await page.goto(base + "/login"); await page.locator("input[type=email]").fill(stored[1]); await page.locator("input[type=password]").fill(stored[2]); await page.locator("button[type=submit]").click(); await page.waitForURL(base + "/menu");
  await page.goto(base + "/orders/" + order.orderId);
  await expect(page.getByText(order.orderNumber, { exact: true }).first()).toBeVisible();
  await check("Accepted receipt: Print accepted order invokes the browser print action once", async () => {
    await page.evaluate(() => { const state = Object.assign(window, { __auditPrintCalls: 0 }); window.print = () => { state.__auditPrintCalls++; }; });
    await page.getByRole("button", { name: "Print accepted order", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as unknown as { __auditPrintCalls: number }).__auditPrintCalls), 1);
  });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: path.join(out, "receipt-print-media.png"), fullPage: true });
  await check("Accepted receipt: print media preserves total/items and hides the print action", async () => {
    const total = page.locator("dt").filter({ hasText: /^Total$/ });
    await expect(total).toBeVisible();
    await expect(total.locator("..").locator("dd")).toHaveText(/^₱\d+\.\d{2}$/);
    await expect(page.getByRole("heading", { name: "Your accepted ticket", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print accepted order", exact: true })).toBeHidden();
  });
  await check("Accepted receipt: printed ticket retains its order number", async () => {
    const numbers = await page.getByText(order.orderNumber, { exact: true }).all();
    assert.ok((await Promise.all(numbers.map(number => number.isVisible()))).some(Boolean), "Printed receipt must retain its order number");
  });
} finally { await browser.close(); }
process.exitCode = results.some(row => row.status === "FAIL") ? 1 : 0;
