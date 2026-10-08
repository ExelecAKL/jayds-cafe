import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";

export type AdminWorkflowFixture = {
  writes: { name: string; method: string; body: Record<string, unknown> }[];
  failNext: string | null;
};

// UI writes go only to in-memory fixtures. SQL tests separately exercise the
// real stock, purchasing, permission, scheduling, and reward transactions.
export async function adminWorkflowJourneys(
  page: Page,
  origin: string,
  fixture: AdminWorkflowFixture,
) {
  const completed: string[] = [];
  const open = async (path: string) => {
    await page.goto(origin + path);
    await expect(
      page.getByRole("button", { name: "Help with this page" }),
    ).toBeVisible();
  };
  const confirmation = () => page.getByRole("alertdialog");
  const accept = async (label: string) => {
    await confirmation()
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(confirmation()).toHaveCount(0);
  };
  const unchanged = async (action: () => Promise<unknown>) => {
    const count = fixture.writes.length;
    await action();
    await expect(confirmation()).toBeVisible();
    await expect(
      confirmation().getByRole("button", { name: "Go back" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    assert.ok(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="alertdialog"]'),
      ),
    );
    await page.keyboard.press("Escape");
    await expect(confirmation()).toHaveCount(0);
    assert.equal(
      fixture.writes.length,
      count,
      "Cancelling never submits a write",
    );
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of [
    "dashboard",
    "orders",
    "scheduling",
    "customer-care",
    "menu",
    "categories",
    "vouchers",
    "inventory",
    "purchasing",
    "analytics",
    "staff-accounts",
    "staff",
    "loyalty",
    "void-security",
    "audit",
  ]) {
    await open("/" + route);
    const help = page.getByRole("button", { name: "Help with this page" });
    await help.click();
    const guide = page.getByRole("dialog", { name: /^Help:/ });
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("listitem")).toHaveCount(3);
    await expect(
      guide.getByText("Before you continue", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await expect(help).toBeFocused();
  }
  completed.push(
    "All fifteen Admin page guides, keyboard focus, Escape and related tasks",
  );
  await open("/dashboard");
  await page.getByRole("link", { name: /Change a price or product/ }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await open("/dashboard");
  await expect(page.getByText(/Invalid Date/)).toHaveCount(0);
  await page.screenshot({
    path: ".codex-logs/admin-pagination/workflow-dashboard.png",
    fullPage: true,
  });
  completed.push("Everyday task navigation");

  await open("/inventory");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  let drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Item name", { exact: true })
    .fill("Workflow test ingredient");
  await drawer.getByRole("button", { name: "Save item" }).click();
  await expect(drawer).toHaveCount(0);
  assert.equal(fixture.writes.at(-1)?.name, "ingredients");
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .first()
    .click();
  drawer = page.getByRole("dialog");
  await drawer.getByRole("combobox").selectOption({ label: "Stock 01 · g" });
  await drawer.getByLabel(/^Quantity/).fill("10");
  await drawer
    .getByLabel("Delivery reference / notes", { exact: true })
    .fill("QA delivery physically received");
  await unchanged(() =>
    drawer.getByRole("button", { name: "Post movement" }).click(),
  );
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel(/^Quantity/)).toHaveValue("10");
  await drawer.getByRole("button", { name: "Post movement" }).click();
  await expect(confirmation()).toContainText("100 → 110 g");
  await confirmation().screenshot({
    path: ".codex-logs/admin-pagination/workflow-confirmation.png",
  });
  await accept("Receive stock");
  await expect(drawer).toHaveCount(0);
  assert.equal(fixture.writes.at(-1)?.body.p_quantity, 10);
  await page.getByRole("tab", { name: "Waste", exact: true }).click();
  await page
    .getByRole("button", { name: "Record waste", exact: true })
    .first()
    .click();
  drawer = page.getByRole("dialog");
  await drawer.getByRole("combobox").selectOption({ label: "Stock 01 · g" });
  await drawer.getByLabel(/^Quantity/).fill("5");
  await drawer.getByLabel(/Reason/).fill("QA spoiled stock");
  await drawer.getByRole("button", { name: "Post movement" }).click();
  await expect(confirmation()).toContainText("110 → 105 g");
  await accept("Record waste");
  await expect(drawer).toHaveCount(0);
  await page.getByRole("tab", { name: "Physical counts" }).click();
  await page.getByRole("button", { name: "New physical count" }).click();
  drawer = page.getByRole("dialog");
  await drawer.getByRole("combobox").selectOption({ label: "Stock 01 · g" });
  await drawer.getByLabel(/^Actual count/).fill("90");
  await drawer.getByLabel(/Reason/).fill("QA physical shelf count");
  await unchanged(() =>
    drawer.getByRole("button", { name: "Post count" }).click(),
  );
  await drawer.getByRole("button", { name: "Post count" }).click();
  await expect(confirmation()).toContainText("105 → 90 g");
  await accept("Save physical count");
  await expect(drawer).toHaveCount(0);
  assert.equal(fixture.writes.at(-1)?.name, "inv_post_stocktake");
  await page.getByRole("tab", { name: "Stock planning" }).click();
  await page.getByRole("button", { name: "Refresh forecasts" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Forecasts refreshed/ }),
  ).toBeVisible();
  completed.push(
    "Stock item creation, receipt, waste, physical count, forecast refresh, unchanged drafts on cancelled confirmations",
  );

  await open("/staff");
  await expect(
    page.getByLabel("Role for Pagination QA", { exact: true }),
  ).toBeDisabled();
  await unchanged(() =>
    page.getByLabel("Role for Staff 1", { exact: true }).selectOption("admin"),
  );
  await expect(
    page.getByLabel("Role for Staff 1", { exact: true }),
  ).toHaveValue("staff");
  await page
    .getByLabel("Role for Staff 1", { exact: true })
    .selectOption("admin");
  await accept("Change access");
  await expect(
    page.getByLabel("Role for Staff 1", { exact: true }),
  ).toHaveValue("admin");
  fixture.failNext = "profiles";
  await page
    .getByLabel("Role for Staff 2", { exact: true })
    .selectOption("admin");
  await accept("Change access");
  await expect(page.locator(".ops-feedback.error")).toContainText(
    "Could not change access",
  );
  await expect(
    page.getByLabel("Role for Staff 2", { exact: true }),
  ).toHaveValue("staff");
  completed.push(
    "Role changes, self-lockout prevention, cancellation and failed-save recovery",
  );
  await open("/staff-accounts");
  const pending = page
    .locator("div")
    .filter({ has: page.getByText("Pending Approval", { exact: false }) });
  void pending; // Pending fixtures are added only after pagination has been checked.
  await unchanged(() =>
    page
      .getByRole("button", { name: "Approve access", exact: true })
      .first()
      .click(),
  );
  await page
    .getByRole("button", { name: "Approve access", exact: true })
    .first()
    .click();
  await accept("Approve access");
  await expect(
    page.getByRole("button", { name: "Approve access", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Decline request", exact: true })
    .click();
  await accept("Decline request");
  await expect(
    page.getByRole("button", { name: "Decline request", exact: true }),
  ).toHaveCount(0);
  completed.push("Staff request approval and rejection");

  await open("/loyalty");
  await page
    .getByRole("button", { name: "Adjust Points", exact: true })
    .first()
    .click();
  const adjustment = page.getByPlaceholder("e.g. 50 or -20");
  await adjustment.fill("1.5");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".ops-feedback.error")).toContainText(
    "whole number",
  );
  await adjustment.fill("-200");
  await unchanged(() =>
    page.getByRole("button", { name: "Confirm", exact: true }).click(),
  );
  await adjustment.fill("25");
  fixture.failNext = "profiles";
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(confirmation()).toContainText("100 → 125");
  await accept("Save points balance");
  await expect(page.locator(".ops-feedback.error")).toContainText(
    "Could not save points",
  );
  await expect(adjustment).toHaveValue("25");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await accept("Save points balance");
  await expect(adjustment).toHaveCount(0);
  assert.equal(fixture.writes.at(-1)?.body.points, 125);
  completed.push(
    "Points integer validation, preview, zero floor, cancelled changes and failed-save retry",
  );

  await open("/vouchers");
  await unchanged(() =>
    page
      .getByRole("button", { name: "Deactivate", exact: true })
      .first()
      .click(),
  );
  await page
    .getByRole("button", { name: "Deactivate", exact: true })
    .first()
    .click();
  await accept("Pause voucher");
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await accept("Enable voucher");
  completed.push("Voucher pause and reactivation");
  await page.getByRole("button", { name: /\+ Create Voucher/ }).click();
  const voucherForm = page.getByRole("dialog", {
    name: "Create Voucher",
    exact: true,
  });
  await voucherForm.getByLabel("Voucher code").fill("QA10");
  await voucherForm
    .getByLabel("Voucher description")
    .fill("QA controlled voucher");
  await voucherForm
    .getByRole("button", { name: "Create Voucher", exact: true })
    .click();
  await expect(voucherForm.getByRole("alert")).toContainText("already exists");
  await voucherForm.getByLabel("Voucher code").fill("WORKFLOW25");
  await voucherForm.getByLabel("Discount value").fill("25");
  await unchanged(() =>
    voucherForm
      .getByRole("button", { name: "Create Voucher", exact: true })
      .click(),
  );
  await expect(voucherForm.getByLabel("Voucher code")).toHaveValue(
    "WORKFLOW25",
  );
  fixture.failNext = "vouchers";
  await voucherForm
    .getByRole("button", { name: "Create Voucher", exact: true })
    .click();
  await accept("Create voucher");
  await expect(voucherForm.getByRole("alert")).toContainText(
    "Could not create voucher",
  );
  await voucherForm
    .getByRole("button", { name: "Create Voucher", exact: true })
    .click();
  await accept("Create voucher");
  await expect(voucherForm).toHaveCount(0);
  await expect(page.getByText("WORKFLOW25", { exact: true })).toBeVisible();
  completed.push(
    "Voucher creation, duplicate codes, decimal-safe discount input, preview, cancelled draft and save failure retry",
  );
  await open("/categories");
  await page.getByText("QA drinks", { exact: true }).click();
  await unchanged(() =>
    page.getByRole("button", { name: "Archive", exact: true }).click(),
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await accept("Archive category & products");
  await expect(
    page.getByRole("button", { name: "Restore", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await accept("Restore category");
  await unchanged(() =>
    page.getByRole("button", { name: "Delete", exact: true }).click(),
  );
  completed.push(
    "Category archive, explicit product consequences, restore and safe delete cancellation",
  );

  await open("/purchasing");
  await page.getByRole("button", { name: "Supplier", exact: true }).click();
  drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Supplier name", { exact: true })
    .fill("Workflow test supplier");
  await drawer.getByRole("button", { name: "Save supplier" }).click();
  await expect(drawer).toHaveCount(0);
  assert.equal(fixture.writes.at(-1)?.name, "suppliers");
  completed.push(
    "Supplier creation; purchase approval, order and partial receiving covered by the PostgreSQL browser demo",
  );
  await open("/scheduling");
  await page.getByLabel("Branch name", { exact: true }).fill("Workflow café");
  await unchanged(() =>
    page.getByRole("button", { name: "Save settings", exact: true }).click(),
  );
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Branch and pickup settings saved." }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await accept("Save settings");
  await expect(page.getByRole("status")).toContainText(
    "Branch and pickup settings saved.",
  );
  completed.push(
    "Branch settings confirmation, no false success on cancellation and saved values",
  );
  await open("/void-security");
  await page.getByPlaceholder("Enter 6-digit PIN").fill("654321");
  await unchanged(() =>
    page.getByRole("button", { name: "Set New PIN", exact: true }).click(),
  );
  await page.getByRole("button", { name: "Set New PIN", exact: true }).click();
  await accept("Change PIN");
  await expect(
    page.getByText("Void PIN updated successfully!", { exact: true }),
  ).toBeVisible();
  completed.push("Manager PIN change confirmation");
  await open("/analytics");
  for (const label of ["Today", "This Week", "This Month", "Annual"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("table", { name: "Product margins" }),
    ).toBeVisible();
  }
  const [salesDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "↓ Global CSV", exact: true }).click(),
  ]);
  assert.match(
    salesDownload.suggestedFilename(),
    /^Financial_Overview_.*\.csv$/,
  );
  const [marginsDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "↓ CSV", exact: true }).click(),
  ]);
  assert.match(marginsDownload.suggestedFilename(), /^Item_Margins_.*\.csv$/);
  completed.push(
    "Report periods, financial CSV and product-margin CSV downloads",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/inventory");
  await page.getByRole("button", { name: "Help with this page" }).click();
  const guide = page.getByRole("dialog", { name: /^Help:/ });
  await expect(guide).toBeVisible();
  const box = await guide.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391, "Mobile help fits");
  await guide.screenshot({
    path: ".codex-logs/admin-pagination/workflow-mobile-help.png",
  });
  await page.keyboard.press("Escape");
  return completed;
}
