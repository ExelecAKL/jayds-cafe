import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";

export async function adminSalesJourneys({
  page,
  base,
  db,
  itemId,
}: {
  page: Page;
  base: string;
  db: PGlite;
  itemId: string;
}) {
  const output = path.join(process.cwd(), ".codex-logs", "sales-reports");
  mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await db.query(
    "WITH history AS (INSERT INTO orders(order_source,status,payment_status,total,created_at) SELECT 'app','completed','paid',132,'2026-01-01T05:00:00Z' FROM generate_series(1,1205) RETURNING id) INSERT INTO order_items(order_id,menu_item_id,name,quantity,price,subtotal,variants) SELECT id,$1,'Spanish Latte (Regular)',1,132,132,'[{\"variant_group\":\"add_on\",\"label\":\"Extra Shot\"}]' FROM history",
    [itemId],
  );
  await db.query(
    "WITH edge AS(INSERT INTO orders(order_source,status,payment_status,total,created_at) VALUES('app','completed','paid',112,'2025-12-31T16:00:00Z') RETURNING id) INSERT INTO order_items(order_id,menu_item_id,name,quantity,price,subtotal,variants) SELECT id,$1,'Spanish Latte',1,112,112,'[]' FROM edge",
    [itemId],
  );
  await db.exec(
    "INSERT INTO orders(order_source,status,payment_status,total,created_at) VALUES('app','completed','paid',500,'2025-12-31T04:00:00Z'),('app','cancelled','paid',999,'2026-01-01T05:00:00Z'),('app','completed','pending',999,'2026-01-01T05:00:00Z');",
  );
  let reportFails = true,
    itemFails = true,
    holdWeek = false,
    releaseWeek!: () => void,
    announceWeek!: () => void;
  const held = new Promise<void>((resolve) => (releaseWeek = resolve)),
    started = new Promise<void>((resolve) => (announceWeek = resolve));
  await page
    .context()
    .route(/\/rest\/v1\/rpc\/admin_sales_report$/, async (route) => {
      if (reportFails)
        return route.fulfill({
          status: 503,
          json: { message: "Fixture report outage" },
        });
      const body = route.request().postDataJSON();
      const data = (
        await db.query<{ result: unknown }>(
          "SELECT admin_sales_report($1,$2) result",
          [body.p_period, "2026-01-01T05:30:00Z"],
        )
      ).rows[0].result;
      if (holdWeek && body.p_period === "week") {
        announceWeek();
        await held;
      }
      await route.fulfill({ json: data });
    });
  await page.context().route(/\/rest\/v1\/rpc\/admin_sales_item$/, (route) =>
    itemFails
      ? route.fulfill({
          status: 503,
          json: { message: "Fixture detail outage" },
        })
      : route.fallback(),
  );
  await page.goto(base + "/analytics");
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert.equal(
    await page.getByText("Sales collected", { exact: true }).count(),
    0,
    "An unavailable report must not show zero as a successful result",
  );
  reportFails = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("₱159,172.00", { exact: true }).waitFor();
  const best = page.getByRole("table", { name: "Best sellers", exact: true });
  await expect(best).toContainText("1206");
  await page.getByText("View sales table", { exact: true }).click();
  await page.getByRole("cell", { name: "00:00", exact: true }).waitFor();
  await page.getByRole("cell", { name: "13:00", exact: true }).waitFor();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: path.join(output, `reports-${width}.png`),
      fullPage: true,
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      console.log(
        "Report overflow:",
        await page.evaluate(() =>
          Array.from(document.querySelectorAll("main *"))
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              left: el.getBoundingClientRect().left,
              right: el.getBoundingClientRect().right,
            }))
            .filter((x) => x.right > innerWidth + 1)
            .slice(0, 12),
        ),
      );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Sales reports overflow at ${width}`,
    );
    await page.screenshot({
      path: path.join(output, `reports-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await best
    .getByRole("button", { name: "Spanish Latte", exact: true })
    .click();
  const product = page.getByRole("dialog", {
    name: "Product sales: Spanish Latte",
    exact: true,
  });
  await expect(product.getByRole("alert")).toContainText("could not load");
  itemFails = false;
  await product.getByRole("button", { name: "Try again", exact: true }).click();
  await product.getByText("1206", { exact: true }).waitFor();
  await product.getByText("1205", { exact: true }).first().waitFor();
  await product.getByText("Extra Shot", { exact: true }).waitFor();
  await product.getByText("View hourly numbers", { exact: true }).click();
  await product.getByRole("cell", { name: "13:00", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: path.join(output, "product-sales-390.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const hour = page.getByRole("button", {
    name: "Thu 13:00 · 1205 paid orders",
    exact: true,
  });
  await hour.focus();
  await page.keyboard.press("Enter");
  const traffic = page.getByRole("dialog", {
    name: "Orders by hour",
    exact: true,
  });
  await traffic.getByText("1205", { exact: true }).first().waitFor();
  await expect(traffic.locator("#traffic-orders > div")).toHaveCount(10);
  const first = await traffic
    .locator("#traffic-orders > div")
    .first()
    .textContent();
  await traffic.getByRole("button", { name: "Next", exact: true }).click();
  await traffic.getByText("Page 2 of 121", { exact: true }).waitFor();
  assert.notEqual(
    await traffic.locator("#traffic-orders > div").first().textContent(),
    first,
  );
  await page.keyboard.press("Escape");
  const pricing = page.getByRole("table", {
    name: "Product margins",
    exact: true,
  });
  await pricing
    .getByRole("button", { name: "Spanish Latte", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Recipe cost estimate", exact: true })
    .waitFor();
  const recipeDialog=page.getByRole('dialog',{name:'Recipe cost estimate',exact:true});
  await recipeDialog.getByText("Price remainder", { exact: false }).first().waitFor();
  await recipeDialog.getByText('₱18.00',{exact:true}).first().waitFor();
  await page.keyboard.press("Escape");
  holdWeek = true;
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "This year", exact: true }).click();
  await page.getByText("₱159,172.00", { exact: true }).waitFor();
  releaseWeek();
  await expect(
    page.getByRole("button", { name: "This year", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("₱159,172.00", { exact: true })).toBeVisible();
  reportFails = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.locator("main").getByRole("alert").waitFor();
  await expect(page.getByText("₱159,172.00", { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  const result = {
    status: "PASS",
    isolated: true,
    browserTimezone: await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    orders: 1206,
    noTruncation: true,
    philippineMidnight: true,
    thirteenToTwentyTwoHours: true,
    reportFailureRetry: true,
    detailFailureRetry: true,
    productAddons: true,
    tenOrderPagination: true,
    staleResponseIgnored: true,
    widths: [1440, 834, 390],
    errors,
  };
  writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
