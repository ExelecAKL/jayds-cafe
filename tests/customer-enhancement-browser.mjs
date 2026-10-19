import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
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
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await isolateCustomer(page);
async function capture(name) {
  await page.locator("img").evaluateAll((images) =>
    images.forEach((image) => {
      image.loading = "eager";
    }),
  );
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode().catch(() => {}))),
    );
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
try {
  await page.goto(base + "/menu");
  await ready(page);
  await expect(page.locator(".home-discovery .product-card")).toHaveCount(3);
  await expect(page.locator(".home-discovery")).toContainText("₱145.00");
  await page.getByRole("button", { name: /Show featured slide 2/ }).click();
  await expect(page.locator(".home-carousel h2")).toHaveText("Spanish Latte");
  await page.getByRole("button", { name: /Show featured slide 1/ }).click();
  await capture("after-home-mobile");
  await page
    .locator(".home-fulfillment-cards")
    .getByRole("link", { name: /Bring it over/ })
    .click();
  await expect(page).toHaveURL(base + "/menu/browse");
  await expect(
    page.getByRole("button", { name: "Delivery", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pickup", exact: true }).click();
  checks.push("Home product discovery, carousel and pickup/delivery routing");

  const search = page.getByRole("searchbox", { name: "Search the menu" });
  const available = page.getByRole("button", {
    name: "Available",
    exact: true,
  });
  const featured = page.getByRole("button", { name: "Featured", exact: true });
  await expect(page.locator(".product-card")).toHaveCount(8);
  await search.fill("Croffles");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear search" }).click();
  await available.focus();
  await page.keyboard.press("Space");
  await expect(available).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-card")).toHaveCount(7);
  await expect(page.locator(".is-sold-out")).toHaveCount(0);
  await featured.focus();
  await page.keyboard.press("Enter");
  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-card")).toHaveCount(3);
  await search.fill("Matcha");
  await expect(
    page.getByText("No matches this time.", { exact: true }),
  ).toBeVisible();
  await capture("after-empty-filters");
  await page.getByRole("button", { name: "Show the full menu" }).click();
  await expect(page.locator(".product-card")).toHaveCount(8);
  await expect(available).toHaveAttribute("aria-pressed", "false");
  await expect(featured).toHaveAttribute("aria-pressed", "false");
  checks.push(
    "Category-name search, intersecting filters, keyboard toggles and empty-result recovery",
  );

  await available.click();
  await featured.click();
  await search.fill("coffee");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page
    .getByRole("link", { name: "Select Spanish Latte", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Add to bag/ })).toBeVisible();
  await page.getByRole("link", { name: "Go back", exact: true }).click();
  await expect(search).toHaveValue("coffee");
  await expect(available).toHaveAttribute("aria-pressed", "true");
  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.reload();
  await ready(page);
  await expect(search).toHaveValue("coffee");
  await expect(available).toHaveAttribute("aria-pressed", "true");
  await expect(featured).toHaveAttribute("aria-pressed", "true");
  checks.push("Search and both filters survive product navigation and refresh");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "Croffles", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Croffles", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page
    .getByRole("link", { name: "Select Just Croffle", exact: true })
    .click();
  await page.getByRole("link", { name: "Go back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Croffles", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  checks.push("Category rail selection and restoration");

  await page
    .getByRole("link", { name: "Select Spanish Latte", exact: true })
    .click();
  await page.getByRole("button", { name: /22oz/ }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /Add to bag/ }).click();
  await page.goto(base + "/cart");
  await expect(page.locator("main")).toContainText("Spanish Latte");
  await expect(page.locator("main")).toContainText("22oz");
  await expect(page.locator("main")).toContainText("340.00");
  await page.reload();
  await ready(page);
  await expect(page.locator("main")).toContainText("Spanish Latte");
  await expect(page.locator("main")).toContainText("340.00");
  await capture("after-bag");
  await page.setViewportSize({ width: 1024, height: 768 });
  const review = await page.getByRole("link", { name: "Review checkout", exact: true }).boundingBox();
  assert.ok(review && review.y >= 0 && review.y + review.height <= 768, "Desktop bag keeps Review checkout in view");
  await capture("after-bag-desktop");
  checks.push(
    "Product customization, quantity, correct bag amount, draft persistence and visible desktop checkout",
  );

  // Compare like-for-like empty guest bags after verifying the saved draft.
  await page.evaluate(() => {
    localStorage.removeItem("cafeos-cart:guest");
    sessionStorage.removeItem("jayds-menu-view");
  });
  await page.reload();
  await ready(page);

  const layouts = [];
  for (const [width, height] of [
    [320, 760],
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of ["/menu", "/menu/browse"]) {
      await page.goto(base + route);
      await ready(page);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      assert.ok(
        overflow <= 1,
        `${route} ${width}: horizontal overflow ${overflow}`,
      );
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      if (route.endsWith("browse")) {
        await expect(
          page.getByRole("searchbox", { name: "Search the menu" }),
        ).toBeVisible();
        await expect(page.locator(".product-card")).toHaveCount(
          products.length,
        );
      }
      layouts.push({ route, width, height, overflow });
      if ([390, 1440].includes(width))
        await capture(
          `after-${route.endsWith("browse") ? "menu" : "home"}-${width < 768 ? "mobile" : "desktop"}`,
        );
    }
  }
  checks.push(
    "Home and menu responsive layouts at seven phone, tablet, landscape and desktop sizes",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/menu", "/menu/browse"]) {
    await page.goto(base + route);
    await ready(page);
    for (let tab = 0; tab < 60; tab++) {
      await page.keyboard.press("Tab");
      const covered = await page.evaluate(() => {
        const element = document.activeElement;
        if (
          !(element instanceof HTMLElement) ||
          element.closest(".app-nav") ||
          element === document.body
        )
          return null;
        const bounds = element.getBoundingClientRect();
        const nav = document.querySelector(".app-nav")?.getBoundingClientRect();
        return nav &&
          bounds.bottom > nav.top + 1 &&
          bounds.top < nav.bottom &&
          bounds.height > 0
          ? {
              element: element.textContent?.trim().slice(0, 60),
              bottom: bounds.bottom,
              navTop: nav.top,
            }
          : null;
      });
      assert.equal(
        covered,
        null,
        `${route}: keyboard focus stays above the bottom navigation: ${JSON.stringify(covered)}`,
      );
    }
  }
  checks.push(
    "Tab focus remains visible above the persistent mobile navigation",
  );
  assert.deepEqual(errors, [], "No browser runtime errors");
  const report = {
    checks,
    layouts,
    runtimeErrors: errors,
    fixture: "Isolated catalog; no live writes",
  };
  writeFileSync(
    `${output}/playwright-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
