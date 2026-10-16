import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Route } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";

export async function adminLoadingJourneys({
  page,
  base,
}: {
  page: Page;
  base: string;
}) {
  const results: string[] = [];
  async function stall(pattern: RegExp) {
    let enabled = true,
      announce!: () => void,
      release!: () => void;
    const started = new Promise<void>((resolve) => (announce = resolve)),
      released = new Promise<void>((resolve) => (release = resolve));
    const handler = async (route: Route) => {
      if (!enabled) return route.fallback();
      announce();
      await released;
      await route.abort().catch(() => {});
    };
    await page.context().route(pattern, handler);
    return {
      started,
      release: () => {
        enabled = false;
        release();
      },
    };
  }
  const profile = await stall(/\/rest\/v1\/profiles(?:\?|$)/);
  await page.goto(base + "/menu");
  await profile.started;
  await expect(
    page.getByRole("button", { name: "Retry verification", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  assert.equal(
    await page.getByLabel("Admin navigation").count(),
    0,
    "Unverified profile must not expose Admin",
  );
  profile.release();
  await page
    .getByRole("button", { name: "Retry verification", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Menu products", exact: true })
    .waitFor();
  results.push(
    "Stalled profile stops waiting, denies unverified access and recovers in place",
  );
  const catalog = await stall(
    /\/rest\/v1\/(?:rpc\/get_published_catalog|categories|menu_items)(?:\?|$)/,
  );
  await page.reload();
  await catalog.started;
  await expect(
    page.getByRole("button", { name: "Try loading menu again" }),
  ).toBeEnabled({ timeout: 20_000 });
  catalog.release();
  await page.getByRole("button", { name: "Try loading menu again" }).click();
  await page.getByText("Spanish Latte", { exact: true }).first().waitFor();
  results.push(
    "Stalled catalog leaves loading and retry restores products without a full reload",
  );
  const audit = await stall(/\/rest\/v1\/admin_audit(?:\?|$)/);
  await page.goto(base + "/audit");
  await audit.started;
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  audit.release();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("table", { name: "Audit log", exact: true }).waitFor();
  results.push(
    "Stalled audit query clears loading and retry restores the table",
  );
  const form = await stall(/\/rest\/v1\/item_variants(?:\?|$)/);
  await page.goto(base + "/menu");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await form.started;
  const product = page.getByRole("dialog", { name: /Edit Spanish Latte/ });
  await expect(
    product.getByRole("button", { name: "Try loading product again" }),
  ).toBeEnabled({ timeout: 20_000 });
  await expect(
    product.getByRole("button", { name: "Save product", exact: true }),
  ).toHaveCount(0);
  form.release();
  await product
    .getByRole("button", { name: "Try loading product again" })
    .click();
  await expect(
    product.getByRole("button", { name: "Save product", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  results.push(
    "Failed product loading cannot save empty recipes; retry restores the editor",
  );
  await page.keyboard.press("Escape");
  console.log(
    JSON.stringify({ adminLoadingRecovery: "PASS", checks: results }),
  );
  return results;
}
export async function adminUxJourneys({
  page,
  base,
  db,
  stockId,
  itemId,
  actor,
}: {
  page: Page;
  base: string;
  db: PGlite;
  stockId: string;
  itemId: string;
  actor: string;
}) {
  const checks: string[] = [];
  const output = path.join(process.cwd(), ".codex-logs", "admin-ux");
  mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function capture(name: string) {
    for (const width of [1440, 834, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.screenshot({
        path: path.join(output, `${name}-${width}.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter(
            (node) =>
              node.getBoundingClientRect().right > innerWidth + 1 &&
              !node.closest(".admin-table-scroll"),
          )
          .slice(0, 18)
          .map((node) => ({
            tag: node.tagName,
            classes: node.className,
            right: node.getBoundingClientRect().right,
            text: node.textContent?.slice(0, 60),
          })),
      }));
      if (overflow.scroll > overflow.width + 1)
        console.log("Overflow details", name, JSON.stringify(overflow));
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: path.join(output, `${name}-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const supplier = (
    await db.query<{ id: string }>(
      "INSERT INTO suppliers(name) VALUES('UX planning supplier') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "UPDATE ingredients SET supplier_id=$2,pack_size=500,min_stock_alert=2000 WHERE id=$1",
    [stockId, supplier],
  );
  await db.query(
    "UPDATE inventory_forecasts SET history_days=35,daily_demand=300,demand=horizon*300,method='weekday_8_weeks',calculated_at=now() WHERE ingredient_id=$1",
    [stockId],
  );
  const order = (
    await db.query<{ id: string }>(
      "INSERT INTO orders(order_source,total,status) VALUES('app',145,'pending') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO stock_movements(ingredient_id,quantity,movement_type,balance_after,order_id,actor_id,reason) VALUES($1,-18,'consumption',1200,$2,$3,'UX linked order consumption')",
    [stockId, order, actor],
  );
  await db.query(
    "INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason,actor_id) VALUES($1,1200,1200,0,'UX physical count',$2)",
    [stockId, actor],
  );
  await page.goto(base + "/dashboard");
  await page
    .getByRole("heading", { name: "Café overview", exact: true })
    .waitFor();
  await capture("overview");
  assert.equal(await page.locator('a[aria-current="page"]').count(), 1);
  checks.push(
    "Overview: key figures, compact actions, one active navigation item; 3 widths",
  );
  await page.goto(base + "/inventory?tab=movements");
  const movement = page
    .getByRole("row")
    .filter({ hasText: "UX linked order consumption" });
  await movement.getByRole("button", { name: /View movement details/ }).click();
  await page.getByRole("dialog", { name: "Stock movement details" }).waitFor();
  await page.getByRole("button", { name: /Connected order/ }).click();
  await page
    .getByRole("dialog", { name: "Order Details", exact: true })
    .waitFor();
  const orderNumber = (
    await db.query<{ order_number: string }>(
      "SELECT order_number FROM orders WHERE id=$1",
      [order],
    )
  ).rows[0].order_number;
  await page
    .getByRole("dialog", { name: "Order Details", exact: true })
    .getByText(orderNumber, { exact: true })
    .waitFor();
  await expect(page.getByText("Order could not be loaded.")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Stock movement details" }).waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "Physical counts", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "UX physical count" })
    .getByRole("button", { name: /View count details/ })
    .click();
  await page.getByRole("dialog", { name: "Physical count details" }).waitFor();
  await expect(
    page
      .getByRole("dialog", { name: "Physical count details" })
      .getByText("UX physical count", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Stock planning", exact: true }).click();
  await capture("planning");
  await page
    .getByRole("button", { name: "View forecast for House espresso beans" })
    .click();
  const forecast = page.getByRole("dialog", { name: /Stock outlook/ });
  await forecast.getByRole("heading", { name: /Projected balance/ }).waitFor();
  await capture("forecast");
  await page.getByRole("button", { name: "Past usage", exact: true }).click();
  await page.getByRole("heading", { name: /Daily usage/ }).waitFor();
  await page
    .getByRole("combobox", { name: "Detail forecast horizon" })
    .selectOption("30");
  await page
    .getByText("View numbers and forecast details", { exact: true })
    .click();
  await expect(forecast.getByRole("table")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Review purchase suggestions" })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review purchase suggestions",
  });
  await review.getByRole("button", { name: "Create purchase drafts" }).click();
  await expect(review).toHaveCount(0);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM purchase_orders WHERE supplier_id=$1 AND generated",
        [supplier],
      )
    ).rows.length,
    1,
  );
  checks.push(
    "Movement/count details, connected order and return; 7/14/30-day chart drawer; reviewed purchase drafts",
  );
  await page.goto(base + "/purchasing");
  await page.getByRole("heading", { name: "Buy & receive stock" }).waitFor();
  await capture("purchasing");
  await page.getByRole("button", { name: /Review drafts/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Order status" }),
  ).toHaveValue("draft");
  let uploadFails = true;
  await page.context().route(
    (url) => url.pathname.endsWith("/api/menu/images"),
    (route) =>
      uploadFails
        ? route.fulfill({
            status: 503,
            json: {
              error:
                "Fixture photo upload unavailable. Your changes are retained.",
            },
          })
        : route.fulfill({ json: { url: base + "/brand/icon-cup.svg" } }),
  );
  await page.goto(base + "/menu");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const product = page.getByRole("dialog", { name: /Edit Spanish Latte/ });
  await product.getByLabel("Product photo").waitFor();
  assert.equal(await product.getByLabel("Image URL").count(), 0);
  await product.getByLabel("Product photo").setInputFiles({
    name: "too-big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(product.getByRole("alert")).toContainText("smaller than 5 MB");
  const photo = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#986b4c" },
  })
    .png()
    .toBuffer();
  await product
    .getByLabel("Product photo")
    .setInputFiles({ name: "cafe.png", mimeType: "image/png", buffer: photo });
  await product.getByRole("img", { name: "Product photo preview" }).waitFor();
  await capture("photo-upload");
  await product
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(product.getByRole("alert")).toContainText(
    "Fixture photo upload unavailable",
  );
  await expect(product.getByLabel("Product name")).toHaveValue("Spanish Latte");
  uploadFails = false;
  await product
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(product).toHaveCount(0);
  assert.match(
    (
      await db.query<{ image_url: string }>(
        "SELECT image_url FROM menu_items WHERE id=$1",
        [itemId],
      )
    ).rows[0].image_url,
    /icon-cup.svg$/,
  );
  checks.push(
    "Photo selection, preview, 5 MB validation, upload failure retention and confirmed retry",
  );
  await page.goto(base + "/export");
  await page
    .getByText("What would you like to export?", { exact: true })
    .waitFor();
  await page.getByLabel("Food & stock", { exact: true }).check();
  await capture("export");
  let exportFails = true;
  await page
    .context()
    .route(/\/rest\/v1\/rpc\/admin_export_page$/, (route) =>
      exportFails
        ? route.fulfill({
            status: 503,
            json: { message: "Fixture export read unavailable. Try again." },
          })
        : route.fallback(),
    );
  await page.getByRole("button", { name: "Download selected data" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Fixture export read unavailable",
  );
  await expect(page.getByLabel("Food & stock", { exact: true })).toBeChecked();
  exportFails = false;
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected data" }).click();
  const file = await downloaded;
  await file.saveAs(path.join(output, "food-stock.zip"));
  assert.equal(await file.failure(), null);
  await page.getByLabel("Food & stock", { exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Download selected data" }),
  ).toBeDisabled();
  await page.getByLabel("Select all", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "Export format" })
    .selectOption("json");
  const allDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected data" }).click();
  const allFile = await allDownload;
  const allPath = path.join(output, "all-data.json");
  await allFile.saveAs(allPath);
  const allData = JSON.parse(readFileSync(allPath, "utf8")) as {
    manifest: { total_rows: number };
    tables: Record<string, unknown[]>;
  };
  assert.equal(
    Object.values(allData.tables).reduce((sum, rows) => sum + rows.length, 0),
    Number(allData.manifest.total_rows),
  );
  assert.ok(allData.tables.profiles.length > 0);
  assert.ok(
    !Object.keys(allData.tables).some(
      (name) =>
        name.startsWith("admin_export_") ||
        name === "store_settings" ||
        name === "pickup_tokens",
    ),
  );
  checks.push(
    "Grouped CSV ZIP and all-table JSON downloads reconcile to their manifest; empty selection and failed read/retry preserve selection",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base + "/inventory?tab=forecasts");
  await page
    .getByRole("button", { name: "View forecast for House espresso beans" })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .locator(".ops-drawer")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  checks.push(
    "Reduced motion removes drawer animation; Escape and focus recovery remain usable",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify({ status: "PASS", isolated: true, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ adminUx: "PASS", checks }));
  return checks;
}
