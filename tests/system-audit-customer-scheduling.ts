import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Route } from "@playwright/test";
import { manilaDate, tomorrowManilaDate } from "../packages/shared/src/customer/scheduling.ts";
export async function scheduledCustomerAudit(page: Page, base: string) {
  const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/customer-scheduling");
  mkdirSync(out, { recursive: true });
  const results: { feature: string; status: string; detail: string }[] = [];
  const check = async (feature: string, work: () => Promise<void>) => {
    try { await work(); results.push({ feature, status: "PASS", detail: "Served customer UI with isolated slot fixtures; actual scheduling SQL tested separately" }); }
    catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1800) }); await page.screenshot({ path: path.join(out, `${results.length}-failure.png`), fullPage: true }); }
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: false, results }, null, 2));
    console.log(results.at(-1)?.status, feature);
  };
  const matcher = base + "/api/pickup/slots**";
  let fail = false, empty = false;
  const queries: string[] = [];
  const handler = async (route: Route) => {
    const date = new URL(route.request().url()).searchParams.get("date")!; queries.push(date);
    if (fail) return route.fulfill({ status: 503, json: { error: "Audit pickup slots temporarily unavailable" } });
    const start = date + "T12:00:00+08:00";
    return route.fulfill({ json: { enabled: true, reason: empty ? "This day is closed for scheduled pickup." : null, slots: empty ? [] : [
      { start, end: date + "T12:15:00+08:00", preparation_due_at: date + "T11:50:00+08:00", remaining_orders: 3, remaining_item_units: 100 },
      { start: date + "T12:15:00+08:00", end: date + "T12:30:00+08:00", preparation_due_at: date + "T12:05:00+08:00", remaining_orders: 0, remaining_item_units: 100 },
      { start: date + "T12:30:00+08:00", end: date + "T12:45:00+08:00", preparation_due_at: date + "T12:20:00+08:00", remaining_orders: 3, remaining_item_units: 0 },
    ] } });
  };
  await page.route(matcher, handler);
  try {
    await check("Customer scheduling UI: cash disabled, full-order and insufficient-item slots disabled, available slot selectable", async () => {
      await page.goto(base + "/checkout");
      await page.getByRole("button", { name: "Pickup", exact: true }).click();
      await page.getByRole("button", { name: "Schedule pickup", exact: true }).click();
      await expect(page.getByRole("button", { name: "Cash at counter", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "12:00 PM", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "12:15 PM", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "12:30 PM", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "12:00 PM", exact: true }).click();
      assert.ok(queries.includes(manilaDate()));
    });
    await check("Customer scheduling UI: tomorrow selection changes request date and review preserves Maya/window without auto-submission", async () => {
      const tomorrow = tomorrowManilaDate();
      await page.getByLabel("Pickup date").selectOption(tomorrow);
      await expect(page.getByRole("button", { name: "12:00 PM", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "12:00 PM", exact: true }).click();
      await page.getByRole("button", { name: /^Review order/ }).click();
      await page.waitForURL(base + "/checkout/confirm");
      await expect(page.getByText("PICKUP · MAYA", { exact: true })).toBeVisible();
      const review = await page.evaluate(() => JSON.parse(sessionStorage.getItem("checkout_confirm") || "{}"));
      assert.equal(review.pickupSlotStart, tomorrow + "T12:00:00+08:00"); assert.equal(review.paymentMethod, "maya");
      assert.ok(queries.includes(tomorrow));
    });
    await check("Customer scheduling UI: unavailable read reports error; navigation retry recovers slots", async () => {
      fail = true;
      await page.goto(base + "/checkout");
      await page.getByRole("button", { name: "Schedule pickup", exact: true }).click();
      await expect(page.getByText("Audit pickup slots temporarily unavailable", { exact: true })).toBeVisible();
      fail = false; await page.reload();
      await expect(page.getByRole("button", { name: "12:00 PM", exact: true })).toBeEnabled();
    });
    await check("Customer scheduling UI: closure shows no slots and review rejects missing window", async () => {
      empty = true; await page.reload();
      await expect(page.getByText("This day is closed for scheduled pickup.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "12:00 PM", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: /^Review order/ }).click();
      await expect(page.getByText("Choose an available pickup window.", { exact: true })).toBeVisible();
    });
    await check("Customer scheduling UI: switching to immediate pickup restores cash and clears scheduled review window", async () => {
      empty = false; await page.getByRole("button", { name: "As soon as possible", exact: true }).click();
      await expect(page.getByRole("button", { name: "Cash at counter", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Cash at counter", exact: true }).click();
      await page.getByRole("button", { name: /^Review order/ }).click();
      await page.waitForURL(base + "/checkout/confirm");
      const review = await page.evaluate(() => JSON.parse(sessionStorage.getItem("checkout_confirm") || "{}"));
      assert.equal(review.pickupSlotStart, null); assert.equal(review.paymentMethod, "cash");
    });
  } finally { await page.unroute(matcher, handler); }
  return results;
}
