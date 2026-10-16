import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
export async function walletAudit(page: Page, base: string, productId: string, profile: Record<string, unknown>) {
  const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/wallet"); mkdirSync(out, { recursive: true });
  const results: { feature: string; status: string; detail: string }[] = [];
  const check = async (feature: string, work: () => Promise<void>) => {
    try { await work(); results.push({ feature, status: "PASS", detail: "Served customer wallet with isolated catalog/profile/voucher responses" }); }
    catch (error) { results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1700) }); await page.screenshot({ path: path.join(out, `${results.length}-failure.png`), fullPage: true }); }
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: false, results }, null, 2)); console.log(results.at(-1)?.status, feature);
  };
  const voucherMatcher = /\/rest\/v1\/vouchers(?:\?|$)/, tierMatcher = /\/rest\/v1\/loyalty_tiers(?:\?|$)/;
  const validation = base + "/api/vouchers/validate";
  const offer = { id: "99000000-0000-4000-8000-000000000001", code: "AUDITWALLET", description: "Isolated wallet offer", discount_type: "percentage", discount_value: 10, min_order_amount: 1, max_uses: 2, uses_count: 0, valid_from: null, valid_until: null, is_active: true, applicable_item_ids: [], application_mode: "whole_order", max_discount_amount: 50 };
  let failRead = false, empty = false, failValidate = true, validations = 0;
  await page.route(voucherMatcher, route => route.fulfill(failRead ? { status: 503, json: { message: "Audit wallet read unavailable" } } : { json: empty ? [] : [offer, { ...offer, id: "expired", code: "EXPIRED", valid_until: "2020-01-01T00:00:00Z" }, { ...offer, id: "future", code: "FUTURE", valid_from: "2099-01-01T00:00:00Z" }, { ...offer, id: "exhausted", code: "EXHAUSTED", uses_count: 2 }] }));
  await page.route(validation, async route => {
    validations++; assert.equal(route.request().postDataJSON().code, offer.code);
    await route.fulfill(failValidate ? { status: 409, json: { error: "Audit voucher unavailable, retry allowed" } } : { json: offer });
  });
  const original = { ...profile };
  try {
    await check("Voucher wallet: current offer only; expired/future/exhausted offers excluded; copy and denied clipboard fallback", async () => {
      await page.goto(base + "/vouchers");
      await expect(page.getByRole("button", { name: "Copy code AUDITWALLET" })).toBeVisible();
      for (const code of ["EXPIRED", "FUTURE", "EXHAUSTED"]) await expect(page.getByRole("button", { name: "Copy code " + code })).toHaveCount(0);
      await page.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
      await page.getByRole("button", { name: "Copy code AUDITWALLET" }).click();
      await expect(page.getByText(/^AUDITWALLET copied\./)).toBeVisible();
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error("Audit clipboard denied"); }; });
      await page.getByRole("button", { name: "Copy code AUDITWALLET" }).click();
      await expect(page.getByText(/^Copy this code: AUDITWALLET/)).toBeVisible();
    });
    await check("Voucher wallet: empty bag refuses apply without validation request", async () => {
      await page.goto(base + "/cart");
      await page.waitForLoadState("networkidle");
      if (await page.getByRole("button", { name: "Clear your bag", exact: true }).count()) {
        await page.getByRole("button", { name: "Clear your bag", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Clear bag", exact: true }).click();
        await expect(page.getByText("Your bag was cleared.", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Clear your bag", exact: true })).toHaveCount(0);
      }
      const before = validations;
      await page.goto(base + "/vouchers"); await page.getByRole("button", { name: "Use voucher", exact: true }).click();
      await expect(page.getByText("Add something to your bag first, then choose a voucher.", { exact: true })).toBeVisible(); assert.equal(validations, before);
    });
    await check("Voucher wallet: failed validation retains bag; retry applies and Review bag displays discount", async () => {
      await page.goto(base + "/menu/browse/" + productId);
      await page.getByRole("button", { name: /^Add to bag/ }).click();
      await page.waitForURL(base + "/menu/browse");
      await page.goto(base + "/vouchers"); await page.getByRole("button", { name: "Use voucher", exact: true }).click();
      await expect(page.getByText("Audit voucher unavailable, retry allowed", { exact: true })).toBeVisible();
      failValidate = false; await page.getByRole("button", { name: "Use voucher", exact: true }).click();
      await expect(page.getByRole("button", { name: "Applied", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Review bag", exact: true }).click(); await page.waitForURL(base + "/cart");
      await expect(page.getByText(/AUDITWALLET/).first()).toBeVisible();
    });
    await check("Voucher wallet: read failure and empty offers states; Rewards navigation", async () => {
      failRead = true; await page.goto(base + "/vouchers"); await expect(page.getByText("Vouchers could not load. Please try again later.", { exact: true })).toBeVisible({ timeout: 25000 });
      failRead = false; empty = true; await page.reload(); await expect(page.getByText("More good things soon.", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "View rewards", exact: true }).click(); await page.waitForURL(base + "/rewards");
    });
    await page.route(tierMatcher, route => route.fulfill({ json: [{ id: "bronze", name: "Bronze", min_points: 0, color: "#aa7040", perks: ["Fixture bronze perk"] }, { id: "silver", name: "Silver", min_points: 500, color: "#888888", perks: '["Fixture silver perk"]' }, { id: "gold", name: "Gold", min_points: 1000, color: "#aa9900", perks: "invalid-json" }] }));
    await check("Rewards wallet: zero/intermediate/top tier, safe malformed perks and navigation to vouchers", async () => {
      for (const [points, tier, text] of [[0, "Bronze", "500 points to Silver"], [750, "Silver", "250 points to Gold"], [1200, "Gold", ""]] as const) {
        Object.assign(profile, { points, loyalty_tier: tier }); await page.goto(base + "/rewards");
        await expect(page.getByText(tier + " member", { exact: true })).toBeVisible();
        if (text) await expect(page.getByText(text, { exact: true })).toBeVisible();
        await expect(page.getByText("This page couldn’t load", { exact: true })).toHaveCount(0);
      }
      await page.getByRole("link", { name: "Vouchers", exact: true }).click(); await page.waitForURL(base + "/vouchers");
    });
  } finally {
    Object.assign(profile, original); await page.unroute(voucherMatcher); await page.unroute(tierMatcher); await page.unroute(validation);
  }
  return results;
}
