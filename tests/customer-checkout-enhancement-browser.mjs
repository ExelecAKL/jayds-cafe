import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  base,
  isolateCustomer,
  products,
  ready,
} from "./customer-enhancement-fixture.mjs";

const output = "tmp/customer-enhancement";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(60000);
page.setDefaultTimeout(30000);
const errors = [],
  validations = [],
  quotes = [];
const accessibility = [];
async function audit(section) {
  await page.addScriptTag({
    path: resolve("node_modules/axe-core/axe.min.js"),
  });
  const violations = await page.evaluate(async (selector) => {
    const result = await window.axe.run(document.querySelector(selector), {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    }));
  }, section);
  assert.deepEqual(violations, [], `Axe audit for ${section}`);
  accessibility.push({ section, violations });
}
page.on("pageerror", (error) => errors.push(error.message));
await isolateCustomer(page);
const voucher = {
  id: "voucher-click",
  code: "CAFE10",
  description: "A published test offer",
  discount_type: "fixed",
  discount_value: 10,
  min_order_amount: 100,
  max_uses: null,
  uses_count: 0,
  valid_from: null,
  valid_until: null,
  is_active: true,
  application_mode: "whole_order",
  created_at: "2026-10-01T00:00:00Z",
};
await context.route(
  (url) => url.pathname === "/rest/v1/vouchers",
  (route) =>
    route.fulfill({
      json: [
        voucher,
        {
          ...voucher,
          id: "expired",
          code: "OLD",
          valid_until: "2020-01-01T00:00:00Z",
        },
      ],
    }),
);
await context.route(base + "/api/vouchers/validate", async (route) => {
  const code = route.request().postDataJSON().code;
  validations.push(code);
  return code === "BAD"
    ? route.fulfill({
        status: 400,
        json: { error: "This voucher is unavailable." },
      })
    : route.fulfill({
        json: { ...voucher, code, discount_value: code === "MANUAL5" ? 5 : 10 },
      });
});
await context.route(base + "/api/lalamove/quotation", async (route) => {
  quotes.push(route.request().postDataJSON());
  return route.fulfill({
    json: {
      quoteToken: "isolated",
      deliveryFee: 49,
      quotationId: "isolated",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
  });
});
try {
  await page.goto(base + "/menu");
  await ready(page);
  await expect(page.locator(".home-menu-search")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Find your coffee, food or little treat/ }),
  ).toHaveCount(0);
  await page.goto(base + "/menu/browse/" + products[0].id);
  await ready(page);
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page.goto(base + "/cart");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Apply voucher CAFE10", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply voucher OLD", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#bag-voucher")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Apply voucher CAFE10", exact: true })
    .click();
  await expect(page.locator(".applied-voucher")).toContainText(
    "CAFE10 applied",
  );
  await expect(
    page.getByRole("button", { name: "Applied voucher CAFE10", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove voucher", exact: true })
    .click();
  await page.getByText("Enter a voucher code", { exact: true }).click();
  await page.locator("#bag-voucher").fill("BAD");
  await page.getByRole("button", { name: "Apply code", exact: true }).click();
  await expect(page.locator(".bag-rewards").getByRole("alert")).toContainText(
    "This voucher is unavailable.",
  );
  await expect(page.locator(".bag-rewards").getByRole("alert")).toHaveCSS(
    "color",
    "rgb(148, 47, 37)",
  );
  await page.locator("#bag-voucher").fill("MANUAL5");
  await page.getByRole("button", { name: "Apply code", exact: true }).click();
  await expect(page.locator(".applied-voucher")).toContainText(
    "MANUAL5 applied",
  );
  await expect(page.locator(".applied-voucher")).toHaveCSS(
    "color",
    "rgb(39, 98, 72)",
  );
  await audit(".bag-rewards");
  await page.screenshot({
    path: `${output}/vouchers-mobile.png`,
    fullPage: true,
  });
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) {
    await dismiss.click();
    await page.locator(".customer-toast").waitFor({ state: "detached" });
  }
  await page.getByRole("button", { name: "Clear your bag" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Clear bag", exact: true }),
  ).toHaveCSS("background-color", "rgb(148, 47, 37)");
  await page
    .getByRole("button", { name: "Keep my items", exact: true })
    .click();

  const address =
    "Unit 12, Example Residences, Sample Street, Dasmariñas, Cavite, Philippines";
  await page.evaluate((address) => {
    const cart = JSON.parse(localStorage.getItem("cafeos-cart:guest"));
    localStorage.setItem(
      "cafeos-cart:guest",
      JSON.stringify({ ...cart, orderType: "delivery" }),
    );
    sessionStorage.setItem(
      "jayds-checkout-form:guest",
      JSON.stringify({
        name: "Test Customer",
        phone: "09171234567",
        destination: { lat: 14.347, lng: 120.982, address, label: "Home" },
        paymentMethod: "maya",
        schedule: false,
      }),
    );
  }, address);
  await page.goto(base + "/checkout");
  await ready(page);
  const selected = page.getByRole("region", {
    name: "Pinned delivery address",
    exact: true,
  });
  await expect(selected).toContainText(address);
  await expect(selected).toContainText("Pin selected");
  await audit(".delivery-destination-card");
  await expect(
    selected.getByRole("button", { name: "Change pin", exact: true }),
  ).toBeVisible();
  const layouts = [];
  for (const width of [320, 360, 390, 430, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await selected.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    const clipped = await selected
      .locator(".delivery-destination-copy > p")
      .evaluate(
        (element) =>
          element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      );
    assert.equal(overflow, 0, `Checkout fits ${width}`);
    assert.equal(clipped, false, `Full address stays readable at ${width}`);
    layouts.push({ width, overflow, clipped });
    if (width === 390)
      await page.screenshot({ path: `${output}/pinned-address-mobile.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await selected.getByRole("button", { name: "Change pin" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Delivery address",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^Complete delivery address/)).toHaveValue(
    address,
  );
  await dialog.getByRole("button", { name: "Close map", exact: true }).click();
  await expect(selected).toContainText(address);
  await page.reload();
  await ready(page);
  await expect(selected).toContainText(address);
  assert.ok(
    quotes.some((quote) => quote.dropoffAddress === address),
    "Quotation keeps the complete pinned address",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.notEqual(
    await page
      .locator("main")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("main")).toHaveCSS("animation-name", "none");
  assert.deepEqual(errors, []);
  const report = {
    homeShortcutRemoved: true,
    clickApplyBeforeManualCode: true,
    expiredOffersHidden: true,
    validations,
    destructiveConfirmSemantic: true,
    pinnedAddressPreserved: true,
    changePinPrefilled: true,
    layouts,
    motionPreferenceRespected: true,
    runtimeErrors: errors,
    accessibility,
  };
  writeFileSync(
    `${output}/checkout-enhancement-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
