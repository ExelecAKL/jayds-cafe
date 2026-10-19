import { chromium } from "playwright";

export const base =
  process.env.JAYDS_CUSTOMER_UI_URL || "http://localhost:4000";
export const categories = ["Espresso", "Signature drinks", "Croffles"].map(
  (name, i) => ({
    id: `10000000-0000-4000-8000-00000000000${i + 1}`,
    name,
    sort_order: i,
    is_active: true,
    status: "active",
  }),
);
export const products = [
  ["Spanish Latte", "spanish-latte", 145, 0],
  ["Coffee Latte", "coffee-latte", 130, 0],
  ["Americano", "americano", 110, 0],
  ["Vanilla Latte", "vanilla-latte", 145, 0],
  ["Salted Caramel", "salted-caramel", 160, 1],
  ["Matcha Latte", "matcha-latte", 160, 1],
  ["Just Croffle", "just-croffle", 95, 2],
  [
    "Almond Nutella Croffle with an extra long menu name",
    "almond-nutella",
    135,
    2,
  ],
].map(([name, image, price, category], i) => ({
  id: `20000000-0000-4000-8000-00000000000${i + 1}`,
  name,
  image_url: `/products/${image}.png`,
  price,
  description: "A café favorite, prepared your way.",
  category_id: categories[category].id,
  category: categories[category],
  status: "active",
  is_available: i !== 5,
  is_featured: i < 2 || i === 4,
  tags: category === 0 ? ["coffee"] : [],
  sort_order: i,
  prep_time_minutes: 5,
  variants:
    i === 0
      ? [
          {
            id: "regular",
            variant_group: "size",
            label: "16oz",
            is_default: true,
            price_modifier: 0,
            is_available: true,
          },
          {
            id: "large",
            variant_group: "size",
            label: "22oz",
            is_default: false,
            price_modifier: 25,
            is_available: true,
          },
        ]
      : [],
}));

export async function isolateCustomer(page) {
  await page
    .context()
    .routeWebSocket(/supabase.*\/realtime|\/realtime\/v1/, (socket) =>
      socket.close(),
    );
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === new URL(base).origin &&
      !url.pathname.startsWith("/api/")
    )
      return route.continue();
    if (url.pathname === "/api/branch")
      return route.fulfill({
        json: {
          name: "Jayds Café",
          address: "Dasmariñas, Cavite",
          delivery_radius_km: 8,
          latitude: 14.346621,
          longitude: 120.981057,
          version: "ui-fixture",
        },
      });
    if (url.pathname.includes("/auth/"))
      return route.fulfill({ status: 401, json: { message: "Guest fixture" } });
    if (url.pathname.endsWith("/get_published_catalog"))
      return route.fulfill({
        json: { version: 1, categories, menuItems: products },
      });
    if (url.pathname.endsWith("/get_configuration_availability"))
      return route.fulfill({ json: { available: true } });
    if (url.pathname === "/api/customer/push")
      return route.fulfill({ json: { configured: false } });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ json: { items: [] } });
    if (url.pathname.includes("/rest/v1/")) return route.fulfill({ json: [] });
    return route.abort();
  });
}

export async function ready(page) {
  await page
    .locator(".startup-overlay")
    .waitFor({ state: "hidden", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

// Adapt the kit's file-only render entry to the real hydrated customer route.
// Gate implementation and assertions remain unchanged.
if (process.env.JAYDS_CUSTOMER_DESIGN_GATES === "1") {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...pageArgs) => {
      const page = await newPage(...pageArgs);
      await isolateCustomer(page);
      const goto = page.goto.bind(page);
      page.goto = async (url, options) => {
        const response = await goto(
          String(url).startsWith("file:")
            ? base + (process.env.JAYDS_CUSTOMER_GATE_ROUTE || "/menu")
            : url,
          options,
        );
        await ready(page);
        return response;
      };
      return page;
    };
    return browser;
  };
}
