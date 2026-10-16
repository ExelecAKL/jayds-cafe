import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Route } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";

// Runs served application forms against unchanged SQL migrations in PGlite.
// No hosted business write escapes the parent browser's route isolation.
export async function completeAdminJourneys({ page, base, db, stockId, actor }: {
  page: Page; base: string; db: PGlite; stockId: string; actor: string;
}) {
  const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/admin-complete");
  mkdirSync(out, { recursive: true });
  const results: { feature: string; status: "PASS" | "FAIL"; detail: string }[] = [];
  const open = async (route: string) => {
    await page.goto(base + route);
    await expect(page.locator(".admin-shell")).toBeVisible();
  };
  const check = async (feature: string, work: () => Promise<void>) => {
    const start = Date.now();
    try { await work(); results.push({ feature, status: "PASS", detail: `Hosted/local UI with isolated SQL or explicit provider-response fixtures; ${Date.now() - start}ms` }); }
    catch (error) {
      results.push({ feature, status: "FAIL", detail: String(error).slice(0, 2400) });
      await page.screenshot({ path: path.join(out, `${results.length}-failure.png`), fullPage: true }).catch(() => {});
      // Recover through navigation so a failed assertion cannot hide later families.
      await open("/dashboard").catch(() => {});
    }
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, liveBusinessWrites: false, results }, null, 2));
    console.log(results.at(-1)?.status, feature);
  };
  const drawer = () => page.getByRole("dialog");
  const confirm = async (label: string) => {
    const modal = page.getByRole("alertdialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: label, exact: true }).click();
    await expect(modal).toHaveCount(0);
  };
  const fault = async (name: string, work: () => Promise<void>) => {
    const matcher = new RegExp("/rest/v1/(?:rpc/)?" + name + "(?:\\?|$)");
    let failed = false;
    const handler = async (route: Route) => {
      if (!failed && !["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        failed = true;
        await route.fulfill({ status: 503, json: { message: "Audit injected unavailable service", code: "P0001" } });
      } else await route.fallback();
    };
    await page.route(matcher, handler);
    try { await work(); assert.equal(failed, true, "Failure injection reached the intended write"); }
    finally { await page.unroute(matcher, handler); }
  };
  const scalar = async <T>(sql: string, values: unknown[] = []) => (await db.query<{ value: T }>(sql, values)).rows[0].value;
  let categoryId = "", productId = "", supplierId = "", purchaseId = "";

  await check("Categories: create with description, reject case-insensitive duplicate without extra row", async () => {
    await open("/categories");
    await page.getByPlaceholder("Category name").fill("Audit complete category");
    await page.getByPlaceholder("Description (optional)").fill("Positive CRUD audit category");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Audit complete category", { exact: true })).toBeVisible();
    categoryId = await scalar<string>("SELECT id value FROM categories WHERE name='Audit complete category'");
    await page.getByPlaceholder("Category name").fill("AUDIT COMPLETE CATEGORY");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator('[data-admin-toasts]').getByText('A category named "AUDIT COMPLETE CATEGORY" already exists.', { exact: true })).toBeVisible();
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM categories WHERE name ILIKE 'audit complete category'"), 1);
  });
  await check("Categories: rename + description, disable and re-enable persist after reload", async () => {
    assert.ok(categoryId);
    await open("/categories");
    await page.getByText("Audit complete category", { exact: true }).click();
    await page.getByRole("button", { name: "Edit Info", exact: true }).click();
    const modal = page.locator(".fixed.inset-0").filter({ has: page.getByRole("heading", { name: "Category Options", exact: true }) });
    await modal.locator("input").fill("Audit renamed category");
    await modal.locator("textarea").fill("Updated audit description");
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(modal.getByRole("heading", { name: "Audit renamed category" })).toBeVisible();
    await page.getByRole("button", { name: "✓ Active", exact: true }).click();
    await confirm("Hide category");
    await expect(page.getByRole("button", { name: "Enable Category" })).toBeVisible();
    assert.equal(await scalar<boolean>("SELECT is_active value FROM categories WHERE id=$1", [categoryId]), false);
    await page.getByRole("button", { name: "Enable Category" }).click();
    await confirm("Show category");
    await expect(page.getByRole("button", { name: "✓ Active", exact: true })).toBeVisible();
    await open("/categories");
    await expect(page.getByText("Audit renamed category", { exact: true })).toBeVisible();
    assert.equal(await scalar<string>("SELECT description value FROM categories WHERE id=$1", [categoryId]), "Updated audit description");
  });
  await check("Menu: create product with all four tabs, recipe multiplier, option and confirmation cancellation", async () => {
    assert.ok(categoryId);
    await open("/menu");
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    await drawer().getByLabel("Product name").fill("Audit complete drink");
    await drawer().getByLabel("Description").fill("Test product created through the UI");
    await drawer().getByLabel("Category").selectOption(categoryId);
    await drawer().getByLabel("Preparation time (minutes)").fill("5");
    await drawer().getByLabel("Product tags").fill("coffee, audit");
    await drawer().getByLabel("Featured product").check();
    await drawer().getByRole("button", { name: "Pricing & options", exact: true }).click();
    await drawer().getByLabel("Base price (PHP)").fill("99");
    await drawer().getByRole("button", { name: "Add option", exact: true }).click();
    await drawer().getByLabel("Option label").fill("Audit Large");
    await drawer().getByLabel("Additional price").fill("12");
    await drawer().getByLabel("Default").check();
    await drawer().getByRole("button", { name: "Stock requirements", exact: true }).click();
    await drawer().getByRole("button", { name: "Add stock requirement", exact: true }).click();
    await drawer().getByLabel("Stock item").selectOption(stockId);
    await drawer().getByLabel(/^Base quantity/).fill("2");
    await drawer().getByLabel("Audit Large multiplier").fill("1.5");
    await drawer().getByRole("button", { name: "Availability", exact: true }).click();
    await drawer().getByLabel("Manually enable ordering").check();
    await drawer().getByRole("button", { name: "Save product", exact: true }).click();
    await page.keyboard.press("Escape");
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM menu_items WHERE name='Audit complete drink'"), 0);
    await drawer().getByRole("button", { name: "Save product", exact: true }).click();
    await confirm("Save product");
    await expect(drawer()).toHaveCount(0);
    productId = await scalar<string>("SELECT id value FROM menu_items WHERE name='Audit complete drink'");
    assert.equal(await scalar<number>("SELECT price::float value FROM menu_items WHERE id=$1", [productId]), 99);
    assert.deepEqual(await scalar("SELECT jsonb_build_object('quantity',quantity_used,'multiplier',size_multipliers->'Audit Large') value FROM menu_item_ingredients WHERE menu_item_id=$1", [productId]), { quantity: 2, multiplier: 1.5 });
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM item_variants WHERE menu_item_id=$1 AND label='Audit Large'", [productId]), 1);
  });
  await check("Menu editor: copy option library once, add-on fields, duplicate recipe validation and saved option/multiplier persistence", async () => {
    assert.ok(productId);
    await open("/menu");
    await page.getByRole("row").filter({ hasText: "Audit complete drink" }).getByRole("button", { name: "Edit", exact: true }).click();
    await drawer().getByRole("button", { name: "Pricing & options", exact: true }).click();
    await drawer().getByLabel("Add existing option").selectOption({ label: "size · Large" });
    await drawer().getByLabel("Add existing option").selectOption({ label: "size · Large" });
    await expect(drawer().getByLabel(/^Option label(?:\s*(?:\*|\(optional\)))?$/, { exact: true })).toHaveCount(2);
    await drawer().getByRole("button", { name: "Add option", exact: true }).click();
    await drawer().getByLabel(/^Option group(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).last().selectOption("add_on");
    await drawer().getByLabel(/^Option label(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).last().fill("Audit extra");
    await drawer().getByLabel(/^Additional price(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).last().fill("2");
    await drawer().getByRole("button", { name: "Stock requirements", exact: true }).click();
    await drawer().getByLabel(/^Large multiplier(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill("2");
    await drawer().getByRole("button", { name: "Add stock requirement", exact: true }).click();
    await drawer().getByLabel("Stock item").last().selectOption(stockId);
    await drawer().getByRole("button", { name: "Save product", exact: true }).click();
    await expect(drawer().getByText("Combine duplicate stock requirements into one line.", { exact: true })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await drawer().getByRole("button", { name: "Remove requirement", exact: true }).last().click();
    await drawer().getByRole("button", { name: "Save product", exact: true }).click(); await confirm("Save product");
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM item_variants WHERE menu_item_id=$1", [productId]), 3);
    assert.equal(await scalar<number>("SELECT (size_multipliers->>'Large')::float value FROM menu_item_ingredients WHERE menu_item_id=$1", [productId]), 2);
  });
  await check("Menu: archive removes published catalog, restore preserves recipe/options and re-publishes", async () => {
    assert.ok(productId);
    await open("/menu");
    const row = page.getByRole("row").filter({ hasText: "Audit complete drink" });
    await row.getByRole("button", { name: "Archive", exact: true }).click();
    await drawer().getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT status value FROM menu_items WHERE id=$1", [productId]), "archived");
    const catalog = await scalar<{ menuItems: { id: string }[] }>("SELECT get_published_catalog() value");
    assert.equal(catalog.menuItems.some(item => item.id === productId), false);
    // The status selector is labelled Search/filter by the actual menu page.
    await page.getByLabel("Publication filter").selectOption("all");
    await row.getByRole("button", { name: "Restore", exact: true }).click();
    await drawer().getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT status value FROM menu_items WHERE id=$1", [productId]), "active");
    assert.equal((await scalar<{ menuItems: { id: string }[] }>("SELECT get_published_catalog() value")).menuItems.some(item => item.id === productId), true);
  });
  await check("Categories: positive permanent deletion keeps linked product and removes its category", async () => {
    assert.ok(categoryId && productId);
    // Match the shipped master schema instead of the smaller fixture's FK.
    await db.exec("ALTER TABLE menu_items DROP CONSTRAINT menu_items_category_id_fkey; ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE; ALTER TABLE item_variants DROP CONSTRAINT item_variants_menu_item_id_fkey; ALTER TABLE item_variants ADD CONSTRAINT item_variants_menu_item_id_fkey FOREIGN KEY(menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE; ALTER TABLE menu_item_ingredients DROP CONSTRAINT menu_item_ingredients_menu_item_id_fkey; ALTER TABLE menu_item_ingredients ADD CONSTRAINT menu_item_ingredients_menu_item_id_fkey FOREIGN KEY(menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;");
    await db.exec("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS target_tier text; ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loyalty_tier text DEFAULT 'Bronze';");
    await db.exec(readFileSync("supabase/migrations/20261013000100_category_preservation_voucher_tiers.sql", "utf8"));
    await open("/categories");
    await page.getByText("Audit renamed category", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await confirm("Delete category");
    await expect(page.getByRole("heading", { name: "Category Options" })).toHaveCount(0);
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM categories WHERE id=$1", [categoryId]), 0);
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM menu_items WHERE id=$1", [productId]), 1, "Deleting the category must preserve its linked product as promised");
    assert.equal(await scalar("SELECT category_id value FROM menu_items WHERE id=$1", [productId]), null);
  });
  await check("Option recipe editor: save replacement, size multiplier, injected failure/retry, remove mapping", async () => {
    await db.query("INSERT INTO item_variants(menu_item_id,variant_group,label) SELECT id,'milk_sub','Audit milk' FROM menu_items WHERE name='Spanish Latte'");
    await open("/inventory");
    await page.getByRole("tab", { name: "Recipes", exact: true }).click();
    await page.getByRole("button", { name: "Option requirements", exact: true }).click();
    await drawer().getByLabel("Customization").selectOption({ label: "milk sub · Audit milk" });
    await drawer().getByRole("button", { name: "Add requirement", exact: true }).click();
    await drawer().getByLabel("Stock item").selectOption(stockId);
    await drawer().getByLabel("Quantity per item").fill("3");
    await drawer().getByLabel(/^Replaces/).selectOption(stockId);
    await drawer().getByLabel(/^Large multiplier(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).fill("2");
    await fault("inv_save_variant_recipes", async () => {
      await drawer().getByRole("button", { name: "Save requirements", exact: true }).click();
      await expect(drawer().getByText("Audit injected unavailable service")).toBeVisible();
      await expect(drawer().getByLabel("Quantity per item")).toHaveValue("3");
    });
    await drawer().getByRole("button", { name: "Save requirements", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.deepEqual(await scalar("SELECT jsonb_build_object('quantity',quantity_used,'replacement',replaces_ingredient_id,'large',size_multipliers->'Large') value FROM variant_ingredients WHERE variant_label='Audit milk'"), { quantity: 3, replacement: stockId, large: 2 });
    await page.getByRole("button", { name: "Option requirements", exact: true }).click();
    await drawer().getByLabel("Customization").selectOption({ label: "milk sub · Audit milk" });
    await drawer().getByRole("button", { name: "Remove", exact: true }).click();
    await drawer().getByRole("button", { name: "Save requirements", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM variant_ingredients WHERE variant_label='Audit milk'"), 0);
  });
  await check("Supplier: all fields create, edit, deactivate/reactivate and server-error input retention", async () => {
    await open("/purchasing");
    await page.getByRole("button", { name: "Supplier", exact: true }).click();
    await drawer().getByLabel("Supplier name").fill("Audit full supplier");
    await drawer().getByLabel("Contact person").fill("Audit contact");
    await drawer().getByLabel("Email").fill("supplier@example.test");
    await drawer().getByLabel("Phone").fill("09123456789");
    await drawer().getByLabel("Default lead time (days)").fill("3");
    await drawer().getByLabel("Notes").fill("All-field supplier audit");
    await fault("suppliers", async () => {
      await drawer().getByRole("button", { name: "Save supplier", exact: true }).click();
      await expect(drawer().getByText("Audit injected unavailable service")).toBeVisible();
      await expect(drawer().getByLabel("Contact person")).toHaveValue("Audit contact");
    });
    await drawer().getByRole("button", { name: "Save supplier", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    supplierId = await scalar<string>("SELECT id value FROM suppliers WHERE name='Audit full supplier'");
    await page.getByRole("button", { name: "Suppliers", exact: true }).click();
    await page.getByRole("row").filter({ hasText: "Audit full supplier" }).getByRole("button", { name: "Edit", exact: true }).click();
    await drawer().getByLabel("Notes").fill("Edited supplier audit");
    await drawer().getByLabel("Active supplier").uncheck();
    await drawer().getByRole("button", { name: "Save supplier", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<boolean>("SELECT is_active value FROM suppliers WHERE id=$1", [supplierId]), false);
    await page.getByRole("row").filter({ hasText: "Audit full supplier" }).getByRole("button", { name: "Edit", exact: true }).click();
    await drawer().getByLabel("Active supplier").check();
    await drawer().getByRole("button", { name: "Save supplier", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT notes value FROM suppliers WHERE id=$1", [supplierId]), "Edited supplier audit");
  });
  await check("Purchase: positive create with pack conversion, retained failed save, edit and no premature stock movement", async () => {
    assert.ok(supplierId);
    await db.query("UPDATE ingredients SET pack_size=10 WHERE id=$1", [stockId]);
    const before = await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]);
    await open("/purchasing");
    await page.getByRole("button", { name: "Purchase draft", exact: true }).click();
    await drawer().getByLabel("Supplier").selectOption(supplierId);
    await drawer().getByLabel("Expected delivery").fill("2026-10-15");
    await drawer().getByRole("button", { name: "Add purchase item", exact: true }).click();
    await drawer().getByLabel("Stock item").selectOption(stockId);
    await drawer().getByLabel(/^Purchasing packs/).fill("2");
    await drawer().getByLabel("Cost per base unit (PHP)").fill("1.25");
    await drawer().getByLabel("Notes").fill("Audit new purchase");
    await fault("inv_save_po", async () => {
      await drawer().getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(drawer().getByText("Audit injected unavailable service")).toBeVisible();
      await expect(drawer().getByLabel(/^Purchasing packs/)).toHaveValue("2");
    });
    await drawer().getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    purchaseId = await scalar<string>("SELECT id value FROM purchase_orders WHERE notes='Audit new purchase'");
    assert.equal(await scalar<number>("SELECT quantity::float value FROM purchase_order_lines WHERE purchase_order_id=$1", [purchaseId]), 20);
    const number = await scalar<string>("SELECT number value FROM purchase_orders WHERE id=$1", [purchaseId]);
    await page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: "Edit draft", exact: true }).click();
    await drawer().getByLabel(/^Purchasing packs/).fill("3");
    await drawer().getByLabel("Notes").fill("Audit edited purchase");
    await drawer().getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<number>("SELECT quantity::float value FROM purchase_order_lines WHERE purchase_order_id=$1", [purchaseId]), 30);
    assert.equal(await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]), before);
  });
  await check("Purchase: positive cancellation, failed transition retention and final cancelled history", async () => {
    assert.ok(purchaseId);
    await open("/purchasing");
    const number = await scalar<string>("SELECT number value FROM purchase_orders WHERE id=$1", [purchaseId]);
    await page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: "Review", exact: true }).click();
    await drawer().getByRole("button", { name: "Cancel purchase", exact: true }).click();
    await fault("inv_po_transition", async () => {
      await drawer().getByRole("button", { name: "Confirm cancelled", exact: true }).click();
      await expect(drawer().getByText("Audit injected unavailable service")).toBeVisible();
      assert.equal(await scalar<string>("SELECT status value FROM purchase_orders WHERE id=$1", [purchaseId]), "draft");
    });
    await drawer().getByRole("button", { name: "Confirm cancelled", exact: true }).click();
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT status value FROM purchase_orders WHERE id=$1", [purchaseId]), "cancelled");
    await page.getByLabel("Order status").selectOption("cancelled");
    await expect(page.getByRole("row").filter({ hasText: number })).toBeVisible();
  });
  await check("Receiving: blank reference/over-receipt cannot post; failure/retry posts full receipt exactly once", async () => {
    assert.ok(supplierId);
    const po = await scalar<string>("SELECT inv_save_po(NULL,$1,inv_business_date()+1,'Audit receiving fixture',$2) value", [supplierId, JSON.stringify([{ ingredient_id: stockId, quantity: 10, unit_cost: 1 }])]);
    await db.query("SELECT inv_po_transition($1,'approved')", [po]);
    await db.query("SELECT inv_po_transition($1,'ordered')", [po]);
    const number = await scalar<string>("SELECT number value FROM purchase_orders WHERE id=$1", [po]);
    const before = await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]);
    await open("/purchasing");
    await page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: "Receive", exact: true }).click();
    await drawer().getByRole("button", { name: "Confirm physical receipt", exact: true }).click();
    await expect(drawer()).toBeVisible();
    assert.equal(await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]), before);
    await drawer().getByLabel("Delivery / invoice reference").fill("AUDIT-FULL-RECEIPT");
    await drawer().getByLabel(/^Actual quantity/).fill("11");
    await drawer().getByRole("button", { name: "Confirm physical receipt", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await drawer().getByLabel(/^Actual quantity/).fill("10");
    await drawer().getByLabel("Batch / lot").fill("AUDIT-BATCH");
    await fault("inv_receive_po", async () => {
      await drawer().getByRole("button", { name: "Confirm physical receipt", exact: true }).click();
      await confirm("Confirm goods received");
      await expect(drawer().getByText("Audit injected unavailable service")).toBeVisible();
      await expect(drawer().getByLabel(/^Actual quantity/)).toHaveValue("10");
      assert.equal(await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]), before);
    });
    await drawer().getByRole("button", { name: "Confirm physical receipt", exact: true }).click();
    await confirm("Confirm goods received");
    await expect(drawer()).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT status value FROM purchase_orders WHERE id=$1", [po]), "received");
    assert.equal(await scalar<number>("SELECT current_stock::float value FROM ingredients WHERE id=$1", [stockId]), before + 10);
    assert.equal(await scalar<number>("SELECT count(*)::integer value FROM goods_receipts WHERE purchase_order_id=$1", [po]), 1);
  });
  await check("Voucher edit: selected-item requirement, percentage cap/tier/date/uses, failed save retention and confirmed retry", async () => {
    await db.exec("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS code text, ADD COLUMN IF NOT EXISTS description text, ADD COLUMN IF NOT EXISTS target_tier text, ADD COLUMN IF NOT EXISTS frequency_limit integer, ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(); INSERT INTO vouchers(code,description,discount_type,discount_value) VALUES('AUDITEDIT','Audit edit voucher','fixed',10);");
    await open("/vouchers"); await page.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Edit Voucher", exact: true });
    await form.getByLabel("Voucher description").fill("Edited complete voucher");
    await form.getByLabel("Discount type").selectOption("percentage");
    await form.getByLabel("Discount value").fill("20");
    await form.getByLabel("Minimum order amount").fill("150");
    await form.getByLabel("Maximum uses").fill("2");
    await form.getByLabel("Target tier").selectOption("silver");
    await form.getByLabel("Valid until").fill("2026-12-31");
    await form.getByText("Product rules & discount limit",{exact:true}).click();
    await form.getByLabel("Application mode").selectOption("selected_items");
    await form.getByPlaceholder("e.g. 50 (Caps the percentage discount)").fill("25");
    await form.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Choose at least one");
    await form.getByLabel(/^Spanish Latte(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).check();
    await fault("vouchers", async () => {
      await form.getByRole("button", { name: "Save Changes", exact: true }).click(); await confirm("Save voucher changes");
      await expect(form.getByRole("alert")).toContainText("Could not update voucher");
      await expect(form.getByLabel("Discount value")).toHaveValue("20");
    });
    await form.getByRole("button", { name: "Save Changes", exact: true }).click(); await confirm("Save voucher changes");
    await expect(form).toHaveCount(0);
    const saved = await scalar<{ type: string; mode: string; tier: string; value: number; cap: number; uses: number; minimum: number }>("SELECT jsonb_build_object('type',discount_type,'mode',application_mode,'tier',target_tier,'value',discount_value,'cap',max_discount_amount,'uses',max_uses,'minimum',min_order_amount) value FROM vouchers WHERE code='AUDITEDIT'");
    assert.deepEqual(saved, { type: "percentage", mode: "selected_items", tier: "silver", value: 20, cap: 25, uses: 2, minimum: 150 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await form.getByLabel("Discount type").selectOption("fixed"); await form.getByLabel("Discount value").fill("30");
    await form.getByLabel("Application mode").selectOption("whole_order"); await form.getByLabel(/^Spanish Latte(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).uncheck();
    await form.getByRole("button", { name: "Save Changes", exact: true }).click(); await confirm("Save voucher changes"); await expect(form).toHaveCount(0);
    assert.equal(await scalar<string>("SELECT discount_type value FROM vouchers WHERE code='AUDITEDIT'"), "fixed");
  });
  await check("Scheduling: UI production gate rejects uncounted stock and retains verification record", async () => {
    await db.exec("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text,ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS phone text,ADD COLUMN IF NOT EXISTS avatar_url text,ADD COLUMN IF NOT EXISTS account_qr_hash text,ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(); ALTER TABLE orders ADD COLUMN IF NOT EXISTS maya_checkout_id text, ADD COLUMN IF NOT EXISTS maya_checkout_url text, ADD COLUMN IF NOT EXISTS maya_payment_id text; CREATE SEQUENCE IF NOT EXISTS order_number_seq;");
    // Earlier cashier fixtures introduce these projection-only columns. The
    // unchanged scheduling migration owns their real definitions/backfill.
    await db.exec("ALTER TABLE orders DROP COLUMN pickup_window_start, DROP COLUMN preparation_due_at;");
    for (const file of ["20261003000100_customer_security.sql", "20261003000200_customer_scheduling.sql"]) await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await open("/scheduling");
    await page.getByText(/Stock & recipe verification ·/).click();
    await page.getByLabel("Verification record").fill("Isolated audit physical counts and portions verification.");
    await page.getByRole("button", { name: "Record production verification" }).click();
    await expect(page.locator(".ops-feedback.error")).toContainText(/physical counts|stock|recipes/);
    await expect(page.getByLabel("Verification record")).toHaveValue("Isolated audit physical counts and portions verification.");
  });
  await check("Scheduling: counted fixture verification, seven days/hours/closures/capacities save, real SQL slots", async () => {
    const counts = (await db.query<{ id: string }>("INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason,actor_id) SELECT id,current_stock,current_stock,stock_version,'Isolated audit physical count',$1 FROM ingredients WHERE is_active RETURNING id", [actor])).rows;
    for (const row of counts) await db.query("SELECT inv_post_stocktake($1)", [row.id]);
    await open("/scheduling");
    await page.getByText(/Stock & recipe verification ·/).click();
    await page.getByLabel("Verification record").fill("Isolated audit physical counts and actual portions verification.");
    await page.getByRole("button", { name: "Record production verification" }).click();
    await expect(page.getByText("Actual stock and recipe verification is current.", { exact: true })).toBeVisible();
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) await page.getByLabel(day,{exact:true}).check();
    for (const input of await page.getByLabel("Opens").all()) await input.fill("00:00");
    for (const input of await page.getByLabel("Closes").all()) await input.fill("23:59");
    await page.getByLabel("Full-day closures").fill("2026-12-25\n2026-12-25");
    await page.getByLabel(/^Orders per 15-minute window/).fill("3");
    await page.getByLabel(/^Item units per 15-minute window/).fill("5");
    await page.getByLabel("Enable scheduled pickup").check();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await confirm("Save settings");
    await expect(page.locator('.ops-feedback.success').filter({ hasText: "Branch and pickup settings saved." })).toBeVisible();
    const settings = await scalar<{ settings: { regular_hours: unknown[]; closure_dates: string[]; scheduled_pickup_enabled: boolean }; production_ready: boolean }>("SELECT get_customer_scheduling_admin() value");
    assert.equal(settings.production_ready, true);
    assert.equal(settings.settings.regular_hours.length, 7);
    assert.deepEqual(settings.settings.closure_dates, ["2026-12-25"]);
    const slots = await scalar<{ enabled: boolean; slots: unknown[] }>("SELECT get_customer_pickup_slots((now() AT TIME ZONE 'Asia/Manila')::date+1) value");
    assert.equal(slots.enabled, true); assert.ok(slots.slots.length);
    await open("/scheduling");
    await expect(page.getByLabel("Enable scheduled pickup")).toBeChecked();
  });
  for (const provider of ["maya", "lalamove"]) await check(`Provider reconciliation UI: ${provider} blank gate, failed read retains ID, trimmed retry and verified association notice`, async () => {
    const attempt = { id: "90000000-0000-4000-8000-000000000001", order_id: "90000000-0000-4000-8000-000000000002", provider, state: "uncertain", request_key: "audit-existing-provider-reference" };
    const operations = /\/rest\/v1\/rpc\/get_customer_operations$/;
    const requests = /\/rest\/v1\/customer_support_cases(?:\?|$)/;
    const endpoint = base + "/api/customer-care/reconcile";
    let tries = 0;
    await page.route(operations, route => route.fulfill({ json: { attempts: [attempt], failed_push: 0 } }));
    await page.route(requests, route => route.fulfill({ json: [] }));
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.orderId, attempt.order_id); assert.equal(body.provider, provider); assert.equal(body.providerId, "audit-provider-id");
      tries++;
      await route.fulfill(tries === 1 ? { status: 409, json: { error: "Audit unmatched provider reference" } } : { json: { reconciled: true, paymentStatus: "PENDING_PAYMENT" } });
    });
    try {
      await open("/customer-care");
      await page.getByRole("button",{name:/Payments & delivery/}).click();
      const submit = page.getByRole("button", { name: "Review & associate existing reference", exact: true });
      await expect(submit).toBeDisabled();
      const input = page.getByLabel(provider === "maya" ? "Existing Maya checkout ID" : "Existing Lalamove order ID");
      await input.fill("  audit-provider-id  "); await submit.click();
      await expect(page.locator('.ops-feedback.error').getByText("Audit unmatched provider reference", { exact: true })).toBeVisible();
      await expect(page.locator('[data-admin-toasts]').getByText("Audit unmatched provider reference", { exact: true })).toBeVisible();
      await expect(input).toHaveValue("  audit-provider-id  ");
      await submit.click();
      await expect(page.locator('.ops-feedback.success').filter({ hasText: provider === "maya" ? /Existing Maya checkout associated/ : /Existing Lalamove order associated/ })).toBeVisible();
      assert.equal(tries, 2);
    } finally { await page.unroute(operations); await page.unroute(requests); await page.unroute(endpoint); }
  });
  await check("Order history details: all six order states, paid/failed/refunded, app/POS and pickup/delivery/legacy data render", async () => {
    const cases = [
      ["pending", "pending", "cash", "pickup", "app"], ["confirmed", "paid", "maya", "pickup", "app"],
      ["preparing", "paid", "maya", "delivery", "app"], ["ready", "pending", "cash", "pickup", "app"],
      ["completed", "paid", "cash", "takeaway", "pos"], ["cancelled", "refunded", "maya", "delivery", "app"],
      ["cancelled", "failed", "maya", "pickup", "app"], ["completed", "paid", "cash", "dine_in", "pos"],
    ];
    for (const [index, [status, payment, method, type, source]] of cases.entries()) {
      const number = "AUDIT-STATE-" + index;
      await db.query("INSERT INTO orders(order_number,status,payment_status,payment_method,order_type,order_source,total,subtotal,notes,staff_id) VALUES($1,$2,$3,$4,$5,$6,50,50,'Audit state details',$7)", [number, status, payment, method, type, source, source === "pos" ? actor : null]);
      await open("/orders");
      await page.getByPlaceholder("Search Order #...").fill(number);
      await page.getByRole("button", { name: number, exact: true }).click();
      const modal = page.locator(".fixed.inset-0").filter({ has: page.getByRole("heading", { name: "Order Details", exact: true }) });
      await expect(modal.getByRole("heading", { name: number, exact: true })).toBeVisible();
      await expect(modal.getByText(status, { exact: true }).first()).toBeVisible();
      await expect(modal.getByText(/Walk-in Customer/)).toBeVisible();
      await modal.getByRole("button", { name: "Reveal Data", exact: true }).click();
      await expect(modal.getByRole("button", { name: "Hide Data", exact: true })).toBeVisible();
      await modal.getByRole("button", { name: "Close dialog", exact: true }).click();
    }
  });
  await open("/orders");
  await page.getByPlaceholder("Search Order #...").fill("AUDIT-STATE-0");
  await page.getByRole("button", { name: "AUDIT-STATE-0", exact: true }).click();
  await check("Order Details: accessible labelled dialog semantics", async () => {
    await expect(page.getByRole("dialog", { name: "Order Details", exact: true })).toHaveCount(1);
  });
  // A previous failed assertion navigates to the dashboard; independently open
  // the modal again so keyboard dismissal is always actually tested.
  await open("/orders"); await page.getByPlaceholder("Search Order #...").fill("AUDIT-STATE-0");
  await page.getByRole("button", { name: "AUDIT-STATE-0", exact: true }).click();
  await check("Order Details: Escape dismissal", async () => {
    await page.keyboard.press("Escape"); await expect(page.getByRole("heading", { name: "Order Details", exact: true })).toHaveCount(0);
  });
  await check("Admin toasts: incomplete voucher form announces its first invalid field and preserves focus/input", async () => {
    await open('/vouchers');
    await page.getByRole('button', { name: '+ Create Voucher', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Create Voucher', exact: true });
    await form.getByRole('button', { name: 'Create Voucher', exact: true }).click();
    await expect(page.locator('[data-admin-toasts] .error')).toContainText('Voucher code:');
    await expect(form.getByLabel('Voucher code')).toHaveValue('');
    await expect(form.getByLabel('Voucher code')).toBeFocused();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });
  await check("Admin toasts: duplicate announcements collapse; focused toast pauses dismissal on a phone viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { for (let i=0;i<2;i++) window.dispatchEvent(new CustomEvent('jayds-admin-toast', { detail: { message: 'Audit toast saved.', tone: 'success' } })); });
    const toast = page.locator('[data-admin-toasts] .success').filter({ hasText: 'Audit toast saved.' });
    await expect(toast).toHaveCount(1);
    await toast.getByRole('button', { name: 'Dismiss notification' }).focus();
    await page.waitForTimeout(6500);
    await expect(toast).toBeVisible();
    const box = await toast.boundingBox(); assert.ok(box && box.x>=0 && box.x+box.width<=390);
    await page.screenshot({ path: path.join(out, 'admin-toast-phone.png'), fullPage: true });
    await toast.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(toast).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  return results;
}
