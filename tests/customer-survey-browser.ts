import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type BrowserContext } from "@playwright/test";
import { LEGAL_VERSION } from "../apps/customer/lib/legal.ts";

export async function surveyUxAudit({
  page,
  context,
  base,
  output,
  products,
  fixtureAccount,
  fixtureProfile,
}: {
  page: Page;
  context: BrowserContext;
  base: string;
  output: string;
  products: { id: string; name: string; price: number; image_url: string }[];
  fixtureAccount: { id: string; email: string };
  fixtureProfile: { points: number };
}) {
  const passed: string[] = [];
  const shot = async (name: string) => {
    await page.locator(".startup-overlay").waitFor({ state: "detached" });
    await page.screenshot({
      path: path.join(output, `survey-${name}.png`),
      fullPage: true,
    });
  };
  const checkWidth = async () =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal document overflow",
    );
  let signupCalls = 0,
    logoutCalls = 0,
    creates = 0,
    quotes = 0,
    closed = false,
    locationFailure = false;
  await context.route(/\/auth\/v1\/(signup|logout)/, async (route) => {
    if (route.request().url().includes("/signup")) {
      signupCalls++;
      await route.fulfill({ status: 429, json: { msg: "Too many attempts" } });
    } else {
      logoutCalls++;
      await route.fallback();
    }
  });
  await context.route(base + "/api/orders/create", async (route) => {
    creates++;
    await route.fulfill({
      status: 409,
      json: { error: "Fixture stock changed. Review your bag." },
    });
  });
  await context.route(base + "/api/branch", (route) =>
    route.fulfill({
      json: {
        name: "Jayds Café",
        latitude: 14.346621,
        longitude: 120.981057,
        delivery_radius_km: 8,
        hours: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opens: "00:00",
          closes: "23:59",
        })),
        closures: closed
          ? [new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)]
          : [],
      },
    }),
  );
  await context.route(base + "/api/location?**", async (route) => {
    const url = new URL(route.request().url()),
      query = url.searchParams.get("q");
    if (query === "Slow older address")
      await new Promise((resolve) => setTimeout(resolve, 1500));
    if (locationFailure) {
      await route.fulfill({
        status: 503,
        json: { error: "Fixture geocoder unavailable" },
      });
      return;
    }
    await route.fulfill({
      json: {
        results: [
          {
            lat: query ? 14.35 : 14.351,
            lng: query ? 120.985 : 120.986,
            address: query
              ? `${query}, Dasmariñas, Cavite`
              : "Pin address, Dasmariñas, Cavite",
          },
        ],
      },
    });
  });
  await context.route(base + "/api/lalamove/quotation", (route) => {
    quotes++;
    return route.fulfill({
      json: {
        quoteToken: "isolated",
        deliveryFee: 97,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        quotationId: "fixture",
      },
    });
  });

  await page.goto(base + "/register");
  await page.locator(".startup-overlay").waitFor({ state: "detached" });
  await page.locator("#reg-phone").fill("09123456789012345");
  await expect(page.locator("#reg-phone")).toHaveValue("09123456789");
  await page.locator("#reg-phone").evaluate((input) => {
    const data = new DataTransfer();
    data.setData("text/plain", "+63 (912) 345-6789");
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator("#reg-phone")).toHaveValue("09123456789");
  for (const [password, level, color] of [
    ["short", 1, "rgb(188, 48, 41)"],
    ["Abcdefg1", 2, "rgb(181, 137, 0)"],
    ["Abcdefgh1234", 3, "rgb(39, 128, 74)"],
  ] as const) {
    await page.locator("#reg-password").fill(password);
    await expect(
      page.getByRole("meter", { name: "Password strength" }),
    ).toHaveAttribute("aria-valuenow", String(level));
    await expect(
      page.locator(".password-strength-bars .is-filled"),
    ).toHaveCount(level);
    assert.deepEqual(
      await page
        .locator(".password-strength-bars .is-filled")
        .evaluateAll((nodes) =>
          nodes.map((n) => getComputedStyle(n).backgroundColor),
        ),
      Array(level).fill(color),
    );
    await shot(`password-${level}`);
  }
  await page.locator("#reg-name").fill("Fixture Survey Member");
  await page.locator("#reg-email").fill("survey@example.test");
  await page.locator("#reg-phone").fill("08123456789");
  await page.locator("#reg-confirm").fill("Abcdefgh1234");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Create account/i }).click();
  await expect(page.getByRole("alert")).toContainText("11-digit Philippine");
  assert.equal(signupCalls, 0);
  await checkWidth();
  passed.push(
    "Phone input hard cap, country-code paste, strict mobile validation and exact red/yellow/green meter colors",
  );

  const line = {
    id: products[0].id,
    menu_item_id: products[0].id,
    name: products[0].name,
    price: 145,
    quantity: 1,
    variants: [
      { variant_group: "size", label: "16oz", price_modifier: 0 },
      { variant_group: "milk_sub", label: "Whole Milk", price_modifier: 0 },
    ],
    image_url: products[0].image_url,
    notes: null,
  };
  const bag = {
    items: [line],
    orderType: "pickup",
    tableNumber: "",
    orderNote: "Less ice please",
    specialRemarks: "",
    voucher: null,
    pointsToRedeem: 0,
  };
  await page.evaluate((bag) => {
    localStorage.setItem("cafeos-cart:guest", JSON.stringify(bag));
  }, bag);
  await page.goto(base + "/cart");
  await expect(
    page.getByText("A little extra for you", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.locator('a[href="/checkout"]:visible').count(),
      1,
      `One checkout action at ${width}`,
    );
    const note = await page.locator(".bag-order-note").boundingBox();
    assert.ok(note && note.height <= 58, "Folded note is compact");
    await checkWidth();
    await shot(`bag-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#bag-voucher").fill("DEMO10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("DEMO10 applied")).toBeVisible();
  await page.locator('a[href="/checkout"]:visible').click();
  await expect(page.getByText("Guest checkout", { exact: true })).toBeVisible();
  assert.equal(
    await page.getByRole("button", { name: "Pickup", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Delivery", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("textarea, #bag-voucher").count(), 0);
  await expect(
    page.getByText("Less ice please", { exact: true }),
  ).toBeVisible();
  await expect(page.getByAltText(products[0].name)).toBeVisible();
  await expect(
    page.getByText("VAT included · estimate", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /I agree to the/ }).check();
  await page
    .getByRole("button", { name: "Confirm review", exact: true })
    .click();
  await shot("checkout");
  await page.getByRole("button", { name: /Review order/ }).click();
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeVisible();
  await expect(page.getByAltText(products[0].name)).toBeVisible();
  await expect(
    page.getByText("Product VAT (included)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  const countdown = page.getByRole("dialog", {
    name: "Your order is almost on its way.",
  });
  await expect(countdown).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(creates, 0);
  await shot("countdown");
  await countdown.getByRole("button", { name: "Go back to my order" }).click();
  await new Promise((resolve) => setTimeout(resolve, 4300));
  assert.equal(creates, 0, "Cancelled timer never submits");
  const start = Date.now();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByText("Fixture stock changed. Review your bag."),
  ).toBeVisible({ timeout: 15000 });
  assert.equal(creates, 1);
  assert.ok(Date.now() - start >= 5000, "Submission waits five seconds");
  passed.push(
    "Single checkout action at 320/390/768/1280, compact notes, bag vouchers, guest ordering, read-only checkout, item photos and VAT, cancellable five-second submission",
  );

  await page.goto(base + "/cart");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.locator('a[href="/checkout"]:visible').click();
  await page.getByRole("button", { name: "Choose destination on map" }).click();
  const map = page.getByRole("dialog", { name: "Delivery address" });
  const address = map.getByLabel(/^Complete delivery address/),
    use = map.getByRole("button", { name: "Use this destination" });
  assert.equal(
    await page.evaluate(
      () => (window as unknown as { fixtureGpsCalls: number }).fixtureGpsCalls,
    ),
    0,
    "No automatic GPS prompt",
  );
  await address.fill("Test Street");
  await map
    .getByRole("button", {
      name: "Test Street, Dasmariñas, Cavite",
      exact: true,
    })
    .click();
  await expect(use).toBeEnabled();
  await map.locator("summary").click();
  await expect(map.getByLabel(/^Latitude/)).toHaveValue("14.35");
  await expect(map.getByLabel(/^Longitude/)).toHaveValue("120.985");
  await map.getByLabel(/^Latitude/).fill("14.352");
  await map.getByLabel(/^Latitude/).blur();
  await expect(address).toHaveValue("Pin address, Dasmariñas, Cavite");
  await expect(map.getByLabel(/^Latitude/)).toHaveValue("14.352"); // reverse result must not move the exact pin
  locationFailure = true;
  await address.fill("Manual address after provider failure");
  await expect(map.getByText(/Address search is unavailable/)).toBeVisible();
  await expect(use).toBeDisabled();
  await map
    .getByRole("checkbox", {
      name: "I checked that the pin matches this address",
    })
    .check();
  await expect(use).toBeEnabled();
  locationFailure = false;
  await address.fill("Slow older address");
  await new Promise((resolve) => setTimeout(resolve, 750));
  await address.fill("Newer address");
  await map
    .getByRole("button", {
      name: "Newer address, Dasmariñas, Cavite",
      exact: true,
    })
    .click();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await expect(address).toHaveValue("Newer address, Dasmariñas, Cavite");
  await map.getByLabel(/^Latitude/).fill("16");
  await map.getByLabel(/^Latitude/).blur();
  await expect(use).toBeDisabled();
  await address.fill("Back inside");
  await map
    .getByRole("button", {
      name: "Back inside, Dasmariñas, Cavite",
      exact: true,
    })
    .click();
  await map.getByRole("button", { name: "Use my location" }).click();
  await expect(map.getByText(/Location access was unavailable/)).toBeVisible();
  await use.click();
  await expect(
    page.getByText("Back inside, Dasmariñas, Cavite", { exact: true }),
  ).toBeVisible();
  assert.ok(quotes > 0);
  passed.push(
    "Address search moves pin, manual pin changes fill address, precise coordinates preserved, failure requires manual confirmation, stale responses ignored, coverage and GPS fallback",
  );

  await page.goto(base + "/login");
  await page.locator("#login-email").fill(fixtureAccount.email);
  await page.locator("#login-password").fill("FixturePassword1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(base + "/menu");
  await expect(
    page.getByRole("link", { name: "My orders", exact: true }),
  ).toHaveCount(0);
  await page.goto(base + "/menu/browse");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".product-name").first().waitFor();
  assert.ok(
    (await page
      .locator(".product-name")
      .first()
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize))) >= 20,
  );
  assert.ok(
    (await page
      .locator(".product-price")
      .first()
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize))) >= 20,
  );
  assert.equal(
    await page.locator('.product-card button[aria-label*="favorite"]').count(),
    0,
  );
  await shot("menu-desktop");
  closed = true;
  await page.reload();
  await page
    .getByRole("link", { name: `Select ${products[0].name}`, exact: true })
    .click();
  const closure = page.getByRole("dialog", {
    name: "The café is closed right now.",
  });
  await expect(closure).toBeVisible();
  await expect(
    closure.getByRole("link", { name: "Back to homepage" }),
  ).toBeVisible();
  await shot("closed");
  await closure.getByRole("link", { name: "View menu", exact: true }).click();
  await expect(closure).not.toBeVisible();
  assert.equal(new URL(page.url()).pathname, "/menu/browse");
  closed = false;
  await page.goto(base + "/account");
  await page.getByRole("button", { name: /Sign out/ }).click();
  const confirm = page.getByRole("dialog", {
    name: "Are you sure you want to sign out?",
  });
  await expect(confirm).toBeVisible();
  assert.equal(logoutCalls, 0);
  await confirm.getByRole("button", { name: "Stay signed in" }).click();
  assert.equal(logoutCalls, 0);
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.keyboard.press("Escape");
  await expect(confirm).not.toBeVisible();
  assert.equal(logoutCalls, 0);
  await page.getByRole("button", { name: /Sign out/ }).click();
  await shot("signout");
  await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(base + "/menu");
  assert.equal(logoutCalls, 1);
  await expect(
    page.getByText("You’re signed out.", { exact: true }),
  ).toBeVisible();
  passed.push(
    "Readable desktop menu, favorites stay on details, closed outlet modal, signout cancellation/Escape/confirmation and success toast",
  );
  assert.equal(fixtureProfile.points, 120);
  const report = {
    base,
    isolated: true,
    hostedMutations: 0,
    legalVersion: LEGAL_VERSION,
    passed,
    signupCalls,
    logoutCalls,
    creates,
    quotes,
  };
  writeFileSync(
    path.join(output, "survey-verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
