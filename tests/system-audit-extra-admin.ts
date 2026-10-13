import { expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Result = { feature: string; status: "PASS" | "FAIL"; detail: string };

// Exploratory checks deliberately collect every result, including failures,
// so a defective older modal cannot hide the remaining audit coverage.
export async function extraAdminAudit(page: Page, base: string) {
  const results: Result[] = [];
  const out = path.resolve(process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12",
    base.startsWith("https:") ? "hosted-extra-admin" : "local-extra-admin");
  mkdirSync(out, { recursive: true });
  async function check(feature: string, work: () => Promise<void>) {
    try {
      await work();
      results.push({ feature, status: "PASS", detail: "Verified in Playwright" });
    } catch (e) {
      results.push({ feature, status: "FAIL", detail: String(e).slice(0, 1800) });
      await page.screenshot({ path: path.join(out, `${results.length}-failure.png`), fullPage: true });
    }
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ base, results }, null, 2));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const openAnalytics = async () => {
    await page.goto(base + "/analytics");
    await expect(page.getByRole("table", { name: "Product margins" })).toBeVisible();
  };
  const close = async () => {
    const x = page.getByRole("button", { name: "Close dialog", exact: true });
    if (await x.count()) await x.last().click();
  };
  for (const modal of ["margin", "best-seller", "heatmap"]) {
    await openAnalytics();
    const title = modal === "margin" ? "Financial Breakdown" :
      modal === "best-seller" ? /^Demographics:/ : "Traffic Breakdown";
    const activate = async () => {
      if (modal === "margin")
        await page.getByRole("table", { name: "Product margins" }).locator("tbody tr").first().click();
      else if (modal === "best-seller")
        await page.getByRole("table", { name: "Best sellers" }).locator("tbody tr").first().click();
      else await page.locator('#heatmap-chart [title]').first().click();
    };
    await check(`${modal}: opens and displays data`, async () => {
      await activate();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    });
    await check(`${modal}: accessible dialog semantics`, async () => {
      await expect(page.getByRole("dialog")).toHaveCount(1, { timeout: 1200 });
    });
    await check(`${modal}: Escape dismissal`, async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0, { timeout: 1200 });
    });
    await close();
    await check(`${modal}: close button works`, async () => {
      await activate();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await close();
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    });
  }
  await page.goto(base + "/categories");
  await page.getByText("QA drinks", { exact: true }).click();
  await check("category options: opens", async () => {
    await expect(page.getByRole("heading", { name: "Category Options" })).toBeVisible();
  });
  await check("category options: accessible dialog semantics", async () => {
    await expect(page.getByRole("dialog")).toHaveCount(1, { timeout: 1200 });
  });
  await check("category options: Escape dismissal", async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Category Options" })).toHaveCount(0, { timeout: 1200 });
  });
  await close();
  await openAnalytics();
  // Fail only the selected item read; all other requests retain the fixture.
  const matcher = (url: URL) => url.pathname === "/rest/v1/menu_items" && url.searchParams.has("id");
  let failedReads = 0;
  await page.route(matcher, route => { failedReads++; return route.fulfill({ status: 503, json: { message: "Audit injected read failure" } }); });
  await page.getByRole("table", { name: "Product margins" }).locator("tbody tr").first().click();
  await page.waitForLoadState("networkidle");
  await check("margin: failed item read remains dismissible", async () => {
    await expect(page.getByRole("button", { name: "Close dialog", exact: true })).toBeVisible({ timeout: 1500 });
    await expect(page.getByRole("dialog", { name: "Financial Breakdown" }).getByRole("alert")).toHaveText("Financial breakdown could not load. Please retry.", { timeout: 25000 });
    expect(failedReads).toBeGreaterThan(0);
  });
  await page.unroute(matcher);
  await check("margin: failed item read retries successfully and focus returns after Escape", async () => {
    const modal = page.getByRole("dialog", { name: "Financial Breakdown" });
    await modal.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(modal.getByText("Selling Price", { exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
  });
  await page.goto(base + "/analytics");
  await expect(page.getByRole("table", { name: "Product margins" })).toBeVisible();
  await check("analytics: PNG report download", async () => {
    const download = page.waitForEvent("download", { timeout: 15000 });
    await page.getByRole("button", { name: "↓ PNG", exact: true }).first().click();
    const result = await download;
    expect(result.suggestedFilename()).toMatch(/\.png$/);
    await result.saveAs(path.join(out, "analytics-export.png"));
  });
  console.log(JSON.stringify({ extraAdminAudit: base, results }));
  return results;
}
