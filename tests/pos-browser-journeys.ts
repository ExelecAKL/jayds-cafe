import assert from "node:assert/strict";
import path from "node:path";
import type { Page, BrowserContext } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
export async function cashierJourneys({
  db,
  page,
  context,
  base,
  itemId,
  stockId,
  actor,
  output,
  publishCatalog,
  publishOrders,
  holdAvailabilityRefresh,
  loseResponse,
  loseParkResponse,
}: {
  db: PGlite;
  page: Page;
  context: BrowserContext;
  base: string;
  itemId: string;
  stockId: string;
  actor: string;
  output: string;
  publishCatalog: () => void;
  publishOrders: () => void;
  holdAvailabilityRefresh: () => {
    started: Promise<void>;
    release: () => void;
  };
  loseResponse: () => void;
  loseParkResponse: () => void;
}) {
  await db.query(
    "SELECT inv_post_movement($1,20000,'receipt','Cashier visual fixture')",
    [stockId],
  );
  await db.query(
    "UPDATE item_variants SET label=CASE label WHEN 'Regular' THEN '12oz' WHEN 'Large' THEN '16oz' ELSE label END WHERE menu_item_id=$1",
    [itemId],
  );
  await db.query(
    "UPDATE menu_item_ingredients SET size_multipliers='{\"16oz\":1.5}' WHERE menu_item_id=$1",
    [itemId],
  );
  await db.query(
    "INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier,is_default) VALUES($1,'temperature','Hot',0,true),($1,'temperature','Iced',0,false),($1,'sugar_level','100%',0,true),($1,'sugar_level','50%',0,false),($1,'milk_sub','Whole milk',0,true),($1,'milk_sub','Oat milk',15,false)",
    [itemId],
  );
  for (let i = 1; i <= 8; i++)
    await db.query(
      "INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier,sort_order) VALUES($1,'add_on',$2,5,$3)",
      [itemId, "Extra " + i, i],
    );
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#e9d5b9"/><ellipse cx="200" cy="215" rx="68" ry="12" fill="#baa084"/><path d="M155 70h90l-10 140h-70z" fill="#b27c52"/><path d="M151 70h98v15h-98z" fill="#f7ecdc"/><text x="200" y="150" font-size="32" font-family="serif" fill="#f7ecdc" text-anchor="middle">J</text></svg>',
    );
  await db.query("UPDATE menu_items SET image_url=$1 WHERE id=$2", [
    image,
    itemId,
  ]);
  const categories = (
    await db.query<{ id: string }>(
      "SELECT id FROM categories ORDER BY sort_order",
    )
  ).rows;
  for (let i = 1; i < 12; i++)
    categories.push(
      (
        await db.query<{ id: string }>(
          "INSERT INTO categories(name,sort_order) VALUES($1,$2) RETURNING id",
          ["Category " + i, i],
        )
      ).rows[0],
    );
  for (let i = 1; i <= 54; i++) {
    const id = (
      await db.query<{ id: string }>(
        "INSERT INTO menu_items(name,price,category_id,image_url,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [
          "Café selection " + String(i).padStart(2, "0"),
          90 + i,
          categories[i % 12].id,
          image,
          i,
        ],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,1)",
      [id, stockId],
    );
  }
  publishCatalog();
  await page.goto(base + "/new-order");
  const add = page.getByRole("button", { name: /^Add Spanish Latte/ });
  await add.waitFor();
  for (const [width, height, label] of [
    [1366, 768, "desktop"],
    [1024, 768, "tablet"],
    [1920, 1080, "large"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= window.innerHeight + 1 &&
          document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Register must fit " + label,
    );
    const pay = await page
      .getByRole("button", { name: /^Pay ·/ })
      .boundingBox();
    assert.ok(
      pay && pay.y + pay.height <= height,
      "Pay stays visible " + label,
    );
    for (const target of await page
      .locator(".product-main,.product-options,.catalog-pagination button")
      .all()) {
      const bounds = await target.boundingBox();
      assert.ok(bounds && bounds.height >= 48, "48px touch target");
    }
    await page.screenshot({
      path: path.join(output, "pos-register-" + label + ".png"),
    });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const first = await page.locator(".product-name").first().textContent();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.notEqual(
    await page.locator(".product-name").first().textContent(),
    first,
  );
  await page.getByLabel("Search products").fill("Spanish");
  assert.equal(await page.locator(".product-card").count(), 1);
  await page.getByLabel("Search products").fill("");
  assert.equal(
    await page.locator(".product-name").first().textContent(),
    first,
  );
  await add.click();
  await page.waitForFunction(
    () => document.querySelector(".quantity-control span")?.textContent === "1",
  );
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "Default product adds in one tap",
  );
  await add.click();
  await page.waitForFunction(
    () => document.querySelector(".quantity-control span")?.textContent === "2",
  );
  assert.equal(
    await page.locator(".ticket-line").count(),
    1,
    "Identical lines merge",
  );
  await page
    .getByRole("button", { name: /^Options for Spanish Latte/ })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Iced/ }).click();
  await dialog.getByRole("button", { name: /^Milk/ }).click();
  await dialog.getByRole("button", { name: /^Oat milk/ }).click();
  await dialog.getByRole("button", { name: /^Add-ons/ }).click();
  await dialog.getByLabel("Next options").click();
  await dialog.getByRole("button", { name: /^Extra 8/ }).click();
  await dialog.getByRole("button", { name: /^Item notes/ }).click();
  await dialog.getByLabel("Item notes").fill("Extra foam, no lid");
  const saveItem = dialog.locator(".pos-dialog-footer .pos-primary");
  await saveItem.waitFor();
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".pos-dialog-footer button",
      ),
    ].some(
      (button) => button.textContent === "Add to ticket" && !button.disabled,
    ),
  );
  const quantityCheck = holdAvailabilityRefresh();
  try {
    const blockedBeforeRequest = await dialog.evaluate(
      (node) =>
        new Promise<boolean>((resolve) => {
          node
            .querySelector<HTMLButtonElement>(
              '[aria-label="Increase item quantity"]',
            )!
            .click();
          requestAnimationFrame(() =>
            resolve(
              node.querySelector<HTMLButtonElement>(
                ".pos-dialog-footer .pos-primary",
              )!.disabled,
            ),
          );
        }),
    );
    assert.equal(
      blockedBeforeRequest,
      true,
      "A new quantity cannot reuse the prior stock check during debounce",
    );
    await quantityCheck.started;
    assert.equal(
      await saveItem.isDisabled(),
      true,
      "The new quantity waits for its own availability result",
    );
  } finally {
    quantityCheck.release();
  }
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".pos-dialog-footer button",
      ),
    ].some(
      (button) => button.textContent === "Add to ticket" && !button.disabled,
    ),
  );
  await dialog.getByLabel("Decrease item quantity").click();
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".pos-dialog-footer button",
      ),
    ].some(
      (button) => button.textContent === "Add to ticket" && !button.disabled,
    ),
  );
  // Hold the availability refresh between pointer-down and pointer-up. A
  // background check must not disable an already verified configuration and
  // swallow the cashier's click; checkout still revalidates it atomically.
  const refresh = holdAvailabilityRefresh();
  try {
    const bounds = await saveItem.boundingBox();
    assert.ok(bounds);
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await refresh.started;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    assert.equal(
      await saveItem.isEnabled(),
      true,
      "Background availability keeps the verified Add action usable",
    );
    await page.mouse.up();
    await dialog.waitFor({ state: "hidden" });
  } finally {
    refresh.release();
  }
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".ticket-line").count(),
    2,
    "Different configurations stay separate",
  );
  assert.match(
    (await page.locator(".ticket-line").last().textContent()) ?? "",
    /16oz.*Iced/,
  );
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Order notes", exact: true })
    .fill("Call at the side counter");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await add.waitFor();
  assert.equal(
    await page.locator(".ticket-line").count(),
    2,
    "Draft restored after refresh",
  );
  await page
    .getByRole("button", {
      name: "Remove Spanish Latte — revised",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.locator(".ticket-line").count(),
    2,
    "Removal Undo restores line",
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.press("F3");
  await page.getByRole("heading", { name: "Orders", exact: true }).waitFor();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.press("F2");
  await add.waitFor();
  assert.equal(
    await page.locator(".ticket-line").count(),
    2,
    "Draft survives navigation",
  );
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByRole("button", { name: "Scan account", exact: true }).click();
  await page.getByRole("dialog", { name: "Scan customer account" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByLabel("Account QR code").fill("account:" + "a".repeat(64));
  await page.getByRole("button", { name: "Link account", exact: true }).click();
  await page.getByText("100 points available", { exact: false }).waitFor();
  await page.getByLabel("Redeem points").fill("20");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: /^Pay ·/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Exact", exact: true }).click();
  await page.screenshot({
    path: path.join(output, "pos-checkout-desktop.png"),
  });
  for (const [width, height] of [
    [1024, 768],
    [1024, 540],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const confirm = await dialog
      .getByRole("button", { name: "Confirm cash payment", exact: true })
      .boundingBox();
    assert.ok(
      confirm && confirm.y + confirm.height <= height,
      "Confirmation remains visible with keyboard-height viewport",
    );
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(
    await dialog
      .getByRole("button", { name: "Confirm cash payment", exact: true })
      .isDisabled(),
    true,
    "Cash acknowledgement is required",
  );
  await dialog.getByLabel("Cash has been received").check();
  await dialog.getByRole("button", { name: "Exact", exact: true }).click();
  assert.equal(
    await dialog.getByLabel("Cash has been received").isChecked(),
    false,
    "Re-entering the amount requires acknowledgement again",
  );
  await dialog.getByLabel("Cash has been received").check();
  loseResponse();
  await dialog
    .getByRole("button", { name: "Confirm cash payment", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Retry confirmation", exact: true })
    .waitFor();
  assert.equal(
    (await db.query("SELECT * FROM pos_cash_payments")).rows.length,
    1,
  );
  await page.reload();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Retry confirmation", exact: true })
    .click();
  await dialog.getByRole("heading", { name: "Payment received" }).waitFor();
  assert.equal(
    (await db.query("SELECT * FROM pos_cash_payments")).rows.length,
    1,
    "Lost response retry has one tender",
  );
  assert.equal(
    (await db.query("SELECT * FROM guest_receipts")).rows.length,
    1,
    "Receipt reused on retry",
  );
  await page.screenshot({
    path: path.join(output, "pos-sale-confirmation.png"),
  });
  await dialog.getByRole("button", { name: /Next sale/ }).click();
  assert.equal(
    await page.locator(".ticket-line").count(),
    0,
    "Confirmed success clears draft",
  );
  await add.click();
  loseParkResponse();
  await page.getByRole("button", { name: "Park", exact: true }).click();
  await page.getByRole("button", { name: "Retry park", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Retry park", exact: true }).click();
  await page.getByText("Start a new sale").waitFor();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.press("F3");
  await page.getByRole("button", { name: /^Parked(?: ·|$)/ }).click();
  await page.getByRole("link", { name: "Reopen ticket" }).click();
  await page.getByText("Reopened ticket", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Increase Spanish Latte/ }).click();
  await page.getByRole("button", { name: "Park", exact: true }).click();
  await page.getByText("Start a new sale").waitFor();
  assert.equal(
    (
      await db.query(
        "SELECT * FROM orders WHERE is_parked AND status='pending'",
      )
    ).rows.length,
    1,
    "Saving parked edits replaces original atomically",
  );
  // Long contained ticket scroll never moves totals or Pay off the terminal.
  for (let i = 0; i < 3; i++) {
    const buttons = await page.locator(".product-main:not(:disabled)").all();
    for (const button of buttons) await button.click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  assert.ok((await page.locator(".ticket-line").count()) > 10);
  const footer = await page.locator(".ticket-pay").boundingBox();
  assert.ok(footer && footer.y + footer.height <= 768);
  await page.screenshot({ path: path.join(output, "pos-long-ticket.png") });
  await page.getByLabel("Clear ticket").click();
  await page.getByRole("button", { name: "Keep ticket" }).click();
  assert.ok((await page.locator(".ticket-line").count()) > 10);
  await page.getByLabel("Clear ticket").click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search products").fill("Spanish");
  await add.click();
  await page.getByRole("button", { name: /^Ticket ·/ }).click();
  assert.ok(await page.getByRole("button", { name: /^Pay ·/ }).isVisible());
  await page.screenshot({ path: path.join(output, "pos-register-phone.png") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await context.setOffline(true);
  assert.equal(
    await page.getByRole("button", { name: /^Pay ·/ }).isDisabled(),
    true,
  );
  await context.setOffline(false);
  await page.getByLabel("Clear ticket").click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.goto(base + "/dashboard");
  await page.getByRole("heading", { name: "Orders", exact: true }).waitFor();
  const sale = (
    await db.query<{ id: string; order_number: string }>(
      "SELECT o.id,o.order_number FROM orders o JOIN pos_cash_payments p ON p.order_id=o.id",
    )
  ).rows[0];
  await page
    .getByRole("button", { name: "Start preparing", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark ready", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await page.getByRole("button", { name: "Collected", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "pos-orders-desktop.png") });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: path.join(output, "pos-orders-tablet.png") });
  const tv = await context.newPage();
  await tv.goto(base + "/kds");
  await tv.getByText(sale.order_number, { exact: true }).waitFor();
  await tv.screenshot({ path: path.join(output, "pos-tv-board.png") });
  assert.equal(
    await tv.getByText("Jordan Reyes", { exact: true }).count(),
    0,
    "TV contains no customer names",
  );
  await page.getByRole("button", { name: "Collected", exact: true }).click();
  await tv
    .getByText(sale.order_number, { exact: true })
    .waitFor({ state: "hidden" });
  await tv.close();
  // A fixture customer app ticket follows the atomic QR collection route.
  const app = (
    await db.query<{ result: { id: string; order_number: string } }>(
      "SELECT inv_create_order($1,$2,$3,$4) result",
      [
        JSON.stringify({
          order_source: "app",
          order_type: "pickup",
          payment_method: "cash",
          customer_id: null,
          subtotal: 145,
          total: 145,
          discount: 0,
        }),
        JSON.stringify([
          {
            menu_item_id: itemId,
            name: "Spanish Latte",
            price: 145,
            subtotal: 145,
            quantity: 1,
            variants: [
              { variant_group: "size", label: "12oz", price_modifier: 0 },
            ],
          },
        ]),
        "browser-mobile-fixture-01",
        null,
      ],
    )
  ).rows[0].result;
  publishOrders();
  const newCashCard = page.locator(".order-ticket").filter({
    has: page.getByRole("button", { name: "Open order " + app.order_number }),
  });
  await newCashCard
    .getByText("Cash · Pay at pickup", { exact: true })
    .waitFor();
  assert.equal(
    await newCashCard
      .getByRole("button", { name: "Take payment", exact: true })
      .count(),
    0,
  );
  await newCashCard
    .getByRole("button", { name: "Accept order", exact: true })
    .click();
  await newCashCard
    .getByRole("button", { name: "Start preparing", exact: true })
    .waitFor();
  await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
    actor,
    app.id,
  ]);
  await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
    actor,
    app.id,
  ]);
  await db.query(
    "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,'fixture-token')",
    [app.id],
  );
  publishOrders();
  // A paid delivery uses courier booking/status, never the pickup scanner.
  await page.setViewportSize({ width: 1366, height: 1000 });
  const delivery = (
    await db.query<{ result: { id: string; order_number: string } }>(
      "SELECT inv_create_order($1,$2,$3,$4) result",
      [
        JSON.stringify({
          order_source: "app",
          order_type: "delivery",
          payment_method: "maya",
          customer_id: "10000000-0000-4000-8000-000000000002",
          subtotal: 145,
          total: 189,
          delivery_fee: 44,
          discount: 0,
          delivery_address: "Isolated delivery destination",
        }),
        JSON.stringify([
          {
            menu_item_id: itemId,
            name: "Spanish Latte",
            price: 145,
            subtotal: 145,
            quantity: 1,
            variants: [
              { variant_group: "size", label: "12oz", price_modifier: 0 },
            ],
          },
        ]),
        "browser-delivery-fixture-01",
        "10000000-0000-4000-8000-000000000002",
      ],
    )
  ).rows[0].result;
  await db.query(
    "UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=$1",
    [delivery.id],
  );
  await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
    actor,
    delivery.id,
  ]);
  await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
    actor,
    delivery.id,
  ]);
  publishOrders();
  const deliveryCard = page.locator(".order-ticket").filter({
    has: page.getByRole("button", {
      name: "Open order " + delivery.order_number,
    }),
  });
  await deliveryCard
    .getByRole("button", { name: "Book rider", exact: true })
    .waitFor();
  assert.equal(
    await deliveryCard
      .getByRole("button", { name: "Scan pickup", exact: true })
      .count(),
    0,
  );
  await deliveryCard
    .locator(".order-fulfillment")
    .getByText("Delivery", { exact: true })
    .waitFor();
  const pickupCard = page.locator(".order-ticket").filter({
    has: page.getByRole("button", { name: "Open order " + app.order_number }),
  });
  await pickupCard
    .locator(".order-fulfillment")
    .getByText("Pickup", { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "pos-fulfillment-desktop.png"),
  });
  await deliveryCard
    .getByRole("button", { name: "Book rider", exact: true })
    .click();
  const deliveryDialog = page.getByRole("dialog", {
    name: "Delivery · " + delivery.order_number,
    exact: true,
  });
  await deliveryDialog
    .getByText("Ready for a rider", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("dialog", { name: "Scan pickup QR" }).count(),
    0,
  );
  await deliveryDialog
    .getByRole("button", { name: "Book rider", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Go back" })
    .click();
  await deliveryDialog
    .getByText("Ready for a rider", { exact: true })
    .waitFor();
  await deliveryDialog
    .getByRole("button", { name: "Book rider", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Book rider", exact: true })
    .click();
  await deliveryDialog.getByText("Finding a rider", { exact: true }).waitFor();
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM orders WHERE id=$1",
        [delivery.id],
      )
    ).rows[0].status,
    "ready",
    "Booking is not delivery completion",
  );
  await deliveryDialog
    .getByRole("button", { name: "Refresh delivery", exact: true })
    .click();
  await deliveryDialog
    .getByRole("button", { name: "Refresh delivery", exact: true })
    .waitFor();
  await db.query("UPDATE orders SET lalamove_status='PICKED_UP' WHERE id=$1", [
    delivery.id,
  ]);
  await deliveryDialog
    .getByRole("button", { name: "Refresh delivery", exact: true })
    .click();
  await deliveryDialog
    .getByText("On the way to the customer", { exact: true })
    .waitFor();
  await deliveryDialog
    .getByRole("link", { name: "Open courier tracking" })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "pos-delivery-tracking.png"),
  });
  await deliveryDialog
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await deliveryCard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, "pos-fulfillment-phone.png"),
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page
    .getByRole("button", { name: "Scan pickup", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Scan pickup QR", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Pickup QR code").count(),
    0,
    "Scan opens the camera before manual entry",
  );
  if (!(await page.evaluate(() => window.isSecureContext)))
    await page
      .getByRole("alert")
      .filter({ hasText: "HTTPS or localhost" })
      .waitFor();
  await page
    .getByRole("button", { name: "Enter code instead", exact: true })
    .click();
  await page
    .getByLabel("Pickup QR code")
    .fill("pickup:" + app.id + ":fixture-token");
  await page
    .getByRole("button", { name: "Confirm pickup", exact: true })
    .click();
  const cashDialog = page.getByRole("dialog", {
    name: "Cash at pickup",
    exact: true,
  });
  await cashDialog.waitFor();
  assert.equal(
    (
      await db.query<{ payment_status: string }>(
        "SELECT payment_status FROM orders WHERE id=$1",
        [app.id],
      )
    ).rows[0].payment_status,
    "pending",
  );
  await cashDialog.getByRole("button", { name: "Exact", exact: true }).click();
  await cashDialog.getByLabel("Cash has been received").check();
  await page.screenshot({ path: path.join(output, "pos-cash-at-pickup.png") });
  loseResponse();
  await cashDialog
    .getByRole("button", { name: "Receive cash & confirm pickup", exact: true })
    .click();
  // The accepted order update recovers the canonical receipt even when the
  // cash response is lost. SQL tests also exercise explicit same-key retry.
  await page
    .getByRole("heading", {
      name: "Payment already recorded",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog", { name: "Pickup complete", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.evaluate((id) => {
      const key = Object.keys(localStorage).find(
        (key) =>
          key.startsWith("jayds-register:v1:") &&
          key.endsWith(":payment:" + id),
      );
      return (
        !!key && !JSON.parse(localStorage.getItem(key) ?? "{}").pending_checkout
      );
    }, app.id),
    true,
    "Verified receipt clears pending cash confirmation",
  );
  assert.equal(
    (
      await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
        app.id,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query<{ status: string; payment_status: string }>(
        "SELECT status,payment_status FROM orders WHERE id=$1",
        [app.id],
      )
    ).rows[0].status,
    "completed",
  );
  await page.getByRole("button", { name: /Back to orders/ }).click();
  assert.equal(
    (
      await db.query<{ is_used: boolean }>(
        "SELECT is_used FROM pickup_tokens WHERE order_id=$1",
        [app.id],
      )
    ).rows[0].is_used,
    true,
  );
  await page.goto(base + "/void");
  await page.getByRole("button", { name: /^ORD-/ }).first().click();
  await page.getByLabel("Manager PIN").fill("000000");
  assert.equal(
    await page.getByRole("button", { name: "Authorize void" }).isDisabled(),
    true,
  );
  await page.getByLabel("I understand the cancellation consequences").check();
  await page.getByRole("button", { name: "Authorize void" }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  await page.getByLabel("Manager PIN").fill("123456");
  await page.getByRole("button", { name: "Authorize void" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await db.query("SELECT * FROM void_logs")).rows.length, 1);
  console.log(
    "Cashier: 55 products, desktop/tablet/phone, fixed primary actions, one-tap additions, paged options, long tickets, Undo, refresh/navigation/loyalty recovery, lost checkout response/retry, parked edits, online confirmation, orders progression, TV privacy/Realtime, pickup and manager void passed.",
  );
}
