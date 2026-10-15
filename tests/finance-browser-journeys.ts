import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
export async function financeJourneys({
  page,
  base,
  customerBase,
  db,
  actor,
}: {
  page: Page;
  base: string;
  customerBase: string;
  db: PGlite;
  actor: string;
  item: string;
}) {
  await page.goto(base + "/finance");
  await expect(
    page.getByRole("heading", { name: "Sales, costs & invoices" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Invoice & tax setup" }).click();
  const setup = page.getByRole("dialog", { name: "Invoice & tax setup" });
  await setup.getByRole("button", { name: "Save setup" }).click();
  await expect(page.locator("[data-admin-toasts]")).toContainText(
    "Please fill out",
  );
  await setup
    .getByLabel("Registered taxpayer name")
    .fill("INVOICE BROWSER FIXTURE OWNER");
  await setup
    .getByLabel("Registered address")
    .fill("Local browser fixture address");
  await setup.getByLabel("TIN", { exact: false }).fill("000-000-000");
  await setup.getByLabel("Branch code").fill("00000");
  assert.equal(
    (await setup.locator('[data-field-requirement="required"]').count()) > 5,
    true,
  );
  await setup.getByRole("button", { name: "Save setup" }).click();
  await expect(setup).toBeHidden();
  await expect(page.locator("[data-admin-toasts]")).toContainText(
    "Saved successfully",
  );
  const baseline = (
    await db.query<{
      invoices: number;
      events: number;
      expenses: number;
      reversals: number;
    }>(
      "SELECT (SELECT count(*)::int FROM finance_invoices) invoices,(SELECT count(*)::int FROM financial_events) events,(SELECT count(*)::int FROM finance_expenses) expenses,(SELECT count(*)::int FROM finance_expense_reversals) reversals",
    )
  ).rows[0];
  // Dedicated product: earlier cashier journeys deliberately edit the shared menu.
  const invoiceItem = (
    await db.query<{ id: string }>(
      "INSERT INTO menu_items(name,price,recipe_required) VALUES('Invoice fixture coffee',145,true) RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO ingredients(name,current_stock,cost_per_unit) VALUES('Invoice fixture beans',0,2)",
    [],
  );
  await db.exec(
    "SELECT inv_post_movement(id,100,'receipt','Invoice browser fixture stock') FROM ingredients WHERE name='Invoice fixture beans'",
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) SELECT $1,id,2 FROM ingredients WHERE name='Invoice fixture beans'",
    [invoiceItem],
  );
  const { rows } = await db.query<{
    sale: { id: string; receipt: { receipt_token: string } };
  }>(
    "SELECT pos_cash_checkout($1,'invoice-browser-cash-sale-001','invoice-browser-cash-sale-001',200,145,$2,$3,NULL) sale",
    [
      actor,
      JSON.stringify({
        order_source: "pos",
        order_type: "pickup",
        payment_method: "cash",
        subtotal: 145,
        total: 145,
        discount: 0,
        points_redeemed: 0,
      }),
      JSON.stringify([
        {
          menu_item_id: invoiceItem,
          name: "Invoice fixture coffee",
          price: 145,
          subtotal: 145,
          quantity: 1,
          variants: [],
        },
      ]),
    ],
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  const invoiceNumber = (
    await db.query<{ number: string }>(
      "SELECT number FROM finance_invoices WHERE order_id=$1 AND kind='invoice'",
      [rows[0].sale.id],
    )
  ).rows[0].number;
  const invoiceRow = page.getByRole("row").filter({ hasText: invoiceNumber });
  await expect(invoiceRow).toBeVisible();
  await invoiceRow.getByRole("button", { name: "View / Print" }).click();
  const invoiceDocument = page.getByRole("article", { name: "Invoice" });
  await expect(invoiceDocument).toContainText("VAT (12%, included)");
  await expect(invoiceDocument).toContainText("₱145.00");
  await expect(invoiceDocument).toContainText(
    "System-generated invoice number",
  );
  mkdirSync(".codex-logs/invoice-audit", { recursive: true });
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("complementary", { name: "Admin navigation" }),
  ).toBeHidden();
  await expect(invoiceDocument).toBeVisible();
  const pdf = await page.pdf({
    path: ".codex-logs/invoice-audit/admin-invoice.pdf",
    format: "A4",
    printBackground: true,
  });
  assert.equal(
    pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length,
    1,
    "One-item invoice must not add a blank printed page",
  );
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: ".codex-logs/invoice-audit/admin-invoice.png",
    fullPage: true,
  });
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const expense = page.getByRole("dialog", { name: "Add operating expense" });
  await expense.getByLabel("Description").fill("Browser fixture utility bill");
  await expense.getByLabel("Total paid (PHP)").fill("112");
  await expense.getByLabel("Creditable input VAT (PHP)").fill("12");
  await expense
    .getByLabel("Supporting invoice/document reference")
    .fill("FIXTURE-001");
  await expense.getByLabel("I reviewed the supporting invoice").check();
  await expense.getByRole("button", { name: "Post expense" }).click();
  await expect(expense).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: "Browser fixture utility bill" }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Browser fixture utility bill" })
    .getByRole("button", { name: "Reverse" })
    .click();
  const reversal = page.getByRole("dialog", { name: "Reverse this expense?" });
  await reversal.getByLabel("Reason").fill("Fixture duplicate utility expense");
  await reversal.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(reversal).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: "Browser fixture utility bill" }),
  ).toContainText("Reversed");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Daily net product sales" }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      `Finance overflow at ${width}`,
    );
    await page.screenshot({
      path: `.codex-logs/invoice-audit/admin-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(
    customerBase + "/receipt/" + rows[0].sale.receipt.receipt_token,
  );
  await expect(page.locator(".startup-overlay")).toBeHidden({ timeout: 20000 });
  await expect(page.getByRole("article", { name: "Invoice" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Invoice" })).toContainText(
    "₱145.00",
  );
  await expect(
    page.getByText("Cash received: ₱200.00", { exact: false }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.screenshot({
    path: ".codex-logs/invoice-audit/customer-invoice-phone.png",
    fullPage: true,
  });
  const counts = (
    await db.query<{
      invoices: number;
      events: number;
      expenses: number;
      reversals: number;
    }>(
      "SELECT (SELECT count(*)::int FROM finance_invoices) invoices,(SELECT count(*)::int FROM financial_events) events,(SELECT count(*)::int FROM finance_expenses) expenses,(SELECT count(*)::int FROM finance_expense_reversals) reversals",
    )
  ).rows[0];
  assert.deepEqual(counts, {
    invoices: baseline.invoices + 1,
    events: baseline.events + 1,
    expenses: baseline.expenses + 1,
    reversals: baseline.reversals + 1,
  });
  writeFileSync(
    ".codex-logs/invoice-audit/browser-result.json",
    JSON.stringify(
      {
        status: "PASS",
        fixtureOnly: true,
        setupRequiredFeedback: true,
        setupSuccessToast: true,
        invoiceFromPosCash: true,
        customerInvoiceView: true,
        expensePostingAndReversal: true,
        viewports: [1440, 768, 390],
        counts,
      },
      null,
      2,
    ),
  );
  console.log(
    "Finance: setup/toasts, issued POS invoice, Customer phone invoice, expenses/reversals, and desktop/tablet/phone reports passed with isolated data.",
  );
}
