// Real service worker, isolated public fixture; no customer/provider writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const root = process.cwd(),
  base = "http://127.0.0.1:4323";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "start",
    "-p",
    "4323",
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
  // Keep worker-owned network requests isolated even if browser routing changes.
  args: [
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "allow",
});
const fixture = {
  categories: [],
  menuItems: [
    {
      id: "e1000000-0000-4000-a000-000000000001",
      name: "Offline fixture coffee",
      price: 145,
      image_url: null,
      status: "active",
      is_available: true,
      variants: [],
      category_id: null,
      sort_order: 0,
      tags: [],
      prep_time_minutes: 5,
    },
  ],
  fetchedAt: Date.now(),
};
const runtimeErrors: string[] = [];
const remoteOrigins = new Set<string>();
let remoteFrameRequests = 0,
  remoteWorkerRequests = 0;
context.on("request", (request) => {
  const url = new URL(request.url());
  if (url.origin === base) return;
  remoteOrigins.add(url.origin);
  if (request.serviceWorker()) remoteWorkerRequests++;
  else remoteFrameRequests++;
});
await context.route("https://**", (route) => route.abort());
await context.routeWebSocket("**", (socket) => socket.close());
await context.addInitScript((data) => {
  if (!localStorage.getItem("jayds-published-catalog"))
    localStorage.setItem("jayds-published-catalog", JSON.stringify(data));
}, fixture);
await context.addInitScript(() => {
  // A legacy cache simulates older app versions that used broad cache rules.
  if (!sessionStorage.getItem("legacy-cache-seeded")) {
    sessionStorage.setItem("legacy-cache-seeded", "1");
    void caches
      .open("legacy-precache-private")
      .then((cache) =>
        cache.put("/account", new Response("isolated-private-fixture")),
      );
  }
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/login")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
    console.log("PWA fixture runtime: " + error.message);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(base + "/_next"))
      console.log(
        "PWA fixture failed asset: " +
          new URL(request.url()).pathname +
          " " +
          request.failure()?.errorText,
      );
  });
  await page.goto(base + "/menu/browse");
  await page
    .getByRole("heading", { name: "Offline fixture coffee", exact: true })
    .waitFor();
  await page.getByAltText("Offline fixture coffee").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>(".product-image");
    return Boolean(image?.complete && image.naturalWidth > 0);
  });
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 30000 },
  );
  // Revisit with an active worker to populate the explicitly public page cache.
  console.log("PWA fixture: worker controls the public menu.");
  await page.reload();
  await page
    .getByRole("heading", { name: "Offline fixture coffee", exact: true })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("jayds-published-catalog") ?? "{}",
      ).menuItems?.map((item: { id: string }) => item.id),
    ),
    [fixture.menuItems[0].id],
    "Controlled reload must retain the isolated public catalog fixture",
  );
  await page.evaluate(async () => {
    for (const pathname of [
      "/account",
      "/cart",
      "/checkout",
      "/orders",
      "/login",
      "/help",
      "/profile/addresses",
      "/api/customer/legal",
      "/api/customer/recommendations",
      "/api/orders/guest",
    ]) {
      await fetch(pathname, { cache: "no-store" }).catch(() => {});
    }
  });
  // Warm the product's public HTML and assets so its review page is also
  // available offline; adding always happens after explicit configuration.
  const detailPath = "/menu/browse/" + fixture.menuItems[0].id;
  await page.goto(base + detailPath, { waitUntil: "networkidle" });
  await page.locator(".startup-overlay").waitFor({ state: "detached" });
  await page.getByRole("button", { name: /Add to bag/ }).waitFor();
  const cachedDetail = await page.evaluate(async (pathname) => {
    const response = await caches.match(pathname);
    const text = await response?.text();
    return {
      exists: !!response,
      url: response?.url,
      status: response?.status,
      isDetail: text?.includes("Make it yours."),
      isBrowse: text?.includes("Find your next favorite."),
    };
  }, detailPath);
  assert.ok(
    cachedDetail.exists && cachedDetail.isDetail,
    "Product document cached after real navigation",
  );
  await page.goto(base + "/menu/browse");
  await page
    .getByRole("heading", { name: "Offline fixture coffee", exact: true })
    .waitFor();
  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        paths.push(new URL(request.url).pathname);
    return paths;
  });
  assert.ok(
    cachedPaths.includes("/menu/browse"),
    "Public menu must have an offline shell",
  );
  assert.ok(
    cachedPaths.includes("/brand/jayds-full.svg"),
    "Jayds vector artwork remains available offline",
  );
  assert.deepEqual(
    cachedPaths.filter((p) => p.startsWith("/products/")),
    ["/products/americano.png"],
    "Only viewed product images are downloaded and cached",
  );
  const unexpectedPaths = cachedPaths.filter(
    (p) =>
      !/^\/(?:_next\/static\/|products\/[a-z0-9-]+\.png$|brand\/(?:jayds|icon)-[\w-]+\.svg$|maplibre\/maplibre-[\w-]+\.mjs$|icons\/|startup\/|fonts\/|favicon|menu(?:\/|$)|illustrations\/jayds-(?:pickup|delivery)\.svg$)/.test(
        p,
      ),
  );
  if (unexpectedPaths.length)
    console.log(JSON.stringify({ unexpectedCachedPaths: unexpectedPaths }));
  assert.ok(
    cachedPaths.every((p) =>
      /^\/(?:_next\/static\/|products\/[a-z0-9-]+\.png$|brand\/(?:jayds|icon)-[\w-]+\.svg$|maplibre\/maplibre-[\w-]+\.mjs$|icons\/|startup\/|fonts\/|favicon|menu(?:\/|$)|illustrations\/jayds-(?:pickup|delivery)\.svg$)/.test(
        p,
      ),
    ),
    "Private pages/API responses cannot enter Cache Storage",
  );
  await context.setOffline(true);
  console.log(
    "PWA fixture: public/private cache checks passed; testing offline reload.",
  );
  await page.reload();
  try {
    await page
      .getByRole("heading", { name: "Offline fixture coffee", exact: true })
      .waitFor();
    await page.locator(".startup-overlay").waitFor({ state: "detached" });
    await page
      .getByRole("status")
      .filter({ hasText: "Offline · Browse" })
      .waitFor();
    await page.waitForLoadState("networkidle");
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(async () => ({
          text: document.body.innerText,
          catalogItems: JSON.parse(
            localStorage.getItem("jayds-published-catalog") ?? "{}",
          ).menuItems?.length,
          online: navigator.onLine,
          cacheNames: await caches.keys(),
          scripts: await Promise.all(
            [...document.scripts]
              .map((s) => s.src)
              .filter(Boolean)
              .map(async (url) => ({
                url,
                cached: !!(await caches.match(url)),
              })),
          ),
        })),
      ),
    );
    throw error;
  }
  // Exercise the actual saved-menu action with the real worker controlling it.
  await page
    .getByRole("link", { name: "Select Offline fixture coffee", exact: true })
    .click();
  await page.waitForURL(base + detailPath);
  await page.locator(".startup-overlay").waitFor({ state: "detached" });
  try {
    await page.getByRole("button", { name: /Add to bag/ }).click();
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          url: location.pathname,
          text: document.body.innerText,
          catalog: localStorage.getItem("jayds-published-catalog"),
        })),
      ),
    );
    console.log(JSON.stringify({ runtimeErrors }));
    throw error;
  }
  await page
    .getByRole("link", { name: /View bag/ })
    .first()
    .waitFor();
  const draft = await page.evaluate(
    () => JSON.parse(localStorage.getItem("cafeos-cart:guest") ?? "{}").items,
  );
  assert.equal(draft.length, 1);
  await page.reload();
  await page.getByRole("button", { name: /Add to bag/ }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cafeos-cart:guest") ?? "{}").items
          .length,
    ),
    1,
    "Worker reload retains the draft",
  );
  await page.getByRole("link", { name: "Go back", exact: true }).click();
  await page.waitForURL(base + "/menu/browse");
  await page
    .getByRole("heading", { name: "Offline fixture coffee", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Select Offline fixture coffee", exact: true })
    .click();
  await page.waitForURL(base + detailPath);
  await page.getByRole("button", { name: /Add to bag/ }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cafeos-cart:guest") ?? "{}").items
          .length,
    ),
    1,
    "Offline return and selection retain the same draft",
  );
  await page
    .getByLabel(/^A little note(?:\s*(?:\*|\(optional\)))?$/, { exact: true })
    .fill("Preserve this unsaved note");
  await page.evaluate(() => {
    (window as unknown as { qaDocumentToken: string }).qaDocumentToken =
      "same-offline-document";
  });
  await context.setOffline(false);
  // Some network transitions deliver additional online events. They must not
  // reload the document, erase unsubmitted form edits or replay a sale.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(750);
  assert.equal(page.url(), base + detailPath);
  assert.equal(
    await page.evaluate(
      () => (window as unknown as { qaDocumentToken?: string }).qaDocumentToken,
    ),
    "same-offline-document",
    "Reconnection preserves the document",
  );
  assert.equal(
    await page.getByLabel(/^A little note(?:\s*(?:\*|\(optional\)))?$/, { exact: true }).inputValue(),
    "Preserve this unsaved note",
    "Reconnection preserves unsubmitted configuration",
  );
  const report = {
    realServiceWorker: true,
    publicCacheOnly: true,
    offlineReload: true,
    offlineDraftEditing: true,
    draftPreserved: true,
    reconnectionPreservesDocumentAndNotes: true,
    cachedResources: cachedPaths.length,
    remoteNetworkDenied: true,
    remoteOrigins: [...remoteOrigins],
    remoteFrameRequests,
    remoteWorkerRequests,
    runtimeErrors,
    realAndroidIosNotVerified: true,
  };
  writeFileSync(
    ".codex-logs/customer-pwa-browser-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  assert.deepEqual(
    runtimeErrors,
    [],
    "Offline hydration must complete without runtime errors",
  );
} finally {
  // Release the isolated server even if Chromium takes time to close an
  // offline worker. A retained server could serve stale chunk references on
  // the next run after a new production build.
  server.kill();
  await browser.close();
}
