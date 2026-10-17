import { appPath } from "./app-path";

// Generated illustrations are a fallback; an owner-supplied photo takes precedence.
const generatedImages: Readonly<Record<string, string>> = {
  "e1000000-0000-4000-a000-000000000001": "/products/americano.png",
  "e1000000-0000-4000-a000-000000000002": "/products/coffee-latte.png",
  "e1000000-0000-4000-a000-000000000003": "/products/spanish-latte.png",
  "e1000000-0000-4000-a000-000000000004": "/products/vanilla-latte.png",
  "e1000000-0000-4000-a000-000000000005": "/products/french-vanilla.png",
  "e1000000-0000-4000-a000-000000000006": "/products/caramel-latte.png",
  "e1000000-0000-4000-a000-000000000007": "/products/hazelnut-latte.png",
  "e1000000-0000-4000-a000-000000000008": "/products/macadamia-latte.png",
  "e1000000-0000-4000-a000-000000000009": "/products/butterscotch-latte.png",
  "e1000000-0000-4000-a000-00000000000a": "/products/aussie-latte.png",
  "e1000000-0000-4000-a000-00000000000b": "/products/white-mocha-latte.png",
  "e1000000-0000-4000-a000-00000000000c": "/products/cinnamon-cappuccino.png",
  "e2000000-0000-4000-a000-000000000001": "/products/caramel-macchiato.png",
  "e2000000-0000-4000-a000-000000000002": "/products/caramel-mocha.png",
  "e2000000-0000-4000-a000-000000000003": "/products/salted-caramel.png",
  "e2000000-0000-4000-a000-000000000004": "/products/mocha.png",
  "e2000000-0000-4000-a000-000000000005": "/products/cloud-hazelnut.png",
  "e2000000-0000-4000-a000-000000000006":
    "/products/tres-leche-shaken-espresso.png",
  "e2000000-0000-4000-a000-000000000007": "/products/milo-shaken-espresso.png",
  "e2000000-0000-4000-a000-000000000008": "/products/hazelnut-mocha.png",
  "e2000000-0000-4000-a000-000000000009": "/products/biscoff.png",
  "e2000000-0000-4000-a000-00000000000a": "/products/cocoa-lava.png",
  "e2000000-0000-4000-a000-00000000000b": "/products/matcha-latte.png",
  "e2000000-0000-4000-a000-00000000000c": "/products/strawberry-milk.png",
  "e2000000-0000-4000-a000-00000000000d": "/products/nom-yen-pink-milk.png",
  "e3000000-0000-4000-a000-000000000001": "/products/vanilla-milkshake.png",
  "e3000000-0000-4000-a000-000000000002": "/products/cookies-and-cream.png",
  "e3000000-0000-4000-a000-000000000003": "/products/dark-chocolate.png",
  "e3000000-0000-4000-a000-000000000004": "/products/matcha.png",
  "e3000000-0000-4000-a000-000000000005":
    "/products/strawberries-and-cream.png",
  "e3000000-0000-4000-a000-000000000006": "/products/caramel-frappe.png",
  "e3000000-0000-4000-a000-000000000007": "/products/mocha-frappe.png",
  "e3000000-0000-4000-a000-000000000008": "/products/java-chip.png",
  "e3000000-0000-4000-a000-000000000009": "/products/salted-caramel-frappe.png",
  "e3000000-0000-4000-a000-00000000000a": "/products/biscoff-frappe.png",
  "e4000000-0000-4000-a000-000000000001": "/products/classic-milk-tea.png",
  "e4000000-0000-4000-a000-000000000002": "/products/wintermelon-milk-tea.png",
  "e4000000-0000-4000-a000-000000000003": "/products/okinawa-milk-tea.png",
  "e4000000-0000-4000-a000-000000000004":
    "/products/dark-chocolate-milk-tea.png",
  "e4000000-0000-4000-a000-000000000005": "/products/taro-milk-tea.png",
  "e4000000-0000-4000-a000-000000000006":
    "/products/cookies-and-cream-milk-tea.png",
  "e5000000-0000-4000-a000-000000000001": "/products/strawberry-soda.png",
  "e5000000-0000-4000-a000-000000000002": "/products/blueberry-soda.png",
  "e5000000-0000-4000-a000-000000000003": "/products/green-apple-soda.png",
  "e5000000-0000-4000-a000-000000000004": "/products/lychee-soda.png",
  "e5000000-0000-4000-a000-000000000005": "/products/honey-peach-soda.png",
  "e6000000-0000-4000-a000-000000000001": "/products/just-croffle.png",
  "e6000000-0000-4000-a000-000000000002": "/products/smores.png",
  "e6000000-0000-4000-a000-000000000003": "/products/banatella.png",
  "e6000000-0000-4000-a000-000000000004": "/products/biscoff-croffle.png",
  "e6000000-0000-4000-a000-000000000005": "/products/almond-nutella.png",
  "e6000000-0000-4000-a000-000000000006": "/products/ham-and-cheese.png",
  "e7000000-0000-4000-a000-000000000001": "/products/flavored-fries.png",
  "e7000000-0000-4000-a000-000000000002": "/products/nachos.png",
  "e7000000-0000-4000-a000-000000000003": "/products/chicken-pop.png",
};

export function menuProductImageUrl(
  id: string | null | undefined,
  imageUrl?: string | null,
): string | null {
  if (imageUrl) return imageUrl;
  const generated = id ? generatedImages[id] : undefined;
  return generated ? appPath(generated) : null;
}

/** Only generated, content-addressed image families have these published sizes. */
export function menuProductImageSrcSet(
  url?: string | null,
): string | undefined {
  if (
    !url ||
    !/\/generated\/[a-f0-9-]{36}\/[a-z0-9-]+-[a-f0-9]{12}-640\.webp$/.test(url)
  )
    return undefined;
  return [320, 640]
    .map((width) => `${url.replace(/-640\.webp$/, `-${width}.webp`)} ${width}w`)
    .join(", ");
}
