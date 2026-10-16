import { createRequire } from "node:module";
// Branded startup, real published fixtures, and interaction/motion checks only.
// Service workers and all remote network/DNS are isolated; no live writes occur.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const root = process.cwd(),
  base = "http://127.0.0.1:4334",
  output = path.join(root, ".codex-logs/customer-motion-screens");
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("next/dist/bin/next"),
    "start",
    "-p",
    "4334",
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: path.join(root, "apps/customer"),
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: "" },
  },
);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
const products = [
  "Spanish Latte",
  "A very long published café favorite with oat milk and caramel",
].map((name, index) => ({
  id: `20000000-0000-4000-8000-00000000000${index + 1}`,
  name,
  description:
    "An actual published menu fixture. Choose your options before confirming its total.",
  price: 145,
  image_url: null,
  category_id: null,
  status: "active",
  is_available: index === 0,
  is_featured: true,
  sort_order: index,
  prep_time_minutes: 5,
  tags: [],
  variants: [
    {
      id: `size-${index}`,
      variant_group: "size",
      label: "16oz",
      price_modifier: 0,
      is_default: true,
      is_available: true,
    },
    {
      id: `size-large-${index}`,
      variant_group: "size",
      label: "22oz",
      price_modifier: 25,
      is_default: false,
      is_available: true,
    },
  ],
}));
await context.addInitScript(() => {
  (window as unknown as { motionFixtureCls: number }).motionFixtureCls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & {
      hadRecentInput: boolean;
      value: number;
    })[])
      if (!entry.hadRecentInput)
        (window as unknown as { motionFixtureCls: number }).motionFixtureCls +=
          entry.value;
  }).observe({ type: "layout-shift", buffered: true });
});
await context.routeWebSocket("**", (socket) => socket.close());
let releaseInitialCatalog!:()=>void;
const initialCatalogGate=new Promise<void>(resolve=>{releaseInitialCatalog=resolve;});
await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if(pathname.endsWith("get_published_catalog"))await initialCatalogGate;
  return route.fulfill({
    status: pathname.includes("/auth/") ? 401 : 200,
    json: pathname.endsWith("get_published_catalog")
      ? { version: 1, categories: [], menuItems: products }
      : pathname.includes("/auth/")
        ? { message: "No fixture session" }
        : [],
  });
});
await context.route(
  (url) => url.protocol === "https:" && !url.hostname.endsWith(".supabase.co"),
  (route) => route.abort(),
);
await context.route(base + "/api/**", (route) =>
  route.fulfill({
    json: {
      name: "Jayds Café",
      address: "Verified branch fixture",
      delivery_radius_km: 8,
      configured: false,
    },
  }),
);
const errors: string[] = [];
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/login")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const page = await context.newPage();
  const captureSession = await context.newCDPSession(page);
  async function capture(name: string) {
    // Paused app timers keep each splash phase deterministic. Capture through
    // Chromium directly so screenshot animation RAF polling cannot deadlock.
    const frame = await captureSession.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(path.join(output, name), Buffer.from(frame.data, "base64"));
  }

  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-04T02:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-04T02:00:01Z"));
  await page.goto(base + "/menu", { waitUntil: "domcontentloaded" });
  await page.locator(".startup-logo-scene:not(.is-hidden)").waitFor();
  assert.match(
    (await page
      .locator(".startup-logo-scene .original-logo-image")
      .first()
      .getAttribute("src")) ?? "",
    /brand\/jayds-full\.svg/,
  );
  async function assertOriginalLogoRatio(selector: string) {
    const image = page.locator(selector).first();
    await image.waitFor();
    await image.evaluate((element: HTMLImageElement) => element.decode());
    const proportions = await image.evaluate((element: HTMLImageElement) => {
      const style = getComputedStyle(element);
      return {
        source: element.naturalWidth / element.naturalHeight,
        rendered: parseFloat(style.width) / parseFloat(style.height),
      };
    });
    assert.ok(
      Math.abs(proportions.source - proportions.rendered) < 0.001,
      "Original logo retains its natural aspect ratio in " + selector,
    );
  }
  await assertOriginalLogoRatio(".startup-logo-scene .original-logo-image");
  await capture("startup-logo.png");
  await page.clock.runFor(2499);
  assert.equal(await page.locator(".startup-logo-scene:not(.is-hidden)").count(),1,"Logo remains until 2.5 seconds");
  assert.equal(await page.locator(".startup-welcome-scene.is-visible").count(),0);
  assert.equal(await page.locator(".brand-loader-cup").count(),0);
  await page.clock.runFor(1);
  await page.locator(".startup-welcome-scene.is-visible").waitFor();
  await page.clock.runFor(220);
  await capture("startup-welcome-banner.png");
  await page.clock.runFor(5000);
  assert.equal(await page.locator(".startup-overlay:not(.is-leaving)").count(),1,"The banner waits for actual catalog loading beyond the former fixed fallback");
  await page.locator('.startup-welcome-caption [role="status"]').waitFor();
  releaseInitialCatalog();
  await page.getByRole('button',{name:`Show featured slide 2: ${products[0].name}`,exact:true}).waitFor();
  for (
    let step = 0;
    step < 6 && (await page.locator(".startup-overlay").count());
    step++
  ) {
    await page.clock.runFor(350);
    // React passive effects enqueue the next phase after each commit.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await page.locator(".startup-overlay").waitFor({ state: "detached" });
  await page.clock.resume();
  const carousel = page.getByRole("region", { name: "Featured at Jayds" });
  await carousel
    .getByRole("button", {
      name: `Show featured slide 2: ${products[0].name}`,
      exact: true,
    })
    .waitFor();
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await carousel
      .getByRole("button", {
        name: "Show featured slide 1: Welcome to Jayds",
        exact: true,
      })
      .click();
    await assertOriginalLogoRatio(".home-carousel-art .original-logo-image");
    const artwork = await page
      .locator(".home-carousel-art.is-welcome")
      .boundingBox();
    const logo = await page
      .locator(".home-carousel-art .original-logo-image")
      .boundingBox();
    assert.ok(
      artwork &&
        logo &&
        logo.x >= artwork.x + 7 &&
        logo.y >= artwork.y + 7 &&
        logo.x + logo.width <= artwork.x + artwork.width - 7 &&
        logo.y + logo.height <= artwork.y + artwork.height - 7,
      "The complete original logo fits inside its welcome card at " + width,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Home has no horizontal overflow at " + width,
    );
    for (const button of await carousel.getByRole("button").all()) {
      const box = await button.boundingBox();
      assert.ok(
        box && box.width >= 48 && box.height >= 48,
        "Carousel touch targets at " + width,
      );
    }
    await capture(`home-${width}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const initialHeight = (await carousel.boundingBox())!.height;
  console.log("Motion fixture: startup and four responsive widths passed.");
  await carousel
    .getByRole("button", {
      name: "Show featured slide 1: Welcome to Jayds",
      exact: true,
    })
    .click();
  console.log(
    "Motion fixture: beforeNext " + (await carousel.locator("h2").innerText()),
  );
  await carousel
    .getByRole("button", { name: "Next featured slide", exact: true })
    .click();
  console.log(
    "Motion fixture: afterNext " + (await carousel.locator("h2").innerText()),
  );
  await carousel
    .getByRole("heading", { name: products[0].name, exact: true })
    .waitFor();
  await carousel.getByText("From ₱145.00", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    ),
    "Next featured slide",
    "Changing slides preserves keyboard focus",
  );
  await carousel
    .getByRole("button", { name: "Next featured slide", exact: true })
    .click();
  await carousel.getByText("Currently sold out", { exact: true }).waitFor();
  assert.equal(
    (await carousel.boundingBox())!.height,
    initialHeight,
    "Product/long-name/sold-out slides preserve layout geometry",
  );
  await carousel
    .getByRole("button", {
      name: "Show featured slide 1: Welcome to Jayds",
      exact: true,
    })
    .click();
  await carousel
    .getByRole("button", { name: "Play featured slides", exact: true })
    .click();
  await page.getByRole("link", { name: "Notifications", exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(6500);
  await carousel
    .getByRole("heading", { name: products[0].name, exact: true })
    .waitFor();
  await carousel
    .getByRole("link", { name: "View menu item", exact: true })
    .focus();
  await page.clock.runFor(6500);
  assert.equal(
    await carousel
      .getByRole("heading", { name: products[0].name, exact: true })
      .count(),
    1,
    "Autoplay pauses while an action has focus",
  );
  // Actual Chromium touch input, including a hold across an autoplay interval.
  await page.clock.resume();
  await page.getByRole("link", { name: "Notifications", exact: true }).focus();
  await carousel.scrollIntoViewIfNeeded();
  const touch = await context.newCDPSession(page);
  const box = (await carousel.locator(".home-carousel-slide").boundingBox())!;
  const x = box.x + box.width * 0.75,
    y = box.y + box.height * 0.45;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await carousel
    .getByRole("button", { name: "Play featured slides", exact: true })
    .waitFor();
  await page.clock.runFor(6500);
  await carousel
    .getByRole("heading", { name: products[0].name, exact: true })
    .waitFor();
  await page.clock.resume();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 65, y: y + 2 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 120, y: y + 3 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await carousel.getByText("Currently sold out", { exact: true }).waitFor();
  assert.equal(
    new URL(page.url()).pathname,
    "/menu",
    "A swipe must not activate the slide link",
  );
  await carousel
    .getByRole("button", { name: "Play featured slides", exact: true })
    .waitFor();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x - 120, y }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 50, y: y + 2 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y + 3 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await carousel
    .getByRole("heading", { name: products[0].name, exact: true })
    .waitFor();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 2, y: y + 80 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await carousel
    .getByRole("heading", { name: products[0].name, exact: true })
    .waitFor();
  await carousel
    .getByRole("button", { name: "Play featured slides", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Notifications", exact: true }).focus();
  await page.clock.runFor(7000);
  assert.equal(
    await carousel
      .getByRole("heading", { name: products[0].name, exact: true })
      .count(),
    1,
    "Reduced motion stops automatic rotation",
  );
  assert.equal(
    await carousel
      .getByRole("button", { name: "Pause featured slides", exact: true })
      .isDisabled(),
    true,
  );
  assert.ok(
    await page.evaluate(
      () =>
        parseFloat(
          getComputedStyle(document.querySelector("main")!).animationDuration,
        ) <= 0.001,
    ),
    "Reduced motion removes route animation",
  );
  const cls = await page.evaluate(
    () => (window as unknown as { motionFixtureCls: number }).motionFixtureCls,
  );
  const report = {
    genuineLogoAndBanner: true,
    logoDurationMs:2500,
    noCupOrGettingReadyCopy:true,
    bannerWaitsForActualCatalog:true,
    phoneTabletWidths: [360, 390, 430, 768, 1024],
    originalLogoProportions: true,
    targets48px: true,
    carouselUsesPublishedFixtures: true,
    stableSlideGeometry: true,
    keyboardFocusPreserved: true,
    autoplayPausesForFocus: true,
    touchSwipeBothDirections: true,
    touchPausesAutoplay: true,
    verticalGesturePreserved: true,
    swipeDoesNotFollowLink: true,
    reducedMotion: true,
    controlledLocalCls: cls,
    productionMetricsNotMeasured: true,
    errors,
  };
  assert.deepEqual(errors, []);
  assert.ok(cls <= 0.1, "Controlled home CLS target");
  writeFileSync(
    ".codex-logs/customer-motion-browser-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context.close();
  await browser.close();
  server.kill();
}
