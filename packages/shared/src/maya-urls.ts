// Exact hosts used by Maya's production and sandbox checkout pages.
const checkoutHosts = new Set([
  "payments.maya.ph",
  "payments.paymaya.com",
  "payments-web-sandbox.maya.ph",
  "payments-web-sandbox.paymaya.com",
  "sandbox-checkout-web.paymaya.com",
]);

export function safeMayaCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      checkoutHosts.has(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
