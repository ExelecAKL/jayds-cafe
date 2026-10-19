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
const results = [];
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      reducedMotion,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await isolateCustomer(page);
    await page.goto(base + "/menu/browse/" + products[0].id);
    await ready(page);
    await page.getByRole("button", { name: /Add to bag/ }).click();
    await page.goto(base + "/cart");
    await ready(page);
    await page.clock.install();
    async function restoreItem() {
      await page
        .getByRole("button", { name: "Remove Spanish Latte", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Undo removal", exact: true })
        .click();
    }
    await restoreItem();
    const toast = page.locator(".customer-toast");
    await expect(toast).toHaveAttribute("data-state", "visible");
    await expect(toast).toContainText("Spanish Latte restored.");
    const frames = await toast.evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (!animation)
        return {
          reduced: true,
          transform: getComputedStyle(element).transform,
        };
      animation.pause();
      const frames = [0, 175, 350].map((time) => {
        animation.currentTime = time;
        return {
          time,
          top: element.getBoundingClientRect().top,
          opacity: Number(getComputedStyle(element).opacity),
        };
      });
      animation.finish();
      return { reduced: false, frames };
    });
    if (reducedMotion === "reduce") {
      assert.equal(frames.reduced, true);
      assert.equal(frames.transform, "none");
    } else {
      assert.equal(frames.reduced, false);
      assert.ok(frames.frames[0].top < 0, "Toast starts above the viewport");
      assert.ok(
        frames.frames[1].top > frames.frames[0].top,
        "Toast moves down",
      );
      assert.ok(
        frames.frames[2].top >= 16,
        "Toast settles inside the safe top margin",
      );
      await page.screenshot({ path: `${output}/toast-mobile.png` });
    }
    for (const width of [320, 390, 430, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await toast.boundingBox();
      assert.ok(
        bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
        `Toast fits ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.fastForward(3000);
    await restoreItem();
    await page.clock.fastForward(2200);
    await expect(toast).toHaveAttribute("data-state", "visible");
    // The first toast's timer must not remove its newer replacement.
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await page.clock.fastForward(600);
    await expect(toast).toHaveCount(0);
    await restoreItem();
    await page.clock.fastForward(5000);
    await page.clock.fastForward(600);
    await expect(toast).toHaveCount(0);
    assert.deepEqual(errors, []);
    results.push({
      reducedMotion,
      frames,
      widths: [320, 390, 430, 1024],
      manualDismiss: true,
      automaticDismiss: true,
      replacementTimerSafe: true,
      runtimeErrors: errors,
    });
    await context.close();
  }
  writeFileSync(
    `${output}/toast-report.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
