// A LAN cashier must print a receipt URL reachable from the customer's phone.
// Deployed customer domains stay authoritative; only loopback dev URLs adapt.
export function resolveCustomerPortalUrl(
  configured: string | undefined,
  browserHostname?: string,
): string {
  let url: URL;
  try {
    url = new URL(configured?.trim() || "http://localhost:4000");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid customer URL");
  } catch {
    url = new URL("http://localhost:4000");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const parts = browserHostname?.split(".").map(Number);
  const privateLan =
    parts?.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
  if (loopback && privateLan) url.hostname = browserHostname!;
  return url.origin;
}
